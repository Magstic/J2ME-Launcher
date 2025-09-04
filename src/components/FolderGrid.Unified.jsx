import React from 'react';
import VirtualizedUnifiedGrid from '@shared/VirtualizedUnifiedGrid';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
import useCreateShortcut from '@shared/hooks/useCreateShortcut';
import { useSelectedGames } from '@hooks/useGameStore';

/**
 * FolderGrid.Unified
 * 薄封裝：將 FolderWindowApp 需要的渲染與選單行為映射到 UnifiedGrid。
 * 僅顯示遊戲（不顯示資料夾）。
 */
const FolderGridUnified = ({
  // 資料
  games = [],
  folderId,

  // 右鍵與動作
  onGameLaunch,
  onGameConfigure, // 打開配置對話框（不自動啟動）
  onRemoveFromFolder,
  onGameInfo,

  // 拖拽/選取/狀態
  onDragStart,
  onDragEnd,
  dragState,
  externalDragActive = false,
  isLoading = false,

  // 外控框選（資料夾視窗是外控）
  selectedSet,
  onSelectedChange,
  externalSelectionRect,
  externalBoxSelecting,
  externalSelectionFading,

  // 動畫
  disableFlip = false,
}) => {
  const [selectedGames, setSelectedGames] = useSelectedGames();
  
  // 使用共享的建立捷徑邏輯
  const createShortcut = useCreateShortcut(games, selectedGames, setSelectedGames, 'FolderGrid');
  
  // 統一右鍵菜單（資料夾視窗上下文）
  const { ContextMenuElement, openMenu, closeMenu } = useUnifiedContextMenu({
    onGameLaunch,
    onGameConfigure,
    onRemoveFromFolder,
    onGameInfo,
    onCreateShortcut: createShortcut
  });

  return (
    <>
      <VirtualizedUnifiedGrid
        games={games}
        folders={[]}
        onGameClick={onGameLaunch}
        onGameContextMenu={(e, game, selectedList) => openMenu(e, game, { view: 'folder-window', kind: 'game', selectedFilePaths: selectedList, extra: { folderId } })}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        dragState={dragState}
        externalDragActive={externalDragActive}
        isLoading={isLoading}
        // Folder 視窗改用內控選取與框選（支援空白點擊清空與漸出）
        selectionControlled={false}
        disableFlip={disableFlip}
        // 邏輯與樣式對齊原 FolderWindowApp：使用 games-grid 容器與卡片展示屬性
        containerClassName="games-grid"
        // 拖拽來源：資料夾，攜帶 folderId，便於桌面在 drop 後執行移出資料夾
        dragSource={{ type: 'folder', id: folderId }}
      />
      {ContextMenuElement}
    </>
  );
};

export default FolderGridUnified;
