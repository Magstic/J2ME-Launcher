// 虛擬化 Hook：先提供接口與可見範圍推導，初版可選擇關閉（之後接入 react-window）
import React from 'react';
import { VIRTUALIZATION_THRESHOLD, VISIBLE_BUFFER, CARD_ROW_HEIGHT, CARD_COL_WIDTH, VISIBLE_ROW_BUFFER } from '@config/perf';

/**
 * useVirtualizedGrid
 * 提供虛擬化開關與可見索引範圍，用於 FLIP 白名單。
 * 真正渲染交給上層實作。
 */
export default function useVirtualizedGrid({
  itemCount,
  virtualization,
  containerRef,
  freeze = false,
}) {
  const enabled = !!(virtualization?.enabled) && itemCount >= VIRTUALIZATION_THRESHOLD;
  const [state, setState] = React.useState({
    start: 0,
    end: Math.min(itemCount - 1, 200),
    startRow: 0,
    endRow: 0,
    columns: 1,
    rowHeight: CARD_ROW_HEIGHT,
    totalRows: 0,
    topPadding: 0,
    bottomPadding: 0,
  });

  React.useEffect(() => {
    const el = containerRef?.current || document.documentElement;
    if (!el) return;
    let rafId = null;
    const calc = () => {
      // 量測容器寬度與高度
      const viewportH = el.clientHeight || window.innerHeight || 0;
      const viewportW = el.clientWidth || window.innerWidth || 0;
      const columns = Math.max(1, Math.floor(viewportW / CARD_COL_WIDTH));
      const rowHeight = CARD_ROW_HEIGHT;
      const totalRows = Math.max(1, Math.ceil(itemCount / columns));

      // 若容器本身不可捲動，退回到 window/document 的捲動位置
      const containerScrollable = el.scrollHeight > el.clientHeight + 1;
      const windowScrollable = document.documentElement?.scrollHeight > (window.innerHeight || 0) + 1;
      const scrollTop = containerScrollable ? (el.scrollTop || 0) : (window.scrollY || document.documentElement.scrollTop || 0);
      const contentHeight = totalRows * rowHeight;
      let startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - VISIBLE_ROW_BUFFER);
      const visibleRowCount = Math.ceil(viewportH / rowHeight) + VISIBLE_ROW_BUFFER * 2;
      let endRow = Math.min(totalRows - 1, startRow + visibleRowCount);

      // 若內容高度不滿一個 viewport，或容器與 window 都不可滾動，顯示全部並關掉占位，避免初始空白
      if (contentHeight <= viewportH + 1 || (!containerScrollable && !windowScrollable)) {
        startRow = 0;
        endRow = totalRows - 1;
      }

      // 若視窗尺寸尚未準備好（0），先回退為全量渲染，避免初始空白
      const hasValidViewport = viewportH > 0 && viewportW > 0;
      let start = 0;
      let end = itemCount - 1;
      let topPadding = 0;
      let bottomPadding = 0;
      if (hasValidViewport) {
        start = Math.max(0, startRow * columns - VISIBLE_BUFFER);
        end = Math.min(itemCount - 1, (endRow + 1) * columns - 1 + VISIBLE_BUFFER);
        topPadding = startRow * rowHeight;
        bottomPadding = Math.max(0, contentHeight <= viewportH + 1 ? 0 : (totalRows - (endRow + 1)) * rowHeight);
      }

      if (freeze) return; // 冷凍期間不更新，減少掉幀

      setState({ start, end, startRow, endRow, columns, rowHeight, totalRows, topPadding, bottomPadding });
    };
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(calc);
    };
    // 初始計算
    calc();
    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    // 監聽尺寸變化，打包後初始布局更可靠
    let ro;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => handleScroll());
      ro.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('scroll', handleScroll);
      if (ro) try { ro.disconnect(); } catch (e) {}
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [containerRef, itemCount, freeze]);

  return {
    enabled,
    visibleStart: state.start,
    visibleEnd: state.end,
    // 新增：供窗口化渲染使用
    startRow: state.startRow,
    endRow: state.endRow,
    columns: state.columns,
    rowHeight: state.rowHeight,
    totalRows: state.totalRows,
    topPadding: state.topPadding,
    bottomPadding: state.bottomPadding,
  };
}

