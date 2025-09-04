// src/main/ipc/desktop.js
// IPC for desktop view data

const { getUncategorizedGames: sqlGetUncategorizedGames, getFolders: sqlGetFolders, getFolderGameCount: sqlGetFolderGameCount } = require('../sql/folders-read');

function register({ ipcMain, DataStore, toIconUrl }) {
  // 獲取桌面項目（僅遊戲，資料夾不在桌面顯示）
  ipcMain.handle('get-desktop-items', () => {
    try {
      const games = sqlGetUncategorizedGames();
      const gameItems = games.map(g => ({ type: 'game', ...g, iconUrl: toIconUrl(g.iconPath) }));
      return gameItems;
    } catch (error) {
      console.error('獲取桌面項目失敗:', error);
      return [];
    }
  });
}

module.exports = { register };
