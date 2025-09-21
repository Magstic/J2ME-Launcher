const { protocol } = require('electron');
const path = require('path');

function registerProtocols() {
  // 必须在 app ready 事件之前注册协议方案（由 main.js 调用）
  protocol.registerSchemesAsPrivileged([
    { scheme: 'safe-file', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  ]);
}

function toIconUrl(iconPath) {
  // 若未提供圖標路徑，回退到預設圖標（由 main 協議處理映射到 src/image/ico.svg）
  if (!iconPath) return 'safe-file://default-ico.svg';
  const iconName = path.basename(iconPath);
  return `safe-file://${iconName}`;
}

function addUrlToGames(games) {
  // 確保返回可序列化的物件，移除任何不可序列化的屬性
  return games.map((game) => {
    if (!game || typeof game !== 'object') return game;

    // 創建純淨的可序列化物件
    const cleanGame = {};

    // 只複製基本類型和可序列化的屬性
    for (const [key, value] of Object.entries(game)) {
      if (value === null || value === undefined) {
        cleanGame[key] = value;
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        cleanGame[key] = value;
      } else if (Array.isArray(value)) {
        // 確保陣列內容也是可序列化的
        cleanGame[key] = value.filter(
          (item) =>
            item === null ||
            item === undefined ||
            typeof item === 'string' ||
            typeof item === 'number' ||
            typeof item === 'boolean'
        );
      } else if (typeof value === 'object' && value.constructor === Object) {
        // 只處理純物件，避免特殊物件類型
        try {
          JSON.stringify(value); // 測試是否可序列化
          cleanGame[key] = value;
        } catch (e) {
          console.warn(`[addUrlToGames] Skipping non-serializable property: ${key}`);
        }
      }
      // 跳過函式、Symbol、特殊物件等不可序列化的屬性
    }

    // 添加 iconUrl
    if (!cleanGame.iconUrl) {
      cleanGame.iconUrl = toIconUrl(cleanGame.iconPath);
    }

    return cleanGame;
  });
}

module.exports = { registerProtocols, toIconUrl, addUrlToGames };
