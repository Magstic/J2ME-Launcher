import { useState, useCallback, useEffect, useRef } from 'react';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
import useCreateShortcut from '@shared/hooks/useCreateShortcut';
import { useSelectedGames } from '@hooks/useGameStore';

/**
 * 桌面視圖邏輯
 * 管理拖拽、資料夾徽章、右鍵選單等桌面特定功能
 */
export const useDesktopView = ({ 
  games, 
  onGameSelect, 
  onAddToFolder, 
  onRefresh,
  onGameInfo 
}) => {
  const [externalDragActive, setExternalDragActive] = useState(false);
  const rootRef = useRef(null);

  // 拖拽狀態管理
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedItem: null,
    draggedType: null,
    dropTarget: null
  });

  // 資料夾徽章狀態
  const [memberSet, setMemberSet] = useState(() => new Set());

  // 刷新資料夾徽章
  const refreshMemberSet = useCallback(async () => {
    try {
      const list = await window.electronAPI?.getGamesInAnyFolder?.();
      if (Array.isArray(list)) {
        setMemberSet(new Set(list));
      } else {
        setMemberSet(new Set());
      }
    } catch (e) {
      console.warn('取得資料夾徽章列表失敗:', e);
    }
  }, []);

  // 監聽資料夾變更事件，更新徽章
  useEffect(() => {
    refreshMemberSet();
    let debounceTimer = 0;
    const debounced = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshMemberSet();
      }, 120);
    };
    const offA = window.electronAPI?.onGameFolderChanged?.(() => debounced());
    const offB = window.electronAPI?.onFolderChanged?.(() => debounced());
    const offC = window.electronAPI?.onFolderUpdated?.(() => debounced());
    const offD = window.electronAPI?.onFolderDeleted?.(() => debounced());
    return () => {
      offA && offA();
      offB && offB();
      offC && offC();
      offD && offD();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [refreshMemberSet]);

  // 監聽跨窗口拖拽會話開始/結束
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

  // 處理拖拽開始
  const handleDragStart = useCallback((item, type) => {
    setDragState({
      isDragging: true,
      draggedItem: item,
      draggedType: type,
      dropTarget: null
    });
  }, []);

  // 處理拖拽結束
  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedItem: null,
      draggedType: null,
      dropTarget: null
    });
  }, []);


  const handleRootDragOver = useCallback((e) => {
    if (externalDragActive) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      e.dataTransfer.effectAllowed = 'move';
    }
  }, [externalDragActive]);

  const handleRootDrop = useCallback((e) => {
    if (!externalDragActive) return;
    e.preventDefault();
    try { window.electronAPI?.dropDragSession?.({ type: 'desktop' }); } catch (err) { console.warn(err); }
    try { window.electronAPI?.endDragSession?.(); } catch (e2) {}
  }, [externalDragActive]);

  // 將 hasFolder 作為額外屬性傳入 GameCard
  const gameCardExtraProps = useCallback(
    (game) => ({ 
      hasFolder: !!(game && memberSet.has(game.filePath))
    }),
    [memberSet]
  );

  // 捷徑創建邏輯（使用共享 hook，統一事件派發與錯誤處理）
  const [selectedGames, setSelectedGames] = useSelectedGames();
  const handleCreateShortcut = useCreateShortcut(games, selectedGames, setSelectedGames, 'DesktopView');

  // 統一右鍵菜單（桌面上下文）
  const { ContextMenuElement, openMenu, closeMenu } = useUnifiedContextMenu({
    view: 'desktop',
    onGameLaunch: onGameSelect,
    onGameConfigure: (game) => {
      window.dispatchEvent(new CustomEvent('open-game-config', { detail: game }));
    },
    onGameInfo,
    onCreateShortcut: handleCreateShortcut,
    onAddToFolder,
    onRefresh,
  });

  return {
    // State
    externalDragActive,
    rootRef,
    dragState,
    memberSet,
    gameCardExtraProps,

    // Actions
    handleDragStart,
    handleDragEnd,
    handleRootDragOver,
    handleRootDrop,
    refreshMemberSet,

    // Context Menu
    ContextMenuElement,
    openMenu,
    closeMenu
  };
};
