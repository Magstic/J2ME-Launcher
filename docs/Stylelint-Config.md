# Stylelint 設定說明（Stylelint-Config）

本文件說明 J2ME Launcher 專案的 Stylelint 配置與使用建議，方便在撰寫 CSS/樣式時維持一致性與可維護性，並確保樣式品質符合現代前端最佳實踐。

- 依賴套件：`stylelint@^16.23.1`、`stylelint-config-standard@^36.0.1`
- 配置方式：內建預設配置（使用 `stylelint-config-standard`）
- 執行腳本：`package.json` 中的 `stylelint` 與 `stylelint:fix`

## 配置摘要

專案使用 `stylelint-config-standard` 作為基礎配置，無額外自訂規則檔案。

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

## 樣式編寫最佳實踐

### 設計代幣系統

- **優先使用設計代幣**：參考 `src/styles/theme.css` 和 `src/styles/tokens.css`
- **變數命名規範**：使用 CSS 自訂屬性（CSS Variables）

  ```css
  /* ✅ 推薦 */
  .game-card {
    background: var(--color-surface);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    box-shadow: var(--shadow-sm);
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
/* ✅ 良好的組件樣式結構 */
.game-grid {
  /* 佈局相關 */
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--spacing-md);

  /* 尺寸相關 */
  width: 100%;
  height: 100%;

  /* 動畫相關 */
  transition: opacity var(--duration-fast) var(--easing-standard);
}

/* 特殊情況的覆寫，需要註解 */
.game-grid--loading {
  /* 載入狀態需要特殊的背景色彩 */
  background: var(--color-surface-variant);
}
```

### 動畫與過渡

- **沿用既有模式**：參考 `.desktop-shift-layer` 等既有實作
- **性能優先**：使用 `transform` 和 `opacity` 進行動畫
- **減少動畫支援**：遵循 `prefers-reduced-motion` 媒體查詢

```css
/* 動畫最佳實踐 */
.folder-drawer {
  transform: translateX(-100%);
  transition: transform var(--duration-normal) var(--easing-standard);
}

.folder-drawer--open {
  transform: translateX(0);
}

/* 減少動畫支援 */
@media (prefers-reduced-motion: reduce) {
  .folder-drawer {
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

## 專案樣式結構

### 全域樣式系統 (`src/styles/`)

#### 核心樣式檔案

- **`theme.css`** - 主題變數與色彩系統
- **`tokens.css`** - 設計系統代幣（間距、字型、圓角等）
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
/* 組件樣式檔案結構範例 */

/* 1. 組件根元素 */
.directory-manager {
  /* 佈局與尺寸 */
}

/* 2. 子元素 */
.directory-manager__header {
  /* 子元素樣式 */
}

/* 3. 狀態修飾符 */
.directory-manager--loading {
  /* 狀態相關樣式 */
}

/* 4. 響應式設計 */
@media (max-width: 768px) {
  .directory-manager {
    /* 行動端適配 */
  }
}
```

## 進階配置

### 自訂規則

如需新增忽略規則或調整校驗強度，可建立 `.stylelintrc.json` 配置檔案：

```json
{
  "extends": ["stylelint-config-standard"],
  "rules": {
    "selector-class-pattern": [
      "^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$",
      {
        "message": "Expected class selector to be kebab-case with BEM methodology"
      }
    ],
    "custom-property-pattern": [
      "^[a-z][a-z0-9]*(-[a-z0-9]+)*$",
      {
        "message": "Expected custom property to be kebab-case"
      }
    ]
  },
  "ignoreFiles": ["node_modules/**", "dist/**", "build/**"]
}
```

### CSS 命名規範

採用 BEM (Block Element Modifier) 方法論：

```css
/* Block */
.game-card {
}

/* Element */
.game-card__title {
}
.game-card__icon {
}
.game-card__actions {
}

/* Modifier */
.game-card--selected {
}
.game-card--loading {
}
.game-card--large {
}

/* Element + Modifier */
.game-card__title--truncated {
}
```

### 性能考量

- **避免深層嵌套**：選擇器嵌套不超過 3 層
- **減少重繪**：使用 `transform` 和 `opacity` 進行動畫
- **懶加載**：大型樣式檔案考慮按需加載

### 可訪問性

- **焦點管理**：使用 `focus-ring.css` 中的統一樣式
- **對比度**：確保文字與背景的對比度符合 WCAG 標準
- **響應式設計**：支援多種螢幕尺寸和設備

> **備註**：任何配置變更都應在 PR 中簡述動機與影響範圍，避免無意義的靜態檢查噪音。所有樣式變更都應經過測試確保不影響既有功能。
