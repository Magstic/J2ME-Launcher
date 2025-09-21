// src/shared/backup/indexTSV.js
// TSV 讀寫與路徑正規化工具

const os = require('os');

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function parseTSV(text) {
  const lines = String(text || '').split(/\r?\n/);
  const rows = [];
  let start = 0;
  // 跳過空行與可能的表頭
  if (lines.length && /\t/.test(lines[0]) && /path\s*\t/.test(lines[0])) {
    start = 1;
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [path, md5, sizeStr, mtimeStr] = line.split('\t');
    const size = Number(sizeStr || 0) || 0;
    const mtime = Number(mtimeStr || 0) || 0;
    rows.push({ path: toPosix(path), md5: (md5 || '').trim(), size, mtime });
  }
  return rows;
}

function stringifyTSV(rows, withHeader = true) {
  const out = [];
  if (withHeader) out.push('path\tmd5\tsize\tmtime');
  for (const r of rows || []) {
    out.push(`${toPosix(r.path)}\t${r.md5 || ''}\t${Number(r.size || 0)}\t${Number(r.mtime || 0)}`);
  }
  return out.join(os.EOL);
}

function rowsToMap(rows) {
  const m = new Map();
  for (const r of rows) m.set(toPosix(r.path), r);
  return m;
}

module.exports = { toPosix, parseTSV, stringifyTSV, rowsToMap };
