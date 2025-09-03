import React from 'react';
import FolderCard from '../Folder/FolderCard';
import useUnifiedContextMenu from '@shared/hooks/useUnifiedContextMenu';
import './FolderDrawer.css';

/**
 * 左側資料夾抽屜（手動開關）
 * - width: 抽屜寬度（px），預設 120
 * - folders: 資料夾列表
 * - onOpenFolder: (folder) => void
 * - onCreateFolder: () => void
 * - onEditFolder: (folder) => void
 * - onDeleteFolder: (folder) => void
 */
const FolderDrawer = ({
  width = 120,
  topOffset = 0,
  topViewport,
  folders = [],
  onOpenFolder,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
}) => {
  const [hoverFolderId, setHoverFolderId] = React.useState(null);
  const [jiggleFolderId, setJiggleFolderId] = React.useState(null);
  // 新建資料夾按鈕的互動狀態
  const [isBtnHover, setIsBtnHover] = React.useState(false);
  const [isBtnActive, setIsBtnActive] = React.useState(false);
  const isCompact = width <= 80;
  const { ContextMenuElement, openMenu } = useUnifiedContextMenu({
    onOpenFolder: onOpenFolder,
    onEditFolder: onEditFolder,
    onDeleteFolder: onDeleteFolder,
  });

  // 允許在抽屜上方拖拽並放入資料夾
  const handleDragOverFolder = (e, folder) => {
    // 允許drop
    try { e.preventDefault(); } catch {}
    try { e.dataTransfer.dropEffect = 'move'; } catch {}
    if (hoverFolderId !== folder.id) setHoverFolderId(folder.id);
  };

  const handleDragLeaveFolder = (e, folder) => {
    // 僅當離開當前高亮目標時清除
    if (hoverFolderId === folder.id) setHoverFolderId(null);
  };

  const handleDropOnFolder = async (e, folder) => {
    try { e.preventDefault(); } catch {}
    try { e.stopPropagation(); } catch {}
    const api = window.electronAPI;
    let handled = false;
    // 優先走跨窗口拖拽會話
    try {
      if (api?.dropDragSession) {
        await api.dropDragSession({ type: 'folder', id: folder.id });
        handled = true;
      }
    } catch {}

    if (!handled) {
      // 後備：HTML5 內部拖拽（僅單個 text/plain 檔案路徑）
      try {
        const filePath = e.dataTransfer?.getData && e.dataTransfer.getData('text/plain');
        if (filePath) {
          await api?.addGameToFolder?.(filePath, folder.id);
          handled = true;
        }
      } catch {}
    }

    // 結束會話
    try { api?.endDragSession?.(); } catch {}
    setHoverFolderId(null);
    if (handled) {
      setJiggleFolderId(folder.id);
      setTimeout(() => setJiggleFolderId((id) => (id === folder.id ? null : id)), 280);
    }
  };
  return (
    <div
      className={`folder-drawer${isCompact ? ' compact' : ''}`}
      style={{
        position: 'fixed',
        left: 0,
        top: typeof topViewport === 'number' ? topViewport : topOffset,
        bottom: 0,
        width,
        zIndex: 2400,
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        background: 'var(--background-primary)',
        backdropFilter: 'blur(2px)',
        boxShadow: 'var(--titlebar-gradient)',
        transform: 'none',
        transition: 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden', // 關鍵：讓圓角裁切內部滾動容器與滾動條
      }}
    >
      <div className="folder-drawer-scroll" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '10px 6px 60px 6px' }}>
        {folders.map((folder) => (
          <div key={folder.id} style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <FolderCard
              folder={folder}
              onClick={() => onOpenFolder && onOpenFolder(folder)}
              onContextMenu={(e) => openMenu && openMenu(e, folder, { view: 'desktop', kind: 'folder' })}
              className={`folder-card ${jiggleFolderId === folder.id ? 'jiggle' : ''}`}
              isDropTarget={hoverFolderId === folder.id}
              onDragOver={(e) => handleDragOverFolder(e, folder)}
              onDragLeave={(e) => handleDragLeaveFolder(e, folder)}
              onDrop={(e) => handleDropOnFolder(e, folder)}
              disableAppear={true}
            />
          </div>
        ))}
      </div>
      {/* 底部背景圖層：覆蓋抽屜寬度、高度為按鈕高度的兩倍（2 x 32 = 64px） */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 64,
          background: 'linear-gradient(180deg, var(--background-primary) 40%, var(--background-primary-2, var(--background-primary)) 100%)',
          borderTop: '1px solid var(--overlay-on-light-20)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {/* 懸浮新建資料夾按鈕（底部置中） */}
      <button
        type="button"
        onClick={() => onCreateFolder && onCreateFolder()}
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 12,
          transform: `translateX(-50%) scale(${isBtnActive ? 0.96 : 1})`,
          width: 44,
          height: 32,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          lineHeight: 1,
          color: 'var(--text-primary)',
          background: isBtnActive ? 'var(--hover-color-strong, var(--hover-color))' : (isBtnHover ? 'var(--hover-color)' : 'var(--background-secondary)'),
          border: `1px solid ${isBtnHover ? 'var(--overlay-on-light-30)' : 'var(--overlay-on-light-20)'}`,
          boxShadow: isBtnHover ? 'var(--shadow-lg, 0 6px 12px rgba(234, 1, 1, 0.15))' : 'var(--shadow-md)',
          transition: 'transform 100ms ease, box-shadow 120ms ease, background-color 120ms ease, border-color 120ms ease',
          cursor: 'pointer',
          WebkitAppRegion: 'no-drag',
          zIndex: 1,
        }}
        onMouseEnter={() => setIsBtnHover(true)}
        onMouseLeave={() => { setIsBtnHover(false); setIsBtnActive(false); }}
        onMouseDown={() => setIsBtnActive(true)}
        onMouseUp={() => setIsBtnActive(false)}
        onFocus={() => setIsBtnHover(true)}
        onBlur={() => { setIsBtnHover(false); setIsBtnActive(false); }}
      >
        +
      </button>
      {ContextMenuElement}
    </div>
  );
};

export default FolderDrawer;
