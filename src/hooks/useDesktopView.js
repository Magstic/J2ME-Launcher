import React, { useState, useCallback, useEffect, useRef } from 'react';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
import useCreateShortcut from '@shared/hooks/useCreateShortcut';
import { useSelectedGames } from '@hooks/useGameStore';
import { ClusterSelectDialog, RenameDialog } from '@ui';
import { useTranslation } from '@hooks/useTranslation';

/**
 * 桌面視圖邏輯
 * 管理拖拽、資料夾徽章、右鍵選單等桌面特定功能
 */
export const useDesktopView = ({ games, onGameSelect, onAddToFolder, onRefresh, onGameInfo }) => {
  const { t } = useTranslation();
  const [externalDragActive, setExternalDragActive] = useState(false);
  const rootRef = useRef(null);
  // 加入既有簇對話框狀態
  const [addToClusterState, setAddToClusterState] = useState({ open: false, filePaths: [] });
  // 合併簇對話框狀態
  const [mergeState, setMergeState] = useState({ open: false, from: null });
  // 重命名簇對話框狀態
  const [renameState, setRenameState] = useState({ open: false, cluster: null });

  // 拖拽狀態管理
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedItem: null,
    draggedType: null,
    dropTarget: null,
  });

  // 資料夾徽章狀態
  const [memberSet, setMemberSet] = useState(() => new Set());
  // 抑制徽章刷新（在拖放後短暫時間內避免大量同步查詢）
  const suppressBadgeUntilRef = useRef(0);
  const pendingBadgeTimerRef = useRef(0);

  // 即時（樂觀）隱藏集合：在拖放加入資料夾後，先行把桌面上的該遊戲隱藏，避免等待重載
  const [optimisticHideSet, setOptimisticHideSet] = useState(() => new Set());
  const pruneTimerRef = useRef(null);
  const lastUserInputRef = useRef(0);
  const pendingMemberOpsRef = useRef(null); // { add:Set, remove:Set }
  const memberOpsTimerRef = useRef(null);

  // 向子卡片傳遞的拖拽結束信號（數值累加即可）
  const [dragEndSignal, setDragEndSignal] = useState(0);

  // 記錄最近使用者輸入（滑輪/觸控/鍵盤翻頁），避免在互動中執行昂貴重算
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

  // 刷新資料夾徽章（先定義）
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

  // 以 ref 保存最新的 refreshMemberSet，避免依賴陣列對 TDZ 的影響
  const refreshMemberSetRef = useRef(refreshMemberSet);
  useEffect(() => {
    refreshMemberSetRef.current = refreshMemberSet;
  }, [refreshMemberSet]);

  // 監聽資料夾結構變更（例如刪除資料夾）以刷新徽章 memberSet
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onFolderChanged) return;
    const off = api.onFolderChanged(() => {
      try {
        const now = Date.now();
        const until = Number(suppressBadgeUntilRef.current || 0);
        const needDelay = now < until;
        if (needDelay) {
          if (pendingBadgeTimerRef.current) clearTimeout(pendingBadgeTimerRef.current);
          pendingBadgeTimerRef.current = setTimeout(
            () => {
              try {
                refreshMemberSetRef.current && refreshMemberSetRef.current();
              } finally {
                pendingBadgeTimerRef.current = 0;
              }
            },
            Math.max(250, until - now)
          );
        } else {
          refreshMemberSetRef.current && refreshMemberSetRef.current();
        }
      } catch (_) {
        try {
          refreshMemberSetRef.current && refreshMemberSetRef.current();
        } catch (_) {}
      }
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, []);

  // 合併與延後套用徽章 memberSet 變更，避免一次性更新大量 item 造成重繪卡頓
  const enqueueMemberSetUpdate = useCallback((op, filePaths) => {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return;
    const fps = new Set(filePaths.map(String));
    if (!pendingMemberOpsRef.current)
      pendingMemberOpsRef.current = { add: new Set(), remove: new Set() };
    const bag = pendingMemberOpsRef.current;
    if (op === 'add') {
      for (const fp of fps) {
        bag.add.add(fp);
        bag.remove.delete(fp);
      }
    } else if (op === 'remove') {
      for (const fp of fps) {
        bag.remove.add(fp);
        bag.add.delete(fp);
      }
    }
    const flush = () => {
      const run = () => {
        const now = Date.now();
        const recent = now - (lastUserInputRef.current || 0) < 1000;
        if (recent) {
          memberOpsTimerRef.current = setTimeout(run, 300);
          return;
        }
        const ops = pendingMemberOpsRef.current;
        pendingMemberOpsRef.current = null;
        memberOpsTimerRef.current = null;
        if (!ops) return;
        const addSet = ops.add;
        const rmSet = ops.remove;
        try {
          React.startTransition?.(() => {
            setMemberSet((prev) => {
              const next = new Set(prev || []);
              if (addSet && addSet.size) {
                for (const fp of addSet) next.add(fp);
              }
              if (rmSet && rmSet.size) {
                for (const fp of rmSet) next.delete(fp);
              }
              return next;
            });
          });
        } catch (_) {}
      };
      try {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(run);
        } else {
          memberOpsTimerRef.current = setTimeout(run, 400);
        }
      } catch (_) {
        memberOpsTimerRef.current = setTimeout(run, 400);
      }
    };
    if (memberOpsTimerRef.current) return; // 已排程
    flush();
  }, []);

  // 僅在使用者空閒時修剪樂觀隱藏集合，避免在滾動中引發大量重算
  const scheduleIdlePrune = useCallback((filePathsToPrune) => {
    const run = () => {
      const now = Date.now();
      const recent = now - (lastUserInputRef.current || 0) < 300; // 300ms 內有互動則延後
      if (recent) {
        pruneTimerRef.current = setTimeout(run, 250);
        return;
      }
      try {
        // 僅在需要時修剪（例如：已不再出現在桌面 items 中時）
        // 保守策略：先嘗試移除這批，若仍在桌面資料中，也不會出現因為 items 已變更而回彈的問題
        React.startTransition?.(() => {
          setOptimisticHideSet((prev) => {
            if (!prev || prev.size === 0) return prev;
            const next = new Set(prev);
            for (const fp of filePathsToPrune || []) next.delete(String(fp));
            return next;
          });
        });
      } finally {
        pruneTimerRef.current = null;
      }
    };
    if (pruneTimerRef.current) clearTimeout(pruneTimerRef.current);
    // 使用 requestIdleCallback 優先在空閒期運行，否則退回 setTimeout
    try {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(run, { timeout: 1000 });
      } else {
        pruneTimerRef.current = setTimeout(run, 600);
      }
    } catch (_) {
      pruneTimerRef.current = setTimeout(run, 600);
    }
  }, []);

  // 監聽主進程通知：桌面移除（desktop:remove-items）與增量更新（drag-drop-completed），建立暫時隱藏集合
  useEffect(() => {
    const api = window.electronAPI;
    const addToHide = (filePaths) => {
      try {
        const list = Array.isArray(filePaths) ? filePaths.map(String) : [];
        if (list.length === 0) return;
        React.startTransition?.(() => {
          setOptimisticHideSet((prev) => new Set([...prev, ...list]));
        });
        // 關鍵：一旦收到樂觀移除事件，立即退出拖拽狀態，避免等待原生 dragend
        setDragState((prev) =>
          prev && prev.isDragging
            ? { isDragging: false, draggedItem: null, draggedType: null, dropTarget: null }
            : prev
        );
        // 併發廣播給子卡片（重置本地 dragging 樣式）
        setDragEndSignal((s) => s + 1);
        try {
          setExternalDragActive(false);
        } catch (_) {}
        // 在較長的短暫窗口內抑制徽章刷新（避免剛放下後的快速滾動被阻塞）
        try {
          suppressBadgeUntilRef.current = Date.now() + 1400;
        } catch (_) {}
        // 嘗試在空閒時修剪（當前批次）
        scheduleIdlePrune(list);
      } catch (_) {}
    };
    const offA = api?.onDesktopRemoveItems
      ? api.onDesktopRemoveItems((payload) => addToHide(payload?.filePaths))
      : null;
    const offB = api?.onGamesIncrementalUpdate
      ? api.onGamesIncrementalUpdate((u) => {
          if (u && u.action === 'drag-drop-completed' && Array.isArray(u.affectedGames)) {
            addToHide(u.affectedGames);
            // 輕量維護徽章 memberSet：延後到空閒時合併更新
            try {
              const fps = Array.from(new Set(u.affectedGames.map(String)));
              const hasSource = !!u.sourceFolder;
              const hasTarget = !!u.targetFolder;
              if (!hasSource && hasTarget) enqueueMemberSetUpdate('add', fps);
              else if (hasSource && !hasTarget) enqueueMemberSetUpdate('remove', fps);
              else if (hasSource && hasTarget) enqueueMemberSetUpdate('add', fps);
            } catch (_) {}
          }
        })
      : null;
    return () => {
      try {
        offA && offA();
      } catch (_) {}
      try {
        offB && offB();
      } catch (_) {}
    };
  }, []);

  // 徽章初始化：僅初始化抓一次，其後完全依賴增量事件維護，避免大量查詢造成卡頓
  useEffect(() => {
    refreshMemberSet();
    return () => {
      if (pendingBadgeTimerRef.current) clearTimeout(pendingBadgeTimerRef.current);
    };
  }, [refreshMemberSet]);

  // 監聽跨窗口拖拽會話開始/結束
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDragSessionStarted || !api?.onDragSessionEnded) return;
    const offStart = api.onDragSessionStarted(() => setExternalDragActive(true));
    const offEnd = api.onDragSessionEnded(() => {
      setExternalDragActive(false);
      // 關鍵：收到結束事件時，直接退出拖拽狀態（不等待 GameCard 的 onDragEnd）
      setDragState((prev) =>
        prev && prev.isDragging
          ? { isDragging: false, draggedItem: null, draggedType: null, dropTarget: null }
          : prev
      );
      // 通知子卡片重置 dragging 樣式
      setDragEndSignal((s) => s + 1);
    });
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
      dropTarget: null,
    });
  }, []);

  // 處理拖拽結束
  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedItem: null,
      draggedType: null,
      dropTarget: null,
    });
  }, []);

  const handleRootDragOver = useCallback(
    (e) => {
      if (externalDragActive) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.dataTransfer.effectAllowed = 'move';
      }
    },
    [externalDragActive]
  );

  const handleRootDrop = useCallback(
    (e) => {
      if (!externalDragActive) return;
      e.preventDefault();
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
        window.electronAPI?.dropDragSession?.({ type: 'desktop', internal: internalHint });
      } catch (err) {
        console.warn(err);
      }
      try {
        window.electronAPI?.endDragSession?.();
      } catch (e2) {}
    },
    [externalDragActive]
  );

  // 將 hasFolder 作為額外屬性傳入 GameCard
  const gameCardExtraProps = useCallback(
    (game) => ({
      hasFolder: !!(game && memberSet.has(game.filePath)),
      dragEndSignal,
    }),
    [memberSet, dragEndSignal]
  );

  // 捷徑創建邏輯（使用共享 hook，統一事件派發與錯誤處理）
  const [selectedGames, setSelectedGames] = useSelectedGames();
  const handleCreateShortcut = useCreateShortcut(
    games,
    selectedGames,
    setSelectedGames,
    'DesktopView'
  );

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
    onCreateCluster: async (target) => {
      try {
        const list =
          Array.isArray(target?.selectedFilePaths) && target.selectedFilePaths.length > 0
            ? target.selectedFilePaths
            : target?.filePath
              ? [target.filePath]
              : [];
        if (!list || list.length === 0) return;
        const res = await window.electronAPI?.createCluster?.({ filePaths: list });
        if (!res?.success) {
          console.error('[DesktopView] 建立簇失敗:', res?.error || res);
        }
        // cluster:changed 事件會自動刷新桌面清單
      } catch (e) {
        console.error('[DesktopView] 建立簇調用異常:', e);
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
    onMergeCluster: (cluster) => {
      if (!cluster?.id) return;
      setMergeState({ open: true, from: cluster });
    },
    // Cluster callbacks (desktop)
    onClusterInfo: (cluster) => {
      try {
        console.log('[Cluster] info requested:', cluster);
      } catch (_) {}
      try {
        window.dispatchEvent(new CustomEvent('open-cluster-dialog', { detail: cluster?.id }));
      } catch (_) {}
    },
    onRenameCluster: (cluster) => {
      if (!cluster?.id) return;
      setRenameState({ open: true, cluster });
    },
    onDeleteCluster: async (cluster) => {
      try {
        await window.electronAPI?.deleteCluster?.(cluster.id);
      } catch (e) {
        console.error('刪除簇失敗:', e);
      }
    },
    onConsolidateClusters: async (payload) => {
      try {
        const ids = Array.isArray(payload?.selectedClusterIds)
          ? payload.selectedClusterIds.filter(Boolean)
          : [];
        if (ids.length < 2) return;
        const toId = ids[0];
        // 隨機挑選一個簇，採用其名稱與圖標（主成員）
        const chosenId = ids[Math.floor(Math.random() * ids.length)];
        let chosen = null;
        try {
          chosen = await window.electronAPI?.getCluster?.(chosenId);
        } catch (_) {}
        // 逐一合併其餘簇到 toId
        for (let i = 1; i < ids.length; i++) {
          const fromId = ids[i];
          if (!fromId || fromId === toId) continue;
          try {
            const res = await window.electronAPI?.mergeClusters?.(fromId, toId);
            if (!res?.success) {
              console.warn('[DesktopView] 合併簇失敗:', res?.error || res);
            }
          } catch (e) {
            console.error('[DesktopView] 合併簇調用異常:', e);
          }
        }
        // 合併完成後，採用隨機簇的名稱與圖標（若可用）
        if (chosen && toId) {
          const update = { id: toId };
          if (typeof chosen.name === 'string') update.name = chosen.name;
          if (chosen.icon !== undefined) update.icon = chosen.icon;
          if (chosen.primaryFilePath) update.primaryFilePath = chosen.primaryFilePath;
          try {
            const res2 = await window.electronAPI?.updateCluster?.(update);
            if (!res2?.success) {
              console.warn('[DesktopView] 更新合併後簇屬性失敗:', res2?.error || res2);
            }
          } catch (e) {
            console.error('[DesktopView] 更新合併後簇屬性異常:', e);
          }
        }
        // 嘗試刷新視圖
        try {
          onRefresh && onRefresh();
        } catch (_) {}
        // 重設簇選中：僅保留合併後的目標簇
        try {
          window.dispatchEvent(
            new CustomEvent('clusters-selection-reset', { detail: { ids: [toId] } })
          );
        } catch (_) {}
      } catch (err) {
        console.error('[DesktopView] 合簇流程錯誤:', err);
      } finally {
        try {
          closeMenu && closeMenu();
        } catch (_) {}
      }
    },
    // 將簇加入資料夾（右鍵菜單：cluster-add-to-folder）— 走統一『加入資料夾』流程，支援簇/遊戲混合多選
    onAddClusterToFolder: (cluster) => {
      if (!cluster) return;
      const payload = {
        ...cluster,
        type: 'cluster',
        // 確保至少包含當前簇 id
        selectedClusterIds:
          Array.isArray(cluster.selectedClusterIds) && cluster.selectedClusterIds.length > 0
            ? Array.from(new Set(cluster.selectedClusterIds.map(String)))
            : cluster.id != null
              ? [String(cluster.id)]
              : [],
        // 附帶目前已選中的遊戲 filePath（若有）
        selectedFilePaths: Array.isArray(cluster.selectedFilePaths)
          ? Array.from(new Set(cluster.selectedFilePaths))
          : [],
      };
      try {
        onAddToFolder && onAddToFolder(payload);
      } catch (e) {
        console.error(e);
      }
    },
  });

  return {
    // State
    externalDragActive,
    rootRef,
    dragState,
    memberSet,
    optimisticHideSet,
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
    closeMenu,
    ClusterSelectElement: React.createElement(ClusterSelectDialog, {
      isOpen: addToClusterState.open,
      onClose: () => setAddToClusterState({ open: false, filePaths: [] }),
      onSelect: async (cluster) => {
        try {
          const res = await window.electronAPI?.addGamesToCluster?.(
            cluster.id,
            addToClusterState.filePaths
          );
          if (!res?.success) {
            console.error('[DesktopView] 加入到簇失敗:', res?.error || res);
          }
        } catch (e) {
          console.error('[DesktopView] 加入到簇調用異常:', e);
        } finally {
          setAddToClusterState({ open: false, filePaths: [] });
        }
      },
    }),
    ClusterMergeElement: React.createElement(ClusterSelectDialog, {
      isOpen: mergeState.open,
      onClose: () => setMergeState({ open: false, from: null }),
      excludeIds: mergeState.from ? [mergeState.from.id] : [],
      onSelect: async (toCluster) => {
        try {
          const res = await window.electronAPI?.mergeClusters?.(mergeState.from.id, toCluster.id);
          if (!res?.success) {
            console.error('[DesktopView] 合併簇失敗:', res?.error || res);
          }
        } catch (e) {
          console.error('[DesktopView] 合併簇調用異常:', e);
        } finally {
          setMergeState({ open: false, from: null });
        }
      },
    }),
    ClusterRenameElement: React.createElement(RenameDialog, {
      isOpen: renameState.open,
      defaultValue: renameState.cluster?.name || '',
      onClose: () => setRenameState({ open: false, cluster: null }),
      onConfirm: async (newName) => {
        try {
          if (!renameState.cluster?.id) return;
          const res = await window.electronAPI?.updateCluster?.({
            id: renameState.cluster.id,
            name: newName,
          });
          if (!res?.success) {
            console.warn('[DesktopView] 重命名簇失敗:', res?.error || res);
          }
        } catch (e) {
          console.error('[DesktopView] 重命名簇異常:', e);
        } finally {
          setRenameState({ open: false, cluster: null });
        }
      },
    }),
  };
};
