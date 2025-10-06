// src/components/shared/utils/listEquality.js
// 輕量列表等價判斷（首段 + 尾段抽樣），避免 O(n) 深度比較

/**
 * 取得穩定鍵
 * @param {any} item
 * @param {(x:any)=>string} keyOf
 */
function key(item, keyOf) {
  try {
    return String(keyOf ? keyOf(item) : (item?.id ?? item?.filePath ?? ''));
  } catch (_) {
    return '';
  }
}

/**
 * listShallowEqualByKeys
 * - 僅比較前 head 個與尾部 tail 個元素的鍵是否一致
 * - 中段不比較，以顯著降低計算成本
 * @param {any[]} a
 * @param {any[]} b
 * @param {{head?:number, tail?:number, keyOf?:(x:any)=>string, requireLengthEqual?:boolean}} opts
 */
export function listShallowEqualByKeys(a, b, opts = {}) {
  const head = Number.isFinite(opts.head) ? Math.max(0, opts.head) : 512;
  const tail = Number.isFinite(opts.tail) ? Math.max(0, opts.tail) : 4;
  const keyOf = opts.keyOf;
  const requireLengthEqual = opts.requireLengthEqual !== false; // 預設要求長度一致

  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (requireLengthEqual && a.length !== b.length) return false;

  const len = Math.min(a.length, b.length);
  const n = Math.min(head, len);
  for (let i = 0; i < n; i++) {
    if (key(a[i], keyOf) !== key(b[i], keyOf)) return false;
  }

  // 若 head 已覆蓋全部，則認為等價
  if (n >= len) return true;

  // 抽查尾部 tail
  for (let k = 1; k <= tail; k++) {
    const idx = len - k;
    if (idx < 0) break;
    if (key(a[idx], keyOf) !== key(b[idx], keyOf)) return false;
  }
  return true;
}

export const keyOfGame = (g) => `G:${String(g?.filePath ?? '')}`;
export const keyOfCluster = (c) => `C:${String(c?.id ?? '')}`;
