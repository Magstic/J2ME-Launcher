// src/utils/memory-pool.js
// Smart memory pool for game icons and metadata

class MemoryPool {
  constructor(maxSize = 50 * 1024 * 1024) { // 50MB default
    this.maxSize = maxSize;
    this.currentSize = 0;
    this.cache = new Map(); // filePath -> { data, size, lastAccess, priority }
    this.accessCount = 0;
    this.cleanupThreshold = 0.8; // Cleanup when 80% full
  }

  // Add item to pool with smart eviction
  set(key, data, priority = 1) {
    const size = this.estimateSize(data);
    
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.currentSize -= this.cache.get(key).size;
    }
    
    // Cleanup if needed
    if (this.currentSize + size > this.maxSize * this.cleanupThreshold) {
      this.cleanup(size);
    }
    
    // Add new entry
    this.cache.set(key, {
      data,
      size,
      lastAccess: ++this.accessCount,
      priority,
      timestamp: Date.now()
    });
    
    this.currentSize += size;
  }

  // Get item from pool
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Update access info
    entry.lastAccess = ++this.accessCount;
    entry.priority = Math.min(entry.priority + 0.1, 5); // Boost priority on access
    
    return entry.data;
  }

  // Check if item exists
  has(key) {
    return this.cache.has(key);
  }

  // Remove specific item
  delete(key) {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  // Smart cleanup using LRU + priority algorithm
  cleanup(requiredSpace = 0) {
    const targetSize = this.maxSize * 0.6; // Clean to 60% capacity
    const itemsToRemove = [];
    
    // Calculate eviction scores (lower = more likely to evict)
    for (const [key, entry] of this.cache) {
      const age = Date.now() - entry.timestamp;
      const accessRecency = this.accessCount - entry.lastAccess;
      
      // Score: priority * recency factor / age factor
      const score = entry.priority * (1 / (accessRecency + 1)) * (1 / (age / 60000 + 1));
      
      itemsToRemove.push({ key, entry, score });
    }
    
    // Sort by score (ascending - lowest scores evicted first)
    itemsToRemove.sort((a, b) => a.score - b.score);
    
    // Remove items until we have enough space
    let freedSpace = 0;
    for (const { key, entry } of itemsToRemove) {
      if (this.currentSize - freedSpace <= targetSize && freedSpace >= requiredSpace) {
        break;
      }
      
      this.cache.delete(key);
      freedSpace += entry.size;
    }
    
    this.currentSize -= freedSpace;
  }

  // Estimate object size in bytes
  estimateSize(obj) {
    if (typeof obj === 'string') {
      return obj.length * 2; // UTF-16
    }
    
    if (obj instanceof ArrayBuffer) {
      return obj.byteLength;
    }
    
    if (obj instanceof Blob) {
      return obj.size;
    }
    
    // For objects, rough estimation
    return JSON.stringify(obj).length * 2;
  }

  // Get pool statistics
  getStats() {
    return {
      size: this.currentSize,
      maxSize: this.maxSize,
      utilization: this.currentSize / this.maxSize,
      itemCount: this.cache.size,
      accessCount: this.accessCount
    };
  }

  // Clear entire pool
  clear() {
    this.cache.clear();
    this.currentSize = 0;
    this.accessCount = 0;
  }
}

// Icon-specific memory pool
class IconPool extends MemoryPool {
  constructor() {
    super(20 * 1024 * 1024); // 20MB for icons
  }

  // Preload icons for visible games
  async preloadIcons(games, visibleRange = { start: 0, end: 50 }) {
    const promises = [];
    
    for (let i = visibleRange.start; i < Math.min(visibleRange.end, games.length); i++) {
      const game = games[i];
      if (game.iconUrl && !this.has(game.filePath)) {
        promises.push(this.loadIcon(game.filePath, game.iconUrl));
      }
    }
    
    // Load in parallel but limit concurrency
    const chunks = [];
    for (let i = 0; i < promises.length; i += 5) {
      chunks.push(promises.slice(i, i + 5));
    }
    
    for (const chunk of chunks) {
      await Promise.allSettled(chunk);
    }
  }

  // Load single icon
  async loadIcon(filePath, iconUrl) {
    try {
      const response = await fetch(iconUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      this.set(filePath, objectUrl, 2); // Higher priority for icons
      return objectUrl;
    } catch (e) {
      console.warn(`[IconPool] Failed to load icon for ${filePath}:`, e.message);
      return null;
    }
  }

  // Get icon with fallback loading
  async getIcon(filePath, iconUrl) {
    let icon = this.get(filePath);
    
    if (!icon && iconUrl) {
      icon = await this.loadIcon(filePath, iconUrl);
    }
    
    return icon;
  }

  // Cleanup with URL revocation and memory leak detection
  cleanup(requiredSpace = 0) {
    const itemsToRemove = [];
    
    // Get items to remove using parent logic
    const targetSize = this.maxSize * 0.6;
    for (const [key, entry] of this.cache) {
      const age = Date.now() - entry.timestamp;
      const accessRecency = this.accessCount - entry.lastAccess;
      const score = entry.priority * (1 / (accessRecency + 1)) * (1 / (age / 60000 + 1));
      itemsToRemove.push({ key, entry, score });
    }
    
    itemsToRemove.sort((a, b) => a.score - b.score);
    
    let freedSpace = 0;
    const revokedUrls = [];
    
    for (const { key, entry } of itemsToRemove) {
      if (this.currentSize - freedSpace <= targetSize && freedSpace >= requiredSpace) {
        break;
      }
      
      // Revoke object URL to free memory
      if (typeof entry.data === 'string' && entry.data.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(entry.data);
          revokedUrls.push(entry.data);
        } catch (e) {
          console.warn('[IconPool] Failed to revoke URL:', entry.data, e);
        }
      }
      
      this.cache.delete(key);
      freedSpace += entry.size;
    }
    
    this.currentSize -= freedSpace;
    
    // Memory leak detection
    if (revokedUrls.length > 100) {
      console.warn('[IconPool] Large number of URLs revoked:', revokedUrls.length);
    }
  }

  // Clear with proper cleanup
  clear() {
    // Revoke all blob URLs before clearing
    for (const [key, entry] of this.cache) {
      if (typeof entry.data === 'string' && entry.data.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(entry.data);
        } catch (e) {
          console.warn('[IconPool] Failed to revoke URL during clear:', entry.data);
        }
      }
    }
    
    super.clear();
  }
}

// Singleton instances
let iconPoolInstance = null;
let memoryPoolInstance = null;

function getIconPool() {
  if (!iconPoolInstance) {
    iconPoolInstance = new IconPool();
  }
  return iconPoolInstance;
}

function getMemoryPool() {
  if (!memoryPoolInstance) {
    memoryPoolInstance = new MemoryPool();
  }
  return memoryPoolInstance;
}

module.exports = { MemoryPool, IconPool, getIconPool, getMemoryPool };
