import React from 'react';
import { RomCacheSwitch } from '@ui';
import { useTranslation } from '@hooks/useTranslation';

// KEmulator config block for GameLaunchDialog
// Props: { romCache: boolean, onRomCacheChange: (v:boolean)=>void, disabled?: boolean }
export default function KEmulator({ romCache = true, onRomCacheChange, disabled = false }) {
  const { t } = useTranslation();
  return (
    <>
      <RomCacheSwitch checked={romCache} onChange={onRomCacheChange} disabled={disabled} />
      <div className="hint text-12 text-secondary">{t('emulatorConfig.kemulator.hint')}</div>
    </>
  );
}
