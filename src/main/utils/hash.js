const crypto = require('crypto');

// Compute a stable hash for a game based on its file path.
// Use lowercase normalized path to avoid case differences.
function gameHashFromPath(filePath) {
  const norm = (filePath || '').trim();
  return crypto.createHash('sha1').update(norm.toLowerCase(), 'utf8').digest('hex');
}

module.exports = { gameHashFromPath };
