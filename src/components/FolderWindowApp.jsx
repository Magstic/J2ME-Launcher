import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameLaunchDialog } from '@components';
import GameInfoDialog from './Desktop/GameInfoDialog';
import VirtualizedUnifiedGrid from '@shared/VirtualizedUnifiedGrid';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
import useCreateShortcut from '@shared/hooks/useCreateShortcut';
import { useGamesByFolder, useSelectedGames, useDragState, useGameActions } from '@hooks/useGameStore';
import './FolderWindowApp.css';
import './Desktop/Desktop.css';
import { AppIconSvg } from '@/assets/icons';
import NotificationBubble from './ui/NotificationBubble';

// 已切換至統一網格（UnifiedGrid）

const FolderWindowApp = () => {
  const [folder, setFolder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // 為避免極短暫的 loading 畫面閃現，增加一個 120ms 的顯示延遲
  const [showLoadingUI, setShowLoadingUI] = useState(false);
  useEffect(() => {
    if (isLoading) {
      const t = setTimeout(() => setShowLoadingUI(true), 120);
      return () => clearTimeout(t);
    } else {
      setShowLoadingUI(false);
    }
  }, [isLoading]);
  const hasLoadedRef = useRef(false);
  const [folderId, setFolderId] = useState(null);
  const [gameLaunchDialog, setGameLaunchDialog] = useState({ isOpen: false, game: null, configureOnly: false });
  const [externalDragActive, setExternalDragActive] = useState(false);
  

  // Use unified state management
  const games = useGamesByFolder(folderId);
  const [selectedGames, setSelectedGames] = useSelectedGames();
  const [dragState, setDragState] = useDragState();
  const gameActions = useGameActions();

  // 啟動遊戲（首次彈窗）
  const handleGameLaunch = useCallback(async (game) => {
    try {
      const cfg = await window.electronAPI?.getGameEmulatorConfig?.(game.filePath);
      if (!cfg) {
        setGameLaunchDialog({ isOpen: true, game });
        return;
      }
      await window.electronAPI?.launchGame?.(game.filePath);
    } catch (e) {
      console.error('啟動遊戲失敗:', e);
    }
  }, []);
  // 選取邏輯改由 VirtualizedUnifiedGrid 內建處理（selectionControlled=false）
  const [gameInfoDialog, setGameInfoDialog] = useState({ isOpen: false, game: null });
  // 右鍵菜單：改為直接在此處使用 useUnifiedContextMenu
  const createShortcut = useCreateShortcut(games, selectedGames, setSelectedGames, 'FolderWindow');
  const { ContextMenuElement, openMenu } = useUnifiedContextMenu({
    onGameLaunch: (game) => handleGameLaunch(game),
    onGameConfigure: (game) => setGameLaunchDialog({ isOpen: true, game, configureOnly: true }),
    onRemoveFromFolder: async (game) => {
      if (!folderId || !game) return;
      try {
        const batchList = Array.isArray(game.selectedFilePaths) && game.selectedFilePaths.length > 0
          ? game.selectedFilePaths
          : [game.filePath];
        const result = await window.electronAPI?.batchRemoveGamesFromFolder?.(batchList, folderId);
        if (result?.success) {
          await loadFolderContents();
        } else {
          console.error('批次移除失敗:', result?.error);
        }
      } catch (err) {
        console.error('從資料夾移除失敗:', err);
      }
    },
    onGameInfo: (game) => setGameInfoDialog({ isOpen: true, game }),
    onCreateShortcut: createShortcut,
  });

  // 獲取當前資料夾ID
  useEffect(() => {
    const getCurrentFolderId = () => {
      // 從URL參數獲取
      const urlParams = new URLSearchParams(window.location.search);
      const folderIdFromUrl = urlParams.get('folderId');

      // 從Electron參數獲取（備用方案）
      const folderIdFromElectron = window.electronAPI?.getCurrentFolderId?.();

      return folderIdFromUrl || folderIdFromElectron;
    };

    const currentFolderId = getCurrentFolderId();
    if (currentFolderId) {
      setFolderId(currentFolderId);
    }
  }, []);

  // 右鍵選單由 useUnifiedContextMenu 統一處理（folder-window 視圖）

  // 載入資料夾內容
  const loadFolderContents = useCallback(async () => {
    if (!folderId || !window.electronAPI?.getFolderContents) return;

    // 初次載入才顯示 loading，其後刷新不切換 loading，避免整體閃爍
    if (!hasLoadedRef.current) setIsLoading(true);
    try {
      const result = await window.electronAPI.getFolderContents(folderId);
      setFolder(result.folder);
      // Load games and sync folder membership
      const games = result.games || [];
      gameActions.loadGames(games);

      // Sync folder membership for all games in this folder
      if (games.length > 0) {
        const filePaths = games.map(game => game.filePath);
        gameActions.folderMembershipChanged(filePaths, folderId, 'add');
      }
    } catch (error) {
      console.error('載入資料夾內容失敗:', error);
      setFolder(null);
      gameActions.loadGames([]);
    } finally {
      if (!hasLoadedRef.current) {
        setIsLoading(false);
        hasLoadedRef.current = true;
      }
    }
  }, [folderId, gameActions]);

  useEffect(() => {
    loadFolderContents();
  }, [loadFolderContents]);

  // 監聽資料夾更新事件
  useEffect(() => {
    if (!window.electronAPI?.onFolderUpdated) return;

    const handleFolderUpdated = (updatedFolder) => {
      if (updatedFolder.id === folderId) {
        setFolder(updatedFolder);
        loadFolderContents(); // 重新載入遊戲列表
      }
    };

    window.electronAPI.onFolderUpdated(handleFolderUpdated);

    return () => {
      window.electronAPI.removeAllListeners?.('folder-updated');
    };
  }, [folderId, loadFolderContents]);

  // 監聽通用 folder-changed 事件（跨窗口同步）
  useEffect(() => {
    if (!window.electronAPI?.onFolderChanged) return;
    const unsubscribe = window.electronAPI.onFolderChanged(async () => {
      // 若當前資料夾可能受影響，直接重載
      await loadFolderContents();
    });
    return unsubscribe;
  }, [loadFolderContents]);

  // 監聽跨窗口拖拽會話
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDragSessionStarted || !api?.onDragSessionEnded) return;
    const offStart = api.onDragSessionStarted(() => setExternalDragActive(true));
    const offEnd = api.onDragSessionEnded(() => setExternalDragActive(false));
    return () => {
      offStart && offStart();
      offEnd && offEnd();
    };
  }, []);

  // 處理放置到當前資料夾
  const handleExternalDragOver = useCallback((e) => {
    if (externalDragActive) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, [externalDragActive]);

  const handleExternalDrop = useCallback(async (e) => {
    e.preventDefault();
    if (!externalDragActive || !folderId) return;
    try {
      await window.electronAPI?.dropDragSession?.({ type: 'folder', id: folderId });
    } catch (err) {
      console.error('外部拖拽放置失敗:', err);
    }
  }, [externalDragActive, folderId]);



  // 窗口控制
  const handleMinimize = () => {
    window.electronAPI?.minimizeFolderWindow?.();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeFolderWindow?.();
  };

  const handleClose = () => {
    window.electronAPI?.closeFolderWindowSelf?.();
  };

  // 初次載入期間（含前 120ms 去抖時間），不顯示錯誤畫面，保持安靜背景以避免閃爍
  if (isLoading || !hasLoadedRef.current) {
    return (
      <div className="folder-window-app">
        <div className="folder-window-header">
          <div className="folder-window-title">&nbsp;</div>
          <div className="folder-window-controls">
            <button className="window-control-btn minimize" onClick={handleMinimize}>
              <span>−</span>
            </button>
            <button className="window-control-btn maximize" onClick={handleMaximize}>
              <span>□</span>
            </button>
            <button className="window-control-btn close" onClick={handleClose}>
              <span>×</span>
            </button>
          </div>
        </div>
        <div className="folder-window-content loading">
          {showLoadingUI ? <div className="loading-spinner" aria-label="Loading" /> : null}
        </div>
      </div>
    );
  }

  // 僅在首次載入完成後仍然缺少資料夾時，才顯示錯誤
  if (!folder && hasLoadedRef.current) {
    return (
      <div className="folder-window-app">
        <div className="folder-window-header">
          <div className="folder-window-title">資料夾不存在</div>
          <div className="folder-window-controls">
            <button className="window-control-btn close" onClick={handleClose}>
              <span>×</span>
            </button>
          </div>
        </div>
        <div className="folder-window-content error">
          <div className="error-message">找不到指定的資料夾</div>
        </div>
      </div>
    );
  }

  return (
    <div className="folder-window-app">
      <div className="folder-window-header">
        <div className="folder-window-title">
          <span className="folder-icon" style={{ color: folder.color }}>
            {folder.icon || '📁'}
          </span>
          <span className="folder-name">{folder.name}</span>
          <span className="game-count">({games.length} 個遊戲)</span>
        </div>
        <div className="folder-window-controls">
          <button className="window-control-btn minimize" onClick={handleMinimize}>
            <span>−</span>
          </button>
          <button className="window-control-btn maximize" onClick={handleMaximize}>
            <span>□</span>
          </button>
          <button className="window-control-btn close" onClick={handleClose}>
            <span>×</span>
          </button>
        </div>
      </div>

      <div className="folder-window-content" onDragOver={handleExternalDragOver} onDrop={handleExternalDrop}>
        {games.length === 0 ? (
          <div className="empty-folder">
            <div className="empty-icon">
              <img
                src={AppIconSvg}
                alt="J2ME Launcher Icon"
                style={{
                  width: '128px',
                  height: '128px',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <VirtualizedUnifiedGrid
              games={games}
              onGameClick={(game) => handleGameLaunch(game)}
              onGameContextMenu={(e, game, selectedList) => openMenu(e, game, { view: 'folder-window', kind: 'game', selectedFilePaths: selectedList, extra: { folderId } })}
              onDragStart={() => setDragState({ isDragging: true, draggedItems: [] })}
              onDragEnd={() => {
                setDragState({ isDragging: false, draggedItems: [] });
                try { window.electronAPI?.endDragSession?.(); } catch (e) { }
              }}
              dragState={dragState}
              externalDragActive={externalDragActive}
              isLoading={showLoadingUI && isLoading}
              selectionControlled={false}
              disableFlip={dragState.isDragging}
              containerClassName="games-grid"
              dragSource={{ type: 'folder', id: folderId }}
            />
            {ContextMenuElement}
          </>
        )}
      </div>
      <GameInfoDialog
        isOpen={gameInfoDialog.isOpen}
        game={gameInfoDialog.game}
        onClose={() => setGameInfoDialog({ isOpen: false, game: null })}
      />
      <GameLaunchDialog
        isOpen={gameLaunchDialog.isOpen}
        game={gameLaunchDialog.game}
        configureOnly={!!gameLaunchDialog.configureOnly}
        onClose={() => setGameLaunchDialog({ isOpen: false, game: null, configureOnly: false })}
        onSavedAndLaunch={async (game) => {
          try {
            await window.electronAPI?.launchGame?.(game.filePath);
          } catch (e) {
            console.error('啟動遊戲失敗:', e);
          }
        }}
      />
      {/* 左下角通知氣泡（在資料夾視窗也顯示） */}
      <NotificationBubble />
    </div>
  );
};

export default FolderWindowApp;
