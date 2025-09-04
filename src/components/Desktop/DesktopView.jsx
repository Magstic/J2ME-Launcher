import React, { useState, useEffect, useRef, useCallback } from 'react';
import DesktopGridUnified from './DesktopGrid.Unified';
import './Desktop.css';

// 判斷是否點擊在可交互元素上（卡片、選單、表單控件、連結等）
function closestInteractive(target) {
  try {
    if (!target || !target.closest) return false;
    // 桌面不再顯示資料夾，因此移除 .folder-card
    return !!target.closest('.game-card, .context-menu, input, textarea, button, a');
  } catch (_) {
    return false;
  }
}

/**
 * 主桌面視圖組件
 * 管理整個桌面布局和狀態，混合顯示遊戲和資料夾
 */
const DesktopView = ({ 
  games = [], 
  onGameSelect,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onAddToFolder,
  onGameInfo,
  onGameDrop,
  onRefresh,
  searchQuery = '',
  isLoading = false,
  disableFlipExtra = false,
}) => {
  // 已切換至統一右鍵菜單（由 DesktopGrid.Unified 內部的 useUnifiedContextMenu 管理）

  const [externalDragActive, setExternalDragActive] = useState(false);
  const rootRef = useRef(null);

  const handleRootDragOver = (e) => {
    if (externalDragActive) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleRootDrop = (e) => {
    if (!externalDragActive) return;
    e.preventDefault();
    try { window.electronAPI?.dropDragSession?.({ type: 'desktop' }); } catch (err) { console.warn(err); }
    try { window.electronAPI?.endDragSession?.(); } catch (e2) {}
  };

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

  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedItem: null,
    draggedType: null,
    dropTarget: null
  });

  // 舊版右鍵菜單已移除

  // 處理拖拽開始
  const handleDragStart = (item, type) => {
    setDragState({
      isDragging: true,
      draggedItem: item,
      draggedType: type,
      dropTarget: null
    });
  };

  // 處理拖拽結束
  const handleDragEnd = () => {
    setDragState({
      isDragging: false,
      draggedItem: null,
      draggedType: null,
      dropTarget: null
    });
  };


  // 過濾項目（根據搜索查詢）
  const filteredGames = games.filter(game => 
    !searchQuery || 
    game.gameName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    game.vendor?.toLowerCase().includes(searchQuery.toLowerCase())
  );


  // ====== 遊戲是否屬於任一資料夾（顯示徽章）======
  const [memberSet, setMemberSet] = useState(() => new Set()); // Set<string:filePath>
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

  useEffect(() => {
    refreshMemberSet();
    let debounceTimer = 0;
    const debounced = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshMemberSet();
      }, 120);
    };
    const offA = window.electronAPI?.onGameFolderChanged?.(() => {
      // 單個遊戲的資料夾變化：合併短暫事件
      debounced();
    });
    const offB = window.electronAPI?.onFolderChanged?.(() => {
      // 資料夾增刪改：也可能影響成員集合
      debounced();
    });
    // 某些主進程版本僅發出更細分事件：folder-updated / folder-deleted
    const offC = window.electronAPI?.onFolderUpdated?.(() => {
      debounced();
    });
    const offD = window.electronAPI?.onFolderDeleted?.(() => {
      debounced();
    });
    return () => {
      offA && offA();
      offB && offB();
      offC && offC();
      offD && offD();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [refreshMemberSet]);

  // 將 hasFolder 作為額外屬性傳入 GameCard，桌面視圖隱藏廠商和版本信息
  const gameCardExtraProps = useCallback(
    (game) => ({ 
      hasFolder: !!(game && memberSet.has(game.filePath)),
    }),
    [memberSet]
  );

  // 點擊空白區域關閉右鍵菜單

  return (
    <div 
      className="desktop-view" 
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
      ref={rootRef}
    >
      {/* 桌面網格 */}
      <DesktopGridUnified
        games={games}
        onGameSelect={onGameSelect}
        onCreateFolder={onCreateFolder}
        onEditFolder={onEditFolder}
        onDeleteFolder={onDeleteFolder}
        onAddToFolder={onAddToFolder}
        onGameInfo={onGameInfo}
        onRefresh={onRefresh}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragState={dragState}
        externalDragActive={externalDragActive}
        isLoading={isLoading}
        disableFlip={disableFlipExtra}
        gameCardExtraProps={gameCardExtraProps}
      />
    </div>
  );
};

export default DesktopView;
