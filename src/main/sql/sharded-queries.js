// src/main/sql/sharded-queries.js
// Database sharding and pagination for massive game collections

const { getDB } = require('../db');
const { getSqlCache } = require('../utils/sql-cache');

class ShardedQueries {
  constructor() {
    this.db = getDB();
    this.cache = getSqlCache();
    this.pageSize = 1000; // Games per page
    this.folderPageSize = 500; // Games per folder page
  }

  // Paginated game loading with cursor-based pagination
  async getGamesPaginated(cursor = null, limit = this.pageSize) {
    const stmt = this.db.prepare(`
      SELECT g.filePath, g.gameName, g.vendor, g.version, g.md5, g.iconPath, g.mtimeMs, g.size, g.manifest
      FROM games g 
      INNER JOIN directories d ON g.filePath GLOB (d.path || '*')
      WHERE d.enabled = 1
      ${cursor ? 'AND g.filePath > ?' : ''}
      ORDER BY g.filePath
      LIMIT ?
    `);

    const params = cursor ? [cursor, limit] : [limit];
    const games = stmt.all(...params);
    
    return {
      games,
      nextCursor: games.length === limit ? games[games.length - 1].filePath : null,
      hasMore: games.length === limit
    };
  }

  // Folder-specific paginated queries
  async getFolderGamesPaginated(folderId, cursor = null, limit = this.folderPageSize) {
    const stmt = this.db.prepare(`
      SELECT g.filePath, g.gameName, g.vendor, g.version, g.md5, g.iconPath, g.mtimeMs, g.size, g.manifest
      FROM folder_games fg 
      INNER JOIN games g ON g.filePath = fg.filePath COLLATE NOCASE 
      INNER JOIN directories d ON g.filePath GLOB (d.path || '*')
      WHERE fg.folderId = ? AND d.enabled = 1
      ${cursor ? 'AND g.filePath > ?' : ''}
      ORDER BY g.filePath
      LIMIT ?
    `);

    const params = cursor ? [folderId, cursor, limit] : [folderId, limit];
    const games = stmt.all(...params);
    
    return {
      games,
      nextCursor: games.length === limit ? games[games.length - 1].filePath : null,
      hasMore: games.length === limit
    };
  }

  // Efficient game count by folder (cached)
  getFolderGameCounts() {
    const stmt = this.db.prepare(`
      SELECT fg.folderId, COUNT(*) as count
      FROM folder_games fg 
      JOIN games g ON g.filePath = fg.filePath COLLATE NOCASE 
      WHERE EXISTS (
        SELECT 1 FROM directories d 
        WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
      )
      GROUP BY fg.folderId
    `);

    const counts = new Map();
    stmt.all().forEach(row => {
      counts.set(row.folderId, row.count);
    });
    
    return counts;
  }

  // Search with pagination and ranking
  async searchGamesPaginated(searchTerm, cursor = null, limit = this.pageSize) {
    const term = `*${searchTerm.toLowerCase()}*`;
    
    const stmt = this.db.prepare(`
      SELECT g.filePath, g.gameName, g.vendor, g.version, g.md5, g.iconPath, g.mtimeMs, g.size, g.manifest,
        CASE 
          WHEN LOWER(g.gameName) GLOB ? THEN 1
          WHEN LOWER(g.vendor) GLOB ? THEN 2
          ELSE 3
        END as relevance
      FROM games g 
      INNER JOIN directories d ON g.filePath GLOB (d.path || '*')
      WHERE d.enabled = 1
      AND (LOWER(g.gameName) GLOB ? OR LOWER(g.vendor) GLOB ?)
      ${cursor ? 'AND g.filePath > ?' : ''}
      ORDER BY relevance, g.gameName, g.filePath
      LIMIT ?
    `);

    const params = cursor 
      ? [term, term, term, term, cursor, limit]
      : [term, term, term, term, limit];
    
    const games = stmt.all(...params);
    
    return {
      games,
      nextCursor: games.length === limit ? games[games.length - 1].filePath : null,
      hasMore: games.length === limit
    };
  }

  // Batch operations with chunking
  async batchUpdateFolderMembership(operations, chunkSize = 100) {
    const chunks = [];
    for (let i = 0; i < operations.length; i += chunkSize) {
      chunks.push(operations.slice(i, i + chunkSize));
    }

    const results = [];
    for (const chunk of chunks) {
      const transaction = this.db.transaction(() => {
        for (const op of chunk) {
          if (op.type === 'add') {
            this.db.prepare('INSERT OR REPLACE INTO folder_games (folderId, filePath, addedTime) VALUES (?, ?, ?)')
              .run(op.folderId, op.filePath, op.addedTime || Date.now());
          } else if (op.type === 'remove') {
            this.db.prepare('DELETE FROM folder_games WHERE folderId = ? AND filePath = ?')
              .run(op.folderId, op.filePath);
          }
        }
      });

      try {
        transaction();
        results.push({ success: true, count: chunk.length });
      } catch (e) {
        results.push({ success: false, error: e.message, count: 0 });
      }
    }

    return results;
  }

  // Optimized folder statistics
  getFolderStatistics() {
    const stmt = this.db.prepare(`
      SELECT 
        f.id,
        f.name,
        COALESCE(stats.gameCount, 0) as gameCount,
        COALESCE(stats.totalSize, 0) as totalSize
      FROM folders f
      LEFT JOIN (
        SELECT 
          fg.folderId,
          COUNT(*) as gameCount,
          SUM(g.size) as totalSize
        FROM folder_games fg
        JOIN games g ON g.filePath = fg.filePath COLLATE NOCASE
        WHERE EXISTS (
          SELECT 1 FROM directories d 
          WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
        )
        GROUP BY fg.folderId
      ) stats ON f.id = stats.folderId
      ORDER BY f.name
    `);

    return stmt.all();
  }

  // Memory-efficient game existence check
  gameExists(filePath) {
    const stmt = this.db.prepare('SELECT 1 FROM games WHERE filePath = ? LIMIT 1');
    return !!stmt.get(filePath);
  }

  // Bulk game existence check
  checkGamesExist(filePaths) {
    if (filePaths.length === 0) return new Map();
    
    const placeholders = filePaths.map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT filePath FROM games WHERE filePath IN (${placeholders})`);
    
    const existing = new Set(stmt.all(...filePaths).map(row => row.filePath));
    const result = new Map();
    
    filePaths.forEach(path => {
      result.set(path, existing.has(path));
    });
    
    return result;
  }
}

// Singleton instance
let shardedQueriesInstance = null;

function getShardedQueries() {
  if (!shardedQueriesInstance) {
    shardedQueriesInstance = new ShardedQueries();
  }
  return shardedQueriesInstance;
}

module.exports = { ShardedQueries, getShardedQueries };
