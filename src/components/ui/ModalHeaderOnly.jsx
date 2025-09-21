import React, { useEffect, useRef, useState } from 'react';
import '../DirectoryManager.css';

/**
 * ModalHeaderOnly
 * - 僅標題欄（無 footer）的通用彈窗容器
 * - 使用既有的 .modal-* 樣式與動畫（來源：DirectoryManager.css）
 *
 * Props
 * - isOpen: boolean
 * - title: ReactNode
 * - size?: 'sm'|'md'|'lg' (default: 'md')
 * - onClose: () => void
 * - closeOnOverlay?: boolean (default: true)
 * - allowCloseButton?: boolean (default: true)
 * - className?: string (附加到 .modal-content)
 * - bodyClassName?: string (附加到 .modal-body)
 * - headerExtra?: ReactNode (標題列右側附加區域)
 * - initialFocusRef?: Ref (開啟時自動聚焦)
 */
export default function ModalHeaderOnly({
  isOpen,
  title,
  size = 'md',
  onClose,
  closeOnOverlay = true,
  allowCloseButton = true,
  className = '',
  bodyClassName = '',
  headerExtra = null,
  initialFocusRef = null,
  zIndex = 10000,
  children,
}) {
  const [isClosing, setIsClosing] = useState(false);
  const contentRef = useRef(null);

  // 重置關閉狀態
  useEffect(() => {
    if (isOpen) setIsClosing(false);
  }, [isOpen]);

  // ESC 關閉
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') startClose();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [isOpen]);

  // 進場後自動聚焦
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      if (initialFocusRef && initialFocusRef.current && initialFocusRef.current.focus) {
        try {
          initialFocusRef.current.focus();
        } catch {}
      }
    }, 0);
    return () => clearTimeout(t);
  }, [isOpen, initialFocusRef]);

  // 全域：標記「任一彈窗開啟/關閉動畫中」狀態，用於全域禁用 FAB 等
  useEffect(() => {
    const active = !!(isOpen || isClosing);
    if (active) {
      try {
        window.__modalOverlayCount = (window.__modalOverlayCount || 0) + 1;
      } catch {}
    }
    const updateBodyClass = () => {
      const cnt = window.__modalOverlayCount || 0;
      if (cnt > 0) document.body.classList.add('any-modal-open');
      else document.body.classList.remove('any-modal-open');
    };
    updateBodyClass();
    return () => {
      try {
        if (active) window.__modalOverlayCount = Math.max(0, (window.__modalOverlayCount || 0) - 1);
      } catch {}
      updateBodyClass();
    };
  }, [isOpen, isClosing]);

  // 若正在關閉且這是最後一個彈窗，提前觸發 FAB 的漸出效果
  useEffect(() => {
    const count = window.__modalOverlayCount || 0;
    if (isClosing && count === 1) {
      document.body.classList.add('modal-fading-out');
    } else if (!isClosing && count > 0) {
      document.body.classList.remove('modal-fading-out');
    }
    return () => {
      const remaining = window.__modalOverlayCount || 0;
      if (remaining === 0) document.body.classList.remove('modal-fading-out');
    };
  }, [isClosing]);

  if (!isOpen && !isClosing) return null;

  const startClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => onClose && onClose(), 240);
  };

  const sizeClass = size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : 'modal-md';

  return (
    <div
      className={`modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={closeOnOverlay ? startClose : undefined}
      style={{ zIndex }}
    >
      <div
        className={`modal-content directory-manager ${sizeClass} ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        ref={contentRef}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          {allowCloseButton && (
            <button className="modal-close-btn" onClick={startClose} aria-label="關閉">
              ×
            </button>
          )}
          {headerExtra}
        </div>
        <div className={`modal-body ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}
