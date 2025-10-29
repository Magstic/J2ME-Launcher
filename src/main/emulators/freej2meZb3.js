const path = require('path');

const id = 'freej2meZb3';
const name = 'FreeJ2ME-ZB3';
const capabilities = {
  perGameParams: true,
  requiresGameConf: true,
  supportsAssets: [],
};

function buildCommand({ jarPath, gameFilePath, params = {} }) {
  const cwd = path.dirname(jarPath);
  const args = ['-jar', jarPath];
  const w = parseInt(params.width, 10);
  const h = parseInt(params.height, 10);
  if (Number.isFinite(w)) {
    args.push('-w', String(w));
  }
  if (Number.isFinite(h)) {
    args.push('-h', String(h));
  }
  args.push(gameFilePath);
  return { command: 'java', args, cwd };
}

async function prepareGame({ jarPath, gameFilePath, params, utils }) {
  const { ensureCachedJar, updateZb3GameConf, DataStore, getConfigGameName } = utils || {};
  if (typeof updateZb3GameConf === 'function' && DataStore && getConfigGameName) {
    try {
      await updateZb3GameConf({ jarPath, gameFilePath, params, DataStore, getConfigGameName });
    } catch (e) {
      console.warn('[freej2meZb3] update game.conf failed:', e?.message || e);
    }
  }
  const preparedGamePath = ensureCachedJar ? await ensureCachedJar(gameFilePath) : gameFilePath;
  return { preparedGamePath };
}

module.exports = { id, name, capabilities, buildCommand, prepareGame };
