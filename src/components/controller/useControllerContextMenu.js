// 控制器模式 專用右鍵/操作 選單 Hook
// 將控制器模式的選單邏輯集中在這裡，便於未來擴展與維護
// 內部使用統一選單封裝 useUnifiedContextMenu，並固定使用 kind: 'game-grid'

import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';

/**
 * useControllerContextMenu
 * @param {Object} callbacks - 與通用選單回調對齊
 *  可包含：onGameLaunch, onAddToFolder, onGameInfo, onGameConfigure, onRefresh 等
 * @returns {{ ContextMenuElement: import('react').ReactNode, openGameMenu: Function, closeMenu: Function }}
 */
export default function useControllerContextMenu(callbacks = {}) {
  const { ContextMenuElement, openMenu, closeMenu } = useUnifiedContextMenu(callbacks);

  // 控制器模式下，打開某個遊戲卡片的選單
  const openGameMenu = (event, game) => {
    // 視為桌面上下文中的 "game-grid" 選單
    openMenu(event, game, { view: 'desktop', kind: 'game-grid' });
  };

  return { ContextMenuElement, openGameMenu, closeMenu };
}
