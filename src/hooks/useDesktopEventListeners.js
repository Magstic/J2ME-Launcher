import { useEffect } from 'react';
import { useTranslation } from '@hooks/useTranslation';

/**
 * 桌面事件監聽 Hook
 * 管理所有桌面相關的事件監聽器
 */
export const useDesktopEventListeners = ({
  guardedRefresh,
  loadDesktopItems,
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

  // 監聽遊戲變更事件（僅重新載入桌面項目，避免與 App 層全量刷新重疊）
  useEffect(() => {
    if (window.electronAPI?.onGamesUpdated) {
      let timer = null;
      const handler = () => {
        console.log('遊戲變更事件觸發（desktop）: 僅重新載入桌面項目');
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          try { loadDesktopItems && loadDesktopItems(); } catch (_) {}
          timer = null;
        }, 50);
      };
      const unsubscribe = window.electronAPI.onGamesUpdated(handler);
      return () => {
        if (timer) clearTimeout(timer);
        return unsubscribe && unsubscribe();
      };
    }
  }, [loadDesktopItems]);

  // 監聽簇變更事件：刷新桌面項目（簇列表與去重後的遊戲）
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onClusterChanged) return;
    let timer = null;
    const off = api.onClusterChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try { loadDesktopItems && loadDesktopItems(); } catch (_) {}
        timer = null;
      }, 50);
    });
    return () => { if (timer) clearTimeout(timer); try { off && off(); } catch (_) {} };
  }, [loadDesktopItems]);

  // 監聽簇刪除事件：刷新桌面項目
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onClusterDeleted) return;
    const off = api.onClusterDeleted(() => {
      try { loadDesktopItems && loadDesktopItems(); } catch (_) {}
    });
    return () => { try { off && off(); } catch (_) {} };
  }, [loadDesktopItems]);

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
