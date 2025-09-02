import { useState, useEffect, useCallback } from 'react';

/**
 * 批次操作狀態管理 Hook
 * 抽取自 DesktopManager 的批次操作相關邏輯
 * 
 * Linus 風格：Simple and focused
 * 只負責批次操作的狀態追蹤和UI控制
 */
export const useBatchOperationState = () => {
  // 批量操作期間關閉動畫/抖動
  const [bulkMutating, setBulkMutating] = useState(false);
  
  // 批次狀態（用於顯示載入卡片）
  const [bulkStatus, setBulkStatus] = useState({ 
    active: false, 
    total: 0, 
    done: 0, 
    label: '' 
  });

  // 批次操作開始處理
  const handleBulkStart = useCallback((data) => {
    console.log('批次操作開始:', data);
    if (data.total > 30) {
      setBulkMutating(true);
    }
    setBulkStatus({
      active: true,
      total: data.total || 0,
      done: 0,
      label: data.label || ''
    });
  }, []);

  // 批次操作結束處理
  const handleBulkEnd = useCallback(() => {
    console.log('批次操作結束');
    setBulkMutating(false);
    setBulkStatus({ active: false, total: 0, done: 0, label: '' });
  }, []);

  // 監聽批次操作事件
  useEffect(() => {
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
  }, [handleBulkStart, handleBulkEnd]);

  // 手動重置批次狀態（用於錯誤恢復）
  const resetBulkState = useCallback(() => {
    setBulkMutating(false);
    setBulkStatus({ active: false, total: 0, done: 0, label: '' });
  }, []);

  return {
    bulkMutating,
    bulkStatus,
    isBatchOperationInProgress: bulkStatus.active,
    resetBulkState
  };
};

export default useBatchOperationState;
