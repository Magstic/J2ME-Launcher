# I18N 貢獻指南（新增語言）

# I18N Contribution Guide (Add a New Language)

本指南說明如何為 J2ME Launcher 新增一個介面語言，適用於 PR 提交者。

This guide explains how to add a new UI language for J2ME Launcher, intended for PR contributors.

## 檔名與規範

## File naming and conventions

- 採用 IETF BCP 47 語言代碼，如：`en-US`、`zh-TW`、`ja-JP`、`fr-FR`。
- 置於：`src/locales/<lang>.json`。
- 檔案格式：UTF-8、JSON、2 空格縮排。

- Use IETF BCP 47 language codes, e.g. `en-US`, `zh-TW`, `ja-JP`, `fr-FR`.
- Place file at: `src/locales/<lang>.json`.
- Encoding and style: UTF-8, JSON, 2-space indentation.

## 步驟一：建立對應的 JSON 檔

## Step 1: Create the locale JSON

1. 複製一份現有語言檔作為模板（建議以 `en-US.json` 為基準）。
2. 重新命名為你的語言代碼，例如：`src/locales/ja-JP.json`。
3. 按照原有的鍵（key）結構逐一翻譯 value。
   - 勿改動 key 名稱與層級。
   - 勿移除或新增插值變數，如 `{{count}}`、`{{date}}`。
   - 文字內可使用換行 `\n`；請保留必要的標點符號與引號逃逸。

4. Copy an existing locale as a template (recommend `en-US.json`).
5. Rename it to your language code, e.g. `src/locales/ja-JP.json`.
6. Translate values while keeping the exact key structure.
   - Do not change key names or hierarchy.
   - Do not remove/add interpolation tokens like `{{count}}`, `{{date}}`.
   - You may use `\n` for line breaks; keep punctuation and escaped quotes intact.

## 步驟二：在程式中註冊語言

## Step 2: Register the language in code

- 編輯 `src/contexts/I18nContext.jsx` 中的 `SUPPORTED_LANGUAGES`：
- Edit `SUPPORTED_LANGUAGES` in `src/contexts/I18nContext.jsx`:

```js
export const SUPPORTED_LANGUAGES = {
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  'en-US': 'English',
  // 新增一行，例如：
  'ja-JP': '日本語',
};
```

- 語言代稱（右側字串）建議使用該語言的本地書寫，例如：日本語、Français、Deutsch。
  For the display name (right-hand string), prefer the native script, e.g. 日本語, Français, Deutsch.

> 注意：`I18nContext.jsx` 會依 `SUPPORTED_LANGUAGES` 來決定語言選單顯示與切換合法性。
> Note: `SUPPORTED_LANGUAGES` controls the language menu and allowed switches.

## 步驟三：本地測試與驗證

## Step 3: Local testing and verification

1. 開發模式啟動：
   - `npm run dev`
   - 開發環境下語言檔支援熱重載（檔案更新約 1 秒內自動生效）。
2. 切換語言：
   - 透過應用內設定（若有語言選單），或在 DevTools 中執行：
     ```js
     localStorage.setItem('language', '<lang>');
     location.reload();
     ```
3. 檢查主控台警告：
   - `t('...')` 找不到對應 key 時，會在 Console 警告“Translation missing for key”。
   - 請補齊所有缺漏鍵值；建議使用差異工具對照 `en-US.json`。

4. Start dev mode: `npm run dev`.
   - In dev, locale JSON supports hot reload (changes apply within ~1s).
5. Switch language:
   - Via in-app settings (if available), or in DevTools:
     ```js
     localStorage.setItem('language', '<lang>');
     location.reload();
     ```
6. Check console warnings:
   - When `t('...')` misses a key, you’ll see “Translation missing for key”.
   - Fill missing keys; diff against `en-US.json` as reference.

## 翻譯品質建議

## Translation quality tips

- 風格一致：術語在整個應用中保持一致（如：設定/配置、資料夾/文件夾）。
- 簡潔易懂：避免過長句子；必要時分成短句或使用備註說明。
- 介面適配：留意文案長度是否導致 UI 溢出（按鈕、標題）。
- 技術詞彙：保留專有名詞或以括號補充（例如：Framerate（幀率））。
- 插值變數：不得翻譯或刪除 `{{var}}` 名稱，周邊文案需通順。

- Consistency: keep terminology consistent across the app.
- Clarity: avoid overly long sentences; split or add notes when needed.
- UI fit: verify text lengths don’t overflow buttons/titles.
- Technical terms: keep proper nouns or add parentheses explanations.
- Interpolation: don’t translate/remove `{{var}}`; ensure surrounding text reads naturally.

## PR 檢查清單（必填）

## PR checklist (required)

- [ ] 新增 `src/locales/<lang>.json`，鍵值結構與 `en-US.json` 對齊。
- [ ] 在 `src/contexts/I18nContext.jsx` 的 `SUPPORTED_LANGUAGES` 註冊新語言。
- [ ] 本地驗證無 Console 缺漏鍵警告，主要流程頁面皆覆蓋：
  - [ ] 桌面 / 目錄管理
  - [ ] 設定頁（Theme/Language 等）
  - [ ] 模擬器設定（`emulatorConfig.*`）
  - [ ] 關於頁面 / 對話框
- [ ] 文案長度不致 UI 破版，常見視窗寬度下檢視過。

- [ ] Add `src/locales/<lang>.json`, with keys aligned to `en-US.json`.
- [ ] Register the language in `SUPPORTED_LANGUAGES`.
- [ ] No missing-key console warnings; main flows verified:
  - [ ] Desktop / Directory Manager
  - [ ] Settings (Theme/Language, etc.)
  - [ ] Emulator Config (`emulatorConfig.*`)
  - [ ] About page / dialogs
- [ ] Text lengths don’t break layouts at common window widths.

## 進階：系統語言偵測與預設

## Advanced: system language detection and defaults

- `src/contexts/I18nContext.jsx` 的初始化邏輯：
  1. 優先讀取 `localStorage.language`。
  2. 若無設定，則檢測 `navigator.language`：
     - `zh` 系列：依地區對應至 `zh-CN` 或 `zh-TW`。
     - `en` 系列：統一對應至 `en-US`。
     - 其他語言：回退至 `DEFAULT_LANGUAGE`（目前為 `zh-TW`）。
  3. 若需支援新語言的自動偵測，請在 `I18nProvider` 的 `useState` 初始化邏輯中添加對應規則。

- Initialization logic in `src/contexts/I18nContext.jsx`:
  1. Check `localStorage.language`.
  2. If missing, check `navigator.language`:
     - `zh-*`: Maps to `zh-CN` or `zh-TW` based on region.
     - `en-*`: Maps to `en-US`.
     - Others: Falls back to `DEFAULT_LANGUAGE` (currently `zh-TW`).
  3. To support auto-detection for a new language, add your logic in the `useState` initialization block of `I18nProvider`.

## 常見問題

## FAQ

- Q：可以只翻譯部分鍵值嗎？
  - A：可以，但建議盡量補齊。缺漏鍵會以 key 原文顯示且在 Console 警告。
- Q：需要改動打包或 Vite 配置嗎？
  - A：不需要。語言檔已透過動態載入與 dev 模式的 fetch 方案處理。
- Q：RTL（由右至左）語言支援？
  - A：目前 UI 尚未專門處理 RTL，如需貢獻，歡迎在 PR 中一併提出樣式調整建議。

- Q: Can I translate only part of the keys?
  - A: Yes, but try to complete them. Missing keys display the key itself and log a console warning.
- Q: Do I need to change build or Vite config?
  - A: No. Locale files are handled via dynamic import and dev fetch path.
- Q: RTL (right-to-left) language support?
  - A: Not specifically tuned yet; PRs with style adjustments are welcome.

---

感謝你的語言貢獻！
Thank you for your translation contribution!
