import './utils/logger.js';
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { FolderWindowApp } from '@components';
import { I18nProvider } from './contexts/I18nContext';
import './App.css';
import '@styles/theme.css';
import '@styles/buttons.css';
import '@styles/dialog.css';
import '@styles/utility.css';

ReactDOM.createRoot(document.getElementById('folder-root')).render(
  <React.StrictMode>
    <I18nProvider>
      <Root />
    </I18nProvider>
  </React.StrictMode>
);

function Root() {
  // 啟動時應用持久化主題並監聽跨視窗同步
  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      const theme =
        saved === 'light' || saved === 'dark' ? saved : document.body?.dataset?.theme || 'dark';
      document.body && document.body.setAttribute('data-theme', theme);
    } catch {}

    const onStorage = (e) => {
      if (e.key === 'theme') {
        const v = e.newValue;
        if (v === 'light' || v === 'dark') {
          try {
            document.body && document.body.setAttribute('data-theme', v);
          } catch {}
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 在 React 首次繪製完成後的一個 animationFrame 再通知主進程顯示
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (window.electronAPI && window.electronAPI.folderWindowReady) {
        window.electronAPI.folderWindowReady();
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return <FolderWindowApp />;
}
