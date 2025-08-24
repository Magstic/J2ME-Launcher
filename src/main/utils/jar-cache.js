const fs = require('fs');
const path = require('path');
const { app: electronApp } = require('electron');
const DataStore = require('../data-store.js');
const { calculateMD5 } = require('../parsers/md5.js');

let appRef = null;
let cacheDirResolved = null;

function initJarCache(app) {
  appRef = app || electronApp || null;
}

function getCacheDir() {
  if (cacheDirResolved) {
    // Directory may have been removed by startup cleanup; re-ensure it exists.
    try { fs.mkdirSync(cacheDirResolved, { recursive: true }); } catch (e) { console.warn('[cache] ensure dir failed:', e.message); }
    return cacheDirResolved;
  }
  const base = appRef && appRef.getPath ? appRef.getPath('userData') : path.join(process.cwd(), '.cache');
  cacheDirResolved = path.join(base, 'jar-cache');
  try { fs.mkdirSync(cacheDirResolved, { recursive: true }); } catch (e) { console.warn('[cache] create dir failed:', e.message); }
  console.log('[cache] dir =', cacheDirResolved);
  return cacheDirResolved;
}

async function ensureCachedJar(originalPath) {
  try {
    const dsGame = DataStore.getGame(originalPath);
    let md5 = dsGame && dsGame.md5;
    if (!md5) {
      try { md5 = await calculateMD5(originalPath); } catch (_) {}
    }
    if (!md5) {
      const stat = fs.statSync(originalPath);
      md5 = `${path.basename(originalPath).replace(/[^A-Za-z0-9_.-]/g, '_')}_${stat.size}`;
    }
    const dir = getCacheDir();
    const target = path.join(dir, `${md5}.jar`);
    let needCopy = true;
    try {
      const srcStat = fs.statSync(originalPath);
      const dstStat = fs.statSync(target);
      if (dstStat.isFile() && dstStat.size === srcStat.size) {
        needCopy = false;
      }
    } catch (_) {}
    if (needCopy) {
      try { fs.copyFileSync(originalPath, target); console.log('[cache] copied ->', target); } catch (e) { console.warn('[cache] copy failed:', e.message); throw e; }
    } else {
      console.log('[cache] reuse existing ->', target);
    }
    return target;
  } catch (e) {
    console.warn('[cache] ensureCachedJar fallback to original:', e && e.message);
    return originalPath;
  }
}

function cleanupCacheOnStartup() {
  try {
    const dir = getCacheDir();
    const items = fs.readdirSync(dir);
    for (const name of items) {
      if (name.toLowerCase().endsWith('.jar')) {
        const p = path.join(dir, name);
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }
    const rest = fs.readdirSync(dir);
    if (!rest || rest.length === 0) {
      try { fs.rmdirSync(dir); } catch (_) {}
    }
    console.log('[cache] startup cleanup done');
  } catch (_) {}
}

module.exports = {
  initJarCache,
  ensureCachedJar,
  cleanupCacheOnStartup,
};
