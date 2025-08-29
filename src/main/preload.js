const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // 遊戲管理
  getInitialGames: () => ipcRenderer.invoke('get-initial-games'),
  
  // 目錄管理
  getDirectories: () => ipcRenderer.invoke('get-directories'),
  addDirectories: () => ipcRenderer.invoke('add-directories'),
  removeDirectory: (directoryPath) => ipcRenderer.invoke('remove-directory', directoryPath),
  toggleDirectory: (directoryPath, enabled) => ipcRenderer.invoke('toggle-directory', directoryPath, enabled),
  
  // 掃描功能
  scanDirectories: (forceFullScan = false) => ipcRenderer.invoke('scan-directories', forceFullScan),
  selectDirectory: () => ipcRenderer.invoke('select-directory'), // 保持向後相容
  
  // 事件監聽
  onGamesUpdated: (callback) => {
    const handler = (event, games) => callback(games);
    ipcRenderer.on('games-updated', handler);
    // return unsubscribe like other listeners
    return () => ipcRenderer.removeListener('games-updated', handler);
  },
  
  // 增量更新事件監聽
  onGamesIncrementalUpdate: (callback) => {
    const handler = (event, updateData) => callback(updateData);
    ipcRenderer.on('games-incremental-update', handler);
    return () => ipcRenderer.removeListener('games-incremental-update', handler);
  },
  onAutoScanCompleted: (callback) => {
    ipcRenderer.on('auto-scan-completed', (event, result) => callback(result));
  },
  
  // 移除事件監聽器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // ==================== 自定義名稱管理 API ====================
  
  // 更新遊戲自定義名稱
  updateCustomName: (filePath, customName) => ipcRenderer.invoke('update-custom-name', filePath, customName),
  
  // 更新遊戲自定義開發商
  updateCustomVendor: (filePath, customVendor) => ipcRenderer.invoke('update-custom-vendor', filePath, customVendor),
  
  // 批量更新自定義數據
  updateCustomData: (filePath, customData) => ipcRenderer.invoke('update-custom-data', filePath, customData),
  
  // 重置自定義名稱
  resetCustomNames: (filePath) => ipcRenderer.invoke('reset-custom-names', filePath),

  // ==================== 資料夾管理 API ====================
  
  // 獲取所有資料夾
  getFolders: () => ipcRenderer.invoke('get-folders'),
  
  // 獲取單個資料夾信息
  getFolderById: (folderId) => ipcRenderer.invoke('get-folder-by-id', folderId),
  
  // 創建資料夾
  createFolder: (folderData) => ipcRenderer.invoke('create-folder', folderData),
  
  // 更新資料夾
  updateFolder: (folderId, updates) => ipcRenderer.invoke('update-folder', folderId, updates),
  
  // 刪除資料夾
  deleteFolder: (folderId, moveGamesToUncategorized) => 
    ipcRenderer.invoke('delete-folder', folderId, moveGamesToUncategorized),

  // ==================== 遊戲資料夾關係 API ====================
  
  // 將遊戲加入資料夾
  addGameToFolder: (gameId, folderId) => ipcRenderer.invoke('add-game-to-folder', gameId, folderId),
  // 批次將遊戲加入資料夾（批末一次廣播）
  addGamesToFolderBatch: (gameIdsOrPaths, folderId, options) => ipcRenderer.invoke('add-games-to-folder-batch', gameIdsOrPaths, folderId, options),
  // 統一的批次處理 API（支援進度回調）
  batchAddGamesToFolder: (filePaths, folderId, options) => ipcRenderer.invoke('batch-add-games-to-folder', filePaths, folderId, options),
  emitFolderBatchUpdates: (folderId) => ipcRenderer.invoke('emit-folder-batch-updates', folderId),
  
  // 從資料夾中移除遊戲
  removeGameFromFolder: (gameId, folderId) => 
    ipcRenderer.invoke('remove-game-from-folder', gameId, folderId),
  
  // 批次移除遊戲從資料夾（避免多次 IPC 調用）
  batchRemoveGamesFromFolder: (filePaths, folderId) => 
    ipcRenderer.invoke('batch-remove-games-from-folder', filePaths, folderId),
  
  // 在資料夾間移動遊戲
  moveGameBetweenFolders: (gameId, fromFolderId, toFolderId) => 
    ipcRenderer.invoke('move-game-between-folders', gameId, fromFolderId, toFolderId),
  
  // 獲取資料夾中的遊戲
  getGamesByFolder: (folderId) => ipcRenderer.invoke('get-games-by-folder', folderId),
  
  // 獲取未分類遊戲
  getUncategorizedGames: () => ipcRenderer.invoke('get-uncategorized-games'),
  // 取得屬於任一資料夾的遊戲 filePath（用於顯示徽章）
  getGamesInAnyFolder: () => ipcRenderer.invoke('get-games-in-any-folder'),

  // ==================== 批次操作事件監聽 ====================
  
  // 監聽批次操作開始事件
  onBulkOperationStart: (callback) => {
    ipcRenderer.on('bulk-operation-start', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('bulk-operation-start');
  },
  
  // 監聽批次操作結束事件
  onBulkOperationEnd: (callback) => {
    ipcRenderer.on('bulk-operation-end', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('bulk-operation-end');
  },
  
  // 移除批次操作開始事件監聽器
  offBulkOperationStart: (callback) => {
    ipcRenderer.removeListener('bulk-operation-start', callback);
  },
  
  // 移除批次操作結束事件監聽器
  offBulkOperationEnd: (callback) => {
    ipcRenderer.removeListener('bulk-operation-end', callback);
  },

  // ==================== 桌面數據 API ====================
  
  // 獲取桌面所有項目（遊戲 + 資料夾）
  getDesktopItems: () => ipcRenderer.invoke('get-desktop-items'),
  
  // 獲取資料夾內容
  getFolderContents: (folderId) => ipcRenderer.invoke('get-folder-contents', folderId),

  // ==================== 統計信息 API ====================
  
  // 獲取資料夾統計信息
  getFolderStats: () => ipcRenderer.invoke('get-folder-stats'),

  // ==================== 遊戲啟動 API ====================
  
  // 啟動遊戲
  launchGame: (gameFilePath) => ipcRenderer.invoke('launch-game', gameFilePath),
  
  // ==================== 模擬器設定 API ====================
  // 取得模擬器設定
  getEmulatorConfig: () => ipcRenderer.invoke('get-emulator-config'),
  // 列出可用模擬器
  listEmulators: () => ipcRenderer.invoke('list-emulators'),
  // 取得特定模擬器能力
  getEmulatorCapabilities: (emulatorId) => ipcRenderer.invoke('get-emulator-capabilities', emulatorId),
  // 取得特定模擬器設定 Schema（若提供）
  getEmulatorSchema: (emulatorId) => ipcRenderer.invoke('get-emulator-schema', emulatorId),
  // 設置（合併）模擬器設定
  setEmulatorConfig: (partial) => ipcRenderer.invoke('set-emulator-config', partial),
  // 選擇模擬器執行檔（JAR）
  pickEmulatorBinary: (emulatorId) => ipcRenderer.invoke('pick-emulator-binary', emulatorId),
  // 取得指定遊戲的模擬器配置
  getGameEmulatorConfig: (filePath) => ipcRenderer.invoke('get-game-emulator-config', filePath),
  // 設置指定遊戲的模擬器配置
  setGameEmulatorConfig: (filePath, emulatorConfig) => ipcRenderer.invoke('set-game-emulator-config', filePath, emulatorConfig),
  updateFreej2meGameConf: (filePath, effectiveParams) => ipcRenderer.invoke('update-freej2me-game-conf', filePath, effectiveParams),

  // FreeJ2ME-Plus 自訂資源導入
  pickFreej2meAsset: (type) => ipcRenderer.invoke('freej2me:pick-asset', type),
  importFreej2meAsset: (type, sourcePath) => ipcRenderer.invoke('freej2me:import-asset', type, sourcePath),

  // 獲取遊戲所屬資料夾
  getGameFolders: (gameId) => ipcRenderer.invoke('get-game-folders', gameId),

  // ==================== 資料夾事件監聽 ====================
  
  // 資料夾更新事件
  onFolderUpdated: (callback) => {
    const ch = 'folder-updated';
    const handler = (event, folderData) => callback(folderData);
    ipcRenderer.on(ch, handler);
    return () => ipcRenderer.removeListener(ch, handler);
  },
  
  // 資料夾刪除事件
  onFolderDeleted: (callback) => {
    const ch = 'folder-deleted';
    const handler = (event, folderId) => callback(folderId);
    ipcRenderer.on(ch, handler);
    return () => ipcRenderer.removeListener(ch, handler);
  },
  
  // 遊戲資料夾變更事件
  onGameFolderChanged: (callback) => {
    ipcRenderer.on('game-folder-changed', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('game-folder-changed');
  },

  // 資料夾變更通用事件（用於多窗口同步）
  onFolderChanged: (callback) => {
    ipcRenderer.on('folder-changed', callback);
    return () => ipcRenderer.removeAllListeners('folder-changed');
  },

  // ==================== 跨窗口拖拽會話 API ====================
  // 開始拖拽會話（支持多選）
  startDragSession: (items, source) => ipcRenderer.invoke('drag-session:start', { items, source }),
  // 更新拖拽進度（可選）
  updateDragSession: (position) => ipcRenderer.invoke('drag-session:update', position),
  // 在目標放置
  dropDragSession: (target) => ipcRenderer.invoke('drag-session:drop', target),
  // 結束/取消拖拽
  endDragSession: () => ipcRenderer.invoke('drag-session:end'),
  // 會話事件
  onDragSessionStarted: (callback) => {
    ipcRenderer.on('drag-session:started', (e, payload) => callback(payload));
    return () => ipcRenderer.removeAllListeners('drag-session:started');
  },
  onDragSessionUpdated: (callback) => {
    ipcRenderer.on('drag-session:updated', (e, pos) => callback(pos));
    return () => ipcRenderer.removeAllListeners('drag-session:updated');
  },
  onDragSessionEnded: (callback) => {
    ipcRenderer.on('drag-session:ended', callback);
    return () => ipcRenderer.removeAllListeners('drag-session:ended');
  },

  // ==================== 獨立資料夾窗口 API ====================
  
  // 打開獨立資料夾窗口
  openFolderWindow: (folderId) => ipcRenderer.invoke('open-folder-window', folderId),
  
  // 關閉資料夾窗口
  closeFolderWindow: (folderId) => ipcRenderer.invoke('close-folder-window', folderId),
  
  // 資料夾窗口控制
  minimizeFolderWindow: () => ipcRenderer.send('folder-window-minimize'),
  maximizeFolderWindow: () => ipcRenderer.send('folder-window-maximize'),
  closeFolderWindowSelf: () => ipcRenderer.send('folder-window-close'),
  
  // 獲取當前窗口的資料夾ID（從命令行參數）
  getCurrentFolderId: () => {
    const args = process.argv;
    const folderIdArg = args.find(arg => arg.startsWith('--folder-id='));
    return folderIdArg ? folderIdArg.split('=')[1] : null;
  },

  // ==================== 視窗展示握手 ====================
  // 由資料夾渲染器通知主進程：已準備好顯示
  folderWindowReady: () => ipcRenderer.send('folder-window-ready'),

  // ==================== 系統瀏覽器打開連結 ====================
  // 在系統預設瀏覽器中打開外部連結（通過 IPC 轉發到主進程）
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ==================== 可選：SQLite 測試用 API（不影響現有通道） ====================
  sqlGetAllGames: () => ipcRenderer.invoke('sql:get-all-games'),
  sqlGetGame: (filePath) => ipcRenderer.invoke('sql:get-game', filePath),
  sqlSearchGames: (q, limit) => ipcRenderer.invoke('sql:games-searchByTitle', q, limit),
  sqlUpsertGames: (items) => ipcRenderer.invoke('sql:games-upsertMany', items)
  ,
  // ==================== 雲端備份 API（S3 / WebDAV） ====================
  backupGetSpec: () => ipcRenderer.invoke('backup:get-spec'),
  backupGetLast: () => ipcRenderer.invoke('backup:get-last'),
  backupGetProviderParams: (provider) => ipcRenderer.invoke('backup:get-provider-params', provider),
  backupSetProviderParams: (provider, params) => ipcRenderer.invoke('backup:set-provider-params', { provider, params }),
  backupRun: (payload) => ipcRenderer.invoke('backup:run', payload),
  backupRestorePlan: (payload) => ipcRenderer.invoke('backup:restore-plan', payload),
  backupRestoreRun: (payload) => ipcRenderer.invoke('backup:restore-run', payload),
  onBackupProgress: (callback) => {
    const ch = 'backup:progress';
    const handler = (_e, payload) => callback && callback(payload);
    ipcRenderer.on(ch, handler);
    return () => ipcRenderer.removeListener(ch, handler);
  },

  // ==================== Dropbox Auth ====================
  dropboxGetAuth: () => ipcRenderer.invoke('dropbox:get-auth'),
  dropboxGetAccount: () => ipcRenderer.invoke('dropbox:get-account'),
  dropboxGetAccountPhoto: (url) => ipcRenderer.invoke('dropbox:get-account-photo', url),
  dropboxOAuthStart: (payload) => ipcRenderer.invoke('dropbox:oauth-start', payload),
  dropboxUnlink: () => ipcRenderer.invoke('dropbox:unlink')
  ,
  // ==================== Windows 捷徑 API ====================
  // 在桌面建立遊戲捷徑
  createShortcut: (payload) => ipcRenderer.invoke('create-shortcut', payload),
  // 監聽由捷徑啟動傳入的遊戲 hash
  onShortcutLaunch: (callback) => {
    const ch = 'shortcut-launch';
    const handler = (_e, hash) => callback && callback(hash);
    ipcRenderer.on(ch, handler);
    return () => ipcRenderer.removeListener(ch, handler);
  }
});
