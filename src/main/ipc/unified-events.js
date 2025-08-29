// src/main/ipc/unified-events.js
// Unified event system replacing scattered broadcast mechanisms

const { getStoreBridge } = require('../store-bridge');

class UnifiedEventSystem {
  constructor() {
    this.bridge = getStoreBridge();
    this.eventQueue = [];
    this.isProcessing = false;
    this.batchTimeout = null;
  }

  // Queue event for batched processing
  queueEvent(eventType, payload) {
    this.eventQueue.push({ type: eventType, payload, timestamp: Date.now() });
    
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
      
      // Send merged events with individual error handling
      for (const [eventType, eventData] of groupedEvents) {
        try {
          this.broadcastToAll(eventType, eventData);
        } catch (error) {
          console.error(`[UnifiedEvents] Failed to broadcast ${eventType}:`, error);
          
          // Re-queue critical events for retry
          if (this.isCriticalEvent(eventType)) {
            this.queueEvent(eventType, eventData, 'high');
          }
        }
      }
    } catch (error) {
      console.error('[UnifiedEvents] Critical error during flush:', error);
      
      // Emergency fallback: re-queue all events
      events.forEach(event => {
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
      'store-sync'
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

  // Process a group of similar events
  async processEventGroup(eventType, events) {
    switch (eventType) {
      case 'games-updated':
        // Only send the latest games update
        const latestGamesUpdate = events[events.length - 1];
        this.bridge.onCacheUpdate('games-loaded', {
          games: latestGamesUpdate.payload
        });
        break;
        
      case 'folder-membership-changed':
        // Merge all folder membership changes
        const mergedChanges = this.mergeFolderChanges(events);
        for (const change of mergedChanges) {
          this.bridge.onCacheUpdate('folder-membership-changed', change);
        }
        break;
        
      case 'folder-updated':
        // Send all folder updates (they're typically different folders)
        for (const event of events) {
          this.bridge.broadcastToRenderers({
            type: 'FOLDER_UPDATED',
            payload: event.payload
          });
        }
        break;
        
      case 'drag-session-started':
      case 'drag-session-ended':
        // Only send the latest drag session state
        const latestDragEvent = events[events.length - 1];
        this.bridge.broadcastToRenderers({
          type: eventType === 'drag-session-started' ? 'DRAG_SESSION_STARTED' : 'DRAG_SESSION_ENDED',
          payload: latestDragEvent.payload
        });
        break;
        
      default:
        // Pass through other events as-is
        for (const event of events) {
          this.bridge.broadcastToRenderers({
            type: event.type.toUpperCase().replace(/-/g, '_'),
            payload: event.payload
          });
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
      
      filePaths.forEach(path => pathSet.add(path));
    }
    
    // Convert back to array format
    const result = [];
    for (const [folderId, changes] of changeMap) {
      if (changes.add.size > 0) {
        result.push({
          folderId,
          filePaths: Array.from(changes.add),
          operation: 'add'
        });
      }
      if (changes.remove.size > 0) {
        result.push({
          folderId,
          filePaths: Array.from(changes.remove),
          operation: 'remove'
        });
      }
    }
    
    return result;
  }

  // Immediate event (bypasses batching)
  emitImmediate(eventType, payload) {
    this.processEventGroup(eventType, [{ type: eventType, payload }]);
  }

  // Replace legacy broadcastToAll function
  broadcastToAll(eventType, payload) {
    this.queueEvent(eventType, payload);
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
function broadcastToAll(eventType, payload) {
  const eventSystem = getUnifiedEventSystem();
  eventSystem.broadcastToAll(eventType, payload);
}

module.exports = { 
  UnifiedEventSystem, 
  getUnifiedEventSystem, 
  broadcastToAll 
};
