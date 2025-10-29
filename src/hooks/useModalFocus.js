import { useCallback, useRef, useState } from 'react';

export function useModalFocus(modalRef) {
  const [activeIndex, setActiveIndex] = useState(0);
  const focusablesRef = useRef([]);

  const rebuildFocusables = useCallback(() => {
    try {
      const root = modalRef.current;
      if (!root) return;
      const raw = [
        ...Array.from(root.querySelectorAll('.modal-header .modal-close-btn')),
        ...Array.from(root.querySelectorAll('.modal-body .form-row select')),
        ...Array.from(root.querySelectorAll('.modal-body .form-row input')),
        ...Array.from(root.querySelectorAll('.modal-body .form-row button')),
        ...Array.from(root.querySelectorAll('.modal-body .radio-group label')),
        ...Array.from(root.querySelectorAll('.modal-body label.toggle-switch')),
        ...Array.from(root.querySelectorAll('.modal-body .section-header')),
        ...Array.from(root.querySelectorAll('.modal-footer button')),
      ];
      const list = raw.filter((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (el.tagName.toLowerCase() === 'input') {
          const type = el.getAttribute('type') || 'text';
          if (type === 'hidden') return false;
        }
        return true;
      });
      // 去重並保留原始順序
      const seen = new Set();
      const dedup = [];
      for (const el of list) {
        if (!seen.has(el)) {
          seen.add(el);
          dedup.push(el);
        }
      }
      focusablesRef.current = dedup;
      if (dedup.length && activeIndex >= dedup.length) setActiveIndex(dedup.length - 1);
    } catch {}
  }, [modalRef, activeIndex]);

  const focusAt = useCallback((idx) => {
    const list = focusablesRef.current;
    if (!list || !list.length) return;
    const clamped = Math.max(0, Math.min(idx, list.length - 1));
    setActiveIndex(clamped);
    try {
      const el = list[clamped];
      el.focus();
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } catch {}
  }, []);

  const focusFirstPreferred = useCallback(() => {
    const list = focusablesRef.current;
    if (!list || !list.length) return;
    let idx = list.findIndex((el) => el.tagName?.toLowerCase() === 'select');
    if (idx < 0)
      idx = list.findIndex((el) => el.tagName?.toLowerCase() === 'input' && !el.readOnly);
    if (idx < 0) idx = list.findIndex((el) => !el.classList.contains('modal-close-btn'));
    if (idx < 0) idx = 0;
    setActiveIndex(idx);
    try {
      list[idx].focus();
    } catch {}
  }, []);

  return {
    activeIndex,
    setActiveIndex,
    focusablesRef,
    rebuildFocusables,
    focusAt,
    focusFirstPreferred,
  };
}
