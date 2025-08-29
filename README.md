<div align="center">
  <h1>J2ME Launcher</h1>
  <p><strong>Modern J2ME Game Frontend.</strong></p>
  <p>現代化的 J2ME 遊戲前端</p>
  
![Platform](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-28.2.0-47848F?style=flat-square)
![React](https://img.shields.io/badge/React-19.1.1-61DAFB?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-7.0.6-646CFF?style=flat-square)
</div>

---

## ✨ 功能特色

| 功能 | 描述 |
|------|------|
| 🎯 **遊戲管理** | 自動掃描並解析 J2ME 遊戲檔案，生成美觀的遊戲網格 |
| 📁 **資料夾分類** | 支援自定義資料夾分類，輕鬆管理大量遊戲收藏 |
| ☁️ **雲端備份** | 支援 S3、WebDAV、Dropbox 多種雲端服務備份 |
| 🖱️ **拖拽操作** | 直觀的拖拽介面，支援跨視窗操作 |
| 🎨 **現代化 UI** | 基於 React + Vite 構建的響應式使用者介面 |
| 🔍 **快速搜尋** | 內建搜尋功能，快速定位目標遊戲 |
| 🎯 **桌面捷徑** | 一鍵建立 Windows 桌面捷徑 |

## 📦 安裝

### 系統需求

- **作業系統**: Windows 10/11 (x64)
- **Java**: 用於執行 J2ME 模擬器（建議 OpenJRE 8）

Linux 版本正在測試中。

### 下載安裝包

現在我們沒有任何發行版，但這一天不會很遠。

前往 [Releases](https://github.com/Magstic/J2ME-Launcher/releases) 頁面下載最新版本。

### 從原始碼安裝

```bash
# 克隆專案
git clone https://github.com/Magstic/J2ME-Launcher.git
cd J2ME-Launcher

# 安裝依賴
npm install

# 建置應用程式
npm run dist
```

## 🚀 使用方法

### 基本使用

1. **新增遊戲目錄**
   - 選擇『ROM 資料夾』
   - 選擇包含 J2ME 遊戲的資料夾，並執行掃描

2. **組織遊戲**
   - 使用左側資料夾抽屜建立分類
   - 拖拽或加入遊戲到對應資料夾

3. **啟動遊戲**
   - 在『模擬器配置』中配置模擬器
   - 雙擊遊戲卡片，配置參數後啟動

### 雲端備份設定

- S3 API
- WebDAV
- Dropbox

## 🛠️ 開發指南

### 開發環境設置

```bash
# 安裝依賴
npm install

# 啟動開發模式
npm run electron:dev

# 程式碼檢查
npm run lint
npm run stylelint

# 建置應用程式
npm run dist
```

### 技術棧

- **前端**: React 19 + Vite 7
- **桌面框架**: Electron 28
- **資料庫**: SQLite (better-sqlite3)
- **樣式表**: CSS Modules + CSS Custom Properties
- **格式校驗**: ESLint + Stylelint + Husky

## 🤝 貢獻方式

想貢獻本程式嗎？請遵循以下規範：

- 遵循 ESLint 和 Stylelint 規則
- 使用 Conventional Commits 格式
- 參考 [I18N 貢獻指南](docs/I18N-Guide.md) 新增翻譯
- 更新相關文檔

### 問題回報

有功能建議嗎？請到 [Issues](https://github.com/Magstic/J2ME-Launcher/issues) 頁面回報。

## 📚 文檔

- [I18N 貢獻指南 / I18N Guide](docs/I18N-Guide.md)
- [IPC API 指南](docs/IPC-Guide.md)
- [專案結構說明](docs/tree.md)
- [匯入別名使用](docs/aliases.zh.md)
- [樣式規範](docs/Stylelint-Config.md)

## 💡 鳴謝

Thanks to ChatGPT, Claude and Gemini.

Thanks to every maintainer of the J2ME emulator.

## 📄 授權

本專案採用 [MIT License](LICENSE) 授權。

---

<div align="center">
  <p>Made with by <a href="https://github.com/Magstic">Magstic</a></p>
</div>