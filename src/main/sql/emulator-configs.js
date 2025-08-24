// src/main/sql/emulator-configs.js
// Read/write helpers for per-game emulator configs stored in SQLite.
// We store a single row per game under emulator='default' to match legacy DataStore shape.

const { getDB } = require('../db');

const EMULATOR_KEY = 'default';

function getGameEmulatorConfig(filePath) {
  const db = getDB();
  const row = db.prepare(`SELECT config FROM emulator_configs WHERE filePath=? AND emulator=?`).get(filePath, EMULATOR_KEY);
  if (!row) return null;
  try { return JSON.parse(row.config); } catch { return null; }
}

function setGameEmulatorConfig(filePath, configObj) {
  const db = getDB();
  const config = JSON.stringify(configObj || null);
  db.prepare(`
    INSERT INTO emulator_configs (filePath, emulator, config)
    VALUES (?, ?, ?)
    ON CONFLICT(filePath, emulator) DO UPDATE SET config=excluded.config
  `).run(filePath, EMULATOR_KEY, config);
  return configObj || null;
}

module.exports = {
  getGameEmulatorConfig,
  setGameEmulatorConfig,
};
