// src/main/sql/settings.js
// Helpers for single-row settings table (id=1). We store emulators config as JSON string.

const { getDB } = require('../db');

function getSettingsRow() {
  const db = getDB();
  const row = db.prepare(`SELECT id, emulators FROM settings WHERE id=1`).get();
  if (!row) return null;
  let emulators = {};
  try { emulators = row.emulators ? JSON.parse(row.emulators) : {}; } catch { emulators = {}; }
  return { id: 1, emulators };
}

function setEmulatorsConfig(emulatorsObj) {
  const db = getDB();
  const str = JSON.stringify(emulatorsObj || {});
  db.prepare(`
    INSERT INTO settings (id, emulators)
    VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET emulators=excluded.emulators
  `).run(str);
  return emulatorsObj || {};
}

module.exports = { getSettingsRow, setEmulatorsConfig };
