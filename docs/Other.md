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

| 層級 | 檔案位置 | 主要職責 | 關鍵樣式 |
|------|----------|----------|----------|
| `content-area` | App.css | 純容器，無邊距干擾 | `padding: 0, overflow: hidden` |
| `content-area-inner` | App.jsx (inline) | 負責視覺間距 | `padding: 10px 6px 6px 6px` |
| `desktop-view` | Desktop.css | 背景和基礎布局 | `overflow: hidden, flex: 1` |
| `desktop-grid` | VirtualizedUnifiedGrid.jsx | 滾動容器 | `overflow: hidden auto, scrollbar-gutter: stable` |

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
  operations: { added, moved, removed }
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