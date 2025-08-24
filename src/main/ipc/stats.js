// src/main/ipc/stats.js
// IPC for statistics and cross-references
const { getFolderStats: sqlGetFolderStats, getGameFolders: sqlGetGameFolders } = require('../sql/folders-read');

function register({ ipcMain, DataStore, addUrlToGames }) {
  // 獲取資料夾統計信息
  ipcMain.handle('get-folder-stats', () => {
    try {
      try { return sqlGetFolderStats(); } catch (_) { return DataStore.getFolderStats(); }
    } catch (error) {
      console.error('獲取資料夾統計失敗:', error);
      return {
        totalFolders: 0,
        totalGames: 0,
        categorizedGames: 0,
        uncategorizedGames: 0,
        folders: []
      };
    }
  });

  // 獲取遊戲所屬資料夾
  ipcMain.handle('get-game-folders', (event, gameId) => {
    try {
      try { return sqlGetGameFolders(gameId); } catch (_) { return DataStore.getGameFolders(gameId); }
    } catch (error) {
      console.error('獲取遊戲資料夾失敗:', error);
      return [];
    }
  });
}

module.exports = { register };
