// src/main/sql/clusters-read.js
// Read helpers for clusters and their members.
// Linus-style: small, explicit queries; rely on proper indexes.

const { getDB } = require('../db');
const { rowToGame } = require('./read');

function getCluster(id) {
  const db = getDB();
  const c = db.prepare(`
    SELECT id, name, description, icon, primaryFilePath, createdAt, updatedAt
    FROM clusters WHERE id=?
  `).get(id);
  if (!c) return null;

  const countRow = db.prepare(`
    SELECT COUNT(1) AS c
    FROM cluster_games cg
    JOIN games g ON g.filePath = cg.filePath COLLATE NOCASE
    WHERE cg.clusterId = ?
      AND EXISTS (
        SELECT 1 FROM directories d
        WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
      )
  `).get(id);

  let primaryIconPath = null;
  if (c.primaryFilePath) {
    const pr = db.prepare(`SELECT iconPath FROM games WHERE filePath = ? COLLATE NOCASE`).get(c.primaryFilePath);
    primaryIconPath = pr ? (pr.iconPath || null) : null;
  }

  return {
    ...c,
    memberCount: (countRow && countRow.c) || 0,
    effectiveIconPath: c.icon || primaryIconPath || null,
  };
}

function getClusterMembers(clusterId) {
  const db = getDB();
  const rows = db.prepare(`
    SELECT g.*, cg.tags, cg.role
    FROM cluster_games cg
    JOIN games g ON g.filePath = cg.filePath COLLATE NOCASE
    WHERE cg.clusterId = ?
      AND EXISTS (
        SELECT 1 FROM directories d
        WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
      )
    ORDER BY g.gameName
  `).all(clusterId);

  return rows.map((r) => {
    const base = rowToGame(r);
    let tags = null;
    try { tags = r.tags ? JSON.parse(r.tags) : null; } catch (_) { tags = null; }
    return { ...base, tags, role: r.role || null };
  });
}

function getDesktopClusters() {
  const db = getDB();
  const cs = db.prepare(`
    SELECT 
      c.id, c.name, c.description, c.icon, c.primaryFilePath, c.createdAt, c.updatedAt,
      (
        SELECT COUNT(1) FROM cluster_games cg
        JOIN games g ON g.filePath = cg.filePath COLLATE NOCASE
        WHERE cg.clusterId = c.id
          AND EXISTS (
            SELECT 1 FROM directories d
            WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
          )
      ) AS memberCount
    FROM clusters c
    WHERE NOT EXISTS (
      SELECT 1 FROM folder_clusters fc WHERE fc.clusterId = c.id
    )
      AND EXISTS (
        SELECT 1 FROM cluster_games cg
        JOIN games g ON g.filePath = cg.filePath COLLATE NOCASE
        WHERE cg.clusterId = c.id
          AND EXISTS (
            SELECT 1 FROM directories d
            WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
          )
      )
    ORDER BY c.name
  `).all();

  const stmtIcon = db.prepare(`SELECT iconPath FROM games WHERE filePath = ? COLLATE NOCASE`);

  return cs.map((c) => {
    let primaryIconPath = null;
    if (c.primaryFilePath) {
      const pr = stmtIcon.get(c.primaryFilePath);
      primaryIconPath = pr ? (pr.iconPath || null) : null;
    }
    return { ...c, effectiveIconPath: c.icon || primaryIconPath || null };
  });
}

function getClustersByFolder(folderId) {
  const db = getDB();
  const cs = db.prepare(`
    SELECT c.id, c.name, c.description, c.icon, c.primaryFilePath, c.createdAt, c.updatedAt
    FROM folder_clusters fc
    JOIN clusters c ON c.id = fc.clusterId
    WHERE fc.folderId = ?
      AND EXISTS (
        SELECT 1 FROM cluster_games cg
        JOIN games g ON g.filePath = cg.filePath COLLATE NOCASE
        WHERE cg.clusterId = c.id
          AND EXISTS (
            SELECT 1 FROM directories d
            WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
          )
      )
    ORDER BY c.name
  `).all(folderId);

  const stmtCount = db.prepare(`
    SELECT COUNT(1) AS c
    FROM cluster_games cg
    JOIN games g ON g.filePath = cg.filePath COLLATE NOCASE
    WHERE cg.clusterId = ?
      AND EXISTS (
        SELECT 1 FROM directories d
        WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
      )
  `);
  const stmtIcon = db.prepare(`SELECT iconPath FROM games WHERE filePath = ? COLLATE NOCASE`);

  return cs.map((c) => {
    const cr = stmtCount.get(c.id);
    let primaryIconPath = null;
    if (c.primaryFilePath) {
      const pr = stmtIcon.get(c.primaryFilePath);
      primaryIconPath = pr ? (pr.iconPath || null) : null;
    }
    return {
      ...c,
      memberCount: (cr && cr.c) || 0,
      effectiveIconPath: c.icon || primaryIconPath || null,
    };
  });
}

module.exports = {
  getCluster,
  getClusterMembers,
  getDesktopClusters,
  getClustersByFolder,
};
