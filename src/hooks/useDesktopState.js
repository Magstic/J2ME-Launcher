import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { extractAffectedFilePaths } from '../utils/incrementalPayload';

/**
 * 桌面狀態管理 Hook
 * 管理資料夾、桌面項目、批次操作狀態等核心狀態
 */
export const useDesktopState = () => {
  // 核心資料狀態
  const [folders, setFolders] = useState([]);
  const [desktopItems, setDesktopItems] = useState([]);
  const [desktopItemsLoaded, setDesktopItemsLoaded] = useState(false);
  const [desktopItemsSupported] = useState(() => !!window?.electronAPI?.getDesktopItems);

  // 批次操作狀態
  const [bulkMutating, setBulkMutating] = useState(false);
  const [bulkStatus, setBulkStatus] = useState({
    active: false,
    total: 0,
    done: 0,
    label: '',
  });

  // 事件刷新抑制與受控刷新
  const suppressUntilRef = useRef(0);
  const refreshTimerRef = useRef(null);
  // 最近使用者互動時間（用於刷新閘門）
  const lastUserInputRef = useRef(0);
  useEffect(() => {
    const markNow = () => {
      try {
        lastUserInputRef.current = Date.now();
      } catch (_) {}
    };
    window.addEventListener('wheel', markNow, { passive: true });
    window.addEventListener('touchmove', markNow, { passive: true });
    window.addEventListener('keydown', markNow, { passive: true });
    return () => {
      window.removeEventListener('wheel', markNow);
      window.removeEventListener('touchmove', markNow);
      window.removeEventListener('keydown', markNow);
    };
  }, []);

  // 載入資料夾資料
  const loadFolders = useCallback(async () => {
    try {
      if (window.electronAPI?.getFolders) {
        const folderList = await window.electronAPI.getFolders();
        startTransition(() => {
          setFolders(folderList);
        });
      }
    } catch (error) {
      console.error('載入資料夾失敗:', error);
    }
  }, []);

  // 載入桌面資料（遊戲 + 資料夾）
  const loadDesktopItems = useCallback(
    async (opts) => {
      try {
        if (desktopItemsSupported) {
          const items = await window.electronAPI.getDesktopItems();
          // 快速路徑：若新舊清單等效，則跳過 setDesktopItems 以避免不必要的重算
          const isSameList = (a, b) => {
            if (!Array.isArray(a) || !Array.isArray(b)) return false;
            if (a.length !== b.length) return false;
            // 檢查前 512 個元素（足夠覆蓋可視區域與少量 overscan）
            const n = Math.min(512, a.length);
            for (let i = 0; i < n; i++) {
              const x = a[i];
              const y = b[i];
              const xid = x?.type === 'cluster' ? `C:${x?.id}` : `G:${x?.filePath}`;
              const yid = y?.type === 'cluster' ? `C:${y?.id}` : `G:${y?.filePath}`;
              if (xid !== yid) return false;
            }
            // 若前 512 個一致，再抽查尾部 4 個元素
            for (let k = 1; k <= 4; k++) {
              const i = a.length - k;
              if (i < 0) break;
              const x = a[i];
              const y = b[i];
              const xid = x?.type === 'cluster' ? `C:${x?.id}` : `G:${x?.filePath}`;
              const yid = y?.type === 'cluster' ? `C:${y?.id}` : `G:${y?.filePath}`;
              if (xid !== yid) return false;
            }
            return true;
          };

          const apply = (forceReplace) =>
            startTransition(() => {
              if (forceReplace || !isSameList(desktopItems, items || [])) {
                setDesktopItems(items || []);
              }
              setDesktopItemsLoaded(true);
            });
          // 若使用者仍在互動中，延後套用狀態
          const remain = Date.now() - (lastUserInputRef.current || 0) < 1000;
          if (remain) {
            setTimeout(() => apply(!!(opts && opts.forceReplace)), 240);
          } else {
            apply(!!(opts && opts.forceReplace));
          }
        } else {
          // 舊版或不支援：標記未載入以便上層能使用回退
          startTransition(() => {
            setDesktopItems([]);
            setDesktopItemsLoaded(false);
          });
        }
      } catch (error) {
        console.error('載入桌面資料失敗:', error);
        // 失敗時保持回退邏輯（標記為未載入）
        startTransition(() => {
          setDesktopItems([]);
          setDesktopItemsLoaded(false);
        });
      }
    },
    [desktopItemsSupported, desktopItems]
  );

  // 初始化資料
  useEffect(() => {
    loadFolders();
    loadDesktopItems();
  }, [loadFolders, loadDesktopItems]);

  // 即時（樂觀）更新：拖放完成後，先行從桌面清單移除受影響的遊戲，降低體感延遲
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onGamesIncrementalUpdate) return;
    const off = api.onGamesIncrementalUpdate((update) => {
      try {
        const action = update?.action;
        const affected = action === 'drag-drop-completed' ? extractAffectedFilePaths(update) : [];
        if (action === 'drag-drop-completed' && affected.length > 0) {
          try {
            console.log('[DesktopState] drag-drop-completed received:', {
              count: affected.length,
              at: Date.now(),
            });
          } catch (_) {}
          // 抑制在短暫窗口內的自動刷新，與徽章刷新一致（1.4s），降低剛放下後的滾動卡頓
          try {
            suppressUntilRef.current = Date.now() + 1400;
          } catch (_) {}
          const removeSet = new Set(affected.map(String));
          setDesktopItems((prev) => {
            if (!Array.isArray(prev) || prev.length === 0) return prev;
            // 僅移除桌面上的遊戲項目（type==='game'）
            const next = prev.filter(
              (it) =>
                !(it && it.type === 'game' && it.filePath && removeSet.has(String(it.filePath)))
            );
            return next;
          });
        }
      } catch (_) {}
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, [setDesktopItems]);

  // 立即響應主進程的『桌面移除』事件（更早於全量/增量刷新）
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDesktopRemoveItems) return;
    const off = api.onDesktopRemoveItems((payload) => {
      try {
        const fps = Array.isArray(payload?.filePaths) ? payload.filePaths : [];
        if (fps.length === 0) return;
        try {
          console.log('[DesktopState] desktop:remove-items received:', {
            count: fps.length,
            at: Date.now(),
          });
        } catch (_) {}
        // 抑制在短暫窗口內的自動刷新，與徽章刷新一致（1.4s），降低剛放下後的滾動卡頓
        try {
          suppressUntilRef.current = Date.now() + 1400;
        } catch (_) {}
        const removeSet = new Set(fps.map(String));
        setDesktopItems((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          return prev.filter(
            (it) => !(it && it.type === 'game' && it.filePath && removeSet.has(String(it.filePath)))
          );
        });
      } catch (_) {}
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, [setDesktopItems]);

  // 受控刷新（避免加入後先消失再動）
  const guardedRefresh = useCallback(() => {
    const now = Date.now();
    const remain = suppressUntilRef.current - now;
    if (remain > 0) {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(
        () => {
          refreshTimerRef.current = null;
          guardedRefresh();
        },
        Math.min(remain + 30, 1200)
      );
      return;
    }
    // 在主執行緒空閒時執行，避免打斷用戶滾動
    const run = () => {
      // 若近期有使用者互動，稍後再試
      const active = Date.now() - (lastUserInputRef.current || 0) < 1000;
      if (active) {
        setTimeout(run, 250);
        return;
      }
      try {
        loadFolders();
      } catch (_) {}
      try {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(() => {
            try {
              loadDesktopItems();
            } catch (_) {}
          });
        } else {
          setTimeout(() => {
            try {
              loadDesktopItems();
            } catch (_) {}
          }, 80);
        }
      } catch (_) {}
    };
    try {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(run);
      } else {
        setTimeout(run, 0);
      }
    } catch (_) {
      setTimeout(run, 0);
    }
  }, [loadFolders, loadDesktopItems]);

  // 手動刷新功能
  const handleRefresh = useCallback(async () => {
    console.log('手動刷新資料');
    await loadFolders();
    await loadDesktopItems();
  }, [loadFolders, loadDesktopItems]);

  // 獲取未分類的遊戲（桌面上顯示的遊戲）
  const getUncategorizedGames = useCallback(
    (games, searchQuery) => {
      // 在搜索狀態下，返回所有（已在上層過濾過的）遊戲，確保包含資料夾內的遊戲
      if (searchQuery && searchQuery.trim()) {
        return games;
      }
      // 非搜索狀態
      if (desktopItemsSupported) {
        // 支援桌面 API：
        // - 已載入：使用桌面資料（即使為空）
        // - 未載入：避免錯誤顯示，暫時返回空陣列
        return desktopItemsLoaded ? desktopItems.filter((item) => item.type === 'game') : [];
      }
      // 不支援桌面 API：返回所有遊戲（向後兼容）
      return games;
    },
    [desktopItems, desktopItemsLoaded, desktopItemsSupported]
  );

  // 取得桌面用的統一 Items（含簇 + 遊戲）。
  // 搜索時返回傳入的遊戲（映射為 items: type='game'），非搜索時返回後端提供的 desktopItems（可能包含簇）。
  const getDesktopGridItems = useCallback(
    (games, searchQuery) => {
      if (searchQuery && searchQuery.trim()) {
        return Array.isArray(games) ? games.map((game) => ({ ...game, type: 'game' })) : [];
      }
      if (desktopItemsSupported) {
        return desktopItemsLoaded ? desktopItems : [];
      }
      return Array.isArray(games) ? games.map((game) => ({ ...game, type: 'game' })) : [];
    },
    [desktopItems, desktopItemsLoaded, desktopItemsSupported]
  );

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
    getDesktopGridItems,
    getDesktopFolders,
    getDrawerFolders,
  };
};
