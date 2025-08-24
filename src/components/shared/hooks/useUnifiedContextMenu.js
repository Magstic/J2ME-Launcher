// 統一右鍵菜單 Hook：包裝現有 Common/useContextMenu 與 Desktop/ContextMenu
// 目的：用單一 openMenu API，根據視圖與目標類型自動選擇 menuType 並注入必要欄位
// - 保留現有 ContextMenu 的行為與項目條件（如：game-folder 顯示「移除」、game 顯示「加入」）
// - 不改動任何現有文件
import { useCallback } from 'react';
import useContextMenu from '../../Common/useContextMenu.jsx';

/**
 * useUnifiedContextMenu
 * @param {Object} callbacks 與現有 ContextMenu props 對齊
 *   onCreateFolder,onOpenFolder,onEditFolder,onRenameFolder,onDeleteFolder,onFolderSettings,
 *   onRemoveFromFolder,onAddToFolder,onGameLaunch,onGameConfigure,onGameInfo,onRefresh
 * @returns {{ ContextMenuElement: import('react').ReactNode, openMenu: Function, closeMenu: Function }}
 */
export default function useUnifiedContextMenu(callbacks = {}) {
  const { ContextMenuElement, openContextMenu, closeContextMenu } = useContextMenu(callbacks);

  /**
   * openMenu
   * @param {MouseEvent} event
   * @param {any} target 原始目標（game 或 folder 或 null）
   * @param {Object} ctx
   * @param {'desktop'|'folder-window'} ctx.view 當前視圖
   * @param {'blank'|'game'|'folder'|'game-grid'} ctx.kind 目標類型
   * @param {Object=} ctx.extra 額外資訊（例如 folderId）
   */
  const openMenu = useCallback((event, target, ctx) => {
    if (!ctx || !ctx.view || !ctx.kind) return;

    let menuType = null;
    let finalTarget = target;

    if (ctx.view === 'desktop') {
      if (ctx.kind === 'blank') return; // 停用桌面空白區域右鍵菜單
      else if (ctx.kind === 'folder') menuType = 'folder';
      else if (ctx.kind === 'game') menuType = 'game';
      else if (ctx.kind === 'game-grid') menuType = 'game-grid';
    } else if (ctx.view === 'folder-window') {
      if (ctx.kind === 'game') {
        // 在資料夾視圖中，遊戲應使用 game-folder，並帶上 folderInfo 以顯示「移除」
        menuType = 'game-folder';
        if (finalTarget && !finalTarget.folderInfo && ctx.extra?.folderId != null) {
          finalTarget = { ...finalTarget, folderInfo: { folderId: ctx.extra.folderId } };
        }
      } else if (ctx.kind === 'game-grid') {
        menuType = 'game-grid';
      } else if (ctx.kind === 'blank') {
        // 目前資料夾視圖空白區域不顯示菜單，保持現狀。如需顯示可將其映射為 'desktop' 並在 ContextMenu 中增加條件過濾
        return;
      }
    }

    if (!menuType) return;
    openContextMenu(event, finalTarget, menuType);
  }, [openContextMenu]);

  return {
    ContextMenuElement,
    openMenu,
    closeMenu: closeContextMenu,
  };
}
