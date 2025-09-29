import { useEffect, useCallback } from 'react';

/**
 * 應用級事件監聽器
 * 管理全局事件監聽，包括遊戲更新、自動掃描、跨窗口事件
 */
export const useAppEventListeners = ({
  setGames,
  openGameInfoDialog,
  openClusterDialog,
  openGameLaunchDialog,
  openDirectoryManager,
  openEmulatorConfig,
  openBackup,
  openSettings,
  setTheme,
  gameLaunchDialog,
  gameInfoDialog,
  isDirectoryManagerOpen,
  isEmulatorConfigOpen,
}) => {
  // 監聽全局的遊戲資訊事件（供網格視圖使用）
  useEffect(() => {
    const handleOpenGameInfo = (event) => {
      if (
        gameLaunchDialog.isOpen ||
        gameInfoDialog.isOpen ||
        isDirectoryManagerOpen ||
        isEmulatorConfigOpen
      )
        return;
      const game = event.detail;
      if (game) openGameInfoDialog(game);
    };
    window.addEventListener('open-game-info', handleOpenGameInfo);
    return () => window.removeEventListener('open-game-info', handleOpenGameInfo);
  }, [
    gameLaunchDialog.isOpen,
    gameInfoDialog.isOpen,
    isDirectoryManagerOpen,
    isEmulatorConfigOpen,
    openGameInfoDialog,
  ]);

  // 監聽全局的簇詳情事件
  useEffect(() => {
    const handleOpenClusterDialog = (event) => {
      if (
        gameLaunchDialog.isOpen ||
        gameInfoDialog.isOpen ||
        isDirectoryManagerOpen ||
        isEmulatorConfigOpen
      )
        return;
      const clusterId = event.detail;
      if (clusterId) openClusterDialog?.(clusterId);
    };
    window.addEventListener('open-cluster-dialog', handleOpenClusterDialog);
    return () => window.removeEventListener('open-cluster-dialog', handleOpenClusterDialog);
  }, [
    gameLaunchDialog.isOpen,
    gameInfoDialog.isOpen,
    isDirectoryManagerOpen,
    isEmulatorConfigOpen,
    openClusterDialog,
  ]);

  // 監聽全局的遊戲配置事件（右鍵『配置』）
  useEffect(() => {
    const handleOpenGameConfig = (e) => {
      const game = e?.detail;
      // 若已有任一彈窗開啟，忽略
      if (
        gameLaunchDialog.isOpen ||
        gameInfoDialog.isOpen ||
        isDirectoryManagerOpen ||
        isEmulatorConfigOpen
      )
        return;
      if (game) openGameLaunchDialog(game, true);
    };
    window.addEventListener('open-game-config', handleOpenGameConfig);
    return () => window.removeEventListener('open-game-config', handleOpenGameConfig);
  }, [
    gameLaunchDialog.isOpen,
    gameInfoDialog.isOpen,
    isDirectoryManagerOpen,
    isEmulatorConfigOpen,
    openGameLaunchDialog,
  ]);

  // 監聽全局的首次啟動事件（非配置模式）
  useEffect(() => {
    const handleOpenGameLaunch = (e) => {
      const game = e?.detail;
      // 若已有任一彈窗開啟，忽略
      if (
        gameLaunchDialog.isOpen ||
        gameInfoDialog.isOpen ||
        isDirectoryManagerOpen ||
        isEmulatorConfigOpen
      )
        return;
      if (game) openGameLaunchDialog(game, false);
    };
    window.addEventListener('open-game-launch', handleOpenGameLaunch);
    return () => window.removeEventListener('open-game-launch', handleOpenGameLaunch);
  }, [
    gameLaunchDialog.isOpen,
    gameInfoDialog.isOpen,
    isDirectoryManagerOpen,
    isEmulatorConfigOpen,
    openGameLaunchDialog,
  ]);

  // 監聽歡迎指南觸發的事件
  useEffect(() => {
    const handleOpenEmulatorConfig = () => openEmulatorConfig();
    const handleOpenDirectoryManager = () => openDirectoryManager();
    const handleOpenBackupConfig = () => openBackup();

    // 從歡迎指南觸發的事件 - 不關閉引導
    const handleOpenEmulatorConfigFromGuide = () => openEmulatorConfig();
    const handleOpenDirectoryManagerFromGuide = () => openDirectoryManager();
    const handleOpenBackupConfigFromGuide = () => openBackup();
    const handleOpenSettingsTheme = () => openSettings();

    const handleThemeChange = (event) => {
      const newTheme = event.detail;
      if (newTheme === 'light' || newTheme === 'dark') {
        setTheme(newTheme);
      }
    };

    window.addEventListener('open-emulator-config', handleOpenEmulatorConfig);
    window.addEventListener('open-directory-manager', handleOpenDirectoryManager);
    window.addEventListener('open-backup-config', handleOpenBackupConfig);
    window.addEventListener('open-settings-theme', handleOpenSettingsTheme);
    window.addEventListener('theme-change', handleThemeChange);

    // 從引導觸發的事件
    window.addEventListener('open-emulator-config-from-guide', handleOpenEmulatorConfigFromGuide);
    window.addEventListener(
      'open-directory-manager-from-guide',
      handleOpenDirectoryManagerFromGuide
    );
    window.addEventListener('open-backup-config-from-guide', handleOpenBackupConfigFromGuide);

    return () => {
      window.removeEventListener('open-emulator-config', handleOpenEmulatorConfig);
      window.removeEventListener('open-directory-manager', handleOpenDirectoryManager);
      window.removeEventListener('open-backup-config', handleOpenBackupConfig);
      window.removeEventListener('open-settings-theme', handleOpenSettingsTheme);
      window.removeEventListener('theme-change', handleThemeChange);
      window.removeEventListener(
        'open-emulator-config-from-guide',
        handleOpenEmulatorConfigFromGuide
      );
      window.removeEventListener(
        'open-directory-manager-from-guide',
        handleOpenDirectoryManagerFromGuide
      );
      window.removeEventListener('open-backup-config-from-guide', handleOpenBackupConfigFromGuide);
    };
  }, [openEmulatorConfig, openDirectoryManager, openBackup, openSettings, setTheme]);

  // 監聽自動掃描完成和遊戲更新事件
  useEffect(() => {
    let updateTimer = null;
    const handleGamesUpdated = (updatedGames) => {
      // 節流更新：避免短時間內多次重新渲染
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        setGames(updatedGames);
        updateTimer = null;
      }, 50); // 50ms 延遲，合併多次更新
    };

    // 增量更新處理器：僅更新受影響的遊戲
    const handleIncrementalUpdate = (updateData) => {
      const { action, affectedGames } = updateData || {};
      if (!affectedGames || affectedGames.length === 0) return;

      // 減少拖放後的瞬時壓力：
      // drag-drop-completed 僅涉及資料夾成員變更，桌面層已有樂觀隱藏與徽章延後刷新，
      // 在此不再做全量 getInitialGames() 重載，以避免渲染端大陣列重算造成卡頓。
      if (action === 'drag-drop-completed') {
        return;
      }

      if (action === 'folder-membership-changed') {
        // 若未来需要，可改為閒置時刷新或延後更長時間
        setTimeout(async () => {
          try {
            const updatedGames = await window.electronAPI.getInitialGames();
            if (updatedGames) setGames(updatedGames);
          } catch (e) {
            console.warn('增量更新失敗，回退到當前狀態:', e);
          }
        }, 150);
      }
    };

    const handleAutoScanCompleted = (result) => {
      if (result.success && result.scanResult.summary.totalNewGames > 0) {
        console.log(`自動掃描完成，發現 ${result.scanResult.summary.totalNewGames} 個新遊戲`);
      }
    };

    // 添加事件監聽
    window.electronAPI.onGamesUpdated(handleGamesUpdated);
    window.electronAPI.onGamesIncrementalUpdate?.(handleIncrementalUpdate);
    window.electronAPI.onAutoScanCompleted(handleAutoScanCompleted);

    // 清理函數
    return () => {
      if (updateTimer) clearTimeout(updateTimer);
      window.electronAPI.removeAllListeners('games-updated');
      window.electronAPI.removeAllListeners('games-incremental-update');
      window.electronAPI.removeAllListeners('auto-scan-completed');
    };
  }, [setGames]);
};
