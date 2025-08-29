import React from 'react';
import UnifiedGrid from '@shared/UnifiedGrid';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
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
  const [selectedGames, setSelectedGames] = useSelectedGames();
  
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
    // 建立捷徑：支援單個或多選遊戲
    onCreateShortcut: async (game) => {
      // 使用與加入資料夾相同的邏輯：檢查 game.selectedFilePaths
      const gamesToProcess = (game && Array.isArray(game.selectedFilePaths) && game.selectedFilePaths.length > 0)
        ? game.selectedFilePaths.map(filePath => games.find(g => g.filePath === filePath)).filter(Boolean)
        : [game];
      
      if (gamesToProcess.length === 0 || !gamesToProcess[0]?.filePath) return;

      try {
        const results = await Promise.allSettled(
          gamesToProcess.map(async (targetGame) => {
            const payload = {
              filePath: targetGame.filePath,
              title: targetGame.gameName || undefined,
            };
            
            // 從 safe-file:// 提取快取檔名
            if (targetGame.iconUrl && typeof targetGame.iconUrl === 'string' && targetGame.iconUrl.startsWith('safe-file://')) {
              payload.iconCacheName = targetGame.iconUrl.replace('safe-file://', '');
            }
            
            return await window.electronAPI.createShortcut(payload);
          })
        );

        // 統計成功和失敗
        const successful = results.filter(r => r.status === 'fulfilled' && r.value?.ok);
        const failed = results.filter(r => r.status === 'rejected' || !r.value?.ok);
        
        // 發送通知事件
        if (successful.length > 0) {
          window.dispatchEvent(new CustomEvent('shortcut-created', {
            detail: { count: successful.length }
          }));
        }
        
        if (failed.length > 0) {
          const errorMsg = failed[0].reason?.message || failed[0].value?.error || '未知錯誤';
          window.dispatchEvent(new CustomEvent('shortcut-error', {
            detail: { count: failed.length, error: errorMsg }
          }));
        }
        
        // 清空選擇狀態
        if (selectedGames.length > 0) {
          setSelectedGames([]);
        }
        
      } catch (error) {
        console.error('[DesktopGrid] Batch shortcut creation failed:', error);
        window.dispatchEvent(new CustomEvent('shortcut-error', {
          detail: { count: gamesToProcess.length, error: error.message }
        }));
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
        onFolderContextMenu={(e, folder) => openMenu(e, folder, { view: 'desktop', kind: 'folder' })}
        onBlankContextMenu={(e) => openMenu(e, null, { view: 'desktop', kind: 'blank' })}
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
