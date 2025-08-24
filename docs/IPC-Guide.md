# IPC 與 Preload API 指南（code-derived）

本文件基於 `src/main/preload.js` 之實際程式碼整理，列出 renderer 可用的 IPC 介面與事件。所有方法皆經由 `contextBridge.exposeInMainWorld('electronAPI', …)` 暴露於 `window.electronAPI`。

- 檔案來源：`src/main/preload.js`
- 使用樣例：
  ```js
  const games = await window.electronAPI.getInitialGames();
  const off = window.electronAPI.onGamesUpdated((list) => console.log(list));
  off(); // 解除監聽
  ```

## 分組 API

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

## 注意事項
- __退訂（unsubscribe）__: 帶有 `on*` 的監聽方法多數回傳解除監聽函式，或可用 `removeAllListeners(channel)`。
- __命名即通道__: IPC 通道名以 `invoke/send/on` 中填入之字串為準（已於各條目標註）。
- 本文件僅摘錄 `preload.js` 暴露之 API；對應的主進程 handler 與具體資料結構請參見 `src/main/main.js` 與相關 `src/main/ipc/*`、`src/main/sql/*`。
