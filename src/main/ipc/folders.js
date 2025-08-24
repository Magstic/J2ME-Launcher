// src/main/ipc/folders.js
// Centralizes folder management IPC handlers.
const {
  getFolders: sqlGetFolders,
  getFolderById: sqlGetFolderById,
  getGamesByFolder: sqlGetGamesByFolder,
  getUncategorizedGames: sqlGetUncategorizedGames,
  getGamesInAnyFolder: sqlGetGamesInAnyFolder
} = require('../sql/folders-read');
const {
  upsertFolder: sqlUpsertFolder,
  deleteFolder: sqlDeleteFolder,
  addGameToFolder: sqlAddGameToFolder,
  addGamesToFolderBatch: sqlAddGamesToFolderBatch,
  removeGameFromFolder: sqlRemoveGameFromFolder
} = require('../sql/folders-write');
const { getDB } = require('../db');
const { randomUUID } = require('crypto');

function register({ ipcMain, DataStore, addUrlToGames, broadcastToAll }) {
  const path = require('path');
  const pathSep = process.platform === 'win32' ? '\\' : '/';
  const looksLikePath = (s) => typeof s === 'string' && (s.includes('\\') || s.includes('/') || /\.(jar|jad)$/i.test(s));
  const normalizePath = (p) => {
    if (!p || typeof p !== 'string') return p;
    const n = path.normalize(p);
    // Ensure Windows uses backslashes consistently
    return process.platform === 'win32' ? n.replace(/\//g, '\\') : n;
  };

  // 針對多個輸入一次性規範並探測資料庫中的正規 filePath，避免逐項查詢
  const resolveManyFilePaths = (inputs) => {
    if (!Array.isArray(inputs) || inputs.length === 0) return [];
    // 預處理：對每個輸入產生 normalized 與 alt 兩個候選，並保存索引映射
    const perItem = inputs.map((val) => {
      let candidate = null;
      if (looksLikePath(val)) {
        candidate = normalizePath(val);
      } else {
        try {
          const g = DataStore.getGame(val);
          if (g && g.filePath) candidate = normalizePath(g.filePath);
          else candidate = normalizePath(val);
        } catch {
          candidate = normalizePath(val);
        }
      }
      const alt = process.platform === 'win32' ? candidate.replace(/\\/g, '/') : candidate.replace(/\//g, '\\');
      return { normalized: candidate, alt };
    });
    // 構建唯一候選集合
    const allCandidates = new Set();
    perItem.forEach(({ normalized, alt }) => { allCandidates.add(normalized); allCandidates.add(alt); });
    // 單次查詢資料庫：哪些候選實際存在於 games.filePath 中
    let existing = new Set();
    try {
      const db = getDB();
      const arr = Array.from(allCandidates);
      if (arr.length > 0) {
        // 動態 placeholders
        const placeholders = arr.map(() => '?').join(',');
        const rows = db.prepare(`SELECT filePath FROM games WHERE filePath IN (${placeholders})`).all(...arr);
        existing = new Set(rows.map(r => r.filePath));
      }
    } catch (_) {}
    // 根據存在性決定每個結果：優先 normalized，再退回 alt，最後 normalized
    return perItem.map(({ normalized, alt }) => existing.has(normalized) ? normalized : (existing.has(alt) ? alt : normalized));
  };
  const resolveFilePath = (gameIdOrPath) => {
    // If it's a path-like string, normalize and return
    if (looksLikePath(gameIdOrPath)) {
      const normalized = normalizePath(gameIdOrPath);
      // Probe DB to find canonical stored path (handles slash/backslash mismatch)
      try {
        const db = getDB();
        const alt = process.platform === 'win32' ? normalized.replace(/\\/g, '/') : normalized.replace(/\//g, '\\');
        const row = db.prepare('SELECT filePath FROM games WHERE filePath IN (?, ?) LIMIT 1').get(normalized, alt);
        if (row && row.filePath) return row.filePath;
      } catch (_) {}
      return normalized;
    }
    // Try JSON DataStore to map id -> filePath (compat only; no folder persistence)
    try {
      const g = DataStore.getGame(gameIdOrPath);
      if (g && g.filePath) {
        const normalized = normalizePath(g.filePath);
        try {
          const db = getDB();
          const alt = process.platform === 'win32' ? normalized.replace(/\\/g, '/') : normalized.replace(/\//g, '\\');
          const row = db.prepare('SELECT filePath FROM games WHERE filePath IN (?, ?) LIMIT 1').get(normalized, alt);
          if (row && row.filePath) return row.filePath;
        } catch (_) {}
        return normalized;
      }
    } catch {}
    // As a last resort, assume it's already the path
    return normalizePath(gameIdOrPath);
  };
  // ==================== 資料夾管理 IPC 處理器 ====================

  // 獲取所有資料夾
  ipcMain.handle('get-folders', () => {
    return sqlGetFolders();
  });

  // 批次將遊戲加入資料夾（僅批末一次廣播）
  ipcMain.handle('add-games-to-folder-batch', (event, gameIdsOrPaths, folderId, options) => {
    try {
      const arr = Array.isArray(gameIdsOrPaths) ? gameIdsOrPaths : [];
      if (!folderId || arr.length === 0) return { success: true, note: 'empty' };
      const filePaths = resolveManyFilePaths(arr);
      sqlAddGamesToFolderBatch(folderId, filePaths, {});
      // 廣播控制：若非 quiet，才進行一次廣播
      if (!options?.quiet) {
        try { const updatedFolder = sqlGetFolderById(folderId); if (updatedFolder) broadcastToAll('folder-updated', updatedFolder); } catch (_) {}
        try {
          const { getAllGamesFromSql } = require('../sql/read');
          const sqlGames = getAllGamesFromSql();
          broadcastToAll('games-updated', addUrlToGames(sqlGames));
        } catch (_) {}
        broadcastToAll('folder-changed');
      }
      return { success: true, count: filePaths.length };
    } catch (error) {
      console.error('批次添加遊戲到資料夾失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 僅廣播：在多個 quiet 批次後集中刷新 UI
  ipcMain.handle('emit-folder-batch-updates', (event, folderId) => {
    try {
      if (folderId) {
        try { const updatedFolder = sqlGetFolderById(folderId); if (updatedFolder) broadcastToAll('folder-updated', updatedFolder); } catch (_) {}
      }
      try {
        const { getAllGamesFromSql } = require('../sql/read');
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (_) {}
      broadcastToAll('folder-changed');
      return { success: true };
    } catch (error) {
      console.error('emit-folder-batch-updates 失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 獲取單個資料夾信息
  ipcMain.handle('get-folder-by-id', (event, folderId) => {
    return sqlGetFolderById(folderId);
  });

  // 創建資料夾
  ipcMain.handle('create-folder', (event, folderData) => {
    try {
      const { name, description, icon, color } = folderData || {};
      const now = new Date().toISOString();
      const folder = {
        id: randomUUID(),
        name: name || '',
        description: description || '',
        icon: icon || null,
        color: color || null,
        gameCount: 0,
        createdAt: now,
        updatedAt: now,
        sortOrder: null,
        isVisible: 1,
      };
      sqlUpsertFolder(folder);
      broadcastToAll('folder-updated', folder);
      return { success: true, folder };
    } catch (error) {
      console.error('創建資料夾失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 更新資料夾
  ipcMain.handle('update-folder', (event, folderId, updates) => {
    try {
      const current = sqlGetFolderById(folderId);
      if (!current) return { success: false, error: 'folder-not-found' };
      const updatedFolder = { ...current, ...updates, updatedAt: new Date().toISOString() };
      sqlUpsertFolder(updatedFolder);
      broadcastToAll('folder-updated', updatedFolder);
      return { success: true };
    } catch (error) {
      console.error('更新資料夾失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 刪除資料夾
  ipcMain.handle('delete-folder', (event, folderId, moveGamesToUncategorized) => {
    try {
      sqlDeleteFolder(folderId);
      broadcastToAll('folder-deleted', folderId);
      // 刪除後更新遊戲列表（SQL）
      try {
        const { getAllGamesFromSql } = require('../sql/read');
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (_) {}
      return { success: true };
    } catch (error) {
      console.error('刪除資料夾失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // ==================== 遊戲資料夾關係 IPC ====================

  // 聚合：獲取資料夾內容（資料夾信息 + 其內遊戲，含 iconUrl）
  ipcMain.handle('get-folder-contents', (event, folderId) => {
    try {
      const folder = sqlGetFolderById(folderId);
      if (!folder) return { folder: null, games: [] };
      const games = sqlGetGamesByFolder(folderId);
      const gamesWithUrl = addUrlToGames(games);
      return { folder, games: gamesWithUrl };
    } catch (error) {
      console.error('獲取資料夾內容失敗:', error);
      return { folder: null, games: [] };
    }
  });

  // 將遊戲加入資料夾
  ipcMain.handle('add-game-to-folder', (event, gameId, folderId) => {
    try {
      const filePath = resolveFilePath(gameId);
      sqlAddGameToFolder(folderId, filePath);
      broadcastToAll('game-folder-changed', { gameId, folderId, action: 'add' });
      try { const updatedFolder = sqlGetFolderById(folderId); if (updatedFolder) broadcastToAll('folder-updated', updatedFolder); } catch (_) {}
      // Also broadcast latest games so desktop reflects uncategorized list changes immediately
      try {
        const { getAllGamesFromSql } = require('../sql/read');
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (_) {}
      return { success: true };
    } catch (error) {
      console.error('添加遊戲到資料夾失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 從資料夾中移除遊戲
  ipcMain.handle('remove-game-from-folder', (event, gameId, folderId) => {
    try {
      const filePath = resolveFilePath(gameId);
      sqlRemoveGameFromFolder(folderId, filePath);
      broadcastToAll('game-folder-changed', { gameId, folderId, action: 'remove' });
      try { const updatedFolder = sqlGetFolderById(folderId); if (updatedFolder) broadcastToAll('folder-updated', updatedFolder); } catch (_) {}
      // Broadcast latest games so desktop updates immediately (game returns to uncategorized)
      try {
        const { getAllGamesFromSql } = require('../sql/read');
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (_) {}
      return { success: true };
    } catch (error) {
      console.error('從資料夾移除遊戲失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 在資料夾間移動遊戲
  ipcMain.handle('move-game-between-folders', (event, gameId, fromFolderId, toFolderId) => {
    try {
      const filePath = resolveFilePath(gameId);
      // SQL move: remove then add
      try { sqlRemoveGameFromFolder(fromFolderId, filePath); } catch (e) { console.warn('[SQL write] move remove failed:', e.message); }
      try { sqlAddGameToFolder(toFolderId, filePath); } catch (e) { console.warn('[SQL write] move add failed:', e.message); }
      broadcastToAll('game-folder-changed', { gameId, fromFolderId, toFolderId, action: 'move' });
      try {
        const fromFolder = sqlGetFolderById(fromFolderId);
        if (fromFolder) broadcastToAll('folder-updated', fromFolder);
        const toFolder = sqlGetFolderById(toFolderId);
        if (toFolder) broadcastToAll('folder-updated', toFolder);
      } catch (_) {}
      // Keep desktop games list in sync after move as well
      try {
        const { getAllGamesFromSql } = require('../sql/read');
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (_) {}
      return { success: true };
    } catch (error) {
      console.error('移動遊戲失敗:', error);
      return { success: false, error: error.message };
    }
  });

  // 獲取資料夾中的遊戲
  ipcMain.handle('get-games-by-folder', (event, folderId) => {
    try {
      const games = sqlGetGamesByFolder(folderId);
      return addUrlToGames(games);
    } catch (error) {
      console.error('獲取資料夾遊戲失敗:', error);
      return [];
    }
  });

  // 獲取未分類遊戲
  ipcMain.handle('get-uncategorized-games', () => {
    try {
      const games = sqlGetUncategorizedGames();
      return addUrlToGames(games);
    } catch (error) {
      console.error('獲取未分類遊戲失敗:', error);
      return [];
    }
  });

  // 列出屬於任一資料夾的遊戲 filePath（以便渲染徽章）
  ipcMain.handle('get-games-in-any-folder', () => {
    try {
      return sqlGetGamesInAnyFolder();
    } catch (error) {
      console.error('獲取資料夾成員列表失敗:', error);
      return [];
    }
  });
}

module.exports = { register };
