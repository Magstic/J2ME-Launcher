import React from 'react';
import { createPortal } from 'react-dom';
import { FixedSizeGrid as Grid } from 'react-window';
import GameCard from '../GameCard';
import ClusterCard from '../ClusterCard';
import {
  CARD_WIDTH,
  GRID_GAP,
  ITEM_WIDTH,
  ITEM_HEIGHT,
  VIRTUALIZATION_THRESHOLD,
  FLIP_DURATION,
} from '@config/perf';
import useSelectionBox from '@shared/hooks/useSelectionBox';
import useDragSession from '@shared/hooks/useDragSession';
import { AppIconSvg } from '@/assets/icons';

/**
 * VirtualizedUnifiedGrid - React-window 真正虛擬化實現
 * 替代原有的偽虛擬化系統，提供真正的性能優化
 */

// Grid Cell 渲染器
const GridCell = React.memo(({ columnIndex, rowIndex, style, data, isScrolling }) => {
  const {
    items,
    columns,
    selectedSet,
    onItemClick,
    onItemContextMenu,
    onItemMouseDownKey,
    onItemDragStart,
    onItemDragEnd,
    dragState,
    gameCardExtraProps,
    onClusterClick,
    onClusterContextMenu,
    onClusterDragStart,
    onClusterDragEnd,
    clustersList,
    optimisticHideSet,
    virtEnabled,
  } = data;
  const index = rowIndex * columns + columnIndex;

  if (index >= items.length) return <div style={style} />;

  const item = items[index];

  // 調整樣式以匹配自適應寬度
  const cellStyle = {
    ...style,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${GRID_GAP / 2}px`,
  };

  // 渲染遊戲
  if (item.type === 'game') {
    const baseExtra =
      typeof gameCardExtraProps === 'function'
        ? gameCardExtraProps(item) || {}
        : gameCardExtraProps || {};
    const extra = virtEnabled || isScrolling ? { ...baseExtra, disableAppear: true } : baseExtra;
    const key = `game:${item.filePath}`;
    const isSelected = selectedSet.has(key);
    const isDraggingSelf =
      dragState.isDragging && dragState.draggedItem?.filePath === item.filePath;

    // 若在樂觀隱藏集合內，立即不渲染卡片（保留佈局空位）
    if (optimisticHideSet && optimisticHideSet.has(String(item.filePath))) {
      return <div style={cellStyle} />;
    }

    return (
      <div style={cellStyle}>
        <GameCard
          game={item}
          filePath={item.filePath}
          isSelected={isSelected}
          draggable={true}
          data-filepath={key}
          onLaunchById={() => onItemClick?.(item)}
          onDragStartById={(filePath, e) => onItemDragStart?.(filePath, e)}
          onDragEnd={onItemDragEnd}
          onMouseDownById={(_, e) => onItemMouseDownKey?.(key, e)}
          onContextMenu={(e) => onItemContextMenu?.(e, item)}
          className={`game-card ${isDraggingSelf ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
          {...extra}
        />
      </div>
    );
  }

  // 渲染簇（Cluster）
  if (item.type === 'cluster') {
    const key = `cluster:${item.id}`;
    const isSelectedCluster = !!selectedSet?.has(key);
    // 僅保留仍存在於當前列表中的選中簇 ID
    const currentSet = new Set((clustersList || []).map((c) => String(c.id)));
    const rawIds = Array.from(selectedSet || [])
      .filter((k) => typeof k === 'string' && k.startsWith('cluster:'))
      .map((k) => k.slice(8));
    const filteredIds = rawIds.filter((id) => currentSet.has(String(id)));
    const isMulti = filteredIds.length > 1 && filteredIds.includes(String(item.id));
    // 將當前選中的遊戲（filePath）也附帶給右鍵菜單，支援『混合選擇』情境
    const selectedGameFilePaths =
      selectedSet && selectedSet.size > 0
        ? Array.from(selectedSet)
            .filter((k) => typeof k === 'string' && k.startsWith('game:'))
            .map((k) => k.slice(5))
        : [];
    const clusterPayload = isMulti
      ? { ...item, selectedClusterIds: filteredIds, selectedFilePaths: selectedGameFilePaths }
      : { ...item, selectedFilePaths: selectedGameFilePaths };
    return (
      <div style={cellStyle}>
        <ClusterCard
          cluster={item}
          id={item.id}
          isSelected={!!isSelectedCluster}
          onClick={() => onClusterClick && onClusterClick(item)}
          onMouseDown={(e) => onItemMouseDownKey && onItemMouseDownKey(key, e)}
          onContextMenu={(e) => onClusterContextMenu && onClusterContextMenu(e, clusterPayload)}
          draggable={true}
          data-filepath={key}
          onDragStart={(e) => onClusterDragStart && onClusterDragStart(item, e)}
          onDragEnd={onClusterDragEnd}
          className={`cluster-card`}
        />
      </div>
    );
  }

  return <div style={cellStyle} />;
});

const VirtualizedUnifiedGrid = ({
  // 資料
  games = [],
  items: itemsProp = null,
  optimisticHideSet = null,

  // 點擊/右鍵
  onGameClick,
  onGameContextMenu,
  onBlankContextMenu,
  onClusterClick,
  onClusterContextMenu,

  // 拖拽
  onDragStart,
  onDragEnd,
  dragState = { isDragging: false, draggedItem: null, draggedType: null },
  externalDragActive = false,

  // 框選（外控/內控）
  selectionControlled = false,
  selectionProps = {},

  // 其它
  isLoading = false,
  disableFlip = false,
  virtualization = { enabled: true },
  containerClassName = 'desktop-grid',
  gameCardExtraProps = {},
  dragSource = { type: 'desktop', id: null },
}) => {
  const containerRef = React.useRef(null);
  const [gridDimensions, setGridDimensions] = React.useState({
    width: 800,
    height: 600,
    columnCount: 5,
    rowCount: 1,
    itemWidth: ITEM_WIDTH,
  });

  // 框選（統一：同時覆蓋遊戲與簇）
  const sel = useSelectionBox({
    rootRef: containerRef,
    controlled: selectionControlled,
    selectedSet: selectionProps.selectedSet,
    onSelectedChange: selectionProps.onSelectedChange,
    isBlankArea:
      selectionProps.isBlankArea ||
      ((e) => {
        const el = e.target;
        return !(
          el?.closest && el.closest('.game-card, .cluster-card, .folder-card, .context-menu')
        );
      }),
    hitSelector: '.game-card, .cluster-card',
    fadeDuration: FLIP_DURATION,
    gamesList: itemsProp || games,
    enableCachePersistence: true,
  });

  // 準備 clusters 清單供拖拽/右鍵使用
  const clustersList = React.useMemo(
    () => (itemsProp || []).filter?.((x) => x?.type === 'cluster') || [],
    [itemsProp]
  );

  // 從統一選擇集中派生：遊戲 filePaths 與簇 ids（供拖拽與右鍵使用）
  const selectedGameRef = React.useRef(new Set());
  const selectedClustersRef = React.useRef(new Set());
  React.useEffect(() => {
    const keys = sel.selected || new Set();
    const gameSet = new Set();
    const clusterSet = new Set();
    keys.forEach((k) => {
      if (typeof k === 'string') {
        if (k.startsWith('game:')) gameSet.add(k.slice(5));
        else if (k.startsWith('cluster:')) clusterSet.add(k.slice(8));
      }
    });
    selectedGameRef.current = gameSet;
    selectedClustersRef.current = clusterSet;
  }, [sel.selected]);

  // 拖拽會話
  const { handleGameDragStart, handleClusterDragStart, endDragSession } = useDragSession({
    selectedRef: selectedGameRef,
    games,
    source: dragSource,
    clusters: clustersList,
    selectedClustersRef,
  });

  // 統一 Items：若提供 itemsProp 則優先使用；否則由 games 推導
  const items = React.useMemo(() => {
    if (Array.isArray(itemsProp)) return itemsProp;
    return games.map((game) => ({ ...game, type: 'game' }));
  }, [itemsProp, games]);

  // 計算網格尺寸
  const calculateGridDimensions = React.useCallback(() => {
    if (!containerRef.current)
      return { width: 800, height: 600, columnCount: 5, rowCount: 1, itemWidth: ITEM_WIDTH };

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // 使用全寬度，讓 react-window 自己處理滾動條
    const availableWidth = containerWidth;

    // 計算基礎列數（基於最小寬度）
    const minItemWidth = CARD_WIDTH + GRID_GAP; // 120 + 20 = 140
    const baseColumnCount = Math.max(1, Math.floor(availableWidth / minItemWidth));

    // 計算自適應項目寬度（確保整數寬度避免亞像素問題）
    const adaptiveItemWidth = Math.floor(availableWidth / baseColumnCount);

    // 計算實際網格寬度並居中
    const actualGridWidth = baseColumnCount * adaptiveItemWidth;
    const leftOffset = Math.floor((availableWidth - actualGridWidth) / 2);

    const totalItems = items.length;
    const rowCount = Math.max(1, Math.ceil(totalItems / baseColumnCount));

    // 為了避免水平滾動條，暫時移除居中偏移
    // Grid 寬度使用實際計算的網格寬度
    const gridTotalWidth = baseColumnCount * adaptiveItemWidth;

    return {
      width: gridTotalWidth,
      height: containerHeight,
      columnCount: baseColumnCount,
      rowCount,
      itemWidth: adaptiveItemWidth,
      leftOffset: 0, // 暫時移除居中偏移以避免水平滾動條
    };
  }, [items.length]);

  React.useEffect(() => {
    const updateDimensions = () => {
      const gridDimensions = calculateGridDimensions();
      setGridDimensions(gridDimensions);
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => window.removeEventListener('resize', updateDimensions);
  }, [calculateGridDimensions]);

  // 外部要求重設簇選中（例如合簇完成後只保留目標簇）
  React.useEffect(() => {
    const onReset = (e) => {
      try {
        const arr = e && e.detail && Array.isArray(e.detail.ids) ? e.detail.ids : [];
        const clusterKeys = new Set((arr || []).map((id) => `cluster:${String(id)}`));
        sel.setSelected(clusterKeys);
        // 同步 ref 派生
        selectedClustersRef.current = new Set((arr || []).map((id) => String(id)));
        selectedGameRef.current = new Set();
      } catch (_) {}
    };
    window.addEventListener('clusters-selection-reset', onReset);
    return () => window.removeEventListener('clusters-selection-reset', onReset);
  }, [sel.setSelected]);

  const itemCount = items.length;
  const virtEnabled = !!virtualization?.enabled && itemCount >= VIRTUALIZATION_THRESHOLD;
  const rowCount = Math.ceil(itemCount / gridDimensions.columnCount);

  // 事件處理器
  const keyForItem = React.useCallback(
    (it) => (it?.type === 'cluster' ? `cluster:${it.id}` : `game:${it.filePath}`),
    []
  );
  // 延遲建立 key->index 對照，避免在每次重渲染都進行 O(n) 構建
  const keyIndexMapRef = React.useRef(null);
  const buildKeyIndexMap = React.useCallback(() => {
    const map = new Map();
    for (let i = 0; i < items.length; i++) {
      const k = keyForItem(items[i]);
      if (k) map.set(k, i);
    }
    keyIndexMapRef.current = map;
    return map;
  }, [items, keyForItem]);
  const getIndexForKey = React.useCallback(
    (key) => {
      const map = keyIndexMapRef.current || buildKeyIndexMap();
      return map.get(key);
    },
    [buildKeyIndexMap]
  );
  React.useEffect(() => {
    // items 改變時，重置索引映射避免讀取到舊值
    keyIndexMapRef.current = null;
  }, [items, keyForItem]);

  const anchorIndexRef = React.useRef(null);

  const onItemClick = React.useCallback(
    (item) => {
      if (item.type === 'game' && onGameClick) {
        onGameClick(item);
      } else if (item.type === 'cluster' && onClusterClick) {
        onClusterClick(item);
      }
    },
    [onGameClick, onClusterClick]
  );

  const onItemContextMenu = React.useCallback(
    (e, item) => {
      if (item.type === 'game' && onGameContextMenu) {
        const key = `game:${item.filePath}`;
        const selKeys = sel.selected || new Set();
        const selectedGamePaths = Array.from(selKeys)
          .filter((k) => typeof k === 'string' && k.startsWith('game:'))
          .map((k) => k.slice(5));
        const useList =
          selKeys.size > 1 && selKeys.has(key) && selectedGamePaths.length > 0
            ? selectedGamePaths
            : [item.filePath];
        // 附帶簇的多選 ID，支援混合選擇
        const existing = new Set((clustersList || []).map((c) => String(c.id)));
        const clusterIds = Array.from(selKeys)
          .filter((k) => typeof k === 'string' && k.startsWith('cluster:'))
          .map((k) => k.slice(8))
          .filter((id) => existing.has(String(id)));
        onGameContextMenu(e, item, useList, clusterIds);
      } else if (item.type === 'cluster' && onClusterContextMenu) {
        onClusterContextMenu(e, item);
      }
    },
    [onGameContextMenu, onClusterContextMenu, sel.selected]
  );

  const onItemMouseDownKey = React.useCallback(
    (key, e) => {
      try {
        e.stopPropagation();
      } catch (_) {}
      if (e.button === 2) return;
      const curIdx = getIndexForKey(key);
      const hasAnchor = typeof anchorIndexRef.current === 'number' && anchorIndexRef.current >= 0;
      const isSelected = sel.selected.has(key);

      if (e.shiftKey) {
        const anchor = hasAnchor ? anchorIndexRef.current : curIdx;
        const start = Math.min(anchor, curIdx);
        const end = Math.max(anchor, curIdx);
        const range = new Set();
        for (let i = start; i <= end; i++) {
          const k = keyForItem(items[i]);
          if (k) range.add(k);
        }
        sel.setSelected((prev) => {
          if (e.ctrlKey || e.metaKey) {
            const next = new Set(prev);
            for (const k of range) next.add(k);
            return next;
          }
          return range;
        });
        anchorIndexRef.current = anchor;
      } else if (e.ctrlKey || e.metaKey) {
        sel.setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        anchorIndexRef.current = curIdx;
      } else {
        if (isSelected && sel.selected.size > 1) {
          return;
        }
        sel.setSelected(new Set([key]));
        anchorIndexRef.current = curIdx;
      }
    },
    [getIndexForKey, items, keyForItem, sel.selected, sel.setSelected]
  );

  const onItemDragStart = React.useCallback(
    (filePath, e) => {
      const g = games.find((x) => x.filePath === filePath);
      if (!g) return;
      handleGameDragStart(e, g);
      if (onDragStart) onDragStart(g, 'game');
    },
    [games, handleGameDragStart, onDragStart]
  );

  const onItemDragEnd = React.useCallback(
    (e) => {
      try {
        console.log('[DRAG_UI] onItemDragEnd -> endDragSession immediately');
        endDragSession();
      } catch (_) {}
      if (onDragEnd) {
        try {
          onDragEnd(e);
        } catch (_) {}
      }
    },
    [endDragSession, onDragEnd]
  );

  const onClusterDragStart = React.useCallback(
    (cluster, e) => {
      handleClusterDragStart(e, cluster);
      if (onDragStart) onDragStart(cluster, 'cluster');
    },
    [handleClusterDragStart, onDragStart]
  );

  const onClusterDragEnd = React.useCallback(
    (e) => {
      try {
        console.log('[DRAG_UI] onClusterDragEnd -> endDragSession immediately');
        endDragSession();
      } catch (_) {}
      if (onDragEnd) {
        try {
          onDragEnd(e);
        } catch (_) {}
      }
    },
    [endDragSession, onDragEnd]
  );

  // Grid 項目資料
  const itemData = React.useMemo(
    () => ({
      items,
      columns: gridDimensions.columnCount,
      itemWidth: gridDimensions.itemWidth,
      selectedSet: sel.selected,
      clustersList,
      optimisticHideSet,
      onItemClick,
      onItemContextMenu,
      onItemMouseDownKey,
      onItemDragStart,
      onItemDragEnd,
      onClusterDragStart,
      onClusterDragEnd,
      dragState,
      gameCardExtraProps,
      onClusterClick,
      onClusterContextMenu,
      virtEnabled,
    }),
    [
      items,
      gridDimensions.columnCount,
      gridDimensions.itemWidth,
      sel.selected,
      clustersList,
      optimisticHideSet,
      onItemClick,
      onItemContextMenu,
      onItemMouseDownKey,
      onItemDragStart,
      onItemDragEnd,
      onClusterDragStart,
      onClusterDragEnd,
      dragState,
      gameCardExtraProps,
      onClusterClick,
      onClusterContextMenu,
      virtEnabled,
    ]
  );

  // 為 react-window Grid 提供穩定的 itemKey，減少因列數/寬度變化導致的重掛載
  const gridItemKey = React.useCallback(({ columnIndex, rowIndex, data }) => {
    try {
      const idx = rowIndex * (data?.columns || 1) + columnIndex;
      if (!data || !Array.isArray(data.items) || idx >= data.items.length) {
        return `empty:${rowIndex}:${columnIndex}`;
      }
      const it = data.items[idx];
      return it && it.type === 'cluster' ? `cluster:${it.id}` : `game:${it.filePath}`;
    } catch (_) {
      return `cell:${rowIndex}:${columnIndex}`;
    }
  }, []);

  // 右鍵處理
  const onContextMenu = (e) => {
    try {
      e.preventDefault();
    } catch (_) {}
    try {
      e.stopPropagation();
    } catch (_) {}
    onBlankContextMenu && onBlankContextMenu(e);
  };

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
          <div className="empty-icon">
            <img
              src={AppIconSvg}
              alt="J2ME Launcher Icon"
              style={{
                width: '128px',
                height: '128px',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const containerMouseDown = selectionControlled
    ? undefined
    : (e) => {
        // 先交給框選系統處理
        sel.onContainerMouseDown?.(e);
        // 若點擊空白區域（非卡片/菜單），清空簇選中
        try {
          const isOnCard = !!(
            e.target?.closest &&
            e.target.closest('.game-card, .cluster-card, .folder-card, .context-menu')
          );
          const isLeft = e.button === 0;
          if (!isOnCard && isLeft && !(e.ctrlKey || e.metaKey || e.shiftKey)) {
            // 清空：交給 sel，自然清空
            sel.setSelected(new Set());
          }
        } catch (_) {}
      };

  return (
    <div
      className={`${containerClassName} ${sel.boxSelecting || selectionProps.boxSelecting ? 'box-selecting' : ''} ${dragState?.isDragging ? 'dragging' : ''}`}
      ref={containerRef}
      onMouseDown={containerMouseDown}
      onContextMenu={onContextMenu}
      style={{ overflow: 'hidden' }}
    >
      {virtEnabled ? (
        <Grid
          columnCount={gridDimensions.columnCount}
          columnWidth={gridDimensions.itemWidth}
          height={gridDimensions.height}
          rowCount={rowCount}
          rowHeight={ITEM_HEIGHT}
          width={gridDimensions.width}
          itemData={itemData}
          itemKey={gridItemKey}
          overscanRowCount={1}
          overscanColumnCount={1}
          useIsScrolling
          style={{
            overflowX: 'hidden',
            marginLeft: gridDimensions.leftOffset || 0,
          }}
        >
          {GridCell}
        </Grid>
      ) : (
        <div
          className="regular-grid-wrapper"
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          <div
            className="regular-grid"
            style={{
              position: 'relative',
              width: gridDimensions.width,
              height: rowCount * ITEM_HEIGHT,
              marginLeft: gridDimensions.leftOffset,
            }}
          >
            {items.map((item, index) => {
              const columnIndex = index % gridDimensions.columnCount;
              const rowIndex = Math.floor(index / gridDimensions.columnCount);
              const style = {
                position: 'absolute',
                left: columnIndex * gridDimensions.itemWidth,
                top: rowIndex * ITEM_HEIGHT,
                width: gridDimensions.itemWidth,
                height: ITEM_HEIGHT,
              };

              const key = item.type === 'cluster' ? `cluster:${item.id}` : `game:${item.filePath}`;
              return (
                <GridCell
                  key={key}
                  columnIndex={columnIndex}
                  rowIndex={rowIndex}
                  style={style}
                  data={itemData}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 框選矩形 */}
      {selectionControlled
        ? selectionProps.boxSelecting && selectionProps.selectionRect
          ? createPortal(
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
              />,
              document.body
            )
          : null
        : sel.boxSelecting
          ? createPortal(
              <div
                ref={sel.selectionBoxRef}
                className={`selection-rect ${sel.selectionFading ? 'fade-out' : ''}`}
                style={{
                  position: 'fixed',
                  left: 0,
                  top: 0,
                  width: 0,
                  height: 0,
                  pointerEvents: 'none',
                }}
              />,
              document.body
            )
          : null}
    </div>
  );
};

export default VirtualizedUnifiedGrid;
