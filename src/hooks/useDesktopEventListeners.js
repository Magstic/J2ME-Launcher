import { useEffect, useRef } from 'react';
import { useTranslation } from '@hooks/useTranslation';

/**
 * 桌面事件監聽 Hook
 * 管理所有桌面相關的事件監聽器
 */
export const useDesktopEventListeners = ({
  guardedRefresh,
  loadDesktopItems,
  setBulkMutating,
  setBulkStatus,
}) => {
  const { t } = useTranslation();
  // 拖放後刷新抑制與使用者互動閘門（全域於此 hook）
  const postDropUntilRef = useRef(0);
  const lastUserInputRef = useRef(0);
  // 記錄最近使用者互動
  useEffect(() => {
    const markNow = () => {
      try {
        lastUserInputRef.current = Date.now();
      } catch (_) {}
    };
    window.addEventListener('wheel', markNow, { passive: true });
    window.addEventListener('touchmove', markNow, { passive: true });
    window.addEventListener('keydown', markNow, { passive: true });
    return () => {
      window.removeEventListener('wheel', markNow);
      window.removeEventListener('touchmove', markNow);
      window.removeEventListener('keydown', markNow);
    };
  }, []);

  // 監聽資料夾相關事件（合併處理 + 去抖）
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    let timer = null;
    // 拖放完成後的抑制窗口：避免剛放下就觸發重載造成卡頓
    const trailingTimerRef = { current: null };
    const pendingRef = { current: false };

    // 監聽增量事件來更新抑制窗口
    const offIncr = api.onGamesIncrementalUpdate?.((u) => {
      try {
        if (u && u.action === 'drag-drop-completed') {
          postDropUntilRef.current = Date.now() + 1500; // 與前端抑制大致一致
          pendingRef.current = false;
          if (trailingTimerRef.current) {
            clearTimeout(trailingTimerRef.current);
            trailingTimerRef.current = null;
          }
        }
      } catch (_) {}
    });
    const schedule = () => {
      const remain = postDropUntilRef.current - Date.now();
      if (remain > 0) {
        // 在抑制窗口內：直接忽略資料夾事件，避免延後引發的抖動
        return;
      }
      if (timer) return; // 已排程
      timer = setTimeout(() => {
        try {
          guardedRefresh();
        } finally {
          timer = null;
        }
      }, 120);
    };
    const offChanged = api.onFolderChanged
      ? api.onFolderChanged(() => {
          console.log('資料夾變更事件觸發');
          schedule();
        })
      : null;
    const offUpdated = api.onFolderUpdated
      ? api.onFolderUpdated((folderData) => {
          console.log('資料夾更新事件觸發:', folderData?.id);
          schedule();
        })
      : null;
    return () => {
      try {
        offChanged && offChanged();
      } catch (_) {}
      try {
        offUpdated && offUpdated();
      } catch (_) {}
      try {
        offIncr && offIncr();
      } catch (_) {}
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
    };
  }, [guardedRefresh]);

  // 監聽遊戲變更事件（僅重新載入桌面項目，避免與 App 層全量刷新重疊）
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onGamesUpdated) return;
    let timer = null;
    const handler = () => {
      // 在拖放後的抑制窗口內直接忽略
      if (Date.now() < postDropUntilRef.current) return;
      if (timer) clearTimeout(timer);
      const run = () => {
        // 若最近 1s 內有使用者互動，延後再試
        const active = Date.now() - (lastUserInputRef.current || 0) < 1000;
        if (active) {
          timer = setTimeout(run, 300);
          return;
        }
        try {
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            window.requestIdleCallback(() => {
              try {
                // 強制替換以反映名稱/圖標等非鍵變更
                loadDesktopItems && loadDesktopItems({ forceReplace: true });
              } catch (_) {}
            });
          } else {
            loadDesktopItems && loadDesktopItems({ forceReplace: true });
          }
        } finally {
          timer = null;
        }
      };
      // 輕微拖尾，合併短時間內多次更新
      timer = setTimeout(run, 120);
    };
    const unsubscribe = api.onGamesUpdated(handler);
    return () => {
      if (timer) clearTimeout(timer);
      return unsubscribe && unsubscribe();
    };
  }, [loadDesktopItems]);

  // 監聽簇變更事件：刷新桌面項目（簇列表與去重後的遊戲）
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onClusterChanged) return;
    let timer = null;
    const off = api.onClusterChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          // 強制替換以反映名稱/主成員圖標等非鍵變更
          loadDesktopItems && loadDesktopItems({ forceReplace: true });
        } catch (_) {}
        timer = null;
      }, 50);
    });
    return () => {
      if (timer) clearTimeout(timer);
      try {
        off && off();
      } catch (_) {}
    };
  }, [loadDesktopItems]);

  // 監聽簇刪除事件：刷新桌面項目
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onClusterDeleted) return;
    const off = api.onClusterDeleted(() => {
      try {
        loadDesktopItems && loadDesktopItems();
      } catch (_) {}
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
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
          label: t('desktopManager.label'),
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
