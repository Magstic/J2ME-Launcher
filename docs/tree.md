```
│  App.css
│  App.jsx
│  folder-main.jsx
│  main.jsx
│
├─assets
│  ├─avatars
│  │      index.js
│  │      lavinia.png
│  │      magstic.png
│  │      marisa.png
│  │
│  └─icons
│          dropbox.svg
│          icon.ico
│          icon.png
│          icon.svg
│          index.js
│          License_MIT.svg
│          s3.svg
│          webdav.svg
│
├─components
│  │  DirectoryManager.css
│  │  DirectoryManager.jsx
│  │  EmulatorConfigDialog.jsx
│  │  FolderWindowApp.css
│  │  FolderWindowApp.jsx
│  │  GameCard.jsx
│  │  index.js
│  │  SearchBar.jsx
│  │  TitleBar.jsx
│  │
│  ├─Common
│  │      ConfirmDialog.jsx
│  │      useContextMenu.jsx
│  │
│  ├─Desktop
│  │      ContextMenu.jsx
│  │      Desktop.css
│  │      GameInfoDialog.css
│  │      GameInfoDialog.jsx
│  │
│  ├─emulators
│  │      FreeJ2MEPlusConfig.jsx
│  │      KEmulator.jsx
│  │      LibretroFJPlus.jsx
│  │
│  ├─Folder
│  │      CreateFolderDialog.jsx
│  │      Folder.css
│  │      FolderCard.jsx
│  │
│  ├─FolderDrawer
│  │      FolderDrawer.css
│  │      FolderDrawer.jsx
│  │      NeonStrip.jsx
│  │
│  ├─shared
│  │  │  VirtualizedUnifiedGrid.jsx
│  │  │
│  │  └─hooks
│  │          index.js
│  │          useCreateShortcut.js
│  │          useDragSession.js
│  │          useOutsideClick.js
│  │          useSelectionBox.js
│  │          useUnifiedContextMenu.js
│  │          useWheelTouchLock.js
│  │
│  └─ui
│      │  AboutNetworkCard.jsx
│      │  Card.jsx
│      │  Collapsible.jsx
│      │  index.js
│      │  ModalHeaderOnly.jsx
│      │  ModalWithFooter.jsx
│      │  NotificationBubble.css
│      │  NotificationBubble.jsx
│      │  RomCacheSwitch.jsx
│      │  Select.css
│      │  Select.jsx
│      │  ToggleSwitch.jsx
│      │
│      └─dialogs
│              AboutDialog.jsx
│              BackupDialog.jsx
│              ConflictResolveDialog.jsx
│              EmulatorNotConfiguredDialog.jsx
│              FolderSelectDialog.css
│              FolderSelectDialog.jsx
│              GameLaunchDialog.jsx
│              SettingsDialog.css
│              SettingsDialog.jsx
│              WelcomeGuideDialog.jsx
│
├─config
│      perf.js
│
├─contexts
│      I18nContext.jsx
│
├─hooks
│      index.js
│      useAppDialogs.js
│      useAppEventListeners.js
│      useDesktopActions.js
│      useDesktopDialogs.js
│      useDesktopEventListeners.js
│      useDesktopManager.js
│      useDesktopState.js
│      useDesktopView.js
│      useDrawerPositioning.js
│      useFabMenu.js
│      useFolderOperations.js
│      useGameLauncher.js
│      useGameStore.js
│      useThemeManager.js
│      useTranslation.js
│      useWelcomeGuide.js
│
├─locales
│      en-US.json
│      zh-CN.json
│      zh-TW.json
│
├─main
│  │  data-store.js
│  │  db.js
│  │  jar-parser.js
│  │  main.js
│  │  migrateFromJson.js
│  │  preload.js
│  │  shortcuts.js
│  │  store-bridge.js
│  │
│  ├─backup
│  │  │  core.js
│  │  │
│  │  └─providers
│  │          dropbox.js
│  │          s3.js
│  │          webdav.js
│  │
│  ├─config
│  │      yaml-config.js
│  │
│  ├─emulators
│  │      freej2mePlus.js
│  │      ke.js
│  │      libretro.js
│  │
│  ├─ipc
│  │      backup.js
│  │      config.js
│  │      custom-names.js
│  │      desktop.js
│  │      directories.js
│  │      drag-session.js
│  │      emulator.js
│  │      folder-windows.js
│  │      folders.js
│  │      incremental-updates.js
│  │      README.md
│  │      shortcuts.js
│  │      sql-games.js
│  │      stats.js
│  │      unified-events.js
│  │      window-controls.js
│  │
│  ├─parsers
│  │      icon-cache.js
│  │      manifest.js
│  │      md5.js
│  │      zip-entry.js
│  │
│  ├─readers
│  │      factory.js
│  │      raw-fallback.js
│  │      system-extract.js
│  │      yauzl-reader.js
│  │
│  ├─services
│  │      config-service.js
│  │      emulator-service.js
│  │
│  ├─sql
│  │      custom-names.js
│  │      directories.js
│  │      emulator-configs.js
│  │      folders-read.js
│  │      folders-write.js
│  │      optimized-read.js
│  │      read.js
│  │      settings.js
│  │      sharded-queries.js
│  │      sync.js
│  │
│  └─utils
│          batch-folder-operations.js
│          batch-operations.js
│          game-conf.js
│          game-state-cache.js
│          hash.js
│          icon-url.js
│          jar-cache.js
│          jar-manifest.js
│          java.js
│          png-to-ico.js
│          sql-cache.js
│          unified-cache.js
│
├─shared
│  └─backup
│          indexTSV.js
│          spec.js
│
├─store
│      GameStore.js
│
├─styles
│      buttons.css
│      dialog.css
│      focus-ring.css
│      theme.css
│      tokens.css
│      utility.css
│
└─utils
    │  i18n.js
    │  logger.cjs
    │  logger.js
    │
    └─dom
            scroll.js
```

## 附註說明（Annotated Tree）

以下為每個目錄與關鍵檔案的用途簡述，方便後續維護與導覽。

> **重要提醒**：該附註說明會定期更新以反映當前專案狀態，但仍可能存在滯後，請以實際程式碼為準。  
> **最後更新**：2025-09-09（Hook 化整合至 App.jsx、統一虛擬化網格、UI barrel 更新）

- __根目錄（src/）__
  - `App.jsx`：Renderer 主頁（桌面視圖）入口，掛載應用、註冊全域樣式並整合狀態 hooks。
  - `folder-main.jsx`：資料夾窗口頁面的入口（對應 Electron 獨立 BrowserWindow）。
  - `main.jsx`：一般入口（桌面頁面）啟動點，載入 React DOM Client。
  - `App.css`：全域基本樣式覆蓋。
  - Vite 多入口（源自 `vite.config.js` → `build.rollupOptions.input`）：
    - `main: index.html`（桌面頁面）
    - `folder: folder.html`（資料夾窗口頁面）
    - 相關別名：`resolve.alias` 包含 `@`、`@components`、`@ui`、`@shared`、`@hooks`、`@config`。

- __`components/`（Renderer UI 組件）__
  - `App.jsx` 中的 `DesktopManagerHooks` 與 `DesktopViewDirect`：整合 `useDesktopManager` 等 hooks，協調桌面/資料夾對話框與全域操作，並使用 `@shared/VirtualizedUnifiedGrid` 進行渲染。
  - `DirectoryManager.jsx` / `DirectoryManager.css`：資料夾來源管理 UI 與樣式。
  - `EmulatorConfigDialog.jsx`：模擬器設定對話框，使用 `@ui/Collapsible`，讀取 schema/IPC。
  - `FolderWindowApp.jsx` / `FolderWindowApp.css`：資料夾窗口頁面（獨立 BrowserWindow 渲染端）。
  - `GameCard.jsx`：遊戲卡片元件（桌面/資料夾共用樣式與選取覆蓋）。
  - `SearchBar.jsx`：搜尋列元件。
  - `TitleBar.jsx`：視窗標題列（最小化/關閉等）。
  - `index.js`：`@components` barrel 匯出。

  - `Common/ConfirmDialog.jsx`：通用確認對話框。
  - `Common/useContextMenu.jsx`：通用右鍵選單 hook（桌面/資料夾上下文共享基礎）。

  - `Desktop/ContextMenu.jsx`：桌面專用右鍵選單。
  - `Desktop/Desktop.css`：桌面視圖樣式。
  - `Desktop/GameInfoDialog.jsx` / `.css`：遊戲資訊對話框。

  

  - `Folder/CreateFolderDialog.jsx`：建立資料夾對話框（使用共享 modal 樣式）。
  - `Folder/FolderCard.jsx` / `Folder.css`：資料夾卡片與其樣式。
  - `FolderDrawer/FolderDrawer.jsx` / `FolderDrawer.css`：左側資料夾抽屜（唯一的資料夾管理入口）。
    - 接受從桌面拖拽的遊戲放入資料夾，支援跨視窗拖拽會話（`electronAPI.dropDragSession`）。
    - 放入成功會觸發輕微抖動動畫；已移除「放置到這裡」文字提示。
    - 抽屜把手與抽屜寬度參數由 `hooks/useDrawerPositioning.js` 與 `App.jsx` 統一管理。
    - `NeonStrip.jsx`：抽屜視覺裝飾（霓虹條）。

  - `emulators/FreeJ2MEPlusConfig.jsx`：FreeJ2ME-Plus 特定設定 UI。
  - `emulators/KEmulator.jsx`：KEmulator 相關 UI。
  - `emulators/LibretroFJPlus.jsx`：Libretro（FJPlus）相關 UI/整合元件。

  - `shared/VirtualizedUnifiedGrid.jsx`：統一的虛擬化網格元件（智能虛擬化、選取框、右鍵、拖拽整合）。採用單一布局系統，非虛擬化模式使用絕對定位模擬 react-window 行為，消除雙重布局架構。最近調整：拖拽結束不再立刻關閉會話，依賴 `drop` IPC 完成（含 800ms 安全超時），`dragend` 進行資料夾命中測試並呼叫 `dropDragSession`，且含 IPC 重試以降低競態失敗。
  - `shared/hooks/`：共享 hooks（提供 `@shared/hooks` 彙總匯出）：
    - `index.js`：hooks 彙總匯出檔案。
    - `useCreateShortcut.js`：建立捷徑的共享邏輯（批次處理、錯誤收斂）。
    - `useDragSession.js`：拖曳會話管理。
    - `useOutsideClick.js`：外點擊關閉偵測。
    - `useSelectionBox.js`：框選行為（最小拖動距離閾值 2px，提升快速拖放時的選取靈敏度）。
    - `useUnifiedContextMenu.js`：桌面/資料夾語境對應的統一選單。
    - `useWheelTouchLock.js`：在彈出層開啟時鎖定滾動至內部容器。

  - `ui/`：可重用 UI 元件集合與 barrel：
    - `index.js`：`@ui` barrel。
    - `Card.jsx`：卡片視覺組件。
    - `Collapsible.jsx`：可摺疊區塊（使用 `.section` 系列樣式）。
    - `ModalHeaderOnly.jsx` / `ModalWithFooter.jsx`：共用 Modal 模板。
    - `RomCacheSwitch.jsx`：ROM 快取開關。
    - `ToggleSwitch.jsx`：通用開關元件（受控/非受控皆可，供表單或偏好設定使用）。
    - `AboutNetworkCard.jsx`：貢獻者網絡卡片（頭像可點擊，透過 `electronAPI.openExternal` 在外部瀏覽器開啟連結）。
    - `Select.jsx` / `Select.css`：下拉選單元件與樣式。
    - `NotificationBubble.jsx` / `NotificationBubble.css`：通知氣泡元件（用於操作反饋）。
    - `ui/dialogs/GameLaunchDialog.jsx`：啟動前設定表單（schema-driven，IPC 取得 emulator schema）。
    - `ui/dialogs/FolderSelectDialog.jsx`：資料夾選擇。
    - `ui/dialogs/BackupDialog.jsx`：備份設定與進度對話框（串接 `backup.js` IPC 與 `shared/backup/spec`）。
    - `ui/dialogs/ConflictResolveDialog.jsx`：還原時的衝突處理 UI。
    - `ui/dialogs/AboutDialog.jsx`：關於對話框（應用資訊、模擬器介紹、貢獻者網絡卡片，支援外部鏈接）。
    - `ui/dialogs/SettingsDialog.jsx` / `SettingsDialog.css`：軟體配置對話框（主題切換等設定選項）。
    - `ui/dialogs/WelcomeGuideDialog.jsx`：歡迎引導對話框（首次使用設定向導，支援多語言與主題預覽）。

  

- __`config/`__
  - `perf.js`：效能相關常數/參數。

- __`contexts/`__
  - `I18nContext.jsx`：國際化上下文提供者（支援繁中、簡中、英文，含熱重載與自動語言檢測）。

- __`hooks/`（React Hooks 系統）__
  - `index.js`：hooks 彙總出口（barrel exports）。
  - `useAppDialogs.js`：應用級對話框狀態管理。
  - `useAppEventListeners.js`：應用級事件監聽器。
  - `useDesktopActions.js`：桌面操作邏輯。
  - `useDesktopDialogs.js`：桌面對話框管理。
  - `useDesktopEventListeners.js`：桌面事件監聽器。
  - `useDesktopManager.js`：桌面管理器主 hook（整合所有子 hooks）。
  - `useDesktopState.js`：桌面狀態管理。
  - `useDesktopView.js`：桌面視圖邏輯（拖拽、右鍵選單、資料夾徽章）。
  - `useDrawerPositioning.js`：抽屜定位邏輯。
  - `useFabMenu.js`：浮動操作按鈕選單。
  - `useFolderOperations.js`：資料夾操作邏輯。
  - `useGameLauncher.js`：遊戲啟動邏輯。
  - `useGameStore.js`：遊戲狀態管理 Hook（連接統一狀態管理系統）。
  - `useThemeManager.js`：主題管理器。
  - `useTranslation.js`：翻譯 Hook（提供 `t()` 函數與語言切換功能）。
  - `useWelcomeGuide.js`：歡迎引導邏輯。

- __`locales/`（國際化資源）__
  - `en-US.json`：英文翻譯資源。
  - `zh-CN.json`：簡體中文翻譯資源。
  - `zh-TW.json`：繁體中文翻譯資源。
  - 支援嵌套鍵值結構與參數替換（`{{param}}` 語法）。

- __`assets/`__
  - `avatars/`：貢獻者頭像資產
    - `index.js`：集中式頭像載入器（`import.meta.glob`），提供 `getAvatar(name)` 與 `listAvatars()`。
    - `lavinia.png` / `magstic.png` / `marisa.png`：各貢獻者頭像檔案。
  - `icons/`：應用圖示與服務圖示資產
    - `icon.ico` / `icon.png` / `icon.svg`：應用圖示（用於窗口圖示與安裝包）。
    - `dropbox.svg` / `s3.svg` / `webdav.svg`：雲端服務圖示。
    - `License_MIT.svg`：MIT 授權圖示。
    - `index.js`：icons 彙總出口（barrel）。用法：`import { AppIconSvg, MitLicenseSvg } from '@/assets/icons';`

- __`main/`（Electron 主進程）__
  - `main.js`：主進程入口，建立窗口、註冊 IPC。
  - `preload.js`：Preload 腳本，暴露 IPC API 給 Renderer（包含完整的資料夾管理、自訂名稱、雲端備份等 API）。
  - `data-store.js`：資料存取門面（SQL-first，委派至 `sql/` 與 `db.js`）。
  - `db.js`：SQLite 初始化與索引（如 `folder_games`），包含自動清理與壓縮功能。
  - `migrateFromJson.js`：舊 JSON 遷移工具（只在遷移期使用）。
  - `jar-parser.js`：JAR 解析（透過 `readers/factory.js` 決定解讀路徑：yauzl → system-extract → raw-fallback）。
  - `shortcuts.js`：桌面捷徑與圖示處理（支援中文檔名、PNG 轉 ICO、hash-based 啟動參數）。
  - `store-bridge.js`：主進程與渲染進程狀態同步橋接。

  - `config/yaml-config.js`：YAML 設定存取（首啟用完整預設、讀寫自我修復）。

  - `emulators/*.js`：各模擬器介面/適配層（如 FreeJ2ME-Plus、KEmulator、Libretro）。

  - `ipc/*.js`：各功能域 IPC handler：
    - `desktop.js`、`directories.js`、`drag-session.js`、`emulator.js`、`folder-windows.js`、`folders.js`、`sql-games.js`、`stats.js`、`window-controls.js`、`shortcuts.js`。
    - `custom-names.js`：自訂遊戲名稱與開發商管理。
    - `incremental-updates.js`：增量更新機制（Linus-style 最小化更新）。
    - `backup.js`：備份/還原與 Dropbox OAuth（PKCE）流程之 IPC 端點。
    - `README.md`：IPC 說明文件。

  - `parsers/`：匯入資源解析：`icon-cache.js`、`manifest.js`、`md5.js`、`zip-entry.js`。

  - `readers/`：JAR 讀取策略：`factory.js`、`yauzl-reader.js`、`system-extract.js`、`raw-fallback.js`。

  - `services/emulator-service.js`：啟動模擬器服務（依 adapter 組裝指令，spawn Java 等）。

  - `sql/`：SQL 存取層：
    - `read.js`、`sync.js`、`settings.js`、`directories.js`、`folders-read.js`、`folders-write.js`、`emulator-configs.js`。
    - `custom-names.js`：自訂名稱 SQL 操作。
    - `optimized-read.js`：優化的讀取查詢（支援分頁與批次操作）。

  - `utils/`：主進程工具集合：
    - `game-conf.js`：遊戲配置檔案處理。
    - `hash.js`：檔案雜湊計算工具。
    - `icon-url.js`：註冊並使用 `safe-file://` 協議，將本地圖示暴露給渲染端。
    - `jar-cache.js`：JAR 檔案快取管理。
    - `jar-manifest.js`：JAR manifest 解析。
    - `java.js`：Java 環境檢測與工具。
    - `png-to-ico.js`：PNG 轉 ICO 圖示格式轉換。
    - `batch-operations.js`：批次操作工具（支援進度回調）。
    - `batch-folder-operations.js`：資料夾批次操作（Linus-style 高效能）。
    - `game-state-cache.js`：遊戲狀態快取管理。
    - `sql-cache.js`：SQL 查詢結果快取。
    - `unified-cache.js`：統一快取系統（支援 10k+ 遊戲）。

 - __備份子系統__
  - `main/backup/core.js`：備份/還原核心流程（規劃、分組與進度回報）。
  - `main/backup/providers/`：實際雲端提供者：
    - `webdav.js`：WebDAV（含目錄存在檢查、MKCOL、重試退避）。
    - `s3.js`：S3 相容（需 accessKey/secretKey 等）。
    - `dropbox.js`：Dropbox API（與 `ipc/backup.js` 之 OAuth 整合）。
  - `main/ipc/backup.js`：提供 `backup:*` 與 `dropbox:*` IPC。
  - `shared/backup/spec.js`：與渲染端共享之備份規格（群組、預設路徑）；`shared/backup/indexTSV.js`：索引序列化工具。

- __`shared/`（跨進程共享模組）__
  - `backup/`：備份子系統共享模組：
    - `spec.js`：備份規格定義（群組、預設路徑等）。
    - `indexTSV.js`：索引序列化工具（TSV 格式）。

- __`store/`（統一狀態管理）__
  - `GameStore.js`：Linus-style 統一狀態管理（簡單、可預測、高效能）。

- __`styles/`（全域樣式系統）__
  - `theme.css`：主題變數與設計代幣定義。
  - `tokens.css`：設計系統代幣（顏色、間距、字體等）。
  - `utility.css`：工具類樣式（margin、padding、flex 等）。
  - `dialog.css`：對話框通用樣式。
  - `buttons.css`：按鈕樣式系統。
  - `focus-ring.css`：焦點環與無障礙樣式。
  - 所有樣式檔案於 `App.jsx` 等處引入，提供全域樣式基礎。

- __`utils/`（渲染進程工具）__
  - `i18n.js`：國際化工具函數。
  - `logger.js` / `logger.cjs`：日誌工具。
  - `dom/scroll.js`：滾動相關工具（`getScrollParent()` 等）。

## 架構特色與設計理念

### 性能優化策略
- **虛擬化渲染**：`shared/VirtualizedUnifiedGrid.jsx` 支援 10k+ 遊戲的流暢渲染
- **增量更新**：`incremental-updates.js` 實現 Linus-style 最小化更新
- **統一快取**：`unified-cache.js` 提供單一真實來源的快取系統
- **批次操作**：`batch-folder-operations.js` 優化大量資料夾操作

### 國際化系統
- **完整 i18n 支援**：繁中、簡中、英文三語言
- **熱重載**：開發時支援翻譯資源熱重載
- **自動檢測**：根據系統語言自動選擇預設語言

### 狀態管理
- **統一狀態**：`GameStore.js` 提供 Redux-like 但更簡潔的狀態管理
- **增量同步**：主進程與渲染進程間的高效狀態同步
- **快取一致性**：多層快取確保資料一致性

### 模組化架構
- **IPC 分離**：各功能域獨立的 IPC 處理器
- **SQL 分層**：讀寫分離的 SQL 操作層
- **組件復用**：高度模組化的 UI 組件系統