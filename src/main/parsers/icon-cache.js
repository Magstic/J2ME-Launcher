// 圖標快取工具：將二進位圖像資料寫入快取並返回路徑（繁中註釋）
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const DataStore = require('../data-store.js');

/**
 * 將圖標 Buffer 快取到本地，檔名使用內容 MD5，副檔名沿用來源或預設 .png
 * @param {Buffer} buffer - 圖標二進位資料
 * @param {string} [suggestedExt] - 建議的副檔名（例如 .png/.jpg），可選
 * @returns {Promise<string>} - 快取後的絕對路徑
 */
async function cacheIconBuffer(buffer, suggestedExt) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('icon buffer 無效');
  }
  const hash = crypto.createHash('md5').update(buffer).digest('hex');
  const ext = normalizeExt(suggestedExt) || '.png';
  const outPath = path.join(DataStore.getIconCachePath(), `${hash}${ext}`);
  await fs.outputFile(outPath, buffer);
  return outPath;
}

function normalizeExt(ext) {
  if (!ext) return null;
  let e = ext.startsWith('.') ? ext : `.${ext}`;
  return e.toLowerCase();
}

module.exports = { cacheIconBuffer };
