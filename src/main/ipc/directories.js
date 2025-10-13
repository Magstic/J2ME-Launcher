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
const { getLogger } = require('../../utils/logger.cjs');
const log = getLogger('ipc:directories');

function register({
  ipcMain,
  dialog,
  DataStore,
  processDirectory,
  processMultipleDirectories,
  addUrlToGames,
  broadcastToAll,
}) {
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
      properties: ['openDirectory', 'multiSelections'],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, message: '用户取消选择' };
    }

    const addedDirectories = [];
    const existingDirectories = [];

    for (const directoryPath of filePaths) {
      try {
        // 檢查是否已存在
        const existing = sqlGetDirectories().some((d) => d.path === directoryPath);
        if (existing) {
          existingDirectories.push(directoryPath);
          log.info(`目录已存在: ${directoryPath}`);
        } else {
          sqlAddDirectory(directoryPath);
          addedDirectories.push(directoryPath);
          log.info(`已添加目录: ${directoryPath}`);
        }
      } catch (e) {
        log.error(`[IPC] addDirectory failed for ${directoryPath}:`, e.message);
        existingDirectories.push(directoryPath);
      }
    }

    return {
      success: true,
      addedDirectories,
      existingDirectories,
      totalSelected: filePaths.length,
    };
  });

  // 移除目录
  ipcMain.handle('remove-directory', async (event, directoryPath) => {
    try {
      // 檢查目錄是否存在
      const exists = sqlGetDirectories().some((d) => d.path === directoryPath);
      if (exists) {
        sqlRemoveDirectory(directoryPath);
        // Purge games under this directory from SQL (and cascade folder_games)
        try {
          const db = getDB();
          const likePrefix =
            directoryPath.endsWith('\\') || directoryPath.endsWith('/')
              ? directoryPath
              : directoryPath + (process.platform === 'win32' ? '\\' : '/');
          const affected = db
            .prepare(`DELETE FROM games WHERE filePath LIKE ?`)
            .run(likePrefix + '%');
          if (affected && affected.changes) {
            log.debug('[SQL] removed', affected.changes, 'games under', directoryPath);
          }
        } catch (e) {
          log.warn('[SQL purge] remove-directory failed to purge games:', e.message);
        }
        // 清理目錄刪除後遺留的圖標快取檔案（異步）
        try {
          setImmediate(() => {
            try {
              DataStore.cleanupOrphanIcons();
            } catch (_) {}
          });
        } catch (_) {}
      }
      // 广播更新后的游戏列表
      try {
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (e) {
        log.error('[IPC] Failed to broadcast updated games:', e.message);
      }
      return { success: true };
    } catch (e) {
      log.error('[IPC] remove-directory failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  // 启用/禁用目录
  ipcMain.handle('toggle-directory', async (event, directoryPath, enabled) => {
    try {
      sqlSetDirectoryEnabled(directoryPath, enabled);
      log.info(`目录 ${directoryPath} ${enabled ? '已启用' : '已禁用'}`);
      // Immediately refresh games list with enabled-dir filter
      try {
        const games = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(games));
      } catch (e) {
        log.error('[IPC] Failed to broadcast updated games:', e.message);
      }
      return { success: true };
    } catch (e) {
      log.error('[IPC] toggle-directory failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  // 手动触发多目录扫描
  ipcMain.handle('scan-directories', async (event, forceFullScan = false) => {
    try {
      log.info(`🚀 开始${forceFullScan ? '全量' : '增量'}扫描所有目录...`);

      const result = await processMultipleDirectories(null, forceFullScan, {
        emit: (payload) => {
          try {
            broadcastToAll('scan:progress', payload);
          } catch (_) {}
        },
      });

      if (result.success) {
        // 直接從 SQL 獲取並廣播遊戲列表
        try {
          const sqlGames = getAllGamesFromSql();
          const updatedGames = addUrlToGames(sqlGames);
          broadcastToAll('games-updated', updatedGames);
          log.info(`📡 已廣播 ${updatedGames.length} 個遊戲到前端`);
        } catch (e) {
          log.error('[IPC] Failed to broadcast games after scan:', e.message);
        }
        try {
          const iso = new Date().toISOString();
          // If processMultipleDirectories returns per-dir info, we could use that.
          // For now, update all enabled directories' lastScanTime.
          const dirs = sqlGetDirectories();
          for (const d of dirs) {
            if (d.enabled) {
              try {
                sqlUpdateDirectoryScanTime(d.path, iso);
              } catch (e) {}
            }
          }
        } catch (_) {}
        return { success: true, scanResult: result };
      } else {
        return result;
      }
    } catch (error) {
      log.error('扫描目录失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 已移除單目錄相容 API：select-directory
}

module.exports = { register };
