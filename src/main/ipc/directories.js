// src/main/ipc/directories.js
// Directory configuration and scanning IPC handlers
const { upsertGames } = require('../sql/sync');
const { getAllGamesFromSql } = require('../sql/read');
const { getDB } = require('../db');
const {
  getDirectories: sqlGetDirectories,
  addDirectory: sqlAddDirectory,
  removeDirectory: sqlRemoveDirectory,
  setDirectoryEnabled: sqlSetDirectoryEnabled,
  updateDirectoryScanTime: sqlUpdateDirectoryScanTime,
} = require('../sql/directories');

function register({ ipcMain, dialog, DataStore, processDirectory, processMultipleDirectories, addUrlToGames, broadcastToAll }) {
  // 初始遊戲列表
  ipcMain.handle('get-initial-games', () => {
    try {
      const games = getAllGamesFromSql();
      return addUrlToGames(games);
    } catch (e) {
      // Fallback to legacy JSON if SQL not ready
      const games = DataStore.getAllGames();
      return addUrlToGames(games);
    }
  });

  // 获取所有配置的目录
  ipcMain.handle('get-directories', () => {
    try {
      return sqlGetDirectories();
    } catch (e) {
      return DataStore.getDirectories();
    }
  });

  // 添加新目录（多選）
  ipcMain.handle('add-directories', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'multiSelections']
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, message: '用户取消选择' };
    }

    const addedDirectories = [];
    const existingDirectories = [];

    for (const directoryPath of filePaths) {
      try {
        // 檢查是否已存在
        const existing = sqlGetDirectories().some(d => d.path === directoryPath);
        if (existing) {
          existingDirectories.push(directoryPath);
          console.log(`目录已存在: ${directoryPath}`);
        } else {
          sqlAddDirectory(directoryPath);
          addedDirectories.push(directoryPath);
          console.log(`已添加目录: ${directoryPath}`);
        }
      } catch (e) {
        console.error(`[IPC] addDirectory failed for ${directoryPath}:`, e.message);
        existingDirectories.push(directoryPath);
      }
    }

    return {
      success: true,
      addedDirectories,
      existingDirectories,
      totalSelected: filePaths.length
    };
  });

  // 移除目录
  ipcMain.handle('remove-directory', async (event, directoryPath) => {
    try {
      // 檢查目錄是否存在
      const exists = sqlGetDirectories().some(d => d.path === directoryPath);
      if (exists) {
        sqlRemoveDirectory(directoryPath);
        // Purge games under this directory from SQL (and cascade folder_games)
        try {
          const db = getDB();
          const likePrefix = directoryPath.endsWith('\\') || directoryPath.endsWith('/') ? directoryPath : (directoryPath + (process.platform === 'win32' ? '\\' : '/'));
          const affected = db.prepare(`DELETE FROM games WHERE filePath LIKE ?`).run(likePrefix + '%');
          if (affected && affected.changes) {
            console.log('[SQL] removed', affected.changes, 'games under', directoryPath);
          }
        } catch (e) {
          console.warn('[SQL purge] remove-directory failed to purge games:', e.message);
        }
        // 清理目錄刪除後遺留的圖標快取檔案（異步）
        try {
          setImmediate(() => {
            try { DataStore.cleanupOrphanIcons(); } catch (_) {}
          });
        } catch (_) {}
      }
      // 广播更新后的游戏列表
      try {
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (e) {
        console.error('[IPC] Failed to broadcast updated games:', e.message);
      }
      return { success: true };
    } catch (e) {
      console.error('[IPC] remove-directory failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  // 启用/禁用目录
  ipcMain.handle('toggle-directory', async (event, directoryPath, enabled) => {
    try {
      sqlSetDirectoryEnabled(directoryPath, enabled);
      console.log(`目录 ${directoryPath} ${enabled ? '已启用' : '已禁用'}`);
      // Immediately refresh games list with enabled-dir filter
      try {
        const games = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(games));
      } catch (e) {
        console.error('[IPC] Failed to broadcast updated games:', e.message);
      }
      return { success: true };
    } catch (e) {
      console.error('[IPC] toggle-directory failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  // 手动触发多目录扫描
  ipcMain.handle('scan-directories', async (event, forceFullScan = false) => {
    try {
      console.log(`🚀 开始${forceFullScan ? '全量' : '增量'}扫描所有目录...`);

      const result = await processMultipleDirectories(null, forceFullScan);

      if (result.success) {
        // 直接從 SQL 獲取並廣播遊戲列表
        try {
          const sqlGames = getAllGamesFromSql();
          const updatedGames = addUrlToGames(sqlGames);
          broadcastToAll('games-updated', updatedGames);
          console.log(`📡 已廣播 ${updatedGames.length} 個遊戲到前端`);
        } catch (e) {
          console.error('[IPC] Failed to broadcast games after scan:', e.message);
        }
        try {
          const iso = new Date().toISOString();
          // If processMultipleDirectories returns per-dir info, we could use that.
          // For now, update all enabled directories' lastScanTime.
          const dirs = sqlGetDirectories();
          for (const d of dirs) {
            if (d.enabled) {
              try { sqlUpdateDirectoryScanTime(d.path, iso); } catch (e) {}
            }
          }
        } catch (_) {}
        return { success: true, scanResult: result };
      } else {
        return result;
      }
    } catch (error) {
      console.error('扫描目录失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 兼容舊的單目錄選擇
  ipcMain.handle('select-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (canceled || filePaths.length === 0) {
      return null;
    }

    const directoryPath = filePaths[0];

    DataStore.addDirectory(directoryPath);
    DataStore.saveData();
    try { sqlAddDirectory(directoryPath); } catch (e) { console.warn('[SQL write] addDirectory (single) failed:', e.message); }

    try {
      const result = await processDirectory(directoryPath, false);
      try {
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (_) {
        const games = DataStore.getAllGames();
        try { upsertGames(games); } catch (e) { console.warn('[SQL sync] select-directory upsert failed:', e.message); }
        const gamesWithUrl = addUrlToGames(games);
        broadcastToAll('games-updated', gamesWithUrl);
      }
      try { sqlUpdateDirectoryScanTime(directoryPath, new Date().toISOString()); } catch (_) {}
      // Return current SQL list if available for the caller
      try {
        const sqlGamesNow = getAllGamesFromSql();
        return { games: addUrlToGames(sqlGamesNow), directoryPath, scanResult: result };
      } catch (_) {
        const games = DataStore.getAllGames();
        const gamesWithUrl = addUrlToGames(games);
        return { games: gamesWithUrl, directoryPath, scanResult: result };
      }
    } catch (error) {
      console.error('扫描目录失败:', error);
      try {
        const sqlGames = getAllGamesFromSql();
        return { games: addUrlToGames(sqlGames), directoryPath, error: error.message };
      } catch (_) {
        const games = DataStore.getAllGames();
        const gamesWithUrl = addUrlToGames(games);
        return { games: gamesWithUrl, directoryPath, error: error.message };
      }
    }
  });
}

module.exports = { register };
