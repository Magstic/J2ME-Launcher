// src/components/shared/hooks/useMergedEventRefresh.js
// 將多個事件來源整合為單一去抖刷新入口（與 useGuardedRefresh 搭配）
// 使用方式：
//   const { scheduleGuardedRefresh } = useGuardedRefresh(...)
//   useMergedEventRefresh({
//     sources: [
//       (cb) => window.electronAPI?.onClusterChanged?.(cb),
//       (cb) => window.electronAPI?.onClusterDeleted?.(cb),
//       (cb) => window.electronAPI?.onFolderUpdated?.(cb),
//       (cb) => window.electronAPI?.onFolderChanged?.(cb),
//     ],
//     schedule: (ms) => scheduleGuardedRefresh(ms),
//     debounceMs: 150,
//     filter: (payload) => true, // 可選：過濾不相關事件（如 folderId/clusterId）
//     onEvent: (payload) => {},  // 可選：事件到達時的副作用（如標記 suppressUntil）
//   });

import { useEffect } from 'react';

/**
 * @typedef {(cb:Function)=>Function|object|void} SubscribeFn  註冊並返回取消訂閱（函數或具 off/unsubscribe/dispose 等方法的物件）
 */

/**
 * useMergedEventRefresh
 * @param {Object} opts
 * @param {SubscribeFn[]} opts.sources 事件來源列表（註冊器）
 * @param {(delayMs?:number)=>void} opts.schedule 去抖觸發器（通常來自 useGuardedRefresh.scheduleGuardedRefresh）
 * @param {(payload:any)=>boolean=} opts.filter 過濾條件（返回 true 代表需要觸發）
 * @param {(payload:any)=>void=} opts.onEvent 事件到達時副作用（可用來調整 suppressUntil）
 * @param {number=} opts.debounceMs 去抖時間（預設 150ms）
 */
export default function useMergedEventRefresh({
  sources = [],
  schedule,
  filter,
  onEvent,
  debounceMs = 150,
} = {}) {
  useEffect(() => {
    if (!Array.isArray(sources) || sources.length === 0) return;
    const offList = [];
    const handler = (payload) => {
      try {
        if (filter && !filter(payload)) return;
      } catch (_) {}
      try {
        onEvent && onEvent(payload);
      } catch (_) {}
      try {
        typeof schedule === 'function' && schedule(debounceMs);
      } catch (_) {}
    };
    for (const sub of sources) {
      try {
        const ret = typeof sub === 'function' ? sub(handler) : null;
        if (typeof ret === 'function') {
          // 直接返回取消訂閱函數
          offList.push(ret);
        } else if (ret && typeof ret === 'object') {
          // 兼容返回物件：嘗試尋找 off/unsubscribe/dispose/remove/removeListener/destroy
          const offCandidate =
            (typeof ret.off === 'function' && ret.off.bind(ret)) ||
            (typeof ret.unsubscribe === 'function' && ret.unsubscribe.bind(ret)) ||
            (typeof ret.dispose === 'function' && ret.dispose.bind(ret)) ||
            (typeof ret.remove === 'function' && ret.remove.bind(ret)) ||
            (typeof ret.removeListener === 'function' && ret.removeListener.bind(ret)) ||
            (typeof ret.destroy === 'function' && ret.destroy.bind(ret)) ||
            null;
          if (offCandidate) {
            offList.push(() => {
              try {
                offCandidate();
              } catch (_) {}
            });
          }
        }
      } catch (_) {}
    }
    return () => {
      for (const off of offList) {
        try {
          off();
        } catch (_) {}
      }
    };
  }, [sources, schedule, filter, onEvent, debounceMs]);
}
