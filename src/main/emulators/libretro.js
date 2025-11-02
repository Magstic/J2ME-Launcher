const path = require('path');

// Command shape (Windows):
//   retroarch.exe -L core.dll <content>

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

  return {
    command: retroarchPath,
    args: ['-L', corePath, gameFilePath],
    cwd,
  };
}

/**
 * Prepare content path.
 * @param {Object} params
 * @param {string} params.gameFilePath
 * @param {Object} params.utils
 */
async function prepareGame({ gameFilePath, utils }) {
  const { ensureCachedJar } = utils || {};
  const preparedGamePath = ensureCachedJar ? await ensureCachedJar(gameFilePath) : gameFilePath;
  return { preparedGamePath };
}

module.exports = { id, name, capabilities, buildCommand, prepareGame };
