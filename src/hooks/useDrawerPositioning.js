import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 抽屜定位 Hook
 * 管理左側資料夾抽屜的定位邏輯
 */
export const useDrawerPositioning = () => {
  // 量測搜尋列相對於內容包裹層的偏移，讓抽屜頂部貼在搜尋列下方
  const contentWrapRef = useRef(null);
  const [drawerTopOffset, setDrawerTopOffset] = useState(0);
  const [drawerTopViewport, setDrawerTopViewport] = useState(0);

  const measureTopOffset = useCallback(() => {
    try {
      const wrap = contentWrapRef.current;
      if (!wrap) return;
      const search =
        document.querySelector('.search-bar') || document.querySelector('.search-bar-container');
      if (!search) {
        setDrawerTopOffset(0);
        return;
      }
      const wrapRect = wrap.getBoundingClientRect();
      const searchRect = search.getBoundingClientRect();
      // 以視窗座標對齊抽屜頂部到搜尋列頂部（= 標題欄下緣）
      setDrawerTopViewport(Math.round(searchRect.top));
      // 另外計算抽屜在 wrap 內的偏移（供內部捲動/高度計算使用）
      const inWrapTop = Math.max(0, Math.round(searchRect.top - wrapRect.top));
      setDrawerTopOffset(inWrapTop);
    } catch (_) {}
  }, []);

  useEffect(() => {
    // 初次量測 + 視窗大小改變時重新量測；不再使用 setInterval 以避免滾動抖動
    const onResize = () => measureTopOffset();
    // 延遲一次確保初始布局完成
    const t = setTimeout(measureTopOffset, 50);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, [measureTopOffset]);

  return {
    contentWrapRef,
    drawerTopOffset,
    drawerTopViewport,
    drawerWidth: 120, // 與需求一致的固定寬度
  };
};
