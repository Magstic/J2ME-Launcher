// src/main/ipc/clusters.js
// IPC for cluster CRUD and queries. Keep it small and explicit.

const path = require('path');
const { getDB } = require('../db');
const {
  createCluster: sqlCreateCluster,
  addGamesToCluster: sqlAddGamesToCluster,
  removeGameFromCluster: sqlRemoveGameFromCluster,
  updateCluster: sqlUpdateCluster,
  deleteCluster: sqlDeleteCluster,
  addClusterToFolder: sqlAddClusterToFolder,
  removeClusterFromFolder: sqlRemoveClusterFromFolder,
  updateClusterMemberTags: sqlUpdateClusterMemberTags,
  setClusterPrimary: sqlSetClusterPrimary,
  mergeClusters: sqlMergeClusters,
  cleanupOrphanClusters: sqlCleanupOrphanClusters,
} = require('../sql/clusters-write');
const {
  getCluster: sqlGetCluster,
  getClusterMembers: sqlGetClusterMembers,
  getDesktopClusters: sqlGetDesktopClusters,
  getClustersByFolder: sqlGetClustersByFolder,
} = require('../sql/clusters-read');
const { addGamesToFolderBatch } = require('../sql/folders-write');
const { getFolderById } = require('../sql/folders-read');

function normalizePathInput(p) {
  if (!p || typeof p !== 'string') return p;
  const n = path.normalize(p);
  return process.platform === 'win32' ? n.replace(/\//g, '\\') : n;
}

function register({ ipcMain, DataStore, addUrlToGames, toIconUrl, broadcastToAll }) {
  const looksLikePath = (s) =>
    typeof s === 'string' && (s.includes('\\') || s.includes('/') || /\.(jar|jad)$/i.test(s));
  const resolveFilePath = (gameIdOrPath) => {
    if (looksLikePath(gameIdOrPath)) {
      const normalized = normalizePathInput(gameIdOrPath);
      try {
        const db = getDB();
        const alt =
          process.platform === 'win32'
            ? normalized.replace(/\\/g, '/')
            : normalized.replace(/\//g, '\\');
        const row = db
          .prepare('SELECT filePath FROM games WHERE filePath IN (?, ?) LIMIT 1')
          .get(normalized, alt);
        if (row && row.filePath) return row.filePath;
      } catch (_) {}
      return normalized;
    }
    try {
      const g = DataStore.getGame(gameIdOrPath);
      if (g && g.filePath) return normalizePathInput(g.filePath);
    } catch (_) {}
    return normalizePathInput(gameIdOrPath);
  };

  const resolveManyFilePaths = (inputs) => {
    if (!Array.isArray(inputs) || inputs.length === 0) return [];
    const arr = inputs.map(resolveFilePath).filter(Boolean);
    // De-dup to reduce redundant INSERTs
    return Array.from(new Set(arr));
  };

  // =============== CRUD ===============
  ipcMain.handle('clusters:create', (event, payload) => {
    try {
      const clean = { ...payload };
      clean.filePaths = resolveManyFilePaths(clean.filePaths || []);
      if (clean.primaryFilePath) clean.primaryFilePath = resolveFilePath(clean.primaryFilePath);
      const res = sqlCreateCluster(clean);
      broadcastToAll('cluster:changed', { id: res.clusterId, action: 'created' });
      return res;
    } catch (error) {
      const msg = String(error && error.message ? error.message : error);
      const unique = msg.startsWith('E_UNIQUE_MEMBER: ');
      return {
        success: false,
        error: unique ? 'E_UNIQUE_MEMBER' : 'E_CREATE_FAILED',
        detail: unique ? msg.slice('E_UNIQUE_MEMBER: '.length) : msg,
      };
    }
  });

  // =============== Merge ===============
  ipcMain.handle('clusters:merge', (event, fromId, toId) => {
    try {
      const res = sqlMergeClusters(fromId, toId);
      try {
        // Notify target cluster updated (members/folders merged)
        broadcastToAll('cluster:changed', { id: toId, action: 'merged', fromId });
      } catch (_) {}
      try {
        // Source cluster removed
        broadcastToAll('cluster:deleted', { id: fromId, action: 'merged-into', toId });
      } catch (_) {}
      // Merge may change folder badge counts; refresh all folders containing the target cluster
      try {
        const db = getDB();
        const rows = db
          .prepare(`SELECT folderId FROM folder_clusters WHERE clusterId = ?`)
          .all(toId);
        const folderIds = rows.map((r) => r.folderId);
        if (folderIds.length > 0) {
          const { getFolderById } = require('../sql/folders-read');
          for (const fid of folderIds) {
            try {
              const f = getFolderById(fid);
              if (f) broadcastToAll('folder-updated', f);
            } catch (_) {}
          }
        }
      } catch (_) {}
      return res;
    } catch (error) {
      const msg = String(error && error.message ? error.message : error);
      return { success: false, error: 'E_MERGE_FAILED', detail: msg };
    }
  });

  // =============== Member operations ===============
  ipcMain.handle('clusters:update-member-tags', (event, clusterId, filePath, tags) => {
    try {
      const fp = resolveFilePath(filePath);
      const res = sqlUpdateClusterMemberTags(clusterId, fp, tags);
      // 帶上精確變更資訊，利於渲染進行增量更新而非全量重載
      broadcastToAll('cluster:changed', {
        id: clusterId,
        action: 'members-updated',
        filePath: fp,
        tags,
      });
      return res;
    } catch (error) {
      return { success: false, error: String(error && error.message ? error.message : error) };
    }
  });

  ipcMain.handle('clusters:set-primary', (event, clusterId, filePath) => {
    try {
      const fp = resolveFilePath(filePath);
      const res = sqlSetClusterPrimary(clusterId, fp);
      broadcastToAll('cluster:changed', { id: clusterId, action: 'updated' });
      return res;
    } catch (error) {
      const msg = String(error && error.message ? error.message : error);
      if (msg === 'E_PRIMARY_NOT_MEMBER') return { success: false, error: 'E_PRIMARY_NOT_MEMBER' };
      return { success: false, error: 'E_SET_PRIMARY_FAILED', detail: msg };
    }
  });

  ipcMain.handle('clusters:add-games', (event, clusterId, filePaths) => {
    try {
      const fps = resolveManyFilePaths(filePaths || []);
      const res = sqlAddGamesToCluster(clusterId, fps);
      broadcastToAll('cluster:changed', {
        id: clusterId,
        action: 'members-updated',
        added: res.added,
      });
      // 若該簇屬於某些資料夾，則這些資料夾的遊戲數需包含簇成員，廣播更新以刷新角標
      try {
        const db = getDB();
        const rows = db
          .prepare(`SELECT folderId FROM folder_clusters WHERE clusterId = ?`)
          .all(clusterId);
        const folderIds = rows.map((r) => r.folderId);
        if (folderIds.length > 0) {
          const { getFolderById } = require('../sql/folders-read');
          for (const fid of folderIds) {
            try {
              const f = getFolderById(fid);
              if (f) broadcastToAll('folder-updated', f);
            } catch (_) {}
          }
        }
      } catch (_) {}
      return res;
    } catch (error) {
      const msg = String(error && error.message ? error.message : error);
      const unique = msg.startsWith('E_UNIQUE_MEMBER: ');
      return {
        success: false,
        error: unique ? 'E_UNIQUE_MEMBER' : 'E_ADD_FAILED',
        detail: unique ? msg.slice('E_UNIQUE_MEMBER: '.length) : msg,
      };
    }
  });

  ipcMain.handle('clusters:remove-game', (event, clusterId, filePath) => {
    try {
      const fp = resolveFilePath(filePath);
      const res = sqlRemoveGameFromCluster(clusterId, fp);
      broadcastToAll('cluster:changed', {
        id: clusterId,
        action: 'members-updated',
        removed: res.removed,
      });
      // 同步刷新包含該簇的所有資料夾的角標
      try {
        const db = getDB();
        const rows = db
          .prepare(`SELECT folderId FROM folder_clusters WHERE clusterId = ?`)
          .all(clusterId);
        const folderIds = rows.map((r) => r.folderId);
        if (folderIds.length > 0) {
          const { getFolderById } = require('../sql/folders-read');
          for (const fid of folderIds) {
            try {
              const f = getFolderById(fid);
              if (f) broadcastToAll('folder-updated', f);
            } catch (_) {}
          }
        }
      } catch (_) {}
      return res;
    } catch (error) {
      return { success: false, error: String(error && error.message ? error.message : error) };
    }
  });

  ipcMain.handle('clusters:update', (event, payload) => {
    try {
      const clean = { ...payload };
      if (clean.primaryFilePath !== undefined && clean.primaryFilePath !== null) {
        clean.primaryFilePath = resolveFilePath(clean.primaryFilePath);
      }
      const res = sqlUpdateCluster(clean);
      broadcastToAll('cluster:changed', { id: payload.id, action: 'updated' });
      return res;
    } catch (error) {
      const msg = String(error && error.message ? error.message : error);
      if (msg === 'E_PRIMARY_NOT_MEMBER') return { success: false, error: 'E_PRIMARY_NOT_MEMBER' };
      return { success: false, error: 'E_UPDATE_FAILED', detail: msg };
    }
  });

  ipcMain.handle('clusters:delete', (event, id) => {
    try {
      const db = getDB();
      // 找到該簇所在的資料夾（可能為 0..n 個）
      const folderRows = db
        .prepare(`SELECT folderId FROM folder_clusters WHERE clusterId = ?`)
        .all(id);
      const folderIds = folderRows.map((r) => r.folderId);

      // 取出所有成員（用於釋放）
      const members = sqlGetClusterMembers(id) || [];
      const memberPaths = members.map((m) => m.filePath);

      // 將成員釋放到各所在資料夾
      if (folderIds.length > 0 && memberPaths.length > 0) {
        try {
          for (const fid of folderIds) {
            addGamesToFolderBatch(fid, memberPaths, {});
            try {
              const f = getFolderById(fid);
              if (f) broadcastToAll('folder-updated', f);
            } catch (_) {}
          }
        } catch (e) {
          try {
            console.warn('[clusters:delete] release to folders failed:', e?.message || e);
          } catch (_) {}
        }
      }

      // 刪除簇（ON DELETE CASCADE 清理關聯）
      const res = sqlDeleteCluster(id);

      // 廣播：簇刪除 + 可能影響的清單刷新
      try {
        const { getAllGamesFromSql } = require('../sql/read');
        const sqlGames = getAllGamesFromSql();
        broadcastToAll('games-updated', addUrlToGames(sqlGames));
      } catch (_) {}
      broadcastToAll('cluster:deleted', { id });
      try {
        broadcastToAll('folder-changed');
      } catch (_) {}
      return res;
    } catch (error) {
      return { success: false, error: String(error && error.message ? error.message : error) };
    }
  });

  // =============== Folder relations ===============
  ipcMain.handle('clusters:add-to-folder', (event, clusterId, folderId) => {
    try {
      const r = sqlAddClusterToFolder(folderId, clusterId);
      try {
        const { getFolderById } = require('../sql/folders-read');
        const f = getFolderById(folderId);
        if (f) broadcastToAll('folder-updated', f);
      } catch (_) {}
      broadcastToAll('cluster:changed', { id: clusterId, action: 'linked-folder', folderId });
      return r;
    } catch (error) {
      return { success: false, error: String(error && error.message ? error.message : error) };
    }
  });

  ipcMain.handle('clusters:remove-from-folder', (event, clusterId, folderId) => {
    try {
      const r = sqlRemoveClusterFromFolder(folderId, clusterId);
      try {
        const f = getFolderById(folderId);
        if (f) broadcastToAll('folder-updated', f);
      } catch (_) {}
      // 通知資料夾內容可能變更（簇已移除）
      try {
        broadcastToAll('folder-changed');
      } catch (_) {}
      broadcastToAll('cluster:changed', { id: clusterId, action: 'unlinked-folder', folderId });
      return r;
    } catch (error) {
      return { success: false, error: String(error && error.message ? error.message : error) };
    }
  });

  // =============== Read ===============
  ipcMain.handle('clusters:get', (event, id) => {
    try {
      const c = sqlGetCluster(id);
      if (!c) return { cluster: null };
      const iconUrl = toIconUrl(c.effectiveIconPath || null);
      return { cluster: { ...c, iconUrl } };
    } catch (error) {
      return { cluster: null };
    }
  });

  ipcMain.handle('clusters:get-members', (event, id) => {
    try {
      const rows = sqlGetClusterMembers(id);
      return { members: addUrlToGames(rows) };
    } catch (error) {
      return { members: [] };
    }
  });

  ipcMain.handle('clusters:get-desktop', () => {
    try {
      const cs = sqlGetDesktopClusters();
      const mapped = cs.map((c) => ({ ...c, iconUrl: toIconUrl(c.effectiveIconPath || null) }));
      return { clusters: mapped };
    } catch (error) {
      return { clusters: [] };
    }
  });

  ipcMain.handle('clusters:get-by-folder', (event, folderId) => {
    try {
      const cs = sqlGetClustersByFolder(folderId);
      const mapped = cs.map((c) => ({ ...c, iconUrl: toIconUrl(c.effectiveIconPath || null) }));
      return { clusters: mapped };
    } catch (error) {
      return { clusters: [] };
    }
  });

  // =============== Maintenance ===============
  ipcMain.handle('clusters:cleanup-orphans', () => {
    try {
      const res = sqlCleanupOrphanClusters();
      try {
        broadcastToAll('cluster:changed', { action: 'cleanup-orphans', deleted: res.deleted });
      } catch (_) {}
      return res;
    } catch (error) {
      return { success: false, error: String(error && error.message ? error.message : error) };
    }
  });
}

module.exports = { register };
