// src/components/shared/hooks/useGuardedRefresh.js
// 受控刷新門閘（從桌面 guardedRefresh 抽象為共享原語）
// - 抑制期：suppressUntilRef.current（毫秒級 timestamp）期間延後刷新
// - 使用者活躍窗口：recent user input 時延後刷新
// - 在主執行緒空閒時執行：優先使用 requestIdleCallback，否則使用 setTimeout
// - 提供立即觸發與去抖觸發兩種形式

import { useCallback, useRef } from 'react';

/**
 * useGuardedRefresh
 * @param {Object} opts
 * @param {Function} opts.refreshFn 實際刷新函數（可同步或回傳 Promise）
 * @param {import('react').MutableRefObject<number>} opts.suppressUntilRef 抑制到期時間（ms timestamp）
 * @param {import('react').MutableRefObject<number>=} opts.lastUserInputRef 最近使用者互動時間（ms timestamp）
 * @param {number=} opts.userActiveWindowMs 視為活躍之時間窗（預設 1000ms）
 * @param {number=} opts.idleDelayMs 無 requestIdleCallback 時的延遲（預設 80ms）
 * @param {boolean=} opts.preferImmediate 若為 true，繞過 requestIdleCallback，改用 setTimeout(0)
 * @returns {{ guardedRefresh: ()=>void, scheduleGuardedRefresh: (delayMs?:number)=>void, cancelScheduled: ()=>void }}
 */
export default function useGuardedRefresh({
  refreshFn,
  suppressUntilRef,
  lastUserInputRef,
  userActiveWindowMs = 1000,
  idleDelayMs = 80,
  preferImmediate = false,
} = {}) {
  const timerRef = useRef(0);

  const run = useCallback(() => {
    const now = Date.now();
    const remain = Math.max(0, (suppressUntilRef?.current || 0) - now);
    if (remain > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => {
          timerRef.current = 0;
          run();
        },
        Math.min(remain + 30, 1200)
      );
      return;
    }
    const active = lastUserInputRef
      ? now - (lastUserInputRef.current || 0) < userActiveWindowMs
      : false;
    if (active) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = 0;
        run();
      }, 250);
      return;
    }
    try {
      if (!preferImmediate && typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        // @ts-ignore
        window.requestIdleCallback(() => {
          try {
            const r = refreshFn && refreshFn();
            if (r && typeof r.then === 'function') r.catch?.(() => {});
          } catch (_) {}
        });
      } else {
        timerRef.current = setTimeout(
          () => {
            timerRef.current = 0;
            try {
              const r = refreshFn && refreshFn();
              if (r && typeof r.then === 'function') r.catch?.(() => {});
            } catch (_) {}
          },
          Math.max(0, idleDelayMs)
        );
      }
    } catch (_) {}
  }, [
    idleDelayMs,
    refreshFn,
    lastUserInputRef,
    suppressUntilRef,
    userActiveWindowMs,
    preferImmediate,
  ]);

  const cancelScheduled = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = 0;
    }
  }, []);

  // 立即觸發一次（仍受門閘與活躍窗口影響）
  const guardedRefresh = useCallback(() => {
    cancelScheduled();
    // 盡快嘗試執行一次（0ms），在 run() 內部再決定是否延後
    timerRef.current = setTimeout(() => {
      timerRef.current = 0;
      run();
    }, 0);
  }, [cancelScheduled, run]);

  // 去抖後觸發（整合多事件）
  const scheduleGuardedRefresh = useCallback(
    (delayMs = 150) => {
      cancelScheduled();
      timerRef.current = setTimeout(
        () => {
          timerRef.current = 0;
          run();
        },
        Math.max(0, delayMs)
      );
    },
    [cancelScheduled, run]
  );

  return { guardedRefresh, scheduleGuardedRefresh, cancelScheduled };
}
