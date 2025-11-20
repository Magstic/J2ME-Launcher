# 日誌管理系統使用指南

## 概述

本系統提供最小侵入性的日誌管理，透過攔截 `console` 方法實現統一控制，支持開發/生產環境自動切換。

## 環境配置

### 開發環境

- `NODE_ENV=development`: 自動啟用所有日誌
- `DEBUG=true`: 強制啟用日誌輸出

### 生產環境

- 自動關閉除 `console.error` 外的所有日誌
- 保留錯誤日誌用於問題排查

## 運行時控制 (開發環境)

### 瀏覽器控制台

```javascript
// 全局開關
window.toggleLogs(true); // 開啟所有日誌
window.toggleLogs(false); // 關閉所有日誌

// 按級別控制
window.toggleLogLevel('debug', true); // 開啟 debug 日誌
window.toggleLogLevel('log', false); // 關閉 log 日誌

// 查看當前配置
window.showLogConfig();
```

### Node.js 主進程

```javascript
// 全局開關
global.toggleLogs(true);

// 按級別控制
global.toggleLogLevel('warn', false);

// 查看配置
global.showLogConfig();
```

## 日誌級別

| 級別    | 開發環境 | 生產環境 | 說明                                                     |
| ------- | -------- | -------- | -------------------------------------------------------- |
| `error` | ✅       | ✅       | 錯誤信息，始終保留                                       |
| `warn`  | ✅       | ❌       | 警告信息                                                 |
| `log`   | ✅       | ❌       | 一般日誌                                                 |
| `info`  | ✅       | ❌       | 信息日誌                                                 |
| `debug` | ✅       | ❌       | 調試日誌（開發環境預設開啟，可透過 toggleLogLevel 控制） |

## 實現細節

### 文件結構

```
src/utils/
├── logger.js     # ES6 模塊版本 (渲染進程)
└── logger.cjs    # CommonJS 版本 (主進程)
```

### 集成方式

```javascript
// 渲染進程入口 (main.jsx, folder-main.jsx)
import './utils/logger.js';

// 主進程入口 (main/main.js)
require('./utils/logger.cjs');
```

## 使用建議

1. **開發階段**: 使用 `console.log` 進行調試，無需修改現有代碼
2. **調試特定功能**: 使用 `window.toggleLogLevel()` 只顯示需要的日誌
3. **性能測試**: 使用 `window.toggleLogs(false)` 模擬生產環境
4. **問題排查**: `console.error` 在所有環境都會顯示

## 注意事項

- 系統會自動保存原始 `console` 方法的引用
- 不會影響現有代碼的執行邏輯
- 在生產環境中，除錯誤日誌外其他日誌完全不執行，零性能影響
