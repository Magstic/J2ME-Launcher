import React from 'react';
import ico from '../assets/icons/icon.png';

function TitleBar() {
  const handleMinimize = () => window.electronAPI.minimizeWindow();
  const handleMaximize = () => window.electronAPI.maximizeWindow();
  const handleClose = () => window.electronAPI.closeWindow();

  return (
    <div className="title-bar">
      <div className="title-bar-text" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {/* 使用 SVG 作為遮罩，渲染純色剪影（灰白） */}
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            display: 'inline-block',
            backgroundColor: 'var(--text-primary)', // 可改為 var(--text) 或其他主題色
            WebkitMask: `url(${ico}) center / contain no-repeat`,
            mask: `url(${ico}) center / contain no-repeat`,
          }}
        />
        <span
          style={{
            fontFamily: "system-ui, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
            fontWeight: 700,
            letterSpacing: 0.5,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          }}
        >
          J2ME Launcher
        </span>
      </div>
      <div className="window-controls">
        <button
          className="title-bar-button"
          id="minimize-btn"
          onClick={handleMinimize}
          title="最小化"
        >
          <svg x="0px" y="0px" viewBox="0 0 10.2 1">
            <rect x="0" y="0" width="10.2" height="1"></rect>
          </svg>
        </button>
        <button
          className="title-bar-button"
          id="maximize-btn"
          onClick={handleMaximize}
          title="最大化"
        >
          <svg viewBox="0 0 10 10">
            <path d="M0,0v10h10V0H0z M9,9H1V1h8V9z"></path>
          </svg>
        </button>
        <button className="title-bar-button" id="close-btn" onClick={handleClose} title="關閉">
          <svg viewBox="0 0 10 10">
            <polygon points="10,1 9,0 5,4 1,0 0,1 4,5 0,9 1,10 5,6 9,10 10,9 6,5"></polygon>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
