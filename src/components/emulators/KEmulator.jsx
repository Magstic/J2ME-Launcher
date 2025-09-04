import React from 'react';
import { RomCacheSwitch } from '@ui';

// KEmulator config block for GameLaunchDialog
// Props: { romCache: boolean, onRomCacheChange: (v:boolean)=>void, disabled?: boolean }
export default function KEmulator({ romCache = true, onRomCacheChange, disabled = false }) {
  return (
    <>
      <RomCacheSwitch checked={romCache} onChange={onRomCacheChange} disabled={disabled} />
      <div className="hint text-12 text-secondary">
        KEmulator 不支援 CLI 自訂參數；此處僅提供 ROM 快取模式切換。
      </div>
    </>
  );
}
