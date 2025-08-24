import React from 'react';

/**
 * 左側熒光燈條觸發區（手動點擊開關抽屜）
 * props:
 *  - width: 觸發條寬度（px），預設 10
 *  - left:  絕對定位的左側偏移量（px），預設 0；可用於綁到抽屜右側
 *  - onClick: 點擊回調
 */
const NeonStrip = ({ width = 10, left = 0, onClick }) => {
  return (
    <div
      className="neon-strip-trigger"
      onClick={onClick}
      style={{
        position: 'absolute',
        left,
        top: 0,
        bottom: 0,
        width,
        zIndex: 5,
        pointerEvents: 'auto',
        background: 'var(--brand-cyan-gradient-vertical)',
        boxShadow: 'var(--brand-cyan-hairline)',
        transition: 'opacity 160ms ease',
        opacity: 0.35,
        cursor: 'pointer',
      }}
    />
  );
};

export default NeonStrip;
