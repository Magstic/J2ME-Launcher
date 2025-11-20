# J2ME Launcher 架構概覽

本文檔提供 J2ME Launcher 的整體架構設計與核心概念說明，幫助開發者快速理解系統結構。

> **最後更新**: 2025-11-20
> **版本**: v2.4.0
> **狀態**: ✅ 遊戲簇 Cluster 系統、統一事件系統、Local Header 備援解析、備份子系統、新模擬器適配

## 系統架構

### 整體設計模式

- **Electron 多進程架構**：主進程 + 渲染進程 + 預載腳本
- **多窗口支援**：桌面主窗口 + 獨立資料夾窗口
- **統一狀態管理**：基於 GameStore 的集中式狀態管理
- **模組化設計**：功能域分離，職責單一
- **序列化安全**：所有 IPC 通訊經過嚴格序列化檢查
- **防禦性編程**：全面的錯誤處理與狀態驗證

### 核心組件

#### 1. 主進程 (Main Process)

```
src/main/
├── main.js                    # 應用入口，窗口/協定管理，統一事件廣播
├── preload.js                 # IPC API 暴露層
├── data-store.js              # 資料存取門面
├── db.js                      # SQLite 初始化與關閉/壓縮
├── store-bridge.js            # 跨窗口狀態同步（與 UnifiedEventSystem 協同）
├── ipc/                       # IPC 處理器集合（功能域分組）
│   ├── directories.js         # 目錄與掃描（含 'scan:progress' 廣播）
│   ├── folders.js             # 資料夾管理與關聯
│   ├── custom-names.js        # 自訂名稱（含增量更新）
│   ├── drag-session.js        # 跨窗口拖拽會話
│   ├── desktop.js             # 桌面資料（遊戲/簇彙總）
│   ├── folder-windows.js      # 獨立資料夾窗口生命週期/控制
│   ├── window-controls.js     # 主窗口控制
│   ├── emulator.js            # 模擬器設定/啟動
│   ├── clusters.js            # 簇 CRUD/查詢/關係/事件
│   ├── config.js              # 設定（Java/Cluster Tag Options）
│   ├── backup.js              # 備份/還原 + Dropbox OAuth
│   ├── shortcuts.js           # Windows 捷徑建立
│   ├── stats.js               # 統計/診斷（可選）
│   ├── sql-games.js           # SQL 輔助（可選）
│   ├── incremental-updates.js # 增量更新（工具類）
│   └── unified-events.js      # 統一事件系統（分批/合併/重試）
├── sql/                       # SQL 存取層（含 sharded-queries.js）
├── emulators/                 # 模擬器適配層（含 SquirrelJME, FreeJ2ME-Zb3）
├── readers/                   # JAR 解析策略（yauzl, system-extract, local-header）
├── services/                  # 業務服務層（例：config-service.js）
└── utils/                     # 工具函式集
    ├── icon-url.js            # safe-file 圖示 URL 與序列化
    ├── batch-operations.js    # 批次操作工具
    ├── unified-cache.js       # 統一快取系統（單一真實來源）
    ├── jar-cache.js           # JAR 圖示/資源快取
    └── hash.js                # 遊戲啟動所用哈希工具
```

**職責**：

- 窗口生命週期管理
- 檔案系統操作
- 資料庫存取與同步
- 模擬器啟動與配置
- IPC 通訊協調

#### 2. 渲染進程 (Renderer Process)

```
src/
├── main.jsx            # 桌面頁面入口
├── folder-main.jsx     # 資料夾窗口入口
├── App.jsx             # 主應用組件
├── components/         # UI 組件集合
│   ├── FolderWindowApp.jsx # 資料夾窗口
│   ├── ClusterCard.jsx     # 遊戲簇卡片
│   └── shared/         # 共享組件
│       └── VirtualizedUnifiedGrid.jsx # 統一虛擬化網格
├── hooks/              # React Hooks 系統
│   ├── index.js        # Hooks 彙總出口
│   ├── useDesktopManager.js # 桌面管理器主 Hook
│   ├── useDesktopView.js # 桌面視圖邏輯
│   ├── useAppDialogs.js # 應用級對話框管理
│   ├── useGameStore.js # 遊戲狀態 Hook
│   ├── useGuardedRefresh.js # 防抖刷新 Hook
│   └── useTranslation.js # 國際化 Hook
├── contexts/           # React Context
│   └── I18nContext.jsx # 國際化上下文
├── locales/            # 國際化資源
├── store/              # 狀態管理
│   └── GameStore.js    # 核心狀態管理
└── styles/             # 全域樣式系統
```

**職責**：

- 用戶界面渲染
- 用戶交互處理
- 狀態管理與同步
- 拖拽與動畫效果

## 核心子系統

### 1. 狀態管理系統 (GameStore)

**設計理念**：簡潔狀態管理

- **不可變更新**：確保 React 渲染一致性
- **索引優化**：`gamesById` 提供 O(1) 查詢
- **批次處理**：避免頻繁狀態更新

```javascript
// 狀態結構
{
  games: [],              // 遊戲陣列（供 React 渲染）
  gamesById: {},          // filePath -> game（O(1) 查詢）
  folderMembership: {},   // filePath -> folderIds[]
  folders: {},            // folderId -> folder 物件
  clusters: [],           // 遊戲簇陣列
  ui: {                   // UI 狀態
    selectedGames: [],
    dragState: { isDragging: false, draggedItems: [] },
    searchTerm: '',
    loading: false
  }
}
```

### 2. 統一事件系統 (UnifiedEventSystem)

**設計目標**：解決高頻事件導致的 UI 阻塞與狀態不一致

- **分批廣播**：將大量細碎事件合併為批次事件
- **事件合併**：相同類型的事件進行 payload 合併
- **智能防抖**：渲染端 `useMergedEventRefresh` 配合 `useGuardedRefresh` 確保 UI 響應性
- **重試機制**：確保 IPC 傳遞的可靠性

### 3. 遊戲簇系統 (Cluster System)

**功能**：解決重複遊戲/多版本遊戲的整理難題

- **視覺堆疊**：在網格中以堆疊卡片呈現
- **多對多關係**：遊戲可屬於簇，簇可屬於資料夾
- **主遊戲機制**：簇內指定「主遊戲」作為封面與啟動入口
- **自動/手動管理**：支援手動合併/拆分，預留自動分組介面

### 4. 備份子系統 (Backup System)

**支援後端**：

- **本地/WebDAV**：標準協議支援
- **S3 Compatible**：AWS S3, MinIO, Cloudflare R2
- **Dropbox**：整合 OAuth PKCE 認證流程

**特性**：

- **索引分離**：使用 `index.tsv` 管理備份索引
- **分塊傳輸**：支援大檔案斷點續傳（部分 Provider）
- **跨平台路徑**：自動處理 Win/Posix 路徑分隔符差異

### 5. 虛擬化渲染系統

**統一布局架構**：

- **智能虛擬化**：根據項目數量自動切換虛擬化/非虛擬化模式
- **統一定位系統**：非虛擬化模式使用絕對定位模擬 react-window 行為
- **單一組件實現**：VirtualizedUnifiedGrid 消除雙重布局架構
- **圖示協定**：透過 `safe-file://` 暴露圖示；由 `icon-url.js` 的 `addUrlToGames()` 注入 `iconUrl` 並確保序列化安全
- **無效過濾**：Hook 層面過濾無效遊戲物件
- **靜默處理**：避免不必要的控制台警告

### 6. 拖拽系統

**跨窗口拖拽**：

- **會話管理**：統一的拖拽狀態追蹤
- **碰撞檢測**：精確的放置目標識別
- **視覺反饋**：即時的拖拽預覽與提示
- **錯誤恢復**：拖拽失敗時的狀態回滾

## 資料流架構

### 1. 遊戲資料流

```
檔案系統 → JAR 解析 (LocalHeader/System) → 資料庫存儲 → GameStore → UI 渲染
    ↑                                             ↓
    └── 圖示快取 ←── 圖示提取 (Fallback) ←── 狀態同步
```

### 2. 資料夾/簇管理流

```
用戶操作 → IPC 調用 → SQL 事務 → 統一事件廣播 → UI 增量更新
    ↑                                   ↓
    └── 拖拽會話 ←── 批次操作 ←── 狀態快取
```

### 3. 模擬器啟動流

```
遊戲選擇 → 配置檢查 (Schema) → 參數組裝 → 進程啟動 → 狀態監控
    ↑                                     ↓
    └── 錯誤處理 ←── 日誌收集 ←── 進程管理
```

## 性能優化策略

### 1. 渲染優化

- **虛擬化**：僅渲染可見項目
- **記憶化**：React.memo + useMemo
- **批次更新**：狀態變更合併
- **懶載入**：按需載入組件與資源

### 2. 資料庫優化

- **分片查詢**：`sharded-queries.js` 解決 SQLite 變數限制
- **索引策略**：合理的索引覆蓋查詢
- **查詢優化**：避免 SELECT \*，使用預編譯語句與精確欄位
- **事務管理**：批次操作減少 I/O 次數
- **連線重用**：`better-sqlite3` 單一連線重用（非連接池）

### 3. 記憶體管理

- **統一快取**：`unified-cache.js` 作為單一真實來源 (Single Source of Truth)
- **遊戲狀態快取**：`src/main/utils/game-state-cache.js`
- **JAR 快取清理**：啟動與運行期的 `jar-cache.js` 清理策略
- **圖示 URL 安全**：`icon-url.js` 僅傳可序列化欄位（避免傳遞非可克隆物件）

## 錯誤處理策略

### 1. JAR 解析韌性

- **Local Header 備援**：當 Central Directory 損壞時，自動回退至 Local Header 順序掃描
- **多重策略**：yauzl (標準) → system-extract (外部工具) → raw-fallback (特徵碼) → local-header (底層掃描)

### 2. 分層錯誤處理

- **UI 層**：錯誤邊界 + 用戶友好提示
- **IPC 層**：重試機制 + 降級策略 + 序列化檢查
- **資料層**：事務回滾 + 資料修復
- **系統層**：崩潰恢復 + 狀態持久化
- **序列化層**：主進程在構建 payload 時使用 `addUrlToGames()` 保證可序列化；`UnifiedEventSystem` 僅負責分批/合併/重試

### 3. 容錯設計

- **防禦性程式設計**：空值檢查與類型驗證
- **優雅降級**：功能不可用時的替代方案
- **狀態恢復**：異常後的狀態重建
- **用戶反饋**：清晰的錯誤訊息與操作指引
- **序列化安全**：IPC 參數自動清理與類型檢查
- **狀態一致性**：Hook 層面的無效物件過濾

## 擴展性設計

### 1. 模擬器擴展

- **適配器模式**：統一的模擬器介面 (新增 SquirrelJME, FreeJ2ME-Zb3 支援)
- **配置驅動**：Schema-based 配置系統
- **插件架構**：動態載入模擬器支援

### 2. 國際化支援

- **動態載入**：按需載入語言包
- **熱重載**：開發模式下的即時更新
- **回退機制**：缺失翻譯時的處理策略

### 3. 主題系統

- **CSS 變數**：動態主題切換
- **設計代幣**：統一的設計語言
- **組件適配**：主題感知的組件設計

## 開發工具鏈

### 1. 建構系統

- **Vite**：快速的開發伺服器與建構工具
- **多入口**：桌面與資料夾窗口分離建構
- **熱重載**：開發模式下的即時更新

### 2. 程式碼品質

- **ESLint**：程式碼風格與品質檢查
- **Stylelint**：CSS 樣式規範檢查
- **別名系統**：清晰的匯入路徑管理

### 3. 除錯支援

- **DevTools**：Electron 開發者工具整合
- **日誌系統**：分級日誌與錯誤追蹤
- **性能監控**：渲染性能與記憶體使用監控

---

## 總結

J2ME Launcher 採用現代化的 Electron 架構，結合 React 生態系統，實現了高性能、可擴展的 J2ME 遊戲管理平台。

**核心優勢**：

- **性能優異**：虛擬化渲染 + 資料庫優化 + 批次處理 + 統一快取
- **用戶體驗**：流暢動畫 + 直觀交互 + 遊戲簇管理
- **可維護性**：模組化設計 + 清晰架構 + 防禦性編程
- **可擴展性**：插件化模擬器 + 國際化支援 + 雲端備份
- **穩定性**：序列化安全 + 全面錯誤處理 + 狀態一致性 + 韌性解析

**設計哲學**：遵循實用主義原則，注重實際效果勝過理論完美。
