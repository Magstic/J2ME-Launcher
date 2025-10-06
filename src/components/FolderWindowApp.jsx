import React, { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import { GameLaunchDialog } from '@components';
import GameInfoDialog from './Desktop/GameInfoDialog';
import VirtualizedUnifiedGrid from '@shared/VirtualizedUnifiedGrid';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
import useCreateShortcut from '@shared/hooks/useCreateShortcut';
import { useGuardedRefresh, useMergedEventRefresh } from '@shared/hooks';
import { useItemsMemo } from '@shared/utils/itemsMemo';
import { listShallowEqualByKeys, keyOfGame, keyOfCluster } from '@shared/utils/listEquality';
import { useSelectedGames, useDragState } from '@hooks/useGameStore';
import './FolderWindowApp.css';
import './Desktop/Desktop.css';
import { AppIconSvg } from '@/assets/icons';
import NotificationBubble from './ui/NotificationBubble';
import { ClusterSelectDialog, ClusterDialog, RenameDialog } from '@ui';

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
  // 用於增量 membership 與事件合併去抖
  const lastFileSetRef = useRef(null);
  const pendingUpdatedFolderRef = useRef(null);
  const suppressUntilRef = useRef(0);
  const [gameLaunchDialog, setGameLaunchDialog] = useState({
    isOpen: false,
    game: null,
    configureOnly: false,
  });
  const [externalDragActive, setExternalDragActive] = useState(false);
  const [clusters, setClusters] = useState([]);
  // 與桌面一致：用於即時隱藏被納入新簇的遊戲
  const [optimisticHideSet, setOptimisticHideSet] = useState(() => new Set());
  // 本地資料：以避免全域 store O(n) 重組帶來的卡頓
  const [folderGames, setFolderGames] = useState([]);
  const prevGamesRef = useRef([]);
  const prevClustersRef = useRef([]);
  const [addToClusterState, setAddToClusterState] = useState({ open: false, filePaths: [] });
  const [mergeState, setMergeState] = useState({ open: false, from: null });
  const [clusterDialog, setClusterDialog] = useState({ isOpen: false, clusterId: null });
  const [renameState, setRenameState] = useState({ open: false, cluster: null });
  // 暫存本次操作中被從 folderGames 移除的遊戲（filePath -> game），便於校正時回補
  const stagedRemovedRef = useRef(new Map());

  // Use unified state management
  const [selectedGames, setSelectedGames] = useSelectedGames();
  const [dragState, setDragState] = useDragState();
  // 使用者活躍偵測（與桌面一致：不監聽 mousedown/pointerdown，避免點擊導致 1s 延後）
  const lastUserInputRef = useRef(0);
  useEffect(() => {
    const mark = () => {
      try {
        lastUserInputRef.current = Date.now();
      } catch (_) {}
    };
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('keydown', mark, { passive: true });
    return () => {
      window.removeEventListener('wheel', mark);
      window.removeEventListener('touchmove', mark);
      window.removeEventListener('keydown', mark);
    };
  }, []);
  // items 穩定引用（降低 Grid 重掛載）
  const items = useItemsMemo(folderGames, clusters);
  // 父層不再做二次過濾，避免與物理移除重疊造成雙重 O(n)
  const itemsForRender = items;

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
  const createShortcut = useCreateShortcut(
    folderGames,
    selectedGames,
    setSelectedGames,
    'FolderWindow'
  );
  const creatingClusterRef = useRef(false);
  const { ContextMenuElement, openMenu } = useUnifiedContextMenu({
    onGameLaunch: (game) => handleGameLaunch(game),
    onGameConfigure: (game) => setGameLaunchDialog({ isOpen: true, game, configureOnly: true }),
    onMergeCluster: (cluster) => {
      if (!cluster?.id) return;
      setMergeState({ open: true, from: cluster });
    },
    onRenameCluster: (cluster) => {
      if (!cluster?.id) return;
      setRenameState({ open: true, cluster });
    },
    onConsolidateClusters: async (payload) => {
      try {
        const ids = Array.isArray(payload?.selectedClusterIds)
          ? payload.selectedClusterIds.filter(Boolean)
          : [];
        if (ids.length < 2) return;
        const toId = ids[0];
        const chosenId = ids[Math.floor(Math.random() * ids.length)];
        let chosen = null;
        try {
          chosen = await window.electronAPI?.getCluster?.(chosenId);
        } catch (_) {}
        for (let i = 1; i < ids.length; i++) {
          const fromId = ids[i];
          if (!fromId || fromId === toId) continue;
          try {
            const res = await window.electronAPI?.mergeClusters?.(fromId, toId);
            if (!res?.success) {
              console.warn('[FolderWindow] 合併簇失敗:', res?.error || res);
            }
          } catch (e) {
            console.error('[FolderWindow] 合併簇調用異常:', e);
          }
        }
        if (chosen && toId) {
          const update = { id: toId };
          if (typeof chosen.name === 'string') update.name = chosen.name;
          if (chosen.icon !== undefined) update.icon = chosen.icon;
          if (chosen.primaryFilePath) update.primaryFilePath = chosen.primaryFilePath;
          try {
            const res2 = await window.electronAPI?.updateCluster?.(update);
            if (!res2?.success) {
              console.warn('[FolderWindow] 更新合併後簇屬性失敗:', res2?.error || res2);
            }
          } catch (e) {
            console.error('[FolderWindow] 更新合併後簇屬性異常:', e);
          }
        }
        // 本地即時移除被合併的簇，保留目標簇
        startTransition(() => {
          setClusters((prev) => {
            if (!Array.isArray(prev)) return prev;
            const idSet = new Set((ids || []).map(String));
            const keepId = String(toId);
            return prev.filter((c) => {
              const cid = String(c?.id);
              if (cid === keepId) return true;
              return !idSet.has(cid);
            });
          });
        });
        // 重設簇選中：僅保留合併後的目標簇
        try {
          window.dispatchEvent(
            new CustomEvent('clusters-selection-reset', { detail: { ids: [toId] } })
          );
        } catch (_) {}
      } catch (err) {
        console.error('[FolderWindow] 合簇流程錯誤:', err);
      }
    },
    onAddToCluster: (target) => {
      const list =
        Array.isArray(target?.selectedFilePaths) && target.selectedFilePaths.length > 0
          ? target.selectedFilePaths
          : target?.filePath
            ? [target.filePath]
            : [];
      if (!list || list.length === 0) return;
      setAddToClusterState({ open: true, filePaths: list });
    },
    onCreateCluster: async (target) => {
      if (creatingClusterRef.current) return; // 簡單防抖，避免重入導致重複建立
      creatingClusterRef.current = true;
      try {
        const list =
          Array.isArray(target?.selectedFilePaths) && target.selectedFilePaths.length > 0
            ? target.selectedFilePaths
            : target?.filePath
              ? [target.filePath]
              : [];
        if (!list || list.length === 0) return;
        const res = await window.electronAPI?.createCluster?.({ filePaths: list });
        if (res?.success && res?.clusterId && folderId) {
          // 先行樂觀插入骨架簇，避免等待 IPC
          try {
            // 從首個選中遊戲推導簇的暫時圖示與名稱（接近最終狀態，避免空白/預設名）
            const first = Array.isArray(list) && list.length > 0 ? String(list[0]) : null;
            const primary = first
              ? (folderGames || []).find((g) => String(g?.filePath) === first)
              : null;
            const inferredName =
              (primary && (primary.customName || primary.gameName || primary.originalName)) ||
              'Cluster';
            const inferredIcon =
              primary && (primary.iconUrl || primary.iconPath)
                ? primary.iconUrl || primary.iconPath
                : '';
            const skeleton = {
              id: res.clusterId,
              name: inferredName,
              iconUrl: inferredIcon || '',
              memberCount: Array.isArray(list) ? list.length : undefined,
              type: 'cluster',
            };
            startTransition(() => {
              setClusters((prev) => {
                const idStr = String(res.clusterId);
                const exists = (prev || []).some((c) => String(c?.id) === idStr);
                return exists ? prev : [...prev, skeleton];
              });
              // 同步從本地列表移除被收編的遊戲，避免 DOM 保留空位與大範圍重繪
              if (Array.isArray(list) && list.length > 0) {
                setFolderGames((prev) => {
                  if (!Array.isArray(prev)) return prev;
                  const removed = [];
                  const next = prev.filter((g) => {
                    const match = list.includes(g?.filePath);
                    if (match) removed.push(g);
                    return !match;
                  });
                  try {
                    const map = stagedRemovedRef.current || new Map();
                    for (const g of removed) map.set(String(g.filePath), g);
                    stagedRemovedRef.current = map;
                  } catch (_) {}
                  return next;
                });
              }
            });
          } catch (_) {}
          // 不再使用樂觀隱藏集合，改以物理移除 + 校正回補，避免雙重 O(n)
          try {
            await window.electronAPI?.addClusterToFolder?.(res.clusterId, folderId);
          } catch (_) {}
          // 樂觀插入簇：立即顯示新簇，等待稍後受控刷新校正
          try {
            // 併發獲取簇詳情與成員，加速骨架替換與成員校正
            const [created, memRes] = await Promise.all([
              window.electronAPI?.getCluster?.(res.clusterId),
              window.electronAPI?.getClusterMembers?.(res.clusterId),
            ]);
            if (created && created.id != null) {
              startTransition(() => {
                setClusters((prev) => {
                  const idStr = String(created.id);
                  const exists = (prev || []).some((c) => String(c?.id) === idStr);
                  return exists
                    ? prev.map((c) => (String(c?.id) === idStr ? { ...c, ...created } : c))
                    : [...prev, created];
                });
              });
            }
            // 成員校正與本地刪除補齊
            const members = Array.isArray(memRes?.members) ? memRes.members : [];
            const memberPaths = members.map((m) => m.filePath);
            const removePaths = memberPaths.filter((fp) => list.includes(fp));
            const notIncluded = list.filter((fp) => !removePaths.includes(fp));
            if (notIncluded.length > 0) {
              startTransition(() => {
                // 回補那些實際未加入簇的遊戲（從 stagedRemovedRef 取回原物件）
                const map = stagedRemovedRef.current;
                const toAdd = [];
                for (const fp of notIncluded) {
                  const g = map?.get(String(fp));
                  if (g) toAdd.push(g);
                }
                if (toAdd.length > 0) {
                  setFolderGames((prev) => (Array.isArray(prev) ? [...prev, ...toAdd] : prev));
                  try {
                    for (const fp of notIncluded) map?.delete(String(fp));
                  } catch (_) {}
                }
              });
            }
            if (removePaths.length > 0) {
              try {
                await window.electronAPI?.batchRemoveGamesFromFolder?.(removePaths, folderId);
              } catch (_) {}
              try {
                // 從暫存中清除已確定移除的成員
                const map = stagedRemovedRef.current;
                for (const fp of removePaths) map?.delete(String(fp));
              } catch (_) {}
            }
          } catch (_) {}
          // 僅移除“實際被納入新簇”的成員，避免誤移除未加入者
          try {
            // 上一段已完成併發獲取與校正，這裡不再重複請求
          } catch (_) {}
          // 移除受控刷新：改由本地差分維護狀態，避免一次全量重載
        } else if (!res?.success) {
          console.error('[FolderWindow] 建立簇失敗:', res?.error || res);
        }
      } catch (e) {
        console.error('[FolderWindow] 建立簇調用異常:', e);
      } finally {
        // 釋放鎖，稍作延遲避免連續點擊
        setTimeout(() => {
          creatingClusterRef.current = false;
        }, 250);
      }
    },
    onRemoveFromFolder: async (game) => {
      if (!folderId || !game) return;
      try {
        // 遊戲多選（若有）
        const gameList =
          Array.isArray(game.selectedFilePaths) && game.selectedFilePaths.length > 0
            ? Array.from(new Set(game.selectedFilePaths))
            : game.filePath
              ? [game.filePath]
              : [];

        // 簇多選（若有；允許在遊戲右鍵時也一起移除簇）
        const clusterIds =
          Array.isArray(game.selectedClusterIds) && game.selectedClusterIds.length > 0
            ? Array.from(new Set(game.selectedClusterIds.map(String)))
            : [];

        // 先移除遊戲
        if (gameList.length > 0 && window.electronAPI?.batchRemoveGamesFromFolder) {
          const result = await window.electronAPI.batchRemoveGamesFromFolder(gameList, folderId);
          if (!result?.success) {
            console.error('[FolderWindow] 批次移除遊戲失敗:', result?.error);
          }
        } else if (gameList.length > 0 && window.electronAPI?.removeGameFromFolder) {
          for (const fp of gameList) {
            try {
              await window.electronAPI.removeGameFromFolder(fp, folderId);
            } catch (_) {}
          }
        }

        // 再移除簇
        if (clusterIds.length > 0 && window.electronAPI?.removeClusterFromFolder) {
          for (const cid of clusterIds) {
            try {
              await window.electronAPI.removeClusterFromFolder(cid, folderId);
            } catch (_) {}
          }
        }

        // 不再全量刷新，後續依事件校正或局部 patch
      } catch (err) {
        console.error('從資料夾移除（混合）失敗:', err);
      }
    },
    onGameInfo: (game) => setGameInfoDialog({ isOpen: true, game }),
    onCreateShortcut: createShortcut,
    // Cluster callbacks (folder-window)
    onClusterInfo: (cluster) => {
      try {
        console.log('[FolderWindow] cluster info requested:', cluster);
      } catch (_) {}
      try {
        window.dispatchEvent(new CustomEvent('open-cluster-dialog', { detail: cluster?.id }));
      } catch (_) {}
    },
    onDeleteCluster: async (cluster) => {
      try {
        // 先抓取成員，方便本地即時還原
        let members = [];
        try {
          const memRes = await window.electronAPI?.getClusterMembers?.(cluster.id);
          members = Array.isArray(memRes?.members) ? memRes.members : [];
        } catch (_) {}

        // 本地立即移除簇
        startTransition(() => {
          setClusters((prev) =>
            Array.isArray(prev) ? prev.filter((c) => String(c?.id) !== String(cluster.id)) : prev
          );
          // 本地即時回補成員到 folderGames（去重）
          if (Array.isArray(members) && members.length > 0) {
            setFolderGames((prev) => {
              if (!Array.isArray(prev)) return prev;
              const exist = new Set(prev.map((g) => String(g?.filePath)));
              const toAdd = [];
              for (const m of members) {
                const fp = String(m?.filePath);
                if (!exist.has(fp)) toAdd.push(m);
              }
              return toAdd.length ? [...prev, ...toAdd] : prev;
            });
          }
        });

        // 後端刪除簇
        await window.electronAPI?.deleteCluster?.(cluster.id);
        // 不再全量刷新，等待事件或後續空閒校正
      } catch (e) {
        console.error('刪除簇失敗:', e);
      }
    },
    onRemoveClusterFromFolder: async (cluster) => {
      if (!folderId || !cluster) return;
      try {
        // 簇多選（若有）
        const clusterIds =
          Array.isArray(cluster.selectedClusterIds) && cluster.selectedClusterIds.length > 0
            ? Array.from(new Set(cluster.selectedClusterIds.map(String)))
            : cluster.id != null
              ? [String(cluster.id)]
              : [];

        // 混合選取時也一併處理被選中的遊戲
        const gameList =
          Array.isArray(cluster.selectedFilePaths) && cluster.selectedFilePaths.length > 0
            ? Array.from(new Set(cluster.selectedFilePaths))
            : [];

        // 先移除遊戲
        if (gameList.length > 0 && window.electronAPI?.batchRemoveGamesFromFolder) {
          const result = await window.electronAPI.batchRemoveGamesFromFolder(gameList, folderId);
          if (!result?.success) {
            console.error('[FolderWindow] 批次移除遊戲失敗:', result?.error);
          }
        } else if (gameList.length > 0 && window.electronAPI?.removeGameFromFolder) {
          for (const fp of gameList) {
            try {
              await window.electronAPI.removeGameFromFolder(fp, folderId);
            } catch (_) {}
          }
        }

        // 再移除簇
        if (clusterIds.length > 0 && window.electronAPI?.removeClusterFromFolder) {
          for (const cid of clusterIds) {
            try {
              await window.electronAPI.removeClusterFromFolder(cid, folderId);
            } catch (_) {}
          }
        }
        // 本地移除這些簇（從當前資料夾視圖消失）
        startTransition(() => {
          setClusters((prev) =>
            Array.isArray(prev) ? prev.filter((c) => !clusterIds.includes(String(c?.id))) : prev
          );
        });
        // 不再全量刷新，依事件或後續操作校正
      } catch (err) {
        console.error('從資料夾移除簇（混合）失敗:', err);
      }
    },
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
      // Load games and clusters（本地狀態，不觸發全域 store 重算）
      const games = result.games || [];
      const cs = Array.isArray(result.clusters) ? result.clusters : [];
      // 僅在鍵集合有變更時更新 clusters
      if (!listShallowEqualByKeys(prevClustersRef.current, cs, { keyOf: keyOfCluster })) {
        setClusters(cs);
        prevClustersRef.current = cs;
      }
      // 僅在鍵集合有變更時更新 folderGames
      if (!listShallowEqualByKeys(prevGamesRef.current, games, { keyOf: keyOfGame })) {
        setFolderGames(games);
        prevGamesRef.current = games;
      }
      // 重載完成：清空樂觀隱藏，避免殘留
      try {
        setOptimisticHideSet(new Set());
      } catch (_) {}
    } catch (error) {
      console.error('載入資料夾內容失敗:', error);
      setFolder(null);
      setFolderGames([]);
    } finally {
      if (!hasLoadedRef.current) {
        setIsLoading(false);
        hasLoadedRef.current = true;
      }
    }
  }, [folderId]);

  useEffect(() => {
    loadFolderContents();
  }, [loadFolderContents]);

  // 切換資料夾時重置比較集合
  useEffect(() => {
    lastFileSetRef.current = null;
  }, [folderId]);

  // 受控刷新：整合 pendingUpdatedFolder，並交由 guarded 門閘執行
  const refreshFn = useCallback(async () => {
    try {
      if (pendingUpdatedFolderRef.current && pendingUpdatedFolderRef.current.id === folderId) {
        setFolder(pendingUpdatedFolderRef.current);
      }
    } catch (_) {}
    pendingUpdatedFolderRef.current = null;
    await loadFolderContents();
  }, [folderId, loadFolderContents]);

  const { guardedRefresh, scheduleGuardedRefresh, cancelScheduled } = useGuardedRefresh({
    refreshFn,
    suppressUntilRef,
    lastUserInputRef,
    userActiveWindowMs: 1000,
    idleDelayMs: 0,
    preferImmediate: true,
  });

  // 監聽簇詳情事件（Folder 窗口自帶版本）
  useEffect(() => {
    const handler = (event) => {
      const id = event?.detail;
      if (id) setClusterDialog({ isOpen: true, clusterId: id });
    };
    window.addEventListener('open-cluster-dialog', handler);
    return () => window.removeEventListener('open-cluster-dialog', handler);
  }, []);

  // 監聽：在簇對話框中右鍵「資訊」事件（folder window 本地處理）
  useEffect(() => {
    const onOpenGameInfo = (event) => {
      const game = event?.detail;
      if (!game) return;
      setGameInfoDialog({ isOpen: true, game });
    };
    window.addEventListener('open-game-info', onOpenGameInfo);
    return () => window.removeEventListener('open-game-info', onOpenGameInfo);
  }, []);

  // 監聽：在簇對話框中右鍵「設定」事件（folder window 本地處理）
  useEffect(() => {
    const onOpenGameConfig = (event) => {
      const game = event?.detail;
      if (!game) return;
      setGameLaunchDialog({ isOpen: true, game, configureOnly: true });
    };
    window.addEventListener('open-game-config', onOpenGameConfig);
    return () => window.removeEventListener('open-game-config', onOpenGameConfig);
  }, []);

  // 監聽：簇內成員首次啟動事件（folder window 本地處理）
  useEffect(() => {
    const onOpenGameLaunch = (event) => {
      const game = event?.detail;
      if (!game) return;
      setGameLaunchDialog({ isOpen: true, game, configureOnly: false });
    };
    window.addEventListener('open-game-launch', onOpenGameLaunch);
    return () => window.removeEventListener('open-game-launch', onOpenGameLaunch);
  }, []);

  // 監聽：需要開啟模擬器設定（folder window 本地處理）
  useEffect(() => {
    const onOpenEmulatorConfig = () => {
      try {
        // 若 folder 視窗無本地設定對話框，請求主進程/主窗口開啟設定
        if (window.electronAPI?.openSettings) {
          window.electronAPI.openSettings('emulator');
        } else {
          // 後備：向主窗口廣播（由主窗口的 useAppEventListeners 來處理）
          window.dispatchEvent(new CustomEvent('open-emulator-config-proxy'));
        }
      } catch (_) {}
    };
    window.addEventListener('open-emulator-config', onOpenEmulatorConfig);
    return () => window.removeEventListener('open-emulator-config', onOpenEmulatorConfig);
  }, []);

  // 統一合併 cluster/folder 事件為單一去抖入口，並在事件到達時先行合併 pendingUpdatedFolder
  useMergedEventRefresh({
    sources: [
      (cb) =>
        window.electronAPI?.onClusterChanged?.((payload) =>
          cb({ type: 'cluster-changed', payload })
        ),
      (cb) =>
        window.electronAPI?.onClusterDeleted?.((payload) =>
          cb({ type: 'cluster-deleted', payload })
        ),
      (cb) =>
        window.electronAPI?.onFolderUpdated?.((payload) => cb({ type: 'folder-updated', payload })),
      (cb) =>
        window.electronAPI?.onFolderChanged?.((payload) => cb({ type: 'folder-changed', payload })),
    ],
    schedule: (ms) => scheduleGuardedRefresh(ms),
    debounceMs: 150,
    filter: (evt) => {
      if (!evt) return false;
      // folder-updated 僅更新本地 meta，不重載
      if (evt.type === 'folder-updated') return false;
      // cluster 相關事件改為本地處理或忽略，不觸發全量重載
      if (evt.type === 'cluster-changed' || evt.type === 'cluster-deleted') return false;
      // 僅在資料夾結構級變更時才允許重載
      return evt.type === 'folder-changed';
    },
    onEvent: (evt) => {
      try {
        if (!evt) return;
        // 直接套用當前資料夾 meta
        if (evt.type === 'folder-updated' && evt.payload?.id === folderId) {
          setFolder(evt.payload);
          return;
        }
        // 本地差分：cluster 變更
        if (evt.type === 'cluster-changed') {
          const p = evt.payload || {};
          const clusterObj = p && (p.cluster || p.data || null);
          const cid = String(p?.id ?? clusterObj?.id ?? p?.clusterId ?? '');
          if (cid) {
            // 優先以 API 拉取最新簇資料（避免 payload 欄位不全）
            try {
              const maybe = window.electronAPI?.getCluster?.(cid);
              if (maybe && typeof maybe.then === 'function') {
                maybe
                  .then((created) => {
                    if (created && created.id != null) {
                      startTransition(() => {
                        setClusters((prev) => {
                          if (!Array.isArray(prev)) return [created];
                          const idStr = String(created.id);
                          const exists = prev.some((c) => String(c?.id) === idStr);
                          return exists
                            ? prev.map((c) => (String(c?.id) === idStr ? { ...c, ...created } : c))
                            : [...prev, created];
                        });
                      });
                    }
                  })
                  .catch(() => {});
              }
            } catch (_) {}
          } else if (clusterObj && clusterObj.id != null) {
            // 次選：payload 已含簇物件，直接套用
            startTransition(() => {
              setClusters((prev) => {
                if (!Array.isArray(prev)) return [clusterObj];
                const idStr = String(clusterObj.id);
                const exists = prev.some((c) => String(c?.id) === idStr);
                return exists
                  ? prev.map((c) => (String(c?.id) === idStr ? { ...c, ...clusterObj } : c))
                  : [...prev, clusterObj];
              });
            });
          } else {
            // 最後降級：重新獲取當前資料夾下簇列表（仍比全量重載輕）
            try {
              const maybeList = window.electronAPI?.getClustersByFolder?.(folderId);
              if (maybeList && typeof maybeList.then === 'function') {
                maybeList
                  .then((res) => {
                    const cs = Array.isArray(res?.clusters) ? res.clusters : [];
                    startTransition(() => setClusters(cs));
                  })
                  .catch(() => {});
              }
            } catch (_) {}
          }
          return;
        }
        // 本地差分：cluster 刪除
        if (evt.type === 'cluster-deleted') {
          const p = evt.payload || {};
          const cid = String(p?.id ?? p?.clusterId ?? '');
          if (cid) {
            startTransition(() => {
              setClusters((prev) =>
                Array.isArray(prev) ? prev.filter((c) => String(c?.id) !== cid) : prev
              );
            });
          } else {
            // 降級：重新獲取資料夾簇列表
            try {
              const maybeList = window.electronAPI?.getClustersByFolder?.(folderId);
              if (maybeList && typeof maybeList.then === 'function') {
                maybeList
                  .then((res) => {
                    const cs = Array.isArray(res?.clusters) ? res.clusters : [];
                    startTransition(() => setClusters(cs));
                  })
                  .catch(() => {});
              }
            } catch (_) {}
          }
          return;
        }
      } catch (_) {}
    },
  });

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
  const handleExternalDragOver = useCallback(
    (e) => {
      if (externalDragActive) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    },
    [externalDragActive]
  );

  const handleExternalDrop = useCallback(
    async (e) => {
      e.preventDefault();
      if (!externalDragActive || !folderId) return;
      try {
        let types = [];
        let filesLen = 0;
        try {
          types = Array.from(e.dataTransfer && e.dataTransfer.types ? e.dataTransfer.types : []);
          filesLen = e.dataTransfer?.files ? e.dataTransfer.files.length : 0;
        } catch {}
        const hasInternalMIME =
          types.includes('application/x-j2me-internal') ||
          types.includes('application/x-j2me-filepath');
        const internalHint = !!(hasInternalMIME || (types.length === 0 && filesLen === 0));
        await window.electronAPI?.dropDragSession?.({
          type: 'folder',
          id: folderId,
          internal: internalHint,
        });
      } catch (err) {
        console.error('外部拖拽放置失敗:', err);
      }
    },
    [externalDragActive, folderId]
  );

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
          <span className="game-count">({folder?.gameCount ?? folderGames.length})</span>
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

      <div
        className="folder-window-content"
        onDragOver={handleExternalDragOver}
        onDrop={handleExternalDrop}
      >
        {folderGames.length === 0 && clusters.length === 0 ? (
          <div className="empty-folder">
            <div className="empty-icon">
              <img
                src={AppIconSvg}
                alt="J2ME Launcher Icon"
                style={{
                  width: '128px',
                  height: '128px',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <VirtualizedUnifiedGrid
              games={folderGames}
              items={itemsForRender}
              optimisticHideSet={optimisticHideSet}
              onGameClick={(game) => handleGameLaunch(game)}
              onGameContextMenu={(e, game, selectedList, selectedClusterIds) =>
                openMenu(e, game, {
                  view: 'folder-window',
                  kind: 'game',
                  selectedFilePaths: selectedList,
                  selectedClusterIds,
                  extra: { folderId },
                })
              }
              onClusterClick={(cluster) => {
                try {
                  window.dispatchEvent(
                    new CustomEvent('open-cluster-dialog', { detail: cluster?.id })
                  );
                } catch (_) {}
              }}
              onClusterContextMenu={(e, cluster) =>
                openMenu(e, cluster, {
                  view: 'folder-window',
                  kind: 'cluster',
                  extra: { folderId },
                })
              }
              onDragStart={() => setDragState({ isDragging: true, draggedItems: [] })}
              onDragEnd={() => {
                setDragState({ isDragging: false, draggedItems: [] });
                try {
                  const ms = 2500;
                  const ts = Date.now();
                  try {
                    console.log(
                      '[DRAG_UI] (FolderWindow) scheduled endDragSession in',
                      ms,
                      'ms at',
                      ts
                    );
                  } catch {}
                  setTimeout(() => {
                    try {
                      console.log(
                        '[DRAG_UI] (FolderWindow) endDragSession now at',
                        Date.now(),
                        'scheduledAt=',
                        ts
                      );
                      window.electronAPI?.endDragSession?.();
                    } catch (_) {}
                  }, ms);
                } catch (_) {}
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
            <ClusterSelectDialog
              isOpen={addToClusterState.open}
              onClose={() => setAddToClusterState({ open: false, filePaths: [] })}
              folderId={folderId}
              onSelect={async (cluster) => {
                try {
                  const res = await window.electronAPI?.addGamesToCluster?.(
                    cluster.id,
                    addToClusterState.filePaths
                  );
                  if (!res?.success) {
                    console.error('[FolderWindow] 加入到簇失敗:', res?.error || res);
                  } else {
                    if (folderId) {
                      try {
                        await window.electronAPI?.addClusterToFolder?.(cluster.id, folderId);
                      } catch (_) {}
                      // 只有在成功加入簇後，才從資料夾移除這批遊戲
                      try {
                        await window.electronAPI?.batchRemoveGamesFromFolder?.(
                          addToClusterState.filePaths,
                          folderId
                        );
                      } catch (_) {}
                    }
                    // 本地差分：移除已加入簇的遊戲，並嘗試更新/插入該簇
                    const fileSet = new Set((addToClusterState.filePaths || []).map(String));
                    startTransition(() => {
                      setFolderGames((prev) =>
                        Array.isArray(prev)
                          ? prev.filter((g) => !fileSet.has(String(g?.filePath)))
                          : prev
                      );
                    });
                    // 嘗試抓取簇資料並更新 clusters（若尚未存在則插入）
                    try {
                      const created = await window.electronAPI?.getCluster?.(cluster.id);
                      if (created && created.id != null) {
                        startTransition(() => {
                          setClusters((prev) => {
                            if (!Array.isArray(prev)) return [created];
                            const idStr = String(created.id);
                            const exists = prev.some((c) => String(c?.id) === idStr);
                            return exists
                              ? prev.map((c) =>
                                  String(c?.id) === idStr ? { ...c, ...created } : c
                                )
                              : [...prev, created];
                          });
                        });
                      }
                    } catch (_) {}
                  }
                } catch (e) {
                  console.error('[FolderWindow] 加入到簇調用異常:', e);
                } finally {
                  setAddToClusterState({ open: false, filePaths: [] });
                }
              }}
            />
            <ClusterSelectDialog
              isOpen={mergeState.open}
              onClose={() => setMergeState({ open: false, from: null })}
              folderId={folderId}
              excludeIds={mergeState.from ? [mergeState.from.id] : []}
              onSelect={async (toCluster) => {
                try {
                  const res = await window.electronAPI?.mergeClusters?.(
                    mergeState.from.id,
                    toCluster.id
                  );
                  if (!res?.success) {
                    console.error('[FolderWindow] 合併簇失敗:', res?.error || res);
                  }
                  // 本地差分：移除來源簇，保留目標簇
                  startTransition(() => {
                    const fromId = String(mergeState.from?.id);
                    const keepId = String(toCluster.id);
                    setClusters((prev) =>
                      Array.isArray(prev)
                        ? prev.filter((c) => {
                            const cid = String(c?.id);
                            if (cid === keepId) return true;
                            return cid !== fromId;
                          })
                        : prev
                    );
                  });
                  // 嘗試刷新目標簇詳情
                  try {
                    const updated = await window.electronAPI?.getCluster?.(toCluster.id);
                    if (updated && updated.id != null) {
                      startTransition(() => {
                        setClusters((prev) =>
                          Array.isArray(prev)
                            ? prev.map((c) =>
                                String(c?.id) === String(updated.id) ? { ...c, ...updated } : c
                              )
                            : [updated]
                        );
                      });
                    }
                  } catch (_) {}
                } catch (e) {
                  console.error('[FolderWindow] 合併簇調用異常:', e);
                } finally {
                  setMergeState({ open: false, from: null });
                }
              }}
            />
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
        zIndex={11002}
        onSavedAndLaunch={async (game) => {
          try {
            await window.electronAPI?.launchGame?.(game.filePath);
          } catch (e) {
            console.error('啟動遊戲失敗:', e);
          }
        }}
      />
      <RenameDialog
        isOpen={renameState.open}
        title="重命名簇"
        label="簇名稱"
        defaultValue={renameState.cluster?.name || ''}
        onClose={() => setRenameState({ open: false, cluster: null })}
        onConfirm={async (newName) => {
          try {
            if (!renameState.cluster?.id) return;
            const res = await window.electronAPI?.updateCluster?.({
              id: renameState.cluster.id,
              name: newName,
            });
            if (!res?.success) {
              console.warn('[FolderWindow] 重命名簇失敗:', res?.error || res);
            } else {
              // 本地差分：更新 clusters 中的名稱
              startTransition(() => {
                const idStr = String(renameState.cluster.id);
                setClusters((prev) =>
                  Array.isArray(prev)
                    ? prev.map((c) => (String(c?.id) === idStr ? { ...c, name: newName } : c))
                    : prev
                );
              });
            }
          } catch (e) {
            console.error('[FolderWindow] 重命名簇異常:', e);
          } finally {
            setRenameState({ open: false, cluster: null });
          }
        }}
      />
      {/* 簇詳情對話框（Folder 窗口） */}
      {clusterDialog.isOpen && (
        <ClusterDialog
          isOpen={clusterDialog.isOpen}
          clusterId={clusterDialog.clusterId}
          onClose={() => setClusterDialog({ isOpen: false, clusterId: null })}
        />
      )}
      {/* 左下角通知氣泡（在資料夾視窗也顯示） */}
      <NotificationBubble />
    </div>
  );
};

export default FolderWindowApp;
