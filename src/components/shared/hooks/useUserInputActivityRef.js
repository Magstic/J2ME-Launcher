// src/components/shared/hooks/useUserInputActivityRef.js
// 建立並維護 lastUserInputRef：監聽全域輸入事件（不觸發重渲染），供 useGuardedRefresh 判斷活躍狀態

import { useEffect, useRef } from 'react';

/**
 * useUserInputActivityRef
 * @param {Object} opts
 * @param {boolean=} opts.passive 事件監聽是否使用 passive，預設 true
 * @param {EventTarget=} opts.target 綁定目標（預設 window）
 * @returns {{ lastUserInputRef: import('react').MutableRefObject<number> }}
 */
export default function useUserInputActivityRef({ passive = true, target } = {}) {
  const lastUserInputRef = useRef(0);

  useEffect(() => {
    const tgt = target || (typeof window !== 'undefined' ? window : null);
    if (!tgt || typeof tgt.addEventListener !== 'function') return;

    const mark = () => {
      lastUserInputRef.current = Date.now();
    };
    const opts = { passive };

    const add = (el, type) => {
      try {
        el.addEventListener(type, mark, opts);
      } catch (_) {}
    };
    const remove = (el, type) => {
      try {
        el.removeEventListener(type, mark, opts);
      } catch (_) {}
    };

    const events = ['wheel', 'touchstart', 'touchmove', 'keydown', 'mousedown', 'pointerdown'];

    for (const e of events) add(tgt, e);

    // 附加在 document 上，覆蓋某些鍵盤/觸控情境
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc && doc !== tgt) {
      for (const e of events) add(doc, e);
    }

    return () => {
      for (const e of events) remove(tgt, e);
      if (doc && doc !== tgt) {
        for (const e of events) remove(doc, e);
      }
    };
  }, [target, passive]);

  return { lastUserInputRef };
}
