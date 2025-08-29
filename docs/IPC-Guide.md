# IPC 與 Preload API 指南

本文件提供 J2ME Launcher 中主進程與渲染進程之間的 IPC 通訊指南，包含序列化安全、錯誤處理和性能優化的最佳實踐。

## 概述

### 架構設計

J2ME Launcher 使用 Electron 的 `contextBridge` 安全機制，所有 IPC API 都透過 `window.electronAPI` 暴露給渲染進程。

### 序列化安全

所有 IPC 傳輸的資料必須可序列化，以避免 "An object could not be cloned" 錯誤：

```javascript
// ✅ 安全的 IPC 調用
const result = await window.electronAPI.addGameToFolder(
  String(gameFilePath), 
  String(folderId)
);

// ❌ 不安全：傳遞原始物件
const result = await window.electronAPI.addGameToFolder(gameObject, folderObject);
```

## API 分組與功能

- __窗口控制__
  - `minimizeWindow()`
  - `maximizeWindow()`
  - `closeWindow()`

- __遊戲管理__
  - `getInitialGames()`

- __目錄管理__
  - `getDirectories()`
  - `addDirectories()`
  - `removeDirectory(directoryPath)`
  - `toggleDirectory(directoryPath, enabled)`
  - `scanDirectories(forceFullScan = false)`
  - `selectDirectory()`
  - 事件：
    - `onGamesUpdated(callback)` → channel: `'games-updated'`，回傳 unsubscribe 函式
    - `onAutoScanCompleted(callback)` → channel: `'auto-scan-completed'`
  - 其他：
    - `removeAllListeners(channel)`

- __資料夾管理__
  - `getFolders()`
  - `getFolderById(folderId)`
  - `createFolder(folderData)`
  - `updateFolder(folderId, updates)`
  - `deleteFolder(folderId, moveGamesToUncategorized)`

- __遊戲與資料夾關係__
  - `addGameToFolder(gameId, folderId)`
  - `addGamesToFolderBatch(gameIdsOrPaths, folderId, options)`
  - `emitFolderBatchUpdates(folderId)`
  - `removeGameFromFolder(gameId, folderId)`
  - `moveGameBetweenFolders(gameId, fromFolderId, toFolderId)`
  - `getGamesByFolder(folderId)`
  - `getUncategorizedGames()`
  - `getGamesInAnyFolder()`

- __桌面/資料夾數據__
  - `getDesktopItems()`
  - `getFolderContents(folderId)`

- __統計__
  - `getFolderStats()`

- __遊戲啟動__
  - `launchGame(gameFilePath)`

- __模擬器設定__
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
  - `getGameFolders(gameId)`

- __資料夾事件監聽__
  - `onFolderUpdated(callback)` → channel: `'folder-updated'`（回傳 unsubscribe）
  - `onFolderDeleted(callback)` → channel: `'folder-deleted'`（回傳 unsubscribe）
  - `onGameFolderChanged(callback)` → channel: `'game-folder-changed'`（回傳 unsubscribe）
  - `onFolderChanged(callback)` → channel: `'folder-changed'`（回傳 unsubscribe）

- __跨窗口拖拽會話__
  - `startDragSession(items, source)`
  - `updateDragSession(position)`
  - `dropDragSession(target)`
  - `endDragSession()`
  - 事件：
    - `onDragSessionStarted(callback)` → channel: `'drag-session:started'`
    - `onDragSessionUpdated(callback)` → channel: `'drag-session:updated'`
    - `onDragSessionEnded(callback)` → channel: `'drag-session:ended'`

- __獨立資料夾窗口__
  - `openFolderWindow(folderId)`
  - `closeFolderWindow(folderId)`
  - 視窗控制：`minimizeFolderWindow()`、`maximizeFolderWindow()`、`closeFolderWindowSelf()`
  - `getCurrentFolderId()` → 解析 `process.argv` 中 `--folder-id=`
  - `folderWindowReady()` → 通知主進程準備完成

- __外部連結__
  - `openExternal(url)`

- __SQLite（可選）__
  - `sqlGetAllGames()`
  - `sqlGetGame(filePath)`
  - `sqlSearchGames(q, limit)`
  - `sqlUpsertGames(items)`

- __雲端備份__
  - `backupGetSpec()`、`backupGetLast()`
  - `backupGetProviderParams(provider)`、`backupSetProviderParams(provider, params)`
  - `backupRun(payload)`
  - `backupRestorePlan(payload)`、`backupRestoreRun(payload)`
  - `onBackupProgress(callback)` → channel: `'backup:progress'`

- __Dropbox Auth__
  - `dropboxGetAuth()`、`dropboxGetAccount()`、`dropboxGetAccountPhoto(url)`
  - `dropboxOAuthStart(payload)`、`dropboxUnlink()`

- __Windows 捷徑__
  - `createShortcut(payload)`
  - `onShortcutLaunch(callback)` → channel: `'shortcut-launch'`

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
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
    }
  }
};

// 使用範例
const addGameSafely = async (gameFilePath, folderId) => {
  return safeIpcCall(async () => {
    return await window.electronAPI.addGameToFolder(
      String(gameFilePath),
      String(folderId)
    );
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
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
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
