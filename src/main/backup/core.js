// src/main/backup/core.js
// Backup orchestrator: builds file list, computes hashes, diffs, and delegates to provider

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const crypto = require('crypto');
const fse = require('fs-extra');
const { parseTSV, stringifyTSV, rowsToMap, toPosix } = require('../../shared/backup/indexTSV');
const { BACKUP_SPEC } = require('../../shared/backup/spec');
const { loadConfig } = require('../config/yaml-config');

function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function md5String(text) {
  const hash = crypto.createHash('md5');
  hash.update(text || '');
  return hash.digest('hex');
}

// Deterministic stringify with sorted keys to ignore YAML key order/formatting
function stableStringify(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map((v) => stableStringify(v)).join(',') + ']';
  const keys = Object.keys(obj).sort();
  const parts = [];
  for (const k of keys) parts.push(JSON.stringify(k) + ':' + stableStringify(obj[k]));
  return '{' + parts.join(',') + '}';
}

function statOrNull(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function resolveItems(app, groups) {
  const userRoot = app.getPath('userData'); // e.g. %APPDATA%/OurApp
  const roamingRoot = path.dirname(userRoot); // e.g. %APPDATA%
  const groupSet = new Set(groups || []);
  const selectedGroups = BACKUP_SPEC.groups.filter((g) => groupSet.has(g.key));
  const items = [];
  for (const g of selectedGroups) {
    for (const rel of g.items || []) {
      // Probe both under userData and Roaming; pick the most recently modified if both exist
      const candUser = path.join(userRoot, rel);
      const candRoam = path.join(roamingRoot, rel);
      const stUser = statOrNull(candUser);
      const stRoam = statOrNull(candRoam);
      let chosenAbs = null;
      let chosenSt = null;
      if (stUser && stUser.isFile() && stRoam && stRoam.isFile()) {
        // Both exist: pick newer mtime
        const newer =
          (stUser.mtimeMs || 0) >= (stRoam.mtimeMs || 0)
            ? { abs: candUser, st: stUser, where: 'userData' }
            : { abs: candRoam, st: stRoam, where: 'roaming' };
        chosenAbs = newer.abs;
        chosenSt = newer.st;
        try {
          console.log('[backup:core] duplicate item exists in both locations; picking newer', {
            rel,
            picked: newer.where,
          });
        } catch (_) {}
      } else if (stUser && stUser.isFile()) {
        chosenAbs = candUser;
        chosenSt = stUser;
      } else if (stRoam && stRoam.isFile()) {
        chosenAbs = candRoam;
        chosenSt = stRoam;
      }
      if (!chosenAbs) {
        try {
          console.log('[backup:core] missing item', { rel, tried: [candUser, candRoam] });
        } catch (_) {}
        continue; // skip missing/non-regular
      }
      try {
        console.log('[backup:core] add item', { rel, abs: chosenAbs });
      } catch (_) {}
      items.push({
        rel: toPosix(rel),
        abs: chosenAbs,
        size: chosenSt.size,
        mtime: Math.floor(chosenSt.mtimeMs || 0),
      });
    }
  }
  // Dynamically resolve emulator-dependent paths when requested
  // groups: 'rms' and 'emuConfig' originate outside userData (jar/exe directories)
  const needRms = groupSet.has('rms');
  const needEmuCfg = groupSet.has('emuConfig');
  if (needRms || needEmuCfg) {
    try {
      const conf = loadConfig();
      const emus = conf && conf.emulators ? conf.emulators : {};
      const dyn = [];
      // Helper to push all files under baseDir with rel prefix
      const walk = (baseDir, relPrefix) => {
        if (!baseDir) return;
        try {
          const stBase = statOrNull(baseDir);
          if (!stBase || !stBase.isDirectory()) return;
        } catch (_) {
          return;
        }
        const stack = [''];
        while (stack.length) {
          const sub = stack.pop();
          const dir = path.join(baseDir, sub);
          let ents = [];
          try {
            ents = fs.readdirSync(dir, { withFileTypes: true });
          } catch (_) {
            continue;
          }
          for (const ent of ents) {
            const relChild = sub ? path.join(sub, ent.name) : ent.name;
            const absChild = path.join(baseDir, relChild);
            if (ent.isDirectory()) {
              stack.push(relChild);
            } else if (ent.isFile()) {
              const st = statOrNull(absChild);
              if (!st) continue;
              const rel = toPosix(path.posix.join(relPrefix, toPosix(relChild)));
              dyn.push({ rel, abs: absChild, size: st.size, mtime: Math.floor(st.mtimeMs || 0) });
            }
          }
        }
      };
      // FreeJ2ME-Plus (AWT)
      const fj = emus.freej2mePlus || {};
      const fjBase = fj.jarPath ? path.dirname(fj.jarPath) : '';
      if (fjBase) {
        if (needRms) walk(path.join(fjBase, 'rms'), 'external/freej2mePlus/rms');
        if (needEmuCfg) walk(path.join(fjBase, 'config'), 'external/freej2mePlus/config');
      }
      // KEmulator nnmod
      const ke = emus.ke || {};
      const keBase = ke.jarPath ? path.dirname(ke.jarPath) : '';
      if (keBase) {
        if (needRms) walk(path.join(keBase, 'rms'), 'external/kemulator/rms');
        // KEmulator has no config dir
      }
      // Libretro (FreeJ2ME-Plus)
      const lr = emus.libretro || {};
      const raBase = lr.retroarchPath ? path.dirname(lr.retroarchPath) : '';
      if (raBase) {
        if (needRms)
          walk(
            path.join(raBase, 'saves', 'FreeJ2ME-Plus', 'freej2me', 'rms'),
            'external/libretro/freej2me/rms'
          );
        if (needEmuCfg)
          walk(
            path.join(raBase, 'saves', 'FreeJ2ME-Plus', 'freej2me', 'config'),
            'external/libretro/freej2me/config'
          );
      }
      for (const it of dyn) {
        try {
          console.log('[backup:core] add dynamic', { rel: it.rel, abs: it.abs });
        } catch (_) {}
        items.push(it);
      }
    } catch (e) {
      try {
        console.log('[backup:core] dynamic resolve error', { error: e && e.message });
      } catch (_) {}
    }
  }
  return items;
}

async function buildLocalIndex(items, cacheOld = new Map()) {
  const rows = [];
  for (const it of items) {
    const old = cacheOld.get(it.rel);
    let md5 = null;
    // Special semantic hash for config.yml: parse YAML -> stable JSON -> MD5, ignoring formatting
    if (it.rel === 'j2me-launcher/config.yml') {
      try {
        const text = fs.readFileSync(it.abs, 'utf8');
        const obj = yaml.load(text) || {};
        const canonical = stableStringify(obj);
        md5 = md5String(canonical);
      } catch (_) {
        // Fallback to file hash if parsing fails
        md5 = await md5File(it.abs);
      }
    } else if (old && old.size === it.size && old.mtime === it.mtime && old.md5) {
      md5 = old.md5; // reuse
    } else {
      md5 = await md5File(it.abs);
    }
    rows.push({ path: it.rel, md5, size: it.size, mtime: it.mtime });
  }
  return rows;
}

function diff(fullMode, localRows, remoteRows) {
  const local = rowsToMap(localRows);
  const remote = rowsToMap(remoteRows || []);
  const upload = [];
  const del = [];
  // upload new or changed
  for (const [rel, r] of local.entries()) {
    const rr = remote.get(rel);
    if (fullMode) {
      upload.push(rel);
    } else if (!rr || rr.md5 !== r.md5) {
      upload.push(rel);
    }
  }
  // delete extra remote in full mode
  if (fullMode) {
    for (const rel of remote.keys()) {
      if (!local.has(rel)) del.push(rel);
    }
  }
  return { upload, del };
}

async function runBackup({
  app,
  mode,
  providerName,
  providerParams,
  groups,
  ipcSender,
  onProgress,
}) {
  // Optional place for future DB compaction; currently a no-op to avoid coupling

  // Load provider (S3 only for now)
  let provider;
  if (providerName === 's3') {
    try {
      console.log('[backup:core] init provider', { providerName, groups, mode });
    } catch (_) {}
    provider = require('./providers/s3').createS3Provider(providerParams);
  } else if (providerName === 'dropbox') {
    try {
      console.log('[backup:core] init provider', { providerName, groups, mode });
    } catch (_) {}
    provider = require('./providers/dropbox').createDropboxProvider(providerParams);
  } else if (providerName === 'webdav') {
    try {
      console.log('[backup:core] init provider', { providerName, groups, mode });
    } catch (_) {}
    provider = require('./providers/webdav').createWebdavProvider(providerParams);
  } else {
    throw new Error(`Unsupported provider: ${providerName}`);
  }

  const fullMode = mode === 'full';
  let items = resolveItems(app, groups);
  try {
    console.log('[backup:core] resolved items', { count: items.length });
  } catch (_) {}

  // If database group selected, create a consistent snapshot data.backup.db and replace DB file list
  try {
    if (Array.isArray(groups) && groups.includes('database')) {
      const roamingRoot = path.dirname(app.getPath('userData'));
      const backupRel = 'j2me-launcher/data.backup.db';
      const backupAbs = path.join(roamingRoot, 'j2me-launcher', 'data.backup.db');
      fse.ensureDirSync(path.dirname(backupAbs));
      try {
        console.log('[backup:core] sqlite backup start', { to: backupAbs });
      } catch (_) {}
      const { getDB } = require('../db');
      const db = getDB();
      // Perform SQLite online backup to a single consistent file
      await db.backup(backupAbs);
      const st = statOrNull(backupAbs);
      if (st && st.isFile()) {
        // Filter out original trio and only keep the snapshot
        items = items.filter((it) => !/j2me-launcher\/data\.db(\-shm|\-wal)?$/.test(it.rel));
        items.push({
          rel: backupRel,
          abs: backupAbs,
          size: st.size,
          mtime: Math.floor(st.mtimeMs || 0),
        });
        try {
          console.log('[backup:core] sqlite backup done', { size: st.size });
        } catch (_) {}
      } else {
        try {
          console.log('[backup:core] sqlite backup missing after backup');
        } catch (_) {}
      }
    }
  } catch (e) {
    try {
      console.log('[backup:core] sqlite backup error', { error: e && e.message });
    } catch (_) {}
  }

  // Map rel -> absolute path for upload phase
  const absByRel = new Map();
  for (const it of items) absByRel.set(it.rel, it.abs);

  // Remote index
  const remoteIndexText = await provider.readText('index.tsv');
  const remoteRows = remoteIndexText ? parseTSV(remoteIndexText) : [];
  const remoteMap = rowsToMap(remoteRows);
  try {
    console.log('[backup:core] remote index', { count: remoteRows.length });
  } catch (_) {}

  // Build local index. Do NOT reuse remote index as cache; compute from actual local files.
  // (Optional: implement a separate local cache file in the future.)
  const localRows = await buildLocalIndex(items, new Map());
  try {
    console.log('[backup:core] local index built', { count: localRows.length });
  } catch (_) {}

  const { upload, del } = diff(fullMode, localRows, remoteRows);
  try {
    console.log('[backup:core] plan', { upload: upload.length, delete: del.length, mode });
  } catch (_) {}

  const total = upload.length;
  let done = 0;
  const send = (payload) => {
    if (onProgress) onProgress(payload);
    if (ipcSender) {
      try {
        ipcSender.send('backup:progress', payload);
      } catch (_) {}
    }
  };

  // deletions (full only)
  for (const rel of del) {
    try {
      await provider.deleteFile(rel);
      send({ type: 'delete', rel });
    } catch (e) {
      try {
        console.log('[backup:core] delete error', { rel, error: e && e.message });
      } catch (_) {}
      send({ type: 'error', rel, message: e.message || String(e) });
    }
  }

  // uploads
  for (const rel of upload) {
    const row = localRows.find((r) => r.path === rel);
    if (!row) continue;
    try {
      const absPath = absByRel.get(rel) || path.join(app.getPath('userData'), rel);
      await provider.uploadFile(rel, absPath, row.size, (p) => {
        send({ type: 'upload-progress', rel, progress: p });
      });
      done++;
      send({ type: 'upload-done', rel, done, total });
    } catch (e) {
      try {
        console.log('[backup:core] upload error', { rel, error: e && e.message });
      } catch (_) {}
      send({ type: 'error', rel, message: e.message || String(e) });
    }
  }

  // write new index
  try {
    const text = stringifyTSV(localRows, true);
    await provider.writeText('index.tsv', text);
    // write meta with backupId and summary
    const backupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const meta = {
      backupId,
      createdAt: Date.now(),
      mode,
      groups: Array.isArray(groups) ? groups : [],
      counts: { files: localRows.length, uploaded: upload.length, deleted: del.length },
    };
    try {
      await provider.writeText('index.meta.json', JSON.stringify(meta, null, 2));
    } catch (_) {}
    try {
      console.log('[backup:core] wrote index.tsv & index.meta.json');
    } catch (_) {}
  } catch (e) {
    try {
      console.log('[backup:core] index write error', { error: e && e.message });
    } catch (_) {}
    send({ type: 'error', rel: 'index.tsv', message: e.message || String(e) });
  }

  return { ok: true, uploaded: upload.length, deleted: del.length, totalLocal: localRows.length };
}

async function planRestore({ app, providerName, providerParams, groups }) {
  // Load provider
  let provider;
  if (providerName === 's3') {
    try {
      console.log('[restore:plan] init provider', { providerName, groups });
    } catch (_) {}
    provider = require('./providers/s3').createS3Provider(providerParams);
  } else if (providerName === 'dropbox') {
    try {
      console.log('[restore:plan] init provider', { providerName, groups });
    } catch (_) {}
    provider = require('./providers/dropbox').createDropboxProvider(providerParams);
  } else if (providerName === 'webdav') {
    try {
      console.log('[restore:plan] init provider', { providerName, groups });
    } catch (_) {}
    provider = require('./providers/webdav').createWebdavProvider(providerParams);
  } else {
    throw new Error(`Unsupported provider: ${providerName}`);
  }

  const items = resolveItems(app, groups);
  // Read remote index
  const remoteIndexText = await provider.readText('index.tsv');
  const remoteRows = remoteIndexText ? parseTSV(remoteIndexText) : [];
  // Optional meta
  let remoteMeta = null;
  try {
    const metaText = await provider.readText('index.meta.json');
    remoteMeta = metaText ? JSON.parse(metaText) : null;
  } catch (_) {
    remoteMeta = null;
  }
  // Build local index for existing items only
  const localRows = await buildLocalIndex(items, new Map());

  // Compare only on intersection of paths to avoid false positives
  const localMap = rowsToMap(localRows);
  const remoteMap = rowsToMap(remoteRows);
  let localLatest = 0;
  let remoteLatest = 0;
  let intersectCount = 0;
  const intersectPaths = [];
  const localNewerPaths = [];
  const remoteNewerPaths = [];
  const md5Different = [];
  const md5Equal = [];
  const details = [];

  // Load ignore patterns from config. By default, do NOT ignore config.yml in conflict detection.
  // Users can explicitly set backup.ignoreConfigYml: true to skip it.
  let ignorePatterns = [];
  try {
    const conf = loadConfig();
    const userIgnores =
      conf && conf.backup && Array.isArray(conf.backup.ignorePatterns)
        ? conf.backup.ignorePatterns
        : [];
    const ignoreConfigYml = !!(conf && conf.backup && conf.backup.ignoreConfigYml === true);
    if (ignoreConfigYml) ignorePatterns.push('j2me-launcher/config.yml');
    ignorePatterns = [...ignorePatterns, ...userIgnores];
  } catch (_) {}
  const isIgnored = (p) => {
    for (const pat of ignorePatterns) {
      if (!pat) continue;
      if (pat.includes('*')) {
        const idx = pat.indexOf('*');
        const prefix = pat.slice(0, idx);
        if (p.startsWith(prefix)) return true;
      } else if (p === pat || p.startsWith(pat.endsWith('/') ? pat : pat + '/')) {
        return true;
      }
    }
    return false;
  };

  for (const [p, lrow] of localMap.entries()) {
    const rrow = remoteMap.get(p);
    if (!rrow) continue;
    intersectCount++;
    intersectPaths.push(p);
    localLatest = Math.max(localLatest, lrow.mtime || 0);
    remoteLatest = Math.max(remoteLatest, rrow.mtime || 0);
    const lmt = lrow.mtime || 0;
    const rmt = rrow.mtime || 0;
    const sameMd5 = (lrow.md5 || '') === (rrow.md5 || '');
    if (sameMd5) md5Equal.push(p);
    else md5Different.push(p);
    if (lmt > rmt) localNewerPaths.push(p);
    else if (rmt > lmt) remoteNewerPaths.push(p);
    details.push({
      path: p,
      local: { md5: lrow.md5, size: lrow.size, mtime: lmt },
      remote: { md5: rrow.md5, size: rrow.size, mtime: rmt },
      sameMd5,
      localNewer: lmt > rmt,
      remoteNewer: rmt > lmt,
      ignored: isIgnored(p),
    });
  }

  // Special-case: database snapshot vs local trio (data.db, -wal, -shm)
  try {
    const localDbRel = 'j2me-launcher/data.db';
    const remoteDbRel = 'j2me-launcher/data.backup.db';
    const rDb = remoteMap.get(remoteDbRel);
    if (rDb) {
      // Probe local db trio mtimes
      const userRoot = app.getPath('userData');
      const roamingRoot = path.dirname(userRoot);
      const candAbs = [
        path.join(roamingRoot, localDbRel),
        path.join(userRoot, localDbRel),
        path.join(roamingRoot, localDbRel),
        path.join(roamingRoot, 'j2me-launcher', 'data.db-wal'),
        path.join(roamingRoot, 'j2me-launcher', 'data.db-shm'),
      ];
      let localDbLatest = 0;
      let localDbPath = null;
      for (const abs of candAbs) {
        const st = statOrNull(abs);
        if (st && st.mtimeMs) {
          const m = Math.floor(st.mtimeMs);
          if (m > localDbLatest) {
            localDbLatest = m;
            if (abs.endsWith('data.db')) localDbPath = abs;
          }
        }
      }
      if (localDbLatest > 0) {
        // Compare against snapshot mtime
        const rmt = rDb.mtime || 0;
        localLatest = Math.max(localLatest, localDbLatest);
        remoteLatest = Math.max(remoteLatest, rmt);
        // Synthesize an entry keyed by local data.db path
        intersectCount++;
        intersectPaths.push(localDbRel);
        // Only compute MD5 if WAL/SHM are absent to avoid inconsistent hashing
        const walExists = fs.existsSync(path.join(roamingRoot, 'j2me-launcher', 'data.db-wal'));
        const shmExists = fs.existsSync(path.join(roamingRoot, 'j2me-launcher', 'data.db-shm'));
        let dbMd5 = null;
        try {
          if (!walExists && !shmExists && localDbPath && fs.existsSync(localDbPath)) {
            dbMd5 = await md5File(localDbPath);
          }
        } catch (_) {
          dbMd5 = null;
        }
        const localDbRow = { md5: dbMd5, size: null, mtime: localDbLatest };
        details.push({
          path: localDbRel,
          local: localDbRow,
          remote: { md5: rDb.md5, size: rDb.size, mtime: rmt, snapshotRel: remoteDbRel },
          sameMd5: false, // cannot be equal; different file names and content likely differ
          localNewer: localDbLatest > rmt,
          remoteNewer: rmt > localDbLatest,
          ignored: false,
          syntheticDb: true,
        });
        if (localDbLatest > rmt) localNewerPaths.push(localDbRel);
        else if (rmt > localDbLatest) remoteNewerPaths.push(localDbRel);
        md5Different.push(localDbRel);
      }
    }
  } catch (_) {}

  // Compute decision: conflict if there exists non-ignored path with md5Different on intersection
  let decision = 'ok';
  const hasRealConflict = details.some((d) => !d.ignored && !d.sameMd5);
  if (hasRealConflict) decision = 'conflict';
  // Backward-compatible special case: if all differences are localNewer (and not ignored), tag as conflict-local-newer
  const anyDiff = details.filter((d) => !d.ignored && !d.sameMd5);
  if (anyDiff.length > 0 && anyDiff.every((d) => d.localNewer)) decision = 'conflict-local-newer';

  try {
    console.log('[restore:plan] summary', {
      localCount: localRows.length,
      remoteCount: remoteRows.length,
      intersectCount,
      localLatest,
      remoteLatest,
      decision,
    });
  } catch (_) {}
  return {
    decision,
    meta: { remote: remoteMeta },
    localLatest,
    remoteLatest,
    localCount: localRows.length,
    remoteCount: remoteRows.length,
    intersectCount,
    intersectPaths,
    localNewerPaths,
    remoteNewerPaths,
    md5Equal,
    md5Different,
    details,
  };
}

async function runRestore({
  app,
  providerName,
  providerParams,
  groups,
  force,
  includePaths = null,
}) {
  // Load provider
  let provider;
  if (providerName === 's3') {
    try {
      console.log('[restore:run] init provider', { providerName, groups, force });
    } catch (_) {}
    provider = require('./providers/s3').createS3Provider(providerParams);
  } else if (providerName === 'dropbox') {
    try {
      console.log('[restore:run] init provider', { providerName, groups, force });
    } catch (_) {}
    provider = require('./providers/dropbox').createDropboxProvider(providerParams);
  } else if (providerName === 'webdav') {
    try {
      console.log('[restore:run] init provider', { providerName, groups, force });
    } catch (_) {}
    provider = require('./providers/webdav').createWebdavProvider(providerParams);
  } else {
    throw new Error(`Unsupported provider: ${providerName}`);
  }

  // Read remote index
  const remoteIndexText = await provider.readText('index.tsv');
  const remoteRows = remoteIndexText ? parseTSV(remoteIndexText) : [];
  const remote = rowsToMap(remoteRows);
  const includeSet = Array.isArray(includePaths) ? new Set(includePaths) : null;
  const shouldInclude = (rel) => {
    if (!includeSet) return true;
    return includeSet.has(rel);
  };

  // If DB snapshot exists remotely and database group selected, restore it
  const groupSet = new Set(groups || []);
  const doDB = groupSet.has('database');
  let dbRestored = false;
  if (doDB && remote.has('j2me-launcher/data.backup.db')) {
    const roamingRoot = path.dirname(app.getPath('userData'));
    const targetDb = path.join(roamingRoot, 'j2me-launcher', 'data.db');
    const backupRel = 'j2me-launcher/data.backup.db';
    const localDbRel = 'j2me-launcher/data.db';
    const includeDb = shouldInclude(backupRel) || (includeSet && includeSet.has(localDbRel));
    if (!includeDb) {
      try {
        console.log('[restore:run] skip db by includePaths');
      } catch (_) {}
    } else {
      try {
        console.log('[restore:run] db restore start', { to: targetDb, rel: backupRel });
      } catch (_) {}
      // Close DB if open
      try {
        const { closeDB } = require('../db');
        try {
          closeDB();
        } catch (_) {}
      } catch (_) {}
      // Write snapshot to data.db
      const fse = require('fs-extra');
      fse.ensureDirSync(path.dirname(targetDb));
      await provider.downloadFile(backupRel, targetDb);
      // Remove WAL/SHM if exist
      for (const ext of ['-wal', '-shm']) {
        const p = targetDb + ext;
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch (_) {}
      }
      dbRestored = true;
      try {
        console.log('[restore:run] db restore done');
      } catch (_) {}
    }
  }

  // Restore other files from BACKUP_SPEC groups
  const userRoot = app.getPath('userData');
  const roamingRoot = path.dirname(userRoot);
  let restored = 0;
  for (const g of BACKUP_SPEC.groups) {
    if (!groupSet.has(g.key)) continue;
    for (const rel of g.items || []) {
      // Skip DB trio; DB handled above via snapshot
      if (/j2me-launcher\/data\.db(\-wal|\-shm)?$/.test(rel)) continue;
      // If snapshot file exists remotely and equals rel, it will be handled if matches
      const rr = remote.get(rel) || null;
      if (!rr) continue; // nothing to restore for this item
      if (!shouldInclude(rel)) continue; // filtered out by selection
      const absUser = path.join(userRoot, rel);
      const absRoam = path.join(roamingRoot, rel);
      const targetAbs = fs.existsSync(path.dirname(absUser)) ? absUser : absRoam;
      try {
        await provider.downloadFile(rel, targetAbs);
        restored++;
        try {
          console.log('[restore:run] file restored', { rel, to: targetAbs });
        } catch (_) {}
      } catch (e) {
        try {
          console.log('[restore:run] file restore error', { rel, error: e && e.message });
        } catch (_) {}
      }
    }
  }

  // Restore dynamically resolved external paths (rms / emuConfig)
  try {
    const conf = loadConfig();
    const emus = conf && conf.emulators ? conf.emulators : {};
    const mapping = [];
    // Build prefix -> baseAbs map according to current config
    // FreeJ2ME-Plus
    const fj = emus.freej2mePlus || {};
    const fjBase = fj.jarPath ? path.dirname(fj.jarPath) : '';
    if (fjBase) {
      if (groupSet.has('rms'))
        mapping.push({ prefix: 'external/freej2mePlus/rms/', base: path.join(fjBase, 'rms') });
      if (groupSet.has('emuConfig'))
        mapping.push({
          prefix: 'external/freej2mePlus/config/',
          base: path.join(fjBase, 'config'),
        });
    }
    // KEmulator
    const ke = emus.ke || {};
    const keBase = ke.jarPath ? path.dirname(ke.jarPath) : '';
    if (keBase) {
      if (groupSet.has('rms'))
        mapping.push({ prefix: 'external/kemulator/rms/', base: path.join(keBase, 'rms') });
    }
    // Libretro
    const lr = emus.libretro || {};
    const raBase = lr.retroarchPath ? path.dirname(lr.retroarchPath) : '';
    if (raBase) {
      if (groupSet.has('rms'))
        mapping.push({
          prefix: 'external/libretro/freej2me/rms/',
          base: path.join(raBase, 'saves', 'FreeJ2ME-Plus', 'freej2me', 'rms'),
        });
      if (groupSet.has('emuConfig'))
        mapping.push({
          prefix: 'external/libretro/freej2me/config/',
          base: path.join(raBase, 'saves', 'FreeJ2ME-Plus', 'freej2me', 'config'),
        });
    }
    // For each remote row that matches any prefix, download back to base+relative
    for (const row of remoteRows) {
      const rel = row.path || row.rel || '';
      if (!shouldInclude(rel)) continue;
      for (const m of mapping) {
        if (rel.startsWith(m.prefix)) {
          const sub = rel.substring(m.prefix.length);
          const target = path.join(m.base, sub);
          try {
            fse.ensureDirSync(path.dirname(target));
          } catch (_) {}
          try {
            await provider.downloadFile(rel, target);
            restored++;
            try {
              console.log('[restore:run] external restored', { rel, to: target });
            } catch (_) {}
          } catch (e) {
            try {
              console.log('[restore:run] external restore error', { rel, error: e && e.message });
            } catch (_) {}
          }
          break;
        }
      }
    }
  } catch (e) {
    try {
      console.log('[restore:run] dynamic external restore error', { error: e && e.message });
    } catch (_) {}
  }

  // After DB restore, force a full rescan to regenerate derived data (e.g., icons)
  try {
    if (dbRestored) {
      try {
        console.log('[restore:run] triggering full rescan to rebuild icons');
      } catch (_) {}
      const { processMultipleDirectories } = require('../jar-parser');
      try {
        await processMultipleDirectories(null, true);
      } catch (e) {
        try {
          console.log('[restore:run] full rescan error', { error: e && e.message });
        } catch (_) {}
      }
    }
  } catch (_) {}

  return { ok: true, restored, dbRestored };
}

module.exports = { runBackup, planRestore, runRestore };
