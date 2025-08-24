import React from 'react';
import UnifiedGrid from '@shared/UnifiedGrid';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';

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
  onDropOnFolder,
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
  const { ContextMenuElement, openMenu, closeMenu } = useUnifiedContextMenu({
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
    // 建立捷徑：傳遞給 preload IPC
    onCreateShortcut: async (game) => {
      if (!game || !game.filePath) return;
      const payload = {
        filePath: game.filePath,
        title: game.gameName || undefined,
      };
      try {
        // 從 safe-file:// 提取快取檔名（與主程序 DataStore.getIconCachePath 搭配）
        if (game.iconUrl && typeof game.iconUrl === 'string' && game.iconUrl.startsWith('safe-file://')) {
          payload.iconCacheName = game.iconUrl.replace('safe-file://', '');
        }
      } catch (_) {}
      try {
        await window.electronAPI?.createShortcut?.(payload);
      } catch (e) {
        console.error('建立捷徑失敗:', e);
      }
    },
  });

  return (
    <>
      <UnifiedGrid
        games={games}
        folders={folders}
        onGameClick={onGameSelect}
        onFolderOpen={undefined}
        onGameContextMenu={(e, game) => openMenu(e, game, { view: 'desktop', kind: 'game' })}
        onFolderContextMenu={undefined}
        // 停用桌面空白區域右鍵菜單
        onBlankContextMenu={undefined}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDropOnFolder={undefined}
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
