# J2ME Launcher 性能優化指南

本指南基於實際優化經驗，提供系統性的性能優化策略與最佳實踐。

> **最後更新**: 2025-09-02  
> **版本**: v2.2.0  
> **狀態**: ✅ 已完成虛擬化架構清理與統一布局系統

## 核心性能瓶頸與解決方案

### 1. 大量遊戲渲染問題

**問題**：數千款遊戲同時渲染導致 UI 卡頓

**解決方案**：
- **虛擬化渲染**：使用 `react-window` 僅渲染可見項目
- **錯誤邊界**：虛擬化失敗時優雅降級到普通網格
- **記憶體池**：統一管理 URL 物件生命週期
- **無效過濾**：Hook 層面過濾 `undefined` 遊戲物件
- **靜默處理**：避免不必要的控制台警告

```javascript
// VirtualizedUnifiedGrid.jsx 核心實現
const VirtualizedUnifiedGrid = ({ games, folders, ...props }) => {
  // 智能虛擬化：根據項目數量自動切換
  const shouldVirtualize = items.length > VIRTUALIZATION_THRESHOLD;
  
  if (shouldVirtualize) {
    return (
      <FixedSizeGrid
        columnCount={gridDimensions.columnCount}
        rowCount={gridDimensions.rowCount}
        itemData={{ items, ...itemData }}
      >
        {GridCell}
      </FixedSizeGrid>
    );
  }
  
  // 非虛擬化模式使用統一的絕對定位系統
  return (
    <div className="regular-grid" style={{ 
      position: 'relative',
      width: gridDimensions.width,
      height: gridDimensions.height
    }}>
      {items.map((item, index) => {
        const style = calculateAbsolutePosition(index, gridDimensions);
        return <GridCell key={item.id} style={style} data={itemData} />;
      })}
    </div>
  );
};
```

### 2. 拖拽操作性能問題

**問題**：每次拖拽觸發全量遊戲重新載入

**原始瓶頸**：
```javascript
// 問題代碼：每次操作都查詢全部遊戲
const sqlGames = getAllGamesFromSql();
broadcastToAll('games-updated', addUrlToGames(sqlGames));
```

**優化策略**：
- **增量更新**：僅傳遞變更的遊戲資料
- **批次操作**：合併多個操作為單一事務
- **狀態快取**：主進程維護遊戲狀態快取
- **序列化安全**：`addUrlToGames` 過濾不可序列化屬性
- **IPC 優化**：`broadcastToAll` 預先序列化檢查

```javascript
// 優化後：增量更新事件
ipcMain.handle('games-incremental-update', (event, changes) => {
  const { added, updated, removed } = changes;
  // 確保序列化安全
  const safePayload = {
    added: added.filter(game => game && game.filePath),
    updated: updated.filter(game => game && game.filePath),
    removed: removed.filter(game => game && game.filePath)
  };
  broadcastToAll('games-incremental-update', safePayload);
});
```

### 3. 資料庫查詢優化

**索引策略**：
```sql
-- 複合索引優化資料夾查詢
CREATE INDEX idx_folder_games_composite ON folder_games(folderId, filePath);

-- 啟用目錄過濾索引
CREATE INDEX idx_games_filepath_pattern ON games(filePath);
```

**查詢優化**：
```javascript
// 避免 SELECT *，使用具體欄位
const games = db.prepare(`
  SELECT filePath, gameName, vendor, iconPath, fileSize
  FROM games g
  WHERE EXISTS (
    SELECT 1 FROM directories d
    WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
  )
`).all();
```

## 狀態管理優化

### 1. GameStore 設計原則

**不可變更新**：
```javascript
// 正確：創建新物件
const newState = {
  ...state,
  games: [...state.games, newGame],
  gamesById: { ...state.gamesById, [newGame.filePath]: newGame }
};

// 錯誤：直接修改
state.games.push(newGame); // 會導致 React 渲染問題
```

**批次更新**：
```javascript
// 合併多個狀態變更
dispatch({
  type: 'BATCH_UPDATE',
  payload: {
    games: updatedGames,
    folderMembership: updatedMembership,
    ui: { loading: false }
  }
});
```

### 2. 選擇器優化

**記憶化選擇器**：
```javascript
export function useGamesByFolder(folderId) {
  const selector = useCallback((state) => {
    const games = Array.isArray(state.games) ? state.games : [];
    // 先過濾無效遊戲物件，避免渲染錯誤
    const validGames = games.filter(game => game && game.filePath);
    
    return validGames.filter(game => {
      const folders = state.folderMembership[game.filePath];
      return folders && folders.includes(folderId);
    });
  }, [folderId]);

  const [games] = useGameStore(selector);
  return games;
}
```

## 渲染性能優化

### 1. React 優化技巧

**組件記憶化**：
```javascript
const GameCard = React.memo(({ game, isSelected, ...props }) => {
  // 組件實現
}, (prevProps, nextProps) => {
  // 自訂比較邏輯
  return prevProps.game.filePath === nextProps.game.filePath &&
         prevProps.isSelected === nextProps.isSelected;
});
```

**Hook 優化**：
```javascript
// 使用 useMemo 避免重複計算
const filteredGames = useMemo(() => {
  if (!searchTerm) return games;
  return games.filter(game => 
    game.gameName?.toLowerCase().includes(searchTerm.toLowerCase())
  );
}, [games, searchTerm]);
```

### 2. 動畫性能

**統一布局系統**：
```javascript
// 統一的絕對定位系統，消除雙重布局架構
const calculateAbsolutePosition = (index, gridDimensions) => {
  const columnIndex = index % gridDimensions.columnCount;
  const rowIndex = Math.floor(index / gridDimensions.columnCount);
  
  return {
    position: 'absolute',
    left: columnIndex * gridDimensions.itemWidth,
    top: rowIndex * ITEM_HEIGHT,
    width: gridDimensions.itemWidth,
    height: ITEM_HEIGHT
  };
```

## 記憶體管理

### 1. URL 物件管理

**記憶體池模式**：
```javascript
class MemoryPool {
  constructor() {
    this.urlCache = new Map();
    this.cleanupQueue = [];
  }
  
  createObjectURL(blob, identifier) {
    // 撤銷舊 URL
    if (this.urlCache.has(identifier)) {
      URL.revokeObjectURL(this.urlCache.get(identifier));
    }
    
    const url = URL.createObjectURL(blob);
    this.urlCache.set(identifier, url);
    
    // 定期清理
    this.scheduleCleanup(identifier);
    return url;
  }
  
  cleanup() {
    this.urlCache.forEach(url => URL.revokeObjectURL(url));
    this.urlCache.clear();
  }
}
```

### 2. 事件監聽器管理

**自動清理**：
```javascript
useEffect(() => {
  const handleResize = () => {
    // 處理視窗大小變更
  };
  
  window.addEventListener('resize', handleResize);
  
  // 清理函式
  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);
```

## IPC 通訊優化

### 1. 序列化安全

**自動序列化檢查**：
```javascript
// main.js - broadcastToAll 序列化安全
function broadcastToAll(channel, payload, excludeWindowId = null) {
  let serializedPayload;
  try {
    serializedPayload = JSON.parse(JSON.stringify(payload));
  } catch (e) {
    console.warn(`Payload serialization failed for ${channel}:`, e.message);
    // 創建安全的 payload
    serializedPayload = cleanPayload(payload);
  }
  
  // 安全廣播到所有窗口
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, serializedPayload);
  }
}
```

**遊戲物件清理**：
```javascript
// icon-url.js - addUrlToGames 序列化清理
function addUrlToGames(games) {
  return games.map(game => {
    const cleanGame = {};
    for (const [key, value] of Object.entries(game)) {
      // 只保留可序列化的屬性
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        cleanGame[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        try {
          JSON.stringify(value);
          cleanGame[key] = value;
        } catch (e) {
          // 跳過不可序列化的屬性
        }
      }
    }
    cleanGame.iconUrl = toIconUrl(cleanGame.iconPath);
    return cleanGame;
  });
}
```

### 2. 批次處理

**合併 IPC 調用**：
```javascript
// 批次移除遊戲
ipcMain.handle('batch-remove-games-from-folder', async (event, filePaths, folderId) => {
  const db = getDB();
  const transaction = db.transaction(() => {
    filePaths.forEach(filePath => {
      db.prepare('DELETE FROM folder_games WHERE filePath = ? AND folderId = ?')
        .run(filePath, folderId);
    });
  });
  
  transaction();
  
  // 單次廣播
  broadcastToAll('games-incremental-update', {
    removed: filePaths.map(filePath => ({ filePath, folderId }))
  });
});
```

### 3. 錯誤處理與重試

**重試機制**：
```javascript
const withRetry = async (operation, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
    }
  }
};
```

## 開發模式優化

### 1. 熱重載配置

**Vite 配置**：
```javascript
// vite.config.js
export default {
  server: {
    hmr: {
      overlay: false // 避免錯誤覆蓋層影響測試
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom'] // 預建構依賴
  }
};
```

### 2. 開發工具

**性能監控**：
```javascript
// 開發模式下的性能監控
if (process.env.NODE_ENV === 'development') {
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      if (entry.duration > 16) { // 超過一幀時間
        console.warn(`Slow operation: ${entry.name} took ${entry.duration}ms`);
      }
    });
  });
  
  observer.observe({ entryTypes: ['measure'] });
}
```

## 性能監控與調試

### 1. 關鍵指標

**渲染性能**：
- FPS (Frames Per Second)
- 首次內容繪製 (FCP)
- 最大內容繪製 (LCP)

**記憶體使用**：
- 堆記憶體使用量
- URL 物件數量
- 事件監聽器數量

### 2. 調試工具

**React DevTools**：
- Profiler 分析組件渲染時間
- Components 檢查組件狀態

**Electron DevTools**：
- Performance 面板分析性能瓶頸
- Memory 面板檢查記憶體洩漏

## 最佳實踐總結

### 1. 渲染優化
- ✅ 使用虛擬化處理大列表
- ✅ 實施組件記憶化
- ✅ 避免不必要的重新渲染
- ✅ 使用 CSS 動畫替代 JavaScript 動畫
- ✅ Hook 層面過濾無效遊戲物件
- ✅ 靜默處理渲染錯誤

### 2. 狀態管理
- ✅ 保持狀態結構扁平
- ✅ 使用不可變更新
- ✅ 實施批次狀態更新
- ✅ 避免深層嵌套選擇器

### 3. 資料庫操作
- ✅ 使用適當的索引
- ✅ 避免 N+1 查詢問題
- ✅ 實施查詢結果快取
- ✅ 使用事務處理批次操作

### 4. 記憶體管理
- ✅ 及時清理事件監聽器
- ✅ 撤銷不再使用的 URL 物件
- ✅ 避免閉包記憶體洩漏
- ✅ 定期執行垃圾回收

### 5. IPC 通訊優化
- ✅ 所有 payload 經過序列化檢查
- ✅ 自動清理不可序列化屬性
- ✅ 防禦性參數類型檢查
- ✅ 錯誤降級與重試機制

---

遵循這些優化策略，J2ME Launcher 能夠在處理數千款遊戲時保持流暢的用戶體驗。記住 Linus 的話："Premature optimization is the root of all evil" - 但當瓶頸明確時，果斷優化。

## 最新優化成果 (v2.1.0)

- ✅ **序列化安全**: 修復所有 "An object could not be cloned" 錯誤
- ✅ **狀態一致性**: Hook 層面無效物件過濾
- ✅ **渲染穩定**: 消除 VirtualizedUnifiedGrid 無效遊戲警告
- ✅ **IPC 可靠**: 全面的參數序列化檢查
- ✅ **錯誤處理**: 分層錯誤處理與優雅降級
