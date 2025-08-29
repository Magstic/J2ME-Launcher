// src/main/utils/batch-folder-operations.js
// Linus-style batch operations: minimal SQL, maximum throughput

const { getDB } = require('../db');
const { getIncrementalUpdater } = require('../ipc/incremental-updates');
const { getUnifiedGameCache } = require('./unified-cache');

class BatchFolderOperations {
  constructor() {
    this.pendingOperations = [];
    this.batchTimeout = null;
    this.BATCH_DELAY = 100; // ms
  }

  // Queue batch operation
  queueOperation(operation, filePaths, folderId) {
    this.pendingOperations.push({ operation, filePaths, folderId });
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);
  }

  // Process all queued operations in single transaction
  processBatch() {
    if (this.pendingOperations.length === 0) return;

    const db = getDB();
    const cache = getUnifiedGameCache();
    const updater = getIncrementalUpdater();

    // Group operations by type
    const addOperations = [];
    const removeOperations = [];

    for (const { operation, filePaths, folderId } of this.pendingOperations) {
      if (operation === 'add') {
        addOperations.push({ filePaths, folderId });
      } else if (operation === 'remove') {
        removeOperations.push({ filePaths, folderId });
      }
    }

    // Execute in single transaction
    const transaction = db.transaction(() => {
      // Process additions
      if (addOperations.length > 0) {
        const addStmt = db.prepare('INSERT OR IGNORE INTO folder_games (folderId, filePath) VALUES (?, ?)');
        for (const { filePaths, folderId } of addOperations) {
          for (const filePath of filePaths) {
            addStmt.run(folderId, filePath);
          }
          // Update cache immediately
          cache.updateFolderMembership(filePaths, folderId, 'add');
          // Queue incremental update
          updater.updateFolderMembership(filePaths, folderId, 'add');
        }
      }

      // Process removals
      if (removeOperations.length > 0) {
        const removeStmt = db.prepare('DELETE FROM folder_games WHERE folderId = ? AND filePath = ?');
        for (const { filePaths, folderId } of removeOperations) {
          for (const filePath of filePaths) {
            removeStmt.run(folderId, filePath);
          }
          // Update cache immediately
          cache.updateFolderMembership(filePaths, folderId, 'remove');
          // Queue incremental update
          updater.updateFolderMembership(filePaths, folderId, 'remove');
        }
      }
    });

    try {
      transaction();
      console.log(`[BatchFolderOps] Processed ${this.pendingOperations.length} operations in batch`);
    } catch (e) {
      console.error('[BatchFolderOps] Batch transaction failed:', e.message);
    }

    this.pendingOperations = [];
    this.batchTimeout = null;
  }

  // Immediate batch add (for drag-drop scenarios)
  addGamesToBatch(filePaths, folderId) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return;

    const db = getDB();
    const cache = getUnifiedGameCache();
    const updater = getIncrementalUpdater();

    const transaction = db.transaction(() => {
      const stmt = db.prepare('INSERT OR IGNORE INTO folder_games (folderId, filePath) VALUES (?, ?)');
      for (const filePath of filePaths) {
        stmt.run(folderId, filePath);
      }
    });

    try {
      transaction();
      cache.updateFolderMembership(filePaths, folderId, 'add');
      updater.updateFolderMembership(filePaths, folderId, 'add');
      
      console.log(`[BatchFolderOps] Added ${filePaths.length} games to folder ${folderId}`);
      return { success: true, count: filePaths.length };
    } catch (e) {
      console.error('[BatchFolderOps] Batch add failed:', e.message);
      return { success: false, error: e.message };
    }
  }

  // Immediate batch remove
  removeGamesFromBatch(filePaths, folderId) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return;

    const db = getDB();
    const cache = getUnifiedGameCache();
    const updater = getIncrementalUpdater();

    const transaction = db.transaction(() => {
      const stmt = db.prepare('DELETE FROM folder_games WHERE folderId = ? AND filePath = ?');
      for (const filePath of filePaths) {
        stmt.run(folderId, filePath);
      }
    });

    try {
      transaction();
      cache.updateFolderMembership(filePaths, folderId, 'remove');
      updater.updateFolderMembership(filePaths, folderId, 'remove');
      
      console.log(`[BatchFolderOps] Removed ${filePaths.length} games from folder ${folderId}`);
      return { success: true, count: filePaths.length };
    } catch (e) {
      console.error('[BatchFolderOps] Batch remove failed:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// Singleton
let batchOpsInstance = null;

function getBatchFolderOperations() {
  if (!batchOpsInstance) {
    batchOpsInstance = new BatchFolderOperations();
  }
  return batchOpsInstance;
}

module.exports = { BatchFolderOperations, getBatchFolderOperations };
