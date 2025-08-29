// src/main/utils/batch-operations.js
// 批次操作工具函數

/**
 * 批次將遊戲加入資料夾
 * @param {string[]} filePaths - 遊戲檔案路徑陣列
 * @param {string} folderId - 目標資料夾 ID
 * @param {Object} options - 選項
 * @param {number} options.threshold - 啟用分批的門檻數量，預設 30
 * @param {number} options.chunkSize - 每批處理數量，預設 50
 * @param {boolean} options.quiet - 是否靜默處理，預設 false
 * @param {Function} options.addGameToFolder - 單個遊戲加入函數
 * @param {Function} options.addGamesToFolderBatch - 批次加入函數
 * @param {Function} options.onProgress - 進度回調函數
 * @returns {Promise<{success: boolean, processed: number}>}
 */
async function batchAddGamesToFolder(filePaths, folderId, options = {}) {
  const {
    threshold = 30,
    chunkSize = 50,
    quiet = false,
    addGameToFolder = null,
    addGamesToFolderBatch = null,
    onProgress = null
  } = options;

  const unique = Array.from(new Set(filePaths.filter(Boolean)));
  if (unique.length === 0) {
    return { success: true, processed: 0 };
  }

  let processed = 0;
  let allSuccess = true;

  try {
    if (unique.length > threshold) {
      // 分批處理
      for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        
        try {
          // 優先使用批次 API
          if (addGamesToFolderBatch) {
            await addGamesToFolderBatch(chunk, folderId, { quiet });
          } else if (addGameToFolder) {
            // 回退到逐一處理
            const results = await Promise.allSettled(
              chunk.map(fp => addGameToFolder(fp, folderId))
            );
            // 檢查是否有失敗的操作
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) allSuccess = false;
          } else {
            throw new Error('No add function provided');
          }
          
          processed += chunk.length;
          
          // 報告進度
          if (onProgress) {
            onProgress({ processed, total: unique.length });
          }
          
          // 批次間短暫讓出執行緒
          await new Promise(r => setTimeout(r, 0));
        } catch (error) {
          console.warn(`[batch] chunk ${i}-${i + chunk.length - 1} failed:`, error.message);
          allSuccess = false;
        }
      }
    } else {
      // 小量直接批次處理
      try {
        if (addGamesToFolderBatch) {
          await addGamesToFolderBatch(unique, folderId, { quiet });
        } else if (addGameToFolder) {
          const results = await Promise.allSettled(
            unique.map(fp => addGameToFolder(fp, folderId))
          );
          const failed = results.filter(r => r.status === 'rejected').length;
          if (failed > 0) allSuccess = false;
        } else {
          throw new Error('No add function provided');
        }
        processed = unique.length;
        
        // 報告進度
        if (onProgress) {
          onProgress({ processed, total: unique.length });
        }
      } catch (error) {
        console.warn('[batch] small batch failed:', error.message);
        allSuccess = false;
      }
    }
  } catch (error) {
    console.error('[batch] unexpected error:', error);
    allSuccess = false;
  }

  return { success: allSuccess, processed };
}

module.exports = {
  batchAddGamesToFolder
};
