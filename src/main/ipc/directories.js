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
      const added = DataStore.addDirectory(directoryPath);
      if (added) {
        addedDirectories.push(directoryPath);
        try { sqlAddDirectory(directoryPath); } catch (e) { console.warn('[SQL write] addDirectory failed:', e.message); }
      } else {
        existingDirectories.push(directoryPath);
      }
    }

    DataStore.saveData();

    return {
      success: true,
      addedDirectories,
      existingDirectories,
      totalSelected: filePaths.length
    };
  });

  // 移除目录
  ipcMain.handle('remove-directory', async (event, directoryPath) => {
    const removed = DataStore.removeDirectory(directoryPath);
    if (removed) {
      DataStore.saveData();
      try { sqlRemoveDirectory(directoryPath); } catch (e) { console.warn('[SQL write] removeDirectory failed:', e.message); }
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
      const games = DataStore.getAllGames();
      // Filter out games from the removed directory to avoid resurrecting them
      const prefixWin = directoryPath.endsWith('\\') ? directoryPath : (directoryPath + '\\');
      const prefixPosix = directoryPath.endsWith('/') ? directoryPath : (directoryPath + '/');
      const filteredGames = games.filter(g => {
        const fp = g.filePath || '';
        return !(fp.startsWith(prefixWin) || fp.startsWith(prefixPosix));
      });
      try { upsertGames(filteredGames); } catch (e) { console.warn('[SQL sync] remove-directory upsert failed:', e.message); }
      // Always broadcast fresh list from SQL after sync
      try {
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (_) {
        const gamesWithUrl = addUrlToGames(filteredGames);
        broadcastToAll('games-updated', gamesWithUrl);
      }
    }
    return { success: removed };
  });

  // 启用/禁用目录
  ipcMain.handle('toggle-directory', async (event, directoryPath, enabled) => {
    DataStore.setDirectoryEnabled(directoryPath, enabled);
    DataStore.saveData();
    try { sqlSetDirectoryEnabled(directoryPath, enabled); } catch (e) { console.warn('[SQL write] setDirectoryEnabled failed:', e.message); }
    // Immediately refresh games list with enabled-dir filter
    try {
      const games = getAllGamesFromSql();
      broadcastToAll('games-updated', addUrlToGames(games));
    } catch (_) {
      const games = DataStore.getAllGames();
      broadcastToAll('games-updated', addUrlToGames(games));
    }
    return { success: true };
  });

  // 手动触发多目录扫描
  ipcMain.handle('scan-directories', async (event, forceFullScan = false) => {
    try {
      console.log(`🚀 开始${forceFullScan ? '全量' : '增量'}扫描所有目录...`);

      const result = await processMultipleDirectories(null, forceFullScan);

      if (result.success) {
        const games = DataStore.getAllGames();
        try { upsertGames(games); } catch (e) { console.warn('[SQL sync] scan-directories upsert failed:', e.message); }
        // Compute updated games (SQL-first), then broadcast once
        let updatedGames;
        try {
          const sqlGames = getAllGamesFromSql();
          updatedGames = addUrlToGames(sqlGames);
        } catch (_) {
          updatedGames = addUrlToGames(games);
        }
        broadcastToAll('games-updated', updatedGames);
        try {
          const iso = new Date().toISOString();
          // If processMultipleDirectories returns per-dir info, we could use that.
          // For now, update all enabled directories' lastScanTime.
          const dirs = (function(){ try { return sqlGetDirectories(); } catch (_) { return DataStore.getDirectories(); } })();
          for (const d of dirs) {
            if (d.enabled) {
              try { sqlUpdateDirectoryScanTime(d.path, iso); } catch (e) {}
            }
          }
        } catch (_) {}
        return { success: true, games: updatedGames, scanResult: result };
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
