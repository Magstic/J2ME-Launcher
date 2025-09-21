#!/usr/bin/env node
/*
  Verifies that build artifacts required by Electron at runtime are present.
  Fails fast with actionable messages to avoid half-baked packages.
*/
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const required = [
  ['dist/index.html', 'Vite main entry not built.'],
  ['dist/folder.html', 'Vite folder window entry not built.'],
  ['src/main/main.js', 'Electron main process missing.'],
  ['src/main/preload.js', 'Electron preload missing.'],
  ['loading.html', 'Splash loading page missing.'],
];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

let ok = true;
for (const [rel, msg] of required) {
  if (!exists(rel)) {
    console.error(`[verify-dist] Missing: ${rel} -> ${msg}`);
    ok = false;
  }
}

// Ensure assets exist and are non-empty
const assetsDir = path.join(root, 'dist', 'assets');
try {
  const items = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
  if (items.length === 0) {
    console.error('[verify-dist] dist/assets is empty. Ensure Vite emitted JS/CSS.');
    ok = false;
  }
} catch (e) {
  console.error('[verify-dist] Cannot access dist/assets:', e.message);
  ok = false;
}

// Warn (do not fail) if BrowserWindow icon path is likely missing
const publicIcon = path.join(root, 'public', 'icon.png');
if (!fs.existsSync(publicIcon)) {
  console.warn(
    '[verify-dist] Warning: public/icon.png not found. Window icon may fall back to default.'
  );
}

if (!ok) {
  console.error('\n[verify-dist] Build verification FAILED. Aborting packaging.');
  process.exit(1);
}

console.log('[verify-dist] OK. All required artifacts are present.');
