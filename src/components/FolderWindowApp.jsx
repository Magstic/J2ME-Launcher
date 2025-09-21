import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameLaunchDialog } from '@components';
import GameInfoDialog from './Desktop/GameInfoDialog';
import VirtualizedUnifiedGrid from '@shared/VirtualizedUnifiedGrid';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
import useCreateShortcut from '@shared/hooks/useCreateShortcut';
import {
  useGamesByFolder,
  useSelectedGames,
  useDragState,
  useGameActions,
} from '@hooks/useGameStore';
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
  const [gameLaunchDialog, setGameLaunchDialog] = useState({
    isOpen: false,
    game: null,
    configureOnly: false,
  });
  const [externalDragActive, setExternalDragActive] = useState(false);
  const [clusters, setClusters] = useState([]);
  const [addToClusterState, setAddToClusterState] = useState({ open: false, filePaths: [] });
  const [mergeState, setMergeState] = useState({ open: false, from: null });
  const [clusterDialog, setClusterDialog] = useState({ isOpen: false, clusterId: null });
  const [renameState, setRenameState] = useState({ open: false, cluster: null });

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
        await loadFolderContents();
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
          try {
            await window.electronAPI?.addClusterToFolder?.(res.clusterId, folderId);
          } catch (_) {}
          // 僅移除“實際被納入新簇”的成員，避免誤移除未加入者
          try {
            const memRes = await window.electronAPI?.getClusterMembers?.(res.clusterId);
            const members = Array.isArray(memRes?.members) ? memRes.members : [];
            const memberPaths = members.map((m) => m.filePath);
            const removePaths = memberPaths.filter((fp) => list.includes(fp));
            if (removePaths.length > 0) {
              await window.electronAPI?.batchRemoveGamesFromFolder?.(removePaths, folderId);
            }
          } catch (_) {}
          // 重新載入當前資料夾，確保簇出現在列表且其成員隱藏
          await loadFolderContents();
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

        await loadFolderContents();
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
        await window.electronAPI?.deleteCluster?.(cluster.id);
        await loadFolderContents();
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

        await loadFolderContents();
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
      // Load games and clusters
      const games = result.games || [];
      const cs = Array.isArray(result.clusters) ? result.clusters : [];
      setClusters(cs.map((c) => ({ ...c, type: 'cluster' })));
      gameActions.loadGames(games);

      // Sync folder membership for all games in this folder
      if (games.length > 0) {
        const filePaths = games.map((game) => game.filePath);
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

  // 監聽簇事件以刷新當前資料夾內容
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const off1 = api.onClusterChanged
      ? api.onClusterChanged(() => {
          try {
            loadFolderContents();
          } catch (_) {}
        })
      : null;
    const off2 = api.onClusterDeleted
      ? api.onClusterDeleted(() => {
          try {
            loadFolderContents();
          } catch (_) {}
        })
      : null;
    return () => {
      try {
        off1 && off1();
      } catch (_) {}
      try {
        off2 && off2();
      } catch (_) {}
    };
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
          <span className="game-count">({folder?.gameCount ?? games.length})</span>
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
        {games.length === 0 && clusters.length === 0 ? (
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
              games={games}
              items={[...clusters, ...games.map((g) => ({ ...g, type: 'game' }))]}
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
                    await loadFolderContents();
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
                  await loadFolderContents();
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
            }
            await loadFolderContents();
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
