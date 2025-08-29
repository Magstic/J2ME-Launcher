// SQLite-backed game IPC (non-invasive; separate channels)
const { getDB } = require('../db');

function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    manifest: row.manifest ? JSON.parse(row.manifest) : null
  };
}

function register({ ipcMain }) {
  const db = getDB();

  ipcMain.handle('sql:games-upsertMany', (e, items) => {
    const insert = db.prepare(`
      INSERT INTO games (filePath, gameName, vendor, version, md5, iconPath, mtimeMs, size, manifest)
      VALUES (@filePath, @gameName, @vendor, @version, @md5, @iconPath, @mtimeMs, @size, @manifest)
      ON CONFLICT(filePath) DO UPDATE SET
        gameName=CASE WHEN customName IS NULL THEN excluded.gameName ELSE gameName END,
        vendor=CASE WHEN customVendor IS NULL THEN excluded.vendor ELSE vendor END,
        version=excluded.version,
        md5=excluded.md5,
        iconPath=excluded.iconPath,
        mtimeMs=excluded.mtimeMs,
        size=excluded.size,
        manifest=excluded.manifest
    `);
    const tx = db.transaction((rows) => {
      for (const r of rows) {
        insert.run({
          filePath: r.filePath,
          gameName: r.gameName ?? null,
          vendor: r.vendor ?? null,
          version: r.version ?? null,
          md5: r.md5 ?? null,
          iconPath: r.iconPath ?? null,
          mtimeMs: r.mtimeMs ?? null,
          size: r.size ?? null,
          manifest: r.manifest ? JSON.stringify(r.manifest) : null
        });
      }
    });
    tx(items || []);
    return { ok: true, count: (items || []).length };
  });

  ipcMain.handle('sql:games-searchByTitle', (e, q, limit = 100) => {
    const stmt = db.prepare(`
      SELECT * FROM games WHERE gameName LIKE ? ORDER BY gameName LIMIT ?
    `);
    const rows = stmt.all(`%${q || ''}%`, limit);
    return rows.map(parseRow);
  });

  ipcMain.handle('sql:get-game', (e, filePath) => {
    const row = db.prepare('SELECT * FROM games WHERE filePath=?').get(filePath);
    return parseRow(row);
  });

  ipcMain.handle('sql:get-all-games', () => {
    const rows = db.prepare('SELECT * FROM games ORDER BY gameName').all();
    return rows.map(parseRow);
  });
}

module.exports = { register };
