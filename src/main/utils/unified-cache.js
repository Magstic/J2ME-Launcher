// src/main/utils/unified-cache.js
// Linus-style unified cache: single source of truth for 10k+ games

const {
  getGamesMinimal,
  getGamesByPaths,
  getFolderMembershipBatch,
} = require('../sql/optimized-read');
const { addUrlToGames } = require('./icon-url');

class UnifiedGameCache {
  constructor() {
    this.games = new Map(); // filePath -> game object
    this.folderMembership = new Map(); // filePath -> Set<folderId>
    this.lastFullSync = 0;
    this.isDirty = false;
    this.syncInProgress = false;
  }

  // Initialize cache from optimized SQL
  async initialize() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      console.log('[UnifiedCache] Initializing cache...');
      const startTime = Date.now();

      // Load games with minimal fields
      const sqlGames = getGamesMinimal();
      const gamesWithUrl = addUrlToGames(sqlGames);

      this.games.clear();
      for (const game of gamesWithUrl) {
        this.games.set(game.filePath, game);
      }

      // Load folder membership in batch
      const filePaths = Array.from(this.games.keys());
      const membership = getFolderMembershipBatch(filePaths);

      this.folderMembership.clear();
      for (const [filePath, folderIds] of Object.entries(membership)) {
        this.folderMembership.set(filePath, new Set(folderIds));
      }

      this.lastFullSync = Date.now();
      this.isDirty = false;

      const duration = Date.now() - startTime;
      console.log(`[UnifiedCache] Initialized ${this.games.size} games in ${duration}ms`);

      return Array.from(this.games.values());
    } catch (e) {
      console.warn('[UnifiedCache] Initialize failed:', e.message);
      return [];
    } finally {
      this.syncInProgress = false;
    }
  }

  // Get all games (cached)
  getAllGames() {
    if (this.isDirty && !this.syncInProgress) {
      // Async refresh without blocking
      setImmediate(() => this.initialize());
    }
    return Array.from(this.games.values());
  }

  // Get games by folder (O(n) but cached)
  getGamesByFolder(folderId) {
    const result = [];
    for (const [filePath, game] of this.games) {
      const folders = this.folderMembership.get(filePath);
      if (folders && folders.has(folderId)) {
        result.push(game);
      }
    }
    return result;
  }

  // Get uncategorized games
  getUncategorizedGames() {
    const result = [];
    for (const [filePath, game] of this.games) {
      const folders = this.folderMembership.get(filePath);
      if (!folders || folders.size === 0) {
        result.push(game);
      }
    }
    return result;
  }

  // Incremental update: add/update/remove specific games
  updateGames(changes) {
    const { added = [], updated = [], removed = [] } = changes;

    // Add new games
    for (const game of added) {
      this.games.set(game.filePath, game);
    }

    // Update existing games
    for (const game of updated) {
      this.games.set(game.filePath, game);
    }

    // Remove deleted games
    for (const filePath of removed) {
      this.games.delete(filePath);
      this.folderMembership.delete(filePath);
    }

    return {
      addedCount: added.length,
      updatedCount: updated.length,
      removedCount: removed.length,
    };
  }

  // Update folder membership (fast, no SQL reload)
  updateFolderMembership(filePaths, folderId, operation) {
    const changes = { affected: [] };

    for (const filePath of filePaths) {
      if (!this.folderMembership.has(filePath)) {
        this.folderMembership.set(filePath, new Set());
      }

      const folders = this.folderMembership.get(filePath);
      const hadFolder = folders.has(folderId);

      if (operation === 'add' && !hadFolder) {
        folders.add(folderId);
        changes.affected.push(filePath);
      } else if (operation === 'remove' && hadFolder) {
        folders.delete(folderId);
        changes.affected.push(filePath);
      }
    }

    return changes;
  }

  // Get cache statistics
  getStats() {
    return {
      gamesCount: this.games.size,
      folderMembershipCount: this.folderMembership.size,
      lastFullSync: this.lastFullSync,
      isDirty: this.isDirty,
      syncInProgress: this.syncInProgress,
    };
  }

  // Mark cache as dirty (needs refresh)
  markDirty() {
    this.isDirty = true;
  }

  // Force refresh from SQL
  async forceRefresh() {
    this.isDirty = true;
    return await this.initialize();
  }
}

// Singleton instance
let cacheInstance = null;

function getUnifiedGameCache() {
  if (!cacheInstance) {
    cacheInstance = new UnifiedGameCache();
  }
  return cacheInstance;
}

module.exports = { UnifiedGameCache, getUnifiedGameCache };
