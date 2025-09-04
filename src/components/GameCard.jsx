import React from 'react';

function GameCard({ 
  game,
  filePath,
  // 穩定的 id-based handlers，由父層 useCallback 提供
  onLaunchById,
  onDragStartById,
  onDragEnd,
  onMouseDownById,
  // 兼容舊版 props
  onClick,
  onContextMenu,
  draggable = false,
  className = '',
  isSelected = false,
  isDraggingSelf = false,
  disableAppear = false,
  hasFolder = false,
  ...rest
}) {
  // 如果 game.iconUrl 不存在，則使用 public 目錄下的主圖標作為備用
  // 這是 Vite 處理靜態資源的正確方式
  const iconSrc = game.iconUrl || '/icon.png';

  // 簡化拖拽狀態管理
  const [isDragging, setIsDragging] = React.useState(false);
  // 初次掛載時的輕量級進場動畫（可禁用）
  const [appearing, setAppearing] = React.useState(!disableAppear);
  React.useEffect(() => {
    if (disableAppear) return;
    const id = requestAnimationFrame(() => setAppearing(false));
    return () => cancelAnimationFrame(id);
  }, [disableAppear]);

  // 單擊交給父層（onMouseDownById 會處理多選/範圍選），這裡只處理雙擊啟動
  const handleDoubleClick = (event) => {
    if (onLaunchById) {
      onLaunchById(filePath || game.filePath);
    } else if (onClick) {
      onClick(event, game);
    }
  };

  // 處理拖拽開始
  const handleDragStart = (event) => {
    if (draggable) {
      setIsDragging(true);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify({ game, type: 'game' }));
      onDragStartById && onDragStartById(filePath || game.filePath, event);
    }
  };

  // 處理拖拽結束
  const handleDragEnd = (event) => {
    if (draggable) {
      setIsDragging(false);
      onDragEnd && onDragEnd(event, game);
    }
  };

  return (
    <div 
      className={`game-card ${className} ${isDraggingSelf || isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''} ${appearing ? 'appearing' : ''}`}
      onMouseDown={(e) => onMouseDownById && onMouseDownById(filePath || game.filePath, e)}
      onClick={(e) => { if (onClick) onClick(e, game); }}
      onContextMenu={(e) => { if (onContextMenu) { try { e.preventDefault(); e.stopPropagation(); } catch (_) {} onContextMenu(e, game); } }}
      onDoubleClick={handleDoubleClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={`${game.gameName}${game.vendor ? ` - ${game.vendor}` : ''}${game.version ? ` v${game.version}` : ''}`}
      {...rest}
    >
      <div className="game-icon-container" style={{ position: 'relative' }}>
        <img 
          src={iconSrc}
          alt={game.gameName || '遊戲'}
          className="game-icon"
          draggable="false"
        />
        {hasFolder ? (
          <div
            className="folder-badge"
            title="已加入資料夾"
            aria-label="已加入資料夾"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: 9,
              background: 'var(--scrim-60)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'translateZ(0)',
              willChange: 'opacity, transform',
              boxShadow: '0 1px 2px var(--scrim-35)'
            }}
          >
            {/* 使用輕量 SVG，避免字型或平台 emoji 差異 */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 6.5C3 5.12 4.12 4 5.5 4H9l2 2h7.5C19.88 6 21 7.12 21 8.5V17c0 1.66-1.34 3-3 3H6c-1.66 0-3-1.34-3-3V6.5z" fill="#FFC107"/>
              <path d="M4 8h16v2H4z" fill="#FFB300"/>
            </svg>
          </div>
        ) : null}
      </div>
      
      <div className="game-info">
        <h3 className="game-name" title={game.gameName}>
          {game.gameName || 'Unknown Game'}
        </h3>
      </div>
    </div>
  );
}

export default React.memo(GameCard);
