require('../utils/logger.cjs');
const { app, BrowserWindow, ipcMain, dialog, Menu, session, protocol, shell } = require('electron');
const path = require('path');
const {
  processDirectory,
  processMultipleDirectories,
  performAutoIncrementalScan,
} = require('./jar-parser.js');
const { initJarCache, cleanupCacheOnStartup } = require('./utils/jar-cache.js');
const DataStore = require('./data-store.js');
// SQLite initialization and one-time migration from legacy JSON
const { getDB, compact: compactDb, closeDB } = require('./db');
const { migrateIfNeeded } = require('./migrateFromJson');
const freej2mePlusAdapter = require('./emulators/freej2mePlus.js');
const keAdapter = require('./emulators/ke.js');
const libretroAdapter = require('./emulators/libretro.js');
// Extracted utils
const { getConfigGameName } = require('./utils/jar-manifest.js');
// Unified event broadcast (replace legacy local implementation)
const { broadcastToAll } = require('./ipc/unified-events.js');
// Centralized configuration service
const ConfigService = require('./services/config-service.js');
const { toIconUrl, addUrlToGames } = require('./utils/icon-url.js');
const { getGameStateCache } = require('./utils/game-state-cache.js');
const { getStoreBridge } = require('./store-bridge.js');
// IPC modules
const { register: registerEmulatorIpc } = require('./ipc/emulator.js');
const { register: registerFoldersIpc } = require('./ipc/folders.js');
const { register: registerDragSessionIpc } = require('./ipc/drag-session.js');
const { register: registerDirectoriesIpc } = require('./ipc/directories.js');
const { register: registerFolderWindowsIpc } = require('./ipc/folder-windows.js');
const { register: registerDesktopIpc } = require('./ipc/desktop.js');
const { register: registerStatsIpc } = require('./ipc/stats.js');
const { register: registerWindowControlsIpc } = require('./ipc/window-controls.js');
const { register: registerShortcutsIpc } = require('./ipc/shortcuts.js');
const { register: registerConfigIpc } = require('./ipc/config.js');
const { gameHashFromPath } = require('./utils/hash');
// Optional: SQLite-backed IPC (non-invasive)
const { register: registerSqlGamesIpc } = require('./ipc/sql-games.js');
const { register: registerClustersIpc } = require('./ipc/clusters.js');
// Cloud backup IPC (S3/WebDAV) scaffold
const { register: registerCustomNamesIpc } = require('./ipc/custom-names.js');
const { register: registerBackupIpc } = require('./ipc/backup.js');

// 解析 Java 可執行檔 -> moved to ./utils/java.js

// 解析 JAR MANIFEST 的遊戲名 -> moved to ./utils/jar-manifest.js

// 必须在 app ready 事件之前注册协议方案（保持原位調用）
protocol.registerSchemesAsPrivileged([
  { scheme: 'safe-file', privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

// Initialize JAR cache utils and schedule startup cleanup
try {
  initJarCache(app);
  if (app.isReady()) cleanupCacheOnStartup();
  else app.once('ready', cleanupCacheOnStartup);
} catch (_) {}

// Create single ConfigService instance for dependency injection
const configService = new ConfigService();

// Register emulator-related IPC handlers (kept early; safe before app ready)
registerEmulatorIpc({
  ipcMain,
  dialog,
  DataStore,
  freej2mePlusAdapter,
  keAdapter,
  libretroAdapter,
  configService,
  getConfigGameName,
  app,
});

// Register configuration IPC handlers
registerConfigIpc({
  ipcMain,
  configService,
});

// Register folder-related IPC handlers
registerFoldersIpc({
  ipcMain,
  DataStore,
  addUrlToGames,
  broadcastToAll,
  toIconUrl,
});

// Register cross-window drag session IPC handlers
registerDragSessionIpc({
  ipcMain,
  DataStore,
  addUrlToGames,
  broadcastToAll,
  BrowserWindow,
});

// Register custom names IPC handlers
registerCustomNamesIpc({
  ipcMain,
  broadcastToAll,
});

// Register directories/scanning IPC handlers
registerDirectoriesIpc({
  ipcMain,
  dialog,
  DataStore,
  processDirectory,
  processMultipleDirectories,
  addUrlToGames,
  broadcastToAll,
});

// Register folder windows lifecycle/control IPC -> moved below after folderWindows/init

// Register desktop data IPC
registerDesktopIpc({
  ipcMain,
  DataStore,
  toIconUrl,
});

// Register clusters IPC (CRUD + queries)
registerClustersIpc({
  ipcMain,
  DataStore,
  addUrlToGames,
  toIconUrl,
  broadcastToAll,
});

// Register stats IPC
registerStatsIpc({
  ipcMain,
  DataStore,
  addUrlToGames,
});

// Register main window control IPC
registerWindowControlsIpc({
  ipcMain,
  getMainWindow: () => mainWindow,
});

// Register optional SQL-backed games IPC (kept separate to avoid breaking existing channels)
registerSqlGamesIpc({ ipcMain });

// Register cloud backup IPC (provides spec, last backup time, and run stubs)
try {
  registerBackupIpc({ ipcMain, app });
} catch (_) {}

// Register shortcuts IPC
try {
  registerShortcutsIpc({ ipcMain, DataStore, app });
} catch (e) {
  console.warn('[shortcuts IPC] register failed:', e && e.message ? e.message : e);
}

// Open external URL in the system default browser
ipcMain.handle('open-external', async (_event, url) => {
  try {
    return await shell.openExternal(url);
  } catch (err) {
    console.error('open-external failed:', err);
    return false;
  }
});

// 封裝在 ./utils/icon-url.js

// 取得指定遊戲的模擬器配置 -> moved to ./ipc/emulator.js

// 立即更新 FreeJ2ME-Plus 的 game.conf（只覆寫 scrwidth/scrheight）
// -> moved to ./ipc/emulator.js

// set-game-emulator-config -> moved to ./ipc/emulator.js

// 開發模式檢測
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
// 設置固定的 AppUserModelID 以確保任務欄圖標與分組穩定（避免被捷徑圖標影響）
try {
  app.setAppUserModelId('Magstic.J2ME.Launcher');
} catch (_) {}

let mainWindow;
let splashWindow; // 加載卡片窗口
let splashShownAt = 0; // 記錄展示時間以保證最少顯示 5 秒
let folderWindows = new Map(); // 存儲所有打開的資料夾窗口
let pendingLaunchHash = null; // 透過捷徑帶入的啟動參數
// DB 就緒信號：用於控制啟動畫面的淡出時機（需在 DB 完成後延遲 2 秒）
let resolveDbReadyOnce = null;
const dbReadyPromise = new Promise((resolve) => {
  resolveDbReadyOnce = resolve;
});

function extractLaunchHash(argv) {
  try {
    const arg = (argv || []).find(
      (a) => typeof a === 'string' && a.startsWith('--launch-game-hash=')
    );
    return arg ? arg.split('=')[1] : null;
  } catch (_) {
    return null;
  }
}

// 單例鎖與捷徑參數處理（需在最頂層且早於 app.whenReady）
try {
  // 提前解析首個實例的參數
  pendingLaunchHash = extractLaunchHash(process.argv) || null;
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', (_event, argv) => {
      // 從第二個實例的參數中提取 hash 並交給現有實例
      const hash = extractLaunchHash(argv);
      if (hash) pendingLaunchHash = hash;
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        try {
          if (pendingLaunchHash) {
            mainWindow.webContents.send('shortcut-launch', pendingLaunchHash);
            pendingLaunchHash = null;
          }
        } catch (_) {}
      }
    });

    // 明確設置窗口的 AppUserModelID，避免任務欄圖標被啟動捷徑影響
    try {
      mainWindow.setAppDetails({ appId: 'Magstic.J2ME.Launcher' });
    } catch (_) {}
  }
} catch (e) {
  console.warn('[single instance] init failed:', e && e.message ? e.message : e);
}

// 跨窗口拖拽會話狀態
// drag-session state moved into ./ipc/drag-session.js

function createWindow() {
  // 移除預設的應用程式菜單
  Menu.setApplicationMenu(null);

  // 先創建並顯示加載卡片（避免白閃並提供過渡）
  try {
    splashWindow = new BrowserWindow({
      width: 640,
      height: 360,
      useContentSize: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      transparent: false, // 使用深色背景避免白閃
      backgroundColor: '#0f1115',
      roundedCorners: false, // Windows 黑角/白角工件處理
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        paintWhenInitiallyHidden: true, // 隱藏時先繪製，顯示瞬間避免白閃
      },
    });
    const loadingPath = isDev
      ? path.join(__dirname, '../../loading.html')
      : path.join(__dirname, '../../dist/..', 'loading.html');
    splashWindow.setOpacity(0); // 先設為透明，避免 OS 級別的首幀突兀
    splashWindow.loadFile(loadingPath).catch(() => {});
    splashWindow.once('ready-to-show', () => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.showInactive?.(); // 避免搶焦點造成閃爍
        splashShownAt = Date.now();
        // 快速淡入，與頁面動畫協同
        const duration = 120;
        const steps = 8;
        const stepTime = Math.max(10, Math.floor(duration / steps));
        let i = 0;
        const timer = setInterval(() => {
          if (!splashWindow || splashWindow.isDestroyed()) {
            clearInterval(timer);
            return;
          }
          i++;
          const t = Math.min(1, i / steps);
          splashWindow.setOpacity(t);
          if (t >= 1) clearInterval(timer);
        }, stepTime);
      }
    });
  } catch (e) {
    console.warn('splash window failed:', e);
  }

  // 主窗口：使用主顯示器工作區 100% 尺寸與位置
  let mwX,
    mwY,
    mwW = 1200,
    mwH = 800;
  try {
    const { screen } = require('electron');
    const { workArea } = screen.getPrimaryDisplay() || {};
    if (workArea && workArea.width && workArea.height) {
      mwX = workArea.x;
      mwY = workArea.y;
      mwW = workArea.width;
      mwH = workArea.height;
    }
  } catch (_) {}

  mainWindow = new BrowserWindow({
    frame: false, // 隱藏原生標題欄
    x: mwX,
    y: mwY,
    width: mwW,
    height: mwH,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // 使用打包安全的固定路徑，避免因為路徑無效導致任務欄圖標異常被替換
    icon: path.join(__dirname, '..', 'assets', 'icons', 'icon.ico'),
    show: false,
    backgroundColor: '#0f1115', // 與主題背景一致，避免首幀白屏閃爍
  });
  // 明確設置窗口的 AppUserModelID，避免任務欄圖標被啟動捷徑影響
  try {
    mainWindow.setAppDetails({ appId: 'Magstic.J2ME.Launcher' });
  } catch (_) {}

  // 載入應用
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // 等待內容真正載入完成後 + 保證 splash 至少顯示 5 秒，再顯示主窗口並做淡入
  mainWindow.webContents.once('did-finish-load', async () => {
    // 將主窗口註冊到 StoreBridge（提供 store-sync / store-action 管道）
    try {
      getStoreBridge().registerWindow(mainWindow);
    } catch (_) {}
    try {
      // 等待兩個條件：
      // 1) 啟動畫面最短顯示 5000ms
      // 2) 數據庫處理完成後再延遲 2000ms
      const minDuration = 5000;
      const elapsed = splashShownAt ? Date.now() - splashShownAt : 0;
      const waitMinDuration = Math.max(0, minDuration - elapsed);
      const waitForMinDuration =
        waitMinDuration > 0
          ? new Promise((r) => setTimeout(r, waitMinDuration))
          : Promise.resolve();
      const waitForDbThenDelay = (async () => {
        try {
          await dbReadyPromise;
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 2000));
      })();
      await Promise.all([waitForMinDuration, waitForDbThenDelay]);

      // 通知加載卡片淡出（僅在兩個條件都滿足後）
      if (splashWindow && !splashWindow.isDestroyed()) {
        try {
          await splashWindow.webContents.executeJavaScript("window.postMessage('fade-out','*')");
        } catch (_) {}
      }

      // 顯示主窗口並從 0 漸入到 1
      if (!mainWindow.isDestroyed()) {
        // 先最大化，再顯示與淡入，避免顯示後再最大化的視覺跳動
        try {
          mainWindow.maximize();
        } catch (_) {}
        mainWindow.setOpacity(0);
        mainWindow.show();
        const duration = 300; // ms
        const steps = 15;
        const stepTime = Math.max(10, Math.floor(duration / steps));
        let i = 0;
        const timer = setInterval(() => {
          if (mainWindow.isDestroyed()) {
            clearInterval(timer);
            return;
          }
          i++;
          const t = Math.min(1, i / steps);
          mainWindow.setOpacity(t);
          if (t >= 1) clearInterval(timer);
        }, stepTime);

        // 若為捷徑啟動，將 hash 傳遞給渲染器
        try {
          if (pendingLaunchHash) {
            console.log(`[Shortcut Launch] Sending hash to renderer: ${pendingLaunchHash}`);
            mainWindow.webContents.send('shortcut-launch', pendingLaunchHash);
            pendingLaunchHash = null;
          }
        } catch (e) {
          console.error('[Shortcut Launch] Failed to send to renderer:', e);
        }
      }

      // 等待與 CSS 對應過渡時間後關閉 splash
      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          try {
            splashWindow.close();
          } catch (_) {}
        }
        splashWindow = null;
      }, 320);
    } catch (e) {
      // 回退方案：直接顯示主窗口，關閉 splash
      if (!mainWindow.isDestroyed()) mainWindow.show();
      if (splashWindow && !splashWindow.isDestroyed()) {
        try {
          splashWindow.close();
        } catch (_) {}
        splashWindow = null;
      }
    }
  });

  mainWindow.on('closed', () => {
    // 關閉所有資料夾窗口
    folderWindows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.close();
      }
    });
    folderWindows.clear();
    mainWindow = null;
  });
}

// 創建獨立資料夾窗口
function createFolderWindow(folderId, folderName) {
  // 檢查是否已經打開該資料夾窗口
  if (folderWindows.has(folderId)) {
    const existingWindow = folderWindows.get(folderId);
    if (!existingWindow.isDestroyed()) {
      existingWindow.focus();
      return existingWindow;
    } else {
      folderWindows.delete(folderId);
    }
  }

  // 以顯示器工作區 85% 尺寸作為預設窗口大小，提供更寬敞的視圖
  let defWidth = 1200,
    defHeight = 800;
  try {
    const { screen } = require('electron');
    const { width: W, height: H } = screen.getPrimaryDisplay().workAreaSize || {};
    if (W && H) {
      defWidth = Math.max(1000, Math.round(W * 0.7));
      defHeight = Math.max(700, Math.round(H * 0.85));
    }
  } catch (_) {}

  const folderWindow = new BrowserWindow({
    width: defWidth,
    height: defHeight,
    minWidth: 400,
    minHeight: 300,
    center: true,
    frame: false, // 隱藏原生標題欄以保持一致性
    // 不設置父窗口，確保為獨立頂層視窗（擁有任務欄按鈕與正常最小化行為）
    skipTaskbar: false,
    minimizable: true,
    maximizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--folder-id=${folderId}`], // 傳遞資料夾ID
    },
    // 與主窗口一致使用 .ico，保證在 Windows 任務欄顯示穩定
    icon: path.join(__dirname, '..', 'assets', 'icons', 'icon.ico'),
    title: `${folderName} - J2ME Launcher`,
    show: false,
    backgroundColor: '#0f1115', // 與主題背景一致，避免窗口白屏閃爍
  });
  // 同步設置資料夾窗口的 AppUserModelID
  try {
    folderWindow.setAppDetails({ appId: 'Magstic.J2ME.Launcher' });
  } catch (_) {}

  // 載入資料夾窗口頁面
  if (isDev) {
    folderWindow.loadURL(`http://localhost:5173/folder.html?folderId=${folderId}`);
  } else {
    folderWindow.loadFile(path.join(__dirname, '../../dist/folder.html'), {
      query: { folderId: folderId },
    });
  }

  // 註冊資料夾窗口到 StoreBridge（用於分窗保持遊戲狀態一致）
  try {
    folderWindow.webContents.once('did-finish-load', () => {
      try {
        getStoreBridge().registerWindow(folderWindow);
      } catch (_) {}
    });
  } catch (_) {}

  // 開發者工具：在開發模式自動打開，並綁定快捷鍵（F12 / Ctrl+Shift+I）
  try {
    if (isDev && folderWindow && folderWindow.webContents) {
      folderWindow.webContents.openDevTools({ mode: 'detach' });
    }
    folderWindow.webContents.on('before-input-event', (event, input) => {
      const isToggle =
        input.key === 'F12' ||
        (input.key && input.key.toLowerCase() === 'i' && input.control && input.shift);
      if (isToggle) {
        try {
          folderWindow.webContents.toggleDevTools();
        } catch (_) {}
        event.preventDefault();
      }
    });
  } catch (_) {}

  // 由渲染器明確通知「首幀可見」後再顯示，避免在繪製過程中顯示窗口
  const onFolderWindowReady = (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin && senderWin === folderWindow && !senderWin.isDestroyed()) {
      senderWin.show();
      // 僅處理一次
      ipcMain.removeListener('folder-window-ready', onFolderWindowReady);
    }
  };
  ipcMain.on('folder-window-ready', onFolderWindowReady);

  // 窗口關閉時清理
  folderWindow.on('closed', () => {
    folderWindows.delete(folderId);
  });

  // 存儲窗口引用
  folderWindows.set(folderId, folderWindow);

  return folderWindow;
}

// Now that folderWindows and createFolderWindow exist, register folder-windows IPC
registerFolderWindowsIpc({
  ipcMain,
  BrowserWindow,
  DataStore,
  createFolderWindow,
  folderWindows,
});

app.whenReady().then(async () => {
  // 在应用 ready 之后，再定义协议的具体实现
  const iconCachePath = DataStore.getIconCachePath();
  protocol.registerFileProtocol('safe-file', (request, callback) => {
    try {
      const requestUrl = new URL(request.url);
      // 从 hostname 中提取文件名，这是更稳健的方式，可以避免结尾斜杠带来的问题
      const iconFilename = decodeURIComponent(requestUrl.hostname);
      // 預設圖標映射到專案資源：src/image/ico.svg
      if (iconFilename === 'default-ico.svg') {
        const defaultIconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon.svg');
        return callback({ path: defaultIconPath });
      }
      const finalIconPath = path.join(iconCachePath, iconFilename);
      const fs = require('fs');
      if (fs.existsSync(finalIconPath)) {
        callback({ path: finalIconPath });
      } else {
        // 檔案不存在時回退預設圖標，避免大量 404 噪音
        const defaultIconPath = path.join(__dirname, '..', 'image', 'ico.svg');
        callback({ path: defaultIconPath });
      }
    } catch (error) {
      console.error('Failed to handle safe-file request:', request.url, error);
      // 返回文件未找到错误
      callback({ error: -6 });
    }
  });

  // 配置内容安全策略 (CSP) 以允许加载本地文件
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        // 在开发模式下，需要更宽松的策略以支持 Vite HMR
        // 在生产环境中应使用更严格的策略
        'Content-Security-Policy': [
          isDev
            ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: safe-file:; font-src 'self';"
            : "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: safe-file:; font-src 'self';",
        ],
      },
    });
  });

  // Initialize SQLite and migrate legacy JSON (runs once; non-destructive)
  try {
    getDB();
    await migrateIfNeeded();
  } catch (e) {
    console.error('[Startup] DB init/migration failed:', e);
  }

  // 初始化 StoreBridge 與快取（即使沒有新遊戲，也保證 FULL_SYNC 能運作）
  try {
    const cache = getGameStateCache();
    await cache.initialize();
    await getStoreBridge().initialize();
  } catch (e) {
    console.warn('[Startup] StoreBridge initialize failed:', e && e.message ? e.message : e);
  }

  // DataStore 已移除 JSON 加載，現在完全依賴 SQLite
  console.log(`[Path Debug] UserData Path: ${app.getPath('userData')}`); // 调试日志

  createWindow();

  // 应用启动后稍微延迟执行自动增量扫描
  setTimeout(async () => {
    try {
      console.log('🔄 开始应用启动自动扫描...');
      const scanResult = await performAutoIncrementalScan();

      if (scanResult.success && scanResult.summary.totalNewGames > 0) {
        // 如果发现新游戏，通知前端更新
        const games = DataStore.getAllGames();
        try {
          const { upsertGames } = require('./sql/write');
          upsertGames(games);
        } catch (e) {
          console.warn('[SQL sync] initial upsert failed:', e.message);
        }

        // 初始化遊戲狀態快取
        const cache = getGameStateCache();
        await cache.initialize();
        console.log('[Cache] Game state cache initialized');

        let payloadGames = null;
        try {
          payloadGames = require('./sql/read').getAllGamesFromSql();
        } catch (_) {}
        const gamesWithUrl = addUrlToGames(payloadGames || games);

        // 改用統一事件系統的批次廣播，避免即時直送造成 UI 壓力
        broadcastToAll('games-updated', gamesWithUrl);
        broadcastToAll('auto-scan-completed', {
          newGamesCount: scanResult.summary.totalNewGames,
          totalDirectories: scanResult.totalDirectories,
        });
      }
      // 無論是否有新增或發生錯誤，只要自動掃描結束，即視為「數據庫處理完成」
      try {
        if (typeof resolveDbReadyOnce === 'function') {
          resolveDbReadyOnce();
          resolveDbReadyOnce = null;
        }
      } catch (_) {}
    } catch (error) {
      console.error('自动扫描失败:', error);
      // 失敗亦視為流程已結束，避免卡住淡出
      try {
        if (typeof resolveDbReadyOnce === 'function') {
          resolveDbReadyOnce();
          resolveDbReadyOnce = null;
        }
      } catch (_) {}
    }
  }, 3000); // 3秒延迟，等待界面初始化完成
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 在應用退出前壓縮資料庫：截斷 WAL 並 VACUUM 回收磁碟空間
app.on('before-quit', () => {
  try {
    console.log('[Shutdown] compacting SQLite database...');
    const ok = compactDb();
    console.log(
      ok ? '[Shutdown] DB compacted successfully.' : '[Shutdown] DB compact skipped or failed.'
    );
  } catch (e) {
    console.warn('[Shutdown] DB compact threw:', e && e.message ? e.message : e);
  } finally {
    // Ensure DB handle is closed so WAL truncation and VACUUM can persist to disk
    try {
      closeDB();
    } catch (_) {}
  }
});

// 窗口控制 IPC 已移至 ./ipc/window-controls.js

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 目錄與掃描 IPC 已移至 ./ipc/directories.js

// 獨立資料夾窗口 IPC 已移至 ./ipc/folder-windows.js

// drag-session IPC moved to ./ipc/drag-session.js

// 桌面數據 IPC 已移至 ./ipc/desktop.js

// get-folder-contents 已整合於 folders 模組或按需另建模組（目前移除內聯版本）

// 統計與交叉引用 IPC 已移至 ./ipc/stats.js

// 模擬器設定 IPC -> moved to ./ipc/emulator.js

// launch-game -> moved to ./ipc/emulator.js
