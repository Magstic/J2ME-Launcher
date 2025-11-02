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

  ipcMain.handle('get-emulator-defaults', (event, emulatorId) => {
    try {
      const emus = DataStore.getEmulatorConfig() || {};
      if (emulatorId === 'freej2mePlus') {
        const base = {
          fullscreen: 0,
          width: 240,
          height: 320,
          scale: 2,
          keyLayout: 0,
          framerate: 60,
          compatfantasyzonefix: 'off',
          compatimmediaterepaints: 'off',
          compatoverrideplatchecks: 'on',
          compatsiemensfriendlydrawing: 'off',
          compattranstooriginonreset: 'off',
          backlightcolor: 'Disabled',
          fontoffset: '-2',
          rotate: '0',
          fpshack: 'Disabled',
          sound: 'on',
          spdhacknoalpha: 'off',
        };
        const merged = {
          ...base,
          ...((emus && emus.freej2mePlus && emus.freej2mePlus.defaults) || {}),
        };
        return { defaults: merged };
      }
      if (emulatorId === 'freej2meZb3') {
        const base = {
          width: 240,
          height: 320,
          fps: 60,
          rotate: 'off',
          phone: 'Nokia',
          sound: 'on',
          dgFormat: 'default',
          forceFullscreen: 'off',
          forceVolatileFields: 'off',
        };
        const merged = {
          ...base,
          ...((emus && emus.freej2meZb3 && emus.freej2meZb3.defaults) || {}),
        };
        return { defaults: merged };
      }
      return null;
    } catch (error) {
      console.error('取得模擬器預設失敗:', error);
      return null;
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

  // 僅準備 conf（不啟動），供配置模式使用
  ipcMain.handle('prepare-game-conf', async (event, gameFilePath) => {
    return emulatorService.prepareGameConf(gameFilePath);
  });
}

module.exports = { register };
