// src/main/ipc/desktop.js
// IPC for desktop view data

const { getUncategorizedGames: sqlGetUncategorizedGames, getFolders: sqlGetFolders, getFolderGameCount: sqlGetFolderGameCount } = require('../sql/folders-read');

function register({ ipcMain, DataStore, toIconUrl }) {
  // 獲取桌面所有項目（遊戲 + 資料夾）
  ipcMain.handle('get-desktop-items', () => {
    try {
      const games = sqlGetUncategorizedGames();
      const folders = sqlGetFolders();
      const folderItems = folders.map(f => ({ type: 'folder', ...f, gameCount: sqlGetFolderGameCount(f.id) }));
      const gameItems = games.map(g => ({ type: 'game', ...g, iconUrl: toIconUrl(g.iconPath) }));
      return [...gameItems, ...folderItems];
    } catch (error) {
      console.error('獲取桌面項目失敗:', error);
      return [];
    }
  });
}

module.exports = { register };
