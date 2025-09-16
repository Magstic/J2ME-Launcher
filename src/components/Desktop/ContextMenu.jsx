import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../contexts/I18nContext';
import useOutsideClick from '@shared/hooks/useOutsideClick';

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
  // Cluster entry actions from games
  onCreateCluster,
  onAddToCluster,
  // Cluster callbacks
  onClusterInfo,
  onRenameCluster,
  onDeleteCluster,
  onMergeCluster,
  onConsolidateClusters,
  onAddClusterToFolder,
  onRemoveClusterFromFolder,
  // Cluster member (inside ClusterDialog) callbacks
  onClusterMemberSetPrimary,
  onClusterMemberRemove,
  onClose,
  zIndex = 9999,
}) => {
  const menuRef = useRef(null);
  const { t } = useI18n();

  // Close when clicking outside the menu
  useOutsideClick(menuRef, () => {
    onClose && onClose();
  }, { events: ['pointerdown', 'mousedown', 'click'], capture: true });

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
      case 'create-cluster':
        try {
          onCreateCluster && onCreateCluster(targetItem);
        } catch (err) {
          console.error('[ContextMenu] create-cluster handler error:', err);
        }
        break;
      case 'add-to-cluster':
        try {
          onAddToCluster && onAddToCluster(targetItem);
        } catch (err) {
          console.error('[ContextMenu] add-to-cluster handler error:', err);
        }
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

      // ===== Cluster actions =====
      case 'cluster-open':
        try { onClusterInfo && onClusterInfo(targetItem); } catch (err) { console.error('[ContextMenu] cluster-open handler error:', err); }
        break;
      case 'cluster-info':
        try { onClusterInfo && onClusterInfo(targetItem); } catch (err) { console.error('[ContextMenu] cluster-info handler error:', err); }
        break;
      case 'cluster-delete':
        try { onDeleteCluster && onDeleteCluster(targetItem); } catch (err) { console.error('[ContextMenu] cluster-delete handler error:', err); }
        break;
      case 'cluster-rename':
        try { onRenameCluster && onRenameCluster(targetItem); } catch (err) { console.error('[ContextMenu] cluster-rename handler error:', err); }
        break;
      case 'cluster-consolidate':
        try { onConsolidateClusters && onConsolidateClusters(targetItem); } catch (err) { console.error('[ContextMenu] cluster-consolidate handler error:', err); }
        break;
      case 'cluster-add-to-folder':
        try { onAddClusterToFolder && onAddClusterToFolder(targetItem); } catch (err) { console.error('[ContextMenu] cluster-add-to-folder handler error:', err); }
        break;
      case 'cluster-remove-from-folder':
        try { onRemoveClusterFromFolder && onRemoveClusterFromFolder(targetItem); } catch (err) { console.error('[ContextMenu] cluster-remove-from-folder handler error:', err); }
        break;
      case 'cluster-member-set-primary':
        try { onClusterMemberSetPrimary && onClusterMemberSetPrimary(targetItem); } catch (err) { console.error('[ContextMenu] cluster-member-set-primary handler error:', err); }
        break;
      case 'cluster-member-remove':
        try { onClusterMemberRemove && onClusterMemberRemove(targetItem); } catch (err) { console.error('[ContextMenu] cluster-member-remove handler error:', err); }
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
      case 'folder':
        return [
          renderMenuItem(t('contextMenu.open'), 'open-folder', '📂'),
          renderMenuItem(t('contextMenu.config'), 'edit-folder', '⚙️'),
          renderMenuItem(t('contextMenu.delete'), 'delete-folder', '🗑️'),
        ];

      case 'game':
      case 'game-folder':
      case 'game-grid': {
        const isPlainGame = menuType === 'game';
        const list = [renderMenuItem(t('contextMenu.launch'), 'launch-game', '⚔️')];
        // 建立簇（使用當前選集或單個項目）
        list.push(renderMenuItem(t('contextMenu.create-cluster'), 'create-cluster', '🧩'));
        // 加入到既有簇（彈出簇選擇器）
        list.push(renderMenuItem(t('contextMenu.add-to-cluster'), 'add-to-cluster', '➕'));
        const middle = [];
        if (isPlainGame) {
          const add = renderMenuItem(t('contextMenu.like'), 'add-to-folder', '📁');
          add && middle.push(add);
        }
        if (targetItem?.folderInfo) {
          // 更清楚：從資料夾移除（不要用「刪除」避免與刪除簇混淆）
          middle.push(renderMenuItem(t('contextMenu.delete'), 'remove-from-folder', '📤'));
        }
        if (middle.length > 0) {
          list.push(...middle);
        }
        // 捷徑建立
        list.push(renderMenuItem(t('contextMenu.shortcut'), 'create-shortcut', '🔗'));
        list.push(renderMenuItem(t('contextMenu.config'), 'game-config', '⚙️'));
        list.push(renderMenuItem(t('contextMenu.info'), 'game-info', 'ℹ️'));
        return list.filter(Boolean);
      }

      case 'cluster': {
        // Desktop cluster menu
        const list = [];
        const multi = Array.isArray(targetItem?.selectedClusterIds) && targetItem.selectedClusterIds.length >= 2;
        list.push(renderMenuItem(t('contextMenu.open'), 'cluster-open', '🧩'));
        list.push(renderMenuItem(t('contextMenu.rename'), 'cluster-rename', '✏️'));
        if (multi) list.push(renderMenuItem(t('contextMenu.consolidate'), 'cluster-consolidate', '🔀'));
        // 新增：將簇加入到資料夾（與遊戲相同語意，沿用 like『加入』）
        list.push(renderMenuItem(t('contextMenu.like'), 'cluster-add-to-folder', '📁'));
        list.push(renderMenuItem(t('contextMenu.delete-cluster'), 'cluster-delete', '🗑️'));
        return list.filter(Boolean);
      }

      case 'cluster-folder': {
        // Folder view cluster menu
        const list = [];
        const multi = Array.isArray(targetItem?.selectedClusterIds) && targetItem.selectedClusterIds.length >= 2;
        list.push(renderMenuItem(t('contextMenu.open'), 'cluster-open', '🧩'));
        list.push(renderMenuItem(t('contextMenu.rename'), 'cluster-rename', '✏️'));
        if (multi) list.push(renderMenuItem(t('contextMenu.consolidate'), 'cluster-consolidate', '🔀'));
        // 清楚標示「刪除簇」與「從資料夾移除簇」，避免誤操作
        list.push(renderMenuItem(t('contextMenu.delete-cluster'), 'cluster-delete', '🗑️'));
        list.push(renderMenuItem(t('contextMenu.delete'), 'cluster-remove-from-folder', '📤'));
        return list.filter(Boolean);
      }

      case 'cluster-member': {
        // Context menu for a game member inside a cluster dialog
        const list = [];
        list.push(renderMenuItem(t('contextMenu.launch'), 'launch-game', '⚔️'));
        list.push(renderMenuItem(t('contextMenu.shortcut'), 'create-shortcut', '🔗'));
        list.push(renderMenuItem(t('contextMenu.config'), 'game-config', '⚙️'));
        list.push(renderMenuItem(t('contextMenu.info'), 'game-info', 'ℹ️'));
        list.push(renderMenuItem(t('contextMenu.set-primary'), 'cluster-member-set-primary', '📌'));
        list.push(renderMenuItem(t('contextMenu.delete'), 'cluster-member-remove', '📤'));
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
          zIndex: zIndex,
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
