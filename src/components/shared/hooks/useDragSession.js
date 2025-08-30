// 拖拽會話 Hook：移植現有 DesktopGrid/FolderWindowApp 的多選與自訂拖拽預覽
// - 啟動跨窗口拖拽 session（window.electronAPI.startDragSession）
// - 自訂拖拽預覽圖層（多層疊加）
// - 依賴外部提供的 selectedRef 與 games 列表
import React from 'react';

export default function useDragSession({ selectedRef, games, source = { type: 'desktop', id: null } }) {
  const previewRef = React.useRef(null);

  const handleGameDragStart = React.useCallback((event, game) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', game.filePath);

    // 準備多選項目
    const currentSel = new Set(selectedRef.current || []);
    if (!currentSel.has(game.filePath)) {
      // 若未選中該項，預設以該項作為唯一選中
      currentSel.clear();
      currentSel.add(game.filePath);
    }
    const items = (games || []).filter(g => currentSel.has(g.filePath)).map(g => ({
      gameId: g.filePath,
      filePath: g.filePath,
      name: g.gameName,
      iconUrl: g.iconUrl
    }));

    // 啟動跨窗口拖拽會話（多選）
    try {
      const ctx = source || { type: 'desktop', id: null };
      window.electronAPI?.startDragSession?.(items, ctx);
    } catch (e) {
      console.warn('startDragSession failed:', e);
    }

    // 自訂拖拽預覽（平台特定效果）
    try {
      // Linux: 完全禁用拖拽圖像
      if (navigator.userAgent.includes('Linux')) {
        // 創建透明的 1x1 像素圖像來禁用拖拽預覽
        const emptyImg = new Image();
        emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
        event.dataTransfer.setDragImage(emptyImg, 0, 0);
        return;
      }
      
      // Windows/其他平台: 原有的層疊效果
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.top = '-1000px';
      container.style.left = '-1000px';
      container.style.pointerEvents = 'none';
      
      const maxLayers = Math.min(5, items.length);
      container.style.padding = '8px';
      container.style.borderRadius = '8px';
      container.style.background = 'var(--background-secondary)';
      container.style.border = '1px solid var(--border-color)';
      container.style.boxShadow = 'var(--shadow-md)';

      for (let i = maxLayers - 1; i >= 0; i--) {
        const item = items[i];
        const layer = document.createElement('div');
        layer.style.position = 'absolute';
        layer.style.top = `${i * 6}px`;
        layer.style.left = `${i * 6}px`;
        layer.style.display = 'flex';
        layer.style.alignItems = 'center';
        layer.style.gap = '8px';
        layer.style.padding = '6px 10px';
        layer.style.background = 'var(--background-secondary)';
        layer.style.border = '1px solid var(--border-color)';
        layer.style.borderRadius = '8px';

        const img = document.createElement('img');
        img.src = item.iconUrl;
        img.alt = item.name;
        img.style.width = '24px';
        img.style.height = '24px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';

        const span = document.createElement('span');
        span.textContent = i === 0 && items.length > maxLayers ? `${items.length} items` : item.name;
        span.style.fontSize = '12px';
        span.style.color = 'var(--text-primary)';
        span.style.whiteSpace = 'nowrap';
        span.style.maxWidth = '160px';
        span.style.overflow = 'hidden';
        span.style.textOverflow = 'ellipsis';

        layer.appendChild(img);
        layer.appendChild(span);
        container.appendChild(layer);
      }

      document.body.appendChild(container);
      previewRef.current = container;
      event.dataTransfer.setDragImage(container, 16, 16);
      setTimeout(() => {
        if (previewRef.current && previewRef.current.parentNode) {
          previewRef.current.parentNode.removeChild(previewRef.current);
          previewRef.current = null;
        }
      }, 0);
    } catch (_) {}
  }, [games, selectedRef]);

  const endDragSession = React.useCallback(() => {
    try { window.electronAPI?.endDragSession?.(); } catch (e) {}
  }, []);

  return { handleGameDragStart, endDragSession };
}
