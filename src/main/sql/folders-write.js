// src/main/sql/folders-write.js
// Write helpers for folders and folder-game relationships.

const { getDB } = require('../db');

function upsertFolder(folder) {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT INTO folders (id, name, description, icon, color, gameCount, createdAt, updatedAt, sortOrder, isVisible)
    VALUES (@id, @name, @description, @icon, @color, @gameCount, @createdAt, @updatedAt, @sortOrder, @isVisible)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      description=excluded.description,
      icon=excluded.icon,
      color=excluded.color,
      gameCount=excluded.gameCount,
      createdAt=excluded.createdAt,
      updatedAt=excluded.updatedAt,
      sortOrder=excluded.sortOrder,
      isVisible=excluded.isVisible
  `);
  stmt.run({
    id: folder.id,
    name: folder.name ?? null,
    description: folder.description ?? null,
    icon: folder.icon ?? null,
    color: folder.color ?? null,
    gameCount: folder.gameCount ?? 0,
    createdAt: folder.createdAt ?? null,
    updatedAt: folder.updatedAt ?? null,
    sortOrder: folder.sortOrder ?? null,
    isVisible: folder.isVisible ? 1 : 0,
  });
}

function deleteFolder(folderId) {
  const db = getDB();
  db.prepare(`DELETE FROM folders WHERE id=?`).run(folderId);
  // folder_games and folder_metadata cascade by FK
}

function addGameToFolder(folderId, filePath, payload = {}) {
  const db = getDB();
  // Ensure the game exists in games table to satisfy FK
  try {
    db.prepare(`INSERT OR IGNORE INTO games (filePath) VALUES (?)`).run(filePath);
  } catch (_) {}
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO folder_games (folderId, filePath, addedTime, customName, notes)
    VALUES (@folderId, @filePath, @addedTime, @customName, @notes)
  `);
  stmt.run({
    folderId,
    filePath,
    addedTime: payload.addedTime ?? null,
    customName: payload.customName ?? null,
    notes: payload.notes ?? null,
  });
}

// 批次加入：使用交易 + prepared statements，效能更佳
function addGamesToFolderBatch(folderId, filePaths, payload = {}) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;
  const db = getDB();
  const ensureGame = db.prepare(`INSERT OR IGNORE INTO games (filePath) VALUES (?)`);
  const upsertRel = db.prepare(`
    INSERT OR REPLACE INTO folder_games (folderId, filePath, addedTime, customName, notes)
    VALUES (@folderId, @filePath, @addedTime, @customName, @notes)
  `);
  const tx = db.transaction((paths) => {
    for (const fp of paths) {
      if (!fp) continue;
      try { ensureGame.run(fp); } catch (_) {}
      upsertRel.run({
        folderId,
        filePath: fp,
        addedTime: payload.addedTime ?? null,
        customName: payload.customName ?? null,
        notes: payload.notes ?? null,
      });
    }
  });
  tx(filePaths);
}

function removeGameFromFolder(folderId, filePath) {
  const db = getDB();
  db.prepare(`DELETE FROM folder_games WHERE folderId=? AND filePath=?`).run(folderId, filePath);
}

module.exports = {
  upsertFolder,
  deleteFolder,
  addGameToFolder,
  addGamesToFolderBatch,
  removeGameFromFolder,
};
