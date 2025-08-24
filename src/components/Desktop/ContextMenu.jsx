import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * 右鍵菜單組件
 * 提供統一的上下文菜單系統
 */
const ContextMenu = ({
  position,
  targetItem,
  menuType,
  onCreateFolder,
  onOpenFolder,
  onEditFolder,
  onRenameFolder,
  onDeleteFolder,
  onFolderSettings,
  onRemoveFromFolder,
  onAddToFolder,
  onGameLaunch,
  onGameConfigure,
  onGameInfo,
  onRefresh,
  onCreateShortcut,
  onClose
}) => {
  const menuRef = useRef(null);

  // 調整菜單位置，確保不會超出屏幕邊界
  useLayoutEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let { x, y } = position;

      // 如果菜單超出右邊界，向左調整
      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 10;
      }

      // 如果菜單超出下邊界，向上調整
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 10;
      }

      menu.style.left = `${Math.max(10, x)}px`;
      menu.style.top = `${Math.max(10, y)}px`;
      // 顯示菜單（初始為隱藏，避免位置跳動）
      menu.style.visibility = 'visible';
      // 觸發漸入動畫
      menu.classList.add('open');
    }
    return () => {
      if (menuRef.current) {
        menuRef.current.classList.remove('open');
      }
    };
  }, [position]);

  // 處理菜單項點擊
  const handleMenuClick = (action, event) => {
    event.stopPropagation();
    
    switch (action) {
      case 'create-folder':
        onCreateFolder && onCreateFolder();
        break;
      case 'open-folder':
        onOpenFolder && onOpenFolder(targetItem);
        break;
      case 'edit-folder':
        onEditFolder && onEditFolder(targetItem);
        break;
      case 'delete-folder':
        onDeleteFolder && onDeleteFolder(targetItem);
        break;
      case 'remove-from-folder':
        onRemoveFromFolder && onRemoveFromFolder(targetItem);
        break;
      case 'add-to-folder':
        try {
          console.debug('[ContextMenu] add-to-folder clicked, targetItem=', targetItem?.filePath || targetItem);
        } catch (_) {}
        onAddToFolder && onAddToFolder(targetItem);
        break;
      case 'launch-game':
        onGameLaunch && onGameLaunch(targetItem);
        break;
      case 'game-info':
        try {
          console.debug('[ContextMenu] game-info clicked:', targetItem);
          onGameInfo && onGameInfo(targetItem);
        } catch (err) {
          console.error('[ContextMenu] game-info handler error:', err);
        }
        break;
      case 'game-config':
        try {
          onGameConfigure && onGameConfigure(targetItem);
        } catch (err) {
          console.error('[ContextMenu] game-config handler error:', err);
        }
        break;
      case 'create-shortcut':
        try {
          onCreateShortcut && onCreateShortcut(targetItem);
        } catch (err) {
          console.error('[ContextMenu] create-shortcut handler error:', err);
        }
        break;
      default:
        break;
    }
    
    onClose && onClose();
  };

  // 渲染菜單項
  const renderMenuItem = (label, action, icon, disabled = false) => (
    <div
      key={action}
      className={`context-menu-item ${disabled ? 'disabled' : ''}`}
      onClick={disabled ? undefined : (e) => handleMenuClick(action, e)}
    >
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{label}</span>
    </div>
  );

  // 根據菜單類型渲染不同的菜單項
  const renderMenuItems = () => {
    switch (menuType) {
      case 'desktop':
        return [
          renderMenuItem('新建資料夾', 'create-folder', '📁'),
          renderMenuItem('刷新', 'refresh', '🔄'),
        ];

      case 'folder':
        return [
          renderMenuItem('打開', 'open-folder', '📂'),
          renderMenuItem('設定', 'edit-folder', '⚙️'),
          renderMenuItem('刪除', 'delete-folder', '🗑️'),
        ];

      case 'game':
      case 'game-folder':
      case 'game-grid': {
        const isPlainGame = menuType === 'game';
        const list = [renderMenuItem('啟動', 'launch-game', '⚔️')];
        const middle = [];
        if (isPlainGame) {
          const add = renderMenuItem('加入', 'add-to-folder', '📁');
          add && middle.push(add);
        }
        if (targetItem?.folderInfo) {
          middle.push(renderMenuItem('移除', 'remove-from-folder', '📤'));
        }
        if (middle.length > 0) {
          list.push(...middle);
        }
        // 捷徑建立
        list.push(renderMenuItem('捷徑', 'create-shortcut', '🔗'));
        list.push(renderMenuItem('配置', 'game-config', '⚙️'));
        list.push(renderMenuItem('資訊', 'game-info', 'ℹ️'));
        return list.filter(Boolean);
      }

      default:
        return [];
    }
  };

  return createPortal(
    (
      <div
        ref={menuRef}
        className="context-menu"
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 9999,
          visibility: 'hidden',
          willChange: 'top, left, transform'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {renderMenuItems()}
      </div>
    ),
    document.body
  );
};

export default ContextMenu;
