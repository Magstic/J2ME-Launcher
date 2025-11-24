// src/main/ipc/incremental-updates.js
// Linus-style incremental updates: minimal, fast, effective

const { broadcastToAll } = require('./unified-events');

class IncrementalUpdater {
  constructor() {
    this.pendingUpdates = new Map(); // filePath -> { type, data }
    this.batchTimeout = null;
    this.BATCH_DELAY = 50; // ms
    this.pendingMeta = null;

    // folder-membership batching
    this.membershipQueue = new Map(); // key = `${folderId}:${action}` -> Set(filePath)
    this.membershipTimeout = null;
  }

  queueUpdate(filePath, updateType, gameData = null) {
    if (!filePath) return;
    const normalizedData = {
      ...(gameData || {}),
      filePath,
    };
    const existing = this.pendingUpdates.get(filePath);

    if (updateType === 'remove') {
      this.pendingUpdates.set(filePath, { type: 'remove', data: null });
    } else if (updateType === 'add') {
      const merged =
        existing && existing.type === 'add'
          ? { ...existing.data, ...normalizedData }
          : normalizedData;
      this.pendingUpdates.set(filePath, { type: 'add', data: merged });
    } else {
      if (existing && existing.type === 'add') {
        this.pendingUpdates.set(filePath, {
          type: 'add',
          data: { ...existing.data, ...normalizedData },
        });
      } else {
        const mergedUpdate =
          existing && existing.type === 'update'
            ? { ...existing.data, ...normalizedData }
            : normalizedData;
        this.pendingUpdates.set(filePath, { type: 'update', data: mergedUpdate });
      }
    }

    this.scheduleProcessBatch();
  }

  queueAddedGame(gameData = {}) {
    if (!gameData || !gameData.filePath) return;
    this.queueUpdate(gameData.filePath, 'add', gameData);
  }

  queueUpdatedGame(gameData = {}) {
    if (!gameData || !gameData.filePath) return;
    this.queueUpdate(gameData.filePath, 'update', gameData);
  }

  queueRemovedGame(filePath) {
    if (!filePath) return;
    this.queueUpdate(filePath, 'remove');
  }

  attachMeta(meta = {}) {
    if (!meta || typeof meta !== 'object') return;
    if (!this.pendingMeta) this.pendingMeta = {};
    if (meta.action) this.pendingMeta.action = meta.action;
    if (meta.meta) {
      this.pendingMeta.meta = {
        ...(this.pendingMeta.meta || {}),
        ...meta.meta,
      };
    }
    const compatibilityKeys = ['affectedGames', 'sourceFolder', 'targetFolder', 'operations'];
    for (const key of compatibilityKeys) {
      if (meta[key] !== undefined) {
        this.pendingMeta[key] = meta[key];
      }
    }

    this.scheduleProcessBatch();
  }

  scheduleProcessBatch() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);
  }

  processBatch() {
    if (this.pendingUpdates.size === 0 && !this.pendingMeta) {
      this.batchTimeout = null;
      return;
    }

    const payload = {
      added: [],
      updated: [],
      removed: [],
    };

    for (const [filePath, { type, data }] of this.pendingUpdates) {
      if (type === 'add' && data) {
        payload.added.push(data);
      } else if (type === 'update' && data) {
        payload.updated.push(data);
      } else if (type === 'remove') {
        payload.removed.push(filePath);
      }
    }

    if (this.pendingMeta) {
      Object.assign(payload, this.pendingMeta);
    }

    broadcastToAll('games-incremental-update', payload);

    this.pendingUpdates.clear();
    this.pendingMeta = null;
    this.batchTimeout = null;
  }

  updateFolderMembership(filePaths, folderId, action) {
    if (!folderId || !action) return;
    const list = Array.isArray(filePaths) ? filePaths : [filePaths];
    if (!list || list.length === 0) return;
    const key = `${folderId}:${action}`;
    if (!this.membershipQueue.has(key)) {
      this.membershipQueue.set(key, new Set());
    }
    const bucket = this.membershipQueue.get(key);
    for (const fp of list) {
      if (fp) bucket.add(fp);
    }
    this.scheduleMembershipBroadcast();
  }

  scheduleMembershipBroadcast() {
    if (this.membershipTimeout) {
      clearTimeout(this.membershipTimeout);
    }
    this.membershipTimeout = setTimeout(() => {
      this.flushMembershipQueue();
    }, this.BATCH_DELAY);
  }

  flushMembershipQueue() {
    if (this.membershipQueue.size === 0) {
      this.membershipTimeout = null;
      return;
    }

    const payload = [];
    for (const [key, filePathSet] of this.membershipQueue) {
      const [folderId, action] = key.split(':');
      const filePaths = Array.from(filePathSet);
      if (filePaths.length === 0) continue;
      payload.push({
        filePaths,
        folderId: isNaN(Number(folderId)) ? folderId : Number(folderId),
        operation: action,
      });
    }

    this.membershipQueue.clear();
    this.membershipTimeout = null;

    if (payload.length > 0) {
      broadcastToAll('folder-membership-changed', payload);
    }
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
