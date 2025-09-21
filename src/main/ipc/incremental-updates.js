// src/main/ipc/incremental-updates.js
// Linus-style incremental updates: minimal, fast, effective

const { getGameStateCache } = require('../utils/game-state-cache');
const { broadcastToAll } = require('./unified-events');

class IncrementalUpdater {
  constructor() {
    this.pendingUpdates = new Map(); // filePath -> update type
    this.batchTimeout = null;
    this.BATCH_DELAY = 50; // ms
    // 初始化批次資料，供 folder-membership 事件使用
    this.batchUpdates = [];
  }

  // Queue incremental update
  queueUpdate(filePath, updateType, gameData = null) {
    this.pendingUpdates.set(filePath, { type: updateType, data: gameData });

    // Debounce batch processing
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);
  }

  // Process batched updates
  processBatch() {
    if (this.pendingUpdates.size === 0) return;

    const updates = {
      added: [],
      updated: [],
      removed: [],
    };

    for (const [filePath, { type, data }] of this.pendingUpdates) {
      switch (type) {
        case 'add':
          updates.added.push(data);
          break;
        case 'update':
          updates.updated.push(data);
          break;
        case 'remove':
          updates.removed.push(filePath);
          break;
      }
    }

    // Broadcast minimal incremental update
    broadcastToAll('games-incremental-update', updates);

    this.pendingUpdates.clear();
    this.batchTimeout = null;
  }

  // Folder membership change (no full game reload)
  updateFolderMembership(filePaths, folderId, action) {
    this.batchUpdates.push({
      type: 'folder-membership',
      filePaths: Array.isArray(filePaths) ? filePaths : [filePaths],
      folderId,
      action, // 'add' or 'remove'
    });

    this.scheduleBroadcast();
  }

  scheduleBroadcast() {
    const updates = this.batchUpdates;
    this.batchUpdates = [];
    broadcastToAll('folder-membership-changed', updates);
  }
}

// Singleton
let updaterInstance = null;

function getIncrementalUpdater() {
  if (!updaterInstance) {
    updaterInstance = new IncrementalUpdater();
  }
  return updaterInstance;
}

module.exports = { IncrementalUpdater, getIncrementalUpdater };
