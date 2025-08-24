# Stylelint 設定說明（Stylelint-Config）

本文件說明專案的 Stylelint 配置與使用建議，方便在撰寫 CSS/樣式時維持一致性與可維護性。

- 依賴套件：`stylelint@^16.23.1`、`stylelint-config-standard@^36.0.1`
- 配置方式：內建預設配置（使用 `stylelint-config-standard`）
- 執行腳本：`package.json` 中的 `stylelint` 與 `stylelint:fix`

## 配置摘要

專案使用 `stylelint-config-standard` 作為基礎配置，無額外自定義規則檔案。

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

## 寫作建議
- 優先使用設計代幣（tokens）：參見 `src/styles/theme.css`。
- 組件樣式建議只保留尺寸/佈局/動畫，外觀性質（背景、邊框、陰影、圓角）盡量由共用樣式統一提供。
- 若需覆寫共用樣式，請限制在元件的根節點範圍，並以註解標記原因。
- 抽屜/桌面相關位移、過渡等，盡可能沿用既有 CSS 流程（例如 `.desktop-shift-layer` 的 `transform` 與 `transition`）。

## 常見指令
- **檢查樣式**：
  - `npm run stylelint`
- **自動修復**（謹慎使用）：
  - `npm run stylelint:fix`
- **手動執行**：
  - `npx stylelint "src/**/*.{css,scss}"`
  - `npx stylelint "src/**/*.{css,scss}" --fix`

## 專案樣式結構

- **`src/styles/`**：全域樣式檔案
  - `theme.css`：主題變數與設計代幣
  - `tokens.css`：設計系統代幣
  - `utility.css`：工具類樣式
  - `dialog.css`：對話框通用樣式
  - `buttons.css`：按鈕樣式
  - `focus-ring.css`：焦點環樣式
- **元件樣式**：與 `.jsx` 檔案同目錄的 `.css` 檔案
  - 例如：`DirectoryManager.css`、`Desktop.css`、`FolderDrawer.css`

> **備註**：如需新增忽略規則或調整校驗強度，建議建立 `.stylelintrc.json` 配置檔案，並在 PR 中簡述動機與影響範圍，避免無意義的靜態檢查噪音。
