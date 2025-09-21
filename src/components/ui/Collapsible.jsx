import React, { useState, useEffect, useRef } from 'react';
import { getScrollParent } from '@/utils/dom/scroll';

// Reusable collapsible container using existing .section, .section-header, .section-body, .caret styles
// Props:
// - title: ReactNode
// - open: boolean (controlled)
// - defaultOpen: boolean (uncontrolled fallback)
// - onToggle: () => void (required when controlled)
// - className: string
// - children: ReactNode
export default function Collapsible({
  title,
  open,
  defaultOpen = false,
  onToggle,
  className = '',
  children,
}) {
  const isControlled = typeof open === 'boolean';
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const bodyRef = useRef(null);
  const wrapperRef = useRef(null);
  const headerRef = useRef(null);
  const [maxH, setMaxH] = useState('0px');
  // For scroll jump neutralization
  const scrollElRef = useRef(null);
  const anchorTopRef = useRef(null);
  const prevScrollTopRef = useRef(null);
  const correctingRef = useRef(false);
  const rafIdRef = useRef(0);
  const stopTimerRef = useRef(0);

  // getScrollParent 已抽象至 '@/utils/dom/scroll'

  const captureAnchorBeforeToggle = () => {
    try {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const scrollEl = getScrollParent(wrapper);
      scrollElRef.current = scrollEl;
      anchorTopRef.current = wrapper.getBoundingClientRect().top;
      prevScrollTopRef.current = scrollEl ? scrollEl.scrollTop : null;
    } catch {}
  };

  useEffect(() => {
    if (isControlled) return; // uncontrolled only
    setInternalOpen(defaultOpen);
  }, [defaultOpen, isControlled]);

  const isOpen = isControlled ? open : internalOpen;

  const toggle = () => {
    // capture anchor before the DOM changes
    captureAnchorBeforeToggle();
    if (isControlled) {
      onToggle && onToggle();
    } else {
      setInternalOpen((v) => !v);
    }
  };

  // 計算展開高度以支援平滑過渡
  useEffect(() => {
    const content = bodyRef.current;
    const wrapper = wrapperRef.current;
    if (!content || !wrapper) return;
    const BUFFER = 24; // 進一步加大緩衝，避免字體下緣/陰影被裁切
    const WRAPPER_PADDING = 1; // 與樣式中的 padding-bottom 對應
    const calcHeight = () => {
      // 加上最後一個子節點的 margin-bottom，避免尾行被裁切
      let extra = 0;
      try {
        const last = content.lastElementChild;
        if (last) {
          const mb = parseFloat(getComputedStyle(last).marginBottom || '0');
          if (!Number.isNaN(mb)) extra = mb;
        }
      } catch {}
      return content.scrollHeight + BUFFER + extra + WRAPPER_PADDING;
    };
    if (isOpen) {
      setMaxH(calcHeight() + 'px');
    } else {
      setMaxH('0px');
    }

    // 監聽內容尺寸變化（如文字換行、提示出現/消失）並即時更新高度
    const ro = new ResizeObserver(() => {
      if (!isOpen) return;
      try {
        setMaxH(calcHeight() + 'px');
      } catch {}
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [isOpen, children]);

  // After open state changes, run a short correction loop during the transition
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const scrollEl = scrollElRef.current;
    const prevTop = anchorTopRef.current;
    if (!wrapper || !scrollEl || prevTop == null) return;

    correctingRef.current = true;
    const tick = () => {
      if (!correctingRef.current) return;
      try {
        const newTop = wrapper.getBoundingClientRect().top;
        let delta = newTop - prevTop;
        if (Number.isFinite(delta) && Math.abs(delta) > 0.5) {
          const prevBehavior = scrollEl.style.scrollBehavior;
          scrollEl.style.scrollBehavior = 'auto';
          scrollEl.scrollTop += delta;
          scrollEl.style.scrollBehavior = prevBehavior;
        }
      } finally {
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };
    // Start on next frame to allow transition begin
    rafIdRef.current = requestAnimationFrame(tick);

    const stop = () => {
      if (!correctingRef.current) return;
      correctingRef.current = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      // clear refs
      scrollElRef.current = null;
      anchorTopRef.current = null;
      prevScrollTopRef.current = null;
      wrapper.removeEventListener('transitionend', stop);
    };
    // Stop when the wrapper's max-height/opacity transition ends
    wrapper.addEventListener('transitionend', stop);
    // Safety stop in case transitionend doesn't fire
    stopTimerRef.current = window.setTimeout(stop, 300);

    return () => {
      // Cleanup if unmounted/changed mid-correction
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      wrapper.removeEventListener('transitionend', stop);
      correctingRef.current = false;
    };
  }, [isOpen]);

  return (
    <div
      className={`section ${className}`.trim()}
      onClick={toggle}
      style={{ overflowAnchor: 'none' }}
    >
      <div
        className="section-header"
        tabIndex={0}
        role="button"
        ref={headerRef}
        onMouseDown={(e) => {
          // Prevent default focus scroll on mousedown to avoid viewport jump
          e.preventDefault();
          e.stopPropagation();
          captureAnchorBeforeToggle();
          toggle();
        }}
        onClick={(e) => {
          // Avoid double-toggle when mousedown already toggled
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={isOpen}
      >
        <h3 className="section-title">{title}</h3>
        <span className={`caret ${isOpen ? 'open' : ''}`}>▶</span>
      </div>
      {/* 外包一層作為高度動畫容器，阻止點擊冒泡避免誤觸收合 */}
      <div
        ref={wrapperRef}
        style={{
          maxHeight: maxH,
          overflow: 'hidden',
          transition: 'max-height 220ms ease, opacity 220ms ease',
          willChange: 'max-height, opacity',
          opacity: isOpen ? 1 : 0,
          overflowAnchor: 'none', // 防止瀏覽器滾動錨點導致的上下跳動
          paddingBottom: 1,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={bodyRef} className="section-body">
          {children}
        </div>
      </div>
    </div>
  );
}
