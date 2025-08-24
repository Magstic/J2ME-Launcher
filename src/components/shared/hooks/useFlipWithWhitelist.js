// FLIP 包裝：基於現有 useFlipAnimation，增加白名單與參數統一
import React from 'react';
import useFlipAnimation from './useFlipAnimation';
import { FLIP_DURATION, FLIP_EASING } from '@config/perf';

/**
 * useFlipWithWhitelist
 * @param {Object} params
 * @param {React.RefObject<HTMLElement>} params.containerRef
 * @param {string[]} params.keys - 完整鍵集合（與 data-flip-key 對應）
 * @param {boolean} params.disabled
 * @param {Set<string>=} params.whitelist - 允許執行 FLIP 的子集（未命中者直接落位）
 * @param {number=} params.duration
 * @param {string=} params.easing
 */
export default function useFlipWithWhitelist({
  containerRef,
  keys,
  disabled,
  whitelist,
  duration = FLIP_DURATION,
  easing = FLIP_EASING,
  fadeOpacity = false,
  fadeFrom = 0.6,
}) {
  const filteredKeys = React.useMemo(() => {
    if (disabled) return [];
    if (!whitelist) return keys || [];
    const wl = whitelist;
    return (keys || []).filter(k => wl.has(k));
  }, [disabled, keys, whitelist]);

  useFlipAnimation(containerRef, filteredKeys, {
    disabled,
    duration,
    easing,
    fadeOpacity,
    fadeFrom,
  });
}
