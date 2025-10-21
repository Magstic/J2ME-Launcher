// Emulator-related IPC handlers
// Export a register(deps) function to keep main.js slim and testable

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { shell } = require('electron');
const { ensureCachedJar } = require('../utils/jar-cache.js');
const { createEmulatorService } = require('../services/emulator-service.js');

function register({
  ipcMain,
  dialog,
  DataStore,
  freej2mePlusAdapter,
  keAdapter,
  libretroAdapter,
  configService,
  getConfigGameName,
  app,
  // 可選：動態傳入適配器清單（陣列），若未提供則回退到三個內建適配器
  adapters,
}) {
  // 建立動態適配器清單與對應表（回退到既有三個適配器）
  const adapterList = Array.isArray(adapters)
    ? adapters.filter(Boolean)
    : [freej2mePlusAdapter, keAdapter, libretroAdapter].filter(Boolean);
  const adapterMap = new Map(adapterList.map((adp) => [adp.id, adp]));
  // ==================== 模擬器設定 IPC ====================
  // 取得模擬器設定
  ipcMain.handle('get-emulator-config', () => {
    try {
      return DataStore.getEmulatorConfig();
    } catch (error) {
      console.error('取得模擬器設定失敗:', error);
      return {};
    }
  });

  // 列出可用模擬器（提供 UI 動態渲染）
  ipcMain.handle('list-emulators', () => {
    try {
      const list = adapterList.map((adp) => ({
        id: adp.id,
        name: adp.name,
        capabilities: adp.capabilities || {},
      }));
      return list;
    } catch (error) {
      console.error('列出模擬器失敗:', error);
      return [];
    }
  });

  // 取得特定模擬器能力（若需要細分）
  ipcMain.handle('get-emulator-capabilities', (event, emulatorId) => {
    try {
      const adp = adapterMap.get(emulatorId) || null;
      if (!adp) return null;
      return { id: adp.id, name: adp.name, capabilities: adp.capabilities || {} };
    } catch (error) {
      console.error('取得模擬器能力失敗:', error);
      return null;
    }
  });

  // 取得特定模擬器的設定 Schema（若該 adapter 提供）
  ipcMain.handle('get-emulator-schema', (event, emulatorId) => {
    try {
      const adp = adapterMap.get(emulatorId) || null;
      if (!adp || typeof adp.getConfigSchema !== 'function') return null;
      const schema = adp.getConfigSchema();
      return schema || null;
    } catch (error) {
      console.error('取得模擬器 Schema 失敗:', error);
      return null;
    }
  });

  // 設置（合併）模擬器設定
  ipcMain.handle('set-emulator-config', (event, partial) => {
    try {
      return DataStore.setEmulatorConfig(partial || {});
    } catch (error) {
      console.error('設置模擬器設定失敗:', error);
      return { error: error.message };
    }
  });

  // 選擇模擬器執行檔（此處為 JAR）
  ipcMain.handle('pick-emulator-binary', async (event, emulatorId) => {
    try {
      /** @type {{name:string, extensions:string[]}} */
      let filter;
      if (emulatorId === 'libretro-exe') {
        filter = { name: 'RetroArch Executable', extensions: ['exe'] };
      } else if (emulatorId === 'libretro-core') {
        filter = { name: 'Libretro Core (DLL)', extensions: ['dll'] };
      } else {
        filter = { name: 'Java Archive', extensions: ['jar'] };
        // 動態適配器可選提供自定義挑選器：若傳入的是 adapter id，且提供 getPickFilters
        const dyn = adapterMap.get(emulatorId);
        if (dyn && typeof dyn.getPickFilters === 'function') {
          try {
            const pf = dyn.getPickFilters('binary');
            if (pf && pf.name && Array.isArray(pf.extensions)) filter = pf;
          } catch (_) {}
        }
      }
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [filter, { name: 'All Files', extensions: ['*'] }],
      });
      if (canceled || !filePaths || filePaths.length === 0) return null;
      return filePaths[0];
    } catch (error) {
      console.error('選擇模擬器檔案失敗:', error);
      return null;
    }
  });

  // =============== FreeJ2ME-Plus: 自訂資源 導入支援 ===============
  // 讓渲染層開檔挑選（可依類型提供檔案過濾）
  ipcMain.handle('freej2me:pick-asset', async (event, type) => {
    try {
      /** @type {{name:string, extensions:string[]}} */
      let filter;
      if (type === 'soundfont') {
        // 音源
        filter = { name: 'SoundFont/MIDI', extensions: ['sf2', '*'] };
      } else if (type === 'textfont') {
        // 字體
        filter = { name: 'Font Files', extensions: ['ttf', 'otf', 'ttc', '*'] };
      } else {
        filter = { name: 'All Files', extensions: ['*'] };
      }
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [filter],
      });
      if (canceled || !filePaths || filePaths.length === 0) return null;
      return filePaths[0];
    } catch (error) {
      console.error('選擇自訂資源失敗:', error);
      return null;
    }
  });

  // 匯入所選檔案至 emulator JAR 同路徑下的 freej2me_system 專用資料夾
  ipcMain.handle('freej2me:import-asset', async (event, type, sourcePath) => {
    try {
      console.log('[DEBUG] freej2me:import-asset 開始處理:', { type, sourcePath });
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        console.log('[DEBUG] 來源檔案不存在:', sourcePath);
        return { success: false, error: '來源檔案不存在' };
      }
      const emus = DataStore.getEmulatorConfig();
      console.log('[DEBUG] 模擬器配置:', JSON.stringify(emus, null, 2));
      const globalFree = emus?.freej2mePlus || { jarPath: '' };
      let jarPath = globalFree.jarPath || '';
      console.log('[DEBUG] JAR 路徑:', jarPath);
      console.log('[DEBUG] JAR 路徑是否為空:', !jarPath);
      // If jarPath is not configured yet, return error to avoid duplicate dialogs
      if (!jarPath) {
        console.log('[DEBUG] JAR 路徑未配置');
        return { success: false, error: '請先在設定中配置 FreeJ2ME-Plus JAR 路徑' };
      }
      if (!fs.existsSync(jarPath)) {
        console.log('[DEBUG] JAR 檔案不存在:', jarPath);
        return { success: false, error: `模擬器 JAR 不存在: ${jarPath}` };
      }

      const jarDir = path.dirname(jarPath);
      const sysDir = path.join(jarDir, 'freej2me_system');
      const targetSub =
        type === 'soundfont' ? 'customMIDI' : type === 'textfont' ? 'customFont' : 'custom';
      const destDir = path.join(sysDir, targetSub);
      fs.mkdirSync(destDir, { recursive: true });

      // 清理舊檔案（僅刪除檔案，不遞迴）
      try {
        const entries = fs.readdirSync(destDir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isFile()) {
            try {
              fs.unlinkSync(path.join(destDir, ent.name));
            } catch {}
          }
        }
      } catch (_) {}

      const fileName = path.basename(sourcePath);
      const destPath = path.join(destDir, fileName);
      fs.copyFileSync(sourcePath, destPath);

      return { success: true, destPath };
    } catch (error) {
      console.error('匯入自訂資源失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 取得指定遊戲的模擬器配置
  ipcMain.handle('get-game-emulator-config', (event, filePath) => {
    try {
      // 統一從 DataStore（SQL 層）讀取
      return DataStore.getGameEmulatorConfig(filePath);
    } catch (error) {
      console.error('取得遊戲模擬器設定失敗:', error);
      return null;
    }
  });

  // 設置指定遊戲的模擬器配置
  ipcMain.handle('set-game-emulator-config', (event, filePath, emulatorConfig) => {
    try {
      // 統一透過 DataStore 寫入（SQL 層），避免雙寫副作用
      return DataStore.setGameEmulatorConfig(filePath, emulatorConfig);
    } catch (error) {
      console.error('設置遊戲模擬器設定失敗:', error);
      return { error: error.message };
    }
  });

  // 立即更新 FreeJ2ME-Plus 的 game.conf（覆寫 scrwidth/scrheight 與相容性旗標）
  ipcMain.handle('update-freej2me-game-conf', async (event, gameFilePath, effectiveParams) => {
    try {
      const emus = DataStore.getEmulatorConfig();
      const globalFree = emus?.freej2mePlus || { jarPath: '' };
      const jarPath = globalFree.jarPath || '';
      if (!jarPath) return { success: false, error: '尚未配置 FreeJ2ME-Plus jarPath' };
      if (!fs.existsSync(jarPath))
        return { success: false, error: `模擬器 JAR 不存在: ${jarPath}` };
      if (!fs.existsSync(gameFilePath))
        return { success: false, error: `ROM 不存在: ${gameFilePath}` };

      const dsGame = DataStore.getGame(gameFilePath);
      const fallback =
        dsGame && dsGame.gameName
          ? dsGame.gameName
          : path.basename(gameFilePath, path.extname(gameFilePath));
      const gameName = await getConfigGameName(gameFilePath, fallback);
      const confDir = path.join(path.dirname(jarPath), 'config', gameName);
      const confPath = path.join(confDir, 'game.conf');

      const ensureInt = (v, def) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : def;
      };
      const width = ensureInt(effectiveParams?.width, 240);
      const height = ensureInt(effectiveParams?.height, 320);
      const fpsValue = ensureInt(effectiveParams?.framerate, 60);

      let lines = [];
      if (fs.existsSync(confPath)) {
        const text = fs.readFileSync(confPath, 'utf8');
        lines = text.split(/\r?\n/);
      }
      let hasW = false,
        hasH = false,
        hasPhone = false,
        hasTextfont = false,
        hasSoundfont = false,
        hasFps = false;
      // 需要寫入的相容性旗標（值為 'on' / 'off'）
      const compatKeys = [
        'compatfantasyzonefix',
        'compatimmediaterepaints',
        'compatoverrideplatchecks',
        'compatsiemensfriendlydrawing',
        'compattranstooriginonreset',
      ];
      // 其他參數（直接寫入字串值）
      const extraKeys = [
        'backlightcolor',
        'fontoffset',
        'rotate',
        'fpshack',
        'sound',
        'spdhacknoalpha',
      ];
      const mapFpshack = (v) => {
        const s = String(v).trim();
        if (['Disabled', 'Safe', 'Extended', 'Aggressive'].includes(s)) return s;
        const m = { 0: 'Disabled', 1: 'Safe', 2: 'Extended', 3: 'Aggressive' };
        return m[s] ?? s;
      };
      // 字體/音色：優先使用每遊戲設定，缺省時回退到全局
      const globalSoundfont = (globalFree?.defaults && globalFree.defaults.soundfont) || 'Default';
      const globalTextfont = (globalFree?.defaults && globalFree.defaults.textfont) || 'Default';
      const desiredTextfont =
        effectiveParams?.textfont && String(effectiveParams.textfont).length > 0
          ? String(effectiveParams.textfont)
          : globalTextfont;
      const desiredSoundfont =
        effectiveParams?.soundfont && String(effectiveParams.soundfont).length > 0
          ? String(effectiveParams.soundfont)
          : globalSoundfont;
      // keyLayout -> game.conf 的 phone: 文字映射（與啟動流程一致）
      const phoneMap = [
        'Standard',
        'LG',
        'Motorola/SoftBank',
        'Motorola Triplets',
        'Motorola V8',
        'Nokia Full Keyboard',
        'Sagem',
        'Siemens',
        'Sharp',
        'SKT',
        'KDDI',
      ];
      const phoneIdx = ensureInt(effectiveParams?.keyLayout, 0);
      const phoneName = phoneMap[phoneIdx] || 'Standard';
      const compatValues = Object.fromEntries(
        compatKeys.map((k) => {
          const v = (effectiveParams && effectiveParams[k]) || '';
          const norm =
            String(v).toLowerCase() === 'on'
              ? 'on'
              : String(v).toLowerCase() === 'off'
                ? 'off'
                : undefined;
          return [k, norm];
        })
      );
      lines = lines.map((ln) => {
        const idx = ln.indexOf(':');
        if (idx > 0) {
          const key = ln.slice(0, idx).trim();
          if (key === 'scrwidth') {
            hasW = true;
            return `scrwidth:${width}`;
          }
          if (key === 'scrheight') {
            hasH = true;
            return `scrheight:${height}`;
          }
          if (key === 'fps') {
            hasFps = true;
            return `fps:${fpsValue}`;
          }
          if (key === 'textfont') {
            hasTextfont = true;
            return `textfont:${desiredTextfont}`;
          }
          if (key === 'soundfont') {
            hasSoundfont = true;
            return `soundfont:${desiredSoundfont}`;
          }
          if (compatKeys.includes(key)) {
            const val = compatValues[key];
            if (val === 'on' || val === 'off') return `${key}:${val}`;
          }
          if (key === 'phone') {
            hasPhone = true;
            return `phone:${phoneName}`;
          }
          if (extraKeys.includes(key)) {
            let val = effectiveParams?.[key];
            if (val !== undefined && val !== null && String(val).length > 0) {
              if (key === 'fpshack') val = mapFpshack(val);
              return `${key}:${val}`;
            }
          }
        }
        return ln;
      });
      if (!hasW) lines.push(`scrwidth:${width}`);
      if (!hasH) lines.push(`scrheight:${height}`);
      if (!hasPhone) lines.push(`phone:${phoneName}`);
      if (!hasFps) lines.push(`fps:${fpsValue}`);
      if (!hasTextfont) lines.push(`textfont:${desiredTextfont}`);
      if (!hasSoundfont) lines.push(`soundfont:${desiredSoundfont}`);
      for (const k of compatKeys) {
        const val = compatValues[k];
        if (val === 'on' || val === 'off') {
          if (!lines.some((ln) => ln.trim().startsWith(`${k}:`))) lines.push(`${k}:${val}`);
        }
      }
      for (const k of extraKeys) {
        let val = effectiveParams?.[k];
        if (val !== undefined && val !== null && String(val).length > 0) {
          if (k === 'fpshack') val = mapFpshack(val);
          if (!lines.some((ln) => ln.trim().startsWith(`${k}:`))) lines.push(`${k}:${val}`);
        }
      }

      // Reorder target keys into a fixed order
      const orderedKeys = [
        'backlightcolor',
        'compatfantasyzonefix',
        'compatimmediaterepaints',
        'compatoverrideplatchecks',
        'compatsiemensfriendlydrawing',
        'compattranstooriginonreset',
        'fontoffset',
        'fps',
        'fpshack',
        'phone',
        'rotate',
        'scrheight',
        'scrwidth',
        'sound',
        'soundfont',
        'spdhacknoalpha',
        'textfont',
      ];
      const isTarget = (ln) => {
        const idx = ln.indexOf(':');
        if (idx <= 0) return false;
        const k = ln.slice(0, idx).trim();
        return orderedKeys.includes(k);
      };
      const presentMap = new Map();
      for (const ln of lines) {
        const idx = ln.indexOf(':');
        if (idx <= 0) continue;
        const k = ln.slice(0, idx).trim();
        const v = ln.slice(idx + 1).trim();
        presentMap.set(k, v);
      }
      const others = lines.filter((ln) => !isTarget(ln));
      const orderedOut = [
        ...others,
        ...orderedKeys.filter((k) => presentMap.has(k)).map((k) => `${k}:${presentMap.get(k)}`),
      ];

      fs.mkdirSync(confDir, { recursive: true });
      fs.writeFileSync(confPath, orderedOut.join('\n'), 'utf8');
      return { success: true, path: confPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 構建服務並精簡啟動處理器（行為保持不變）
  const emulatorService = createEmulatorService({
    DataStore,
    adapters: Object.fromEntries(adapterMap),
    ensureCachedJar,
    configService,
    getConfigGameName,
    shell,
  });

  // 遊戲啟動 IPC 處理器（委派到服務）
  ipcMain.handle('launch-game', async (event, gameFilePath) => {
    return emulatorService.launchGame(gameFilePath);
  });
}

module.exports = { register };
