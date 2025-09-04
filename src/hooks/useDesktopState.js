import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 桌面狀態管理 Hook
 * 管理資料夾、桌面項目、批次操作狀態等核心狀態
 */
export const useDesktopState = () => {
  // 核心資料狀態
  const [folders, setFolders] = useState([]);
  const [desktopItems, setDesktopItems] = useState([]);
  const [desktopItemsLoaded, setDesktopItemsLoaded] = useState(false);
  const [desktopItemsSupported] = useState(() => !!(window?.electronAPI?.getDesktopItems));
  
  // 批次操作狀態
  const [bulkMutating, setBulkMutating] = useState(false);
  const [bulkStatus, setBulkStatus] = useState({ 
    active: false, 
    total: 0, 
    done: 0, 
    label: '' 
  });

  // 事件刷新抑制與受控刷新
  const suppressUntilRef = useRef(0);
  const refreshTimerRef = useRef(null);

  // 載入資料夾資料
  const loadFolders = useCallback(async () => {
    try {
      if (window.electronAPI?.getFolders) {
        const folderList = await window.electronAPI.getFolders();
        setFolders(folderList);
      }
    } catch (error) {
      console.error('載入資料夾失敗:', error);
    }
  }, []);

  // 載入桌面資料（遊戲 + 資料夾）
  const loadDesktopItems = useCallback(async () => {
    try {
      if (desktopItemsSupported) {
        const items = await window.electronAPI.getDesktopItems();
        setDesktopItems(items || []);
        setDesktopItemsLoaded(true);
      } else {
        // 舊版或不支援：標記未載入以便上層能使用回退
        setDesktopItems([]);
        setDesktopItemsLoaded(false);
      }
    } catch (error) {
      console.error('載入桌面資料失敗:', error);
      // 失敗時保持回退邏輯（標記為未載入）
      setDesktopItems([]);
      setDesktopItemsLoaded(false);
    }
  }, [desktopItemsSupported]);

  // 初始化資料
  useEffect(() => {
    loadFolders();
    loadDesktopItems();
  }, [loadFolders, loadDesktopItems]);

  // 受控刷新（避免加入後先消失再動）
  const guardedRefresh = useCallback(() => {
    const now = Date.now();
    const remain = suppressUntilRef.current - now;
    if (remain > 0) {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        guardedRefresh();
      }, Math.min(remain + 20, 200));
      return;
    }
    (async () => {
      try { await loadFolders(); } catch (_) {}
      try { await loadDesktopItems(); } catch (_) {}
    })();
  }, [loadFolders, loadDesktopItems]);

  // 手動刷新功能
  const handleRefresh = useCallback(async () => {
    console.log('手動刷新資料');
    await loadFolders();
    await loadDesktopItems();
  }, [loadFolders, loadDesktopItems]);

  // 獲取未分類的遊戲（桌面上顯示的遊戲）
  const getUncategorizedGames = useCallback((games, searchQuery) => {
    // 在搜索狀態下，返回所有（已在上層過濾過的）遊戲，確保包含資料夾內的遊戲
    if (searchQuery && searchQuery.trim()) {
      return games;
    }
    // 非搜索狀態
    if (desktopItemsSupported) {
      // 支援桌面 API：
      // - 已載入：使用桌面資料（即使為空）
      // - 未載入：避免錯誤顯示，暫時返回空陣列
      return desktopItemsLoaded
        ? desktopItems.filter(item => item.type === 'game')
        : [];
    }
    // 不支援桌面 API：返回所有遊戲（向後兼容）
    return games;
  }, [desktopItems, desktopItemsLoaded, desktopItemsSupported]);

  // 獲取桌面上的資料夾
  // 桌面不顯示資料夾，始終返回空陣列
  const getDesktopFolders = useCallback(() => {
    return [];
  }, []);

  // 抽屜使用的資料夾列表（直接使用 folders 狀態）
  const getDrawerFolders = useCallback(() => {
    return folders;
  }, [folders]);

  return {
    // 狀態
    folders,
    setFolders,
    desktopItems,
    setDesktopItems,
    desktopItemsLoaded,
    setDesktopItemsLoaded,
    desktopItemsSupported,
    bulkMutating,
    setBulkMutating,
    bulkStatus,
    setBulkStatus,
    
    // 刷新控制
    suppressUntilRef,
    refreshTimerRef,
    guardedRefresh,
    handleRefresh,
    
    // 資料載入
    loadFolders,
    loadDesktopItems,
    
    // 資料獲取
    getUncategorizedGames,
    getDesktopFolders,
    getDrawerFolders,
  };
};
