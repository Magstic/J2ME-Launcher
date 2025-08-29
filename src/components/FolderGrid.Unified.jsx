import React from 'react';
import UnifiedGrid from '@shared/UnifiedGrid';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
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
  
  // 統一右鍵菜單（資料夾視窗上下文）
  const { ContextMenuElement, openMenu, closeMenu } = useUnifiedContextMenu({
    onGameLaunch,
    onGameConfigure,
    onRemoveFromFolder,
    onGameInfo,
    // 資料夾視窗空白區域通常無特殊條目，可在 hook 內按 view/kind 做限制
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
        console.error('[FolderGrid] Batch shortcut creation failed:', error);
        window.dispatchEvent(new CustomEvent('shortcut-error', {
          detail: { count: gamesToProcess.length, error: error.message }
        }));
      }
    }
  });

  return (
    <>
      <UnifiedGrid
        games={games}
        folders={[]}
        onGameClick={onGameLaunch}
        // 資料夾視窗內不顯示資料夾卡片
        onFolderOpen={undefined}
        onGameContextMenu={(e, game) => openMenu(e, game, { view: 'folder-window', kind: 'game', extra: { folderId } })}
        onFolderContextMenu={undefined}
        // 資料夾視窗的空白區域不顯示選單
        onBlankContextMenu={undefined}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDropOnFolder={undefined}
        dragState={dragState}
        externalDragActive={externalDragActive}
        isLoading={isLoading}
        // Folder 視窗改用內控選取與框選（支援空白點擊清空與漸出）
        selectionControlled={false}
        disableFlip={disableFlip}
        // 邏輯與樣式對齊原 FolderWindowApp：使用 games-grid 容器與卡片展示屬性
        containerClassName="games-grid"
        gameCardExtraProps={{ folderView: true, showPublisher: false, showVersion: false }}
        // 拖拽來源：資料夾，攜帶 folderId，便於桌面在 drop 後執行移出資料夾
        dragSource={{ type: 'folder', id: folderId }}
      />
      {ContextMenuElement}
    </>
  );
};

export default FolderGridUnified;
