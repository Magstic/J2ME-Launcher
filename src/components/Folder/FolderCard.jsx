import React from 'react';
import './Folder.css';

/**
 * 資料夾卡片組件
 * 在抽屜中顯示資料夾，支持拖拽放置和雙擊打開
 */
const FolderCard = ({
  folder,
  onClick,
  onContextMenu,
  onDragOver,
  onDrop,
  isDropTarget = false,
  className = '',
  disableAppear = false,
  ...rest
}) => {
  // 初次掛載時的輕量級進場動畫（可禁用）
  const [appearing, setAppearing] = React.useState(!disableAppear);
  React.useEffect(() => {
    if (disableAppear) return;
    const id = requestAnimationFrame(() => setAppearing(false));
    return () => cancelAnimationFrame(id);
  }, [disableAppear]);
  // 處理雙擊打開資料夾
  const handleDoubleClick = (event) => {
    event.preventDefault();
    onClick && onClick(folder);
  };

  // 處理右鍵菜單
  const handleContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu && onContextMenu(event);
  };

  // 處理拖拽懸停
  const handleDragOver = (event) => {
    if (onDragOver) {
      onDragOver(event);
    }
  };

  // 處理拖拽放置
  const handleDrop = (event) => {
    if (onDrop) {
      onDrop(event);
    }
  };

  // 獲取資料夾圖標
  const getFolderIcon = () => {
    if (folder.icon && folder.icon !== 'folder') {
      return folder.icon;
    }
    return '📁';
  };

  // 獲取資料夾顏色
  const getFolderColor = () => {
    return folder.color || '#4a90e2';
  };

  return (
    <div
      className={`folder-card ${className} ${isDropTarget ? 'drop-target' : ''} ${appearing ? 'appearing' : ''}`}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        '--folder-color': getFolderColor(),
      }}
      title={folder.description || folder.name}
      {...rest}
    >
      {/* 資料夾圖標 */}
      <div className="folder-icon">
        <span className="folder-emoji">{getFolderIcon()}</span>
        <div className="folder-badge" style={{ backgroundColor: getFolderColor() }}>
          {folder.gameCount || 0}
        </div>
      </div>

      {/* 資料夾名稱 */}
      <div className="folder-name">{folder.name}</div>
    </div>
  );
};

export default React.memo(FolderCard);
