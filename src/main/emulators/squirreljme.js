const path = require('path');

const id = 'squirreljme';
const name = 'SquirrelJME';
const capabilities = {
  perGameParams: false,
  requiresGameConf: false,
  supportsAssets: [],
};

/**
 * Build launch command for SquirrelJME.
 * Command shape:
 *   java -jar <squirreljme-standalone-*.jar> -jar <game.jar>
 */
function buildCommand({ jarPath, gameFilePath }) {
  if (!jarPath) throw new Error('[squirreljme] Missing jarPath');
  if (!gameFilePath) throw new Error('[squirreljme] Missing gameFilePath');
  const cwd = path.dirname(jarPath);
  return {
    command: 'java',
    args: ['-jar', jarPath, '-jar', gameFilePath],
    cwd,
  };
}

/**
 * Prepare game path (optionally ensure MD5 cached JAR path like other adapters)
 */
async function prepareGame({ gameFilePath, utils }) {
  const { ensureCachedJar } = utils || {};
  const preparedGamePath = ensureCachedJar ? await ensureCachedJar(gameFilePath) : gameFilePath;
  return { preparedGamePath };
}

module.exports = { id, name, capabilities, buildCommand, prepareGame };
