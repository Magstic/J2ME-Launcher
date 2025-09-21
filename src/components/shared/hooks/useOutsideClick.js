import { useEffect } from 'react';

/**
 * useOutsideClick
 * Calls `onOutside` when a pointer/click occurs outside the given element.
 *
 * @param {React.RefObject<HTMLElement>} ref - target element ref
 * @param {() => void} onOutside - handler to run when clicking outside
 * @param {Object} [options]
 * @param {boolean} [options.capture=true] - use capture phase
 * @param {('pointerdown'|'mousedown'|'click')[]} [options.events=['pointerdown']]
 */
export default function useOutsideClick(ref, onOutside, options = {}) {
  const { capture = true, events = ['pointerdown'] } = options;

  useEffect(() => {
    if (!ref) return;
    const handler = (e) => {
      try {
        const el = ref.current;
        if (!el) return;
        const target = e.target;
        if (target && el.contains(target)) return; // inside
        onOutside && onOutside();
      } catch (_) {}
    };
    events.forEach((evt) => document.addEventListener(evt, handler, { capture }));
    return () => {
      events.forEach((evt) => document.removeEventListener(evt, handler, { capture }));
    };
  }, [
    ref,
    onOutside,
    capture,
    Array.isArray(options.events) ? options.events.join(',') : 'pointerdown',
  ]);
}
