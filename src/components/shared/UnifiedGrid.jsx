import React from 'react';
import { createPortal } from 'react-dom';
import GameCard from '../GameCard';
import FolderCard from '../Folder/FolderCard';
import { MAX_ANIMATIONS, FLIP_DURATION, FLIP_EASING } from '@config/perf';
import useSelectionBox from './hooks/useSelectionBox';
import useDragSession from './hooks/useDragSession';
import useFlipWithWhitelist from './hooks/useFlipWithWhitelist';
import useVirtualizedGrid from './hooks/useVirtualizedGrid';

/**
 * UnifiedGrid（供桌面視圖與資料夾視圖共用）
 * - 完整保留空白處啟動框選、邊界行為、rAF 節流與淡出
 * - 右鍵：卡片或空白處皆可觸發，由父層傳入回調
 * - 拖拽：多選 + 自定義預覽 + 跨窗口拖拽會話
 * - FLIP：白名單 + 分片（僅可見 ± 緩衝、最多 200）
 * - 虛擬化：此版本僅提供可見範圍，之後可接入 react-window 以真正虛擬化
 */
const UnifiedGrid = ({
  // 資料
  games = [],
  folders = [],

  // 點擊/右鍵
  onGameClick,
  onFolderOpen,
  onGameContextMenu,
  onFolderContextMenu,
  onBlankContextMenu,

  // 拖拽
  onDragStart,
  onDragEnd,
  onDropOnFolder,
  dragState = { isDragging: false, draggedItem: null, draggedType: null },
  externalDragActive = false,

  // 框選（外控/內控）
  selectionControlled = false,
  selectionProps = {}, // {selectedSet,onSelectedChange,selectionRect,boxSelecting,selectionFading}

  // 其它
  isLoading = false,
  disableFlip = false,
  virtualization = { enabled: true },
  // 佈局/樣式
  containerClassName = 'desktop-grid',
  // 卡片附加屬性（可為物件或函數：game => props）。例如資料夾視窗內：folderView、showPublisher、showVersion。
  gameCardExtraProps = {},
  // 拖拽來源上下文（桌面/資料夾）
  dragSource = { type: 'desktop', id: null },
}) => {
  const containerRef = React.useRef(null);

  // 框選（保留空白啟動、邊界行為與淡出）
  const sel = useSelectionBox({
    rootRef: containerRef,
    controlled: selectionControlled,
    selectedSet: selectionProps.selectedSet,
    onSelectedChange: selectionProps.onSelectedChange,
    isBlankArea: (e) => {
      const el = e.target;
      return !(el?.closest && el.closest('.game-card, .folder-card, .context-menu'));
    },
    hitSelector: '.game-card',
    fadeDuration: FLIP_DURATION,
    gamesList: games, // 傳入遊戲列表用於緩存失效檢測
    enableCachePersistence: true, // 啟用緩存持久化優化
  });

  // 對外提供 selectedRef（拖拽需要）
  const selectedRef = React.useRef(new Set());
  React.useEffect(() => { selectedRef.current = sel.selected; }, [sel.selected]);

  // 拖拽會話（多選 + 預覽）
  const { handleGameDragStart, endDragSession } = useDragSession({ selectedRef, games, source: dragSource });

  // Shift 範圍選取錨點與索引映射
  const anchorIndexRef = React.useRef(null); // 最近一次基準索引
  const gameIndexMap = React.useMemo(() => {
    const map = new Map();
    for (let i = 0; i < games.length; i++) {
      map.set(games[i]?.filePath, i);
    }
    return map;
  }, [games]);

  // 放下後的短暫冷卻：避免重排與動畫同時發生造成掉幀
  const [dropCooling, setDropCooling] = React.useState(false);
  const startDropCooldown = React.useCallback(() => {
    setDropCooling(true);
    const t = setTimeout(() => setDropCooling(false), 200);
    return () => clearTimeout(t);
  }, []);

  // 針對『被移除位置之後的少量遊戲』做輕柔動畫的暫態白名單（最多 60 個）
  const postDropKeysRef = React.useRef(new Set()); // 'game:filePath'
  const [postDropPulse, setPostDropPulse] = React.useState(false);

  // FLIP 鍵集合
  const keys = React.useMemo(() => {
    const arr = [];
    for (const f of folders) arr.push(`folder:${f.id}`);
    for (const g of games) arr.push(`game:${g.filePath}`);
    return arr;
  }, [folders, games]);

  // 可見範圍（供 FLIP 白名單使用）
  const itemCount = folders.length + games.length;
  const { enabled: virtEnabled, visibleStart, visibleEnd, startRow, endRow, columns, rowHeight, totalRows, topPadding, bottomPadding } = useVirtualizedGrid({
    itemCount,
    virtualization,
    containerRef,
    freeze: dropCooling,
  });

  // 保持視窗位置穩定：當上方占位高度變化時，補償 scrollTop，避免列表內容「跳至頂部」
  const prevTopPadRef = React.useRef(topPadding);
  React.useLayoutEffect(() => {
    try {
      const el = containerRef.current;
      if (!el) return;
      const delta = (topPadding || 0) - (prevTopPadRef.current || 0);
      if (delta !== 0) {
        // 僅在容器可滾動時補償
        if (el.scrollHeight > el.clientHeight + 1) {
          el.scrollTop += delta;
        }
      }
      prevTopPadRef.current = topPadding;
    } catch (_) {}
  }, [topPadding]);

  // 打包後初始測量有時為 0：主動觸發一次 resize 以推動計算
  React.useEffect(() => {
    const id = setTimeout(() => {
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // 白名單（限制動畫項目數量）
  const whitelist = React.useMemo(() => {
    const set = new Set();
    // 在 postDropPulse 期間，忽略 dropCooling/drag/external 限制，僅針對 postDropKeysRef 做小範圍動畫
    const disabledBase = disableFlip || sel.boxSelecting || selectionProps.boxSelecting;
    if (disabledBase) return set; // 不做動畫
    if (postDropPulse && postDropKeysRef.current && postDropKeysRef.current.size > 0) {
      for (const k of postDropKeysRef.current) set.add(k);
      return set;
    }
    // 非脈衝期間：完全不做位移動畫（返回空集）
    return set;
  }, [disableFlip, sel.boxSelecting, selectionProps.boxSelecting, postDropPulse]);

  // 掛載 FLIP（白名單）
  useFlipWithWhitelist({
    containerRef,
    keys,
    // 在 postDropPulse 時啟用（忽略 dropCooling）；其餘條件維持既有禁用策略
    disabled: postDropPulse
      ? (disableFlip || sel.boxSelecting || selectionProps.boxSelecting)
      : (disableFlip || dropCooling || sel.boxSelecting || selectionProps.boxSelecting || dragState?.isDragging || externalDragActive),
    whitelist,
    duration: FLIP_DURATION,
    easing: FLIP_EASING,
    fadeOpacity: true,
    fadeFrom: 0.1,
  });

  // 穩定的事件處理：使用 id 形式避免為每個卡片建立新函數引用
  const onLaunchById = React.useCallback((filePath) => {
    const g = games.find(x => x.filePath === filePath);
    if (g && onGameClick) onGameClick(g);
  }, [games, onGameClick]);

  const onDragStartById = React.useCallback((filePath, e) => {
    const g = games.find(x => x.filePath === filePath);
    if (!g) return;
    handleGameDragStart(e, g);
    if (onDragStart) onDragStart(g, 'game');
  }, [games, handleGameDragStart, onDragStart]);

  const onDragEndStable = React.useCallback((e) => {
    // 補發 drop 到資料夾（維持原有行為）
    try {
      const x = e && (e.clientX ?? e.pageX);
      const y = e && (e.clientY ?? e.pageY);
      if (typeof x === 'number' && typeof y === 'number') {
        const el = document.elementFromPoint(x, y);
        const folderEl = el && (el.closest ? el.closest('.folder-card') : null);
        const id = folderEl && (folderEl.getAttribute('data-folderid') || folderEl.getAttribute('data-id'));
        if (id && window.electronAPI?.dropDragSession) {
          try { window.electronAPI.dropDragSession({ type: 'folder', id }); } catch (_) {}
        }
      }
    } catch (_) {}

    try { setTimeout(() => { try { endDragSession(); } catch (_) {} }, 800); } catch (_) {}
    if (onDragEnd) {
      try { setTimeout(() => { try { onDragEnd(e); } catch (_) {} }, 150); } catch (_) {}
    }
  }, [endDragSession, onDragEnd]);

  const onCardMouseDownById = React.useCallback((filePath, e) => {
    // 單擊/多選（Ctrl/Cmd/Shift），維持原有邏輯
    e.stopPropagation();
    if (e.button === 2) return;
    const curIdx = gameIndexMap.get(filePath);
    const hasAnchor = typeof anchorIndexRef.current === 'number' && anchorIndexRef.current >= 0;
    const isSelected = sel.selected.has(filePath);

    if (e.shiftKey) {
      const anchor = hasAnchor ? anchorIndexRef.current : curIdx;
      const start = Math.min(anchor, curIdx);
      const end = Math.max(anchor, curIdx);
      const range = new Set();
      for (let i = start; i <= end; i++) {
        const fp = games[i]?.filePath;
        if (fp) range.add(fp);
      }
      sel.setSelected(prev => {
        if (e.ctrlKey || e.metaKey) {
          const next = new Set(prev);
          for (const fp of range) next.add(fp);
          return next;
        }
        return range;
      });
      anchorIndexRef.current = anchor;
    } else if (e.ctrlKey || e.metaKey) {
      sel.setSelected(prev => {
        const next = new Set(prev);
        if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
        return next;
      });
      anchorIndexRef.current = curIdx;
    } else {
      if (isSelected && sel.selected.size > 1) {
        return;
      }
      sel.setSelected(new Set([filePath]));
      anchorIndexRef.current = curIdx;
    }
  }, [gameIndexMap, games, sel.selected, sel.setSelected]);

  // Loading 狀態
  if (isLoading) {
    return (
      <div className="desktop-grid loading">
        <div className="loading-spinner">
          <span>LOADING</span>
        </div>
      </div>
    );
  }

  // 空狀態
  if (itemCount === 0) {
    return (
      <div className="desktop-grid empty">
        <div className="empty-state">
          <div className="empty-icon">📁</div>
        </div>
      </div>
    );
  }

  // 右鍵處理：卡片與空白（包含多選清單計算）
  const onContextMenu = (e) => {
    // 阻止瀏覽器/系統默認菜單與冒泡，確保自訂選單生效
    try { e.preventDefault(); } catch (_) {}
    try { e.stopPropagation(); } catch (_) {}
    const hitGame = e.target.closest && e.target.closest('.game-card');
    if (hitGame) {
      const fp = hitGame.getAttribute('data-filepath');
      const game = games.find(g => g.filePath === fp);
      if (game && onGameContextMenu) {
        // 與原 per-card 一致：若已在選中集合，帶出整個選中清單；否則單項
        let useList = [game.filePath];
        try {
          const has = sel.selected && sel.selected.has && sel.selected.has(game.filePath);
          const cur = Array.from(sel.selected || []);
          if (has && cur.length > 0) useList = cur;
          // 視覺上同步：若不在當前選中，將其設為單一選中
          if (!has) {
            try { sel.setSelected && sel.setSelected(new Set([game.filePath])); } catch (_) {}
          }
        } catch (_) {}
        return onGameContextMenu(e, { ...game, selectedFilePaths: useList });
      }
    }
    const hitFolder = e.target.closest && e.target.closest('.folder-card');
    if (hitFolder) {
      const id = hitFolder.getAttribute('data-folderid') || hitFolder.getAttribute('data-id');
      const folder = folders.find(f => String(f.id) === String(id));
      if (folder && onFolderContextMenu) return onFolderContextMenu(e, folder);
    }
    onBlankContextMenu && onBlankContextMenu(e);
  };

  // 點擊
  const onClick = () => {/* 交由上層自行處理是否關閉菜單等 */};

  // 容器 MouseDown：內控模式下啟動空白框選；外控時父層可在更高層啟動
  const containerMouseDown = selectionControlled ? undefined : sel.onContainerMouseDown;

  return (
    <div
      className={`${containerClassName} ${sel.boxSelecting || selectionProps.boxSelecting ? 'box-selecting' : ''} ${dragState?.isDragging ? 'dragging' : ''}`}
      ref={containerRef}
      onMouseDown={containerMouseDown}
      onContextMenu={onContextMenu}
      onClick={onClick}
    >
      {/* 窗口化渲染（先 folders 後 games 的線性序列），加入上下占位以維持正確捲動高度 */}
      {virtEnabled && topPadding > 0 ? (
        <div className="grid-spacer" style={{ height: `${topPadding}px`, width: '100%', gridColumn: '1 / -1' }} />
      ) : null}

      {(() => {
        const total = folders.length + games.length;
        const start = virtEnabled ? visibleStart : 0;
        const end = virtEnabled ? visibleEnd : total - 1;
        const nodes = [];
        for (let idx = start; idx <= end; idx++) {
          if (idx < folders.length) {
            const folder = folders[idx];
            nodes.push(
              <FolderCard
                key={folder.id}
                folder={folder}
                onClick={() => onFolderOpen && onFolderOpen(folder)}
                onContextMenu={(e) => onFolderContextMenu && onFolderContextMenu(e, folder)}
                onDragOver={(event) => {
                  if (dragState.draggedType === 'game' || externalDragActive) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragState.draggedType === 'game' || externalDragActive) {
                    startDropCooldown();
                    // 建立 post-drop 白名單：以被移除的最小索引為起點，抓取其後最多 60 個仍存在的遊戲
                    try {
                      const selected = Array.from(selectedRef.current || []);
                      const idxs = selected
                        .map(fp => gameIndexMap.get(fp))
                        .filter(i => typeof i === 'number' && i >= 0)
                        .sort((a, b) => a - b);
                      if (idxs.length > 0) {
                        const minIdx = idxs[0];
                        const set = new Set();
                        for (let i = minIdx; i < games.length && set.size < 60; i++) {
                          const fp = games[i]?.filePath;
                          if (!fp) continue;
                          if (selectedRef.current && selectedRef.current.has && selectedRef.current.has(fp)) continue; // 跳過即將被移除者
                          set.add(`game:${fp}`);
                        }
                        postDropKeysRef.current = set;
                        if (set.size > 0) {
                          setPostDropPulse(true);
                          setTimeout(() => setPostDropPulse(false), 3000);
                        }
                      }
                    } catch (_) {}
                    let usedIpc = false;
                    try {
                      if (window.electronAPI?.dropDragSession) {
                        usedIpc = true;
                        Promise.resolve(window.electronAPI.dropDragSession({ type: 'folder', id: folder.id }))
                          .catch(() => {
                            setTimeout(() => {
                              try { window.electronAPI.dropDragSession({ type: 'folder', id: folder.id }); } catch (_) {}
                            }, 150);
                          });
                      }
                    } catch (_) {}
                    if (!usedIpc) onDropOnFolder && onDropOnFolder(folder.id);
                  }
                }}
                isDropTarget={(dragState.isDragging && dragState.draggedType === 'game') || externalDragActive}
                className={`folder-card ${((dragState.isDragging && dragState.draggedType === 'game') || externalDragActive) ? 'drop-target' : ''}`}
                disableAppear={disableFlip}
                data-flip-key={`folder:${folder.id}`}
                data-folderid={folder.id}
              />
            );
          } else {
            const game = games[idx - folders.length];
            if (!game || !game.filePath) {
              // 靜默跳過無效遊戲，避免控制台警告
              continue; // Skip this item but keep rendering others
            }
            const extra = (typeof gameCardExtraProps === 'function') ? (gameCardExtraProps(game) || {}) : (gameCardExtraProps || {});
            const isSelected = sel.selected.has(game.filePath);
            const isDraggingSelf = dragState.isDragging && dragState.draggedItem?.filePath === game.filePath;
            nodes.push(
              <GameCard
                key={game.filePath}
                game={game}
                filePath={game.filePath}
                isSelected={isSelected}
                disableAppear={disableFlip}
                draggable={true}
                data-flip-key={`game:${game.filePath}`}
                data-filepath={game.filePath}
                onLaunchById={onLaunchById}
                onDragStartById={onDragStartById}
                onDragEnd={onDragEndStable}
                onMouseDownById={onCardMouseDownById}
                className={`game-card ${isDraggingSelf ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
                {...extra}
              />
            );
          }
        }
        return nodes;
      })()}

      {virtEnabled && bottomPadding > 0 ? (
        <div className="grid-spacer" style={{ height: `${bottomPadding}px`, width: '100%', gridColumn: '1 / -1' }} />
      ) : null}

      {/* 框選矩形（外控優先）。透過 Portal 渲染到 body，避免受 transform 祖先影響 */}
      {selectionControlled ? (
        (selectionProps.boxSelecting && selectionProps.selectionRect) ? (
          createPortal(
            <div
              className={`selection-rect ${selectionProps.selectionFading ? 'fade-out' : ''}`}
              style={{
                position: 'fixed',
                left: selectionProps.selectionRect.left,
                top: selectionProps.selectionRect.top,
                width: selectionProps.selectionRect.width,
                height: selectionProps.selectionRect.height,
                pointerEvents: 'none',
              }}
            />, document.body
          )
        ) : null
      ) : (
        sel.boxSelecting ? (
          createPortal(
            <div
              ref={sel.selectionBoxRef}
              className={`selection-rect ${sel.selectionFading ? 'fade-out' : ''}`}
              style={{ position: 'fixed', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />, document.body
          )
        ) : null
      )}
    </div>
  );
};

export default UnifiedGrid;
