// src/main/sql/optimized-read.js
// Linus-style SQL optimization: fast, indexed, minimal

const { getDB } = require('../db');

// Prepared statements cache
const preparedStatements = new Map();

function getPreparedStatement(key, sql) {
  if (!preparedStatements.has(key)) {
    const db = getDB();
    preparedStatements.set(key, db.prepare(sql));
  }
  return preparedStatements.get(key);
}

// Optimized: only essential fields, indexed query
function getGamesMinimal() {
  const stmt = getPreparedStatement(
    'games_minimal',
    `
    SELECT filePath, gameName, vendor, version, iconPath, md5
    FROM games g
    WHERE EXISTS (
      SELECT 1 FROM directories d
      WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
    )
    ORDER BY gameName
  `
  );
  return stmt.all();
}

// Paginated query for large datasets
function getGamesPaginated(offset = 0, limit = 1000) {
  const stmt = getPreparedStatement(
    'games_paginated',
    `
    SELECT filePath, gameName, vendor, version, iconPath, md5
    FROM games g
    WHERE EXISTS (
      SELECT 1 FROM directories d
      WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
    )
    ORDER BY gameName
    LIMIT ? OFFSET ?
  `
  );
  return stmt.all(limit, offset);
}

// Get games by specific filePaths (for incremental updates)
function getGamesByPaths(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return [];

  const placeholders = filePaths.map(() => '?').join(',');
  const stmt = getPreparedStatement(
    `games_by_paths_${filePaths.length}`,
    `
    SELECT filePath, gameName, vendor, version, iconPath, md5, mtimeMs, size
    FROM games
    WHERE filePath IN (${placeholders})
  `
  );
  return stmt.all(...filePaths);
}

// Count total games (for pagination)
function getGamesCount() {
  const stmt = getPreparedStatement(
    'games_count',
    `
    SELECT COUNT(*) as count
    FROM games g
    WHERE EXISTS (
      SELECT 1 FROM directories d
      WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
    )
  `
  );
  return stmt.get().count;
}

// Folder membership queries (optimized)
function getFolderMembershipBatch(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return {};

  const placeholders = filePaths.map(() => '?').join(',');
  const stmt = getPreparedStatement(
    `folder_membership_${filePaths.length}`,
    `
    SELECT filePath, folderId
    FROM folder_games
    WHERE filePath IN (${placeholders})
  `
  );

  const rows = stmt.all(...filePaths);
  const membership = {};

  for (const row of rows) {
    if (!membership[row.filePath]) {
      membership[row.filePath] = [];
    }
    membership[row.filePath].push(row.folderId);
  }

  return membership;
}

// Legacy compatibility wrapper
function getAllGamesFromSql() {
  return getGamesMinimal();
}

module.exports = {
  getGamesMinimal,
  getGamesPaginated,
  getGamesByPaths,
  getGamesCount,
  getFolderMembershipBatch,
  getAllGamesFromSql, // Legacy compatibility
};
