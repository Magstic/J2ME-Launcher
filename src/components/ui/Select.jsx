import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [portalPos, setPortalPos] = useState(null); // { left, top?, bottom?, width, maxHeight, dropUp }
  const [inDialog, setInDialog] = useState(false);
  const [portalZ, setPortalZ] = useState(11000);
  // 平滑滾動控制（避免彈出時「硬滾動」）
  const smoothingRef = useRef(false);
  const smoothRafRef = useRef(0);
  const smoothTimerRef = useRef(0);

  // getScrollParent 已抽象至 '@/utils/dom/scroll'

  // 在開啟期間鎖定滾輪/觸摸滾動到下拉列表內部，避免頁面滾動
  useWheelTouchLock({ enabled: open || isClosing, insideRef: listRef });

  // 以時間函數執行平滑滾動
  const animateScrollBy = (el, delta, duration = 200) => {
    if (!el || !Number.isFinite(delta) || Math.abs(delta) < 0.5) return Promise.resolve();
    return new Promise((resolve) => {
      const start =
        el === document.scrollingElement || el === document.documentElement
          ? window.pageYOffset || el.scrollTop
          : el.scrollTop;
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

  // 計算當前應用中應使用的浮層 z-index：
  // 使其永遠高於最頂層的 modal-overlay，避免被遮擋（資料夾視窗內的彈窗 z-index 可能更高）。
  const computePortalZIndex = () => {
    let base = 11000;
    try {
      const overlays = Array.from(document.querySelectorAll('.modal-overlay'));
      let maxZ = base;
      for (const el of overlays) {
        const style = window.getComputedStyle(el);
        const z = parseInt(style.zIndex || '0', 10);
        if (!Number.isNaN(z)) maxZ = Math.max(maxZ, z);
      }
      return maxZ + 2; // 確保高於 overlay 本身與其內容
    } catch (_) {
      return base;
    }
  };

  // 計算浮層在視窗中的定位（使用 portal/fixed，不再嘗試滾動父容器）
  const computePortalPosition = () => {
    const btn = buttonRef.current;
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const margin = 6;
    const desired = 240; // 與 .select-list max-height 對齊
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const dropUp = spaceBelow < Math.min(180, desired) && spaceAbove > spaceBelow; // 偏好向上
    const maxHeight = Math.max(120, Math.min(desired, dropUp ? spaceAbove : spaceBelow));
    const pos = {
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      maxHeight,
      dropUp,
    };
    if (dropUp) pos.bottom = Math.round(window.innerHeight - rect.top + margin);
    else pos.top = Math.round(rect.bottom + margin);
    return pos;
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

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  );

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
      const root = rootRef.current;
      const list = listRef.current;
      if (!root) return;
      // 如果點擊發生在按鈕或彈出列表內，忽略（不關閉）
      if ((root && root.contains(e.target)) || (list && list.contains(e.target))) return;
      closeWithAnimation();
    };
    // 開啟期間：任何滾動/縮放視窗都關閉浮層，避免定位錯位
    const onAnyScroll = (e) => {
      // 忽略來自自身列表的滾動事件，允許在下拉內部滾動
      if (listRef.current && e && e.target && listRef.current.contains(e.target)) return;
      closeWithAnimation();
    };
    const onResize = () => closeWithAnimation();
    const onKeyDown = (e) => {
      if (!(open || isClosing)) return;
      if (e.key === 'Escape') {
        closeWithAnimation();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(options.length - 1, i < 0 ? 0 : i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(0, i < 0 ? options.length - 1 : i - 1));
        return;
      }
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
    window.addEventListener('resize', onResize, { passive: true });
    // 捕獲階段監聽，以覆蓋各層滾動
    document.addEventListener('scroll', onAnyScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDocClick, true);
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('resize', onResize, { passive: true });
      document.removeEventListener('scroll', onAnyScroll, true);
    };
  }, [open, isClosing, options, highlightIndex]);

  useEffect(() => {
    if (open) {
      // 初次開啟時將高亮設置為當前選中
      const idx = options.findIndex((o) => String(o.value) === String(value));
      setHighlightIndex(idx >= 0 ? idx : -1);
      // 計算 portal 定位並聚焦列表（不再平滑滾動父容器）
      setPortalPos(computePortalPosition());
      setPortalZ(computePortalZIndex());
      // 標記是否位於對話框內（影響 popover 主題代幣）
      try {
        setInDialog(!!(rootRef.current && rootRef.current.closest('.modal-body')));
      } catch (_) {
        setInDialog(false);
      }
      const t = window.setTimeout(() => {
        if (listRef.current) {
          try {
            listRef.current.focus({ preventScroll: true });
          } catch {
            // 後備：舊環境不支援 preventScroll 時退回普通 focus
            try {
              listRef.current.focus();
            } catch {}
          }
        }
      }, 0);
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
    try {
      onChange && onChange(opt.value);
    } catch {}
    closeWithAnimation();
  };

  const displayLabel = selected ? selected.label : placeholder;
  const sizeClass = size === 'sm' ? 'select-sm' : size === 'lg' ? 'select-lg' : 'select-md';

  return (
    <div
      className={`select-root ${sizeClass} ${disabled ? 'is-disabled' : ''} ${className}`}
      ref={rootRef}
    >
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
              const ev = new CustomEvent(SELECT_OPEN_EVENT, {
                detail: { openingId: idRef.current },
              });
              document.dispatchEvent(ev);
            } catch (_) {}
            // 立即開啟（使用 portal 固定定位，不再滾動父容器）
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        ref={buttonRef}
        disabled={disabled}
      >
        <span className="select-label" title={selected ? selected.label : ''}>
          {displayLabel}
        </span>
        <span className={`select-caret ${open ? 'up' : 'down'}`}>▾</span>
      </button>

      {(open || isClosing) &&
        portalPos &&
        createPortal(
          <div
            className={`select-popover ${portalPos.dropUp ? 'drop-up' : ''} ${isClosing ? 'closing' : ''} ${inDialog ? 'in-dialog' : ''}`}
            style={{
              position: 'fixed',
              left: portalPos.left,
              top: portalPos.top ?? undefined,
              bottom: portalPos.bottom ?? undefined,
              minWidth: portalPos.width,
              zIndex: portalZ,
            }}
          >
            <ul
              className="select-list"
              role="listbox"
              tabIndex={-1}
              ref={listRef}
              style={{ maxHeight: portalPos.maxHeight }}
            >
              {options.map((opt, idx) => (
                <li
                  key={String(opt.value)}
                  role="option"
                  aria-selected={String(opt.value) === String(value)}
                  className={`select-option ${highlightIndex === idx ? 'is-highlight' : ''} ${String(opt.value) === String(value) ? 'is-selected' : ''}`}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(opt)}
                  title={opt.label}
                >
                  <span className="option-label">{opt.label}</span>
                  {String(opt.value) === String(value) && <span className="option-check">✓</span>}
                </li>
              ))}
              {options.length === 0 && <li className="select-empty">無可用選項</li>}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
