import React, { useEffect, useRef, useState } from 'react';
import '../DirectoryManager.css';

/**
 * ModalWithFooter
 * - 帶標題欄 + 底欄的通用彈窗容器
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
 * - footer?: ReactNode (完全自訂底欄，若提供則忽略 actions)
 * - actions?: Array<{ key, label, variant?: 'primary'|'secondary'|'warning'|'danger', onClick?, disabled?, autoFocus?, allowFocusRing? }>
 */
export default function ModalWithFooter({
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
  contentRef: contentRefProp = null,
  requestCloseRef = null,
  footer = null,
  actions = [],
  children,
}) {
  const [isClosing, setIsClosing] = useState(false);
  const internalRef = useRef(null);
  const contentRef = contentRefProp || internalRef;
  const bodyRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // 重置關閉狀態
  useEffect(() => { if (isOpen) setIsClosing(false); }, [isOpen]);

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
        try { initialFocusRef.current.focus({ preventScroll: true }); } catch {}
      } else {
        // 若無指定，嘗試聚焦第一個可聚焦的 action
        const firstAuto = contentRef.current?.querySelector('.modal-footer .btn:not([disabled])');
        if (firstAuto && firstAuto.focus) { try { firstAuto.focus({ preventScroll: true }); } catch {} }
      }
    }, 0);
    return () => clearTimeout(t);
  }, [isOpen, initialFocusRef]);

  // 全域：標記「任一彈窗開啟/關閉動畫中」狀態，用於全域禁用 FAB 等
  useEffect(() => {
    const active = !!(isOpen || isClosing);
    if (active) {
      try { window.__modalOverlayCount = (window.__modalOverlayCount || 0) + 1; } catch {}
    }
    const updateBodyClass = () => {
      const cnt = (window.__modalOverlayCount || 0);
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
    const count = (window.__modalOverlayCount || 0);
    if (isClosing && count === 1) {
      document.body.classList.add('modal-fading-out');
    } else if (!isClosing && count > 0) {
      // 若重新開啟或仍有彈窗，移除提前漸出標記
      document.body.classList.remove('modal-fading-out');
    }
    return () => {
      // 在卸載或狀態變更時清理：當沒有任何彈窗時移除標記
      const remaining = (window.__modalOverlayCount || 0);
      if (remaining === 0) document.body.classList.remove('modal-fading-out');
    };
  }, [isClosing]);

  // 記憶和恢復滾動位置：當內部內容因摺疊/展開導致 DOM 變更時，保持當前視口位置
  useEffect(() => {
    const el = bodyRef.current;
    if (!isOpen || !el) return;

    const onScroll = () => { lastScrollTopRef.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });

    const observer = new MutationObserver(() => {
      const st = lastScrollTopRef.current;
      // 下一幀恢復，避免布局抖動
      requestAnimationFrame(() => {
        try { if (Math.abs(el.scrollTop - st) > 1) el.scrollTop = st; } catch {}
      });
    });
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [isOpen]);

  // 全域：彈窗開啟時禁用 FAB；拖拽選取時暫時禁用 FAB
  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove('fab-disabled');
      document.body.classList.remove('fab-dragging');
      return;
    }
    document.body.classList.add('fab-disabled');

    const host = contentRef.current || bodyRef.current;
    if (!host) return () => { document.body.classList.remove('fab-disabled'); document.body.classList.remove('fab-dragging'); };
    const onDown = () => document.body.classList.add('fab-dragging');
    const clearDrag = () => document.body.classList.remove('fab-dragging');
    host.addEventListener('mousedown', onDown);
    host.addEventListener('mouseup', clearDrag);
    host.addEventListener('mouseleave', clearDrag);
    return () => {
      host.removeEventListener('mousedown', onDown);
      host.removeEventListener('mouseup', clearDrag);
      host.removeEventListener('mouseleave', clearDrag);
      document.body.classList.remove('fab-disabled');
      document.body.classList.remove('fab-dragging');
    };
  }, [isOpen, contentRef]);

  const startClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      // 通知父層關閉（通常會把 isOpen 設為 false）
      if (onClose) onClose();
      // 在動畫結束後重置關閉狀態，讓組件能夠卸載
      if (isMountedRef.current) setIsClosing(false);
    }, 240);
  };

  // 將動畫關閉方法暴露給父層（可選）
  useEffect(() => {
    if (requestCloseRef) {
      requestCloseRef.current = startClose;
      return () => { requestCloseRef.current = null; };
    }
  }, [requestCloseRef, isClosing]);

  // 僅對「帶按鈕的彈窗」套用固定尺寸（如 75%），純資訊/無按鈕彈窗維持自然高度
  const hasActionButtons = !!footer || (actions && actions.length > 0);
  const sizeClass = hasActionButtons
    ? (size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : 'modal-md')
    : '';

  const renderActions = () => {
    if (footer) return footer;
    if (!actions || actions.length === 0) return null;
    const mapVariant = (v) => {
      if (v === 'secondary') return 'btn btn-secondary';
      if (v === 'warning') return 'btn btn-warning';
      if (v === 'danger') return 'btn btn-danger';
      return 'btn btn-primary';
    };
    return (
      <div className="flex gap-8">
        {actions.map((a) => (
          <button
            key={a.key}
            className={`${mapVariant(a.variant)} ${a.allowFocusRing ? 'allow-focus-ring' : ''}`}
            onClick={a.onClick}
            disabled={!!a.disabled}
            autoFocus={!!a.autoFocus}
          >
            {a.label}
          </button>
        ))}
      </div>
    );
  };

  // 將早期返回移到所有 hooks 之後，避免在部分渲染中少呼叫 hooks 造成順序變更
  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={(!isClosing && closeOnOverlay) ? startClose : undefined}
    >
      <div
        className={`modal-content directory-manager ${hasActionButtons ? 'has-actions' : 'no-actions'} ${sizeClass} ${className} ${isClosing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        ref={contentRef}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          {allowCloseButton && (
            <button className="modal-close-btn" onClick={startClose} aria-label="關閉">×</button>
          )}
          {headerExtra}
        </div>
        <div className={`modal-body ${bodyClassName}`} ref={bodyRef}>
          {children}
        </div>
        {hasActionButtons && (
          <div className="modal-footer">
            {footer
              ? (
                // 若提供自訂 footer，直接渲染，由外部決定左右佈局
                footer
              ) : (
                // 預設動作：僅右側按鈕（不再保留左側佔位）
                <div className="push-right">
                  {renderActions()}
                </div>
              )
            }
          </div>
        )}
      </div>
    </div>
  );
}
