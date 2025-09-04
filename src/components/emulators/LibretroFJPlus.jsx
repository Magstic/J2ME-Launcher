import React from 'react';
import { RomCacheSwitch } from '@ui';

// Libretro (RetroArch + FreeJ2ME-Plus core) block for GameLaunchDialog
// Props: { romCache: boolean, onRomCacheChange: (v:boolean)=>void, disabled?: boolean }
export default function LibretroFJPlus({ romCache = false, onRomCacheChange, disabled = false }) {
  return (
    <>
      <RomCacheSwitch checked={romCache} onChange={onRomCacheChange} disabled={disabled} />
      <div className="hint text-12 text-secondary">
        將以最簡指令啟動：retroarch.exe -L core.dll &lt;內容路徑&gt;
      </div>
    </>
  );
}
