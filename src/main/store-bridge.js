// src/main/store-bridge.js
// Bridge between main process cache and renderer store

const { getGameStateCache } = require('./utils/game-state-cache');

class StoreBridge {
  constructor() {
    this.cache = getGameStateCache();
    this.rendererWindows = new Set();
  }

  // Register renderer window for store updates
  registerWindow(window) {
    this.rendererWindows.add(window);
    
    // Send initial state
    this.syncToRenderer(window);
    
    // Cleanup on window close
    window.on('closed', () => {
      this.rendererWindows.delete(window);
    });
  }

  // Sync cache state to specific renderer
  syncToRenderer(window) {
    if (window.isDestroyed()) return;
    
    try {
      const games = this.cache.getAllGames();
      const folderMembership = this.buildFolderMembershipArray();
      
      window.webContents.send('store-sync', {
        type: 'FULL_SYNC',
        payload: {
          games,
          folderMembership
        }
      });
    } catch (e) {
      console.warn('[StoreBridge] Sync failed:', e.message);
    }
  }

  // Broadcast to all renderer windows
  broadcastToRenderers(action) {
    this.rendererWindows.forEach(window => {
      if (window.isDestroyed()) return;
      
      try {
        window.webContents.send('store-action', action);
      } catch (e) {
        console.warn('[StoreBridge] Broadcast failed:', e.message);
      }
    });
  }

  // Handle cache updates and broadcast changes
  onCacheUpdate(changeType, data) {
    let action;
    
    switch (changeType) {
      case 'games-loaded':
        action = {
          type: 'GAMES_LOADED',
          payload: data.games
        };
        break;
        
      case 'folder-membership-changed':
        action = {
          type: 'FOLDER_MEMBERSHIP_CHANGED',
          payload: {
            filePaths: data.filePaths,
            folderId: data.folderId,
            operation: data.operation
          }
        };
        break;
        
      case 'games-incremental-update':
        action = {
          type: 'GAMES_INCREMENTAL_UPDATE',
          payload: data
        };
        break;
        
      default:
        return;
    }
    
    this.broadcastToRenderers(action);
  }

  // Convert Map-based folder membership to array format
  buildFolderMembershipArray() {
    const result = [];
    for (const [filePath, folderSet] of this.cache.folderMembership) {
      for (const folderId of folderSet) {
        result.push({ filePath, folderId });
      }
    }
    return result;
  }

  // Initialize cache and sync to all windows
  async initialize() {
    try {
      await this.cache.initialize();
      
      // Sync to all registered windows
      this.rendererWindows.forEach(window => {
        this.syncToRenderer(window);
      });
      
      return true;
    } catch (e) {
      console.error('[StoreBridge] Initialize failed:', e);
      return false;
    }
  }

  // Handle renderer actions that affect main process
  handleRendererAction(action) {
    switch (action.type) {
      case 'REQUEST_FULL_SYNC':
        this.rendererWindows.forEach(window => {
          this.syncToRenderer(window);
        });
        break;
        
      case 'CACHE_INVALIDATE':
        this.cache.markDirty();
        break;
        
      default:
        console.warn('[StoreBridge] Unknown renderer action:', action.type);
    }
  }
}

// Singleton instance
let bridgeInstance = null;

function getStoreBridge() {
  if (!bridgeInstance) {
    bridgeInstance = new StoreBridge();
  }
  return bridgeInstance;
}

module.exports = { StoreBridge, getStoreBridge };
