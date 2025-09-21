import React from 'react';

function ClusterCard({
  cluster,
  id,
  onClick,
  onContextMenu,
  className = '',
  draggable = false,
  isSelected = false,
  isDraggingSelf = false,
  disableAppear = false,
  ...rest
}) {
  const iconSrc = cluster.iconUrl || '/icon.png';

  const [isDragging, setIsDragging] = React.useState(false);
  const [appearing, setAppearing] = React.useState(!disableAppear);
  React.useEffect(() => {
    if (disableAppear) return;
    const id = requestAnimationFrame(() => setAppearing(false));
    return () => cancelAnimationFrame(id);
  }, [disableAppear]);

  const handleDoubleClick = (e) => {
    if (onClick) onClick(e, cluster);
  };

  return (
    <div
      className={`game-card cluster ${className} ${isDraggingSelf || isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''} ${appearing ? 'appearing' : ''}`}
      onMouseDown={rest.onMouseDown}
      onContextMenu={(e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (_) {}
        onContextMenu && onContextMenu(e, cluster);
      }}
      onDoubleClick={handleDoubleClick}
      draggable={draggable}
      title={`${cluster.name || 'Cluster'}${cluster.memberCount ? ` (${cluster.memberCount})` : ''}`}
      {...rest}
    >
      <div className="game-icon-container" style={{ position: 'relative' }}>
        <img src={iconSrc} alt={cluster.name || '簇'} className="game-icon" draggable="false" />
        {/* 右上角：簇角標（使用與 GameCard folder-badge 相同風格） */}
        <div
          className="cluster-badge"
          title="簇"
          aria-label="簇"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            padding: '0 4px',
            borderRadius: 9,
            background: 'var(--scrim-60)',
            color: '#fff',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'translateZ(0)',
            boxShadow: '0 1px 2px var(--scrim-35)',
          }}
        >
          {/* 簇小圖示：三層堆疊方塊 */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="3" y="9" width="8" height="8" rx="1" fill="#00BCD4" />
            <rect x="8" y="5" width="8" height="8" rx="1" fill="#03A9F4" />
            <rect x="13" y="1" width="8" height="8" rx="1" fill="#3F51B5" />
          </svg>
        </div>

        {/* 右下角：成員數 */}
        {typeof cluster.memberCount === 'number' ? (
          <div
            className="cluster-count-badge"
            title="成員數"
            aria-label="成員數"
            style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              minWidth: 22,
              height: 18,
              padding: '0 6px',
              borderRadius: 10,
              background: 'var(--scrim-60)',
              color: '#fff',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px var(--scrim-35)',
            }}
          >
            {cluster.memberCount}
          </div>
        ) : null}
      </div>

      <div className="game-info">
        <h3 className="game-name" title={cluster.name}>
          {cluster.name || 'Cluster'}
        </h3>
      </div>
    </div>
  );
}

export default React.memo(ClusterCard);
