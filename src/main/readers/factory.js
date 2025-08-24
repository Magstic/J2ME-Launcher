// Centralized reader strategy selection for JARs
// Tries yauzl-reader first, then system-extract, then raw-fallback.
// Returns a normalized minimal structure used by higher layers.

const fs = require('fs-extra');
const path = require('path');
const { parseJarFileYauzl } = require('./yauzl-reader.js');
const { trySystemExtraction } = require('./system-extract.js');
const { tryRawFileAnalysis } = require('./raw-fallback.js');

/**
 * @typedef {Object} JarBasicInfo
 * @property {string} gameName
 * @property {string} vendor
 * @property {string} version
 * @property {string|null} iconPath
 */

/**
 * Parse a JAR with best available reader strategy.
 * This function normalizes outputs from heterogeneous readers into JarBasicInfo.
 * It does not compute md5 or file stats, leaving that to callers.
 * @param {string} jarPath
 * @returns {Promise<JarBasicInfo>}
 */
async function parseJarWithReaders(jarPath) {
  // 1) Preferred: yauzl reader
  try {
    const r = await parseJarFileYauzl(jarPath);
    if (r && typeof r === 'object') {
      return {
        gameName: r.gameName || path.basename(jarPath, '.jar'),
        vendor: r.vendor || 'Unknown',
        version: r.version || '1.0',
        iconPath: r.iconPath || null,
      };
    }
  } catch (e) {
    // swallow and continue fallback
  }

  // 2) System extract fallback
  try {
    const r = await trySystemExtraction(jarPath);
    if (r && typeof r === 'object') {
      return {
        gameName: r['MIDlet-Name'] || path.basename(jarPath, '.jar'),
        vendor: r['MIDlet-Vendor'] || 'Unknown',
        version: r['MIDlet-Version'] || '1.0',
        iconPath: r.cachedIconPath || null,
      };
    }
  } catch (e) {
    // swallow and continue fallback
  }

  // 3) Raw fallback (may only provide minimal info)
  try {
    const r = await tryRawFileAnalysis(jarPath);
    if (r && typeof r === 'object') {
      return {
        gameName: r['MIDlet-Name'] || path.basename(jarPath, '.jar'),
        vendor: r['MIDlet-Vendor'] || 'Unknown',
        version: r['MIDlet-Version'] || '1.0',
        iconPath: r.iconData ? r.iconData.cachedIconPath || null : null,
      };
    }
  } catch (e) {
    // swallow and go to final basic
  }

  // Final basic info if all readers failed
  return {
    gameName: path.basename(jarPath, '.jar'),
    vendor: 'Unknown',
    version: '1.0',
    iconPath: null,
  };
}

module.exports = { parseJarWithReaders };
