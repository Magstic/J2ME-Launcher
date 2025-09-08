// Shared DOM utilities for scroll behavior
// - getScrollParent: find the nearest scrollable ancestor with overflow-y auto/scroll

export function getScrollParent(node) {
  if (!node) return null;
  let el = node.parentElement;
  while (el) {
    try {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      const canScroll = (overflowY === 'auto' || overflowY === 'scroll');
      if (canScroll && el.scrollHeight > el.clientHeight) return el;
    } catch (_) {}
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}
