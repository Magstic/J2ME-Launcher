const path = require('path');

// Minimal RetroArch (libretro) adapter
// Only requires the RetroArch executable path and the core (.dll) path.
// Command shape (Windows):
//   retroarch.exe -L core.dll <content>
//
// We intentionally do NOT add extra flags to mirror KE's minimalism.

const id = 'libretro';
const name = '【Alpha】Libretro Core (FreeJ2ME-Plus)';
const capabilities = {
  perGameParams: false,
  requiresGameConf: false,
  supportsAssets: [],
};

/**
 * Build spawn command for RetroArch.
 * @param {Object} params
 * @param {string} params.retroarchPath - Full path to retroarch.exe
 * @param {string} params.corePath - Full path to a libretro core (.dll on Windows)
 * @param {string} params.gameFilePath - Game/Content path passed to the core
 * @returns {{ command: string, args: string[], cwd?: string }}
 */
function buildCommand({ retroarchPath, corePath, gameFilePath }) {
  if (!retroarchPath) throw new Error('[libretro] Missing retroarchPath');
  if (!corePath) throw new Error('[libretro] Missing corePath');
  if (!gameFilePath) throw new Error('[libretro] Missing gameFilePath');

  // Use RetroArch directory as cwd so any relative paths in RA configs still work
  const cwd = path.dirname(retroarchPath);

  // No extra args: keep it minimal as requested
  return {
    command: retroarchPath,
    args: ['-L', corePath, gameFilePath],
    cwd,
  };
}

/**
 * Prepare content path. Like KE, we only ensure the MD5-cached JAR when the helper is available.
 * @param {Object} params
 * @param {string} params.gameFilePath
 * @param {Object} params.utils
 */
async function prepareGame({ gameFilePath, utils }) {
  const { ensureCachedJar } = utils || {};
  const preparedGamePath = ensureCachedJar ? await ensureCachedJar(gameFilePath) : gameFilePath;
  return { preparedGamePath };
}

/**
 * Minimal schema to drive the UI (matches existing pattern of other adapters)
 */
function getConfigSchema() {
  return {
    id,
    name,
    groups: [
      {
        id: 'paths',
        label: 'Paths',
        fields: [
          { key: 'retroarchPath', type: 'file', label: '執行檔 (retroarch.exe)' },
          { key: 'corePath', type: 'file', label: '核心 (freej2me_libretro.dll)' },
          { key: 'romCache', type: 'checkbox', label: 'ROM 快取模式', default: false },
        ],
      },
    ],
  };
}

module.exports = { id, name, capabilities, buildCommand, prepareGame, getConfigSchema };
