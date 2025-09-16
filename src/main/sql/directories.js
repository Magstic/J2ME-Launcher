// src/main/sql/directories.js
// Helpers for directories table

const { getDB } = require('../db');
const path = require('path');

function normalizePathInput(p) {
  if (!p || typeof p !== 'string') return p;
  const n = path.normalize(p);
  return process.platform === 'win32' ? n.replace(/\//g, '\\') : n;
}

function getDirectories() {
  const db = getDB();
  const rows = db.prepare(`SELECT path, lastScanTime, enabled, addedTime FROM directories ORDER BY path`).all();
  return rows.map(r => ({ path: r.path, lastScanTime: r.lastScanTime || null, enabled: !!r.enabled, addedTime: r.addedTime || null }));
}

function addDirectory(directoryPath) {
  const db = getDB();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO directories (path, lastScanTime, enabled, addedTime)
    VALUES (?, NULL, 1, ?)
    ON CONFLICT(path) DO NOTHING
  `).run(normalizePathInput(directoryPath), now);
}

function removeDirectory(directoryPath) {
  const db = getDB();
  db.prepare(`DELETE FROM directories WHERE path=?`).run(normalizePathInput(directoryPath));
}

function setDirectoryEnabled(directoryPath, enabled) {
  const db = getDB();
  db.prepare(`UPDATE directories SET enabled=? WHERE path=?`).run(enabled ? 1 : 0, normalizePathInput(directoryPath));
}

function updateDirectoryScanTime(directoryPath, isoTime) {
  const db = getDB();
  db.prepare(`UPDATE directories SET lastScanTime=? WHERE path=?`).run(isoTime, normalizePathInput(directoryPath));
}

module.exports = {
  getDirectories,
  addDirectory,
  removeDirectory,
  setDirectoryEnabled,
  updateDirectoryScanTime,
};
