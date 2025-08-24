import React from 'react';

export default function RomCacheSwitch({ checked = false, onChange, disabled = false, className = '' }) {
  const trackStyle = {
    width: 42,
    height: 24,
    borderRadius: 12,
    background: checked ? '#4caf50' : '#999',
    position: 'relative',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
    flex: '0 0 auto',
    opacity: disabled ? 0.6 : 1,
  };
  const knobStyle = {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: 2,
    left: checked ? 20 : 2,
    boxShadow: '0 1px 3px var(--scrim-30)',
    transition: 'left 0.2s ease',
  };
  const handleToggle = () => {
    if (disabled) return;
    onChange?.(!checked);
  };
  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onChange?.(!checked);
    }
  };
  return (
    <div className={`config-card card card-muted selects p-12 mb-12 ${className}`} style={{ borderRadius: 8, opacity: 0.95 }}>
      <div className="flex" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="form-label" style={{ marginBottom: 4, fontWeight: 'bold' }}>ROM 快取模式</div>
          <div className="hint text-12 text-secondary">推薦在『非 UTF-8』系統下啟用，以避免無法啟動遊戲。</div>
        </div>
        <div
          role="switch"
          aria-checked={checked}
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          style={trackStyle}
        >
          <span style={knobStyle} />
        </div>
      </div>
    </div>
  );
}
