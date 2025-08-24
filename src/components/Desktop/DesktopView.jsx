import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import DesktopGridUnified from './DesktopGrid.Unified';
import './Desktop.css';

// 判斷是否點擊在可交互元素上（卡片、選單、表單控件、連結等）
function closestInteractive(target) {
  try {
    if (!target || !target.closest) return false;
    // 桌面不再顯示資料夾，因此移除 .folder-card
    return !!target.closest('.game-card, .context-menu, input, textarea, button, a');
  } catch (_) {
    return false;
  }
}

/**
 * 主桌面視圖組件
 * 管理整個桌面布局和狀態，混合顯示遊戲和資料夾
 */
const DesktopView = ({ 
  games = [], 
  folders = [], 
  onGameSelect,
  onFolderOpen,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onAddToFolder,
  onGameInfo,
  onGameDrop,
  onRefresh,
  searchQuery = '',
  isLoading = false,
  isSwitchingToDesktop = false,
  disableFlipExtra = false,
}) => {
  // 已切換至統一右鍵菜單（由 DesktopGrid.Unified 內部的 useUnifiedContextMenu 管理）

  const [externalDragActive, setExternalDragActive] = useState(false);
  const rootRef = useRef(null);
  // 受控多選狀態（供 DesktopGridUnified/UnifiedGrid 使用）
  const [selectedSet, setSelectedSet] = useState(() => new Set());
  const selectedRef = useRef(new Set());
  useEffect(() => { selectedRef.current = selectedSet; }, [selectedSet]);
  const [boxSelecting, setBoxSelecting] = useState(false);
  const startPointRef = useRef({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState(null);
  const [selectionFading, setSelectionFading] = useState(false);
  const rafIdRef = useRef(0);
  const pendingPosRef = useRef(null);
  const isSelectingRef = useRef(false);
  const leftWindowRef = useRef(false);
  const fadeTimerRef = useRef(0);
  const selectionBoxRef = useRef(null);
  const pointerTargetRef = useRef(null);
  const pointerIdRef = useRef(null);
  const lastSelectionEndedAtRef = useRef(0);
  const hasStartedBoxRef = useRef(false);
  const DRAG_THRESHOLD = 4; // px
  // 緩存可選元素的邊界，避免每幀 getBoundingClientRect
  const selectablesRef = useRef({
    items: [], // { fp, rect }
    rows: new Map(), // key:number => array of { fp, rect }
    rowKeys: [], // sorted keys
    bucket: 8, // px
  });
  // 節流用：限制選中集合更新頻率與移動閾值
  const lastUpdateTsRef = useRef(0);
  const lastSelRectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const lastRectUpdateTsRef = useRef(0); // 保留但不再節流 selectionRect（僅作備用）

  // 在視圖切換回桌面期間，鎖定上一幀的資料夾列表，避免資料夾短暫被移除再加入導致的佈局跳動
  const [latchedFolders, setLatchedFolders] = useState(folders);
  useEffect(() => {
    if (!isSwitchingToDesktop) {
      // 切換結束後才同步最新資料夾
      setLatchedFolders(folders);
    }
    // 切換期間保持上一幀資料夾不變
  }, [folders, isSwitchingToDesktop]);

  const handleRootDragOver = (e) => {
    if (externalDragActive) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const onGlobalPointerMove = (e) => {
    if (!isSelectingRef.current) return;
    const w = window.innerWidth; const h = window.innerHeight;
    if (e.clientX < 0 || e.clientY < 0 || e.clientX >= w || e.clientY >= h) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
      return;
    }
    if (e.buttons === 0) { endSelection(); return; }
    pendingPosRef.current = { x: e.clientX, y: e.clientY };
    // 若尚未超過閾值，不開始框選
    if (!hasStartedBoxRef.current) {
      const dx = Math.abs(pendingPosRef.current.x - startPointRef.current.x);
      const dy = Math.abs(pendingPosRef.current.y - startPointRef.current.y);
      if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
      // 初次超過閾值：開始框選，初始化樣式並構建快取
      hasStartedBoxRef.current = true;
      setBoxSelecting(true);
      setSelectionFading(false);
      const box = selectionBoxRef.current;
      if (box) {
        const style = box.style;
        style.left = `${startPointRef.current.x}px`;
        style.top = `${startPointRef.current.y}px`;
        style.width = `0px`;
        style.height = `0px`;
      }
      buildSelectablesCache();
      // 禁用文本選擇
      try { document.body && (document.body.style.userSelect = 'none'); document.body && document.body.classList && document.body.classList.add('no-select'); } catch {}
    }
    computeSelection(pendingPosRef.current);
    if (!rafIdRef.current) {
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = 0;
        if (pendingPosRef.current) computeSelection(pendingPosRef.current);
      });
    }
  };

  const handleRootDrop = (e) => {
    if (!externalDragActive) return;
    e.preventDefault();
    try { window.electronAPI?.dropDragSession?.({ type: 'desktop' }); } catch (err) { console.warn(err); }
    try { window.electronAPI?.endDragSession?.(); } catch (e2) {}
  };

  // 構建框選命中的快取：只讀 DOM 一次，之後移動用純數字運算
  const buildSelectablesCache = () => {
    const cache = selectablesRef.current;
    cache.items = [];
    cache.rows = new Map();
    cache.rowKeys = [];
    const bucket = cache.bucket || 8;
    // 只針對遊戲卡片（資料夾不參與框選）
    const nodes = document.querySelectorAll('.game-card');
    for (const node of nodes) {
      // 使用 data-filepath 作為唯一鍵
      const fp = node.getAttribute('data-filepath');
      if (!fp) continue;
      const r = node.getBoundingClientRect();
      // 快照必要數字，避免保留 DOMRect 實例
      const rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      cache.items.push({ fp, rect });
      const minKey = Math.floor(rect.top / bucket) * bucket;
      const maxKey = Math.floor(rect.bottom / bucket) * bucket;
      for (let key = minKey; key <= maxKey; key += bucket) {
        if (!cache.rows.has(key)) cache.rows.set(key, []);
        cache.rows.get(key).push({ fp, rect });
      }
    }
    cache.rowKeys = Array.from(cache.rows.keys()).sort((a, b) => a - b);
  };

  // 從桌面根節點開始橡皮筋框選（可在空白行啟動）
  const onRootMouseDown = (e) => {
    if (e.button !== 0) return; // 只處理左鍵
    // 忽略在可交互元素上的按下
    if (closestInteractive(e.target)) return;
    // 支援 shift/ctrl 的多選語義：在這裡只是開始框選
    isSelectingRef.current = true;
    leftWindowRef.current = false;
    setSelectionFading(false);
    hasStartedBoxRef.current = false; // 尚未超過閾值
    startPointRef.current = { x: e.clientX, y: e.clientY };

    // 指針捕獲，避免快速拖動丟事件
    if (e.pointerId != null && e.currentTarget?.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
        pointerTargetRef.current = e.currentTarget;
        pointerIdRef.current = e.pointerId;
      } catch {}
    }

    window.addEventListener('mousemove', onGlobalMouseMove, true);
    window.addEventListener('pointermove', onGlobalPointerMove, true);
    window.addEventListener('mouseup', onGlobalMouseUp, { passive: true });
    window.addEventListener('mouseleave', onWindowLeft, { passive: true });
    window.addEventListener('pointerleave', onWindowLeft, { passive: true });
    window.addEventListener('pointerup', onGlobalMouseUp, { passive: true });
    window.addEventListener('pointercancel', onGlobalCancel, { passive: true });
    window.addEventListener('mouseenter', onWindowReenter, true);
    window.addEventListener('blur', onWindowLeft, { passive: true });
    window.addEventListener('scroll', onScrollDuringSelect, { passive: true });
    document.addEventListener('mouseout', onDocumentMouseOut, true);
    document.addEventListener('visibilitychange', onVisibilityChange, true);
  };

  const computeSelection = (pos) => {
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
    // 立即更新選擇框（使用 DOM ref 避免 React 重渲染）
    const box = selectionBoxRef.current;
    if (box) {
      const style = box.style;
      style.left = `${left}px`;
      style.top = `${top}px`;
      style.width = `${width}px`;
      style.height = `${height}px`;
    }
    lastSelRectRef.current = { left, top, width, height };

    const rect = new DOMRect(left, top, width, height);
    const next = new Set();
    const cache = selectablesRef.current;
    // 僅檢查與選框垂直重疊的「行桶」
    if (cache && cache.rows && cache.rowKeys) {
      const minKey = Math.floor(rect.top / cache.bucket) * cache.bucket;
      const maxKey = Math.floor(rect.bottom / cache.bucket) * cache.bucket;
      const keys = cache.rowKeys;
      // 二分查找起止索引
      let lo = 0, hi = keys.length - 1, start = keys.length, end = -1;
      // 找到第一個 >= minKey 的索引
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (keys[mid] >= minKey) { start = mid; hi = mid - 1; } else { lo = mid + 1; }
      }
      // 找到最後一個 <= maxKey 的索引
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
    // 節流：~60fps（~16ms）更新選中集合，兼顧靈敏度與渲染負載
    const now = performance.now ? performance.now() : Date.now();
    const since = now - (lastUpdateTsRef.current || 0);
    if (since < 16) return;
    lastUpdateTsRef.current = now;

    const prev = selectedRef.current;
    if (prev.size === next.size) {
      // 快速相等檢查：避免昂貴的重渲染
      let same = true;
      for (const k of prev) { if (!next.has(k)) { same = false; break; } }
      if (same) return;
    }
    // 使用過渡，避免阻塞主更新
    if (React.startTransition) {
      React.startTransition(() => setSelectedSet(next));
    } else {
      setSelectedSet(next);
    }
  };

  const onGlobalMouseMove = (e) => {
    if (!isSelectingRef.current) return;
    const w = window.innerWidth; const h = window.innerHeight;
    if (e.clientX < 0 || e.clientY < 0 || e.clientX >= w || e.clientY >= h) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
      return;
    }
    // if the user re-enters with no buttons, end immediately
    if (e.buttons === 0) { endSelection(); return; }
    pendingPosRef.current = { x: e.clientX, y: e.clientY };
    if (!hasStartedBoxRef.current) {
      const dx = Math.abs(pendingPosRef.current.x - startPointRef.current.x);
      const dy = Math.abs(pendingPosRef.current.y - startPointRef.current.y);
      if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
      hasStartedBoxRef.current = true;
      setBoxSelecting(true);
      setSelectionFading(false);
      const box = selectionBoxRef.current;
      if (box) {
        const style = box.style;
        style.left = `${startPointRef.current.x}px`;
        style.top = `${startPointRef.current.y}px`;
        style.width = `0px`;
        style.height = `0px`;
      }
      buildSelectablesCache();
      try { document.body && (document.body.style.userSelect = 'none'); document.body && document.body.classList && document.body.classList.add('no-select'); } catch {}
    }
    // 先立即計算一次，避免快速按下/移動/鬆開時看不到選框
    computeSelection(pendingPosRef.current);
    // 再用 rAF 跟進，確保持續流暢
    if (!rafIdRef.current) {
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = 0;
        if (pendingPosRef.current) computeSelection(pendingPosRef.current);
      });
    }
  };

  const endSelection = (opts = { fadeToEdge: false }) => {
    isSelectingRef.current = false;
    const wasBox = hasStartedBoxRef.current || boxSelecting;
    setBoxSelecting(false);
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = 0; }
    if (opts.fadeToEdge) {
      setSelectionFading(true);
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => {
        setSelectionFading(false);
      }, 180);
    } else {
    }
    // 僅在真正發生框選時記錄時間戳，避免單擊被誤抑制
    if (wasBox) {
      try { lastSelectionEndedAtRef.current = (performance.now ? performance.now() : Date.now()); } catch (_) { lastSelectionEndedAtRef.current = Date.now(); }
    }
    // 釋放指針捕獲
    if (pointerTargetRef.current && pointerIdRef.current != null && pointerTargetRef.current.releasePointerCapture) {
      try { pointerTargetRef.current.releasePointerCapture(pointerIdRef.current); } catch {}
    }
    pointerTargetRef.current = null;
    pointerIdRef.current = null;
    // 恢復文本選擇
    try {
      document.body && (document.body.style.userSelect = '');
      document.body && document.body.classList && document.body.classList.remove('no-select');
    } catch {}
    document.removeEventListener('mouseout', onDocumentMouseOut, true);
    document.removeEventListener('visibilitychange', onVisibilityChange, true);
    window.removeEventListener('scroll', onScrollDuringSelect);
    // 對稱移除所有全域監聽
    window.removeEventListener('mousemove', onGlobalMouseMove, true);
    window.removeEventListener('mouseup', onGlobalMouseUp, { passive: true });
    window.removeEventListener('mouseleave', onWindowLeft, { passive: true });
    window.removeEventListener('pointermove', onGlobalPointerMove, true);
    window.removeEventListener('pointerleave', onWindowLeft, { passive: true });
    window.removeEventListener('pointerup', onGlobalMouseUp, { passive: true });
    window.removeEventListener('pointercancel', onGlobalCancel, { passive: true });
    window.removeEventListener('mouseenter', onWindowReenter, true);
    window.removeEventListener('blur', onWindowLeft, { passive: true });
  };

  const onGlobalMouseUp = () => {
    if (!boxSelecting) return;
    endSelection();
  };
  const onGlobalCancel = () => {
    if (!boxSelecting) return;
    endSelection();
  };

  const onWindowReenter = () => {
    if (leftWindowRef.current) {
      leftWindowRef.current = false;
      endSelection();
    }
  };
  const onWindowLeft = () => {
    if (isSelectingRef.current) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
    }
  };
  const onDocumentMouseOut = (e) => {
    const toElement = e.relatedTarget || e.toElement;
    if (!toElement && isSelectingRef.current) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
    }
  };
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible' && isSelectingRef.current) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
    }
  };

  const onScrollDuringSelect = () => {
    if (isSelectingRef.current) {
      endSelection({ fadeToEdge: true });
    }
  };

  // 監聽跨窗口拖拽會話開始/結束
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDragSessionStarted || !api?.onDragSessionEnded) return;
    const offStart = api.onDragSessionStarted(() => setExternalDragActive(true));
    const offEnd = api.onDragSessionEnded(() => setExternalDragActive(false));
    return () => {
      offStart && offStart();
      offEnd && offEnd();
    };
  }, []);

  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedItem: null,
    draggedType: null,
    dropTarget: null
  });

  // 舊版右鍵菜單已移除

  // 處理拖拽開始
  const handleDragStart = (item, type) => {
    setDragState({
      isDragging: true,
      draggedItem: item,
      draggedType: type,
      dropTarget: null
    });
  };

  // 處理拖拽結束
  const handleDragEnd = () => {
    setDragState({
      isDragging: false,
      draggedItem: null,
      draggedType: null,
      dropTarget: null
    });
  };

  // 處理拖拽到資料夾
  const handleDropOnFolder = (folderId) => {
    // 優先使用跨窗口拖拽會話（若存在）
    const api = window.electronAPI;
    if (api?.dropDragSession) {
      // 確保 drop 先抵達主進程，再結束會話，避免 no-active-session 競態
      try {
        Promise.resolve(api.dropDragSession({ type: 'folder', id: folderId }))
          .finally(() => {
            try { api.endDragSession && api.endDragSession(); } catch (_) {}
          });
      } catch (_) {
        try { api.endDragSession && api.endDragSession(); } catch (_) {}
      }
    } else if (dragState.draggedItem && dragState.draggedType === 'game') {
      // 向後兼容：本窗口內移動
      onGameDrop && onGameDrop(dragState.draggedItem.filePath, folderId);
    }
    // 結束本地拖拽狀態（會話在上方 finally 中結束）
    handleDragEnd();
  };

  // 過濾項目（根據搜索查詢）
  const filteredGames = games.filter(game => 
    !searchQuery || 
    game.gameName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    game.vendor?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sourceFolders = isSwitchingToDesktop ? latchedFolders : folders;
  const filteredFolders = sourceFolders.filter(folder =>
    !searchQuery ||
    folder.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    folder.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ====== 遊戲是否屬於任一資料夾（顯示徽章）======
  const [memberSet, setMemberSet] = useState(() => new Set()); // Set<string:filePath>
  const refreshMemberSet = useCallback(async () => {
    try {
      const list = await window.electronAPI?.getGamesInAnyFolder?.();
      if (Array.isArray(list)) {
        setMemberSet(new Set(list));
      } else {
        setMemberSet(new Set());
      }
    } catch (e) {
      console.warn('取得資料夾徽章列表失敗:', e);
    }
  }, []);

  useEffect(() => {
    refreshMemberSet();
    let debounceTimer = 0;
    const debounced = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshMemberSet();
      }, 120);
    };
    const offA = window.electronAPI?.onGameFolderChanged?.(() => {
      // 單個遊戲的資料夾變化：合併短暫事件
      debounced();
    });
    const offB = window.electronAPI?.onFolderChanged?.(() => {
      // 資料夾增刪改：也可能影響成員集合
      debounced();
    });
    // 某些主進程版本僅發出更細分事件：folder-updated / folder-deleted
    const offC = window.electronAPI?.onFolderUpdated?.(() => {
      debounced();
    });
    const offD = window.electronAPI?.onFolderDeleted?.(() => {
      debounced();
    });
    return () => {
      offA && offA();
      offB && offB();
      offC && offC();
      offD && offD();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [refreshMemberSet]);

  // 當傳入的 folders 變化時，主動刷新徽章集合（保險機制）
  useEffect(() => {
    // 若主進程沒即時廣播事件，依賴 props 的變更也能觸發刷新
    refreshMemberSet();
  }, [refreshMemberSet, folders]);

  // 將 hasFolder 作為額外屬性傳入 GameCard，避免改動遊戲資料本身
  const gameCardExtraProps = useCallback(
    (game) => ({ hasFolder: !!(game && memberSet.has(game.filePath)) }),
    [memberSet]
  );

  // 點擊空白區域關閉右鍵菜單
  // 舊版右鍵菜單關閉監聽已移除

  return (
    <div 
      className={`desktop-view ${isSwitchingToDesktop ? 'mounting' : ''}`} 
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
      onMouseDown={undefined}
      onClick={undefined}
      onMouseMove={undefined}
      onMouseUp={undefined}
      ref={rootRef}
    >
      {/* 桌面網格（已統一） - 包裹層僅用於視覺平移，避免影響 fixed/overlay 的定位 */}
      <div className="desktop-shift-layer">
        <DesktopGridUnified
          games={games}
          folders={[]}
          onGameSelect={onGameSelect}
          onFolderOpen={onFolderOpen}
          onCreateFolder={onCreateFolder}
          onEditFolder={onEditFolder}
          onDeleteFolder={onDeleteFolder}
          onAddToFolder={onAddToFolder}
          onGameInfo={onGameInfo}
          onRefresh={onRefresh}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnFolder={handleDropOnFolder}
          dragState={dragState}
          externalDragActive={externalDragActive}
          isLoading={isLoading}
          disableFlip={isSwitchingToDesktop || disableFlipExtra}
          gameCardExtraProps={gameCardExtraProps}
        />
      </div>
      
      

      {/* 拖拽覆蓋層已移除，改用原生 setDragImage 預覽 */}
    </div>
  );
};

export default DesktopView;
