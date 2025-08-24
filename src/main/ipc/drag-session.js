// src/main/ipc/drag-session.js
// Cross-window drag session IPC handlers

const path = require('path');
const { addGameToFolder: sqlAddGameToFolder, removeGameFromFolder: sqlRemoveGameFromFolder } = require('../sql/folders-write');
const { getFolderById: sqlGetFolderById } = require('../sql/folders-read');
const { getDB } = require('../db');

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

  ipcMain.handle('drag-session:drop', (event, target) => {
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

      let allOk = true;
      for (const item of items) {
        const gameId = item.gameId || item.filePath || item.id; // 兼容不同字段
        if (!gameId) continue;
        let ok = false;
        if (source.type === 'desktop' && targetType === 'folder' && targetId) {
          // SQL: add to folder
          try { sqlAddGameToFolder(targetId, resolveFilePath(gameId), {}); ok = true; } catch (e) { console.warn('[SQL write] drag addGameToFolder failed:', e.message); ok = false; }
        } else if (source.type === 'folder' && targetType === 'folder' && source.id && targetId) {
          if (source.id === targetId) { ok = true; }
          else {
            // SQL move: remove from old, add to new
            const fp = resolveFilePath(gameId);
            try { sqlRemoveGameFromFolder(source.id, fp); } catch (e) { console.warn('[SQL write] drag move remove failed:', e.message); }
            try { sqlAddGameToFolder(targetId, fp, {}); ok = true; } catch (e) { console.warn('[SQL write] drag move add failed:', e.message); ok = false; }
          }
        } else if (source.type === 'folder' && targetType === 'desktop' && source.id) {
          // SQL: remove from folder
          try { sqlRemoveGameFromFolder(source.id, resolveFilePath(gameId)); ok = true; } catch (e) { console.warn('[SQL write] drag removeGameFromFolder failed:', e.message); ok = false; }
        } else {
          // 不支持的目標類型
          ok = false;
        }
        allOk = allOk && !!ok;
      }

      // 廣播數據變更（優先 SQL）
      try {
        let sqlGames = null;
        try { sqlGames = require('../sql/read').getAllGamesFromSql(); } catch (_) {}
        if (sqlGames) {
          broadcastToAll('games-updated', addUrlToGames(sqlGames));
        } else {
          const games = DataStore.getAllGames ? DataStore.getAllGames() : [];
          broadcastToAll('games-updated', addUrlToGames(games || []));
        }
      } catch (_) {}

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
