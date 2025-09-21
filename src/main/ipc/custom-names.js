// src/main/ipc/custom-names.js
// IPC handlers for custom game names and vendors

const {
  updateCustomName,
  updateCustomVendor,
  updateCustomData,
  resetCustomNames,
} = require('../sql/custom-names');
const { addUrlToGames } = require('../utils/icon-url');
const { getAllGamesFromSql } = require('../sql/read');

function register({ ipcMain, broadcastToAll }) {
  // 更新遊戲自訂名稱
  ipcMain.handle('update-custom-name', async (event, filePath, customName) => {
    try {
      const result = updateCustomName(filePath, customName);
      if (result.changes > 0) {
        // 廣播更新事件
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      }
      return { success: true };
    } catch (error) {
      console.error('更新自訂名稱失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 更新遊戲自訂開發商
  ipcMain.handle('update-custom-vendor', async (event, filePath, customVendor) => {
    try {
      const result = updateCustomVendor(filePath, customVendor);
      if (result.changes > 0) {
        // 廣播更新事件
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      }
      return { success: true };
    } catch (error) {
      console.error('更新自訂開發商失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 批量更新自訂數據
  ipcMain.handle('update-custom-data', async (event, filePath, customData) => {
    try {
      const result = updateCustomData(filePath, customData);
      if (result.changes > 0) {
        // 廣播更新事件
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      }
      return { success: true };
    } catch (error) {
      console.error('更新自訂數據失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 重置自訂名稱
  ipcMain.handle('reset-custom-names', async (event, filePath) => {
    try {
      const result = resetCustomNames(filePath);
      if (result.changes > 0) {
        // 廣播更新事件
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      }
      return { success: true };
    } catch (error) {
      console.error('重置自訂名稱失敗:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
