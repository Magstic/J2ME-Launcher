import React, { useEffect, useMemo, useRef, useState } from 'react';
import GameCard from '../GameCard';
import useControllerContextMenu from './useControllerContextMenu';
import useGamepad from '@hooks/useGamepad';

function GameGrid({ games, isLoading, onGameLaunch, onAddToFolder, onGameInfo, controllerModeEnabled = false, onToggleViewMode }) {
  // 先宣告 hook，避免在不同渲染分支中條件性呼叫 hook（違反 Hooks 規則）
  const infoCb = onGameInfo || ((game) => {
    window.dispatchEvent(new CustomEvent('open-game-info', { detail: game }));
  });
  const { ContextMenuElement, openGameMenu } = useControllerContextMenu({
    onGameLaunch: onGameLaunch,
    onAddToFolder: onAddToFolder,
    onGameInfo: infoCb,
    onGameConfigure: (game) => {
      window.dispatchEvent(new CustomEvent('open-game-config', { detail: game }));
    },
    // 建立捷徑：與桌面模式一致，透過 preload IPC 呼叫主程序
    onCreateShortcut: async (game) => {
      if (!game || !game.filePath) return;
      const payload = {
        filePath: game.filePath,
        title: game.gameName || undefined,
      };
      try {
        // 從 safe-file:// 提取快取檔名（與主程序快取命名對應）
        if (game.iconUrl && typeof game.iconUrl === 'string' && game.iconUrl.startsWith('safe-file://')) {
          payload.iconCacheName = game.iconUrl.replace('safe-file://', '');
        }
      } catch (_) {}
      try {
        await window.electronAPI?.createShortcut?.(payload);
      } catch (e) {
        console.error('[Controller] 建立捷徑失敗:', e);
      }
    },
  });

  // 處理遊戲雙擊啟動
  const handleGameClick = (_event, game) => {
    onGameLaunch && onGameLaunch(game);
  };

  // 區分來源的包裝器（kb | pad）
  const moveFocusWithLog = (source, dir, meta) => {
    // 長按間隔已放慢到 500ms，可以統一使用 smooth 以獲得一致體驗
    scrollBehaviorRef.current = 'smooth';
    scrollBlockRef.current = 'nearest';
    if (source === 'kb') console.log(`[鍵盤] 請求移動: ${dir}`);
    else if (source === 'pad') console.log(`[手把] 請求移動: ${dir}`);
    moveFocus(dir);
  };

  // —— 控制器模式：焦點與導航 ——
  const gridRef = useRef(null);
  const scrollBehaviorRef = useRef('smooth');
  const scrollBlockRef = useRef('nearest');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // 尋找實際可滾動的容器（overflowY 為 auto/scroll 且可滾動）
  const findScrollContainer = (startEl) => {
    let el = startEl || gridRef.current;
    while (el && el !== document.body) {
      try {
        const style = window.getComputedStyle(el);
        const oy = style?.overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
          return el;
        }
      } catch (_) {}
      el = el.parentElement;
    }
    return gridRef.current || document.scrollingElement || document.documentElement;
  };

  const isAnyModalOpen = () => {
    return !!document.querySelector('.modal-overlay, [role="dialog"]');
  };

  // 當控制器模式啟用且有遊戲時，初始化焦點
  useEffect(() => {
    if (controllerModeEnabled && games.length > 0) {
      setFocusedIndex((prev) => (prev >= 0 && prev < games.length ? prev : 0));
    } else {
      setFocusedIndex(-1);
    }
  }, [controllerModeEnabled, games.length]);

  const wrappersQuery = () => Array.from(gridRef.current?.querySelectorAll('.game-card-wrapper') || []);
  const cardsQuery = () => Array.from(gridRef.current?.querySelectorAll('.game-card') || []);
  const getRects = () => cardsQuery().map((el, i) => ({ el, i, rect: el.getBoundingClientRect() }));

  // 根據第一行元素的 top 近似推斷列數（穩定鍵盤導覽）
  const computeColumnCount = () => {
    const rects = getRects();
    if (rects.length === 0) return 1;
    const firstTop = rects[0].rect.top;
    const tolerance = 10; // px 容忍
    let count = 0;
    for (const r of rects) {
      if (Math.abs(r.rect.top - firstTop) <= tolerance) count++; else break;
    }
    return Math.max(1, count);
  };

  const moveFocus = (dir) => {
    const total = games.length;
    if (total === 0) return;
    const cols = computeColumnCount();
    setFocusedIndex((prev) => {
      const cur = prev >= 0 ? prev : 0; // 僅使用 prev，保持純函數，避免 StrictMode 下雙呼導致跨一格
      const rowStart = Math.floor(cur / cols) * cols;
      const rowEnd = Math.min(rowStart + cols - 1, total - 1);
      let next = cur;
      if (dir === 'left') {
        if (cur === rowStart) {
          // 向左包裹到上一行的最右（若存在）
          const prevRowEnd = rowStart - 1;
          next = prevRowEnd >= 0 ? prevRowEnd : cur;
        } else {
          next = cur - 1;
        }
      } else if (dir === 'right') {
        if (cur === rowEnd) {
          // 向右包裹到下一行的最左（若存在）
          const nextRowStart = rowStart + cols;
          next = nextRowStart <= total - 1 ? nextRowStart : cur;
        } else {
          next = cur + 1;
        }
      } else if (dir === 'up') {
        next = cur - cols >= 0 ? cur - cols : cur;
      } else if (dir === 'down') {
        next = cur + cols < total ? cur + cols : cur;
      }

      // 日誌（來源在 moveFocusWithLog 注入）
      console.log(`[控制器/鍵盤] moveFocus dir=%s cur=%d -> next=%d (cols=%d row=[%d,%d] total=%d)`, dir, cur, next, cols, rowStart, rowEnd, total);
      return next;
    });
  };

  // 焦點改變時再滾動，避免使用舊索引
  useEffect(() => {
    if (focusedIndex < 0) return;
    const wrapper = wrappersQuery()[focusedIndex];
    const behavior = scrollBehaviorRef.current || 'smooth';
    const block = scrollBlockRef.current || 'nearest';
    wrapper?.scrollIntoView({ behavior, block, inline: 'nearest' });
    // 使用一次後恢復為默認
    scrollBlockRef.current = 'nearest';
  }, [focusedIndex]);

  const handlePress = (action) => {
    // 若有任一彈窗開啟，忽略網格內按鍵行為（交由彈窗處理）
    if (isAnyModalOpen()) {
      console.log('[控制器] 檢測到彈窗開啟，忽略網格操作:', action);
      return;
    }
    if ((action === 'pageDown' || action === 'pageUp') && controllerModeEnabled) {
      console.log(`[控制器/鍵盤] 翻頁請求: ${action}`);
      // 視窗可見列數估算
      let wrappers = wrappersQuery();
      if (!wrappers.length) {
        wrappers = Array.from(document.querySelectorAll('.game-card-wrapper'));
      }
      if (!wrappers.length) return;
      const container = findScrollContainer(wrappers[0]);
      const crect = container ? { height: container.clientHeight } : null;
      const first = wrappers[0]?.getBoundingClientRect();
      const cols = computeColumnCount();
      let rowsVisible = 3; // 後備：至少跨 3 行
      if (crect && first) {
        // 用當前焦點所在列往下一行的元素估計行高
        const cur = focusedIndex >= 0 ? focusedIndex : 0;
        const curRect = wrappers[cur]?.getBoundingClientRect() || first;
        const sameColNextIdx = cur + cols < wrappers.length ? cur + cols : -1;
        const nextRect = sameColNextIdx >= 0 ? wrappers[sameColNextIdx].getBoundingClientRect() : null;
        const rowHeight = nextRect ? Math.max(1, nextRect.top - curRect.top) : Math.max(1, first.height);
        rowsVisible = Math.max(1, Math.floor((crect.height || container.clientHeight) / rowHeight));
        console.log(`[翻頁診斷] cols=%d rowHeight=%d visibleH=%d rowsVisible=%d wrappers=%d containerClass=%s scrollH=%d clientH=%d`, cols, rowHeight, Math.floor(crect.height || container.clientHeight), rowsVisible, wrappers.length, container?.className || '(no-class)', container?.scrollHeight || -1, container?.clientHeight || -1);
      }
      const total = games.length;
      setFocusedIndex(prev => {
        const cur = prev >= 0 ? prev : 0;
        const curRow = Math.floor(cur / cols);
        const curCol = cur % cols; // 保持列
        const maxRow = Math.floor((total - 1) / cols);
        const totalRows = maxRow + 1;
        rowsVisible = Math.max(1, Math.min(rowsVisible, totalRows));
        if (totalRows <= rowsVisible) {
          console.log('[翻頁] 僅一頁可見，忽略');
          return cur;
        }
        const pageStartRow = Math.floor(curRow / rowsVisible) * rowsVisible;
        let newPageStartRow = action === 'pageDown' ? pageStartRow + rowsVisible : pageStartRow - rowsVisible;
        newPageStartRow = Math.max(0, Math.min(newPageStartRow, Math.max(0, totalRows - rowsVisible)));
        const targetRow = newPageStartRow; // 翻到新頁第一行
        let next = targetRow * cols + curCol;
        if (next > total - 1) next = total - 1; // 末尾防護
        console.log(`[控制器/鍵盤] page ${action === 'pageDown' ? 'down' : 'up'} cur=%d(row=%d,col=%d) -> next=%d(targetRow=%d) (rowsVisible=%d cols=%d total=%d totalRows=%d pageStartRow=%d)`, cur, curRow, curCol, next, targetRow, rowsVisible, cols, total, totalRows, pageStartRow);
        return next;
      });
      // 翻頁使用平滑滾動且對齊頁首
      scrollBehaviorRef.current = 'smooth';
      scrollBlockRef.current = 'start';
    }
    // 以狀態中的 focusedIndex 為準；若不存在，再嘗試從 DOM .focused 取得
    let targetIndex = focusedIndex;
    if ((targetIndex == null || targetIndex < 0) && (action === 'launch' || action === 'info' || action === 'config')) {
      const wrappers = wrappersQuery();
      const domIndex = wrappers.findIndex(w => w.classList.contains('focused'));
      if (domIndex >= 0) targetIndex = domIndex;
    }

    if ((action === 'launch' || action === 'info' || action === 'config') && targetIndex >= 0 && games[targetIndex]) {
      try { console.log(`[控制器] action=%s 目標 index=%d title=%s`, action, targetIndex, games[targetIndex]?.title || '(無)'); } catch {}
    }

    if (action === 'launch' && targetIndex >= 0 && games[targetIndex]) {
      onGameLaunch && onGameLaunch(games[targetIndex]);
    } else if (action === 'info' && targetIndex >= 0 && games[targetIndex]) {
      // 與現有事件一致
      window.dispatchEvent(new CustomEvent('open-game-info', { detail: games[targetIndex] }));
    } else if (action === 'config' && targetIndex >= 0 && games[targetIndex]) {
      window.dispatchEvent(new CustomEvent('open-game-config', { detail: games[targetIndex] }));
    } else if (action === 'pageUp' || action === 'pageDown') {
      // 控制器模式不依賴桌面佈局，尋找實際可滾動容器
      const firstWrapper = wrappersQuery()[0];
      const container = findScrollContainer(firstWrapper || gridRef.current);
      if (container) {
        const delta = (action === 'pageUp' ? -1 : 1) * container.clientHeight * 0.9;
        container.scrollBy({ top: delta, behavior: 'smooth' });
      }
    } else if (action === 'focusSearch') {
      document.querySelector('.search-input')?.focus();
    } else if (action === 'toggleMode') {
      onToggleViewMode && onToggleViewMode();
    } else if (action === 'back') {
      // 清除焦點
      setFocusedIndex(-1);
    }
  };

  useGamepad({
    enabled: !!controllerModeEnabled,
    onMove: (dir, meta) => {
      if (isAnyModalOpen()) return;
      moveFocusWithLog('pad', dir, meta);
    },
    onPress: handlePress,
  });

  // 鍵盤導覽（僅控制器模式下啟用），避免與輸入框衝突
  useEffect(() => {
    if (!controllerModeEnabled) return;
    const onKeyDown = (e) => {
      if (e.repeat) return; // 忽略鍵盤自動重複
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea';
      if (isTyping) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocusWithLog('kb', 'left'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveFocusWithLog('kb', 'right'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocusWithLog('kb', 'up'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocusWithLog('kb', 'down'); }
      else if (e.key === 'PageDown') { e.preventDefault(); console.log('[鍵盤] 請求翻頁: down'); handlePress('pageDown'); }
      else if (e.key === 'PageUp') { e.preventDefault(); console.log('[鍵盤] 請求翻頁: up'); handlePress('pageUp'); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePress('launch'); }
      else if (e.key === 'Escape') { e.preventDefault(); setFocusedIndex(-1); console.log('[鍵盤] ESC 清除焦點'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [controllerModeEnabled]);

  // 監聽佈局/尺寸變化：重新確認焦點索引並觸發滾動，以避免調整視窗後控制器/鍵盤失效
  useEffect(() => {
    if (!controllerModeEnabled) return;
    const onResize = () => {
      // 使用 rAF 合併多次 resize 事件，等佈局穩定後再處理
      if (onResize._raf) cancelAnimationFrame(onResize._raf);
      onResize._raf = requestAnimationFrame(() => {
        setFocusedIndex((prev) => {
          if (games.length === 0) return -1;
          if (prev == null || prev < 0) return 0; // 若無焦點，給第一個
          return Math.min(prev, games.length - 1); // 夾取到有效範圍
        });
        // 下一輪鍵盤/手把移動將使用新的列數（computeColumnCount 基於當前 rects 計算）
      });
    };
    const ro = new (window.ResizeObserver || class { observe(){} disconnect(){} })((entries) => {
      onResize();
    });
    if (gridRef.current) ro.observe(gridRef.current);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (onResize._raf) cancelAnimationFrame(onResize._raf);
      ro.disconnect && ro.disconnect();
    };
  }, [controllerModeEnabled, games.length]);

  // 將早期返回放在所有 hooks 之後，確保 hooks 呼叫順序一致
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>載入中...</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="game-grid empty">
        <div className="empty-state">
          <div className="empty-icon">🎮</div>
          <h3>控制器模式</h3>
          <p>這是控制器模式，開發中……</p>
          <p>請使用鍵盤或手把進行操作</p>
        </div>
        {ContextMenuElement}
      </div>
    );
  }

  return (
    <div
      className={`game-grid ${controllerModeEnabled ? 'controller-mode' : ''}`}
      ref={gridRef}
      style={{
        // 使控制器模式獨立成為自身的滾動容器，不依賴桌面佈局的 .content-area
        overflowY: 'auto',
        maxHeight: '100%',
      }}
    >
      {games.map((game, index) => (
        <div key={game.filePath || index} className={`game-card-wrapper ${focusedIndex === index ? 'focused' : ''}`}>
          <GameCard 
            game={game} 
            onClick={(_e) => handleGameClick(_e, game)}
            draggable={false}
            onContextMenu={(e) => openGameMenu(e, game)}
          />
        </div>
      ))}
      {ContextMenuElement}
    </div>
  );
}

export default GameGrid;
