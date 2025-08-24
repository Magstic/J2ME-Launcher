// src/main/config/yaml-config.js
// YAML-backed global configuration for emulators and UI

const { app } = require('electron');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

const CONFIG_FILENAME = 'config.yml';
const CONFIG_BAK_SUFFIX = '.bak';

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILENAME);
}

const DEFAULTS = Object.freeze({
  version: 1,
  emulators: {
    freej2mePlus: {
      jarPath: '',
      romCache: true,
      defaults: {
        fullscreen: 0,
        width: 240,
        height: 320,
        scale: 2,
        keyLayout: 0,
        framerate: 60,
        // UI extra fields and compat flags with sensible defaults
        backlightcolor: 'Disabled',
        fontoffset: 0,
        rotate: 0,
        fpshack: 'Disabled', // 'Disabled' | 'Safe' | 'Extended' | 'Aggressive'
        sound: 'on',
        spdhacknoalpha: 'off',
        // compat flags
        compatfantasyzonefix: 'off',
        compatimmediaterepaints: 'off',
        compatoverrideplatchecks: 'on',
        compatsiemensfriendlydrawing: 'off',
        compattranstooriginonreset: 'off',
        // fonts used by game-conf writer defaults
        textfont: 'Default',
        soundfont: 'Default',
      },
    },
    ke: { jarPath: '', romCache: true },
    libretro: { retroarchPath: '', corePath: '', romCache: false },
  },
  ui: {
    defaultView: 'desktop',
    showUncategorized: true,
    folderLayout: 'grid',
  },
});

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(out[k] || {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function validate(config) {
  // Lightweight validation with defaults fill-in
  const merged = deepMerge(DEFAULTS, config || {});
  // Ensure booleans for romCache
  if (typeof merged.emulators?.freej2mePlus?.romCache !== 'boolean') merged.emulators.freej2mePlus.romCache = true;
  if (typeof merged.emulators?.ke?.romCache !== 'boolean') merged.emulators.ke.romCache = true;
  if (typeof merged.emulators?.libretro?.romCache !== 'boolean') merged.emulators.libretro.romCache = false;
  // Clamp some numeric defaults to sane ranges
  const d = merged.emulators.freej2mePlus?.defaults || {};
  if (typeof d.width !== 'number' || !Number.isFinite(d.width)) d.width = DEFAULTS.emulators.freej2mePlus.defaults.width;
  if (typeof d.height !== 'number' || !Number.isFinite(d.height)) d.height = DEFAULTS.emulators.freej2mePlus.defaults.height;
  if (typeof d.scale !== 'number' || !Number.isFinite(d.scale)) d.scale = DEFAULTS.emulators.freej2mePlus.defaults.scale;
  if (typeof d.framerate !== 'number' || !Number.isFinite(d.framerate)) d.framerate = DEFAULTS.emulators.freej2mePlus.defaults.framerate;
  d.width = Math.max(64, Math.min(1080, d.width));
  d.height = Math.max(64, Math.min(1920, d.height));
  d.scale = Math.max(1, Math.min(5, d.scale));
  d.framerate = Math.max(30, Math.min(240, d.framerate));
  return merged;
}

function readYamlSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(text) || {};
    return validate(parsed);
  } catch (e) {
    console.error('[YAML] Failed to read config:', e.message);
    // backup the corrupt file
    try {
      const bak = filePath + '.corrupt.' + Date.now();
      fse.copySync(filePath, bak, { overwrite: true, errorOnExist: false });
      console.warn('[YAML] Backed up corrupt config to:', bak);
    } catch (_) {}
    return null;
  }
}

// Raw reader without validation for comparison/correction purposes
function readYamlRaw(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(text) || {};
    return parsed;
  } catch (e) {
    return null;
  }
}

function writeYamlAtomic(filePath, dataObj) {
  const dir = path.dirname(filePath);
  fse.ensureDirSync(dir);
  const tmp = path.join(dir, CONFIG_FILENAME + '.tmp');
  const text = yaml.dump(dataObj, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(tmp, text, 'utf8');
  // keep a simple backup of previous config
  if (fs.existsSync(filePath)) {
    try { fse.copySync(filePath, filePath + CONFIG_BAK_SUFFIX, { overwrite: true }); } catch (_) {}
  }
  fs.renameSync(tmp, filePath);
}

function loadOrInit(defaultBuilder) {
  const filePath = getConfigPath();
  const raw = readYamlRaw(filePath);
  if (raw) {
    // Validate and self-heal (materialize missing keys, fix invalid types/ranges)
    const merged = validate(raw);
    // If the merged object differs from raw, write back the corrected config
    try {
      if (JSON.stringify(merged) !== JSON.stringify(raw)) {
        writeYamlAtomic(filePath, merged);
      }
    } catch (_) {}
    return merged;
  }
  // File missing or unreadable: seed with full defaults (or provided builder) and write
  const seedSource = typeof defaultBuilder === 'function' ? defaultBuilder() : DEFAULTS;
  const seed = validate(seedSource);
  writeYamlAtomic(filePath, seed);
  return seed;
}

function loadConfig(defaultBuilder) {
  return loadOrInit(defaultBuilder);
}

function saveConfig(partial) {
  const filePath = getConfigPath();
  // Use loadOrInit to also self-heal before merging
  const current = loadOrInit();
  const merged = validate(deepMerge(current, partial || {}));
  writeYamlAtomic(filePath, merged);
  return merged;
}

function getEmulatorConfig(defaultBuilder) {
  const conf = loadConfig(defaultBuilder);
  return conf.emulators;
}

function setEmulatorConfig(partial, defaultBuilder) {
  const merged = saveConfig({ emulators: partial || {} });
  return merged.emulators;
}

module.exports = {
  getConfigPath,
  loadConfig,
  saveConfig,
  getEmulatorConfig,
  setEmulatorConfig,
  DEFAULTS,
};
