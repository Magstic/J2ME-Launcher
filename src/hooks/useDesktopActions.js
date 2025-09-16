import { useCallback } from 'react';
import { useTranslation } from '@hooks/useTranslation';

/**
 * 桌面操作 Hook
 * 管理所有桌面相關的操作邏輯
 */
export const useDesktopActions = ({
  loadFolders,
  loadDesktopItems,
  guardedRefresh,
  suppressUntilRef,
  setBulkMutating,
  setBulkStatus,
  setInfoDialog
}) => {
  const { t } = useTranslation();

  // 創建資料夾
  const handleCreateFolder = useCallback(async (folderData) => {
    try {
      if (window.electronAPI?.createFolder) {
        await window.electronAPI.createFolder(folderData);
        // 事件監聽器會自動刷新資料
      }
    } catch (error) {
      console.error('創建資料夾失敗:', error);
      throw error;
    }
  }, []);

  // 更新資料夾
  const handleUpdateFolder = useCallback(async (folderId, folderData) => {
    try {
      if (window.electronAPI?.updateFolder) {
        await window.electronAPI.updateFolder(folderId, folderData);
        // 事件監聽器會自動刷新資料
      }
    } catch (error) {
      console.error('更新資料夾失敗:', error);
      throw error;
    }
  }, []);

  // 將遊戲添加到資料夾
  const handleGameDrop = useCallback(async (gameFilePath, folderId) => {
    try {
      if (window.electronAPI?.addGameToFolder) {
        console.log('正在將遊戲添加到資料夾:', gameFilePath, folderId);
        await window.electronAPI.addGameToFolder(gameFilePath, folderId);
        
        // 立即刷新資料，不依賴事件監聽
        await loadFolders();
        await loadDesktopItems();
        console.log('遊戲添加完成，資料已刷新');
      }
    } catch (error) {
      console.error('添加遊戲到資料夾失敗:', error);
    }
  }, [loadFolders, loadDesktopItems]);

  // 處理資料夾打開 - 使用獨立 BrowserWindow
  const handleFolderOpen = useCallback(async (folder) => {
    try {
      if (window.electronAPI?.openFolderWindow) {
        const result = await window.electronAPI.openFolderWindow(folder.id);
        if (!result.success) {
          console.error('打開資料夾窗口失敗:', result.error);
        }
      }
    } catch (error) {
      console.error('打開資料夾窗口時發生錯誤:', error);
    }
  }, []);

  // 處理資料夾選擇
  const handleFolderSelect = useCallback(async (selectedFolder, folderSelectDialog) => {
    const target = folderSelectDialog.game;
    const fileList = folderSelectDialog.selectedFilePaths;
    const clusterIdsFromDialog = folderSelectDialog.selectedClusterIds;
    if (!selectedFolder) return;

    // 整理遊戲與簇的集合（去重）
    const uniqueGames = Array.isArray(fileList) && fileList.length > 0
      ? Array.from(new Set(fileList)).filter(fp => typeof fp === 'string')
      : (target && target.type === 'game' && target.filePath ? [String(target.filePath)] : []);

    let uniqueClusters = Array.isArray(clusterIdsFromDialog) && clusterIdsFromDialog.length > 0
      ? Array.from(new Set(clusterIdsFromDialog.map(String)))
      : [];
    if (target && target.type === 'cluster' && target.id != null) {
      uniqueClusters = Array.from(new Set([...uniqueClusters, String(target.id)]));
    }

    if (uniqueGames.length === 0 && uniqueClusters.length === 0) return;

    const total = uniqueGames.length + uniqueClusters.length;
    try {
      // 抑制自動事件刷新，留出 FLIP 前後狀態捕捉窗口
      suppressUntilRef.current = Date.now() + 160;

      const folderIdStr = typeof selectedFolder.id === 'string' ? selectedFolder.id : String(selectedFolder.id || '');

      if (total > 10) {
        setBulkMutating(true);
        setBulkStatus({ active: true, total, done: 0, label: t('desktopManager.label') });
      }

      let done = 0;
      const bump = () => {
        done += 1;
        setBulkStatus(prev => ({ ...prev, done }));
      };

      // 先處理遊戲（批次）
      if (uniqueGames.length > 0) {
        if (window.electronAPI?.batchAddGamesToFolder) {
          await window.electronAPI.batchAddGamesToFolder(uniqueGames, folderIdStr, { threshold: 30, chunkSize: 50, quiet: true });
          done += uniqueGames.length;
          setBulkStatus(prev => ({ ...prev, done }));
        } else if (window.electronAPI?.addGamesToFolderBatch) {
          await window.electronAPI.addGamesToFolderBatch(uniqueGames, folderIdStr, { quiet: true });
          done += uniqueGames.length;
          setBulkStatus(prev => ({ ...prev, done }));
        } else if (window.electronAPI?.addGameToFolder) {
          for (const fp of uniqueGames) {
            await window.electronAPI.addGameToFolder(fp, folderIdStr);
            bump();
          }
        }
      }

      // 再處理簇（逐一）
      if (uniqueClusters.length > 0 && window.electronAPI?.addClusterToFolder) {
        for (const cid of uniqueClusters) {
          await window.electronAPI.addClusterToFolder(cid, folderIdStr);
          bump();
        }
      }

      // 刷新資料（微延遲 + 受控刷新）：避免『先消失再重排』
      await new Promise((r) => setTimeout(r, 80));
      // 解除抑制並執行一次受控刷新
      suppressUntilRef.current = 0;
      guardedRefresh();
    } catch (error) {
      console.error('加入資料夾失敗:', error);
      // 確保錯誤訊息可序列化
      const errorMessage = typeof error?.message === 'string' ? error.message : String(error || t('desktopManager.common.unknownError'));
      const dialogTitle = String(t('desktopManager.addToFolder.title') || '加入資料夾');
      const dialogMessage = String(t('desktopManager.info.addToFolder.failWithReason', { reason: errorMessage }) || `加入資料夾失敗: ${errorMessage}`);
      
      setInfoDialog({ 
        isOpen: true, 
        title: dialogTitle, 
        message: dialogMessage 
      });
    } finally {
      if (total > 10) {
        setBulkMutating(false);
        setTimeout(() => {
          setBulkStatus(prev => ({ ...prev, active: false }));
        }, 1000);
      }
    }
  }, [suppressUntilRef, setBulkMutating, setBulkStatus, setInfoDialog, guardedRefresh, t]);

  // 處理從資料夾移除遊戲（通用處理，會同步所有窗口）
  const handleRemoveGameFromFolder = useCallback(async (game, folderId) => {
    try {
      if (window.electronAPI?.removeGameFromFolder) {
        const result = await window.electronAPI.removeGameFromFolder(game.filePath, folderId);
        if (result.success) {
          console.log('遊戲已從資料夾移除');
          // 刷新桌面資料，這會同步所有窗口
          await loadDesktopItems();
          await loadFolders();
        } else {
          setInfoDialog({ isOpen: true, title: t('desktopManager.removeFromFolder.title'), message: t('desktopManager.info.removeFromFolder.fail') });
        }
      }
    } catch (error) {
      console.error('移除遊戲失敗:', error);
      setInfoDialog({ isOpen: true, title: t('desktopManager.removeFromFolder.title'), message: t('desktopManager.info.removeFromFolder.failWithReason', { reason: (error?.message || t('desktopManager.common.unknownError')) }) });
    }
  }, [loadDesktopItems, loadFolders, setInfoDialog, t]);

  // 處理跨窗口遊戲移動
  const handleMoveGameBetweenFolders = useCallback(async (game, fromFolderId, toFolderId) => {
    try {
      if (window.electronAPI?.moveGameBetweenFolders) {
        const result = await window.electronAPI.moveGameBetweenFolders(game.filePath, fromFolderId, toFolderId);
        if (result.success) {
          console.log('遊戲已在資料夾間移動');
          // 刷新所有資料
          await loadDesktopItems();
          await loadFolders();
        } else {
          setInfoDialog({ isOpen: true, title: t('desktopManager.moveGame.title'), message: t('desktopManager.info.moveGame.fail') });
        }
      }
    } catch (error) {
      console.error('移動遊戲失敗:', error);
      setInfoDialog({ isOpen: true, title: t('desktopManager.moveGame.title'), message: t('desktopManager.info.moveGame.failWithReason', { reason: (error?.message || t('desktopManager.common.unknownError')) }) });
    }
  }, [loadDesktopItems, loadFolders, setInfoDialog, t]);

  return {
    handleCreateFolder,
    handleUpdateFolder,
    handleGameDrop,
    handleFolderOpen,
    handleFolderSelect,
    handleRemoveGameFromFolder,
    handleMoveGameBetweenFolders,
  };
};
