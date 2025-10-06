// src/components/shared/utils/reloadLogger.js
// 輕量重載量測工具：統計次數與耗時；預設僅在開發環境輸出 log

function isDev() {
  try {
    // Vite/webpack 會在建置時替換 NODE_ENV
    return (
      typeof process !== 'undefined' &&
      process &&
      process.env &&
      process.env.NODE_ENV !== 'production'
    );
  } catch (_) {
    return true;
  }
}

export function createReloadLogger(tag = 'reload', opts = {}) {
  const enable = opts.enabled != null ? !!opts.enabled : isDev();
  const chan = opts.log || console;
  let times = 0;
  const map = new Map(); // label -> startTime

  const now = () =>
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

  function start(label = 'default') {
    try {
      times++;
      map.set(label, now());
      if (enable) chan.time && chan.time(`[${tag}] ${label}`);
    } catch (_) {}
  }

  function end(label = 'default') {
    try {
      const t0 = map.get(label);
      const t1 = now();
      const dt = t0 ? t1 - t0 : undefined;
      if (enable) {
        if (chan.timeEnd) chan.timeEnd(`[${tag}] ${label}`);
        else if (dt != null) chan.log?.(`[${tag}] ${label} finished in ${dt.toFixed(1)}ms`);
      }
      map.delete(label);
      return dt;
    } catch (_) {
      return undefined;
    }
  }

  function count() {
    return times;
  }

  return { start, end, count };
}
