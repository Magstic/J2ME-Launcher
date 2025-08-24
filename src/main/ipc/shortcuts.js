const path = require('path');

const { createDesktopShortcut, ensureIcoForGame } = require('../shortcuts');
const { gameHashFromPath } = require('../utils/hash');

function register({ ipcMain, DataStore, app }) {
  // Create a desktop shortcut for a game
  ipcMain.handle('create-shortcut', async (_e, payload) => {
    try {
      const { filePath, title, iconCacheName } = payload || {};
      if (!filePath) throw new Error('filePath is required');

      // Try to resolve PNG from icon cache if provided
      let iconPngPath = null;
      try {
        if (iconCacheName) {
          const cacheDir = DataStore.getIconCachePath();
          iconPngPath = path.join(cacheDir, iconCacheName);
        }
      } catch (_) {}

      const result = await createDesktopShortcut({ filePath, title, iconPngPath });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
}

module.exports = { register };
