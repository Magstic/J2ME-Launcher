// src/main/ipc/folder-windows.js
// IPC for independent folder windows lifecycle and controls

const { getFolderById: sqlGetFolderById } = require('../sql/folders-read');

function register({ ipcMain, BrowserWindow, DataStore, createFolderWindow, folderWindows }) {
  // 打開獨立資料夾窗口
  ipcMain.handle('open-folder-window', (event, folderId) => {
    try {
      const folder = sqlGetFolderById(folderId);
      if (!folder) {
        return { success: false, error: '資料夾不存在' };
      }
      const folderWindow = createFolderWindow(folderId, folder.name);
      return { success: true, windowId: folderWindow.id };
    } catch (error) {
      console.error('打開資料夾窗口失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 關閉資料夾窗口
  ipcMain.handle('close-folder-window', (event, folderId) => {
    try {
      const folderWindow = folderWindows.get(folderId);
      if (folderWindow && !folderWindow.isDestroyed()) {
        folderWindow.close();
        return { success: true };
      }
      return { success: false, error: '窗口不存在或已關閉' };
    } catch (error) {
      console.error('關閉資料夾窗口失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 資料夾窗口控制 IPC
  ipcMain.on('folder-window-minimize', (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow) senderWindow.minimize();
  });

  ipcMain.on('folder-window-maximize', (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow) return;
    if (senderWindow.isMaximized()) senderWindow.unmaximize();
    else senderWindow.maximize();
  });

  ipcMain.on('folder-window-close', (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow) senderWindow.close();
  });
}

module.exports = { register };
