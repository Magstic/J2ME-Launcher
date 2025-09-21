import { useEffect, useRef } from 'react';

/**
 * useWheelTouchLock
 * Locks document wheel/touch scrolling to a specific scrollable container
 * while an overlay/popover is open. Prevents page scroll outside the container
 * and blocks overscroll at the edges to avoid scroll chaining.
 *
 * @param {Object} params
 * @param {boolean} params.enabled - whether to enable the lock
 * @param {React.RefObject<HTMLElement>} params.insideRef - allowed scroll container
 */
export default function useWheelTouchLock({ enabled, insideRef }) {
  const lastTouchYRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const isInside = (target) => {
      const el = insideRef && insideRef.current;
      return !!(el && target && (el === target || el.contains(target)));
    };

    const handleWheel = (e) => {
      const list = insideRef && insideRef.current;
      if (!list) {
        e.preventDefault();
        return;
      }
      if (!isInside(e.target)) {
        // Wheel outside the popover while open: block page scroll
        e.preventDefault();
        return;
      }
      // Inside the list: only allow scrolling if not at edges in that direction
      const deltaY = e.deltaY;
      const atTop = list.scrollTop <= 0;
      const atBottom = Math.ceil(list.scrollTop + list.clientHeight) >= list.scrollHeight;
      if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
        e.preventDefault();
      }
    };

    const handleTouchStart = (e) => {
      lastTouchYRef.current = e.touches && e.touches.length ? e.touches[0].clientY : 0;
    };

    const handleTouchMove = (e) => {
      const list = insideRef && insideRef.current;
      const currentY = e.touches && e.touches.length ? e.touches[0].clientY : 0;
      const deltaY = lastTouchYRef.current - currentY;
      lastTouchYRef.current = currentY;
      if (!list) {
        e.preventDefault();
        return;
      }
      if (!isInside(e.target)) {
        e.preventDefault();
        return;
      }
      const atTop = list.scrollTop <= 0;
      const atBottom = Math.ceil(list.scrollTop + list.clientHeight) >= list.scrollHeight;
      if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
        e.preventDefault();
      }
    };

    // Use non-passive listeners to allow preventDefault
    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      document.removeEventListener('wheel', handleWheel, { passive: false });
      document.removeEventListener('touchstart', handleTouchStart, { passive: false });
      document.removeEventListener('touchmove', handleTouchMove, { passive: false });
    };
  }, [enabled, insideRef]);
}
