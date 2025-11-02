// FreeJ2ME-Plus emulator adapter
// 負責準備與構建命令，便於後續調整而不影響主程式
const path = require('path');

const id = 'freej2mePlus';
const name = 'FreeJ2ME-Plus';
const capabilities = {
  perGameParams: true,
  requiresGameConf: true,
  supportsAssets: ['soundfont', 'textfont'],
};

/**
 * 構建啟動命令
 * @param {{ jarPath: string, gameFilePath: string, params: { fullscreen?: number, width?: number, height?: number, scale?: number, keyLayout?: number, framerate?: number } }} options
 * @returns {{ command: string, args: string[], cwd: string|undefined }}
 */
function buildCommand({ jarPath, gameFilePath, params = {} }) {
  const command = 'java';
  // 注意：必須強制指定字元編碼，否則位置參數（寬高/幀率/鍵盤布局）可能無法被正確解析
  const args = ['-Dfile.encoding=ISO_8859_1', '-jar', jarPath];

  // 參數映射（改為位置參數順序）：
  // <gamePath> <fullscreen> <width> <height> <scale> <keyLayout> <framerate>
  const p = {
    fullscreen: 0,
    width: 240,
    height: 320,
    scale: 2,
    keyLayout: 0,
    framerate: 60,
    ...params,
  };

  // 遊戲路徑作為第一個位置參數（spawn 會處理帶空格/Unicode，無需額外引號）
  args.push(gameFilePath);
  args.push(
    String(parseInt(p.fullscreen, 10) || 0),
    String(parseInt(p.width, 10) || 240),
    String(parseInt(p.height, 10) || 320),
    String(parseInt(p.scale, 10) || 2),
    String(parseInt(p.keyLayout, 10) || 0),
    String(parseInt(p.framerate, 10) || 60)
  );

  const cwd = path.dirname(jarPath);
  return { command, args, cwd };
}

/**
 * 準備遊戲：更新 game.conf 並產生 MD5 快取路徑（僅 FreeJ2ME-Plus 需要 game.conf）
 * @param {{ jarPath: string, gameFilePath: string, params: any, utils: { ensureCachedJar: Function, updateGameConf: Function, DataStore: any, getConfigGameName: Function } }} ctx
 * @returns {Promise<{ preparedGamePath: string }>}
 */
async function prepareGame({ jarPath, gameFilePath, params, utils }) {
  const { ensureCachedJar, updateGameConf, DataStore, getConfigGameName } = utils || {};
  if (updateGameConf && DataStore && getConfigGameName) {
    try {
      await updateGameConf({ jarPath, gameFilePath, params, DataStore, getConfigGameName });
    } catch (e) {
      // 忽略 game.conf 失敗，仍繼續
      console.warn('[freej2mePlus] update game.conf failed:', e?.message || e);
    }
  }
  const preparedGamePath = ensureCachedJar ? await ensureCachedJar(gameFilePath) : gameFilePath;
  return { preparedGamePath };
}

module.exports = { id, name, capabilities, buildCommand, prepareGame };
