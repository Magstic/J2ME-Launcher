import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  folders = [], 
  onGameSelect,
  onFolderOpen,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onAddToFolder,
  onGameInfo,
  onGameDrop,
  onRefresh,
  searchQuery = '',
  isLoading = false,
  isSwitchingToDesktop = false,
  disableFlipExtra = false,
}) => {
  // 已切換至統一右鍵菜單（由 DesktopGrid.Unified 內部的 useUnifiedContextMenu 管理）

  const [externalDragActive, setExternalDragActive] = useState(false);
  const rootRef = useRef(null);

  // 在視圖切換回桌面期間，鎖定上一幀的資料夾列表，避免資料夾短暫被移除再加入導致的佈局跳動
  const [latchedFolders, setLatchedFolders] = useState(folders);
  useEffect(() => {
    if (!isSwitchingToDesktop) {
      // 切換結束後才同步最新資料夾
      setLatchedFolders(folders);
    }
    // 切換期間保持上一幀資料夾不變
  }, [folders, isSwitchingToDesktop]);


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

  // 處理拖拽到資料夾
  const handleDropOnFolder = (folderId) => {
    // 優先使用跨窗口拖拽會話（若存在）
    const api = window.electronAPI;
    if (api?.dropDragSession) {
      // 確保 drop 先抵達主進程，再結束會話，避免 no-active-session 競態
      try {
        Promise.resolve(api.dropDragSession({ type: 'folder', id: folderId }))
          .finally(() => {
            try { api.endDragSession && api.endDragSession(); } catch (_) {}
          });
      } catch (_) {
        try { api.endDragSession && api.endDragSession(); } catch (_) {}
      }
    } else if (dragState.draggedItem && dragState.draggedType === 'game') {
      // 向後兼容：本窗口內移動
      onGameDrop && onGameDrop(dragState.draggedItem.filePath, folderId);
    }
    // 結束本地拖拽狀態（會話在上方 finally 中結束）
    handleDragEnd();
  };

  // 過濾項目（根據搜索查詢）
  const filteredGames = games.filter(game => 
    !searchQuery || 
    game.gameName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    game.vendor?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sourceFolders = isSwitchingToDesktop ? latchedFolders : folders;
  const filteredFolders = sourceFolders.filter(folder =>
    !searchQuery ||
    folder.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    folder.description?.toLowerCase().includes(searchQuery.toLowerCase())
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

  // 當傳入的 folders 變化時，主動刷新徽章集合（保險機制）
  useEffect(() => {
    // 若主進程沒即時廣播事件，依賴 props 的變更也能觸發刷新
    refreshMemberSet();
  }, [refreshMemberSet, folders]);

  // 將 hasFolder 作為額外屬性傳入 GameCard，避免改動遊戲資料本身
  const gameCardExtraProps = useCallback(
    (game) => ({ hasFolder: !!(game && memberSet.has(game.filePath)) }),
    [memberSet]
  );

  // 點擊空白區域關閉右鍵菜單
  // 舊版右鍵菜單關閉監聽已移除

  return (
    <div 
      className={`desktop-view ${isSwitchingToDesktop ? 'mounting' : ''}`} 
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
      onMouseDown={undefined}
      onClick={undefined}
      onMouseMove={undefined}
      onMouseUp={undefined}
      ref={rootRef}
    >
      {/* 桌面網格（已統一） - 包裹層僅用於視覺平移，避免影響 fixed/overlay 的定位 */}
      <div className="desktop-shift-layer">
        <DesktopGridUnified
          games={games}
          folders={[]}
          onGameSelect={onGameSelect}
          onFolderOpen={onFolderOpen}
          onCreateFolder={onCreateFolder}
          onEditFolder={onEditFolder}
          onDeleteFolder={onDeleteFolder}
          onAddToFolder={onAddToFolder}
          onGameInfo={onGameInfo}
          onRefresh={onRefresh}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnFolder={handleDropOnFolder}
          dragState={dragState}
          externalDragActive={externalDragActive}
          isLoading={isLoading}
          disableFlip={isSwitchingToDesktop || disableFlipExtra}
          gameCardExtraProps={gameCardExtraProps}
        />
      </div>
      
      

      {/* 拖拽覆蓋層已移除，改用原生 setDragImage 預覽 */}
    </div>
  );
};

export default DesktopView;
