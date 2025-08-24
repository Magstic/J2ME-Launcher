const path = require('path');

const id = 'ke';
const name = 'KEmulator nnmod';
const capabilities = {
  perGameParams: false,
  requiresGameConf: false,
  supportsAssets: [],
};

function buildCommand({ jarPath, gameFilePath }) {
  // Command: java -jar "KEmulator.jar" "game.jar"
  // Run with cwd at the emulator jar directory
  const cwd = path.dirname(jarPath);
  return {
    command: 'java',
    args: ['-jar', jarPath, gameFilePath],
    cwd,
  };
}

// KEmulator does not use game.conf; only ensure MD5-cached JAR path
async function prepareGame({ gameFilePath, utils }) {
  const { ensureCachedJar } = utils || {};
  const preparedGamePath = ensureCachedJar ? await ensureCachedJar(gameFilePath) : gameFilePath;
  return { preparedGamePath };
}

module.exports = { id, name, capabilities, buildCommand, prepareGame };
