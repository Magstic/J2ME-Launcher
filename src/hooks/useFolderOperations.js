import { useCallback } from 'react';
import { useTranslation } from '@hooks/useTranslation';

/**
 * 資料夾操作 Hook
 * 管理資料夾的 CRUD 操作和確認流程
 */
export const useFolderOperations = ({
  createFolderDialog,
  handleCreateFolder,
  handleUpdateFolder,
  loadFolders,
  loadDesktopItems,
  setInfoDialog
}) => {
  const { t } = useTranslation();

  // 確認資料夾操作
  const handleConfirmFolderDialog = useCallback(async (folderData) => {
    try {
      if (createFolderDialog.mode === 'create') {
        await handleCreateFolder(folderData);
      } else if (createFolderDialog.mode === 'edit' && createFolderDialog.initialData) {
        await handleUpdateFolder(createFolderDialog.initialData.id, folderData);
      }
      
      // 立即刷新資料
      await loadFolders();
      await loadDesktopItems();
      console.log('資料夾操作完成，資料已刷新');
    } catch (error) {
      console.error('資料夾操作失敗:', error);
      throw error;
    }
  }, [createFolderDialog, handleCreateFolder, handleUpdateFolder, loadFolders, loadDesktopItems]);

  // 確認刪除資料夾
  const handleConfirmDeleteFolder = useCallback(async (folder) => {
    try {
      if (window.electronAPI?.deleteFolder && folder) {
        const result = await window.electronAPI.deleteFolder(folder.id, true);
        if (!result.success) {
          setInfoDialog({ 
            isOpen: true, 
            title: t('desktopManager.confirmDelete.title'), 
            message: t('desktopManager.info.deleteFolder.fail') 
          });
        }
        await loadFolders();
        await loadDesktopItems();
      } else {
        setInfoDialog({ 
          isOpen: true, 
          title: t('desktopManager.confirmDelete.title'), 
          message: t('desktopManager.info.deleteFolder.apiUnavailable') 
        });
      }
    } catch (error) {
      console.error('刪除資料夾失敗:', error);
      setInfoDialog({ 
        isOpen: true, 
        title: t('desktopManager.confirmDelete.title'), 
        message: t('desktopManager.info.deleteFolder.failWithReason', { 
          reason: (error?.message || t('desktopManager.common.unknownError')) 
        }) 
      });
    }
  }, [loadFolders, loadDesktopItems, setInfoDialog, t]);

  return {
    handleConfirmFolderDialog,
    handleConfirmDeleteFolder,
  };
};
