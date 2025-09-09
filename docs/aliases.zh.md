# 匯入別名與彙總出口（中文說明）

本專案使用 Vite 的路徑別名（alias）與部分彙總出口（barrel files）來保持匯入路徑的整潔與穩定，提升代碼可維護性和開發效率。

## 概述

別名系統的主要目標：
- **清晰的匯入路徑**：避免深層相對路徑
- **穩定的依賴關係**：檔案移動時不需更新匯入
- **模組化設計**：促進組件重用和架構清晰
- **IDE 支援**：提供更好的自動完成和重構支援

## 別名（權威來源）

定義位置：
- `vite.config.js` → `resolve.alias`
- `jsconfig.json` → `compilerOptions.paths`

目前映射（Vite：`vite.config.js`）：
- `@` → `src`
- `@components` → `src/components`
- `@ui` → `src/components/ui`
- `@shared` → `src/components/shared`
- `@hooks` → `src/hooks`
- `@config` → `src/config`
- `@styles` → `src/styles`

JS 路徑提示（`jsconfig.json`）：
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@ui/*` → `src/components/ui/*`
- `@shared/*` → `src/components/shared/*`
- `@hooks/*` → `src/hooks/*`
- `@config/*` → `src/config/*`

注意：
- `@shared` 指向 UI 層的共享元件資料夾 `src/components/shared`。
- 專案頂層的 `src/shared`（例如 `src/shared/backup/spec.js`、`src/shared/backup/indexTSV.js`）沒有設定 alias，以避免命名混淆。請在 `src/main` 或渲染端以相對路徑匯入（例如：在 `src/main/ipc/backup.js` 以 `require('../shared/backup/spec')` 匯入）。

## 使用規範與最佳實踐

### 匯入優先級

1. **共享組件和 UI 元件**：優先使用別名
2. **本地組件**：使用相對路徑（僅在同一目錄內）
3. **配置和常量**：使用 `@config` 別名
4. **Hooks 和工具**：使用 `@hooks` 別名

### 代碼組織原則

- **單一職責**：每個模組只負責一個功能領域
- **依賴方向**：低層組件不應依賴高層組件
- **循環依賴**：避免模組間的循環引用
- **明確匯出**：使用具名匯出，避免預設匯出

### 使用範例

```javascript
// ✅ 推薦：使用別名匯入共享組件
import { ModalWithFooter, Collapsible } from '@ui';
import { DirectoryManager, GameLaunchDialog } from '@components';
import { perf } from '@config/perf'; // 性能配置

// ✅ 可接受：本地組件使用相對路徑
import LocalPart from './LocalPart';
import { validateInput } from './utils';

// ❌ 避免：深層相對路徑
import ModalWithFooter from '../../../components/ui/ModalWithFooter';

// ✅ 正確：使用別名和彙總出口
import { ui } from '@components';
const { ModalWithFooter, Collapsible } = ui;
```

### IPC 和序列化安全

在使用別名匯入時，特別注意 IPC 通訊的序列化安全：

```javascript
// ✅ 安全的 IPC 相關匯入
import { useAppEventListeners } from '@hooks/useAppEventListeners';
import { useDesktopManager } from '@hooks/useDesktopManager';

// 使用範例
const handleAddToFolder = async (games, folderId) => {
  const safeGames = games.map(game => ({
    filePath: String(game.filePath),
    gameName: String(game.gameName || ''),
    // 只保留可序列化的屬性
  }));
  
  return safeIpcCall(() => 
    window.electronAPI.batchAddGamesToFolder(
      safeGames.map(g => g.filePath),
      String(folderId)
    )
  );
};
```

## 彙總出口（Barrels）

彙總出口系統提供統一的匯入入口，簡化模組依賴管理。

### 設計原則

- **單一入口**：每個模組類別提供一個主要入口
- **明確匯出**：使用具名匯出，避免預設匯出
- **性能考量**：避免不必要的模組加載
- **版本穩定**：內部結構變更不影響外部使用

- `src/components/ui/index.js`
  - 當前命名匯出（Named exports）：
    - `Card`
    - `Select`
    - `ModalWithFooter`
    - `ModalHeaderOnly`
    - `RomCacheSwitch`
    - `Collapsible`
    - `ToggleSwitch`
    - `AboutNetworkCard`
    - `AboutDialog`
    - `EmulatorNotConfiguredDialog`
    - `SettingsDialog`
    - `WelcomeGuideDialog`
  - 用法：
    ```js
    import { ModalWithFooter, Collapsible } from '@ui';
    ```

- `src/components/index.js`
  - 當前命名匯出（Named exports）：
    - 頂層 UI/容器：
      - `TitleBar`
      - `DirectoryManager`
      - `SearchBar`
      - `GameInfoDialog`
      - `EmulatorConfigDialog`
      - `FolderWindowApp`
    - 模擬器設定元件：
      - `FreeJ2MEPlusConfig`
      - `KEmulator`
      - `LibretroFJPlus`
    - 常用對話框：
      - `GameLaunchDialog`
      - `FolderSelectDialog`
      - `BackupDialog`
    - 子命名空間再匯出：
      - `export * as ui from './ui/index.js'`
  - 用法：
    ```js
    import { DirectoryManager, GameLaunchDialog } from '@components';
    import { ui } from '@components';
    // ui.ModalWithFooter, ui.Collapsible, ...
    ```

> 備註：彙總出口為選用，目的在於降低匯入冗長度、提升開發體驗。

- `src/assets/icons/index.js`
  - 命名匯出（Named exports）：
    - `AppIconSvg`（對應 `./icon.svg`）
    - `MitLicenseSvg`（對應 `./License_MIT.svg`）
    - `S3Svg`（對應 `./s3.svg`）
    - `WebdavSvg`（對應 `./webdav.svg`）
    - `DropboxSvg`（對應 `./dropbox.svg`）
  - 用法：
    ```js
    import { AppIconSvg, MitLicenseSvg, S3Svg, WebdavSvg, DropboxSvg } from '@/assets/icons';
    ```

- `src/components/shared/hooks/index.js`
  - 共享 hooks 彙總出口：
    - `useCreateShortcut`
    - `useDragSession`
    - `useOutsideClick`
    - `useSelectionBox`
    - `useUnifiedContextMenu`
    - `useWheelTouchLock`
  - 用法：
    ```js
    import { useSelectionBox, useDragSession } from '@shared/hooks';
    ```

## 除錯與維護

### 常見問題與解決方案

#### 匯入解析錯誤

**問題**：`Cannot resolve module '@components/...'`

**解決方案**：
1. 檢查 `vite.config.js` 中的 `resolve.alias` 配置
2. 檢查 `jsconfig.json` 中的 `compilerOptions.paths` 配置
3. 重啟 Vite dev server：`npm run dev`
4. 清除緩存：`rm -rf node_modules/.vite`

#### 循環依賴問題

**問題**：`Circular dependency detected`

**解決方案**：
1. 使用依賴分析工具：`npx madge --circular src/`
2. 重構模組結構，提取共享依賴
3. 使用動態匯入打破循環

#### ESLint 規則衝突

**問題**：`Prefer alias import over relative path`

**解決方案**：
1. 更新匯入路徑使用別名
2. 檢查 `eslint.config.js` 中的相關規則
3. 使用 `npm run lint:fix` 自動修復

### 維護清單

#### 定期檢查
- [ ] 檢查彙總出口檔案的完整性
- [ ] 更新文檔中的匯出列表
- [ ] 驗證所有別名路徑的有效性
- [ ] 測試新組件的匯入路徑

#### 性能監控
- 使用 Vite 的 bundle analyzer 分析模組大小
- 監控彙總出口的加載時間
- 避免在彙總出口中包含大型依賴

### 開發工具支援

- **VS Code**：安裝 TypeScript Hero 擴展以支援自動匯入整理
- **WebStorm**：啟用 "Optimize imports on the fly" 功能
- **ESLint**：使用 `eslint-plugin-import` 檢查匯入規範

> **重要提醒**：任何別名或彙總出口的變更都應該同時更新相關文檔，並在 PR 中說明變更的影響範圍。所有變更都應經過完整的測試確保不破壞既有功能。
