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
        // 先廣播精簡增量事件（即時修補當前視圖）
        try {
          broadcastToAll('games-incremental-update', [
            {
              filePath,
              gameName: customName || null,
              customName: customName || null,
            },
          ]);
        } catch (_) {}
        // 再廣播全量列表（後備/跨視圖一致）
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
        // 先廣播精簡增量事件
        try {
          broadcastToAll('games-incremental-update', [
            {
              filePath,
              vendor: customVendor || null,
              customVendor: customVendor || null,
            },
          ]);
        } catch (_) {}
        // 後備：全量
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
        // 先廣播精簡增量事件
        try {
          const payload = { filePath };
          if (Object.prototype.hasOwnProperty.call(customData || {}, 'customName')) {
            payload.gameName = customData.customName || null;
            payload.customName = customData.customName || null;
          }
          if (Object.prototype.hasOwnProperty.call(customData || {}, 'customVendor')) {
            payload.vendor = customData.customVendor || null;
            payload.customVendor = customData.customVendor || null;
          }
          broadcastToAll('games-incremental-update', [payload]);
        } catch (_) {}
        // 後備：全量
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
