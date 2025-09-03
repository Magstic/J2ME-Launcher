import { useEffect } from 'react';
import { useTranslation } from '@hooks/useTranslation';

/**
 * 桌面事件監聽 Hook
 * 管理所有桌面相關的事件監聽器
 */
export const useDesktopEventListeners = ({
  guardedRefresh,
  setBulkMutating,
  setBulkStatus
}) => {
  const { t } = useTranslation();

  // 監聽資料夾變更事件
  useEffect(() => {
    if (window.electronAPI?.onFolderChanged) {
      const unsubscribe = window.electronAPI.onFolderChanged(() => {
        console.log('資料夾變更事件觸發');
        guardedRefresh();
      });
      return unsubscribe;
    }
  }, [guardedRefresh]);

  // 監聽單個資料夾更新事件
  useEffect(() => {
    if (window.electronAPI?.onFolderUpdated) {
      const unsubscribe = window.electronAPI.onFolderUpdated((folderData) => {
        console.log('資料夾更新事件觸發:', folderData?.id);
        guardedRefresh();
      });
      return unsubscribe;
    }
  }, [guardedRefresh]);

  // 監聽遊戲變更事件
  useEffect(() => {
    if (window.electronAPI?.onGamesUpdated) {
      const unsubscribe = window.electronAPI.onGamesUpdated(() => {
        console.log('遊戲變更事件觸發');
        guardedRefresh();
      });
      return unsubscribe;
    }
  }, [guardedRefresh]);

  // 監聽批次操作事件
  useEffect(() => {
    const handleBulkStart = (data) => {
      console.log('批次操作開始:', data);
      if (data.total > 30) {
        setBulkMutating(true);
        setBulkStatus({ 
          active: true, 
          total: data.total, 
          done: 0, 
          label: t('desktopManager.label') 
        });
      }
    };

    const handleBulkEnd = (data) => {
      console.log('批次操作結束:', data);
      setBulkMutating(false);
      setBulkStatus({ active: false, total: 0, done: 0, label: '' });
    };

    if (window.electronAPI?.onBulkOperationStart) {
      window.electronAPI.onBulkOperationStart(handleBulkStart);
    }
    if (window.electronAPI?.onBulkOperationEnd) {
      window.electronAPI.onBulkOperationEnd(handleBulkEnd);
    }

    return () => {
      // 清理監聽器
      if (window.electronAPI?.offBulkOperationStart) {
        window.electronAPI.offBulkOperationStart(handleBulkStart);
      }
      if (window.electronAPI?.offBulkOperationEnd) {
        window.electronAPI.offBulkOperationEnd(handleBulkEnd);
      }
    };
  }, [setBulkMutating, setBulkStatus, t]);
};
