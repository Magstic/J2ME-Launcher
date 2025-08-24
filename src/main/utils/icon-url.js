const { protocol } = require('electron');
const path = require('path');

function registerProtocols() {
  // 必须在 app ready 事件之前注册协议方案（由 main.js 调用）
  protocol.registerSchemesAsPrivileged([
    { scheme: 'safe-file', privileges: { secure: true, standard: true, supportFetchAPI: true } }
  ]);
}

function toIconUrl(iconPath) {
  // 若未提供圖標路徑，回退到預設圖標（由 main 協議處理映射到 src/image/ico.svg）
  if (!iconPath) return 'safe-file://default-ico.svg';
  const iconName = path.basename(iconPath);
  return `safe-file://${iconName}`;
}

function addUrlToGames(games) {
  return games.map(game => ({
    ...game,
    iconUrl: toIconUrl(game.iconPath)
  }));
}

module.exports = { registerProtocols, toIconUrl, addUrlToGames };
