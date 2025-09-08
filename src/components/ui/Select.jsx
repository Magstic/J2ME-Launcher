import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getScrollParent } from '@/utils/dom/scroll';
import useWheelTouchLock from '@shared/hooks/useWheelTouchLock';
import './Select.css';

// Global event name to coordinate multiple Select instances
const SELECT_OPEN_EVENT = 'ui-select-open';
let __selectIdSeed = 1;

/**
 * Select (Custom dropdown)
 * Props:
 * - options: Array<{ value: string|number, label: string }>
 * - value: string|number|null
 * - onChange: (value) => void
 * - placeholder?: string
 * - disabled?: boolean
 * - className?: string
 * - size?: 'sm'|'md'|'lg' (default 'md')
 */
export default function Select({
  options = [],
  value = null,
  onChange,
  placeholder = '請選擇',
  disabled = false,
  className = '',
  size = 'md',
}) {
  const idRef = useRef(__selectIdSeed++);
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  // 平滑滾動控制（避免彈出時「硬滾動」）
  const smoothingRef = useRef(false);
  const smoothRafRef = useRef(0);
  const smoothTimerRef = useRef(0);

  // getScrollParent 已抽象至 '@/utils/dom/scroll'

  // 在開啟期間鎖定滾輪/觸摸滾動到下拉列表內部，避免頁面滾動
  useWheelTouchLock({ enabled: (open || isClosing), insideRef: listRef });

  // 以時間函數執行平滑滾動
  const animateScrollBy = (el, delta, duration = 200) => {
    if (!el || !Number.isFinite(delta) || Math.abs(delta) < 0.5) return Promise.resolve();
    return new Promise((resolve) => {
      const start = (el === document.scrollingElement || el === document.documentElement) ? (window.pageYOffset || el.scrollTop) : el.scrollTop;
      const target = start + delta;
      const t0 = performance.now();
      smoothingRef.current = true;
      const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const y = start + (target - start) * ease(p);
        const prevBehavior = el.style && el.style.scrollBehavior;
        if (el.style) el.style.scrollBehavior = 'auto'; // 關閉原生行為避免疊加
        if (el === document.scrollingElement || el === document.documentElement) {
          window.scrollTo(0, y);
        } else {
          el.scrollTop = y;
        }
        if (el.style) el.style.scrollBehavior = prevBehavior || '';
        if (p < 1) {
          smoothRafRef.current = requestAnimationFrame(tick);
        } else {
          smoothingRef.current = false;
          resolve();
        }
      };
      smoothRafRef.current = requestAnimationFrame(tick);
      // 安全超時保護
      smoothTimerRef.current = window.setTimeout(() => {
        if (smoothingRef.current) {
          cancelAnimationFrame(smoothRafRef.current);
          smoothingRef.current = false;
          resolve();
        }
      }, duration + 80);
    });
  };

  // 開啟前檢查可視區，若下方空間不足，先行平滑捲動以容納彈出列表高度
  const smoothEnsureVisibleBeforeOpen = async () => {
    try {
      const btn = buttonRef.current;
      if (!btn) return;
      const scrollEl = getScrollParent(btn);
      if (!scrollEl) return;
      const btnRect = btn.getBoundingClientRect();
      const containerRect = scrollEl.getBoundingClientRect();
      // 預估下拉清單高度（與 CSS max-height 對齊），留出一些邊距
      const desired = 240; // 與 .select-list max-height 對應
      const margin = 8;
      const spaceBelow = (containerRect.top + scrollEl.clientHeight) - btnRect.bottom;
      // 僅向下彈出：若空間不足，平滑滾動容器以騰出空間（非阻塞）
      const need = desired + margin - spaceBelow;
      if (need > 0) {
        animateScrollBy(scrollEl, need, 200);
      }
    } catch {}
  };

  const closeWithAnimation = () => {
    if (!open || isClosing) return;
    // 若正在平滑滾動，先行取消，避免關閉瞬間的殘餘位移造成抖動
    try {
      if (smoothingRef.current) {
        cancelAnimationFrame(smoothRafRef.current);
        window.clearTimeout(smoothTimerRef.current);
        smoothingRef.current = false;
      }
    } catch {}
    setIsClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
    }, 120);
  };

  const selected = useMemo(() => options.find(o => String(o.value) === String(value)) || null, [options, value]);

  // Listen for other Selects opening; if another opens, close this one gracefully
  useEffect(() => {
    const onAnySelectOpen = (e) => {
      const openingId = e?.detail?.openingId;
      if (openingId === idRef.current) return; // self
      if (open || isClosing) closeWithAnimation();
    };
    document.addEventListener(SELECT_OPEN_EVENT, onAnySelectOpen);
    return () => document.removeEventListener(SELECT_OPEN_EVENT, onAnySelectOpen);
  }, [open, isClosing]);

  useEffect(() => {
    if (!(open || isClosing)) return;
    const onDocClick = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) {
        closeWithAnimation();
      }
    };
    const onKeyDown = (e) => {
      if (!(open || isClosing)) return;
      if (e.key === 'Escape') { closeWithAnimation(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIndex(i => Math.min(options.length - 1, (i < 0 ? 0 : i + 1))); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIndex(i => Math.max(0, (i < 0 ? options.length - 1 : i - 1))); return; }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (highlightIndex >= 0 && options[highlightIndex]) {
          handleSelect(options[highlightIndex]);
        }
      }
    };
    document.addEventListener('pointerdown', onDocClick, true);
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', onDocClick, true);
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [open, isClosing, options, highlightIndex]);

  useEffect(() => {
    if (open) {
      // 初次開啟時將高亮設置為當前選中
      const idx = options.findIndex(o => String(o.value) === String(value));
      setHighlightIndex(idx >= 0 ? idx : -1);
      // 為避免列表獲得焦點時觸發原生「硬滾動」，延遲在平滑滾動之後再聚焦
      const delay = smoothingRef.current ? 160 : 0;
      const t = window.setTimeout(() => { listRef.current && listRef.current.focus(); }, delay);
      return () => window.clearTimeout(t);
    } else {
      // 關閉後把焦點還給按鈕
      // 延遲至關閉動畫結束後再聚焦，並避免聚焦引發的自動滾動
      const t = window.setTimeout(() => {
        const btn = buttonRef.current;
        if (!btn) return;
        try {
          btn.focus({ preventScroll: true });
        } catch {
          btn.focus();
        }
      }, 140);
      return () => window.clearTimeout(t);
    }
  }, [open, options, value]);

  const handleSelect = (opt) => {
    // 選擇項目前，先取消任何平滑滾動，避免與關閉動畫疊加造成抖動
    try {
      if (smoothingRef.current) {
        cancelAnimationFrame(smoothRafRef.current);
        window.clearTimeout(smoothTimerRef.current);
        smoothingRef.current = false;
      }
    } catch {}
    if (disabled) return;
    try { onChange && onChange(opt.value); } catch {}
    closeWithAnimation();
  };

  const displayLabel = selected ? selected.label : placeholder;
  const sizeClass = size === 'sm' ? 'select-sm' : size === 'lg' ? 'select-lg' : 'select-md';

  return (
    <div className={`select-root ${sizeClass} ${disabled ? 'is-disabled' : ''} ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`select-button ${selected ? 'has-value' : 'placeholder'}`}
        onClick={() => {
          if (disabled) return;
          if (open) {
            closeWithAnimation();
          } else {
            // Notify others to close
            try {
              const ev = new CustomEvent(SELECT_OPEN_EVENT, { detail: { openingId: idRef.current } });
              document.dispatchEvent(ev);
            } catch (_) {}
            // 立即開啟，下拉更俐落；同時非阻塞地平滑滾動確保可視空間
            setOpen(true);
            Promise.resolve().then(smoothEnsureVisibleBeforeOpen);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        ref={buttonRef}
        disabled={disabled}
      >
        <span className="select-label" title={selected ? selected.label : ''}>{displayLabel}</span>
        <span className={`select-caret ${open ? 'up' : 'down'}`}>▾</span>
      </button>

      {(open || isClosing) && (
        <div className={`select-popover ${isClosing ? 'closing' : ''}`}>
          <ul className="select-list" role="listbox" tabIndex={-1} ref={listRef}>
            {options.map((opt, idx) => (
              <li
                key={String(opt.value)}
                role="option"
                aria-selected={String(opt.value) === String(value)}
                className={`select-option ${highlightIndex === idx ? 'highlight' : ''} ${String(opt.value) === String(value) ? 'selected' : ''}`}
                onMouseEnter={() => setHighlightIndex(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(opt)}
                title={opt.label}
              >
                <span className="option-label">{opt.label}</span>
                {String(opt.value) === String(value) && <span className="option-check">✓</span>}
              </li>
            ))}
            {options.length === 0 && (
              <li className="select-empty">無可用選項</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
