# J2ME Launcher 性能優化指南

本指南基於實際優化經驗，提供系統性的性能優化策略與最佳實踐。

## 核心性能瓶頸與解決方案

### 1. 大量遊戲渲染問題

**問題**：數千款遊戲同時渲染導致 UI 卡頓

**解決方案**：

- **虛擬化渲染**：使用 `react-window` 僅渲染可見項目
- **雙模式渲染**：大列表啟用虛擬化，小列表或關閉虛擬化時使用普通網格（非 runtime 錯誤 fallback）
- **記憶體池（設計草案）**：統一管理 URL 物件生命週期（目前專案主要透過 `safe-file://` 協議載入圖示，尚未實作 object URL 池化）
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
    <div
      className="regular-grid"
      style={{
        position: 'relative',
        width: gridDimensions.width,
        height: gridDimensions.height,
      }}
    >
      {items.map((item, index) => {
        const style = calculateAbsolutePosition(index, gridDimensions);
        return <GridCell key={item.id} style={style} data={itemData} />;
      })}
    </div>
  );
};
```

#### 虛擬化落地細節與常見陷阱

- **容器必須可滾動**：避免 `overflow: visible`。否則容器高度會撐到內容總高，導致 `scrollHeight === clientHeight`，虛擬化偵測失效而全量渲染。
- **正確的滾動容器**：由 `react-window` 的 Grid 外層（`outerRef`）負責滾動；其 `style` 必須啟用 `overflowY: 'auto'`：

```jsx
<Grid
  columnCount={gridDimensions.columnCount}
  columnWidth={gridDimensions.itemWidth}
  height={gridDimensions.height}
  rowCount={rowCount}
  rowHeight={ITEM_HEIGHT}
  width={gridDimensions.width}
  outerRef={gridOuterRef}
  style={{ overflowX: 'hidden', overflowY: 'auto' }}
>
  {GridCell}
</Grid>
```

- 外層容器（例如 `.desktop-view .desktop-grid`）維持 `overflow: hidden`，由 Grid 外層管理滾動；切勿設為 `overflow: visible`。

- **檢查清單（Debug Checklist）**：
  - 檢查容器：`el.scrollHeight > el.clientHeight` 應為 true。
  - 檢查可見範圍：`visibleStart/visibleEnd` 應只覆蓋當前視窗附近的項目（約數百，而非全量）。
  - 檢查布局：避免其他 CSS 導致容器高度被動放大（例如父層 `height: auto` 並把內容撐滿）。
  - 非虛擬化分支應使用單一絕對定位系統，避免雙重布局帶來回流/重繪成本。

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
    added: added.filter((game) => game && game.filePath),
    updated: updated.filter((game) => game && game.filePath),
    removed: removed.filter((game) => game && game.filePath),
  };
  broadcastToAll('games-incremental-update', safePayload);
});
```

> 註：實際程式碼中，`games-incremental-update` 事件由 `src/main/ipc/incremental-updates.js` 的 `IncrementalUpdater` 單例負責組裝與廣播，各 IPC handler 透過 `queueUpdate` / `updateFolderMembership` 呼叫它，而不是直接註冊 `ipcMain.handle('games-incremental-update')`。此段程式碼主要說明「先在主進程整理增量，再一次廣播」的設計思路。

### 3. 資料庫查詢優化

**索引策略**：

```sql
-- 複合索引優化資料夾查詢
CREATE INDEX idx_folder_games_composite ON folder_games(folderId, filePath);

-- 啟用目錄過濾索引
CREATE INDEX idx_games_filepath_pattern ON games(filePath);
```

> 註：`idx_folder_games_composite` 已在 `src/main/db.js` 的 schema 初始化中建立；`idx_games_filepath_pattern` 為可選索引，目前預設 schema 未啟用，如需針對特定檔案路徑篩選優化，可依實際查詢模式選擇性建立。

**查詢優化**：

```javascript
// 避免 SELECT *，使用具體欄位
const games = db
  .prepare(
    `
  SELECT filePath, gameName, vendor, iconPath, fileSize
  FROM games g
  WHERE EXISTS (
    SELECT 1 FROM directories d
    WHERE d.enabled = 1 AND g.filePath GLOB (d.path || '*')
  )
`
  )
  .all();
```

## 狀態管理優化

### 1. GameStore 設計原則

**不可變更新**：

```javascript
// 正確：創建新物件
const newState = {
  ...state,
  games: [...state.games, newGame],
  gamesById: { ...state.gamesById, [newGame.filePath]: newGame },
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
    ui: { loading: false },
  },
});
```

> 註：目前 `GameStore` 並沒有實作通用的 `BATCH_UPDATE` action，而是透過 `dispatch` 內建的 `actionQueue` 機制在 store 內批次處理多個 action。以上程式碼是建議模式，如需使用可自行在 `src/store/GameStore.js` 中擴充對應 reducer 與 action creator。

### 2. 選擇器優化

**記憶化選擇器**：

```javascript
export function useGamesByFolder(folderId) {
  const selector = useCallback(
    (state) => {
      const games = Array.isArray(state.games) ? state.games : [];
      // 先過濾無效遊戲物件，避免渲染錯誤
      const validGames = games.filter((game) => game && game.filePath);

      return validGames.filter((game) => {
        const folders = state.folderMembership[game.filePath];
        return folders && folders.includes(folderId);
      });
    },
    [folderId]
  );

  const [games] = useGameStore(selector);
  return games;
}
```

## 渲染性能優化

### 1. React 優化技巧

**組件記憶化**：

```javascript
const GameCard = React.memo(
  ({ game, isSelected, ...props }) => {
    // 組件實現
  },
  (prevProps, nextProps) => {
    // 自訂比較邏輯
    return (
      prevProps.game.filePath === nextProps.game.filePath &&
      prevProps.isSelected === nextProps.isSelected
    );
  }
);
```

**Hook 優化**：

```javascript
// 使用 useMemo 避免重複計算
const filteredGames = useMemo(() => {
  if (!searchTerm) return games;
  return games.filter((game) => game.gameName?.toLowerCase().includes(searchTerm.toLowerCase()));
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

### 3. 框選（Selection Box）最佳化

- **事件節流**：在 `pointermove`/`mousemove` 中以 `requestAnimationFrame` 包裹更新，避免高頻 `getBoundingClientRect()` 觸發同步樣式計算。
- **快取計算**：
  - 初次顯示框選時建立可見卡片的邊界快取；移動過程僅對位移區域做增量檢查。
  - 視窗尺寸或捲動改變時再失效快取。
- **查詢域縮小**：只對「實際渲染在 DOM 中」的卡片元素進行命中測試（與虛擬化策略一致）。
- **避免強制同步佈局**：將讀（量測）與寫（樣式變更）分離，同一幀內批量更新。

## 記憶體管理

### 1. URL 物件管理

> 註：目前專案沒有在 renderer 端使用 `URL.createObjectURL` 來產生圖示 URL，而是透過 `safe-file://` 協議與 `toIconUrl()`（見 `src/main/utils/icon-url.js`）載入圖示，因此沒有真正的 `MemoryPool` 類別。以下程式碼為未來若引入 object URL 時可參考的設計範例。

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
    this.urlCache.forEach((url) => URL.revokeObjectURL(url));
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
// 示例：在廣播前對 payload 做序列化預檢的模式
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

> 註：專案目前的廣播函式由 `src/main/ipc/unified-events.js` 提供的 `broadcastToAll()` 接管，統一進入事件佇列與批次處理，並沒有在 `main.js` 內直接宣告此函式。序列化安全主要由 `addUrlToGames()` 等 util 保證；上面程式碼僅示意「在送出前先過濾 / 清理 payload」的設計概念。

**遊戲物件清理**：

```javascript
// icon-url.js - addUrlToGames 序列化清理
function addUrlToGames(games) {
  return games.map((game) => {
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

### 2. 統一事件系統（UnifiedEventSystem）

- **事件分批**：主進程以 ~16ms（約 60fps）節拍批次處理事件，減少 UI 壅塞（`src/main/ipc/unified-events.js#queueEvent()` → `processBatch()`）。
- **類型合併與去重**：例如高頻 `drag-session:updated` 僅取最後一次；`folder-updated`/`folder-changed` 智能協同，避免重複刷新。
- **關鍵事件重試**：`games-incremental-update` 等關鍵事件在發送失敗時會重新入列，提升可靠性。

### 3. 批次處理

**合併 IPC 調用**：

```javascript
// 批次移除遊戲
ipcMain.handle('batch-remove-games-from-folder', async (event, filePaths, folderId) => {
  const db = getDB();
  const transaction = db.transaction(() => {
    filePaths.forEach((filePath) => {
      db.prepare('DELETE FROM folder_games WHERE filePath = ? AND folderId = ?').run(
        filePath,
        folderId
      );
    });
  });

  transaction();

  // 單次廣播
  broadcastToAll('games-incremental-update', {
    removed: filePaths.map((filePath) => ({ filePath, folderId })),
  });
});
```

> 註：實際實作中，`batch-remove-games-from-folder` handler 位於 `src/main/ipc/folders.js`，會先透過 SQL 批次刪除、更新快取與 `GameStore`（經由 `store-bridge`），再使用 `folder-membership-changed` / `folder-changed` 等事件廣播狀態變更，而不是直接送出 `games-incremental-update`。上述程式碼是簡化示例，用來說明「在單一交易中處理多筆資料，最後只廣播一次」的設計模式。

### 4. 錯誤處理與重試

**重試機制**：

```javascript
const withRetry = async (operation, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, i)));
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
      overlay: false, // 避免錯誤覆蓋層影響測試
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'], // 預建構依賴
  },
};
```

> 註：目前 `vite.config.js` 的實際內容以 alias、base 路徑與 CSP header 為主，尚未關閉 HMR overlay 或設定 `optimizeDeps.include`。上述設定是一種可選的優化範例，可依專案需求選擇性套用。

### 2. 開發工具

**性能監控**：

```javascript
// 開發模式下的性能監控
if (process.env.NODE_ENV === 'development') {
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      if (entry.duration > 16) {
        // 超過一幀時間
        console.warn(`Slow operation: ${entry.name} took ${entry.duration}ms`);
      }
    });
  });

  observer.observe({ entryTypes: ['measure'] });
}
```

> 註：專案目前尚未在程式碼中啟用這段 `PerformanceObserver` 監控邏輯；它提供的是一種「如有需要時可加入」的開發期性能監控模式。

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

- ✅ **序列化安全**: 修復目前已知會觸發 "An object could not be cloned" 的錯誤來源，並在關鍵 payload 上加上序列化前清理
- ✅ **狀態一致性**: Hook 層面無效物件過濾
- ✅ **渲染穩定**: 消除 VirtualizedUnifiedGrid 無效遊戲警告
- ✅ **IPC 可靠**: 主要遊戲 / 資料夾相關 IPC 在進入廣播前都經過序列化檢查或清理
- ✅ **錯誤處理**: 分層錯誤處理與優雅降級
