// src/main/sql/sync.js
// Helpers to synchronize JSON DataStore content into SQLite.

const { getDB } = require('../db');
const path = require('path');

function normalizePath(p) {
  if (!p || typeof p !== 'string') return p;
  const n = path.normalize(p);
  return process.platform === 'win32' ? n.replace(/\//g, '\\') : n;
}

const FIXED_GAME_KEYS = new Set([
  'filePath', 'gameName', 'vendor', 'version', 'md5', 'iconPath', 'mtimeMs', 'size',
  'emulatorConfig' // not stored in games; per-emulator configs go to emulator_configs
]);

function extractManifest(game) {
  const manifest = {};
  for (const k of Object.keys(game || {})) {
    if (!FIXED_GAME_KEYS.has(k)) {
      manifest[k] = game[k];
    }
  }
  return Object.keys(manifest).length ? manifest : null;
}

function upsertGames(gamesArray) {
  const db = getDB();
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
    for (const g of rows) {
      const manifest = extractManifest(g);
      insert.run({
        filePath: normalizePath(g.filePath),
        gameName: g.gameName ?? null,
        vendor: g.vendor ?? null,
        version: g.version ?? null,
        md5: g.md5 ?? null,
        iconPath: normalizePath(g.iconPath) ?? null,
        mtimeMs: g.mtimeMs ?? null,
        size: g.size ?? null,
        manifest: manifest ? JSON.stringify(manifest) : null
      });
    }
  });
  tx(gamesArray || []);
  return { ok: true, count: (gamesArray || []).length };
}

module.exports = { upsertGames };
