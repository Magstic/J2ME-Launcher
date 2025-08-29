// src/main/sql/custom-names.js
// SQL functions for managing custom game names and vendors

const { getDB } = require('../db');

/**
 * 更新遊戲的自定義名稱
 * @param {string} filePath - 遊戲文件路徑
 * @param {string} customName - 自定義名稱
 */
function updateCustomName(filePath, customName) {
  const db = getDB();
  const stmt = db.prepare(`
    UPDATE games 
    SET customName = ? 
    WHERE filePath = ?
  `);
  return stmt.run(customName || null, filePath);
}

/**
 * 更新遊戲的自定義開發商
 * @param {string} filePath - 遊戲文件路徑
 * @param {string} customVendor - 自定義開發商
 */
function updateCustomVendor(filePath, customVendor) {
  const db = getDB();
  const stmt = db.prepare(`
    UPDATE games 
    SET customVendor = ? 
    WHERE filePath = ?
  `);
  return stmt.run(customVendor || null, filePath);
}

/**
 * 批量更新自定義名稱和開發商
 * @param {string} filePath - 遊戲文件路徑
 * @param {Object} customData - { customName?, customVendor? }
 */
function updateCustomData(filePath, customData) {
  const db = getDB();
  const { customName, customVendor } = customData;
  const stmt = db.prepare(`
    UPDATE games 
    SET customName = ?, customVendor = ?
    WHERE filePath = ?
  `);
  return stmt.run(customName || null, customVendor || null, filePath);
}

/**
 * 獲取遊戲的顯示名稱（優先使用自定義名稱）
 * @param {Object} game - 遊戲對象
 * @returns {string} 顯示名稱
 */
function getDisplayName(game) {
  return game.customName || game.gameName || 'Unknown Game';
}

/**
 * 獲取遊戲的顯示開發商（優先使用自定義開發商）
 * @param {Object} game - 遊戲對象
 * @returns {string} 顯示開發商
 */
function getDisplayVendor(game) {
  return game.customVendor || game.vendor || 'Unknown Vendor';
}

/**
 * 重置遊戲的自定義名稱（恢復原始名稱）
 * @param {string} filePath - 遊戲文件路徑
 */
function resetCustomNames(filePath) {
  const db = getDB();
  const stmt = db.prepare(`
    UPDATE games 
    SET customName = NULL, customVendor = NULL
    WHERE filePath = ?
  `);
  return stmt.run(filePath);
}

module.exports = {
  updateCustomName,
  updateCustomVendor,
  updateCustomData,
  getDisplayName,
  getDisplayVendor,
  resetCustomNames
};
