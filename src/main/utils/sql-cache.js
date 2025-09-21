// src/main/utils/sql-cache.js
// Linus-style SQL prepared statements cache

class SqlCache {
  constructor() {
    this.statements = new Map();
    this.db = null;
  }

  init(database) {
    this.db = database;
    this.prepareStatements();
  }

  prepareStatements() {
    if (!this.db) return;

    // 常用查詢的 prepared statements
    const queries = {
      getAllGames:
        "SELECT * FROM games g WHERE EXISTS (SELECT 1 FROM directories d WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%')) ORDER BY gameName",
      getGamesByFolder:
        "SELECT g.* FROM folder_games fg JOIN games g ON g.filePath = fg.filePath COLLATE NOCASE WHERE fg.folderId = ? AND EXISTS (SELECT 1 FROM directories d WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%')) ORDER BY g.gameName",
      getFolderGameCount:
        "SELECT COUNT(1) as c FROM folder_games fg JOIN games g ON g.filePath = fg.filePath COLLATE NOCASE WHERE fg.folderId = ? AND EXISTS (SELECT 1 FROM directories d WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%'))",
      getUncategorizedGames:
        "SELECT g.* FROM games g WHERE EXISTS (SELECT 1 FROM directories d WHERE d.enabled = 1 AND g.filePath LIKE (d.path || '%')) AND NOT EXISTS (SELECT 1 FROM folder_games fg WHERE fg.filePath = g.filePath COLLATE NOCASE) ORDER BY g.gameName",
      getFolderMembership: 'SELECT folderId, filePath FROM folder_games',
      insertFolderGame:
        'INSERT OR REPLACE INTO folder_games (folderId, filePath, addedTime, customName, notes) VALUES (?, ?, ?, ?, ?)',
      deleteFolderGame: 'DELETE FROM folder_games WHERE folderId=? AND filePath=?',
    };

    for (const [name, sql] of Object.entries(queries)) {
      try {
        this.statements.set(name, this.db.prepare(sql));
      } catch (e) {
        console.warn(`[SqlCache] Failed to prepare statement ${name}:`, e.message);
      }
    }
  }

  // 快取版本的 getAllGames
  getAllGames() {
    const stmt = this.statements.get('getAllGames');
    if (!stmt) return [];

    try {
      return stmt.all();
    } catch (e) {
      console.warn('[SqlCache] getAllGames failed:', e.message);
      return [];
    }
  }

  // 快取版本的 getGamesByFolder
  getGamesByFolder(folderId) {
    const stmt = this.statements.get('getGamesByFolder');
    if (!stmt) return [];

    try {
      return stmt.all(folderId);
    } catch (e) {
      console.warn('[SqlCache] getGamesByFolder failed:', e.message);
      return [];
    }
  }

  // 快取版本的 getFolderGameCount
  getFolderGameCount(folderId) {
    const stmt = this.statements.get('getFolderGameCount');
    if (!stmt) return 0;

    try {
      const row = stmt.get(folderId);
      return row ? row.c : 0;
    } catch (e) {
      console.warn('[SqlCache] getFolderGameCount failed:', e.message);
      return 0;
    }
  }

  // 快取版本的 getUncategorizedGames
  getUncategorizedGames() {
    const stmt = this.statements.get('getUncategorizedGames');
    if (!stmt) return [];

    try {
      return stmt.all();
    } catch (e) {
      console.warn('[SqlCache] getUncategorizedGames failed:', e.message);
      return [];
    }
  }

  // 快取版本的資料夾成員關係查詢
  getFolderMembership() {
    const stmt = this.statements.get('getFolderMembership');
    if (!stmt) return [];

    try {
      return stmt.all();
    } catch (e) {
      console.warn('[SqlCache] getFolderMembership failed:', e.message);
      return [];
    }
  }

  // 批次插入資料夾遊戲關係
  batchInsertFolderGames(folderId, filePaths, payload = {}) {
    const stmt = this.statements.get('insertFolderGame');
    if (!stmt) return false;

    try {
      const tx = this.db.transaction((paths) => {
        for (const fp of paths) {
          if (!fp) continue;
          stmt.run(
            folderId,
            fp,
            payload.addedTime || null,
            payload.customName || null,
            payload.notes || null
          );
        }
      });
      tx(filePaths);
      return true;
    } catch (e) {
      console.warn('[SqlCache] batchInsertFolderGames failed:', e.message);
      return false;
    }
  }

  // 批次刪除資料夾遊戲關係
  batchDeleteFolderGames(folderId, filePaths) {
    const stmt = this.statements.get('deleteFolderGame');
    if (!stmt) return false;

    try {
      const tx = this.db.transaction((paths) => {
        for (const fp of paths) {
          if (!fp) continue;
          stmt.run(folderId, fp);
        }
      });
      tx(filePaths);
      return true;
    } catch (e) {
      console.warn('[SqlCache] batchDeleteFolderGames failed:', e.message);
      return false;
    }
  }

  // 清理快取
  clear() {
    this.statements.clear();
  }
}

// Singleton instance
let sqlCacheInstance = null;

function getSqlCache() {
  if (!sqlCacheInstance) {
    sqlCacheInstance = new SqlCache();
  }
  return sqlCacheInstance;
}

module.exports = { SqlCache, getSqlCache };
