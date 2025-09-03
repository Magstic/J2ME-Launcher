import { useEffect, useCallback } from 'react';

/**
 * 遊戲啟動相關邏輯
 * 包含遊戲啟動、捷徑啟動監聽、SHA-1 計算
 */
export const useGameLauncher = ({ games, openGameLaunchDialog, openEmulatorNotConfiguredDialog }) => {
  // SHA-1 計算函數（與主進程 utils/hash.js 對齊）
  const sha1Hex = useCallback(async (text) => {
    const enc = new TextEncoder();
    const data = enc.encode((text || '').trim().toLowerCase());
    const buf = await crypto.subtle.digest('SHA-1', data);
    const bytes = new Uint8Array(buf);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  // 處理遊戲啟動（帶首次啟動提示與持久化）
  const handleGameLaunch = useCallback(async (game) => {
    try {
      const cfg = await window.electronAPI?.getGameEmulatorConfig?.(game.filePath);
      if (!cfg) {
        // 首次啟動：顯示彈窗
        openGameLaunchDialog(game);
        return;
      }
      const result = await window.electronAPI?.launchGame?.(game.filePath);
      if (!result?.success && result?.error === 'EMULATOR_NOT_CONFIGURED') {
        // 模擬器未配置：顯示提示彈窗
        openEmulatorNotConfiguredDialog(game);
      }
    } catch (error) {
      console.error('啟動遊戲失敗:', error);
    }
  }, [openGameLaunchDialog, openEmulatorNotConfiguredDialog]);

  // 監聽 Windows 捷徑啟動事件：根據 hash 尋找並啟動對應遊戲
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onShortcutLaunch?.(async (launchHash) => {
      try {
        // 優先在現有列表查找
        let target = null;
        for (const g of games || []) {
          const h = await sha1Hex(g.filePath);
          if (h === launchHash) { target = g; break; }
        }
        // 若未找到，嘗試重新獲取遊戲列表（例如冷啟動時）
        if (!target) {
          try {
            const latest = await window.electronAPI?.getInitialGames?.();
            if (Array.isArray(latest)) {
              for (const g of latest) {
                const h = await sha1Hex(g.filePath);
                if (h === launchHash) { target = g; break; }
              }
            }
          } catch (_) {}
        }
        if (target) {
          await handleGameLaunch(target);
        } else {
          console.warn('[shortcut-launch] 無法匹配到遊戲，hash=', launchHash);
        }
      } catch (e) {
        console.error('[shortcut-launch] 處理失敗:', e);
      }
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [games, handleGameLaunch, sha1Hex]);

  return {
    handleGameLaunch,
    sha1Hex
  };
};
