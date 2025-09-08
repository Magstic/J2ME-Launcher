import React from 'react';

/**
 * ToggleSwitch 通用開關
 */
export default function ToggleSwitch({ checked = false, onChange, disabled = false, label, className = '' }) {
  const trackStyle = {
    width: 42,
    height: 24,
    borderRadius: 12,
    background: checked ? 'var(--accent-color)' : 'var(--background-tertiary)',
    position: 'relative',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
    flex: '0 0 auto',
    opacity: disabled ? 0.6 : 1,
    border: '1px solid var(--border-color)',
  };
  const knobStyle = {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'var(--toggle-knob, #fff)',
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
    <div className={`flex ${className}`} style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      {label && (
        <div>
          <div className="form-label" style={{ marginBottom: 4, fontWeight: 'bold' }}>{label}</div>
        </div>
      )}
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
  );
}
