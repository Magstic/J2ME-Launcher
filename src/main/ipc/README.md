# IPC Modules Overview

This directory contains modular IPC handlers for the Electron main process. Each module exposes a `register()` function that accepts dependencies from `main.js` for better testability and separation of concerns.

## Modules

- emulator.js
  - Channels (handle):
    - `get-emulator-config`
    - `set-emulator-config`
    - `get-game-emulator-config`
    - `set-game-emulator-config`
    - `pick-emulator-binary`
    - `launch-game`
  - Deps: `ipcMain`, `dialog`, `DataStore`, `freej2mePlusAdapter`, `resolveJavaCommand`, `getConfigGameName`

- folders.js
  - Channels (handle):
    - `get-folders`, `get-folder-by-id`
    - `create-folder`, `update-folder`, `delete-folder`
    - `add-game-to-folder`, `remove-game-from-folder`, `move-game-between-folders`
    - `get-games-by-folder`, `get-uncategorized-games`
    - `get-folder-contents` (aggregate: folder info + games with iconUrl)
  - Deps: `ipcMain`, `DataStore`, `addUrlToGames`, `broadcastToAll`

- directories.js
  - Channels (handle):
    - `get-initial-games`
    - `get-directories`, `add-directories`, `remove-directory`, `toggle-directory`
    - `scan-directories`, `select-directory`
  - Deps: `ipcMain`, `dialog`, `DataStore`, `processDirectory`, `processMultipleDirectories`, `addUrlToGames`, `broadcastToAll`

- drag-session.js
  - Channels (handle): `drag-session:start`, `drag-session:update`, `drag-session:drop`, `drag-session:end`
  - Broadcasts: `drag-session:started`, `drag-session:updated`, `drag-session:ended`, `games-updated`, `folder-changed`, `folder-updated`
  - Deps: `ipcMain`, `DataStore`, `addUrlToGames`, `broadcastToAll`, `BrowserWindow`
  - Notes:
    - Renderer now defers ending sessions on `dragend` and relies on `drop` IPC, with an 800ms safety timeout.
    - Renderer triggers a proactive folder hit-test on `dragend` to call `dropDragSession` for ultra-fast releases and retries once on transient failure.
    - Planned improvement: add a short grace period/debounce in `drag-session:end` so a `drop` arriving milliseconds later can still be honored before clearing the session.

- folder-windows.js
  - Channels:
    - (handle) `open-folder-window`, `close-folder-window`
    - (on) `folder-window-minimize`, `folder-window-maximize`, `folder-window-close`
  - Deps: `ipcMain`, `BrowserWindow`, `DataStore`, `createFolderWindow`, `folderWindows`

- desktop.js
  - Channels (handle): `get-desktop-items` (adds `iconUrl` for games)
  - Deps: `ipcMain`, `DataStore`, `toIconUrl`

- stats.js
  - Channels (handle): `get-folder-stats`, `get-game-folders`
  - Deps: `ipcMain`, `DataStore`, `addUrlToGames`

- window-controls.js
  - Channels (on): `window-minimize`, `window-maximize`, `window-close`
  - Deps: `ipcMain`, `getMainWindow`

- backup.js
  - Channels (handle):
    - Backup spec/meta: `backup:get-spec`, `backup:get-last`
    - Dropbox auth: `dropbox:get-auth`, `dropbox:unlink`, `dropbox:oauth-start`
    - Dropbox account: `dropbox:get-account`, `dropbox:get-account-photo`
    - Backup/restore: `backup:run`, `backup:restore-plan`, `backup:restore-run`
  - Broadcasts: none (progress is returned via handler responses/callbacks)
  - Deps: `ipcMain`, `app`, Node `http/https`, `fs`, `fs-extra`, `path`, `crypto`, `shell` (for OAuth),
    `../../shared/backup/spec` (shared spec), `../backup/core` (runBackup/planRestore/runRestore)

## Registration Order Notes

- `folder-windows.js` must be registered AFTER `folderWindows` Map and `createFolderWindow()` are defined in `main.js`.
- Other modules can be registered near the top of `main.js` after required imports.
- `backup.js` requires `app` and should be registered after shared spec and core are importable; otherwise no special ordering.

## Broadcast helper

- `broadcastToAll(channel, payload, excludeWindowId?)` is provided by `main.js` and used by multiple modules to sync UI state across the main window and all folder windows.
