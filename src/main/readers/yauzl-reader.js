// 使用 yauzl 解析 JAR：讀取 MANIFEST 與圖標，並寫入圖標快取（繁中註釋）
const fs = require('fs-extra');
const path = require('path');
const yauzl = require('yauzl');
const DataStore = require('../data-store.js');
const { calculateMD5 } = require('../parsers/md5.js');
const { readEntryContent } = require('../parsers/zip-entry.js');
const { parseManifest, resolveIconPath } = require('../parsers/manifest.js');
const { cacheIconBuffer } = require('../parsers/icon-cache.js');
const { getLogger } = require('../../utils/logger.cjs');
const log = getLogger('reader:yauzl');

async function parseJarFileYauzl(jarPath) {
  const stats = await fs.stat(jarPath);
  const md5 = await calculateMD5(jarPath);

  let manifest = {};
  let iconBuffer = null;
  let iconPathInJar = null;
  let foundManifest = false;

  // 第一趟：讀取 MANIFEST 並決定圖標路徑
  await new Promise((resolve, reject) => {
    yauzl.open(
      jarPath,
      { lazyEntries: true, strictFileNames: false, validateEntrySizes: false },
      (err, zipfile) => {
        if (err) return reject(err);
        zipfile.on('error', reject);
        zipfile.on('end', resolve);
        zipfile.on('entry', (entry) => {
          if (entry.fileName.toUpperCase() === 'META-INF/MANIFEST.MF') {
            readEntryContent(zipfile, entry, false)
              .then((content) => {
                manifest = parseManifest(content.toString());
                foundManifest = true;
                // 集中處理圖標路徑解析
                iconPathInJar = resolveIconPath(manifest);
                // 保留原實作：若以 '/' 開頭，移除單一前導斜線
                if (iconPathInJar && iconPathInJar.startsWith('/')) {
                  iconPathInJar = iconPathInJar.substring(1);
                }
                zipfile.readEntry();
              })
              .catch((e) => {
                log.error(e);
                zipfile.readEntry();
              });
          } else {
            zipfile.readEntry();
          }
        });
        zipfile.readEntry();
      }
    );
  });

  // 第二趟：依據 iconPathInJar 讀取圖標 buffer
  if (iconPathInJar) {
    await new Promise((resolve, reject) => {
      yauzl.open(
        jarPath,
        { lazyEntries: true, strictFileNames: false, validateEntrySizes: false },
        (err, zipfile) => {
          if (err) return reject(err);
          zipfile.on('error', reject);
          zipfile.on('end', resolve);
          zipfile.on('entry', (entry) => {
            const normalizedEntryPath = entry.fileName.replace(/\\/g, '/');
            const normalizedManifestPath = iconPathInJar.replace(/\\/g, '/');
            const manifestPathCleaned = normalizedManifestPath.replace(/^[\/\\]+/, '');

            if (
              !iconBuffer &&
              (normalizedEntryPath.toLowerCase() === normalizedManifestPath.toLowerCase() ||
                normalizedEntryPath.toLowerCase() === manifestPathCleaned.toLowerCase())
            ) {
              readEntryContent(zipfile, entry, true)
                .then((buffer) => {
                  iconBuffer = buffer;
                  zipfile.close();
                  resolve();
                })
                .catch((err) => {
                  log.error(err);
                  zipfile.readEntry();
                });
            } else {
              zipfile.readEntry();
            }
          });
          zipfile.readEntry();
        }
      );
    });
  }

  let cachedIconPath = null;
  if (iconBuffer) {
    const ext = path.extname(iconPathInJar).toLowerCase() || '.png';
    cachedIconPath = await cacheIconBuffer(iconBuffer, ext);
    log.debug(`[Icon Cache] Cached icon for ${manifest['MIDlet-Name']} at ${cachedIconPath}`);
  }

  const midlet1Name = ((manifest['MIDlet-1'] || '').split(',')[0] || '').trim();

  return {
    filePath: jarPath,
    gameName: manifest['MIDlet-Name'] || midlet1Name || path.basename(jarPath, '.jar'),
    vendor: manifest['MIDlet-Vendor'] || 'Unknown',
    version: manifest['MIDlet-Version'] || '1.0',
    md5: md5,
    iconPath: cachedIconPath,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    hasManifest: foundManifest === true,
  };
}

module.exports = { parseJarFileYauzl };
