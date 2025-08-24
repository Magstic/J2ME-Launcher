│   App.css
│   App.jsx
│   folder-main.jsx
│   main.jsx
│
├───assets
│   ├───avatars
│   │       index.js
│   │       xxx.png
│   │
│   └───icons
│           icon.ico
│           icon.png
│           icon.svg
│
├───components
│   │   DesktopManager.jsx
│   │   DirectoryManager.css
│   │   DirectoryManager.jsx
│   │   EmulatorConfigDialog.jsx
│   │   FolderGrid.Unified.jsx
│   │   FolderWindowApp.css
│   │   FolderWindowApp.jsx
│   │   GameCard.jsx
│   │   index.js
│   │   SearchBar.jsx
│   │   TitleBar.jsx
│   │
│   ├───Common
│   │       ConfirmDialog.jsx
│   │       useContextMenu.jsx
│   │
│   ├───controller
│   │       GameGridController.jsx
│   │       useControllerContextMenu.js
│   │
│   ├───Desktop
│   │       ContextMenu.jsx
│   │       Desktop.css
│   │       DesktopGrid.Unified.jsx
│   │       DesktopView.jsx
│   │       GameInfoDialog.css
│   │       GameInfoDialog.jsx
│   │
│   ├───DragDrop
│   │       DragProvider.jsx
│   │
│   ├───Folder
│   │       CreateFolderDialog.jsx
│   │       Folder.css
│   │       FolderCard.jsx
│   │
│   ├───FolderDrawer
│   │       FolderDrawer.css
│   │       FolderDrawer.jsx
│   │       NeonStrip.jsx
│   │
│   ├───freej2meplus
│   │       FreeJ2MEPlusConfig.jsx
│   │
│   ├───kemulator
│   │       KEmulator.jsx
│   │
│   ├───libretro
│   │       LibretroFJPlus.jsx
│   │
│   ├───shared
│   │   │   index.js
│   │   │   UnifiedGrid.jsx
│   │   │
│   │   └───hooks
│   │           index.js
│   │           useDragSession.js
│   │           useFlipAnimation.js
│   │           useFlipWithWhitelist.js
│   │           useSelectionBox.js
│   │           useUnifiedContextMenu.js
│   │           useVirtualizedGrid.js
│   │
│   ├───ui
│   │   │   AboutNetworkCard.jsx
│   │   │   Card.jsx
│   │   │   Collapsible.jsx
│   │   │   index.js
│   │   │   ModalHeaderOnly.jsx
│   │   │   ModalWithFooter.jsx
│   │   │   RomCacheSwitch.jsx
│   │   │   Select.css
│   │   │   Select.jsx
│   │   │   ToggleSwitch.jsx
│   │   │
│   │   └───dialogs
│   │           AboutDialog.jsx
│   │           BackupDialog.jsx
│   │           ConflictResolveDialog.jsx
│   │           FolderSelectDialog.css
│   │           FolderSelectDialog.jsx
│   │           GameLaunchDialog.jsx
│   │           SettingsDialog.jsx
│   │
│   └───_shared
│           FormRenderer.jsx
│
├───config
│       controllerBindings.js
│       perf.js
│
├───hooks
│       useGamepad.js
│
├───main
│   │   data-store.js
│   │   db.js
│   │   jar-parser.js
│   │   main.js
│   │   migrateFromJson.js
│   │   preload.js
│   │   shortcuts.js
│   │
│   ├───backup
│   │   │   core.js
│   │   │
│   │   └───providers
│   │           dropbox.js
│   │           s3.js
│   │           webdav.js
│   │
│   ├───config
│   │       yaml-config.js
│   │
│   ├───emulators
│   │       freej2mePlus.js
│   │       ke.js
│   │       libretro.js
│   │
│   ├───ipc
│   │       backup.js
│   │       desktop.js
│   │       directories.js
│   │       drag-session.js
│   │       emulator.js
│   │       folder-windows.js
│   │       folders.js
│   │       README.md
│   │       shortcuts.js
│   │       sql-games.js
│   │       stats.js
│   │       window-controls.js
│   │
│   ├───parsers
│   │       icon-cache.js
│   │       manifest.js
│   │       md5.js
│   │       zip-entry.js
│   │
│   ├───readers
│   │       factory.js
│   │       raw-fallback.js
│   │       system-extract.js
│   │       yauzl-reader.js
│   │
│   ├───services
│   │       emulator-service.js
│   │
│   ├───sql
│   │       directories.js
│   │       emulator-configs.js
│   │       folders-read.js
│   │       folders-write.js
│   │       read.js
│   │       settings.js
│   │       sync.js
│   │
│   └───utils
│           game-conf.js
│           hash.js
│           icon-url.js
│           jar-cache.js
│           jar-manifest.js
│           java.js
│           png-to-ico.js
│
├───shared
│   └───backup
│           indexTSV.js
│           spec.js
│
└───styles
        buttons.css
        dialog.css
        focus-ring.css
        theme.css
        tokens.css
        utility.css

## 附註說明（Annotated Tree）

以下為每個目錄與關鍵檔案的用途簡述，方便後續維護與導覽。

請注意：該附註說明會定期更新以反映當前專案狀態，但仍可能存在滯後，請以程式碼為準。最後更新：2025-08-24。

- __根目錄（src/）__
  - `App.jsx`：Renderer 主頁（桌面視圖）入口，掛載應用、註冊全域樣式與路由/狀態。
  - `folder-main.jsx`：資料夾窗口頁面的入口（對應 Electron 獨立 BrowserWindow）。
  - `main.jsx`：一般入口（桌面頁面）啟動點，載入 React DOM Client。
  - `App.css`：全域基本樣式覆蓋。
  - Vite 多入口（源自 `vite.config.js` → `build.rollupOptions.input`）：
    - `main: index.html`（桌面頁面）
    - `folder: folder.html`（資料夾窗口頁面）
    - 相關別名：`resolve.alias` 包含 `@components`、`@ui`、`@shared`、`@hooks`、`@config`。

- __`components/`（Renderer UI 組件）__
  - `DesktopManager.jsx`：協調桌面場景，管理桌面/資料夾對話框與全域操作。
  - `DirectoryManager.jsx` / `DirectoryManager.css`：資料夾來源管理 UI 與樣式。
  - `EmulatorConfigDialog.jsx`：模擬器設定對話框，使用 `@ui/Collapsible`，讀取 schema/IPC。
  - `FolderGrid.Unified.jsx`：資料夾窗口用網格（以 `@shared/UnifiedGrid` 實現統一選取/拖拽）。
  - `FolderWindowApp.jsx` / `FolderWindowApp.css`：資料夾窗口頁面（獨立 BrowserWindow 渲染端）。
  - `GameCard.jsx`：遊戲卡片元件（桌面/資料夾共用樣式與選取覆蓋）。
  - `SearchBar.jsx`：搜尋列元件。
  - `TitleBar.jsx`：視窗標題列（最小化/關閉等）。
  - `index.js`：`@components` barrel 匯出。

  - `Common/ConfirmDialog.jsx`：通用確認對話框。
  - `Common/useContextMenu.jsx`：通用右鍵選單 hook（桌面/資料夾上下文共享基礎）。

  - `controller/GameGridController.jsx`：網格控制器（選取、右鍵、拖拽等行為協調）。
  - `controller/useControllerContextMenu.js`：控制器對應的 context menu 邏輯。

  - `Desktop/ContextMenu.jsx`：桌面專用右鍵選單。
  - `Desktop/Desktop.css`：桌面視圖樣式。
    - 抽屜開啟時，桌面網格（`.desktop-shift-layer`）會套用位移以讓出空間：
      - `.desktop-manager.drawer-open .content-area-inner > .desktop-view .desktop-shift-layer { transform: translateX(60px); }`
      - 與 `DesktopManager.jsx` 之 `drawerOpen` 狀態同步（根容器會加上 `drawer-open` 類）。
      - 若需調整位移距離，請同步考量抽屜/把手尺寸（見 `DesktopManager.jsx` 內常數）。
  - `Desktop/DesktopGrid.Unified.jsx`：桌面網格（以 `@shared/UnifiedGrid` 統一行為）。
  - `Desktop/DesktopView.jsx`：桌面主視圖容器。
  - `Desktop/GameInfoDialog.jsx` / `.css`：遊戲資訊對話框。
  - 桌面已啟用「無資料夾模式」：不再於桌面渲染資料夾或提供資料夾相關交互（建立、拖入、右鍵等）。

  - `DragDrop/DragProvider.jsx`：拖放 Context Provider（封裝拖放狀態）。

  - `Folder/CreateFolderDialog.jsx`：建立資料夾對話框（使用共享 modal 樣式）。
  - `Folder/FolderCard.jsx` / `Folder.css`：資料夾卡片與其樣式。
  - `FolderDrawer/FolderDrawer.jsx` / `FolderDrawer.css`：左側資料夾抽屜（唯一的資料夾管理入口）。
    - 接受從桌面拖拽的遊戲放入資料夾，支援跨視窗拖拽會話（`electronAPI.dropDragSession`）。
    - 放入成功會觸發輕微抖動動畫；已移除「放置到這裡」文字提示。
    - 抽屜把手與重疊寬度常數定義於 `DesktopManager.jsx`，請與上文 `.desktop-shift-layer` 位移保持一致。
    - `NeonStrip.jsx`：抽屜視覺裝飾（霓虹條）。

  - `freej2meplus/FreeJ2MEPlusConfig.jsx`：FreeJ2ME-Plus 特定設定 UI。
  - `kemulator/KEmulator.jsx`：KEmulator 相關 UI。
  - `libretro/LibretroFJPlus.jsx`：Libretro（FJPlus）相關 UI/整合元件。

  - `shared/UnifiedGrid.jsx`：統一的網格元件（選取框、右鍵、拖拽、FLIP 動畫整合）。最近調整：拖拽結束不再立刻關閉會話，依賴 `drop` IPC 完成（含 800ms 安全超時），`dragend` 進行資料夾命中測試並呼叫 `dropDragSession`，且含 IPC 重試以降低競態失敗。
  - `shared/hooks/`：共享 hooks（提供 `@shared/hooks` 彙總匯出）：
    - `index.js`：hooks 彙總匯出檔案。
    - `useSelectionBox.js`：框選行為（最小拖動距離閾值 2px，提升快速拖放時的選取靈敏度）。
    - `useDragSession.js`：拖曳會話管理。
    - `useFlipAnimation.js` / `useFlipWithWhitelist.js`：FLIP 動畫與白名單優化。
    - `useVirtualizedGrid.js`：虛擬化網格渲染。
    - `useUnifiedContextMenu.js`：桌面/資料夾語境對應的統一選單。

  - `ui/`：可重用 UI 元件集合與 barrel：
    - `index.js`：`@ui` barrel。
    - `Card.jsx`：卡片視覺組件。
    - `Collapsible.jsx`：可摺疊區塊（使用 `.section` 系列樣式）。
    - `ModalHeaderOnly.jsx` / `ModalWithFooter.jsx`：共用 Modal 模板。
    - `RomCacheSwitch.jsx`：ROM 快取開關。
    - `ToggleSwitch.jsx`：通用開關元件（受控/非受控皆可，供表單或偏好設定使用）。
    - `AboutNetworkCard.jsx`：貢獻者網絡卡片（頭像可點擊，透過 `electronAPI.openExternal` 在外部瀏覽器開啟連結）。
    - `Select.jsx` / `Select.css`：下拉選單元件與樣式。
    - `ui/dialogs/GameLaunchDialog.jsx`：啟動前設定表單（schema-driven，IPC 取得 emulator schema）。
    - `ui/dialogs/FolderSelectDialog.jsx`：資料夾選擇。
    - `ui/dialogs/BackupDialog.jsx`：備份設定與進度對話框（串接 `backup.js` IPC 與 `shared/backup/spec`）。
    - `ui/dialogs/ConflictResolveDialog.jsx`：還原時的衝突處理 UI。
    - `ui/dialogs/AboutDialog.jsx`：關於對話框（應用資訊、模擬器介紹、貢獻者網絡卡片，支援外部鏈接）。
    - `ui/dialogs/SettingsDialog.jsx`：軟體配置對話框（主題切換等設定選項）。

  - `_shared/FormRenderer.jsx`：通用 Schema 表單渲染器（選項標籤/型別註冊，服務於對話框）。支援多種欄位類型（文字、數字、布林、選項等），用於模擬器設定與其他表單對話框。

- __`config/`__
  - `controllerBindings.js`：控制器按鍵對應設定。
  - `perf.js`：效能相關常數/參數。

- __`hooks/`__
  - `useGamepad.js`：手把輸入 Hook。

- __`assets/`__
  - `avatars/`：貢獻者頭像資產
    - `index.js`：集中式頭像載入器（`import.meta.glob`），提供 `getAvatar(name)` 與 `listAvatars()`。
    - `xxx.png`：各貢獻者頭像檔案。
  - `icons/`：應用圖示資產
    - `icon.ico` / `icon.png` / `icon.svg`：應用圖示（用於窗口圖示與安裝包）。

- __`main/`（Electron 主進程）__
  - `main.js`：主進程入口，建立窗口、註冊 IPC。
  - `preload.js`：Preload 腳本，暴露 IPC API 給 Renderer。
  - `data-store.js`：資料存取門面（SQL-first，委派至 `sql/` 與 `db.js`）。
  - `db.js`：SQLite 初始化與索引（如 `folder_games`）。
  - `migrateFromJson.js`：舊 JSON 遷移工具（只在遷移期使用）。
  - `jar-parser.js`：JAR 解析（透過 `readers/factory.js` 決定解讀路徑：yauzl → system-extract → raw-fallback）。
  - `shortcuts.js`：桌面捷徑與圖示處理（打包時生成/確保 ICO 與捷徑）。

  - `config/yaml-config.js`：YAML 設定存取（首啟用完整預設、讀寫自我修復）。

  - `emulators/*.js`：各模擬器介面/適配層（如 FreeJ2ME-Plus、KEmulator、Libretro）。

  - `ipc/*.js`：各功能域 IPC handler：
    - `desktop.js`、`directories.js`、`drag-session.js`、`emulator.js`、`folder-windows.js`、`folders.js`、`sql-games.js`、`stats.js`、`window-controls.js`、`shortcuts.js`。
    - `backup.js`：備份/還原與 Dropbox OAuth（PKCE）流程之 IPC 端點。
    - `README.md`：IPC 說明文件。

  - `parsers/`：匯入資源解析：`icon-cache.js`、`manifest.js`、`md5.js`、`zip-entry.js`。

  - `readers/`：JAR 讀取策略：`factory.js`、`yauzl-reader.js`、`system-extract.js`、`raw-fallback.js`。

  - `services/emulator-service.js`：啟動模擬器服務（依 adapter 組裝指令，spawn Java 等）。

  - `sql/`：SQL 存取層：
    - `read.js`、`sync.js`、`settings.js`、`directories.js`、`folders-read.js`、`folders-write.js`、`emulator-configs.js`。

  - `utils/`：主進程工具集合：
    - `game-conf.js`：遊戲配置檔案處理。
    - `hash.js`：檔案雜湊計算工具。
    - `icon-url.js`：註冊並使用 `safe-file://` 協議（`protocol.registerSchemesAsPrivileged`），將本地圖示以 `safe-file://<name>` 暴露給渲染端；未提供圖示時回退 `safe-file://default-ico.svg`。CSP 允許（見 `vite.config.js`）：`img-src 'self' data: safe-file:`。
    - `jar-cache.js`：JAR 檔案快取管理。
    - `jar-manifest.js`：JAR manifest 解析。
    - `java.js`：Java 環境檢測與工具。
    - `png-to-ico.js`：PNG 轉 ICO 圖示格式轉換。

 - __備份子系統__
  - `main/backup/core.js`：備份/還原核心流程（規劃、分組與進度回報）。
  - `main/backup/providers/`：實際雲端提供者：
    - `webdav.js`：WebDAV（含目錄存在檢查、MKCOL、重試退避）。
    - `s3.js`：S3 相容（需 accessKey/secretKey 等）。
    - `dropbox.js`：Dropbox API（與 `ipc/backup.js` 之 OAuth 整合）。
  - `main/ipc/backup.js`：提供 `backup:*` 與 `dropbox:*` IPC。
  - `shared/backup/spec.js`：與渲染端共享之備份規格（群組、預設路徑）；`shared/backup/indexTSV.js`：索引序列化工具。

- __`styles/`（全域樣式系統）__
  - `theme.css`：主題變數與設計代幣定義。
  - `tokens.css`：設計系統代幣（顏色、間距、字體等）。
  - `utility.css`：工具類樣式（margin、padding、flex 等）。
  - `dialog.css`：對話框通用樣式。
  - `buttons.css`：按鈕樣式系統。
  - `focus-ring.css`：焦點環與無障礙樣式。
  - 所有樣式檔案於 `App.jsx` 等處引入，提供全域樣式基礎。