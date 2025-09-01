import React from 'react';
import { createPortal } from 'react-dom';
import { FixedSizeGrid as Grid } from 'react-window';
import GameCard from '../GameCard';
import FolderCard from '../Folder/FolderCard';
import { CARD_WIDTH, CARD_HEIGHT, GRID_GAP, ITEM_WIDTH, ITEM_HEIGHT, VIRTUALIZATION_THRESHOLD, FLIP_DURATION } from '@config/perf';
import useSelectionBox from './hooks/useSelectionBox';
import useDragSession from './hooks/useDragSession';

/**
 * VirtualizedUnifiedGrid - React-window 真正虛擬化實現
 * 替代原有的偽虛擬化系統，提供真正的性能優化
 */

// Grid Cell 渲染器
const GridCell = React.memo(({ columnIndex, rowIndex, style, data }) => {
  const { items, columns, itemWidth, selectedSet, onItemClick, onItemContextMenu, onItemMouseDown, onItemDragStart, onItemDragEnd, dragState, gameCardExtraProps } = data;
  const index = rowIndex * columns + columnIndex;
  
  if (index >= items.length) return <div style={style} />;
  
  const item = items[index];
  const isSelected = selectedSet?.has(item.type === 'folder' ? item.id : item.filePath);
  const isDraggingSelf = dragState?.isDragging && dragState?.draggedType === item.type && 
    (item.type === 'folder' ? dragState?.draggedItem?.id === item.id : dragState?.draggedItem?.filePath === item.filePath);

  // 調整樣式以匹配自適應寬度
  const cellStyle = {
    ...style,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${GRID_GAP / 2}px`,
  };

  if (item.type === 'folder') {
    return (
      <div style={cellStyle}>
        <FolderCard
          folder={item}
          onClick={() => onItemClick?.(item)}
          onContextMenu={(e) => onItemContextMenu?.(e, item)}
          className="folder-card"
          data-folderid={item.id}
        />
      </div>
    );
  }

  if (item.type === 'game') {
    const extra = (typeof gameCardExtraProps === 'function') ? (gameCardExtraProps(item) || {}) : (gameCardExtraProps || {});
    const isSelected = selectedSet.has(item.filePath);
    const isDraggingSelf = dragState.isDragging && dragState.draggedItem?.filePath === item.filePath;

    return (
      <div style={cellStyle}>
        <GameCard
          game={item}
          filePath={item.filePath}
          isSelected={isSelected}
          draggable={true}
          data-filepath={item.filePath}
          onLaunchById={() => onItemClick?.(item)}
          onDragStartById={(filePath, e) => onItemDragStart?.(filePath, e)}
          onDragEnd={onItemDragEnd}
          onMouseDownById={(filePath, e) => onItemMouseDown?.(filePath, e)}
          onContextMenu={(e) => onItemContextMenu?.(e, item)}
          className={`game-card ${isDraggingSelf ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
          {...extra}
        />
      </div>
    );
  }

  return <div style={cellStyle} />;
});

const VirtualizedUnifiedGrid = ({
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
  const [gridDimensions, setGridDimensions] = React.useState({ width: 800, height: 600, columnCount: 5, rowCount: 1, itemWidth: ITEM_WIDTH });

  // 框選
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
    gamesList: games,
    enableCachePersistence: true,
    // 傳遞偏移量給框選系統
    containerOffset: { left: gridDimensions.leftOffset || 0, top: 0 },
  });

  // 拖拽會話
  const selectedRef = React.useRef(new Set());
  React.useEffect(() => { selectedRef.current = sel.selected; }, [sel.selected]);
  const { handleGameDragStart, endDragSession } = useDragSession({ selectedRef, games, source: dragSource });

  // 合併並標記項目類型
  const items = React.useMemo(() => {
    const result = [];
    folders.forEach(folder => result.push({ ...folder, type: 'folder' }));
    games.forEach(game => result.push({ ...game, type: 'game' }));
    return result;
  }, [folders, games]);

  // 計算網格尺寸
  const calculateGridDimensions = React.useCallback(() => {
    if (!containerRef.current) return { width: 800, height: 600, columnCount: 5, rowCount: 1, itemWidth: ITEM_WIDTH };
    
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    
    // 預留滾動條空間以避免橫向滾動
    const scrollbarWidth = 17;
    const availableWidth = containerWidth - scrollbarWidth;
    
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
    
    return {
      width: actualGridWidth,
      height: containerHeight,
      columnCount: baseColumnCount,
      rowCount,
      itemWidth: adaptiveItemWidth,
      leftOffset
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

  const itemCount = items.length;
  const virtEnabled = !!(virtualization?.enabled) && itemCount >= VIRTUALIZATION_THRESHOLD;
  const rowCount = Math.ceil(itemCount / gridDimensions.columnCount);

  // 事件處理器
  const gameIndexMap = React.useMemo(() => {
    const map = new Map();
    for (let i = 0; i < games.length; i++) {
      map.set(games[i]?.filePath, i);
    }
    return map;
  }, [games]);

  const anchorIndexRef = React.useRef(null);

  const onItemClick = React.useCallback((item) => {
    if (item.type === 'folder' && onFolderOpen) {
      onFolderOpen(item);
    } else if (item.type === 'game' && onGameClick) {
      onGameClick(item);
    }
  }, [onFolderOpen, onGameClick]);

  const onItemContextMenu = React.useCallback((e, item) => {
    if (item.type === 'folder' && onFolderContextMenu) {
      onFolderContextMenu(e, item);
    } else if (item.type === 'game' && onGameContextMenu) {
      let useList = [item.filePath];
      try {
        const has = sel.selected && sel.selected.has && sel.selected.has(item.filePath);
        const cur = Array.from(sel.selected || []);
        if (has && cur.length > 0) useList = cur;
        if (!has) {
          try { sel.setSelected && sel.setSelected(new Set([item.filePath])); } catch (_) {}
        }
      } catch (_) {}
      onGameContextMenu(e, { ...item, selectedFilePaths: useList });
    }
  }, [onFolderContextMenu, onGameContextMenu, sel.selected, sel.setSelected]);

  const onItemMouseDown = React.useCallback((filePath, e) => {
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

  const onItemDragStart = React.useCallback((filePath, e) => {
    const g = games.find(x => x.filePath === filePath);
    if (!g) return;
    handleGameDragStart(e, g);
    if (onDragStart) onDragStart(g, 'game');
  }, [games, handleGameDragStart, onDragStart]);

  const onItemDragEnd = React.useCallback((e) => {
    try { setTimeout(() => { try { endDragSession(); } catch (_) {} }, 800); } catch (_) {}
    if (onDragEnd) {
      try { setTimeout(() => { try { onDragEnd(e); } catch (_) {} }, 150); } catch (_) {}
    }
  }, [endDragSession, onDragEnd]);

  // Grid 項目資料
  const itemData = React.useMemo(() => ({
    items,
    columns: gridDimensions.columnCount,
    itemWidth: gridDimensions.itemWidth,
    selectedSet: sel.selected,
    onItemClick,
    onItemContextMenu,
    onItemMouseDown,
    onItemDragStart,
    onItemDragEnd,
    dragState,
    gameCardExtraProps
  }), [items, gridDimensions.columnCount, gridDimensions.itemWidth, sel.selected, onItemClick, onItemContextMenu, onItemMouseDown, onItemDragStart, onItemDragEnd, dragState, gameCardExtraProps]);

  // 右鍵處理
  const onContextMenu = (e) => {
    try { e.preventDefault(); } catch (_) {}
    try { e.stopPropagation(); } catch (_) {}
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
          <div className="empty-icon">📁</div>
        </div>
      </div>
    );
  }

  const containerMouseDown = selectionControlled ? undefined : sel.onContainerMouseDown;

  return (
    <div
      className={`${containerClassName} ${sel.boxSelecting || selectionProps.boxSelecting ? 'box-selecting' : ''} ${dragState?.isDragging ? 'dragging' : ''}`}
      ref={containerRef}
      onMouseDown={containerMouseDown}
      onContextMenu={onContextMenu}
      style={{ scrollbarGutter: 'stable', overflow: 'hidden auto' }}
    >
      {virtEnabled ? (
        <div style={{ marginLeft: gridDimensions.leftOffset || 0 }}>
          <Grid
            columnCount={gridDimensions.columnCount}
            columnWidth={gridDimensions.itemWidth}
            height={gridDimensions.height}
            rowCount={rowCount}
            rowHeight={ITEM_HEIGHT}
            width={gridDimensions.width}
            itemData={itemData}
            overscanRowCount={2}
            overscanColumnCount={1}
          >
            {GridCell}
          </Grid>
        </div>
      ) : (
        <div className="regular-grid" style={{ 
          position: 'relative',
          width: gridDimensions.width,
          height: gridDimensions.height,
          marginLeft: gridDimensions.leftOffset
        }}>
          {items.map((item, index) => {
            const columnIndex = index % gridDimensions.columnCount;
            const rowIndex = Math.floor(index / gridDimensions.columnCount);
            const style = {
              position: 'absolute',
              left: columnIndex * gridDimensions.itemWidth,
              top: rowIndex * ITEM_HEIGHT,
              width: gridDimensions.itemWidth,
              height: ITEM_HEIGHT
            };
            
            return (
              <GridCell
                key={item.type === 'folder' ? `folder:${item.id}` : `game:${item.filePath}`}
                columnIndex={columnIndex}
                rowIndex={rowIndex}
                style={style}
                data={itemData}
              />
            );
          })}
        </div>
      )}

      {/* 框選矩形 */}
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

export default VirtualizedUnifiedGrid;
