// Emulator Service: encapsulates launch logic, to decouple IPC from emulator-specific details
// Phase 1: Preserve existing behavior while moving logic here.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { updateGameConf } = require('../utils/game-conf.js');
const { buildCommandLine } = require('../utils/java.js');

function createEmulatorService({
  DataStore,
  adapters, // { freej2mePlus, ke, libretro }
  ensureCachedJar,
  configService, // Injected ConfigService for centralized configuration
  getConfigGameName,
  shell,
}) {
  // Debounce map is kept here to remain identical to previous behavior
  const recentLaunches = new Map(); // key: gameFilePath, value: timestamp

  async function launchGame(gameFilePath) {
    try {
      console.log('啟動遊戲:', gameFilePath);
      // 防抖
      const now = Date.now();
      const last = recentLaunches.get(gameFilePath) || 0;
      if (now - last < 800) {
        console.warn('[launch] ignore duplicated request within 800ms for:', gameFilePath);
        return { success: true, ignoredDuplicate: true };
      }
      recentLaunches.set(gameFilePath, now);
      setTimeout(() => {
        const ts = recentLaunches.get(gameFilePath);
        if (ts === now) recentLaunches.delete(gameFilePath);
      }, 2000);

      if (!fs.existsSync(gameFilePath)) {
        return { success: false, error: `遊戲文件不存在: ${gameFilePath}` };
      }

      const emus = DataStore.getEmulatorConfig();
      const globalFree = emus?.freej2mePlus || { jarPath: '' };
      const globalKe = emus?.ke || { jarPath: '' };
      const globalLibretro = emus?.libretro || { retroarchPath: '', corePath: '' };
      const perGame = DataStore.getGameEmulatorConfig(gameFilePath);

      const rawSel = (perGame && (perGame.emulator || perGame.selectedEmulator)) || 'freej2mePlus';
      const selectedEmulator = rawSel === 'kemulator' ? 'ke' : rawSel;

      if (selectedEmulator === 'ke') {
        const keAdapter = adapters.ke;
        const keJarPath = globalKe.jarPath || '';
        if (!keJarPath)
          return {
            success: false,
            error: 'EMULATOR_NOT_CONFIGURED',
            message: '尚未配置 KEmulator.jar 路徑',
          };
        if (!fs.existsSync(keJarPath))
          return { success: false, error: `KEmulator.jar 不存在: ${keJarPath}` };

        // Prepare (MD5 cache) via adapter, honor romCache toggle (per-game overrides; default ON for KE)
        const romCache =
          perGame && perGame.ke && typeof perGame.ke.romCache === 'boolean'
            ? perGame.ke.romCache
            : globalKe && typeof globalKe.romCache === 'boolean'
              ? globalKe.romCache
              : true;
        const utils = romCache ? { ensureCachedJar } : {};
        const prep = await keAdapter.prepareGame({ gameFilePath, utils });
        const preparedGamePath = prep?.preparedGamePath || gameFilePath;
        console.log('[launch][KE] using game path:', preparedGamePath);

        const {
          command: defaultCmd,
          args,
          cwd,
        } = keAdapter.buildCommand({ jarPath: keJarPath, gameFilePath: preparedGamePath });
        const javaCmd = defaultCmd === 'java' ? configService.resolveJavaPath() : defaultCmd;

        const renderedArgs = args.map((a) =>
          a === '-Dfile.encoding=ISO_8859_1' ? '"-Dfile.encoding=ISO_8859_1"' : a
        );
        // Avoid pre-quoting; let buildCommandLine handle all quoting to prevent embedded quotes
        const cmdLine = buildCommandLine(javaCmd, renderedArgs);
        console.log('[launch][KE] shell cmd:', cmdLine);

        const spawnOptions = { cwd, stdio: 'ignore', detached: false, shell: true };
        if (process.platform === 'win32') spawnOptions.windowsHide = true;
        const child = spawn(cmdLine, spawnOptions);
        child.on('error', (err) => {
          console.error('啟動 Java 進程失敗:', err);
        });
        return { success: true };
      }

      // RetroArch (libretro) branch
      if (selectedEmulator === 'libretro') {
        const libretroAdapter = adapters.libretro;
        const retroarchPath = globalLibretro.retroarchPath || '';
        const corePath = globalLibretro.corePath || '';
        // romCache per-game override; default OFF for Libretro
        const romCache =
          perGame && perGame.libretro && typeof perGame.libretro.romCache === 'boolean'
            ? perGame.libretro.romCache
            : globalLibretro.romCache === true;
        if (!retroarchPath)
          return {
            success: false,
            error: 'EMULATOR_NOT_CONFIGURED',
            message: '尚未配置 RetroArch 可執行檔路徑',
          };
        if (!fs.existsSync(retroarchPath))
          return { success: false, error: `RetroArch 不存在: ${retroarchPath}` };
        if (!corePath)
          return {
            success: false,
            error: 'EMULATOR_NOT_CONFIGURED',
            message: '尚未配置 Libretro 核心 (DLL) 路徑',
          };
        if (!fs.existsSync(corePath))
          return { success: false, error: `Libretro 核心不存在: ${corePath}` };

        // Optional prepare step for MD5-cached JAR
        let preparedGamePath = gameFilePath;
        if (romCache) {
          const prep = await libretroAdapter.prepareGame({
            gameFilePath,
            utils: { ensureCachedJar },
          });
          preparedGamePath = prep?.preparedGamePath || gameFilePath;
        }
        console.log('[launch][libretro] using game path:', preparedGamePath);

        const { command, args, cwd } = libretroAdapter.buildCommand({
          retroarchPath,
          corePath,
          gameFilePath: preparedGamePath,
        });
        // Avoid pre-quoting; let buildCommandLine handle all quoting to prevent embedded quotes
        const cmdLine = buildCommandLine(command, args);
        console.log('[launch][libretro] shell cmd:', cmdLine);

        const spawnOptions = { cwd, stdio: 'ignore', detached: false, shell: true };
        if (process.platform === 'win32') spawnOptions.windowsHide = true;
        const child = spawn(cmdLine, spawnOptions);
        child.on('error', (err) => {
          console.error('啟動 RetroArch 進程失敗:', err);
        });
        return { success: true };
      }

      // FreeJ2ME-Plus branch
      const jarPath = globalFree.jarPath || '';
      if (!jarPath) {
        return { success: false, error: 'EMULATOR_NOT_CONFIGURED', message: '尚未配置模擬器' };
      }
      if (!fs.existsSync(jarPath)) {
        return { success: false, error: `模擬器 JAR 不存在: ${jarPath}` };
      }

      // Complete defaults so global 'preset' applies even if DB lacks extended keys
      const extendedDefaults = {
        // core
        fullscreen: 0,
        width: 240,
        height: 320,
        scale: 2,
        keyLayout: 0,
        framerate: 60,
        // compat flags
        compatfantasyzonefix: 'off',
        compatimmediaterepaints: 'off',
        compatoverrideplatchecks: 'on',
        compatsiemensfriendlydrawing: 'off',
        compattranstooriginonreset: 'off',
        // extras
        backlightcolor: 'Disabled',
        fontoffset: '-2',
        rotate: '0',
        fpshack: 'Disabled',
        sound: 'on',
        spdhacknoalpha: 'off',
      };
      const baseParams =
        perGame && perGame.freej2mePlus && perGame.freej2mePlus.useGlobal === false
          ? perGame.freej2mePlus.params || {}
          : globalFree.defaults || {};
      const params = { ...extendedDefaults, ...baseParams };

      // Prepare via adapter (game.conf + cache). Ensure textfont/soundfont come from GLOBAL defaults.
      const globalTextfont = (globalFree?.defaults && globalFree.defaults.textfont) || 'Default';
      const globalSoundfont = (globalFree?.defaults && globalFree.defaults.soundfont) || 'Default';
      const paramsForConf = { ...params, textfont: globalTextfont, soundfont: globalSoundfont };
      // default ON for FreeJ2ME-Plus with per-game override
      const romCacheFree =
        perGame && perGame.freej2mePlus && typeof perGame.freej2mePlus.romCache === 'boolean'
          ? perGame.freej2mePlus.romCache
          : globalFree && typeof globalFree.romCache === 'boolean'
            ? globalFree.romCache
            : true;
      const utilsForFree = {
        updateGameConf,
        DataStore,
        getConfigGameName,
        ...(romCacheFree ? { ensureCachedJar } : {}),
      };
      const prep = await adapters.freej2mePlus.prepareGame({
        jarPath,
        gameFilePath,
        params: paramsForConf,
        utils: utilsForFree,
      });

      const preparedGamePath = prep?.preparedGamePath || gameFilePath;
      console.log('[launch] using game path:', preparedGamePath);
      const {
        command: defaultCmd,
        args,
        cwd,
      } = adapters.freej2mePlus.buildCommand({ jarPath, gameFilePath: preparedGamePath, params });
      const javaCmd = defaultCmd === 'java' ? configService.resolveJavaPath() : defaultCmd;

      const renderedArgs = args.map((a) =>
        a === '-Dfile.encoding=ISO_8859_1' ? '"-Dfile.encoding=ISO_8859_1"' : a
      );
      // Avoid pre-quoting; let buildCommandLine handle all quoting to prevent embedded quotes
      const cmdLine = buildCommandLine(javaCmd, renderedArgs);
      console.log('[launch] shell cmd:', cmdLine);

      const spawnOptions = { cwd, stdio: 'ignore', detached: false, shell: true };
      if (process.platform === 'win32') spawnOptions.windowsHide = true;
      const child = spawn(cmdLine, spawnOptions);
      child.on('error', (err) => {
        console.error('啟動 Java 進程失敗:', err);
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  return { launchGame };
}

module.exports = { createEmulatorService };
