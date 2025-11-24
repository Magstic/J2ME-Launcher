# Stylelint 設定說明（Stylelint-Config）

本文件說明 J2ME Launcher 專案的 Stylelint 配置與使用建議，方便在撰寫 CSS/樣式時維持一致性與可維護性，並確保樣式品質符合現代前端最佳實踐。

- 依賴套件：`stylelint@^16.23.1`、`stylelint-config-standard@^36.0.1`
- 配置方式：使用 `stylelint-config-standard` 搭配根目錄 `.stylelintrc.json`（少量規則覆寫）
- 執行腳本：`package.json` 中的 `stylelint` 與 `stylelint:fix`

## 配置摘要

專案使用 `stylelint-config-standard` 作為基礎配置，並在根目錄 `.stylelintrc.json` 中做極少量調整（允許部分現代 at-rule、關閉高噪音規則），整體仍以官方預設行為為主。

### 執行腳本（package.json）

```json
{
  "scripts": {
    "stylelint": "stylelint \"src/**/*.{css,scss}\"",
    "stylelint:fix": "stylelint \"src/**/*.{css,scss}\" --fix"
  }
}
```

### 說明

- **基礎配置**：`stylelint-config-standard@^36.0.1`
  - 採用官方推薦的標準規範，涵蓋常見最佳實踐
  - 包含現代 CSS 語法支援與最佳實踐規則
- **檢查範圍**：`src/**/*.{css,scss}`
  - 涵蓋所有 `src/` 目錄下的 CSS 和 SCSS 檔案
  - 主要樣式檔案位於 `src/styles/` 與各元件目錄中

#### 實際 Stylelint 設定檔（.stylelintrc.json）

專案根目錄下的 `.stylelintrc.json` 內容如下：

```json
{
  "extends": ["stylelint-config-standard"],
  "rules": {
    "at-rule-no-unknown": [true, { "ignoreAtRules": ["layer", "keyframes"] }],
    "no-descending-specificity": null
  }
}
```

- `at-rule-no-unknown`：允許使用 `@layer` 與自訂 `@keyframes` 等現代語法。
- `no-descending-specificity`：關閉層疊順序相關規則，避免在多層結構與覆寫場景中產生過多噪音。

#### SCSS 現況

- 目前專案未使用 `.scss` 檔（保留 `scss` 擴充僅為未來擴展方便）。
- 若未來導入 SCSS，建議考慮 `stylelint-config-standard-scss` 以獲得更完整的 SCSS 規則集。

## 樣式編寫最佳實踐

### 設計代幣系統

- **優先使用設計代幣**：參考 `src/styles/theme.css` 和 `src/styles/tokens.css`
- **變數命名規範**：使用 CSS 自訂屬性（CSS Variables）

  ```css
  /* ✅ 推薦 */
  .game-card {
    background: var(--background-secondary);
    border-radius: var(--border-radius-md);
    padding: 16px;
    box-shadow: var(--card-shadow);
  }

  /* ❌ 避免 */
  .game-card {
    background: #ffffff;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  ```

### 組件樣式組織

- **職責分離**：組件樣式只負責尺寸、佈局、動畫
- **外觀統一**：背景、邊框、陰影、圓角由全域樣式提供
- **覆寫原則**：限制在組件根節點，並添加註解說明

```css
/* ✅ 良好的組件樣式結構（對應 App.css 的 .game-grid 現況） */
.game-grid {
  /* 佈局相關 */
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 24px;

  /* 尺寸相關 */
  flex: 1;
  min-height: 0;
}

/* 特殊狀態的覆寫：空狀態置中 */
.game-grid.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### 動畫與過渡

- **沿用既有模式**：參考 `.desktop-view .game-card`、`.folder-drawer .folder-card` 等既有實作
- **性能優先**：使用 `transform` 和 `opacity` 進行動畫
- **減少動畫支援**：遵循 `prefers-reduced-motion` 媒體查詢

```css
/* 動畫最佳實踐：使用 transform / opacity（對應 FolderDrawer.css 現況） */
.folder-drawer .folder-card {
  transition:
    opacity 120ms ease-out,
    transform 120ms ease-out,
    background-color 200ms ease;
}

.folder-drawer .folder-card.appearing {
  opacity: 0;
  transform: translateY(2px);
}

.folder-drawer .folder-card:hover {
  transform: translateY(-2px);
  background-color: var(--hover-color);
}

/* 減少動畫支援：在 Desktop 視圖中關閉整體過渡（對應 Desktop.css 現況） */
@media (prefers-reduced-motion: reduce) {
  .desktop-view {
    transition: none;
  }
}
```

## 常見指令

- **檢查樣式**：
  - `npm run stylelint`
- **自動修復**（謹慎使用）：
  - `npm run stylelint:fix`
- **手動執行**：
  - `npx stylelint "src/**/*.{css,scss}"`
  - `npx stylelint "src/**/*.{css,scss}" --fix`

## 開發環境整合

### VSCode 設定建議

- 安裝擴充：`stylelint.vscode-stylelint`、`esbenp.prettier-vscode`
- 建議在工作區 `.vscode/settings.json` 增加（示例）：

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.stylelint": true,
    "source.fixAll.eslint": true
  }
}
```

### 與 Prettier 的搭配

- 先由 Prettier 做格式化，再由 Stylelint 檢查/修復規則（避免互相覆寫）。
- 專案已透過 `lint-staged` 對 `*.css,*.scss` 執行 Prettier（見 `package.json` 的 `lint-staged`）。
- 推薦在提交前執行：

```bash
npm run format:check && npm run stylelint
```

## 專案樣式結構

### 全域樣式系統 (`src/styles/`)

#### 核心樣式檔案

- **`theme.css`** - 主題樣式聚合與共享微調元件（引入 `tokens.css`，定義 selection-rect、loading-spinner、drag-overlay、滾動條等）
- **`tokens.css`** - 設計系統代幣（色彩、陰影、圓角等基礎 Token）
- **`utility.css`** - 工具類樣式（Utility Classes）

#### 組件樣式檔案

- **`dialog.css`** - 對話框通用樣式
- **`buttons.css`** - 按鈕樣式系統
- **`focus-ring.css`** - 焦點環與可訪問性樣式

### 組件級樣式

與 `.jsx` 檔案同目錄的 `.css` 檔案：

#### 主要組件樣式

- **`DirectoryManager.css`** - 目錄管理器樣式
- **`Desktop.css`** - 桌面主介面樣式
- **`FolderDrawer.css`** - 資料夾抽屉樣式

#### 樣式組織原則

```css
/* 組件樣式檔案結構範例（對應 DirectoryManager.css 現況） */

/* 1. 組件根元素 */
.directory-manager {
  /* 佈局與尺寸（由共用 modal 樣式主導，此處僅示意） */
}

/* 2. 子元素 */
.directory-manager .directory-list {
  /* 子元素樣式 */
}

/* 3. 狀態修飾符／輔助 class */
.directory-manager .directory-item.disabled {
  /* 狀態相關樣式 */
}

/* 4. 響應式設計 */
@media (width <= 768px) {
  .directory-manager {
    /* 行動端適配 */
  }
}
```

## 進階配置

### 性能考量

- **避免深層嵌套**：選擇器嵌套不超過 3 層（非必須）
- **減少重繪**：使用 `transform` 和 `opacity` 進行動畫

### 可訪問性

- **焦點管理**：使用 `focus-ring.css` 中的統一樣式
- **對比度**：確保文字與背景的對比度符合 WCAG 標準
- **響應式設計**：支援多種螢幕尺寸和設備

> **備註**：任何配置變更都應在 PR 中簡述動機與影響範圍，避免無意義的靜態檢查噪音。所有樣式變更都應經過測試確保不影響既有功能。
