import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameLaunchDialog } from '@components';
import useFlipAnimation from '@shared/hooks/useFlipAnimation';
import GameInfoDialog from './Desktop/GameInfoDialog';
import FolderGridUnified from './FolderGrid.Unified';
// 先載入全域設計代幣，保證元件樣式可引用
import '../styles/theme.css';
import './FolderWindowApp.css';
import './Desktop/Desktop.css';
// 導入與主視圖一致的全域樣式，確保彈窗（尤其是模擬器配置）在資料夾視窗與桌面視圖風格一致
import '../styles/utility.css';
import '../styles/dialog.css';
import '../styles/buttons.css';
import '../styles/focus-ring.css';

// 已切換至統一網格（UnifiedGrid）

const FolderWindowApp = () => {
  const [folder, setFolder] = useState(null);
  const [games, setGames] = useState([]);
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
  const [isDragging, setIsDragging] = useState(false);
  const gridRef = useRef(null);

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
  const [selected, setSelected] = useState(() => new Set());
  const selectedRef = useRef(new Set());
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const [boxSelecting, setBoxSelecting] = useState(false);
  const [selectionFading, setSelectionFading] = useState(false);
  const isSelectingRef = useRef(false);
  const rafIdRef = useRef(0);
  const pendingPosRef = useRef(null);
  const leftWindowRef = useRef(false);
  const fadeTimerRef = useRef(0);
  // 透過引用保持未變更項目的物件身份，避免整體重繪
  const gamesByIdRef = useRef(new Map());
  const shallowEqualGame = (a, b) => {
    return a && b &&
      a.filePath === b.filePath &&
      a.gameName === b.gameName &&
      a.vendor === b.vendor &&
      a.version === b.version &&
      a.iconUrl === b.iconUrl;
  };
  const reconcileGames = (incoming) => {
    const prevMap = gamesByIdRef.current;
    const nextArr = (incoming || []).map(g => {
      const old = prevMap.get(g.filePath);
      return old && shallowEqualGame(old, g) ? old : g;
    });
    const nextMap = new Map();
    nextArr.forEach(g => nextMap.set(g.filePath, g));
    gamesByIdRef.current = nextMap;
    setGames(nextArr);
  };
  // FLIP：只對移位的卡片做動畫
  const flipKeys = React.useMemo(() => games.map(g => `game:${g.filePath}`), [games]);
  useFlipAnimation(gridRef, flipKeys, {
    disabled: boxSelecting || isDragging,
    duration: 180, // 與卡片過渡時長保持一致
    easing: 'ease-out'
  });
  const startPointRef = useRef({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState(null);
  const [gameInfoDialog, setGameInfoDialog] = useState({ isOpen: false, game: null });
  // 右鍵菜單由 FolderGridUnified 內部的 useUnifiedContextMenu 統一管理

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

  // 右鍵菜單統一由 FolderGridUnified 內部處理（useUnifiedContextMenu）

  // 單擊/多選（Ctrl/Cmd）
  const handleCardMouseDown = useCallback((e, game) => {
    e.stopPropagation();
    if (e.button === 2) return; // 右鍵忽略
    setBoxSelecting(false);
    const isSelected = selectedRef.current.has(game.filePath);
    if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(game.filePath)) next.delete(game.filePath); else next.add(game.filePath);
        return next;
      });
    } else {
      // 若點擊的是已選中項且已有多選，保持當前多選不變
      if (isSelected && selectedRef.current.size > 1) {
        return;
      }
      setSelected(new Set([game.filePath]));
    }
  }, []);

  // 計算並更新選框與選中集合（含視窗邊界夾取）
  const computeSelection = useCallback((pos) => {
    const w = window.innerWidth; const h = window.innerHeight;
    const x2 = Math.max(0, Math.min(w - 1, pos.x));
    const y2 = Math.max(0, Math.min(h - 1, pos.y));
    const x1 = startPointRef.current.x;
    const y1 = startPointRef.current.y;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const rect = new DOMRect(left, top, width, height);
    setSelectionRect({ left, top, width, height });
    // 命中測試：資料夾視圖中所有 .game-card
    const cards = gridRef.current?.querySelectorAll?.('.game-card');
    const next = new Set();
    if (cards) {
      cards.forEach((el) => {
        const r = el.getBoundingClientRect();
        const overlap = !(rect.right < r.left || rect.left > r.right || rect.bottom < r.top || rect.top > r.bottom);
        if (overlap) {
          const fp = el.getAttribute('data-filepath');
          if (fp) next.add(fp);
        }
      });
    }
    setSelected(next);
  }, []);

  const endSelection = useCallback((opts = { fadeToEdge: false }) => {
    isSelectingRef.current = false;
    setBoxSelecting(false);
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = 0; }
    if (opts.fadeToEdge && selectionRect) {
      // 將目前矩形夾到邊緣後觸發淡出
      const w = window.innerWidth; const h = window.innerHeight;
      const clamped = {
        left: Math.max(0, Math.min(selectionRect.left, w - selectionRect.width)),
        top: Math.max(0, Math.min(selectionRect.top, h - selectionRect.height)),
        width: Math.min(selectionRect.width, w),
        height: Math.min(selectionRect.height, h)
      };
      setSelectionRect(clamped);
      setSelectionFading(true);
      fadeTimerRef.current = window.setTimeout(() => {
        setSelectionRect(null);
        setSelectionFading(false);
        fadeTimerRef.current = 0;
      }, 180);
    } else {
      setSelectionRect(null);
      setSelectionFading(false);
    }
    if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; }
    window.removeEventListener('mousemove', onGlobalMouseMove);
    window.removeEventListener('mouseup', onGlobalMouseUp);
    window.removeEventListener('mouseleave', onWindowLeft);
    window.removeEventListener('pointerleave', onWindowLeft);
    window.removeEventListener('pointerup', onGlobalMouseUp);
    window.removeEventListener('pointercancel', onGlobalCancel);
    window.removeEventListener('mouseenter', onWindowReenter, true);
    window.removeEventListener('blur', onWindowLeft);
    document.removeEventListener('mouseout', onDocumentMouseOut, true);
    document.removeEventListener('visibilitychange', onVisibilityChange, true);
  }, [selectionRect]);

  const onGlobalMouseMove = useCallback((e) => {
    if (!isSelectingRef.current) return;
    const w = window.innerWidth; const h = window.innerHeight;
    if (e.clientX < 0 || e.clientY < 0 || e.clientX >= w || e.clientY >= h) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
      return;
    }
    if (e.buttons === 0) { endSelection(); return; }
    pendingPosRef.current = { x: e.clientX, y: e.clientY };
    if (!rafIdRef.current) {
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = 0;
        if (pendingPosRef.current) computeSelection(pendingPosRef.current);
      });
    }
  }, [computeSelection, endSelection]);

  const onGlobalMouseUp = useCallback(() => {
    if (!isSelectingRef.current) return;
    endSelection();
  }, [endSelection]);

  const onWindowLeft = useCallback(() => {
    if (!isSelectingRef.current) return;
    leftWindowRef.current = true;
    endSelection({ fadeToEdge: true });
  }, [endSelection]);

  const onWindowReenter = useCallback(() => {
    if (!leftWindowRef.current) return;
    endSelection();
  }, [endSelection]);

  const onGlobalCancel = useCallback(() => {
    if (!isSelectingRef.current) return;
    endSelection();
  }, [endSelection]);

  const onDocumentMouseOut = useCallback((e) => {
    if (!isSelectingRef.current) return;
    if (!e.relatedTarget) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
    }
  }, [endSelection]);

  const onVisibilityChange = useCallback(() => {
    if (document.hidden && isSelectingRef.current) {
      leftWindowRef.current = true;
      endSelection({ fadeToEdge: true });
    }
  }, [endSelection]);

  // 橡皮筋框選：在空白區域按下啟動（使用全域監聽與 rAF 節流）
  const onGridMouseDown = useCallback((e) => {
    if (e.target.closest && e.target.closest('.game-card')) return;
    if (e.button !== 0) return;
    setSelected(new Set());
    setBoxSelecting(true);
    setSelectionFading(false);
    leftWindowRef.current = false;
    isSelectingRef.current = true;
    startPointRef.current = { x: e.clientX, y: e.clientY };
    setSelectionRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
    window.addEventListener('mousemove', onGlobalMouseMove, { passive: true });
    window.addEventListener('mouseup', onGlobalMouseUp, { passive: true });
    window.addEventListener('mouseleave', onWindowLeft, { passive: true });
    window.addEventListener('pointerleave', onWindowLeft, { passive: true });
    window.addEventListener('pointerup', onGlobalMouseUp, { passive: true });
    window.addEventListener('pointercancel', onGlobalCancel, { passive: true });
    window.addEventListener('mouseenter', onWindowReenter, true);
    window.addEventListener('blur', onWindowLeft, { passive: true });
    document.addEventListener('mouseout', onDocumentMouseOut, true);
    document.addEventListener('visibilitychange', onVisibilityChange, true);
  }, [onGlobalMouseMove, onGlobalMouseUp, onWindowLeft, onGlobalCancel, onWindowReenter, onDocumentMouseOut, onVisibilityChange]);

  // 本地 mousemove/up 改為全域監聽，不再使用
  const onGridMouseMove = undefined;
  const onGridMouseUp = undefined;

  // 載入資料夾內容
  const loadFolderContents = useCallback(async () => {
    if (!folderId || !window.electronAPI?.getFolderContents) return;
    
    // 初次載入才顯示 loading，其後刷新不切換 loading，避免整體閃爍
    if (!hasLoadedRef.current) setIsLoading(true);
    try {
      const result = await window.electronAPI.getFolderContents(folderId);
      setFolder(result.folder);
      reconcileGames(result.games || []);
    } catch (error) {
      console.error('載入資料夾內容失敗:', error);
      setFolder(null);
      setGames([]);
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
            <div className="empty-icon">📂</div>
            <div className="empty-text">此資料夾目前沒有遊戲</div>
          </div>
        ) : (
          <FolderGridUnified
            folderId={folderId}
            games={games}
            onGameLaunch={(game) => handleGameLaunch(game)}
            onGameConfigure={(game) => setGameLaunchDialog({ isOpen: true, game, configureOnly: true })}
            onRemoveFromFolder={async (game) => {
              if (!folderId) return;
              try {
                const res = await window.electronAPI?.removeGameFromFolder?.(game.filePath, folderId);
                if (res?.success) {
                  await loadFolderContents();
                }
              } catch (err) {
                console.error('從資料夾移除失敗:', err);
              }
            }}
            onGameInfo={(game) => setGameInfoDialog({ isOpen: true, game })}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => {
              setIsDragging(false);
              try { window.electronAPI?.endDragSession?.(); } catch (e) {}
            }}
            dragState={{ isDragging, draggedItem: null, draggedType: 'game' }}
            externalDragActive={externalDragActive}
            isLoading={showLoadingUI && isLoading}
            selectedSet={selected}
            onSelectedChange={setSelected}
            externalSelectionRect={selectionRect}
            externalBoxSelecting={boxSelecting}
            externalSelectionFading={selectionFading}
            disableFlip={boxSelecting || isDragging}
          />
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
    </div>
  );
};

export default FolderWindowApp;
