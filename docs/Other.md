# 桌面視圖嵌套結構維護文檔

## 概述

本文檔記錄了 J2ME Launcher 桌面視圖的複雜嵌套結構，以及在維護過程中需要注意的關鍵問題，避免未來開發者重蹈覆轍。

## 當前嵌套結構

### HTML 層級關係

```
desktop-manager
└── content-wrap (position: relative, flex: 1, overflow: hidden)
    ├── content-area (padding: 0, overflow: hidden)
    │   └── content-area-inner (padding: 10px 6px 6px 6px)
    │       └── DesktopViewDirect
    │           └── div.desktop-view (overflow: hidden)
    │               └── VirtualizedUnifiedGrid
    │                   └── div.desktop-grid (overflow: hidden auto, scrollbar-gutter: stable)
    │                       └── div (marginLeft: gridDimensions.leftOffset)
    │                           └── react-window Grid
    └── FolderDrawer (position: absolute, 與 content-area 同級)
```

### CSS 職責分工

| 層級                 | 檔案位置                   | 主要職責           | 關鍵樣式                                          |
| -------------------- | -------------------------- | ------------------ | ------------------------------------------------- |
| `content-area`       | App.css                    | 純容器，無邊距干擾 | `padding: 0, overflow: hidden`                    |
| `content-area-inner` | App.jsx (inline)           | 負責視覺間距       | `padding: 10px 6px 6px 6px`                       |
| `desktop-view`       | Desktop.css                | 背景和基礎布局     | `overflow: hidden, flex: 1`                       |
| `desktop-grid`       | VirtualizedUnifiedGrid.jsx | 滾動容器           | `overflow: hidden auto, scrollbar-gutter: stable` |

## 歷史問題與修復

### 問題 1：滾動條無法貼合邊緣

**原始問題**：

- `content-area` 設定 `padding: 6px` 和 `scrollbar-gutter: stable both-edges`
- `desktop-view` 也設定 `overflow: hidden auto` 和 `scrollbar-gutter: stable`
- 造成雙重滾動容器衝突，滾動條出現在錯誤層級

**修復方案**：

- 移除 `content-area` 的內邊距和滾動條預留
- 將內邊距下移到 `content-area-inner`
- 只保留 `VirtualizedUnifiedGrid` 的滾動處理

### 問題 2：多餘的 margin-left 偏移

**問題來源**：

```javascript
const leftOffset = Math.floor((availableWidth - actualGridWidth) / 2);
```

**影響**：

- 產生 1-2px 的微小居中偏移
- 技術上正確但視覺上無意義
- 增加了不必要的計算複雜性

## 維護陷阱與注意事項

### ⚠️ 危險操作

1. **不要在 content-area 添加 padding**
   - 會導致滾動條無法貼合邊緣
   - 應該在 content-area-inner 處理間距

2. **不要創建多個滾動容器**
   - 只有 VirtualizedUnifiedGrid 內部的 desktop-grid 應該處理滾動
   - 其他層級應該設定 `overflow: hidden`

3. **不要隨意修改 scrollbar-gutter**
   - 只在實際滾動容器使用
   - 避免在父級容器預留滾動條空間

### ✅ 安全操作

1. **調整視覺間距**
   - 修改 content-area-inner 的 padding
   - 不影響滾動條定位

2. **修改背景和基礎樣式**
   - 在 desktop-view 層級進行
   - 不影響滾動和布局邏輯

## 最佳實踐

### 單一職責原則

每個容器層級都有明確的單一職責：

- **content-area**: 純容器邊界
- **content-area-inner**: 視覺間距控制
- **desktop-view**: 背景和基礎布局
- **desktop-grid**: 滾動和虛擬化處理

### 邊距管理

```css
/* ✅ 正確：在內層處理間距 */
.content-area-inner {
  padding: 10px 6px 6px 6px;
}

/* ❌ 錯誤：在滾動容器外層添加邊距 */
.content-area {
  padding: 6px; /* 會影響滾動條定位 */
}
```

### 滾動處理

```css
/* ✅ 正確：單一滾動責任 */
.desktop-grid {
  overflow: hidden auto;
  scrollbar-gutter: stable;
}

/* ❌ 錯誤：多層滾動處理 */
.desktop-view {
  overflow: hidden auto; /* 與子級衝突 */
}
```

## 虛擬化滾動條修復 (2025-09-03)

### 問題根因

虛擬化模式出現水平滾動條的原因：

- **錯誤做法**: 手動預留 17px 滾動條寬度
- **衝突**: react-window Grid 自己處理滾動，導致雙重滾動條計算
- **結果**: Grid 寬度 + 內部滾動條 > 容器寬度

### 解決方案

```javascript
// ❌ 錯誤：手動預留滾動條空間
const scrollbarWidth = 17;
const availableWidth = containerWidth - scrollbarWidth;

// ✅ 正確：讓 react-window 自己處理
const availableWidth = containerWidth;
```

### Linus 式設計原則

- **信任平台**: 瀏覽器和 react-window 比手動計算更可靠
- **單一職責**: 容器負責佈局，react-window 負責虛擬化
- **避免魔術數字**: 17px 滾動條寬度在不同系統不同

## 未來改進建議

1. **簡化居中邏輯**
   - 考慮移除 leftOffset 計算
   - 直接使用 CSS 的 justify-content: center

2. **減少嵌套層級**
   - 評估是否可以合併某些中間層
   - 保持功能完整的前提下簡化結構

3. **統一樣式管理**
   - 將相關樣式集中到同一個 CSS 文件
   - 避免樣式分散在多個位置

## 相關文件

- `src/App.jsx` - 主要嵌套結構定義
- `src/App.css` - content-area 樣式
- `src/components/Desktop/Desktop.css` - desktop-view 樣式
- `src/components/shared/VirtualizedUnifiedGrid.jsx` - 虛擬化和滾動邏輯

---

# 拖動 & 加入的差異

拖動 vs 右鍵『加入』的API路徑
拖動操作流程
拖動 → drag-session:drop → batchAddGamesToFolder →
統一事件系統 → games-incremental-update + folder-updated
右鍵『加入』操作流程
右鍵加入 → addGameToFolder/batchAddGamesToFolder →
直接SQL操作 → folder-updated (僅資料夾)

1. 事件廣播機制不同

拖動操作 (drag-session.js:275-287)：

```javascript
// 增量廣播變更
broadcastToAll('games-incremental-update', {
  action: 'drag-drop-completed',
  affectedGames: [...new Set(affectedGames)],
  operations: { added, moved, removed },
});
broadcastToAll('folder-changed');
broadcastToAll('folder-updated', folder);
```

右鍵加入 (folders.js:119-128)：

```javascript
// 僅廣播資料夾更新，缺少遊戲狀態更新
broadcastToAll('folder-updated', updatedFolder);
// 異步廣播遊戲列表（可能延遲）
setImmediate(() => {
  broadcastToAll('games-updated', addUrlToGames(sqlGames));
});
```

2. 快取更新策略不同
   拖動操作：使用 GameStateCache 進行增量更新

```javascript
const changes = cache.updateFolderMembership(filePaths, targetId, 'add');
affectedGames.push(...changes.updated);
```

右鍵加入：直接SQL操作，依賴後續的全量刷新

3. 同步時機差異
   拖動：立即同步快取 + 立即廣播增量更新
   右鍵加入：SQL操作 + 異步廣播（setImmediate）

# 桌面視圖右鍵菜單多選功能修復文檔

## 問題概述

桌面直連渲染路徑中，多選右鍵菜單無法正確獲取選中項目列表，導致批次操作功能失效。

## 問題根因

**桌面直連渲染路徑**（`App.jsx` 的 `DesktopViewDirect`）未正確轉發 `VirtualizedUnifiedGrid` 提供的第三參數 `selectedList`，導致多選數據在桌面右鍵菜單中丟失。

其他路徑（`DesktopGrid.Unified.jsx`、`FolderGrid.Unified.jsx`）已正確轉發，所以：

- ✅ 資料夾視圖正常
- ✅ 桌面封裝視圖正常
- ❌ 直連桌面視圖異常

## 修復方案

### 1. 桌面視圖事件轉發修正

**檔案位置**：`src/App.jsx`

**修正內容**：在 `DesktopViewDirect` 中正確轉發 `selectedList` 參數

```javascript
// 修正前
onGameContextMenu={(e, game) => openMenu(e, game, {
  view: 'desktop',
  kind: 'game'
})}

// 修正後
onGameContextMenu={(e, game, selectedList) => openMenu(e, game, {
  view: 'desktop',
  kind: 'game',
  selectedFilePaths: selectedList
})}
```

**關鍵影響**：桌面多選右鍵菜單能夠獲取完整選集數據。

### 2. 統一右鍵菜單數據掛載

**檔案位置**：`src/components/shared/hooks/useUnifiedContextMenu.js`

**機制說明**：在 `openMenu()` 函數中，當 `ctx.selectedFilePaths` 存在時：

1. 將選中列表掛載到目標對象：`finalTarget.selectedFilePaths = ctx.selectedFilePaths`
2. 根據視圖類型自動選擇菜單類型：
   - 桌面 `game` → `game`
   - 資料夾視窗 `game` → `game-folder`，並補充 `folderInfo.folderId`

**數據來源**：`ctx.extra.folderId` 來自上下文參數

**結果**：確保所有菜單處理器能透明獲取多選數據。

### 3. 數據來源統一

**檔案位置**：`src/components/shared/VirtualizedUnifiedGrid.jsx`

**實作邏輯**：在 `onItemContextMenu()` 中：

```javascript
// 根據當前選集決定使用的列表
const useList = determineSelectedList();

// 以第三參數傳遞給回調
onGameContextMenu(e, item, useList);
```

**架構特點**：這是多選資訊的唯一來源，符合「唯一實現 VirtualizedUnifiedGrid.jsx」的設計原則。

### 4. 封裝層對齊處理

#### 桌面封裝層

**檔案位置**：`src/components/Desktop/DesktopGrid.Unified.jsx`

**狀態**：✅ 已正確轉發 `selectedList` 至 `openMenu(..., { selectedFilePaths: selectedList })`

#### 資料夾封裝層

**檔案位置**：`src/components/FolderGrid.Unified.jsx`

**實作**：同步轉發選中列表，並附加資料夾 ID：

```javascript
openMenu(e, game, {
  selectedFilePaths: selectedList,
  extra: { folderId },
});
```

**目的**：支援「從資料夾移除」功能。

### 5. 下游消費者批次支援

#### 加入資料夾功能

**檔案位置**：`src/hooks/useDesktopDialogs.js`

**實作**：`handleAddToFolder()` 讀取 `target.selectedFilePaths`，存入 `folderSelectDialog.selectedFilePaths`

#### 建立捷徑功能

**檔案位置**：

- `src/components/shared/hooks/useCreateShortcut.js`
- `src/hooks/useDesktopView.js`

**實作**：`handleCreateShortcut()` 支援 `game.selectedFilePaths` 批次建立捷徑

**功能覆蓋**：

- ✅ 加入資料夾（批次）
- ✅ 從資料夾移除（批次）
- ✅ 建立捷徑（批次）

## 修復結果

### 修復前

- ❌ 桌面多選右鍵菜單無法獲取選中項目
- ❌ 批次操作功能失效
- ✅ 資料夾視圖正常工作

### 修復後

- ✅ 桌面多選右鍵菜單正確獲取選集
- ✅ 所有批次操作功能正常
- ✅ 所有視圖模式統一行為

## 測試驗證

### 測試場景

1. **桌面多選**：在桌面視圖中選擇多個遊戲，右鍵開啟選單
2. **批次加入資料夾**：驗證多個遊戲可同時加入資料夾
3. **批次建立捷徑**：驗證多個遊戲可同時建立捷徑
4. **資料夾批次移除**：驗證從資料夾中批次移除功能

### 預期結果

所有多選相關功能在桌面視圖與資料夾視圖中保持一致的行為表現。

## 技術架構說明

### 數據流向

```
VirtualizedUnifiedGrid.jsx (數據源)
    ↓ selectedList
App.jsx / DesktopGrid.Unified.jsx / FolderGrid.Unified.jsx (封裝層)
    ↓ selectedFilePaths
useUnifiedContextMenu.js (統一處理)
    ↓ finalTarget.selectedFilePaths
各功能 hooks (消費者)
```

### 設計原則

- **單一數據源**：選集資訊統一由 `VirtualizedUnifiedGrid.jsx` 提供
- **透明傳遞**：各封裝層透明轉發選集數據
- **統一處理**：`useUnifiedContextMenu.js` 統一掛載選集到目標對象
- **批次支援**：所有下游功能 hooks 支援批次操作

這個修復確保了桌面視圖與資料夾視圖在多選功能上的一致性，維護了整體架構的統一性。
