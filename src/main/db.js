// SQLite initialization and schema
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
// Lazy-load native module to avoid crash before it's rebuilt for Electron
let Database;

let db;

function getDB() {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'data.db');
  if (!Database) {
    // Require here so callers can wrap getDB() in try/catch during startup
    // and avoid failing at module import time.
    Database = require('better-sqlite3');
  }
  db = new Database(dbPath);
  // Pragmas for performance and durability
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  // Ensure auto_vacuum is FULL so pages can be reclaimed progressively (requires VACUUM once when turning on)
  try {
    const av = db.pragma('auto_vacuum', { simple: true });
    if (av !== 2) { // 0=NONE, 1=INCREMENTAL, 2=FULL
      db.pragma('auto_vacuum = FULL');
      // Must run VACUUM once for the setting to take effect on existing DB
      try { db.exec('VACUUM'); } catch (_) {}
    }
  } catch (_) {}
  initSchema();
  // Normalize stored paths on Windows to ensure consistency between tables
  try {
    if (process.platform === 'win32') {
      db.exec(`
        UPDATE games SET filePath = REPLACE(filePath, '/', '\\') WHERE INSTR(filePath, '/') > 0;
        UPDATE games SET iconPath = REPLACE(iconPath, '/', '\\') WHERE iconPath IS NOT NULL AND INSTR(iconPath, '/') > 0;
        UPDATE folder_games SET filePath = REPLACE(filePath, '/', '\\') WHERE INSTR(filePath, '/') > 0;
      `);
    }
  } catch (_) {}
  
  // Initialize SQL cache
  try {
    const { getSqlCache } = require('./utils/sql-cache');
    const sqlCache = getSqlCache();
    sqlCache.init(db);
  } catch (_) {}
  
  return db;
}

function closeDB() {
  try {
    if (db) {
      try { db.close(); } catch (_) {}
    }
  } finally {
    db = null;
  }
}

// 壓縮資料庫：截斷 WAL 並執行 VACUUM 以回收磁碟空間
function compact() {
  try {
    const d = getDB();
    // 先嘗試截斷 WAL，避免殘留大型 -wal 檔
    try { d.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}
    // VACUUM 會重寫資料庫檔案並回收空間
    d.exec('VACUUM');
    return true;
  } catch (e) {
    try { console.warn('[DB] compact failed:', e.message || e); } catch (_) {}
    return false;
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      filePath TEXT PRIMARY KEY,
      gameName TEXT,
      vendor TEXT,
      version TEXT,
      md5 TEXT,
      iconPath TEXT,
      mtimeMs INTEGER,
      size INTEGER,
      manifest TEXT,
      customName TEXT,
      customVendor TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_games_name ON games(gameName);
    CREATE INDEX IF NOT EXISTS idx_games_mtime ON games(mtimeMs);

    CREATE TABLE IF NOT EXISTS emulator_configs (
      filePath TEXT NOT NULL,
      emulator TEXT NOT NULL,
      config TEXT NOT NULL,
      PRIMARY KEY (filePath, emulator),
      FOREIGN KEY (filePath) REFERENCES games(filePath) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS directories (
      path TEXT PRIMARY KEY,
      lastScanTime TEXT,
      enabled INTEGER,
      addedTime TEXT
    );

    -- Single-row settings table (id always 1)
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      emulators TEXT
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      icon TEXT,
      color TEXT,
      gameCount INTEGER,
      createdAt TEXT,
      updatedAt TEXT,
      sortOrder INTEGER,
      isVisible INTEGER
    );

    CREATE TABLE IF NOT EXISTS folder_games (
      folderId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      addedTime TEXT,
      customName TEXT,
      notes TEXT,
      PRIMARY KEY (folderId, filePath),
      FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE CASCADE,
      FOREIGN KEY (filePath) REFERENCES games(filePath) ON DELETE CASCADE
    );

    -- Helpful indexes for frequent lookups
    CREATE INDEX IF NOT EXISTS idx_folder_games_folder ON folder_games(folderId);
    CREATE INDEX IF NOT EXISTS idx_folder_games_file ON folder_games(filePath);
    -- 複合索引：批次操作與查詢優化
    CREATE INDEX IF NOT EXISTS idx_folder_games_composite ON folder_games(folderId, filePath);
    CREATE INDEX IF NOT EXISTS idx_games_filepath_name ON games(filePath, gameName);
    -- 關鍵性能優化：為 NOT EXISTS 查詢建立 COLLATE NOCASE 索引
    CREATE INDEX IF NOT EXISTS idx_folder_games_filepath_nocase ON folder_games(filePath COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS folder_metadata (
      folderId TEXT PRIMARY KEY,
      lastModified TEXT,
      gameCount INTEGER,
      totalSize INTEGER,
      FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE CASCADE
    );
  `);
}

function hasAnyData() {
  const row = getDB().prepare('SELECT COUNT(1) as c FROM games').get();
  return row.c > 0;
}

module.exports = { getDB, initSchema, hasAnyData, compact, closeDB };
