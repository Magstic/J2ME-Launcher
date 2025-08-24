// src/main/sql/read.js
// Read helpers from SQLite, mapping to legacy game object shape (manifest merged).

const { getDB } = require('../db');

function rowToGame(row) {
  if (!row) return null;
  const manifest = row.manifest ? JSON.parse(row.manifest) : null;
  const base = {
    filePath: row.filePath,
    gameName: row.gameName,
    vendor: row.vendor,
    version: row.version,
    md5: row.md5,
    iconPath: row.iconPath,
    mtimeMs: row.mtimeMs,
    size: row.size
  };
  return manifest ? { ...base, ...manifest } : base;
}

function getAllGamesFromSql() {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM games g
    WHERE EXISTS (
      SELECT 1 FROM directories d
      WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%')
    )
    ORDER BY gameName
  `).all();
  return rows.map(rowToGame);
}

module.exports = { rowToGame, getAllGamesFromSql };
