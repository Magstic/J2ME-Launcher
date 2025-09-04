import React from 'react';
import VirtualizedUnifiedGrid from '@shared/VirtualizedUnifiedGrid';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
import useCreateShortcut from '@shared/hooks/useCreateShortcut';
import { useSelectedGames } from '@hooks/useGameStore';

/**
 * DesktopGrid.Unified
 * 薄封裝：將 DesktopView 目前傳遞給 DesktopGrid 的參數，映射到 UnifiedGrid。
 * 右鍵菜單採用 useUnifiedContextMenu，保持「桌面」的條目集合與行為。
 */
const DesktopGridUnified = ({
  // 資料
  games = [],
  folders = [],

  // 動作回調（沿用 DesktopView 的命名）
  onGameSelect,
  onFolderOpen,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onAddToFolder,
  onGameInfo,
  onRefresh,

  // 拖拽/選取/狀態
  onDragStart,
  onDragEnd,
  dragState,
  externalDragActive = false,
  isLoading = false,

  // 外控框選（桌面視圖是外控）
  selectedSet,
  onSelectedChange,
  externalSelectionRect,
  externalBoxSelecting,
  externalSelectionFading,

  // 動畫/切換
  disableFlip = false,
  // 卡片附加屬性（可為物件或函數：game => props）
  gameCardExtraProps,
}) => {
  // 統一右鍵菜單（桌面上下文）
  const [selectedGames, setSelectedGames] = useSelectedGames();
  
  // 使用共享的建立捷徑邏輯
  const createShortcut = useCreateShortcut(games, selectedGames, setSelectedGames, 'DesktopGrid');
  
  const { ContextMenuElement, openMenu, closeMenu } = useUnifiedContextMenu({
    view: 'desktop',
    onCreateFolder,
    onOpenFolder: onFolderOpen,
    onEditFolder,
    onDeleteFolder,
    onAddToFolder,
    onGameLaunch: onGameSelect,
    onGameConfigure: (game) => {
      window.dispatchEvent(new CustomEvent('open-game-config', { detail: game }));
    },
    onGameInfo,
    onCreateShortcut: createShortcut,
  });

  return (
    <>
      <VirtualizedUnifiedGrid
        games={games}
        onGameClick={onGameSelect}
        onGameContextMenu={(e, game, selectedList) => openMenu(e, game, { view: 'desktop', kind: 'game', selectedFilePaths: selectedList })}
        onBlankContextMenu={(e) => openMenu(e, null, { view: 'desktop', kind: 'blank' })}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        dragState={dragState}
        externalDragActive={externalDragActive}
        isLoading={isLoading}
        selectionControlled={false}
        disableFlip={disableFlip}
        // 拖拽來源：桌面
        dragSource={{ type: 'desktop', id: null }}
        gameCardExtraProps={gameCardExtraProps}
      />
      {ContextMenuElement}
    </>
  );
};

export default DesktopGridUnified;
