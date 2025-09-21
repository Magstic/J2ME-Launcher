// Utilities to update FreeJ2ME-Plus game.conf for a specific game
// Encapsulates writing, normalization, and ordering

const fs = require('fs');
const path = require('path');

function ensureInt(v, defVal) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defVal;
}

function normalizeLinesRemoveGarbage(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  return lines.filter((ln) => {
    const idx = ln.indexOf(':');
    if (idx <= 0) return ln.trim().length > 0; // remove empty lines
    const key = ln.slice(0, idx).trim().toLowerCase();
    return key !== 'height' && key !== 'width';
  });
}

function buildOrderedOut(lines) {
  const orderedKeys = [
    'backlightcolor',
    'compatfantasyzonefix',
    'compatimmediaterepaints',
    'compatoverrideplatchecks',
    'compatsiemensfriendlydrawing',
    'compattranstooriginonreset',
    'fontoffset',
    'fps',
    'fpshack',
    'phone',
    'rotate',
    'scrheight',
    'scrwidth',
    'sound',
    'soundfont',
    'spdhacknoalpha',
    'textfont',
  ];
  const isTarget = (ln) => {
    const idx = ln.indexOf(':');
    if (idx <= 0) return false;
    const k = ln.slice(0, idx).trim();
    return orderedKeys.includes(k);
  };
  const presentMap = new Map();
  for (const ln of lines) {
    const idx = ln.indexOf(':');
    if (idx <= 0) continue;
    const k = ln.slice(0, idx).trim();
    const v = ln.slice(idx + 1).trim();
    presentMap.set(k, v);
  }
  const others = lines.filter((ln) => !isTarget(ln));
  return [
    ...others,
    ...orderedKeys.filter((k) => presentMap.has(k)).map((k) => `${k}:${presentMap.get(k)}`),
  ];
}

async function updateGameConf({ jarPath, gameFilePath, params, DataStore, getConfigGameName }) {
  const dsGame = DataStore.getGame(gameFilePath);
  const fallback =
    dsGame && dsGame.gameName
      ? dsGame.gameName
      : path.basename(gameFilePath, path.extname(gameFilePath));
  const gameName = await getConfigGameName(gameFilePath, fallback);

  const confDir = path.join(path.dirname(jarPath), 'config', gameName);
  const confPath = path.join(confDir, 'game.conf');

  const width = ensureInt(params.width, 240);
  const height = ensureInt(params.height, 320);
  const fpsValue = ensureInt(params.framerate, 60);

  let lines = [];
  if (fs.existsSync(confPath)) {
    const text = fs.readFileSync(confPath, 'utf8');
    lines = text.split(/\r?\n/);
  }
  lines = normalizeLinesRemoveGarbage(lines);

  const compatKeys = [
    'compatfantasyzonefix',
    'compatimmediaterepaints',
    'compatoverrideplatchecks',
    'compatsiemensfriendlydrawing',
    'compattranstooriginonreset',
  ];
  const extraKeys = [
    'backlightcolor',
    'fontoffset',
    'rotate',
    'fpshack',
    'sound',
    'spdhacknoalpha',
  ];

  const mapFpshack = (v) => {
    const s = String(v).trim();
    // pass-through if already textual
    if (['Disabled', 'Safe', 'Extended', 'Aggressive'].includes(s)) return s;
    // support numeric or numeric-string
    const m = {
      0: 'Disabled',
      1: 'Safe',
      2: 'Extended',
      3: 'Aggressive',
    };
    return m[s] ?? s;
  };

  const compatValues = Object.fromEntries(
    compatKeys.map((k) => {
      const v = (params && params[k]) || '';
      const norm =
        String(v).toLowerCase() === 'on'
          ? 'on'
          : String(v).toLowerCase() === 'off'
            ? 'off'
            : undefined;
      return [k, norm];
    })
  );

  // phone mapping (keyLayout -> phone name)
  const phoneMap = [
    'Standard',
    'LG',
    'Motorola/SoftBank',
    'Motorola Triplets',
    'Motorola V8',
    'Nokia Full Keyboard',
    'Sagem',
    'Siemens',
    'Sharp',
    'SKT',
    'KDDI',
  ];
  const phoneIdx = ensureInt(params?.keyLayout, 0);
  const phoneName = phoneMap[phoneIdx] || 'Standard';

  let hasW = false,
    hasH = false,
    hasPhone = false,
    hasTextfont = false,
    hasSoundfont = false,
    hasFps = false;

  const newLines = lines.map((ln) => {
    const idx = ln.indexOf(':');
    if (idx > 0) {
      const key = ln.slice(0, idx).trim();
      if (key === 'scrwidth') {
        hasW = true;
        return `scrwidth:${width}`;
      }
      if (key === 'scrheight') {
        hasH = true;
        return `scrheight:${height}`;
      }
      if (key === 'fps') {
        hasFps = true;
        return `fps:${fpsValue}`;
      }
      if (key === 'textfont') {
        hasTextfont = true;
        return `textfont:${params.textfont || 'Default'}`;
      }
      if (key === 'soundfont') {
        hasSoundfont = true;
        return `soundfont:${params.soundfont || 'Default'}`;
      }
      if (compatKeys.includes(key)) {
        const val = compatValues[key];
        if (val === 'on' || val === 'off') return `${key}:${val}`;
      }
      if (key === 'phone') {
        hasPhone = true;
        return `phone:${phoneName}`;
      }
      if (extraKeys.includes(key)) {
        let val = params?.[key];
        if (val !== undefined && val !== null && String(val).length > 0) {
          if (key === 'fpshack') val = mapFpshack(val);
          return `${key}:${val}`;
        }
      }
    }
    return ln;
  });

  if (!hasW) newLines.push(`scrwidth:${width}`);
  if (!hasH) newLines.push(`scrheight:${height}`);
  if (!hasPhone) newLines.push(`phone:${phoneName}`);
  if (!hasFps) newLines.push(`fps:${fpsValue}`);
  if (!hasTextfont) newLines.push(`textfont:${params.textfont || 'Default'}`);
  if (!hasSoundfont) newLines.push(`soundfont:${params.soundfont || 'Default'}`);

  for (const k of compatKeys) {
    const val = compatValues[k];
    if (val === 'on' || val === 'off') {
      if (!newLines.some((ln) => ln.trim().startsWith(`${k}:`))) newLines.push(`${k}:${val}`);
    }
  }
  for (const k of extraKeys) {
    let val = params?.[k];
    if (val !== undefined && val !== null && String(val).length > 0) {
      if (k === 'fpshack') val = mapFpshack(val);
      if (!newLines.some((ln) => ln.trim().startsWith(`${k}:`))) newLines.push(`${k}:${val}`);
    }
  }

  const orderedOut = buildOrderedOut(newLines);
  fs.mkdirSync(confDir, { recursive: true });
  fs.writeFileSync(confPath, orderedOut.join('\n'), 'utf8');
  return { confPath };
}

module.exports = { updateGameConf };
