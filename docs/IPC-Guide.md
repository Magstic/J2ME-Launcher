# IPC 與 Preload API 指南

本文件提供 J2ME Launcher 中主進程與渲染進程之間的 IPC 通訊指南，包含序列化安全、錯誤處理和性能優化的最佳實踐。

## 概述

### 架構設計

J2ME Launcher 使用 Electron 的 `contextBridge` 安全機制，所有 IPC API 都透過 `window.electronAPI` 暴露給渲染進程。

### 序列化安全

所有 IPC 傳輸的資料必須可序列化，以避免 "An object could not be cloned" 錯誤：

```javascript
// ✅ 安全的 IPC 調用
const result = await window.electronAPI.addGameToFolder(String(gameFilePath), String(folderId));

// ❌ 不安全：傳遞原始物件
const result = await window.electronAPI.addGameToFolder(gameObject, folderObject);
```

## API 分組與功能

- **窗口控制**
  - `minimizeWindow()`
  - `maximizeWindow()`
  - `closeWindow()`

- **遊戲管理**
  - `getInitialGames()`

- **目錄管理**
  - `getDirectories()`
  - `addDirectories()`
  - `removeDirectory(directoryPath)`
  - `toggleDirectory(directoryPath, enabled)`
  - `scanDirectories(forceFullScan = false)`
  - 事件：
    - `onGamesUpdated(callback)` → channel: `'games-updated'`，回傳 unsubscribe 函式
    - `onGamesIncrementalUpdate(callback)` → channel: `'games-incremental-update'`，回傳 unsubscribe 函式
    - `onAutoScanCompleted(callback)` → channel: `'auto-scan-completed'`
  - 其他：
    - `removeAllListeners(channel)`

- **資料夾管理**
  - `getFolders()`
  - `getFolderById(folderId)`
  - `createFolder(folderData)`
  - `updateFolder(folderId, updates)`
  - `deleteFolder(folderId, moveGamesToUncategorized)`

- **遊戲與資料夾關係**
  - `addGameToFolder(gameId, folderId)`
  - `addGamesToFolderBatch(gameIdsOrPaths, folderId, options)`
  - `batchAddGamesToFolder(filePaths, folderId, options)`
  - `removeGameFromFolder(gameId, folderId)`
  - `batchRemoveGamesFromFolder(filePaths, folderId)`
  - `moveGameBetweenFolders(gameId, fromFolderId, toFolderId)`
  - `getGamesByFolder(folderId)`
  - `getUncategorizedGames()`
  - `getGamesInAnyFolder()`

- **桌面/資料夾數據**
  - `getDesktopItems()`
  - `getFolderContents(folderId)`

- **自訂名稱管理**
  - `updateCustomName(filePath, customName)`
  - `updateCustomVendor(filePath, customVendor)`
  - `updateCustomData(filePath, customData)`
  - `resetCustomNames(filePath)`

- **遊戲啟動**
  - `launchGame(gameFilePath)`

- **模擬器設定**
  - `getEmulatorConfig()`
  - `listEmulators()`
  - `getEmulatorCapabilities(emulatorId)`
  - `getEmulatorSchema(emulatorId)`
  - `setEmulatorConfig(partial)`
  - `pickEmulatorBinary(emulatorId)`
  - `getGameEmulatorConfig(filePath)`
  - `setGameEmulatorConfig(filePath, emulatorConfig)`
  - `updateFreej2meGameConf(filePath, effectiveParams)`
  - FreeJ2ME-Plus 資產：
    - `pickFreej2meAsset(type)`
    - `importFreej2meAsset(type, sourcePath)`

- **資料夾事件監聽**
  - `onFolderUpdated(callback)` → channel: `'folder-updated'`（回傳 unsubscribe）
  - `onFolderChanged(callback)` → channel: `'folder-changed'`（回傳 unsubscribe）

- **批次操作事件監聽**
  - `onBulkOperationStart(callback)` → channel: `'bulk-operation-start'`（回傳 unsubscribe）
  - `onBulkOperationEnd(callback)` → channel: `'bulk-operation-end'`（回傳 unsubscribe）
  - 其他：`offBulkOperationStart(callback)`、`offBulkOperationEnd(callback)`

- **跨窗口拖拽會話**
  - `startDragSession(items, source)`
  - `dropDragSession(target)`
  - `endDragSession()`
  - 事件：
    - `onDragSessionStarted(callback)` → channel: `'drag-session:started'`（回傳 unsubscribe）
    - `onDragSessionEnded(callback)` → channel: `'drag-session:ended'`（回傳 unsubscribe）

- **獨立資料夾窗口**
  - `openFolderWindow(folderId)`
  - `closeFolderWindow(folderId)`
  - 視窗控制：`minimizeFolderWindow()`、`maximizeFolderWindow()`、`closeFolderWindowSelf()`
  - `getCurrentFolderId()` → 解析 `process.argv` 中 `--folder-id=`
  - `folderWindowReady()` → 通知主進程準備完成

- **外部連結**
  - `openExternal(url)`

- **SQLite（可選）**
  - `sqlGetAllGames()`
  - `sqlGetGame(filePath)`
  - `sqlSearchGames(q, limit)`
  - `sqlUpsertGames(items)`

- **雲端備份**
  - `backupGetSpec()`、`backupGetLast()`
  - `backupGetProviderParams(provider)`、`backupSetProviderParams(provider, params)`
  - `backupRun(payload)`
  - `backupRestorePlan(payload)`、`backupRestoreRun(payload)`
  - `onBackupProgress(callback)` → channel: `'backup:progress'`（回傳 unsubscribe）

- **Dropbox Auth**
  - `dropboxGetAuth()`、`dropboxGetAccount()`、`dropboxGetAccountPhoto(url)`
  - `dropboxOAuthStart(payload)`、`dropboxUnlink()`

- **Windows 捷徑**
  - `createShortcut(payload)`
  - `onShortcutLaunch(callback)` → channel: `'shortcut-launch'`（回傳 unsubscribe）

- **Java 設定**
  - `getJavaPath()`
  - `setJavaPath(javaPath)`
  - `validateJavaPath(javaPath)`
  - `browseJavaExecutable()`

## 附錄：API 與 IPC 通道對照表

以下對照表以 `src/main/preload.js` 為準，標明每個 API 對應的 IPC 通道與型態（invoke/send）及事件通道。

- **窗口控制**
  - `minimizeWindow` → `'window-minimize'`（send）
  - `maximizeWindow` → `'window-maximize'`（send）
  - `closeWindow` → `'window-close'`（send）

- **遊戲管理**
  - `getInitialGames` → `'get-initial-games'`（invoke）

- **目錄管理與事件**
  - `getDirectories` → `'get-directories'`（invoke）
  - `addDirectories` → `'add-directories'`（invoke）
  - `removeDirectory` → `'remove-directory'`（invoke）
  - `toggleDirectory` → `'toggle-directory'`（invoke）
  - `scanDirectories` → `'scan-directories'`（invoke）
  - `onGamesUpdated` → `'games-updated'`（event，return unsubscribe）
  - `onGamesIncrementalUpdate` → `'games-incremental-update'`（event，return unsubscribe）
  - `onAutoScanCompleted` → `'auto-scan-completed'`（event）
  - `removeAllListeners(channel)` →（通用）

- **自訂名稱管理**
  - `updateCustomName` → `'update-custom-name'`（invoke）
  - `updateCustomVendor` → `'update-custom-vendor'`（invoke）
  - `updateCustomData` → `'update-custom-data'`（invoke）
  - `resetCustomNames` → `'reset-custom-names'`（invoke）

- **資料夾管理**
  - `getFolders` → `'get-folders'`（invoke）
  - `getFolderById` → `'get-folder-by-id'`（invoke）
  - `createFolder` → `'create-folder'`（invoke）
  - `updateFolder` → `'update-folder'`（invoke）
  - `deleteFolder` → `'delete-folder'`（invoke）

- **遊戲與資料夾關係**
  - `addGameToFolder` → `'add-game-to-folder'`（invoke）
  - `addGamesToFolderBatch` → `'add-games-to-folder-batch'`（invoke）
  - `batchAddGamesToFolder` → `'batch-add-games-to-folder'`（invoke）
  - `removeGameFromFolder` → `'remove-game-from-folder'`（invoke）
  - `batchRemoveGamesFromFolder` → `'batch-remove-games-from-folder'`（invoke）
  - `moveGameBetweenFolders` → `'move-game-between-folders'`（invoke）
  - `getGamesByFolder` → `'get-games-by-folder'`（invoke）
  - `getUncategorizedGames` → `'get-uncategorized-games'`（invoke）
  - `getGamesInAnyFolder` → `'get-games-in-any-folder'`（invoke）
  - 事件：
    - `onBulkOperationStart` → `'bulk-operation-start'`（return unsubscribe）
    - `onBulkOperationEnd` → `'bulk-operation-end'`（return unsubscribe）

- **桌面/資料夾數據與統計**
  - `getDesktopItems` → `'get-desktop-items'`（invoke）
  - `getFolderContents` → `'get-folder-contents'`（invoke）

- **遊戲啟動**
  - `launchGame` → `'launch-game'`（invoke）

- **模擬器設定與資產**
  - `getEmulatorConfig` → `'get-emulator-config'`（invoke）
  - `listEmulators` → `'list-emulators'`（invoke）
  - `getEmulatorCapabilities` → `'get-emulator-capabilities'`（invoke）
  - `getEmulatorSchema` → `'get-emulator-schema'`（invoke）
  - `setEmulatorConfig` → `'set-emulator-config'`（invoke）
  - `pickEmulatorBinary` → `'pick-emulator-binary'`（invoke）
  - `getGameEmulatorConfig` → `'get-game-emulator-config'`（invoke）
  - `setGameEmulatorConfig` → `'set-game-emulator-config'`（invoke）
  - `updateFreej2meGameConf` → `'update-freej2me-game-conf'`（invoke）
  - `pickFreej2meAsset` → `'freej2me:pick-asset'`（invoke）
  - `importFreej2meAsset` → `'freej2me:import-asset'`（invoke）

- **資料夾事件監聽**
  - `onFolderUpdated` → `'folder-updated'`（event，return unsubscribe）
  - `onFolderChanged` → `'folder-changed'`（event，return unsubscribe）

- **跨窗口拖拽會話**
  - `startDragSession` → `'drag-session:start'`（invoke）
  - `dropDragSession` → `'drag-session:drop'`（invoke）
  - `endDragSession` → `'drag-session:end'`（invoke）
  - 事件：
    - `onDragSessionStarted` → `'drag-session:started'`（return unsubscribe）
    - `onDragSessionEnded` → `'drag-session:ended'`（return unsubscribe）

- **獨立資料夾窗口**
  - `openFolderWindow` → `'open-folder-window'`（invoke）
  - `closeFolderWindow` → `'close-folder-window'`（invoke）
  - `minimizeFolderWindow` → `'folder-window-minimize'`（send）
  - `maximizeFolderWindow` → `'folder-window-maximize'`（send）
  - `closeFolderWindowSelf` → `'folder-window-close'`（send）
  - `getCurrentFolderId` → 從 `process.argv` 解析（非 IPC）
  - `folderWindowReady` → `'folder-window-ready'`（send）

- **外部連結**
  - `openExternal` → `'open-external'`（invoke）

- **SQLite（可選）**
  - `sqlGetAllGames` → `'sql:get-all-games'`（invoke）
  - `sqlGetGame` → `'sql:get-game'`（invoke）
  - `sqlSearchGames` → `'sql:games-searchByTitle'`（invoke）
  - `sqlUpsertGames` → `'sql:games-upsertMany'`（invoke）

- **雲端備份**
  - `backupGetSpec` → `'backup:get-spec'`（invoke）
  - `backupGetLast` → `'backup:get-last'`（invoke）
  - `backupGetProviderParams` → `'backup:get-provider-params'`（invoke）
  - `backupSetProviderParams` → `'backup:set-provider-params'`（invoke）
  - `backupRun` → `'backup:run'`（invoke）
  - `backupRestorePlan` → `'backup:restore-plan'`（invoke）
  - `backupRestoreRun` → `'backup:restore-run'`（invoke）
  - `onBackupProgress` → `'backup:progress'`（event，return unsubscribe）

- **Dropbox Auth**
  - `dropboxGetAuth` → `'dropbox:get-auth'`（invoke）
  - `dropboxGetAccount` → `'dropbox:get-account'`（invoke）
  - `dropboxGetAccountPhoto` → `'dropbox:get-account-photo'`（invoke）
  - `dropboxOAuthStart` → `'dropbox:oauth-start'`（invoke）
  - `dropboxUnlink` → `'dropbox:unlink'`（invoke）

- **Windows 捷徑**
  - `createShortcut` → `'create-shortcut'`（invoke）
  - `onShortcutLaunch` → `'shortcut-launch'`（event，return unsubscribe）

## 序列化安全最佳實踐

### 核心原則

1. **所有參數必須可序列化**
2. **使用字串轉換確保安全**
3. **避免傳遞函數或循環引用**
4. **實施錯誤處理和重試機制**

### 安全的 IPC 調用模式

```javascript
// ✅ 正確的方式
const safeIpcCall = async (operation, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.message.includes('could not be cloned')) {
        console.error('序列化錯誤:', error.message);
        throw new Error('資料序列化失敗，請檢查參數格式');
      }
      if (i === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, i)));
    }
  }
};

// 使用範例
const addGameSafely = async (gameFilePath, folderId) => {
  return safeIpcCall(async () => {
    return await window.electronAPI.addGameToFolder(String(gameFilePath), String(folderId));
  });
};
```

### 事件監聽管理

```javascript
// ✅ 正確的事件監聽管理
class EventManager {
  constructor() {
    this.unsubscribers = new Map();
  }

  subscribe(eventName, callback) {
    const unsubscribe = window.electronAPI[`on${eventName}`](callback);
    this.unsubscribers.set(eventName, unsubscribe);
    return unsubscribe;
  }

  unsubscribe(eventName) {
    const unsubscribe = this.unsubscribers.get(eventName);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribers.delete(eventName);
    }
  }

  cleanup() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();
  }
}
```

## 注意事項

- **退訂管理**: 所有 `on*` 方法都會返回 unsubscribe 函數，必須適時調用以避免記憶體洩漏
- **通道命名**: IPC 通道名與 API 方法名一一對應
- **錯誤處理**: 所有 IPC 調用都應該包裝在 try-catch 中
- **性能考量**: 使用批量 API 處理大量資料，避免頻繁的單一調用

更多詳細的實作資訊請參考 `src/main/main.js` 和 `src/main/ipc/*` 目錄下的相關檔案。
