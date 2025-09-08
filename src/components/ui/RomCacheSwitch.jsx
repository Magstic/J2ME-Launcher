import React from 'react';
import { useTranslation } from '@hooks/useTranslation';
import ToggleSwitch from '@ui';

export default function RomCacheSwitch({ checked = false, onChange, disabled = false, className = '' }) {
  const { t } = useTranslation();
  return (
    <div className={`config-card card card-muted selects p-12 mb-12 ${className}`} style={{ borderRadius: 8, opacity: 0.95 }}>
      <div className="flex" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="form-label" style={{ marginBottom: 4, fontWeight: 'bold' }}>{t('emulatorConfig.romCache')}</div>
          <div className="hint text-12 text-secondary">{t('emulatorConfig.romCacheHint')}</div>
        </div>
        <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}
