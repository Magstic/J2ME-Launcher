<div align="center">
  <h1>J2ME Launcher</h1>
  <p><strong>Modern J2ME Game Frontend</strong></p>
  <p>現代化的 J2ME 遊戲前端</p>
  
![Windows](https://img.shields.io/badge/Windows-Stable-success?style=flat-square&logo=windows)
![Linux](https://img.shields.io/badge/Linux-Testing-yellow?style=flat-square&logo=linux)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-28.2.0-47848F?style=flat-square)
![React](https://img.shields.io/badge/React-19.1.1-61DAFB?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-7.0.6-646CFF?style=flat-square)
</div>

<div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
  <img src="https://s2.loli.net/2025/08/30/n5mfvIVjNxMEHk4.webp" style="width: 100%; min-width: 250px;">
</div>

---

## ✨ 功能特色

| 功能              | 描述                                        |
| ----------------- | ------------------------------------------- |
| 🎯 **遊戲管理**   | 自動掃描並解析 J2ME 檔，生成美觀的 GameGrid |
| 📁 **資料夾分類** | 支援自訂資料夾分類，輕鬆管理大量遊戲收藏    |
| ☁️ **雲端同步**   | 支援 S3 API、WebDAV、Dropbox 進行雲端備份   |
| 🖱️ **拖拽操作**   | 直觀的桌面式操控，支援跨視窗操作            |
| 🎯 **桌面捷徑**   | 建立桌面捷徑，輕鬆打開遊戲                  |

## 📦 安裝

**前往 [Releases](https://github.com/Magstic/J2ME-Launcher/releases) 下載最新版本。**

### 系統需求

- Windows 10/11 (x64)
- Linux (x64)

_Linux 正在測試階段，但其功能已經高度可用。_

### 額外環境

- OpenJRE 8

_Java 用於執行 J2ME 模擬器，任何的 Java 8 都可以。_

### J2ME EMU

- [FreeJ2ME-Plus](https://github.com/TASEmulators/freej2me-plus)
- [KEmulator nnmod](https://github.com/shinovon/KEmulator)

_因許可授權限制，本專案不會附帶任何模擬器，您需自行下載。_

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
npm run dist:win
npm run dist:linux
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

_該專案目前由 AI 進行維護，因此程式碼的貢獻可能不會過於順遂。_

### 問題回報

有功能建議或是錯誤嗎？請到 [Issues](https://github.com/Magstic/J2ME-Launcher/issues) 頁面回報。

## 📚 文檔

- [I18N 貢獻指南 / I18N Guide](docs/I18N-Guide.md)
- [IPC API 指南](docs/IPC-Guide.md)
- [專案結構說明](docs/tree.md)
- [匯入別名使用](docs/aliases.zh.md)
- [YAML 配置說明](docs/yaml-config.md)
- [樣式規範](docs/Stylelint-Config.md)

## 💡 鳴謝

Thanks to ChatGPT, Claude and Gemini.

Thanks to every maintainer of the J2ME emulator.

## 📄 授權

本專案採用 [MIT License](LICENSE) 授權，使用的第三方套件如下：

- [aws-sdk-js-v3](https://github.com/aws/aws-sdk-js-v3)(client-s3/lib-storage) - Apache-2.0 license
- [better-sqlite3](https://github.com/JoshuaWise/better-sqlite3) - MIT license
- [fs-extra](https://github.com/jprichardson/node-fs-extra) - MIT license
- [js-yaml](https://github.com/nodeca/js-yaml) - MIT license
- [react](https://github.com/facebook/react) - MIT license
- [react-dom](https://github.com/facebook/react) - MIT license
- [react-window](https://github.com/bvaughn/react-window) - MIT license
- [yauzl](https://github.com/thejoshwolfe/yauzl) - MIT license
