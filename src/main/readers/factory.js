// Centralized reader strategy selection for JARs
// Tries yauzl-reader first, then system-extract, then raw-fallback.
// Returns a normalized minimal structure used by higher layers.

const fs = require('fs-extra');
const path = require('path');
const { parseJarFileYauzl } = require('./yauzl-reader.js');
const { trySystemExtraction } = require('./system-extract.js');
const { tryRawFileAnalysis } = require('./raw-fallback.js');
const { extractEntryFromLocalHeaders } = require('./local-header.js');
const { parseManifest, resolveIconPath } = require('../parsers/manifest.js');
const { cacheIconBuffer } = require('../parsers/icon-cache.js');

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
    if (r && typeof r === 'object' && r.hasManifest === true) {
      return {
        gameName: r.gameName || path.basename(jarPath, '.jar'),
        vendor: r.vendor || 'Unknown',
        version: r.version || '1.0',
        iconPath: r.iconPath || null,
        hasManifest: true,
      };
    }
  } catch (e) {
    // swallow and continue fallback
  }

  // 2) System extract fallback
  try {
    const r = await trySystemExtraction(jarPath);
    if (r && typeof r === 'object') {
      const baseName = path.basename(jarPath, '.jar');
      const rawName = ((r['MIDlet-Name'] || '') + '').trim();
      const midlet1Name = (((r['MIDlet-1'] || '') + '').split(',')[0] || '').trim();
      const nameFromManifest =
        rawName && rawName.toLowerCase() !== baseName.toLowerCase() ? rawName : null;
      return {
        gameName: nameFromManifest || midlet1Name || baseName,
        vendor: r['MIDlet-Vendor'] || 'Unknown',
        version: r['MIDlet-Version'] || '1.0',
        iconPath: r.cachedIconPath || null,
        hasManifest: true,
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
        hasManifest: false,
      };
    }
  } catch (e) {
    // swallow and go to final basic
  }

  // 3.5) Local header scan & extract fallback: read MANIFEST and optional icon directly from LFH
  try {
    const mfBuf = await extractEntryFromLocalHeaders(jarPath, 'META-INF/MANIFEST.MF');
    if (mfBuf && mfBuf.length > 0) {
      const manifest = parseManifest(mfBuf.toString());
      let iconPath = null;
      const rawIconPath = resolveIconPath(manifest);
      if (rawIconPath) {
        let normalized = rawIconPath.replace(/^[\\\/]+/, '');
        const iconBuf = await extractEntryFromLocalHeaders(jarPath, normalized);
        if (iconBuf && iconBuf.length > 0) {
          const ext = path.extname(normalized).toLowerCase() || '.png';
          try {
            iconPath = await cacheIconBuffer(iconBuf, ext);
          } catch (_) {}
        }
      }
      const midlet1Name = (((manifest['MIDlet-1'] || '') + '').split(',')[0] || '').trim();
      return {
        gameName: manifest['MIDlet-Name'] || midlet1Name || path.basename(jarPath, '.jar'),
        vendor: manifest['MIDlet-Vendor'] || 'Unknown',
        version: manifest['MIDlet-Version'] || '1.0',
        iconPath: iconPath || null,
        hasManifest: true,
      };
    }
  } catch (_) {
    // ignore and continue to final basic
  }

  // Final basic info if all readers failed
  return {
    gameName: path.basename(jarPath, '.jar'),
    vendor: 'Unknown',
    version: '1.0',
    iconPath: null,
    hasManifest: false,
  };
}

module.exports = { parseJarWithReaders };
