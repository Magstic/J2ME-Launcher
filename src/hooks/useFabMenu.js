import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * FAB 選單控制邏輯
 * 管理 FAB 開啟/關閉的延時控制和 hover-intent 邏輯
 */
export const useFabMenu = () => {
  const [fabOpen, setFabOpen] = useState(false);
  const fabHideTimer = useRef(null);
  const fabOpenTimer = useRef(null);

  const openFab = useCallback(() => {
    // 取消關閉定時，避免即將關閉時又打開
    if (fabHideTimer.current) { 
      clearTimeout(fabHideTimer.current); 
      fabHideTimer.current = null; 
    }
    // 若已經開啟，立即保持開啟
    if (fabOpen) { 
      setFabOpen(true); 
      return; 
    }
    // 引入微小延時，避免穿越卡片邊界時造成生硬的進出
    if (!fabOpenTimer.current) {
      fabOpenTimer.current = setTimeout(() => {
        setFabOpen(true);
        fabOpenTimer.current = null;
      }, 90); // 開啟延時（hover-intent）
    }
  }, [fabOpen]);

  const scheduleCloseFab = useCallback(() => {
    if (fabHideTimer.current) clearTimeout(fabHideTimer.current);
    if (fabOpenTimer.current) { 
      clearTimeout(fabOpenTimer.current); 
      fabOpenTimer.current = null; 
    }
    fabHideTimer.current = setTimeout(() => {
      setFabOpen(false);
      fabHideTimer.current = null;
    }, 100); // 更靈敏：縮短關閉延時
  }, []);

  const toggleFab = useCallback(() => {
    setFabOpen(v => !v);
  }, []);

  // 清理定時器
  useEffect(() => () => {
    if (fabHideTimer.current) clearTimeout(fabHideTimer.current);
    if (fabOpenTimer.current) clearTimeout(fabOpenTimer.current);
  }, []);

  return {
    fabOpen,
    openFab,
    scheduleCloseFab,
    toggleFab
  };
};
