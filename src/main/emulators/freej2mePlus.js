// FreeJ2ME-Plus emulator adapter
// 負責準備與構建命令，便於後續調整而不影響主程式
const path = require('path');

const id = 'freej2mePlus';
const name = 'FreeJ2ME-Plus (AWT)';
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

/**
 * 回傳 UI 渲染所需的欄位 Schema（最小可用集）
 * 注意：此 Schema 僅描述欄位，不改變現有參數鍵名，確保持久化相容
 */
function getConfigSchema() {
  return {
    id,
    name,
    groups: [
      {
        id: 'display',
        label: 'Display',
        fields: [
          {
            key: 'resolution',
            type: 'select',
            label: '解析度（resolution）',
            options: [
              '96x65',
              '101x64',
              '101x80',
              '128x128',
              '130x130',
              '120x160',
              '128x160',
              '132x176',
              '176x208',
              '176x220',
              '220x176',
              '208x208',
              '180x320',
              '320x180',
              '208x320',
              '240x320',
              '320x240',
              '240x400',
              '400x240',
              '240x432',
              '240x480',
              '360x360',
              '352x416',
              '360x640',
              '640x360',
              '640x480',
              '480x800',
              '800x480',
            ],
            // mapTo 提示渲染器：此欄位實際對應 width/height 兩個鍵
            mapTo: ['width', 'height'],
          },
          { key: 'scale', type: 'select', label: '縮放（scale）', options: [1, 2, 3, 4, 5] },
          {
            key: 'framerate',
            type: 'select',
            label: '幀率（framerate）',
            options: [60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10],
          },
          {
            key: 'keyLayout',
            type: 'select',
            label: '鍵位佈局（keyLayout）',
            options: [
              { value: 0, label: 'Default' },
              { value: 1, label: 'LG' },
              { value: 2, label: 'Motorola/Softbank' },
              { value: 3, label: 'Motorola Triplets' },
              { value: 4, label: 'Motorola V8' },
              { value: 5, label: 'Nokia Keyboard' },
              { value: 6, label: 'Sagem' },
              { value: 7, label: 'Siemens' },
              { value: 8, label: 'Sharp' },
              { value: 9, label: 'SKT' },
              { value: 10, label: 'KDDI' },
            ],
          },
          {
            key: 'backlightcolor',
            type: 'select',
            label: '背光顏色（backlightcolor）',
            options: ['Disabled', 'Green', 'Cyan', 'Orange', 'Violet', 'Red'],
          },
          {
            key: 'fontoffset',
            type: 'select',
            label: '字體尺寸（fontoffset）',
            options: ['-4', '-3', '-2', '-1', '0', '1', '2', '3', '4'],
          },
          {
            key: 'rotate',
            type: 'select',
            label: '螢幕旋轉（rotate）',
            options: ['0', '90', '180', '270'],
          },
          {
            key: 'fpshack',
            type: 'select',
            label: 'FPS HACK（fpshack）',
            options: ['0', '1', '2', '3'],
          },
          { key: 'fullscreen', type: 'toggle', label: '全螢幕（fullscreen）' },
        ],
      },
      {
        id: 'compat',
        label: 'Compatibility',
        fields: [
          { key: 'compatfantasyzonefix', type: 'toggle', label: 'Fantasy Zone 修復' },
          { key: 'compatimmediaterepaints', type: 'toggle', label: '即時處理畫布重繪呼叫' },
          { key: 'compatoverrideplatchecks', type: 'toggle', label: '覆寫行動平台檢查' },
          { key: 'compatsiemensfriendlydrawing', type: 'toggle', label: 'Siemens 友好繪圖' },
          { key: 'compattranstooriginonreset', type: 'toggle', label: '重設時平移至原點' },
          { key: 'sound', type: 'toggle', label: '模擬手機聲音' },
          { key: 'spdhacknoalpha', type: 'toggle', label: '無 Alpha 空白影像' },
        ],
      },
      {
        id: 'assets',
        label: 'Assets',
        fields: [
          { key: 'soundfont', type: 'asset-toggle', label: '音源', assetType: 'soundfont' },
          { key: 'textfont', type: 'asset-toggle', label: '字體', assetType: 'textfont' },
        ],
      },
    ],
  };
}

module.exports = { id, name, capabilities, buildCommand, prepareGame, getConfigSchema };
