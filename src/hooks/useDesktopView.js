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
export const useDesktopView = ({ 
  games, 
  onGameSelect, 
  onAddToFolder, 
  onRefresh,
  onGameInfo 
}) => {
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
    try {
      let types = [];
      let filesLen = 0;
      try { types = Array.from((e.dataTransfer && e.dataTransfer.types) ? e.dataTransfer.types : []); filesLen = e.dataTransfer?.files ? e.dataTransfer.files.length : 0; } catch {}
      const hasInternalMIME = types.includes('application/x-j2me-internal') || types.includes('application/x-j2me-filepath');
      const internalHint = !!(hasInternalMIME || (types.length === 0 && filesLen === 0));
      window.electronAPI?.dropDragSession?.({ type: 'desktop', internal: internalHint });
    } catch (err) { console.warn(err); }
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
    onCreateCluster: async (target) => {
      try {
        const list = (Array.isArray(target?.selectedFilePaths) && target.selectedFilePaths.length > 0)
          ? target.selectedFilePaths
          : (target?.filePath ? [target.filePath] : []);
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
      const list = (Array.isArray(target?.selectedFilePaths) && target.selectedFilePaths.length > 0)
        ? target.selectedFilePaths
        : (target?.filePath ? [target.filePath] : []);
      if (!list || list.length === 0) return;
      setAddToClusterState({ open: true, filePaths: list });
    },
    onMergeCluster: (cluster) => {
      if (!cluster?.id) return;
      setMergeState({ open: true, from: cluster });
    },
    // Cluster callbacks (desktop)
    onClusterInfo: (cluster) => {
      try { console.log('[Cluster] info requested:', cluster); } catch (_) {}
      try { window.dispatchEvent(new CustomEvent('open-cluster-dialog', { detail: cluster?.id })); } catch (_) {}
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
        const ids = Array.isArray(payload?.selectedClusterIds) ? payload.selectedClusterIds.filter(Boolean) : [];
        if (ids.length < 2) return;
        const toId = ids[0];
        // 隨機挑選一個簇，採用其名稱與圖標（主成員）
        const chosenId = ids[Math.floor(Math.random() * ids.length)];
        let chosen = null;
        try { chosen = await window.electronAPI?.getCluster?.(chosenId); } catch (_) {}
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
        try { onRefresh && onRefresh(); } catch (_) {}
        // 重設簇選中：僅保留合併後的目標簇
        try { window.dispatchEvent(new CustomEvent('clusters-selection-reset', { detail: { ids: [toId] } })); } catch (_) {}
      } catch (err) {
        console.error('[DesktopView] 合簇流程錯誤:', err);
      } finally {
        try { closeMenu && closeMenu(); } catch (_) {}
      }
    },
    // 將簇加入資料夾（右鍵菜單：cluster-add-to-folder）— 走統一『加入資料夾』流程，支援簇/遊戲混合多選
    onAddClusterToFolder: (cluster) => {
      if (!cluster) return;
      const payload = {
        ...cluster,
        type: 'cluster',
        // 確保至少包含當前簇 id
        selectedClusterIds: Array.isArray(cluster.selectedClusterIds) && cluster.selectedClusterIds.length > 0
          ? Array.from(new Set(cluster.selectedClusterIds.map(String)))
          : (cluster.id != null ? [String(cluster.id)] : []),
        // 附帶目前已選中的遊戲 filePath（若有）
        selectedFilePaths: Array.isArray(cluster.selectedFilePaths) ? Array.from(new Set(cluster.selectedFilePaths)) : []
      };
      try { onAddToFolder && onAddToFolder(payload); } catch (e) { console.error(e); }
    },
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
    closeMenu,
    ClusterSelectElement: (
      React.createElement(ClusterSelectDialog, {
        isOpen: addToClusterState.open,
        onClose: () => setAddToClusterState({ open: false, filePaths: [] }),
        onSelect: async (cluster) => {
          try {
            const res = await window.electronAPI?.addGamesToCluster?.(cluster.id, addToClusterState.filePaths);
            if (!res?.success) {
              console.error('[DesktopView] 加入到簇失敗:', res?.error || res);
            }
          } catch (e) {
            console.error('[DesktopView] 加入到簇調用異常:', e);
          } finally {
            setAddToClusterState({ open: false, filePaths: [] });
          }
        }
      })
    ),
    ClusterMergeElement: (
      React.createElement(ClusterSelectDialog, {
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
        }
      })
    ),
    ClusterRenameElement: (
      React.createElement(RenameDialog, {
        isOpen: renameState.open,
        defaultValue: renameState.cluster?.name || '',
        onClose: () => setRenameState({ open: false, cluster: null }),
        onConfirm: async (newName) => {
          try {
            if (!renameState.cluster?.id) return;
            const res = await window.electronAPI?.updateCluster?.({ id: renameState.cluster.id, name: newName });
            if (!res?.success) {
              console.warn('[DesktopView] 重命名簇失敗:', res?.error || res);
            }
          } catch (e) {
            console.error('[DesktopView] 重命名簇異常:', e);
          } finally {
            setRenameState({ open: false, cluster: null });
          }
        }
      })
    )
  };
};
