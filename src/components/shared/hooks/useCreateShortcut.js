import { useCallback } from 'react';

/**
 * useCreateShortcut - 共享的建立捷徑邏輯
 * 支援單個或多選遊戲的批次捷徑建立
 * 
 * @param {Array} games - 所有可用遊戲列表
 * @param {Array} selectedGames - 當前選中的遊戲
 * @param {Function} setSelectedGames - 設置選中遊戲的函數
 * @param {string} logPrefix - 日誌前綴，用於區分調用來源
 * @returns {Function} createShortcut 函數
 */
export function useCreateShortcut(games, selectedGames, setSelectedGames, logPrefix = 'CreateShortcut') {
  return useCallback(async (game) => {
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
      console.error(`[${logPrefix}] Batch shortcut creation failed:`, error);
      window.dispatchEvent(new CustomEvent('shortcut-error', {
        detail: { count: gamesToProcess.length, error: error.message }
      }));
    }
  }, [games, selectedGames, setSelectedGames, logPrefix]);
}

export default useCreateShortcut;
