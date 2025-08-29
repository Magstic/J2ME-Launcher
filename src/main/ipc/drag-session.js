// src/main/ipc/drag-session.js
// Cross-window drag session IPC handlers

const path = require('path');
const { addGameToFolder: sqlAddGameToFolder, removeGameFromFolder: sqlRemoveGameFromFolder } = require('../sql/folders-write');
const { getFolderById: sqlGetFolderById } = require('../sql/folders-read');
const { getDB } = require('../db');
const { batchAddGamesToFolder } = require('../utils/batch-operations');
const { getGameStateCache } = require('../utils/game-state-cache');

function register({ ipcMain, DataStore, addUrlToGames, broadcastToAll, BrowserWindow }) {
  const looksLikePath = (s) => typeof s === 'string' && (s.includes('\\') || s.includes('/') || /\.(jar|jad)$/i.test(s));
  const normalizePath = (p) => {
    if (!p || typeof p !== 'string') return p;
    const n = path.normalize(p);
    return process.platform === 'win32' ? n.replace(/\//g, '\\') : n;
  };
  const probeCanonicalPath = (normalized) => {
    try {
      const db = getDB();
      const alt = process.platform === 'win32' ? normalized.replace(/\\/g, '/') : normalized.replace(/\//g, '\\');
      const row = db.prepare('SELECT filePath FROM games WHERE filePath IN (?, ?) LIMIT 1').get(normalized, alt);
      return row?.filePath || normalized;
    } catch (_) { return normalized; }
  };
  const resolveFilePath = (gameIdOrPath) => {
    if (looksLikePath(gameIdOrPath)) return probeCanonicalPath(normalizePath(gameIdOrPath));
    try {
      const g = DataStore.getGame(gameIdOrPath);
      if (g?.filePath) return probeCanonicalPath(normalizePath(g.filePath));
    } catch {}
    return probeCanonicalPath(normalizePath(gameIdOrPath));
  };

  // Shared batch operation functions
  const createBatchOperations = () => ({
    addGameToFolder: (filePath, folderId) => {
      try { 
        sqlAddGameToFolder(folderId, resolveFilePath(filePath), {}); 
        return { success: true }; 
      } catch (e) { 
        console.warn('[SQL write] addGameToFolder failed:', e.message); 
        throw e; 
      }
    },
    addGamesToFolderBatch: async (filePaths, folderId, options = {}) => {
      try {
        for (const fp of filePaths) {
          sqlAddGameToFolder(folderId, resolveFilePath(fp), {});
        }
        return { success: true };
      } catch (e) {
        console.warn('[SQL write] addGamesToFolderBatch failed:', e.message);
        throw e;
      }
    }
  });
  // Local session state (module-scoped)
  let dragSession = {
    active: false,
    items: [], // [{ gameId, filePath }]
    source: null, // { type: 'desktop'|'folder', id: string|null }
    startedByWindowId: null,
    lastPosition: null
  };
  // Grace period timer to tolerate rapid end->drop ordering
  let endTimer = null;

  ipcMain.handle('drag-session:start', (event, payload) => {
    try {
      const { items, source } = payload || {};
      console.log('[drag-session:start]', { count: items?.length || 0, source });
      dragSession = {
        active: true,
        items: Array.isArray(items) ? items : [],
        source: source || null,
        startedByWindowId: BrowserWindow.fromWebContents(event.sender)?.id || null,
        lastPosition: null
      };
      broadcastToAll('drag-session:started', { items: dragSession.items, source: dragSession.source }, dragSession.startedByWindowId);
      return { success: true };
    } catch (err) {
      console.error('drag-session:start error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('drag-session:update', (event, position) => {
    try {
      if (!dragSession.active) return { success: false };
      dragSession.lastPosition = position || null;
      // 開發期可打開：console.log('[drag-session:update]', position);
      broadcastToAll('drag-session:updated', dragSession.lastPosition, BrowserWindow.fromWebContents(event.sender)?.id || null);
      return { success: true };
    } catch (err) {
      console.error('drag-session:update error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('drag-session:drop', async (event, target) => {
    try {
      // If an end has been scheduled, cancel it because we have a real drop
      if (endTimer) { clearTimeout(endTimer); endTimer = null; }
      if (!dragSession.active) {
        console.warn('[drag-session:drop] no-active-session', target);
        return { success: false, error: 'no-active-session' };
      }
      console.log('[drag-session:drop]', { target, items: dragSession.items?.length || 0, source: dragSession.source });
      const items = dragSession.items || [];
      const source = dragSession.source || {};
      const targetType = target?.type;
      const targetId = target?.id || null;

      const { addGameToFolder, addGamesToFolderBatch } = createBatchOperations();

      let allOk = true;
      
      // 按操作類型分組處理
      const addToFolderItems = items.filter(item => 
        source.type === 'desktop' && targetType === 'folder' && targetId && (item.gameId || item.filePath || item.id)
      );
      const moveItems = items.filter(item => 
        source.type === 'folder' && targetType === 'folder' && source.id && targetId && source.id !== targetId && (item.gameId || item.filePath || item.id)
      );
      const removeItems = items.filter(item => 
        source.type === 'folder' && targetType === 'desktop' && source.id && (item.gameId || item.filePath || item.id)
      );

      // 批次加入資料夾
      if (addToFolderItems.length > 0) {
        try {
          const filePaths = addToFolderItems.map(item => resolveFilePath(item.gameId || item.filePath || item.id));
          
          // 如果數量較多，廣播進度開始事件
          if (filePaths.length > 30) {
            broadcastToAll('bulk-operation-start', { 
              type: 'add-to-folder', 
              total: filePaths.length, 
              folderId: targetId 
            });
          }
          
          const result = await batchAddGamesToFolder(filePaths, targetId, { 
            quiet: filePaths.length <= 30,
            threshold: 30,
            chunkSize: 50,
            addGameToFolder,
            addGamesToFolderBatch
          });
          
          // 廣播進度完成事件
          if (filePaths.length > 30) {
            broadcastToAll('bulk-operation-end', { 
              type: 'add-to-folder', 
              success: result.success,
              processed: result.processed 
            });
          }
          
          if (!result.success) allOk = false;
        } catch (e) {
          console.warn('[batch] add to folder failed:', e.message);
          // 廣播錯誤事件
          broadcastToAll('bulk-operation-end', { 
            type: 'add-to-folder', 
            success: false,
            error: e.message 
          });
          allOk = false;
        }
      }

      // 批次移動（先移除再加入）
      if (moveItems.length > 0) {
        try {
          const filePaths = moveItems.map(item => resolveFilePath(item.gameId || item.filePath || item.id));
          
          // 如果數量較多，廣播進度開始事件
          if (filePaths.length > 30) {
            broadcastToAll('bulk-operation-start', { 
              type: 'move-between-folders', 
              total: filePaths.length, 
              fromFolderId: source.id,
              toFolderId: targetId 
            });
          }
          
          // 先批次移除
          for (const item of moveItems) {
            const fp = resolveFilePath(item.gameId || item.filePath || item.id);
            try { sqlRemoveGameFromFolder(source.id, fp); } 
            catch (e) { console.warn('[SQL write] move remove failed:', e.message); }
          }
          
          // 再批次加入
          const result = await batchAddGamesToFolder(filePaths, targetId, { 
            quiet: filePaths.length <= 30,
            threshold: 30,
            chunkSize: 50,
            addGameToFolder,
            addGamesToFolderBatch
          });
          
          // 廣播進度完成事件
          if (filePaths.length > 30) {
            broadcastToAll('bulk-operation-end', { 
              type: 'move-between-folders', 
              success: result.success,
              processed: result.processed 
            });
          }
          
          if (!result.success) allOk = false;
        } catch (e) {
          console.warn('[batch] move failed:', e.message);
          // 廣播錯誤事件
          if (moveItems.length > 30) {
            broadcastToAll('bulk-operation-end', { 
              type: 'move-between-folders', 
              success: false,
              error: e.message 
            });
          }
          allOk = false;
        }
      }

      // 批次移除
      if (removeItems.length > 0) {
        try {
          for (const item of removeItems) {
            const fp = resolveFilePath(item.gameId || item.filePath || item.id);
            try { sqlRemoveGameFromFolder(source.id, fp); } 
            catch (e) { console.warn('[SQL write] remove failed:', e.message); allOk = false; }
          }
        } catch (e) {
          console.warn('[batch] remove failed:', e.message);
          allOk = false;
        }
      }

      // 處理同資料夾內移動（無操作）
      const sameFolder = items.filter(item => 
        source.type === 'folder' && targetType === 'folder' && source.id === targetId
      );
      if (sameFolder.length > 0) {
        // 同資料夾內移動，視為成功
      }

      // 增量廣播：僅傳遞受影響的遊戲
      const cache = getGameStateCache();
      let affectedGames = [];
      
      // 收集所有受影響的遊戲路徑
      if (addToFolderItems.length > 0) {
        const filePaths = addToFolderItems.map(item => resolveFilePath(item.gameId || item.filePath || item.id));
        const changes = cache.updateFolderMembership(filePaths, targetId, 'add');
        affectedGames.push(...changes.updated);
      }
      
      if (moveItems.length > 0) {
        const filePaths = moveItems.map(item => resolveFilePath(item.gameId || item.filePath || item.id));
        const changes = cache.moveGamesBetweenFolders(filePaths, source.id, targetId);
        affectedGames.push(...changes.updated);
      }
      
      if (removeItems.length > 0) {
        const filePaths = removeItems.map(item => resolveFilePath(item.gameId || item.filePath || item.id));
        const changes = cache.updateFolderMembership(filePaths, source.id, 'remove');
        affectedGames.push(...changes.updated);
      }
      
      // 增量廣播變更
      if (affectedGames.length > 0) {
        broadcastToAll('games-incremental-update', {
          action: 'drag-drop-completed',
          affectedGames: [...new Set(affectedGames)], // 去重
          sourceFolder: source.id,
          targetFolder: targetId,
          operations: {
            added: addToFolderItems.length,
            moved: moveItems.length,
            removed: removeItems.length
          }
        });
      }

      // 發送資料夾變更（簡化為通用事件）
      broadcastToAll('folder-changed');

      // 若涉及到目標/來源資料夾，單獨更新
      if (source?.id) {
        try { const fromFolder = sqlGetFolderById(source.id); if (fromFolder) broadcastToAll('folder-updated', fromFolder); } catch (_) {}
      }
      if (targetType === 'folder' && targetId) {
        try { const toFolder = sqlGetFolderById(targetId); if (toFolder) broadcastToAll('folder-updated', toFolder); } catch (_) {}
      }

      // 結束會話
      dragSession = { active: false, items: [], source: null, startedByWindowId: null, lastPosition: null };
      broadcastToAll('drag-session:ended');
      if (endTimer) { clearTimeout(endTimer); endTimer = null; }

      return { success: allOk };
    } catch (err) {
      console.error('drag-session:drop error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('drag-session:end', () => {
    try {
      console.log('[drag-session:end request]');
      // If no active session, nothing to do
      if (!dragSession.active) {
        if (endTimer) { clearTimeout(endTimer); endTimer = null; }
        return { success: true, note: 'no-active' };
      }

      // Debounce/Grace: schedule a short cleanup, allow late drop to win
      if (endTimer) { clearTimeout(endTimer); endTimer = null; }
      endTimer = setTimeout(() => {
        try {
          if (!dragSession.active) { endTimer = null; return; }
          dragSession = { active: false, items: [], source: null, startedByWindowId: null, lastPosition: null };
          broadcastToAll('drag-session:ended');
        } finally {
          endTimer = null;
        }
      }, 200);
      return { success: true, deferred: true, graceMs: 200 };
    } catch (err) {
      console.error('drag-session:end error:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
