# 匯入別名與彙總出口（中文說明）

本專案使用 Vite 的路徑別名（alias）與部分彙總出口（barrel files）來保持匯入路徑的整潔與穩定。

## 別名（權威來源）

定義位置：
- `vite.config.js` → `resolve.alias`
- `jsconfig.json` → `compilerOptions.paths`

目前映射：
- `@components` → `src/components`
- `@ui` → `src/components/ui`
- `@shared` → `src/components/shared`
- `@hooks` → `src/hooks`
- `@config` → `src/config`

注意：
- `@shared` 指向 UI 層的共享元件資料夾 `src/components/shared`。
- 專案頂層的 `src/shared`（例如 `src/shared/backup/spec.js`、`src/shared/backup/indexTSV.js`）沒有設定 alias，以避免命名混淆。請在 `src/main` 或渲染端以相對路徑匯入（例如：在 `src/main/ipc/backup.js` 以 `require('../shared/backup/spec')` 匯入）。

## 使用規範

- 對於共享或 UI 元件，優先使用別名，避免冗長的相對路徑。
- 若元件真的是「僅在本資料夾內使用」，可維持相對路徑。
- 控制器綁定與應用層常量建議透過 `@config` 匯入。

### 範例

```js
// 推薦（使用別名）
import { ModalWithFooter, Collapsible } from '@ui';
import { DesktopManager, DirectoryManager } from '@components';
import useGamepad from '@hooks/useGamepad';
import { controllerBindings } from '@config/controllerBindings';

// 可接受（本地化且僅本資料夾使用）
import LocalPart from './LocalPart';
```

## 彙總出口（Barrels）

我們提供兩個常用的彙總出口以簡化匯入。

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
      - `DesktopManager`
      - `GameInfoDialog`
      - `EmulatorConfigDialog`
      - `FolderWindowApp`
    - 控制器：
      - `GameGridController`
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
    import { DesktopManager, DirectoryManager, GameLaunchDialog } from '@components';
    import { ui } from '@components';
    // ui.ModalWithFooter, ui.Collapsible, ...
    ```

> 備註：彙總出口為選用，目的在於降低匯入冗長度、提升開發體驗。

- `src/components/shared/hooks/index.js`
  - 共享 hooks 彙總出口：
    - `useDragSession`
    - `useFlipAnimation`
    - `useFlipWithWhitelist`
    - `useSelectionBox`
    - `useUnifiedContextMenu`
    - `useVirtualizedGrid`
  - 用法：
    ```js
    import { useSelectionBox, useDragSession } from '@shared/hooks';
    ```

## 除錯小技巧

- 變更 alias 後，請重啟 Vite dev server 以清除快取。
- 若出現匯入解析錯誤，通常是別名缺失或映射路徑不正確，請依上述權威來源檢查並修正。
- ESLint 配置（`eslint.config.js`）強制使用別名而非相對路徑深入 `components/` 子目錄，以維持架構清晰。
