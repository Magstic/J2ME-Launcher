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

      // ========== 動態適配器分派 ==========
      const emus = DataStore.getEmulatorConfig() || {};
      const perGame = DataStore.getGameEmulatorConfig(gameFilePath) || null;

      const rawSel = (perGame && (perGame.emulator || perGame.selectedEmulator)) || 'freej2mePlus';
      let selectedEmulator = rawSel === 'kemulator' ? 'ke' : rawSel;

      // 取得目標適配器，若不存在則回退
      let adapter = adapters && adapters[selectedEmulator];
      if (!adapter) {
        selectedEmulator =
          adapters && adapters.freej2mePlus ? 'freej2mePlus' : Object.keys(adapters || {})[0];
        adapter = selectedEmulator ? adapters[selectedEmulator] : null;
      }
      if (!adapter) {
        return { success: false, error: 'NO_ADAPTER', message: '無可用的模擬器適配器' };
      }

      const globalConf = (emus && emus[selectedEmulator]) || {};
      const perGameConf = (perGame && perGame[selectedEmulator]) || {};

      // romCache：每遊戲 > 全局 > 預設 false（各適配器可在 YAML 預設中覆蓋）
      const romCache =
        typeof perGameConf.romCache === 'boolean'
          ? perGameConf.romCache
          : typeof globalConf.romCache === 'boolean'
            ? globalConf.romCache
            : false;

      // 友好錯誤：針對已知適配器預先檢查必填路徑
      if (selectedEmulator === 'ke') {
        const keJarPath = globalConf.jarPath || '';
        if (!keJarPath)
          return {
            success: false,
            error: 'EMULATOR_NOT_CONFIGURED',
            message: '尚未配置 KEmulator.jar 路徑',
          };
        if (!fs.existsSync(keJarPath))
          return { success: false, error: `KEmulator.jar 不存在: ${keJarPath}` };
      } else if (selectedEmulator === 'libretro') {
        const retroarchPath = globalConf.retroarchPath || '';
        const corePath = globalConf.corePath || '';
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
      } else if (selectedEmulator === 'squirreljme') {
        const sqJarPath = globalConf.jarPath || '';
        if (!sqJarPath)
          return {
            success: false,
            error: 'EMULATOR_NOT_CONFIGURED',
            message: '尚未配置 SquirrelJME Standalone JAR 路徑',
          };
        if (!fs.existsSync(sqJarPath))
          return { success: false, error: `SquirrelJME JAR 不存在: ${sqJarPath}` };
      } else if (selectedEmulator === 'freej2mePlus') {
        const jarPath = globalConf.jarPath || '';
        if (!jarPath)
          return { success: false, error: 'EMULATOR_NOT_CONFIGURED', message: '尚未配置模擬器' };
        if (!fs.existsSync(jarPath))
          return { success: false, error: `模擬器 JAR 不存在: ${jarPath}` };
      }

      // FreeJ2ME-Plus 參數合併規則（保留既有行為），其他適配器如有 params 則直接沿用 perGameConf.params
      let params = undefined;
      if (selectedEmulator === 'freej2mePlus') {
        const extendedDefaults = {
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
        const useGlobal = !(
          perGame &&
          perGame.freej2mePlus &&
          perGame.freej2mePlus.useGlobal === false
        );
        const baseParams = useGlobal
          ? globalConf.defaults || {}
          : perGame?.freej2mePlus?.params || {};
        params = { ...extendedDefaults, ...baseParams };
      } else if (perGameConf && perGameConf.params) {
        params = perGameConf.params;
      }

      // 全局資源：確保 textfont/soundfont 來自全局（沿用既有規則）
      if (selectedEmulator === 'freej2mePlus') {
        const d = globalConf?.defaults || {};
        const globalTextfont = d.textfont || 'Default';
        const globalSoundfont = d.soundfont || 'Default';
        params = { ...(params || {}), textfont: globalTextfont, soundfont: globalSoundfont };
      }

      // 準備上下文並執行 adapter.prepareGame / buildCommand（通用流程）
      const jarPath = globalConf.jarPath || '';
      const retroarchPath = globalConf.retroarchPath || '';
      const corePath = globalConf.corePath || '';

      const utils = {
        ...(romCache ? { ensureCachedJar } : {}),
        updateGameConf,
        DataStore,
        getConfigGameName,
      };

      const prep = await (typeof adapter.prepareGame === 'function'
        ? adapter.prepareGame({ jarPath, retroarchPath, corePath, gameFilePath, params, utils })
        : Promise.resolve({ preparedGamePath: gameFilePath }));
      const preparedGamePath = prep?.preparedGamePath || gameFilePath;
      console.log(`[launch][${selectedEmulator}] using game path:`, preparedGamePath);

      const cmdMeta = adapter.buildCommand({
        jarPath,
        retroarchPath,
        corePath,
        gameFilePath: preparedGamePath,
        params,
      });
      const defaultCmd = cmdMeta.command;
      const args = cmdMeta.args || [];
      const cwd = cmdMeta.cwd;
      const command = defaultCmd === 'java' ? configService.resolveJavaPath() : defaultCmd;

      const renderedArgs = args.map((a) =>
        a === '-Dfile.encoding=ISO_8859_1' ? '"-Dfile.encoding=ISO_8859_1"' : a
      );
      const cmdLine = buildCommandLine(command, renderedArgs);
      console.log(`[launch][${selectedEmulator}] shell cmd:`, cmdLine);

      const spawnOptions = { cwd, stdio: 'ignore', detached: false, shell: true };
      if (process.platform === 'win32') spawnOptions.windowsHide = true;
      const child = spawn(cmdLine, spawnOptions);
      child.on('error', (err) => {
        console.error(`啟動進程失敗 [${selectedEmulator}]:`, err);
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  return { launchGame };
}

module.exports = { createEmulatorService };
