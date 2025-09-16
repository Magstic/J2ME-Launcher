// src/main/sql/read.js
// Read helpers from SQLite, mapping to legacy game object shape (manifest merged).

const { getDB } = require('../db');

function rowToGame(row) {
  if (!row) return null;
  const manifest = row.manifest ? JSON.parse(row.manifest) : null;
  const base = {
    filePath: row.filePath,
    gameName: row.customName || row.gameName, // 優先使用自訂名稱
    vendor: row.customVendor || row.vendor,   // 優先使用自訂開發商
    version: row.version,
    md5: row.md5,
    iconPath: row.iconPath,
    mtimeMs: row.mtimeMs,
    size: row.size,
    // 保留原始數據供編輯時使用
    originalName: row.gameName,
    originalVendor: row.vendor,
    customName: row.customName,
    customVendor: row.customVendor
  };
  return manifest ? { ...base, ...manifest } : base;
}

function getAllGamesFromSql() {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM games g
    WHERE EXISTS (
      SELECT 1 FROM directories d
      WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
    )
    ORDER BY gameName
  `).all();
  return rows.map(rowToGame);
}

module.exports = { rowToGame, getAllGamesFromSql };
