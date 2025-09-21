// src/main/ipc/desktop.js
// IPC for desktop view data

const { getDesktopGames: sqlGetDesktopGames } = require('../sql/folders-read');
const { getDesktopClusters: sqlGetDesktopClusters } = require('../sql/clusters-read');

function register({ ipcMain, DataStore, toIconUrl }) {
  // 獲取桌面項目（遊戲 + 簇；資料夾不在桌面顯示）
  ipcMain.handle('get-desktop-items', () => {
    try {
      const games = sqlGetDesktopGames();
      const clusters = sqlGetDesktopClusters();
      const gameItems = games.map((g) => ({ type: 'game', ...g, iconUrl: toIconUrl(g.iconPath) }));
      const clusterItems = clusters.map((c) => ({
        type: 'cluster',
        ...c,
        iconUrl: toIconUrl(c.effectiveIconPath),
      }));
      const items = [...clusterItems, ...gameItems];
      try {
        console.log(
          '[desktop:get-desktop-items] clusters=',
          clusterItems.length,
          'games=',
          gameItems.length
        );
      } catch {}
      return items;
    } catch (error) {
      console.error('獲取桌面項目失敗:', error);
      return [];
    }
  });
}

module.exports = { register };
