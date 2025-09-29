// src/main/ipc/unified-events.js
// Unified event system replacing scattered broadcast mechanisms

const { getStoreBridge } = require('../store-bridge');
const { BrowserWindow } = require('electron');

// Compatibility helper: directly send to all renderer windows
function sendToAllWindows(channel, payload, excludeWindowId = null) {
  try {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (excludeWindowId && win && win.id === excludeWindowId) continue;
      if (win && !win.isDestroyed() && win.webContents) {
        try {
          win.webContents.send(channel, payload);
        } catch (e) {
          console.error(
            '[UnifiedEvents] Failed to send to window:',
            e && e.message ? e.message : e
          );
        }
      }
    }
  } catch (e) {
    console.warn('[UnifiedEvents] sendToAllWindows error:', e && e.message ? e.message : e);
  }
}

class UnifiedEventSystem {
  constructor() {
    this.bridge = getStoreBridge();
    this.eventQueue = [];
    this.isProcessing = false;
    this.batchTimeout = null;
  }

  // Queue event for batched processing
  queueEvent(eventType, payload, excludeWindowId = null) {
    this.eventQueue.push({
      type: eventType,
      payload,
      excludeWindowId: excludeWindowId || null,
      timestamp: Date.now(),
    });

    // Batch events to avoid overwhelming the UI
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, 16); // ~60fps batching
  }

  // Process queued events in batch
  async processBatch() {
    // Batch and send events with error recovery
    this.flush();
  }

  flush() {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Group events by type for intelligent merging
      const groupedEvents = this.groupEvents(events);
      // Build batch context for cross-type optimizations (e.g., suppress folder-changed when updated exists)
      const batchContext = this.buildBatchContext(groupedEvents);

      // Send merged events with individual error handling
      for (const [eventType, eventData] of groupedEvents) {
        try {
          // Process grouped events using the smart handler
          this.processEventGroup(eventType, eventData, batchContext);
        } catch (error) {
          console.error(`[UnifiedEvents] Failed to broadcast ${eventType}:`, error);

          // Re-queue critical events for retry
          if (this.isCriticalEvent(eventType)) {
            // Re-queue original events to preserve payload and excludeWindowId
            for (const ev of Array.isArray(eventData) ? eventData : []) {
              try {
                this.queueEvent(ev.type, ev.payload, ev.excludeWindowId || null);
              } catch (_) {}
            }
          }
        }
      }
    } catch (error) {
      console.error('[UnifiedEvents] Critical error during flush:', error);

      // Emergency fallback: re-queue all events
      events.forEach((event) => {
        this.eventQueue.push(event);
      });
    }
  }

  // Determine if an event is critical and should be retried
  isCriticalEvent(eventType) {
    const criticalEvents = [
      'games-loaded',
      'games-incremental-update',
      'folder-membership-changed',
      'store-sync',
    ];
    return criticalEvents.includes(eventType);
  }

  // Group similar events to reduce redundant updates
  groupEvents(events) {
    const groups = new Map();

    for (const event of events) {
      if (!groups.has(event.type)) {
        groups.set(event.type, []);
      }
      groups.get(event.type).push(event);
    }

    return groups;
  }

  // Build per-batch context used for cross-type deduplication
  buildBatchContext(groups) {
    const excludeWithUpdated = new Set(); // key: String(excludeId|null)
    try {
      const updated = groups.get('folder-updated');
      if (Array.isArray(updated)) {
        for (const ev of updated) {
          const key = ev && (ev.excludeWindowId == null ? 'null' : String(ev.excludeWindowId));
          excludeWithUpdated.add(key);
        }
      }
    } catch (_) {}
    return { excludeWithUpdated };
  }

  // Process a group of similar events
  async processEventGroup(eventType, events, context = {}) {
    // 依 excludeWindowId 分組，確保不回送給來源視窗
    const byExclude = new Map(); // excludeId (null|number) -> events[]
    for (const ev of events) {
      const key = ev.excludeWindowId == null ? null : ev.excludeWindowId;
      if (!byExclude.has(key)) byExclude.set(key, []);
      byExclude.get(key).push(ev);
    }

    const send = (channel, payload, excludeId) =>
      sendToAllWindows(channel, payload, excludeId == null ? null : excludeId);

    switch (eventType) {
      case 'games-updated': {
        // 只發送最新一次的全量列表
        for (const [excludeId, evts] of byExclude) {
          const latest = evts[evts.length - 1];
          send('games-updated', latest.payload, excludeId);
        }
        break;
      }

      case 'folder-membership-changed': {
        // 合併所有 membership 變化；payload 可能是陣列或單一物件
        for (const [excludeId, evts] of byExclude) {
          const merged = this.mergeFolderMembershipPayloads(evts);
          if (merged.length > 0) {
            send('folder-membership-changed', merged, excludeId);
          }
        }
        break;
      }

      case 'folder-updated': {
        // 對每個資料夾只發最後一次更新
        for (const [excludeId, evts] of byExclude) {
          const lastById = new Map();
          for (const e of evts) {
            const fid = e?.payload?.id;
            if (fid != null) lastById.set(fid, e.payload);
            else lastById.set(Symbol('noid'), e.payload);
          }
          for (const payload of lastById.values()) {
            send('folder-updated', payload, excludeId);
          }
        }
        break;
      }

      case 'folder-changed': {
        // 若同批已有 folder-updated，則忽略相同 excludeId 的 folder-changed，避免雙重刷新
        const excludeWithUpdated = context && context.excludeWithUpdated;
        for (const [excludeId, evts] of byExclude) {
          const k = excludeId == null ? 'null' : String(excludeId);
          const hasUpdated = excludeWithUpdated && excludeWithUpdated.has(k);
          if (hasUpdated) continue; // 抑制多餘的 folder-changed
          // 仍保持批次內只送一次（取最後一個）
          const latest = evts[evts.length - 1];
          send('folder-changed', latest ? latest.payload : undefined, excludeId);
        }
        break;
      }

      case 'drag-session-started':
      case 'drag-session:started': {
        for (const [excludeId, evts] of byExclude) {
          const latest = evts[evts.length - 1];
          send('drag-session:started', latest.payload, excludeId);
        }
        break;
      }

      case 'drag-session-ended':
      case 'drag-session:ended': {
        for (const [excludeId, evts] of byExclude) {
          const latest = evts[evts.length - 1];
          send('drag-session:ended', latest.payload, excludeId);
        }
        break;
      }

      case 'drag-session:updated': {
        // 高頻事件：僅取最後一次位置更新
        for (const [excludeId, evts] of byExclude) {
          const latest = evts[evts.length - 1];
          send('drag-session:updated', latest.payload, excludeId);
        }
        break;
      }

      case 'scan:progress': {
        // 掃描進度高頻：僅傳遞最新一次進度
        for (const [excludeId, evts] of byExclude) {
          const latest = evts[evts.length - 1];
          send('scan:progress', latest.payload, excludeId);
        }
        break;
      }

      default: {
        // 其他事件：維持原始頻道名稱逐一送出（但仍在批次一次發）
        for (const [excludeId, evts] of byExclude) {
          for (const e of evts) {
            send(e.type, e.payload, excludeId);
          }
        }
      }
    }
  }

  // Merge folder membership changes to reduce redundant updates
  mergeFolderChanges(events) {
    const changeMap = new Map(); // folderId -> { add: Set, remove: Set }

    for (const event of events) {
      const { folderId, filePaths, operation } = event.payload;

      if (!changeMap.has(folderId)) {
        changeMap.set(folderId, { add: new Set(), remove: new Set() });
      }

      const changes = changeMap.get(folderId);
      const pathSet = changes[operation];

      filePaths.forEach((path) => pathSet.add(path));
    }

    // Convert back to array format
    const result = [];
    for (const [folderId, changes] of changeMap) {
      if (changes.add.size > 0) {
        result.push({
          folderId,
          filePaths: Array.from(changes.add),
          operation: 'add',
        });
      }
      if (changes.remove.size > 0) {
        result.push({
          folderId,
          filePaths: Array.from(changes.remove),
          operation: 'remove',
        });
      }
    }

    return result;
  }

  // 兼容批次輸入（payload 可能已是多個變更物件的陣列）
  mergeFolderMembershipPayloads(events) {
    const flatten = [];
    for (const e of events) {
      const p = e && e.payload;
      if (!p) continue;
      if (Array.isArray(p)) flatten.push(...p);
      else if (typeof p === 'object') flatten.push(p);
    }
    if (flatten.length === 0) return [];
    const normalized = [];
    for (const x of flatten) {
      const folderId = x.folderId ?? null;
      const filePaths = Array.isArray(x.filePaths) ? x.filePaths : x.filePath ? [x.filePath] : [];
      const op = x.operation || x.action || null; // 支援 action/operation
      if (!folderId || filePaths.length === 0) continue;
      if (op !== 'add' && op !== 'remove') continue;
      normalized.push({ payload: { folderId, filePaths, operation: op } });
    }
    if (normalized.length === 0) return [];
    return this.mergeFolderChanges(normalized);
  }

  // Immediate event (bypasses batching)
  emitImmediate(eventType, payload, excludeWindowId = null) {
    // 為了『全盤批次』一致性，仍走 queue，避免繞過批次
    this.queueEvent(eventType, payload, excludeWindowId);
  }

  // Replace legacy broadcastToAll function
  // Compatibility mode: immediately send to renderer channels to preserve existing UI wiring.
  // Supports excludeWindowId to avoid echo to sender when needed.
  broadcastToAll(eventType, payload, excludeWindowId = null) {
    // 改為：僅排入批次佇列，由 queue/processBatch 統一送出
    this.queueEvent(eventType, payload, excludeWindowId);
  }

  // Shutdown cleanup
  shutdown() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Process remaining events
    if (this.eventQueue.length > 0) {
      this.processBatch();
    }
  }
}

// Singleton instance
let eventSystemInstance = null;

function getUnifiedEventSystem() {
  if (!eventSystemInstance) {
    eventSystemInstance = new UnifiedEventSystem();
  }
  return eventSystemInstance;
}

// Legacy compatibility wrapper
function broadcastToAll(eventType, payload, excludeWindowId = null) {
  const eventSystem = getUnifiedEventSystem();
  eventSystem.broadcastToAll(eventType, payload, excludeWindowId);
}

module.exports = {
  UnifiedEventSystem,
  getUnifiedEventSystem,
  broadcastToAll,
};
