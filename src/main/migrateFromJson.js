// One-time migration from JSON files to SQLite (lossless)
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getDB, hasAnyData } = require('./db');

const KNOWN_GAME_FIELDS = new Set([
  'filePath','gameName','vendor','version','md5','iconPath','mtimeMs','size','emulatorConfig'
]);

function readJsonSafe(p, fallback = null) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[Migration] Failed reading ${p}:`, e.message);
    return fallback;
  }
}

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
}

function migrateGamesAndSettings(db, userDataPath) {
  const gamedbPath = path.join(userDataPath, 'gamedb.json');
  const data = readJsonSafe(gamedbPath, null);
  if (!data) {
    console.log('[Migration] gamedb.json not found, skipping games/settings/directories');
    return { games: 0, configs: 0, directories: 0, settings: 0 };
  }

  const insertGame = db.prepare(`
    INSERT OR REPLACE INTO games
      (filePath, gameName, vendor, version, md5, iconPath, mtimeMs, size, manifest)
    VALUES
      (@filePath, @gameName, @vendor, @version, @md5, @iconPath, @mtimeMs, @size, @manifest)
  `);
  const insertConfig = db.prepare(`
    INSERT OR REPLACE INTO emulator_configs (filePath, emulator, config)
    VALUES (@filePath, @emulator, @config)
  `);
  const insertDir = db.prepare(`
    INSERT OR REPLACE INTO directories (path, lastScanTime, enabled, addedTime)
    VALUES (@path, @lastScanTime, @enabled, @addedTime)
  `);
  const upsertSettings = db.prepare(`
    INSERT INTO settings (id, emulators) VALUES (1, @emulators)
    ON CONFLICT(id) DO UPDATE SET emulators = excluded.emulators
  `);

  let gameCount = 0, cfgCount = 0, dirCount = 0, setCount = 0;

  db.transaction(() => {
    // games
    const gamesObj = data.games || {};
    for (const [filePath, game] of Object.entries(gamesObj)) {
      const row = {
        filePath: filePath,
        gameName: game.gameName ?? null,
        vendor: game.vendor ?? null,
        version: game.version ?? null,
        md5: game.md5 ?? null,
        iconPath: game.iconPath ?? null,
        mtimeMs: game.mtimeMs ?? null,
        size: game.size ?? null,
        manifest: null
      };
      // collect extra manifest fields
      const extra = {};
      for (const [k, v] of Object.entries(game)) {
        if (!KNOWN_GAME_FIELDS.has(k)) extra[k] = v;
      }
      row.manifest = Object.keys(extra).length ? JSON.stringify(extra) : null;
      insertGame.run(row);
      gameCount++;

      // per-game emulatorConfig (current store keeps a single config per game)
      if (game.emulatorConfig) {
        insertConfig.run({
          filePath,
          emulator: 'freej2mePlus',
          config: JSON.stringify(game.emulatorConfig)
        });
        cfgCount++;
      }
    }

    // directories
    const dirs = data.directories || [];
    for (const d of dirs) {
      insertDir.run({
        path: d.path ?? null,
        lastScanTime: d.lastScanTime ?? null,
        enabled: typeof d.enabled === 'boolean' ? (d.enabled ? 1 : 0) : null,
        addedTime: d.addedTime ?? null
      });
      dirCount++;
    }

    // settings.emulators as JSON
    const emulators = (data.settings && data.settings.emulators) ? data.settings.emulators : {};
    upsertSettings.run({ emulators: JSON.stringify(emulators) });
    setCount = 1;
  })();

  return { games: gameCount, configs: cfgCount, directories: dirCount, settings: setCount };
}

function migrateFolders(db, userDataPath) {
  const foldersDir = path.join(userDataPath, 'folders');
  const indexPath = path.join(foldersDir, 'index.json');
  const index = readJsonSafe(indexPath, null);
  if (!index) {
    console.log('[Migration] folders/index.json not found, skipping folders');
    return { folders: 0, folderGames: 0, folderMeta: 0 };
  }

  const insertFolder = db.prepare(`
    INSERT OR REPLACE INTO folders (
      id, name, description, icon, color, gameCount, createdAt, updatedAt, sortOrder, isVisible
    ) VALUES (
      @id, @name, @description, @icon, @color, @gameCount, @createdAt, @updatedAt, @sortOrder, @isVisible
    )
  `);
  const insertFolderGame = db.prepare(`
    INSERT OR REPLACE INTO folder_games (folderId, filePath, addedTime, customName, notes)
    VALUES (@folderId, @filePath, @addedTime, @customName, @notes)
  `);
  const insertFolderMeta = db.prepare(`
    INSERT OR REPLACE INTO folder_metadata (folderId, lastModified, gameCount, totalSize)
    VALUES (@folderId, @lastModified, @gameCount, @totalSize)
  `);

  let fCount = 0, fgCount = 0, fmCount = 0;

  db.transaction(() => {
    const folders = index.folders || [];
    for (const f of folders) {
      insertFolder.run({
        id: f.id,
        name: f.name ?? null,
        description: f.description ?? null,
        icon: f.icon ?? null,
        color: f.color ?? null,
        gameCount: f.gameCount ?? null,
        createdAt: f.createdAt ?? null,
        updatedAt: f.updatedAt ?? null,
        sortOrder: f.sortOrder ?? null,
        isVisible: typeof f.isVisible === 'boolean' ? (f.isVisible ? 1 : 0) : null
      });
      fCount++;

      const contentPath = path.join(foldersDir, `${f.id}.json`);
      const content = readJsonSafe(contentPath, null);
      if (content && Array.isArray(content.games)) {
        for (const g of content.games) {
          insertFolderGame.run({
            folderId: f.id,
            filePath: g.filePath ?? g.gameId ?? null,
            addedTime: g.addedTime ?? null,
            customName: g.customName ?? null,
            notes: g.notes ?? ''
          });
          fgCount++;
        }
      }
      if (content && content.metadata) {
        insertFolderMeta.run({
          folderId: f.id,
          lastModified: content.metadata.lastModified ?? null,
          gameCount: content.metadata.gameCount ?? null,
          totalSize: content.metadata.totalSize ?? null
        });
        fmCount++;
      }
    }
  })();

  return { folders: fCount, folderGames: fgCount, folderMeta: fmCount };
}

async function migrateIfNeeded() {
  const db = getDB();
  if (hasAnyData()) {
    console.log('[Migration] SQLite already has data; skipping migration.');
    return { skipped: true };
  }
  const userDataPath = app.getPath('userData');

  // Only run if JSON exists
  const hasGameDb = fs.existsSync(path.join(userDataPath, 'gamedb.json'));
  const hasFolders = fs.existsSync(path.join(userDataPath, 'folders', 'index.json'));
  if (!hasGameDb && !hasFolders) {
    console.log('[Migration] No legacy JSON found; nothing to migrate.');
    return { skipped: true };
  }

  console.log('[Migration] Starting legacy JSON -> SQLite migration...');
  const a = migrateGamesAndSettings(db, userDataPath);
  const b = migrateFolders(db, userDataPath);
  console.log('[Migration] Done.', { a, b });
  return { skipped: false, details: { ...a, ...b } };
}

module.exports = { migrateIfNeeded };
