import React, { useEffect, useMemo, useRef, useState } from 'react';
import './DirectoryManager.css';
import { Collapsible, ModalWithFooter, RomCacheSwitch } from '@ui';
import { FreeJ2MEPlusConfig } from '@components';

function EmulatorConfigDialog({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [emulatorList, setEmulatorList] = useState([]);
  const [emulators, setEmulators] = useState({
    freej2mePlus: {
      jarPath: '',
      romCache: true,
      defaults: { fullscreen: 0, width: 240, height: 320, scale: 2, keyLayout: 0, framerate: 60 }
    },
    ke: { jarPath: '', romCache: true },
    libretro: { retroarchPath: '', corePath: '', romCache: false }
  });
  const [dirty, setDirty] = useState(false);
  const [freeOpen, setFreeOpen] = useState(false);
  const [keOpen, setKeOpen] = useState(false);
  const [libretroOpen, setLibretroOpen] = useState(false);
  const [showPathChangeWarn, setShowPathChangeWarn] = useState(false);
  const warnFlagsRef = useRef({ rmsOn: false, emuCfgOn: false });
  const originalPathsRef = useRef({ freeJar: '', keJar: '', retroarch: '' });
  const freeDefaults = useMemo(() => emulators.freej2mePlus?.defaults || {}, [emulators]);
  const freeAdapter = useMemo(() => (emulatorList || []).find(e => e?.id === 'freej2mePlus') || null, [emulatorList]);
  const freeCaps = freeAdapter?.capabilities || {};
  //（已改用 FreeJ2MEPlusConfig 統一渲染選項，移除本地常數）

  // 內建基線（與 GameLaunchDialog 的 params 初始值一致）
  const BASE_DEFAULTS = useMemo(() => ({
    fullscreen: 0,
    width: 240,
    height: 320,
    scale: 2,
    keyLayout: 0,
    framerate: 60,
    soundfont: 'Default',
    textfont: 'Default',
    compatfantasyzonefix: 'off',
    compatimmediaterepaints: 'off',
    compatoverrideplatchecks: 'on',
    compatsiemensfriendlydrawing: 'off',
    compattranstooriginonreset: 'off',
    backlightcolor: 'Disabled',
    fontoffset: '-2',
    rotate: '0',
    fpshack: '0',
    sound: 'on',
    spdhacknoalpha: 'off'
  }), []);

  // 開啟時載入保存的配置並與基線合併，確保所有新欄位有一致預設
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        setLoading(true);
        const emu = await window.electronAPI.getEmulatorConfig();
        const saved = (emu && emu.freej2mePlus) || {};
        const mergedDefaults = { ...BASE_DEFAULTS, ...((saved && saved.defaults) || {}) };
        // 記錄原始路徑以便保存前比較
        originalPathsRef.current = {
          freeJar: (emu && emu.freej2mePlus && emu.freej2mePlus.jarPath) || '',
          keJar: (emu && emu.ke && emu.ke.jarPath) || '',
          retroarch: (emu && emu.libretro && emu.libretro.retroarchPath) || ''
        };
        setEmulators(prev => ({
          ...prev,
          freej2mePlus: {
            jarPath: (emu && emu.freej2mePlus && emu.freej2mePlus.jarPath) || prev.freej2mePlus?.jarPath || '',
            romCache: (emu && emu.freej2mePlus && typeof emu.freej2mePlus.romCache === 'boolean') ? emu.freej2mePlus.romCache : (typeof prev.freej2mePlus?.romCache === 'boolean' ? prev.freej2mePlus.romCache : true),
            defaults: prev.freej2mePlus?.defaults || BASE_DEFAULTS,
          },
          ke: {
            jarPath: (emu && emu.ke && emu.ke.jarPath) || prev.ke?.jarPath || '',
            romCache: (emu && emu.ke && typeof emu.ke.romCache === 'boolean') ? emu.ke.romCache : (typeof prev.ke?.romCache === 'boolean' ? prev.ke.romCache : true)
          },
          libretro: {
            retroarchPath: (emu && emu.libretro && emu.libretro.retroarchPath) || prev.libretro?.retroarchPath || '',
            corePath: (emu && emu.libretro && emu.libretro.corePath) || prev.libretro?.corePath || '',
            romCache: (emu && emu.libretro && typeof emu.libretro.romCache === 'boolean') ? emu.libretro.romCache : (typeof prev.libretro?.romCache === 'boolean' ? prev.libretro.romCache : false)
          }
        }));
        setDirty(false);
      } catch (_) {
        // 忽略讀取錯誤，保留目前狀態
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, BASE_DEFAULTS]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        setLoading(true);
        // 動態取得模擬器清單
        try {
          const listed = await window.electronAPI.listEmulators();
          setEmulatorList(Array.isArray(listed) ? listed : []);
        } catch (_) {}
        const cfg = await window.electronAPI.getEmulatorConfig();
        if (cfg) {
          // 同步原始路徑
          originalPathsRef.current = {
            freeJar: (cfg && cfg.freej2mePlus && cfg.freej2mePlus.jarPath) || '',
            keJar: (cfg && cfg.ke && cfg.ke.jarPath) || '',
            retroarch: (cfg && cfg.libretro && cfg.libretro.retroarchPath) || ''
          };
          setEmulators(cfg);
        }
      } catch (e) {
        console.error('載入模擬器設定失敗:', e);
      } finally {
        setLoading(false);
        setDirty(false);
      }
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  const updateFreeField = (field, value) => {
    setEmulators(prev => ({
      ...prev,
      freej2mePlus: {
        ...(prev.freej2mePlus || {}),
        [field]: value
      }
    }));
    setDirty(true);
  };

  const updateFreeDefault = (field, value) => {
    setEmulators(prev => ({
      ...prev,
      freej2mePlus: {
        ...(prev.freej2mePlus || {}),
        defaults: {
          ...((prev.freej2mePlus && prev.freej2mePlus.defaults) || {}),
          [field]: value
        }
      }
    }));
    setDirty(true);
  };

  const handlePickJar = async () => {
    const path = await window.electronAPI.pickEmulatorBinary('freej2mePlus');
    if (path) updateFreeField('jarPath', path);
  };

  const doSave = async () => {
    try {
      setLoading(true);
      await window.electronAPI.setEmulatorConfig({
        freej2mePlus: {
          jarPath: emulators.freej2mePlus?.jarPath || '',
          romCache: (typeof emulators.freej2mePlus?.romCache === 'boolean') ? emulators.freej2mePlus.romCache : true,
          defaults: freeDefaults
        },
        ke: { jarPath: emulators.ke?.jarPath || '', romCache: (typeof emulators.ke?.romCache === 'boolean') ? emulators.ke.romCache : true },
        libretro: {
          retroarchPath: emulators.libretro?.retroarchPath || '',
          corePath: emulators.libretro?.corePath || '',
          romCache: (typeof emulators.libretro?.romCache === 'boolean') ? emulators.libretro.romCache : false
        }
      });
      // 保存成功後，同步原始路徑基準
      originalPathsRef.current = {
        freeJar: emulators.freej2mePlus?.jarPath || '',
        keJar: emulators.ke?.jarPath || '',
        retroarch: emulators.libretro?.retroarchPath || ''
      };
      setDirty(false);
      // 關閉動效交由容器處理（在調用端透過 requestCloseRef）
      if (requestCloseRef.current) requestCloseRef.current();
    } catch (e) {
      console.error('保存模擬器設定失敗:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      // 若備份選擇中啟用了 rms 或 emuConfig，且此次修改動到模擬器路徑，改用自訂 Modal 提示風險
      let rmsOn = false, emuCfgOn = false;
      try {
        const raw = localStorage.getItem('backup.selectedGroups');
        if (raw) {
          const parsed = JSON.parse(raw);
          rmsOn = !!parsed?.rms;
          emuCfgOn = !!parsed?.emuConfig;
        }
      } catch (_) {}

      const freeChanged = (emulators.freej2mePlus?.jarPath || '') !== (originalPathsRef.current.freeJar || '');
      const keChanged = (emulators.ke?.jarPath || '') !== (originalPathsRef.current.keJar || '');
      const retroChanged = (emulators.libretro?.retroarchPath || '') !== (originalPathsRef.current.retroarch || '');
      const pathsChanged = freeChanged || keChanged || retroChanged;

      if (pathsChanged && (rmsOn || emuCfgOn)) {
        warnFlagsRef.current = { rmsOn, emuCfgOn };
        setShowPathChangeWarn(true);
        return;
      }

      await doSave();
    } catch (_) {}
  };

  const numberInput = (label, value, onChange, props = {}) => (
    <div className="form-row">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type="number"
        value={value}
        onChange={e => onChange(parseInt(e.target.value || '0', 10))}
        {...props}
      />
    </div>
  );

  const requestCloseRef = React.useRef(null);

  return (<>
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title="模擬器配置"
      size="md"
      requestCloseRef={requestCloseRef}
      actions={[
        { key: 'cancel', label: '取消', variant: 'secondary', onClick: () => requestCloseRef.current && requestCloseRef.current() },
        { key: 'save', label: '保存', variant: 'primary', onClick: handleSave, disabled: loading || !dirty, allowFocusRing: true },
      ]}
    >
        <div className="modal-body">
          {/* FreeJ2ME-Plus 區塊（可折疊） */}
          {emulatorList.some(e => e?.id === 'freej2mePlus') && (
            <Collapsible
              className="mb-12"
              title={(emulatorList.find(e => e?.id === 'freej2mePlus')?.name) || 'FreeJ2ME-Plus'}
              open={freeOpen}
              onToggle={() => setFreeOpen(o => !o)}
            >
                {freeCaps?.requiresGameConf && (
                  <div className="hint text-12 text-secondary mb-8">
                    預設啟動參數，每款遊戲可於首次啟動時自訂並覆蓋（字體和音源除外）
                  </div>
                )}
                <div className="form-row">
                  <label className="form-label">執行檔（freej2me.jar）</label>
                  <div className="flex gap-8 items-center" style={{ width: '100%' }}>
                    <input className="form-input" type="text" readOnly value={emulators.freej2mePlus?.jarPath || ''} placeholder="尚未配置，請選擇 freej2me.jar" />
                    <button className="btn btn-secondary" onClick={handlePickJar}>選擇</button>
                  </div>
                </div>

                <FreeJ2MEPlusConfig
                  context="emulator"
                  caps={freeCaps || {}}
                  values={freeDefaults}
                  onChange={(partial) => {
                    if (partial && typeof partial === 'object') {
                      for (const [k, v] of Object.entries(partial)) updateFreeDefault(k, v);
                    }
                  }}
                  disabled={false}
                />
                <RomCacheSwitch
                  checked={emulators.freej2mePlus?.romCache ?? true}
                  onChange={(v) => { setEmulators(prev => ({ ...prev, freej2mePlus: { ...(prev.freej2mePlus || {}), romCache: v } })); setDirty(true); }}
                />
            </Collapsible>
          )}

          {/* KEmulator 區塊（可折疊） */}
          {emulatorList.some(e => e?.id === 'ke') && (
            <Collapsible
              className="mb-12"
              title={(emulatorList.find(e => e?.id === 'ke')?.name) || 'KEmulator'}
              open={keOpen}
              onToggle={() => setKeOpen(o => !o)}
            >
                <div className="form-row">
                  <label className="form-label">執行檔（KEmulator.jar）</label>
                  <div className="flex gap-8 items-center" style={{ width: '100%' }}>
                    <input className="form-input" type="text" readOnly value={emulators.ke?.jarPath || ''} placeholder="尚未配置，請選擇 KEmulator.jar" />
                    <button
                      className="btn btn-secondary"
                      onClick={async () => {
                        const p = await window.electronAPI.pickEmulatorBinary('ke');
                        if (p) {
                          setEmulators(prev => ({ ...prev, ke: { ...(prev.ke || {}), jarPath: p } }));
                          setDirty(true);
                        }
                      }}
                    >選擇</button>
                  </div>
                </div>
                <RomCacheSwitch
                  checked={emulators.ke?.romCache ?? true}
                  onChange={(v) => { setEmulators(prev => ({ ...prev, ke: { ...(prev.ke || {}), romCache: v } })); setDirty(true); }}
                />
                <div className="hint text-12 text-secondary">
                  Kemnnx 暫不支援自訂參數啟動，請在其 GUI 内設定。
                </div>
            </Collapsible>
          )}
          {/* Libretro 區塊（可折疊） */}
          {(emulatorList.some(e => e?.id === 'libretro') || !emulatorList.length) && (
            <Collapsible
              className="mb-12"
              title={(emulatorList.find(e => e?.id === 'libretro')?.name) || 'Libretro'}
              open={libretroOpen}
              onToggle={() => setLibretroOpen(o => !o)}
            >
                <div className="form-row">
                  <label className="form-label">執行檔（retroarch.exe）</label>
                  <div className="flex gap-8 items-center" style={{ width: '100%' }}>
                    <input className="form-input" type="text" readOnly value={emulators.libretro?.retroarchPath || ''} placeholder="尚未配置，請選擇 retroarch.exe" />
                    <button
                      className="btn btn-secondary"
                      onClick={async () => {
                        const p = await window.electronAPI.pickEmulatorBinary('libretro-exe');
                        if (p) {
                          setEmulators(prev => ({ ...prev, libretro: { ...(prev.libretro || {}), retroarchPath: p } }));
                          setDirty(true);
                        }
                      }}
                    >選擇</button>
                  </div>
                </div>
                <div className="form-row">
                  <label className="form-label">核心（freej2me_libretro.dll）</label>
                  <div className="flex gap-8 items-center" style={{ width: '100%' }}>
                    <input className="form-input" type="text" readOnly value={emulators.libretro?.corePath || ''} placeholder="尚未配置，請選擇 libretro 核心 .dll" />
                    <button
                      className="btn btn-secondary"
                      onClick={async () => {
                        const p = await window.electronAPI.pickEmulatorBinary('libretro-core');
                        if (p) {
                          setEmulators(prev => ({ ...prev, libretro: { ...(prev.libretro || {}), corePath: p } }));
                          setDirty(true);
                        }
                      }}
                    >選擇</button>
                  </div>
                </div>
                <RomCacheSwitch
                  checked={emulators.libretro?.romCache ?? false}
                  onChange={(v) => { setEmulators(prev => ({ ...prev, libretro: { ...(prev.libretro || {}), romCache: v } })); setDirty(true); }}
                />
                <div className="hint text-12 text-secondary">
                Libretro Core 暫不支援自訂參數啟動，請在其 GUI 内設定。
                </div>
            </Collapsible>
          )}
          <div className="section" style={{ opacity: 0.6, marginTop: 12 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>？？？</h3>
            <div className="hint" style={{ fontSize: 12 }}>？？？？？？</div>
          </div>
        </div>
    </ModalWithFooter>

    {/* 二級確認 Modal：變更模擬器路徑且影響備份時的警告 */}
    <ModalWithFooter
      isOpen={showPathChangeWarn}
      onClose={() => setShowPathChangeWarn(false)}
      title="注意"
      size="sm"
      actions={[
        { key: 'cancel', label: '取消', variant: 'secondary', onClick: () => setShowPathChangeWarn(false) },
        { key: 'proceed', label: '繼續保存', variant: 'primary', onClick: async () => { setShowPathChangeWarn(false); await doSave(); } }
      ]}
    >
      <div className="modal-body">
        <div className="mb-8">您正修改『模擬器執行檔』路徑。</div>
        <br/>
        <ul className="mb-8" style={{ paddingLeft: 18 }}>
          {warnFlagsRef.current.rmsOn ? (<li>已啟用「RMS 存檔」備份</li>) : null}
          {warnFlagsRef.current.emuCfgOn ? (<li>已啟用「模擬器配置檔」備份</li>) : null}
        </ul>
        <br/>
        <div className="mb-8">若更改路徑，可能致使備份和恢復的路徑存在偏差。</div>
        <div>是否仍要保存這次變更？</div>
      </div>
    </ModalWithFooter>
  </>);
}

export default EmulatorConfigDialog;
