// src/main/ipc/drag-session.js
// Cross-window drag session IPC handlers

const path = require('path');
const { addGameToFolder: sqlAddGameToFolder, removeGameFromFolder: sqlRemoveGameFromFolder } = require('../sql/folders-write');
const { getFolderById: sqlGetFolderById, getFolderGameCount: sqlGetFolderGameCount } = require('../sql/folders-read');
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

  // Debug helper: check if a file path is under any enabled directory
  const isUnderEnabledDirectory = (filePath) => {
    try {
      const db = getDB();
      const row = db.prepare(`
        SELECT 1 AS ok
        FROM directories d
        WHERE d.enabled = 1 AND ? LIKE (d.path || '%')
        LIMIT 1
      `).get(filePath);
      return !!(row && row.ok === 1);
    } catch (e) {
      try { console.log('[drag-session][debug] enabled-dir check error:', e && e.message); } catch (_) {}
      return null;
    }
  };
  const probeCanonicalPath = (normalized) => {
    try {
      const db = getDB();
      const alt = process.platform === 'win32' ? normalized.replace(/\\/g, '/') : normalized.replace(/\//g, '\\');
      const row = db.prepare('SELECT filePath FROM games WHERE filePath IN (?, ?) LIMIT 1').get(normalized, alt);
      if (row && row.filePath) {
        try { console.log('[drag-session][canon] hit canonical filePath from DB:', row.filePath); } catch {}
        return row.filePath;
      }
      try { console.log('[drag-session][canon] miss, fallback normalized:', normalized, 'alt:', alt); } catch {}
      return normalized;
    } catch (e) { try { console.log('[drag-session][canon] error:', e && e.message); } catch (_) {} return normalized; }
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
    lastPosition: null,
    token: 0 // increments per start to guard against stale end timers
  };
  // Grace period timer to tolerate rapid end->drop ordering
  let endTimer = null;
  let sessionSeq = 0; // monotonic counter
  // Keep a recent snapshot to tolerate rare races
  let lastSessionSnapshot = { items: [], source: null, token: 0, startedAt: 0, endedAt: 0 };

  ipcMain.handle('drag-session:start', (event, payload) => {
    try {
      const { items, source } = payload || {};
      console.log('[drag-session:start]', { count: items?.length || 0, source });
      // Cancel any pending end timer from previous session to avoid stale cleanup killing the new session
      if (endTimer) { try { clearTimeout(endTimer); } catch (_) {} endTimer = null; }
      const newToken = ++sessionSeq;
      dragSession = {
        active: true,
        items: Array.isArray(items) ? items : [],
        source: source || null,
        startedByWindowId: BrowserWindow.fromWebContents(event.sender)?.id || null,
        lastPosition: null,
        token: newToken
      };
      try {
        lastSessionSnapshot = {
          items: [...dragSession.items],
          source: dragSession.source ? { ...dragSession.source } : null,
          token: dragSession.token,
          startedAt: Date.now(),
          endedAt: 0
        };
      } catch (_) {}
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
        // Tolerate a short race: start may still be in-flight
        try { console.log('[drag-session:drop] not active, waiting briefly for start...'); } catch {}
        const until = Date.now() + 200;
        while (!dragSession.active && Date.now() < until) {
          await new Promise(r => setTimeout(r, 20));
        }
        if (!dragSession.active) {
          // As a last resort, tolerate a very recent end by using the last snapshot
          const internalOnly = !!(target && target.internal === true);
          if (!internalOnly) {
            console.warn('[drag-session:drop] no-active-session and target not internal; refusing snapshot fallback');
            return { success: false, error: 'no-active-session' };
          }
          const now = Date.now();
          const snapshotAge = Math.min(
            lastSessionSnapshot.endedAt ? (now - lastSessionSnapshot.endedAt) : Infinity,
            lastSessionSnapshot.startedAt ? (now - lastSessionSnapshot.startedAt) : Infinity
          );
          const canFallback = Array.isArray(lastSessionSnapshot.items) && lastSessionSnapshot.items.length > 0 && snapshotAge <= 2000;
          if (!canFallback) {
            console.warn('[drag-session:drop] no-active-session', target);
            return { success: false, error: 'no-active-session' };
          }
          try { console.log('[drag-session:drop] using lastSessionSnapshot fallback; age(ms)=', snapshotAge, 'items=', lastSessionSnapshot.items.length, 'source=', lastSessionSnapshot.source); } catch {}
          // Synthesize a pseudo-active session from snapshot for this drop
          dragSession = {
            active: false,
            items: [...lastSessionSnapshot.items],
            source: lastSessionSnapshot.source ? { ...lastSessionSnapshot.source } : null,
            startedByWindowId: dragSession.startedByWindowId,
            lastPosition: dragSession.lastPosition,
            token: lastSessionSnapshot.token
          };
        }
      }
      console.log('[drag-session:drop] begin', { target, items: dragSession.items?.length || 0, source: dragSession.source });
      const items = dragSession.items || [];
      const source = dragSession.source || {};
      const targetType = target?.type;
      const targetId = target?.id || null;

      const { addGameToFolder, addGamesToFolderBatch } = createBatchOperations();

      let allOk = true;
      try { console.log('[drag-session:drop] group start'); } catch {}
      
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
      try { console.log('[drag-session:drop] groups:', { add: addToFolderItems.length, move: moveItems.length, remove: removeItems.length }); } catch {}

      // 批次加入資料夾
      if (addToFolderItems.length > 0) {
        try {
          const filePaths = addToFolderItems.map(item => resolveFilePath(item.gameId || item.filePath || item.id));
          try {
            const checks = filePaths.slice(0, 10).map(fp => ({ fp, enabledDir: isUnderEnabledDirectory(fp) }));
            console.log('[drag-session:drop] add->filePaths sample (first10):', checks);
          } catch {}
          
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
          try { console.log('[drag-session:drop] add result:', result); } catch {}
          
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
        try { console.log('[drag-session:drop] same-folder no-op count:', sameFolder.length); } catch {}
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
        try { console.log('[drag-session:drop] incremental-update sent:', { affected: affectedGames.length, source: source.id, target: targetId }); } catch {}
      }

      // 發送資料夾變更（簡化為通用事件）
      broadcastToAll('folder-changed');

      // 若涉及到目標/來源資料夾，單獨更新
      if (source?.id) {
        try {
          const fromFolder = sqlGetFolderById(source.id);
          if (fromFolder) {
            const rawDb = getDB();
            const rawCnt = rawDb.prepare(`SELECT COUNT(1) as c FROM folder_games WHERE folderId=?`).get(source.id)?.c || 0;
            const visCnt = sqlGetFolderGameCount(source.id);
            console.log('[drag-session:drop] source folder counts:', { id: source.id, raw: rawCnt, visible: visCnt });
            broadcastToAll('folder-updated', fromFolder);
          }
        } catch (_) {}
      }
      if (targetType === 'folder' && targetId) {
        try {
          const toFolder = sqlGetFolderById(targetId);
          if (toFolder) {
            const rawDb = getDB();
            const rawCnt = rawDb.prepare(`SELECT COUNT(1) as c FROM folder_games WHERE folderId=?`).get(targetId)?.c || 0;
            const visCnt = sqlGetFolderGameCount(targetId);
            console.log('[drag-session:drop] target folder counts:', { id: targetId, raw: rawCnt, visible: visCnt });
            broadcastToAll('folder-updated', toFolder);
          }
        } catch (_) {}
      }

      // 結束會話
      try {
        lastSessionSnapshot = {
          items: [...(dragSession.items || [])],
          source: dragSession.source ? { ...dragSession.source } : null,
          token: dragSession.token,
          startedAt: lastSessionSnapshot.startedAt || Date.now(),
          endedAt: Date.now()
        };
      } catch (_) {}
      dragSession = { active: false, items: [], source: null, startedByWindowId: null, lastPosition: null, token: dragSession.token };
      broadcastToAll('drag-session:ended');
      if (endTimer) { clearTimeout(endTimer); endTimer = null; }

      try { console.log('[drag-session:drop] done, success=', allOk); } catch {}
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
      const scheduledToken = dragSession.token;
      endTimer = setTimeout(() => {
        try {
          // Only end if session is still the same one that scheduled this timer
          if (!dragSession.active) { endTimer = null; return; }
          if (dragSession.token !== scheduledToken) {
            try { console.log('[drag-session:end] skip stale end timer; currentToken=', dragSession.token, 'scheduledToken=', scheduledToken); } catch {}
            endTimer = null; return;
          }
          dragSession = { active: false, items: [], source: null, startedByWindowId: null, lastPosition: null, token: dragSession.token };
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
