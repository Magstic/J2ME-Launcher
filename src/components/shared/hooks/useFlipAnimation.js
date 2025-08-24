import { useLayoutEffect, useRef } from 'react';

/**
 * Smoothly animates moved items inside a container using the FLIP technique.
 * Requirements:
 * - Each animatable child must have a [data-flip-key] attribute with a stable ID.
 * - Provide an ordered array of keys that represent current render order.
 *
 * Options:
 * - disabled: boolean to disable animations (e.g., while dragging/box-selecting)
 * - duration: ms (default 180)
 * - easing: CSS timing function (default 'ease-out')
 */
export default function useFlipAnimation(containerRef, keys, options = {}) {
  const { disabled = false, duration = 180, easing = 'ease-out', fadeOpacity = false, fadeFrom = 0.6 } = options;
  const prevRectsRef = useRef(new Map());
  const mountedRef = useRef(false);
  const getScrollParent = (el) => {
    let node = el?.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const isScrollable = /(auto|scroll)/.test(overflowY) || /(auto|scroll)/.test(overflowX);
      if (isScrollable) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  // 生成穩定的依賴簽名，避免展開 keys 導致依賴長度在各次渲染間變化
  const keysSignature = Array.isArray(keys) ? keys.join('||') : String(keys ?? '');
  const allowedKeys = Array.isArray(keys) ? new Set(keys) : null;

  useLayoutEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    const scrollParent = getScrollParent(container);
    const prevScrollTop = scrollParent.scrollTop;
    const prevScrollLeft = scrollParent.scrollLeft;

    // Collect current rects
    const elements = Array.from(container.querySelectorAll('[data-flip-key]'));
    const currentRects = new Map();
    for (const el of elements) {
      const key = el.getAttribute('data-flip-key');
      if (!key) continue;
      currentRects.set(key, { el, rect: el.getBoundingClientRect() });
    }

    if (!mountedRef.current) {
      // First pass: record rects and ensure scroll is preserved to avoid initial jump
      prevRectsRef.current = new Map(
        Array.from(currentRects.entries()).map(([k, v]) => [k, v.rect])
      );
      mountedRef.current = true;
      // Restore captured scroll immediately
      if (scrollParent.scrollTop !== prevScrollTop) scrollParent.scrollTop = prevScrollTop;
      if (scrollParent.scrollLeft !== prevScrollLeft) scrollParent.scrollLeft = prevScrollLeft;
      return;
    }

    if (!disabled) {
      // For keys present in both previous and current, animate position deltas
      for (const [key, { el, rect: last }] of currentRects.entries()) {
        // Respect provided keys whitelist
        if (allowedKeys && !allowedKeys.has(key)) continue;
        const first = prevRectsRef.current.get(key);
        if (!first) continue;
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        if (dx !== 0 || dy !== 0) {
          try {
            const frames = fadeOpacity
              ? [
                  { transform: `translate(${dx}px, ${dy}px)`, opacity: fadeFrom },
                  { transform: 'translate(0, 0)', opacity: 1 }
                ]
              : [
                  { transform: `translate(${dx}px, ${dy}px)` },
                  { transform: 'translate(0, 0)' }
                ];
            el.animate(frames, { duration, easing });
          } catch {
            // Fallback if Web Animations API not available
            el.style.transition = fadeOpacity
              ? `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`
              : `transform ${duration}ms ${easing}`;
            if (fadeOpacity) el.style.opacity = String(fadeFrom);
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            requestAnimationFrame(() => {
              el.style.transform = 'translate(0, 0)';
              if (fadeOpacity) el.style.opacity = '1';
              setTimeout(() => { el.style.transition = ''; }, duration);
            });
          }
        } else if (fadeOpacity) {
          // No displacement but still apply a gentle opacity pulse for clarity
          try {
            el.animate(
              [ { opacity: fadeFrom }, { opacity: 1 } ],
              { duration, easing }
            );
          } catch {
            el.style.transition = `opacity ${duration}ms ${easing}`;
            el.style.opacity = String(fadeFrom);
            requestAnimationFrame(() => {
              el.style.opacity = '1';
              setTimeout(() => { el.style.transition = ''; }, duration);
            });
          }
        }
      }
    }

    // Update previous rects
    prevRectsRef.current = new Map(
      Array.from(currentRects.entries()).map(([k, v]) => [k, v.rect])
    );

    // Restore scroll to avoid jump if layout shifted
    if (scrollParent.scrollTop !== prevScrollTop) {
      scrollParent.scrollTop = prevScrollTop;
    }
    if (scrollParent.scrollLeft !== prevScrollLeft) {
      scrollParent.scrollLeft = prevScrollLeft;
    }
  }, [containerRef, disabled, duration, easing, keysSignature]);
}
