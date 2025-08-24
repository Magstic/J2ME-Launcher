// 框選 Hook（支持外控/內控），完整移植現有桌面/資料夾的優化：
// - 空白處啟動
// - 全域事件（mousemove/mouseup/mouseleave/pointercancel/visibilitychange 等）
// - rAF 節流計算矩形
// - 視窗邊界夾取 + 淡出到邊緣
// - 僅變更時才提交選中集合
import React from 'react';

/**
 * useSelectionBox
 * @param {Object} options
 * @param {React.RefObject<HTMLElement>} options.rootRef - 用於命中測試/查找卡片的容器
 * @param {boolean} options.controlled - 是否外控（父層提供 selection 狀態）。true=外控，false=內控
 * @param {(Set<string>)=>void=} options.onSelectedChange - 外控時，回傳新的 selectedSet
 * @param {Set<string>=} options.selectedSet - 外控時，當前選中集合
 * @param {(e: MouseEvent)=>boolean=} options.isBlankArea - 判斷是否點擊空白（預設: 無 .game-card/.folder-card/.context-menu）
 * @param {string=} options.hitSelector - 命中測試的選擇器（預設: '.game-card'）
 * @param {number=} options.fadeDuration - 淡出時長（預設 180ms）
 */
export default function useSelectionBox({
  rootRef,
  controlled = false,
  onSelectedChange,
  selectedSet,
  isBlankArea,
  hitSelector = '.game-card',
  fadeDuration = 180,
} = {}) {
  const [internalSelected, setInternalSelected] = React.useState(() => new Set());
  const selected = controlled ? (selectedSet || new Set()) : internalSelected;
  const setSelected = controlled ? (onSelectedChange || (() => {})) : setInternalSelected;
  const selectedRef = React.useRef(new Set());
  React.useEffect(() => { selectedRef.current = selected; }, [selected]);

  const [boxSelecting, setBoxSelecting] = React.useState(false);
  // Note: avoid using state for selectionRect to prevent rerenders per frame
  const [selectionRect, setSelectionRect] = React.useState(null); // kept for external consumers but not updated per-frame
  const [selectionFading, setSelectionFading] = React.useState(false);

  const startPointRef = React.useRef({ x: 0, y: 0 });
  const rafIdRef = React.useRef(0);
  const pendingPosRef = React.useRef(null);
  const isSelectingRef = React.useRef(false);
  // 點擊空白欲清空：延後到 mouseup 再執行，避免與 boxSelecting 同幀競爭
  const pendingClearRef = React.useRef(false);
  // 拖動是否超過閾值（用於 mouseup 決定是否提交選擇集）
  const didDragRef = React.useRef(false);
  const leftWindowRef = React.useRef(false);
  const fadeTimerRef = React.useRef(0);
  const selectionBoxRef = React.useRef(null);
  const lastSelRectRef = React.useRef({ left: 0, top: 0, width: 0, height: 0 });
  // Cache of selectables to avoid per-frame DOM reads
  const selectablesRef = React.useRef({
    items: [], // { fp, rect }
    rows: new Map(), // key:number => array of { fp, rect }
    rowKeys: [],
    bucket: 8,
  });
  const lastUpdateTsRef = React.useRef(0);
  const cacheBuiltRef = React.useRef(false);
  // 臨時選擇集（拖動期間不提交 React），以及 fp->element 對照表
  const ephemeralSelectedRef = React.useRef(new Set());
  const elementsByFpRef = React.useRef(new Map());
  const lastComputedRef = React.useRef(new Set());

  const defaultIsBlank = (e) => {
    const el = e.target;
    return !(el?.closest && el.closest('.game-card, .folder-card, .context-menu'));
  };

  const computeSelection = React.useCallback((pos) => {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const x1 = startPointRef.current.x;
    const y1 = startPointRef.current.y;
    const x2 = Math.max(0, Math.min(pos.x, viewportW - 1));
    const y2 = Math.max(0, Math.min(pos.y, viewportH - 1));
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    // update selection box style imperatively to avoid rerender
    lastSelRectRef.current = { left, top, width, height };
    const box = selectionBoxRef.current;
    if (box) {
      const style = box.style;
      style.left = `${left}px`;
      style.top = `${top}px`;
      style.width = `${width}px`;
      style.height = `${height}px`;
    }

    // Build cache lazily after surpassing small drag threshold (more sensitive)
    if (!cacheBuiltRef.current && Math.max(width, height) >= 2) {
      try {
        const cache = selectablesRef.current;
        cache.items = [];
        cache.rows = new Map();
        cache.rowKeys = [];
        const bucket = cache.bucket || 8;
        const container = rootRef?.current || document;
        const nodes = container?.querySelectorAll?.(hitSelector);
        if (nodes) {
          const map = elementsByFpRef.current; map.clear();
          nodes.forEach((node) => {
            const fp = node.getAttribute('data-filepath');
            if (!fp) return;
            const r = node.getBoundingClientRect();
            const rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
            cache.items.push({ fp, rect });
            map.set(fp, node);
            const minKey = Math.floor(rect.top / bucket) * bucket;
            const maxKey = Math.floor(rect.bottom / bucket) * bucket;
            for (let key = minKey; key <= maxKey; key += bucket) {
              if (!cache.rows.has(key)) cache.rows.set(key, []);
              cache.rows.get(key).push({ fp, rect });
            }
          });
          cache.rowKeys = Array.from(cache.rows.keys()).sort((a, b) => a - b);
        }
      } catch (_) {}
      cacheBuiltRef.current = true;
    }

    const rect = new DOMRect(left, top, width, height);
    const next = new Set();
    const cache = selectablesRef.current;
    if (cache && cache.rows && cache.rowKeys && cache.rowKeys.length) {
      const minKey = Math.floor(rect.top / cache.bucket) * cache.bucket;
      const maxKey = Math.floor(rect.bottom / cache.bucket) * cache.bucket;
      const keys = cache.rowKeys;
      // binary search for start
      let lo = 0, hi = keys.length - 1, start = keys.length, end = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (keys[mid] >= minKey) { start = mid; hi = mid - 1; } else { lo = mid + 1; }
      }
      // binary search for end
      lo = 0; hi = keys.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (keys[mid] <= maxKey) { end = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      if (start <= end && start < keys.length && end >= 0) {
        for (let i = start; i <= end; i++) {
          const key = keys[i];
          const arr = cache.rows.get(key);
          if (!arr) continue;
          for (let j = 0; j < arr.length; j++) {
            const { fp, rect: r } = arr[j];
            if (!(rect.right < r.left || rect.left > r.right || rect.bottom < r.top || rect.top > r.bottom)) {
              next.add(fp);
            }
          }
        }
      }
    }

    // Throttle selected updates to ~60fps
    const now = (performance.now ? performance.now() : Date.now());
    const since = now - (lastUpdateTsRef.current || 0);
    if (since < 16) return;
    lastUpdateTsRef.current = now;

    // 拖動期間僅以命令式 class 呈現，不提交 React 狀態
    lastComputedRef.current = next;
    applyEphemeralSelection(next);
  }, [hitSelector, rootRef]);

  const applyEphemeralSelection = React.useCallback((nextSet) => {
    const prev = ephemeralSelectedRef.current;
    // 差分：要移除的
    for (const fp of prev) {
      if (!nextSet.has(fp)) {
        const el = elementsByFpRef.current.get(fp);
        if (el) el.classList.remove('ephemeral-selected');
      }
    }
    // 要新增的
    for (const fp of nextSet) {
      if (!prev.has(fp)) {
        const el = elementsByFpRef.current.get(fp);
        if (el) el.classList.add('ephemeral-selected');
      }
    }
    ephemeralSelectedRef.current = new Set(nextSet);
  }, []);

  const clearEphemeralSelection = React.useCallback(() => {
    const prev = ephemeralSelectedRef.current;
    for (const fp of prev) {
      const el = elementsByFpRef.current.get(fp);
      if (el) el.classList.remove('ephemeral-selected');
    }
    ephemeralSelectedRef.current = new Set();
  }, []);

  const endSelection = React.useCallback((opts = { fadeToEdge: false }) => {
    isSelectingRef.current = false;
    setBoxSelecting(false);
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = 0; }
    if (opts.fadeToEdge) {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const last = pendingPosRef.current || { x: lastSelRectRef.current.left + lastSelRectRef.current.width, y: lastSelRectRef.current.top + lastSelRectRef.current.height };
      const edgeX = Math.max(0, Math.min(last.x, viewportW - 1));
      const edgeY = Math.max(0, Math.min(last.y, viewportH - 1));
      const x1 = startPointRef.current.x;
      const y1 = startPointRef.current.y;
      const left = Math.min(x1, edgeX);
      const top = Math.min(y1, edgeY);
      const width = Math.abs(edgeX - x1);
      const height = Math.abs(edgeY - y1);
      lastSelRectRef.current = { left, top, width, height };
      const box = selectionBoxRef.current;
      if (box) {
        const style = box.style;
        style.left = `${left}px`;
        style.top = `${top}px`;
        style.width = `${width}px`;
        style.height = `${height}px`;
      }
      setSelectionFading(true);
      fadeTimerRef.current = window.setTimeout(() => {
        setSelectionFading(false);
        fadeTimerRef.current = 0;
      }, fadeDuration);
    } else {
      setSelectionFading(false);
    }
    if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; }

    window.removeEventListener('mousemove', onGlobalMouseMove);
    window.removeEventListener('mouseup', onGlobalMouseUp);
    window.removeEventListener('mouseleave', onWindowLeft);
    window.removeEventListener('pointerleave', onWindowLeft);
    window.removeEventListener('pointerup', onGlobalMouseUp);
    window.removeEventListener('pointercancel', onGlobalCancel);
    window.removeEventListener('mouseenter', onWindowReenter, true);
    window.removeEventListener('blur', onWindowLeft);
    document.removeEventListener('mouseout', onDocumentMouseOut, true);
    document.removeEventListener('visibilitychange', onVisibilityChange, true);
    // clear cache
    cacheBuiltRef.current = false;
    const cache = selectablesRef.current; cache.items = []; cache.rows = new Map(); cache.rowKeys = [];
   
  }, [selectionRect, fadeDuration]);

  const onGlobalMouseMove = React.useCallback((e) => {
    if (!isSelectingRef.current) return;
    const w = window.innerWidth; const h = window.innerHeight;
    if (e.clientX < 0 || e.clientY < 0 || e.clientX >= w || e.clientY >= h) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
      return;
    }
    if (e.buttons === 0) { endSelection(); return; }
    // 僅當拖動超過閾值後才進入框選狀態與計算，並在那一刻才清空選中
    const dx = Math.abs(e.clientX - startPointRef.current.x);
    const dy = Math.abs(e.clientY - startPointRef.current.y);
    const exceeded = Math.max(dx, dy) >= 2;
    if (!exceeded) return;

    // 首次超過閾值：開啟框選並清空（若有待清空）
    if (!boxSelecting) {
      setBoxSelecting(true);
      setSelectionFading(false);
      if (pendingClearRef.current) {
        pendingClearRef.current = false;
        setSelected(new Set());
      }
      didDragRef.current = true;
    }

    pendingPosRef.current = { x: e.clientX, y: e.clientY };
    if (!rafIdRef.current) {
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = 0;
        if (pendingPosRef.current) computeSelection(pendingPosRef.current);
      });
    }
  }, [computeSelection, endSelection]);

  const onGlobalMouseUp = React.useCallback(() => {
    if (!isSelectingRef.current) return;
    // 若為單擊空白（未超過閾值），此時才進行清空，避免與 boxSelecting 同步造成卡頓
    if (pendingClearRef.current) {
      pendingClearRef.current = false;
      setSelected(new Set());
    } else if (didDragRef.current) {
      // 提交最後一次計算結果到 React 狀態
      setSelected(new Set(lastComputedRef.current));
    }
    // 清理臨時樣式
    clearEphemeralSelection();
    didDragRef.current = false;
    elementsByFpRef.current.clear();
    endSelection();
  }, [endSelection, setSelected, clearEphemeralSelection]);

  const onWindowLeft = React.useCallback(() => {
    if (!isSelectingRef.current) return;
    leftWindowRef.current = true;
    endSelection({ fadeToEdge: true });
  }, [endSelection]);

  const onWindowReenter = React.useCallback(() => {
    if (!leftWindowRef.current) return;
    leftWindowRef.current = false;
    endSelection();
  }, [endSelection]);

  const onGlobalCancel = React.useCallback(() => {
    if (!isSelectingRef.current) return;
    endSelection();
  }, [endSelection]);

  const onDocumentMouseOut = React.useCallback((e) => {
    const toElement = e.relatedTarget || e.toElement;
    if (!toElement && isSelectingRef.current) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
    }
  }, [endSelection]);

  const onVisibilityChange = React.useCallback(() => {
    if (document.visibilityState !== 'visible' && isSelectingRef.current) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
    }
  }, [endSelection]);

  const onContainerMouseDown = React.useCallback((e) => {
    const blankCheck = isBlankArea || defaultIsBlank;
    if (!blankCheck(e)) return;
    if (e.button !== 0) return;
    e.preventDefault();
    // 延後清空到 mouseup；只有當拖動超過閾值時才在 move 中清空
    pendingClearRef.current = true;
    setSelectionFading(false);
    leftWindowRef.current = false;
    isSelectingRef.current = true;
    startPointRef.current = { x: e.clientX, y: e.clientY };
    // init selection box style immediately
    lastSelRectRef.current = { left: e.clientX, top: e.clientY, width: 0, height: 0 };
    const box = selectionBoxRef.current;
    if (box) {
      const style = box.style;
      style.left = `${e.clientX}px`;
      style.top = `${e.clientY}px`;
      style.width = `0px`;
      style.height = `0px`;
    }

    // Defer cache build to computeSelection threshold
    cacheBuiltRef.current = false;
    clearEphemeralSelection();
    elementsByFpRef.current.clear();
    lastComputedRef.current = new Set();

    window.addEventListener('mousemove', onGlobalMouseMove, { passive: true });
    window.addEventListener('mouseup', onGlobalMouseUp, { passive: true });
    window.addEventListener('mouseleave', onWindowLeft, { passive: true });
    window.addEventListener('pointerleave', onWindowLeft, { passive: true });
    window.addEventListener('pointerup', onGlobalMouseUp, { passive: true });
    window.addEventListener('pointercancel', onGlobalCancel, { passive: true });
    window.addEventListener('mouseenter', onWindowReenter, true);
    window.addEventListener('blur', onWindowLeft, { passive: true });
    document.addEventListener('mouseout', onDocumentMouseOut, true);
    document.addEventListener('visibilitychange', onVisibilityChange, true);
  }, [isBlankArea, hitSelector, rootRef, onGlobalMouseMove, onGlobalMouseUp, onWindowLeft, onGlobalCancel, onWindowReenter, onDocumentMouseOut, onVisibilityChange]);

  return {
    // 狀態（外控模式下可忽略）
    selected,
    setSelected,
    boxSelecting,
    selectionRect,
    selectionFading,

    // 事件綁定
    onContainerMouseDown,

    // 助手：用於渲染 selection-rect 行內 style
    selectionBoxRef,
  };
}
