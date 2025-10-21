import React, { useEffect, useMemo, useRef, useState } from 'react';
import './DirectoryManager.css';
import { Collapsible, ModalWithFooter, RomCacheSwitch } from '@ui';
import { FreeJ2MEPlusConfig } from '@components';
import { useTranslation } from '@hooks/useTranslation';

function EmulatorConfigDialog({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [emulatorList, setEmulatorList] = useState([]);
  const [emulators, setEmulators] = useState({
    freej2mePlus: {
      jarPath: '',
      romCache: true,
      defaults: { fullscreen: 0, width: 240, height: 320, scale: 2, keyLayout: 0, framerate: 60 },
    },
    ke: { jarPath: '', romCache: true },
    libretro: { retroarchPath: '', corePath: '', romCache: false },
    squirreljme: { jarPath: '', romCache: true },
  });
  const [dirty, setDirty] = useState(false);
  const [freeOpen, setFreeOpen] = useState(false);
  const [keOpen, setKeOpen] = useState(false);
  const [libretroOpen, setLibretroOpen] = useState(false);
  const [squirrelOpen, setSquirrelOpen] = useState(false);
  const [showPathChangeWarn, setShowPathChangeWarn] = useState(false);
  const warnFlagsRef = useRef({ rmsOn: false, emuCfgOn: false });
  const originalPathsRef = useRef({ freeJar: '', keJar: '', retroarch: '', squirrelJar: '' });
  const freeDefaults = useMemo(() => emulators.freej2mePlus?.defaults || {}, [emulators]);
  const freeAdapter = useMemo(
    () => (emulatorList || []).find((e) => e?.id === 'freej2mePlus') || null,
    [emulatorList]
  );
  const freeCaps = freeAdapter?.capabilities || {};
  //（已改用 FreeJ2MEPlusConfig 統一渲染選項，移除本地常數）

  // 內建基線（與 GameLaunchDialog 的 params 初始值一致）
  const BASE_DEFAULTS = useMemo(
    () => ({
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
      spdhacknoalpha: 'off',
    }),
    []
  );

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
          retroarch: (emu && emu.libretro && emu.libretro.retroarchPath) || '',
          squirrelJar: (emu && emu.squirreljme && emu.squirreljme.jarPath) || '',
        };
        setEmulators((prev) => ({
          ...prev,
          freej2mePlus: {
            jarPath:
              (emu && emu.freej2mePlus && emu.freej2mePlus.jarPath) ||
              prev.freej2mePlus?.jarPath ||
              '',
            romCache:
              emu && emu.freej2mePlus && typeof emu.freej2mePlus.romCache === 'boolean'
                ? emu.freej2mePlus.romCache
                : typeof prev.freej2mePlus?.romCache === 'boolean'
                  ? prev.freej2mePlus.romCache
                  : true,
            defaults: prev.freej2mePlus?.defaults || BASE_DEFAULTS,
          },
          ke: {
            jarPath: (emu && emu.ke && emu.ke.jarPath) || prev.ke?.jarPath || '',
            romCache:
              emu && emu.ke && typeof emu.ke.romCache === 'boolean'
                ? emu.ke.romCache
                : typeof prev.ke?.romCache === 'boolean'
                  ? prev.ke.romCache
                  : true,
          },
          libretro: {
            retroarchPath:
              (emu && emu.libretro && emu.libretro.retroarchPath) ||
              prev.libretro?.retroarchPath ||
              '',
            corePath:
              (emu && emu.libretro && emu.libretro.corePath) || prev.libretro?.corePath || '',
            romCache:
              emu && emu.libretro && typeof emu.libretro.romCache === 'boolean'
                ? emu.libretro.romCache
                : typeof prev.libretro?.romCache === 'boolean'
                  ? prev.libretro.romCache
                  : false,
          },
          squirreljme: {
            jarPath:
              (emu && emu.squirreljme && emu.squirreljme.jarPath) ||
              prev.squirreljme?.jarPath ||
              '',
            romCache:
              emu && emu.squirreljme && typeof emu.squirreljme.romCache === 'boolean'
                ? emu.squirreljme.romCache
                : typeof prev.squirreljme?.romCache === 'boolean'
                  ? prev.squirreljme.romCache
                  : true,
          },
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
            retroarch: (cfg && cfg.libretro && cfg.libretro.retroarchPath) || '',
            squirrelJar: (cfg && cfg.squirreljme && cfg.squirreljme.jarPath) || '',
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
    setEmulators((prev) => ({
      ...prev,
      freej2mePlus: {
        ...(prev.freej2mePlus || {}),
        [field]: value,
      },
    }));
    setDirty(true);
  };

  const updateFreeDefault = (field, value) => {
    setEmulators((prev) => ({
      ...prev,
      freej2mePlus: {
        ...(prev.freej2mePlus || {}),
        defaults: {
          ...((prev.freej2mePlus && prev.freej2mePlus.defaults) || {}),
          [field]: value,
        },
      },
    }));
    setDirty(true);
  };

  // 通用自動保存函數
  const autoSaveConfig = async (emulatorType, field, value) => {
    try {
      const currentConfig = {
        freej2mePlus: {
          jarPath: emulators.freej2mePlus?.jarPath || '',
          romCache:
            typeof emulators.freej2mePlus?.romCache === 'boolean'
              ? emulators.freej2mePlus.romCache
              : true,
          defaults: freeDefaults,
        },
        ke: {
          jarPath: emulators.ke?.jarPath || '',
          romCache: typeof emulators.ke?.romCache === 'boolean' ? emulators.ke.romCache : true,
        },
        libretro: {
          retroarchPath: emulators.libretro?.retroarchPath || '',
          corePath: emulators.libretro?.corePath || '',
          romCache:
            typeof emulators.libretro?.romCache === 'boolean' ? emulators.libretro.romCache : false,
        },
        squirreljme: {
          jarPath: emulators.squirreljme?.jarPath || '',
          romCache:
            typeof emulators.squirreljme?.romCache === 'boolean'
              ? emulators.squirreljme.romCache
              : true,
        },
      };

      // 更新指定的配置項
      if (emulatorType === 'freej2mePlus') {
        currentConfig.freej2mePlus[field] = value;
      } else if (emulatorType === 'ke') {
        currentConfig.ke[field] = value;
      } else if (emulatorType === 'libretro') {
        currentConfig.libretro[field] = value;
      } else if (emulatorType === 'squirreljme') {
        currentConfig.squirreljme[field] = value;
      }

      await window.electronAPI.setEmulatorConfig(currentConfig);
      console.log(`[DEBUG] ${emulatorType} ${field} 已自動保存:`, value);
    } catch (e) {
      console.error(`自動保存 ${emulatorType} 配置失敗:`, e);
    }
  };

  const handlePickJar = async () => {
    const path = await window.electronAPI.pickEmulatorBinary('freej2mePlus');
    if (path) {
      updateFreeField('jarPath', path);
      await autoSaveConfig('freej2mePlus', 'jarPath', path);
    }
  };

  const handlePickSquirrelJar = async () => {
    const p = await window.electronAPI.pickEmulatorBinary('squirreljme');
    if (p) {
      setEmulators((prev) => ({
        ...prev,
        squirreljme: { ...(prev.squirreljme || {}), jarPath: p },
      }));
      setDirty(true);
      await autoSaveConfig('squirreljme', 'jarPath', p);
    }
  };

  const doSave = async () => {
    try {
      setLoading(true);
      await window.electronAPI.setEmulatorConfig({
        freej2mePlus: {
          jarPath: emulators.freej2mePlus?.jarPath || '',
          romCache:
            typeof emulators.freej2mePlus?.romCache === 'boolean'
              ? emulators.freej2mePlus.romCache
              : true,
          defaults: freeDefaults,
        },
        ke: {
          jarPath: emulators.ke?.jarPath || '',
          romCache: typeof emulators.ke?.romCache === 'boolean' ? emulators.ke.romCache : true,
        },
        libretro: {
          retroarchPath: emulators.libretro?.retroarchPath || '',
          corePath: emulators.libretro?.corePath || '',
          romCache:
            typeof emulators.libretro?.romCache === 'boolean' ? emulators.libretro.romCache : false,
        },
        squirreljme: {
          jarPath: emulators.squirreljme?.jarPath || '',
          romCache:
            typeof emulators.squirreljme?.romCache === 'boolean'
              ? emulators.squirreljme.romCache
              : true,
        },
      });
      // 保存成功後，同步原始路徑基準
      originalPathsRef.current = {
        freeJar: emulators.freej2mePlus?.jarPath || '',
        keJar: emulators.ke?.jarPath || '',
        retroarch: emulators.libretro?.retroarchPath || '',
        squirrelJar: emulators.squirreljme?.jarPath || '',
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
      let rmsOn = false,
        emuCfgOn = false;
      try {
        const raw = localStorage.getItem('backup.selectedGroups');
        if (raw) {
          const parsed = JSON.parse(raw);
          rmsOn = !!parsed?.rms;
          emuCfgOn = !!parsed?.emuConfig;
        }
      } catch (_) {}

      const freeChanged =
        (emulators.freej2mePlus?.jarPath || '') !== (originalPathsRef.current.freeJar || '');
      const keChanged = (emulators.ke?.jarPath || '') !== (originalPathsRef.current.keJar || '');
      const retroChanged =
        (emulators.libretro?.retroarchPath || '') !== (originalPathsRef.current.retroarch || '');
      const squirrelChanged =
        (emulators.squirreljme?.jarPath || '') !== (originalPathsRef.current.squirrelJar || '');
      const pathsChanged = freeChanged || keChanged || retroChanged || squirrelChanged;

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
        onChange={(e) => onChange(parseInt(e.target.value || '0', 10))}
        {...props}
      />
    </div>
  );

  const requestCloseRef = React.useRef(null);

  return (
    <>
      <ModalWithFooter
        isOpen={isOpen}
        onClose={onClose}
        title={t('emulatorConfig.title')}
        size="md"
        requestCloseRef={requestCloseRef}
        actions={[
          {
            key: 'cancel',
            label: t('app.cancel'),
            variant: 'secondary',
            onClick: () => requestCloseRef.current && requestCloseRef.current(),
          },
          {
            key: 'save',
            label: t('app.save'),
            variant: 'primary',
            onClick: handleSave,
            disabled: loading || !dirty,
            allowFocusRing: true,
          },
        ]}
      >
        <>
          {/* FreeJ2ME-Plus 區塊（可折疊） */}
          {emulatorList.some((e) => e?.id === 'freej2mePlus') && (
            <Collapsible
              className="mb-12"
              title={emulatorList.find((e) => e?.id === 'freej2mePlus')?.name || 'FreeJ2ME-Plus'}
              open={freeOpen}
              onToggle={() => setFreeOpen((o) => !o)}
            >
              {freeCaps?.requiresGameConf && (
                <div className="hint text-12 text-secondary mb-8">
                  {t('emulatorConfig.freej2mePlus.hint')}
                </div>
              )}
              <div className="form-row">
                <label className="form-label">{t('emulatorConfig.freej2mePlus.jarPath')}</label>
                <div className="flex gap-8 items-center" style={{ width: '100%' }}>
                  <input
                    className="form-input"
                    type="text"
                    readOnly
                    value={emulators.freej2mePlus?.jarPath || ''}
                    placeholder={t('emulatorConfig.freej2mePlus.placeholder')}
                  />
                  <button className="btn btn-secondary" onClick={handlePickJar}>
                    {t('app.select')}
                  </button>
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
                onChange={(v) => {
                  setEmulators((prev) => ({
                    ...prev,
                    freej2mePlus: { ...(prev.freej2mePlus || {}), romCache: v },
                  }));
                  setDirty(true);
                }}
              />
            </Collapsible>
          )}

          {/* KEmulator 區塊（可折疊） */}
          {emulatorList.some((e) => e?.id === 'ke') && (
            <Collapsible
              className="mb-12"
              title={emulatorList.find((e) => e?.id === 'ke')?.name || 'KEmulator'}
              open={keOpen}
              onToggle={() => setKeOpen((o) => !o)}
            >
              <div className="form-row">
                <label className="form-label">{t('emulatorConfig.kemulator.jarPath')}</label>
                <div className="flex gap-8 items-center" style={{ width: '100%' }}>
                  <input
                    className="form-input"
                    type="text"
                    readOnly
                    value={emulators.ke?.jarPath || ''}
                    placeholder={t('emulatorConfig.kemulator.placeholder')}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      const p = await window.electronAPI.pickEmulatorBinary('ke');
                      if (p) {
                        setEmulators((prev) => ({
                          ...prev,
                          ke: { ...(prev.ke || {}), jarPath: p },
                        }));
                        setDirty(true);
                        await autoSaveConfig('ke', 'jarPath', p);
                      }
                    }}
                  >
                    {t('app.select')}
                  </button>
                </div>
              </div>
              <RomCacheSwitch
                checked={emulators.ke?.romCache ?? true}
                onChange={(v) => {
                  setEmulators((prev) => ({ ...prev, ke: { ...(prev.ke || {}), romCache: v } }));
                  setDirty(true);
                }}
              />
              <div className="hint text-12 text-secondary">
                {t('emulatorConfig.kemulator.hint')}
              </div>
            </Collapsible>
          )}

          {/* SquirrelJME 區塊（可折疊） */}
          {(emulatorList.some((e) => e?.id === 'squirreljme') || !emulatorList.length) && (
            <Collapsible
              className="mb-12"
              title={emulatorList.find((e) => e?.id === 'squirreljme')?.name || 'SquirrelJME'}
              open={squirrelOpen}
              onToggle={() => setSquirrelOpen((o) => !o)}
            >
              <div className="form-row">
                <label className="form-label">{t('emulatorConfig.squirreljme.jarPath')}</label>
                <div className="flex gap-8 items-center" style={{ width: '100%' }}>
                  <input
                    className="form-input"
                    type="text"
                    readOnly
                    value={emulators.squirreljme?.jarPath || ''}
                    placeholder={t('emulatorConfig.squirreljme.placeholder')}
                  />
                  <button className="btn btn-secondary" onClick={handlePickSquirrelJar}>
                    {t('app.select')}
                  </button>
                </div>
              </div>
              <RomCacheSwitch
                checked={emulators.squirreljme?.romCache ?? true}
                onChange={(v) => {
                  setEmulators((prev) => ({
                    ...prev,
                    squirreljme: { ...(prev.squirreljme || {}), romCache: v },
                  }));
                  setDirty(true);
                }}
              />
              <div className="hint text-12 text-secondary">
                {t('emulatorConfig.squirreljme.hint')}
              </div>
            </Collapsible>
          )}

          {/* Libretro 區塊（可折疊） */}
          {(emulatorList.some((e) => e?.id === 'libretro') || !emulatorList.length) && (
            <Collapsible
              className="mb-12"
              title={emulatorList.find((e) => e?.id === 'libretro')?.name || 'Libretro'}
              open={libretroOpen}
              onToggle={() => setLibretroOpen((o) => !o)}
            >
              <div className="form-row">
                <label className="form-label">
                  {t('emulatorConfig.libretroFJP.retroarchPath')}
                </label>
                <div className="flex gap-8 items-center" style={{ width: '100%' }}>
                  <input
                    className="form-input"
                    type="text"
                    readOnly
                    value={emulators.libretro?.retroarchPath || ''}
                    placeholder={t('emulatorConfig.libretroFJP.retroarchPlaceholder')}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      const p = await window.electronAPI.pickEmulatorBinary('libretro-exe');
                      if (p) {
                        setEmulators((prev) => ({
                          ...prev,
                          libretro: { ...(prev.libretro || {}), retroarchPath: p },
                        }));
                        setDirty(true);
                        await autoSaveConfig('libretro', 'retroarchPath', p);
                      }
                    }}
                  >
                    {t('app.select')}
                  </button>
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">{t('emulatorConfig.libretroFJP.corePath')}</label>
                <div className="flex gap-8 items-center" style={{ width: '100%' }}>
                  <input
                    className="form-input"
                    type="text"
                    readOnly
                    value={emulators.libretro?.corePath || ''}
                    placeholder={t('emulatorConfig.libretroFJP.corePlaceholder')}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      const p = await window.electronAPI.pickEmulatorBinary('libretro-core');
                      if (p) {
                        setEmulators((prev) => ({
                          ...prev,
                          libretro: { ...(prev.libretro || {}), corePath: p },
                        }));
                        setDirty(true);
                        await autoSaveConfig('libretro', 'corePath', p);
                      }
                    }}
                  >
                    {t('app.select')}
                  </button>
                </div>
              </div>
              <RomCacheSwitch
                checked={emulators.libretro?.romCache ?? false}
                onChange={(v) => {
                  setEmulators((prev) => ({
                    ...prev,
                    libretro: { ...(prev.libretro || {}), romCache: v },
                  }));
                  setDirty(true);
                }}
              />
              <div className="hint text-12 text-secondary">
                {t('emulatorConfig.libretroFJP.hint')}
              </div>
            </Collapsible>
          )}
          <div className="section" style={{ opacity: 0.6, marginTop: 12 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>？？？</h3>
            <div className="hint" style={{ fontSize: 12 }}>
              ？？？？？？
            </div>
          </div>
        </>
      </ModalWithFooter>

      {/* 二級確認 Modal：變更模擬器路徑且影響備份時的警告 */}
      <ModalWithFooter
        isOpen={showPathChangeWarn}
        onClose={() => setShowPathChangeWarn(false)}
        title={t('app.warning')}
        size="sm"
        actions={[
          {
            key: 'cancel',
            label: t('app.cancel'),
            variant: 'secondary',
            onClick: () => setShowPathChangeWarn(false),
          },
          {
            key: 'proceed',
            label: t('app.save'),
            variant: 'primary',
            onClick: async () => {
              setShowPathChangeWarn(false);
              await doSave();
            },
          },
        ]}
      >
        <>
          <div className="mb-8">{t('emulatorConfig.warn.pathChange1')}</div>
          <br />
          <ul className="mb-8" style={{ paddingLeft: 18 }}>
            {warnFlagsRef.current.rmsOn ? <li>{t('emulatorConfig.warn.rmsOn')}</li> : null}
            {warnFlagsRef.current.emuCfgOn ? <li>{t('emulatorConfig.warn.emuCfgOn')}</li> : null}
          </ul>
          <br />
          <div className="mb-8">{t('emulatorConfig.warn.pathChange2')}</div>
          <div>{t('emulatorConfig.warn.pathChange3')}</div>
        </>
      </ModalWithFooter>
    </>
  );
}

export default EmulatorConfigDialog;
