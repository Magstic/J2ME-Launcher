// src/main/sql/folders-read.js
// Read helpers for folders and folder-game relationships from SQLite.

const { getDB } = require('../db');
const { rowToGame } = require('./read');

function getFolders() {
  const db = getDB();
  // 計算每個資料夾內有效遊戲數（僅計入啟用目錄中的遊戲）
  const rows = db.prepare(`
    SELECT 
      f.id,
      f.name,
      f.description,
      f.icon,
      f.color,
      COALESCE(cnt.c, 0) AS gameCount,
      f.createdAt,
      f.updatedAt,
      f.sortOrder,
      f.isVisible
    FROM folders f
    LEFT JOIN (
      SELECT 
        fg.folderId AS id,
        COUNT(1) AS c
      FROM folder_games fg
      JOIN games g ON g.filePath = fg.filePath COLLATE NOCASE
      WHERE EXISTS (
        SELECT 1 FROM directories d
        WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%')
      )
      GROUP BY fg.folderId
    ) AS cnt ON cnt.id = f.id
    ORDER BY (f.sortOrder IS NULL), f.sortOrder ASC, f.name ASC
  `).all();
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    icon: r.icon,
    color: r.color,
    gameCount: r.gameCount ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    sortOrder: r.sortOrder,
    isVisible: !!r.isVisible,
  }));
}

function getFolderGameCount(folderId) {
  const db = getDB();
  const row = db.prepare(`
    SELECT COUNT(1) as c
    FROM folder_games fg
    JOIN games g ON g.filePath = fg.filePath COLLATE NOCASE
    WHERE fg.folderId = ?
      AND EXISTS (
        SELECT 1 FROM directories d
        WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%')
      )
  `).get(folderId);
  return row ? row.c : 0;
}

function getFolderById(folderId) {
  const db = getDB();
  const r = db.prepare(`SELECT * FROM folders WHERE id=?`).get(folderId);
  if (!r) return null;
  // 以即時計算的數量覆寫（避免依賴過時欄位）
  const count = getFolderGameCount(folderId);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    icon: r.icon,
    color: r.color,
    gameCount: count,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    sortOrder: r.sortOrder,
    isVisible: !!r.isVisible,
  };
}

function getGamesByFolder(folderId) {
  const db = getDB();
  const rows = db.prepare(`
    SELECT g.* FROM folder_games fg
    JOIN games g ON g.filePath = fg.filePath COLLATE NOCASE
    WHERE fg.folderId = ?
      AND EXISTS (
        SELECT 1 FROM directories d
        WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%')
      )
    ORDER BY g.gameName
  `).all(folderId);
  return rows.map(rowToGame);
}

function getUncategorizedGames() {
  const db = getDB();
  const rows = db.prepare(`
    SELECT g.* FROM games g
    WHERE EXISTS (
      SELECT 1 FROM directories d
      WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%')
    )
      AND NOT EXISTS (
        SELECT 1 FROM folder_games fg WHERE fg.filePath = g.filePath COLLATE NOCASE
      )
    ORDER BY g.gameName
  `).all();
  return rows.map(rowToGame);
}

function getFolderStats() {
  const db = getDB();
  const folderRows = db.prepare(`SELECT id, name FROM folders`).all();
  const totalGames = db.prepare(`SELECT COUNT(1) as c FROM games`).get().c;
  const categorizedGames = db.prepare(`SELECT COUNT(DISTINCT filePath) as c FROM folder_games`).get().c;
  const uncategorizedGames = totalGames - categorizedGames;
  const folders = folderRows.map(fr => {
    const c = db.prepare(`SELECT COUNT(1) as c FROM folder_games WHERE folderId=?`).get(fr.id).c;
    return { id: fr.id, name: fr.name, gameCount: c };
  });
  return {
    totalFolders: folderRows.length,
    totalGames,
    categorizedGames,
    uncategorizedGames,
    folders
  };
}

function getGameFolders(filePath) {
  const db = getDB();
  const rows = db.prepare(`
    SELECT f.* FROM folder_games fg
    JOIN folders f ON f.id = fg.folderId
    WHERE fg.filePath = ? COLLATE NOCASE
    ORDER BY f.name
  `).all(filePath);
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    icon: r.icon,
    color: r.color,
    gameCount: r.gameCount ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    sortOrder: r.sortOrder,
    isVisible: !!r.isVisible,
  }));
}

// 取得屬於任一資料夾的所有遊戲 filePath（去重）
function getGamesInAnyFolder() {
  const db = getDB();
  const rows = db.prepare(`
    SELECT DISTINCT fg.filePath AS filePath
    FROM folder_games fg
    JOIN games g ON g.filePath = fg.filePath COLLATE NOCASE
    WHERE EXISTS (
      SELECT 1 FROM directories d
      WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%')
    )
  `).all();
  return rows.map(r => r.filePath);
}

module.exports = {
  getFolders,
  getFolderById,
  getGamesByFolder,
  getUncategorizedGames,
  getFolderStats,
  getGameFolders,
  getFolderGameCount,
  getGamesInAnyFolder,
};
