// src/main/utils/game-state-cache.js
// Linus-style game state cache: simple, fast, effective
// Now integrated with unified store architecture

class GameStateCache {
  constructor() {
    this.games = new Map(); // filePath -> game object
    this.folderMembership = new Map(); // filePath -> Set<folderId>
    this.lastFullSync = 0;
    this.isDirty = true;
  }

  // Initialize cache from SQL
  async initialize() {
    try {
      const { getAllGamesFromSql } = require('../sql/read');
      const { addUrlToGames } = require('./icon-url');
      
      const sqlGames = getAllGamesFromSql();
      const gamesWithUrl = addUrlToGames(sqlGames);
      
      this.games.clear();
      this.folderMembership.clear();
      
      for (const game of gamesWithUrl) {
        this.games.set(game.filePath, game);
      }
      
      // Build folder membership map
      const { getDB } = require('../db');
      const db = getDB();
      const rows = db.prepare('SELECT folderId, filePath FROM folder_games').all();
      
      for (const row of rows) {
        if (!this.folderMembership.has(row.filePath)) {
          this.folderMembership.set(row.filePath, new Set());
        }
        this.folderMembership.get(row.filePath).add(row.folderId);
      }
      
      this.lastFullSync = Date.now();
      this.isDirty = false;
      
      return Array.from(this.games.values());
    } catch (e) {
      console.warn('[GameStateCache] initialize failed:', e.message);
      return [];
    }
  }

  // Get all games (cached)
  getAllGames() {
    if (this.isDirty || this.games.size === 0) {
      // Fallback to SQL if cache is dirty
      try {
        const { getAllGamesFromSql } = require('../sql/read');
        const { addUrlToGames } = require('./icon-url');
        return addUrlToGames(getAllGamesFromSql());
      } catch (e) {
        return Array.from(this.games.values());
      }
    }
    return Array.from(this.games.values());
  }

  // Update folder membership for specific games
  updateFolderMembership(filePaths, folderId, action) {
    const changes = { added: [], removed: [], updated: [] };
    
    for (const filePath of filePaths) {
      if (!this.folderMembership.has(filePath)) {
        this.folderMembership.set(filePath, new Set());
      }
      
      const folders = this.folderMembership.get(filePath);
      const hadFolder = folders.has(folderId);
      
      if (action === 'add' && !hadFolder) {
        folders.add(folderId);
        changes.added.push(filePath);
      } else if (action === 'remove' && hadFolder) {
        folders.delete(folderId);
        changes.removed.push(filePath);
      }
      
      if (changes.added.includes(filePath) || changes.removed.includes(filePath)) {
        changes.updated.push(filePath);
      }
    }
    
    return changes;
  }

  // Move games between folders
  moveGamesBetweenFolders(filePaths, fromFolderId, toFolderId) {
    const changes = { moved: [], updated: [] };
    
    for (const filePath of filePaths) {
      if (!this.folderMembership.has(filePath)) continue;
      
      const folders = this.folderMembership.get(filePath);
      if (folders.has(fromFolderId)) {
        folders.delete(fromFolderId);
        folders.add(toFolderId);
        changes.moved.push(filePath);
        changes.updated.push(filePath);
      }
    }
    
    return changes;
  }

  // Mark cache as dirty (needs refresh)
  markDirty() {
    this.isDirty = true;
  }

  // Check if cache needs refresh
  needsRefresh(maxAge = 30000) { // 30 seconds
    return this.isDirty || (Date.now() - this.lastFullSync) > maxAge;
  }
}

// Singleton instance
let cacheInstance = null;

function getGameStateCache() {
  if (!cacheInstance) {
    cacheInstance = new GameStateCache();
  }
  return cacheInstance;
}

module.exports = { GameStateCache, getGameStateCache };
