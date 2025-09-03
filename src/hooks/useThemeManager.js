import { useState, useEffect } from 'react';

/**
 * 主題管理邏輯
 * 管理主題狀態、持久化、跨窗口同步
 */
export const useThemeManager = () => {
  // 設定：主題（與 body data-theme 同步，並持久化到 localStorage）
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return typeof document !== 'undefined' ? (document.body?.dataset?.theme || 'dark') : 'dark';
  });

  // 同步主題到全局 body 並持久化，確保 Portal/覆蓋層與其他視窗一致
  useEffect(() => {
    try { document.body && document.body.setAttribute('data-theme', theme); } catch {}
    try { localStorage.setItem('theme', theme); } catch {}
  }, [theme]);

  // 監聽跨視窗的 storage 事件以同步主題（例如資料夾視窗或主視窗切換時）
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'theme') {
        const v = e.newValue;
        if (v === 'light' || v === 'dark') setTheme(v);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return {
    theme,
    setTheme
  };
};
