import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../DirectoryManager.css';
import { Card, Collapsible, ModalWithFooter, Select, RomCacheSwitch } from '@ui';
import { FreeJ2MEPlusConfig, KEmulator, LibretroFJPlus, FreeJ2MEZb3Config } from '@components';
import { useTranslation } from '@hooks/useTranslation';
import { useModalFocus } from '@hooks/useModalFocus';

// 首次啟動彈窗：選擇使用全局預設或自訂當前遊戲參數
function GameLaunchDialog({
  isOpen,
  game,
  onClose,
  onSavedAndLaunch,
  configureOnly = false,
  zIndex = 10000,
}) {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  // 自訂名稱狀態
  const [customName, setCustomName] = useState('');
  const [customVendor, setCustomVendor] = useState('');
  const plusBaseDefaults = {
    fullscreen: 0,
    width: 240,
    height: 320,
    scale: 2,
    keyLayout: 0,
    framerate: 60,
    // 相容性旗標：預設 compatoverrideplatchecks 為 on，其餘為 off
    compatfantasyzonefix: 'off',
    compatimmediaterepaints: 'off',
    compatoverrideplatchecks: 'on',
    compatsiemensfriendlydrawing: 'off',
    compattranstooriginonreset: 'off',
    // 額外參數
    backlightcolor: 'Disabled',
    fontoffset: '-2',
    rotate: '0',
    fpshack: 'Disabled',
    sound: 'on',
    spdhacknoalpha: 'off',
  };
  const [globalDefaults, setGlobalDefaults] = useState(plusBaseDefaults);
  const [perEmu, setPerEmu] = useState({
    freej2mePlus: { useGlobal: true, params: plusBaseDefaults, romCache: true },
    ke: { romCache: true },
    libretro: { romCache: false },
    squirreljme: { romCache: true },
    freej2meZb3: {
      useGlobal: true,
      params: { width: 240, height: 320, fps: 60, rotate: 'off', phone: 'Nokia', sound: 'on' },
      romCache: true,
    },
  });
  const [zb3Defaults, setZb3Defaults] = useState({
    width: 240,
    height: 320,
    fps: 60,
    rotate: 'off',
    phone: 'Nokia',
    sound: 'on',
  });
  const [freeOpen, setFreeOpen] = useState(true);
  const [emulator, setEmulator] = useState('freej2mePlus'); // 預設 FreeJ2ME-Plus
  const [emulatorList, setEmulatorList] = useState([]);
  const modalRef = useRef(null);
  // Per-emulator ROM cache toggles now managed in perEmu mapping
  // Collapsible states for KE / Libretro / SquirrelJME
  const [keOpen, setKeOpen] = useState(true);
  const [libretroOpen, setLibretroOpen] = useState(true);
  const [squirrelOpen, setSquirrelOpen] = useState(true);
  const [zb3Open, setZb3Open] = useState(true);
  const requestCloseRef = React.useRef(null);
  const {
    activeIndex,
    setActiveIndex,
    focusablesRef,
    rebuildFocusables,
    focusAt,
    focusFirstPreferred,
  } = useModalFocus(modalRef);
  const selectedEmu = useMemo(
    () => (emulatorList || []).find((e) => e?.id === emulator) || null,
    [emulatorList, emulator]
  );
  const selectedCaps = selectedEmu?.capabilities || {};
  const emulatorOptions = useMemo(
    () =>
      (emulatorList && emulatorList.length
        ? emulatorList
        : [
            { id: 'freej2mePlus', name: 'FreeJ2ME-Plus' },
            { id: 'ke', name: 'KEmulator nnmod' },
            { id: 'squirreljme', name: 'SquirrelJME' },
            { id: 'freej2meZb3', name: 'FreeJ2ME-ZB3' },
            { id: 'libretro', name: 'Libretro Core (FreeJ2ME-Plus)' },
          ]
      ).map((opt) => ({ value: opt.id, label: opt.name })),
    [emulatorList]
  );

  // 固定解析度選項（取值寫入 width/height）
  const RES_OPTIONS = useMemo(
    () => [
      '96x65',
      '101x64',
      '101x80',
      '128x128',
      '130x130',
      '120x160',
      '128x160',
      '132x176',
      '176x208',
      '176x220',
      '220x176',
      '208x208',
      '180x320',
      '320x180',
      '208x320',
      '240x320',
      '320x240',
      '240x400',
      '400x240',
      '240x432',
      '240x480',
      '360x360',
      '352x416',
      '360x640',
      '640x360',
      '640x480',
      '480x800',
      '800x480',
    ],
    []
  );

  const SCALE_OPTIONS = [1, 2, 3, 4, 5];
  const FPS_OPTIONS = [60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10];

  // 狀態變更時重建可聚焦元素（影響可見/可用項目）
  useEffect(() => {
    if (!isOpen) return;
    rebuildFocusables();
  }, [isOpen, freeOpen, emulator, perEmu]);

  // 初始化自訂名稱
  useEffect(() => {
    if (isOpen && game) {
      setCustomName(game.customName || '');
      setCustomVendor(game.customVendor || '');
    }
  }, [isOpen, game]);

  useEffect(() => {
    if (isOpen) {
      // 準備可聚焦元素清單
      setTimeout(() => {
        rebuildFocusables();
        const list = focusablesRef.current;
        if (list.length) {
          // 優先選擇第一個 select 或可編輯的 control，跳過關閉鈕與只讀輸入框
          let idx = list.findIndex((el) => el.tagName?.toLowerCase() === 'select');
          if (idx < 0)
            idx = list.findIndex((el) => el.tagName?.toLowerCase() === 'input' && !el.readOnly);
          if (idx < 0) idx = list.findIndex((el) => !el.classList.contains('modal-close-btn'));
          if (idx < 0) idx = 0;
          setActiveIndex(idx);
          try {
            list[idx].focus();
          } catch {}
        }
      }, 0);
      (async () => {
        try {
          // 動態讀取可用模擬器清單
          const listed = await window.electronAPI.listEmulators();
          setEmulatorList(Array.isArray(listed) ? listed : []);

          // 由主進程提供已合併的有效預設
          const respPlus = await window.electronAPI.getEmulatorDefaults('freej2mePlus');
          const effPlusDefaults = {
            ...plusBaseDefaults,
            ...((respPlus && respPlus.defaults) || {}),
          };
          setGlobalDefaults(effPlusDefaults);
          const respZb3 = await window.electronAPI.getEmulatorDefaults('freej2meZb3');
          const zb3Base = {
            width: 240,
            height: 320,
            fps: 60,
            rotate: 'off',
            phone: 'Nokia',
            sound: 'on',
            dgFormat: 'default',
            forceFullscreen: 'off',
            forceVolatileFields: 'off',
          };
          const effZb3Defaults = {
            ...zb3Base,
            ...((respZb3 && respZb3.defaults) || {}),
          };
          setZb3Defaults(effZb3Defaults);
          const emu = await window.electronAPI.getEmulatorConfig();
          // Initialize ROM cache defaults from global config
          const globalFreeRom =
            emu && emu.freej2mePlus && typeof emu.freej2mePlus.romCache === 'boolean'
              ? emu.freej2mePlus.romCache
              : true;
          const globalKeRom =
            emu && emu.ke && typeof emu.ke.romCache === 'boolean' ? emu.ke.romCache : true;
          const globalLibretroRom =
            emu && emu.libretro && typeof emu.libretro.romCache === 'boolean'
              ? emu.libretro.romCache
              : false;
          const globalSquirrelRom =
            emu && emu.squirreljme && typeof emu.squirreljme.romCache === 'boolean'
              ? emu.squirreljme.romCache
              : true;
          const globalZb3Rom =
            emu && emu.freej2meZb3 && typeof emu.freej2meZb3.romCache === 'boolean'
              ? emu.freej2meZb3.romCache
              : true;

          // 嘗試讀取該遊戲的已保存模擬器配置
          let selectedEmulator = 'freej2mePlus';
          // 初始化每模擬器映射（先填入全局/預設）
          let nextPerEmu = {
            freej2mePlus: { useGlobal: true, params: effPlusDefaults, romCache: globalFreeRom },
            ke: { romCache: globalKeRom },
            libretro: { romCache: globalLibretroRom },
            squirreljme: { romCache: globalSquirrelRom },
            freej2meZb3: {
              useGlobal: true,
              params: { width: effZb3Defaults.width, height: effZb3Defaults.height },
              romCache: globalZb3Rom,
            },
          };
          if (game?.filePath) {
            try {
              const perGame = await window.electronAPI.getGameEmulatorConfig(game.filePath);
              if (perGame) {
                const sel = perGame.emulator || perGame.selectedEmulator || 'freej2mePlus';
                selectedEmulator = sel;
                // FreeJ2ME-Plus 覆寫（預設/自訂 + romCache）
                const pgFree = perGame.freej2mePlus || {};
                const useGlobFree = !(pgFree && pgFree.useGlobal === false);
                nextPerEmu.freej2mePlus.useGlobal = useGlobFree;
                nextPerEmu.freej2mePlus.params = useGlobFree
                  ? effPlusDefaults
                  : { ...effPlusDefaults, ...(pgFree.params || {}) };
                if (typeof pgFree.romCache === 'boolean')
                  nextPerEmu.freej2mePlus.romCache = pgFree.romCache;

                // ZB3 覆寫（預設/自訂 + romCache）
                const pgZb3 = perGame.freej2meZb3 || {};
                const useGlobZ = !(pgZb3 && pgZb3.useGlobal === false);
                nextPerEmu.freej2meZb3.useGlobal = useGlobZ;
                nextPerEmu.freej2meZb3.params = useGlobZ
                  ? effZb3Defaults
                  : { ...effZb3Defaults, ...(pgZb3.params || {}) };
                if (typeof pgZb3.romCache === 'boolean')
                  nextPerEmu.freej2meZb3.romCache = pgZb3.romCache;

                // 其他模擬器 romCache 覆寫
                if (perGame.ke && typeof perGame.ke.romCache === 'boolean')
                  nextPerEmu.ke.romCache = perGame.ke.romCache;
                if (perGame.libretro && typeof perGame.libretro.romCache === 'boolean')
                  nextPerEmu.libretro.romCache = perGame.libretro.romCache;
                if (perGame.squirreljme && typeof perGame.squirreljme.romCache === 'boolean')
                  nextPerEmu.squirreljme.romCache = perGame.squirreljme.romCache;
              }
            } catch (_) {}
          }
          // 套用初始化映射
          setPerEmu(nextPerEmu);

          // 若所選模擬器不在清單中，回退到第一個可用者
          if (Array.isArray(listed) && listed.length) {
            const exists = listed.some((e) => e?.id === selectedEmulator);
            if (!exists) selectedEmulator = listed[0].id;
          }
          setEmulator(selectedEmulator);
        } catch (_) {}
      })();
    }
  }, [isOpen]);

  // 內部區塊展開/禁用狀態變更時，重建可聚焦清單
  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => {
      rebuildFocusables();
    }, 0);
  }, [freeOpen, emulator, isOpen, activeIndex, perEmu]);

  if (!isOpen) return null;

  // 簡化版：不做左右調整，僅上下移動與 A 互動

  const activateCurrent = () => {
    const el = focusablesRef.current[activeIndex];
    if (!el) return;
    const tag = (el.tagName || '').toLowerCase();
    const isLabel = el.tagName === 'LABEL' || el.getAttribute('role') === 'button';
    // 若是 SECTION HEADER：展開/收合
    if (el.classList.contains('section-header')) {
      try {
        el.click();
      } catch {}
      return;
    }
    // 若是開關/單選的 label：觸發其中的 input
    if (isLabel) {
      const input = el.querySelector('input');
      if (input) {
        if (input.type === 'radio') {
          if (!input.checked) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return;
        }
        if (input.type === 'checkbox' && !input.disabled) {
          input.checked = !input.checked;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
      // 退化：直接 click
      try {
        el.click();
      } catch {}
      return;
    }
    // SELECT：嘗試滑鼠事件與鍵盤事件打開原生下拉
    if (tag === 'select') {
      try {
        el.focus();
        const opts = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        // 保險：再派發 Space 以兼容
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      } catch {}
      return;
    }
    // INPUT：若是 radio/checkbox，切換；否則 click
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'radio') {
        if (!el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      if (type === 'checkbox' && !el.disabled) {
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      try {
        el.click();
      } catch {}
      return;
    }
    // BUTTON：點擊
    if (tag === 'button') {
      try {
        el.click();
      } catch {}
      return;
    }
    // 其他：嘗試 click
    try {
      el.click();
    } catch {}
  };

  // 保存自訂名稱
  const handleSaveCustomNames = async () => {
    if (!game) return;
    try {
      const customData = {};
      if (customName !== (game.customName || '')) {
        customData.customName = customName || null;
      }
      if (customVendor !== (game.customVendor || '')) {
        customData.customVendor = customVendor || null;
      }

      if (Object.keys(customData).length > 0) {
        await window.electronAPI.updateCustomData(game.filePath, customData);
      }
    } catch (error) {
      console.error('保存自訂名稱失敗:', error);
    }
  };

  const handleSaveAndLaunch = async () => {
    if (!game) return;
    try {
      setLoading(true);

      // 先保存自訂名稱
      await handleSaveCustomNames();

      const cfg = {
        emulator,
        selectedEmulator: emulator, // for backward compatibility
        freej2mePlus: {
          useGlobal: !!(perEmu.freej2mePlus?.useGlobal ?? true),
          params: (perEmu.freej2mePlus?.useGlobal ?? true) ? {} : perEmu.freej2mePlus?.params || {},
          romCache: !!(perEmu.freej2mePlus?.romCache ?? true),
        },
        ke: { romCache: !!(perEmu.ke?.romCache ?? true) },
        libretro: { romCache: !!(perEmu.libretro?.romCache ?? false) },
        squirreljme: { romCache: !!(perEmu.squirreljme?.romCache ?? true) },
        freej2meZb3: {
          romCache: !!(perEmu.freej2meZb3?.romCache ?? true),
          ...(emulator === 'freej2meZb3'
            ? {
                useGlobal: !!(perEmu.freej2meZb3?.useGlobal ?? true),
                params:
                  (perEmu.freej2meZb3?.useGlobal ?? true)
                    ? {}
                    : {
                        width: Number.isFinite(parseInt(perEmu.freej2meZb3?.params?.width, 10))
                          ? parseInt(perEmu.freej2meZb3.params.width, 10)
                          : 240,
                        height: Number.isFinite(parseInt(perEmu.freej2meZb3?.params?.height, 10))
                          ? parseInt(perEmu.freej2meZb3.params.height, 10)
                          : 320,
                        fps: Number.isFinite(parseInt(perEmu.freej2meZb3?.params?.fps, 10))
                          ? parseInt(perEmu.freej2meZb3.params.fps, 10)
                          : 60,
                        rotate:
                          typeof perEmu.freej2meZb3?.params?.rotate === 'string'
                            ? perEmu.freej2meZb3.params.rotate
                            : 'off',
                        sound: String(perEmu.freej2meZb3?.params?.sound) === 'off' ? 'off' : 'on',
                        phone:
                          typeof perEmu.freej2meZb3?.params?.phone === 'string'
                            ? perEmu.freej2meZb3.params.phone
                            : 'Nokia',
                        dgFormat: ['default', '444', '4444', '565'].includes(
                          String(perEmu.freej2meZb3?.params?.dgFormat)
                        )
                          ? String(perEmu.freej2meZb3.params.dgFormat)
                          : 'default',
                        forceFullscreen:
                          String(perEmu.freej2meZb3?.params?.forceFullscreen) === 'on'
                            ? 'on'
                            : 'off',
                        forceVolatileFields:
                          String(perEmu.freej2meZb3?.params?.forceVolatileFields) === 'on'
                            ? 'on'
                            : 'off',
                      },
              }
            : {}),
        },
      };
      await window.electronAPI.setGameEmulatorConfig(game.filePath, cfg);
      // 需要在「配置」時立即更新 game.conf（統一由主進程 adapter.prepareGame 處理，不直接寫檔）
      if (configureOnly) {
        try {
          await window.electronAPI.prepareGameConf(game.filePath);
        } catch (e) {
          console.warn('準備 game.conf 失敗（忽略不中斷）：', e);
        }
      }

      if (!configureOnly) {
        onSavedAndLaunch && onSavedAndLaunch(game);
      }
      if (requestCloseRef.current) requestCloseRef.current();
    } catch (e) {
      console.error('保存遊戲配置失敗:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title={configureOnly ? t('emulatorConfig.gameConfig') : t('emulatorConfig.firstConfig')}
      size="md"
      contentRef={modalRef}
      requestCloseRef={requestCloseRef}
      zIndex={zIndex}
      actions={[
        {
          key: 'cancel',
          label: t('app.cancel'),
          variant: 'secondary',
          onClick: () => requestCloseRef.current && requestCloseRef.current(),
        },
        {
          key: 'save',
          label: configureOnly ? t('app.save') : t('app.add'),
          variant: 'primary',
          onClick: () => handleSaveAndLaunch(),
          disabled: loading,
          allowFocusRing: true,
        },
      ]}
    >
      <div>
        <div className="form-row">
          <label className="form-label">{t('game.name')}</label>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={game.originalName || game.gameName}
            className="form-input"
          />
        </div>
        <div className="form-row">
          <label className="form-label">{t('game.vendor')}</label>
          <input
            type="text"
            value={customVendor}
            onChange={(e) => setCustomVendor(e.target.value)}
            placeholder={game.originalVendor || game.vendor}
            className="form-input"
          />
        </div>
        <div className="form-row">
          <label className="form-label">{t('emulatorConfig.emulator')}</label>
          <Select
            value={emulator}
            onChange={setEmulator}
            options={emulatorOptions}
            placeholder={t('emulatorConfig.emulator')}
          />
        </div>
        <div
          className="form-row"
          style={{ display: selectedCaps?.perGameParams ? undefined : 'none' }}
        >
          <label className="form-label">{t('emulatorConfig.params')}</label>
          <div className="radio-group">
            <label
              className={`radio-option ${(perEmu[emulator]?.useGlobal ?? true) ? 'checked' : ''}`}
              tabIndex={0}
              role="button"
            >
              <input
                className="radio-input"
                type="radio"
                name="useGlobal"
                checked={perEmu[emulator]?.useGlobal ?? true}
                onChange={() =>
                  setPerEmu((m) => ({
                    ...m,
                    [emulator]: { ...(m[emulator] || {}), useGlobal: true },
                  }))
                }
              />
              {t('emulatorConfig.default')}
            </label>
            <label
              className={`radio-option ${!(perEmu[emulator]?.useGlobal ?? true) ? 'checked' : ''}`}
              tabIndex={0}
              role="button"
            >
              <input
                className="radio-input"
                type="radio"
                name="useGlobal"
                checked={!(perEmu[emulator]?.useGlobal ?? true)}
                onChange={() =>
                  setPerEmu((m) => ({
                    ...m,
                    [emulator]: { ...(m[emulator] || {}), useGlobal: false },
                  }))
                }
              />
              {t('emulatorConfig.custom')}
            </label>
          </div>
        </div>

        {emulator === 'freej2mePlus' && (
          <Collapsible
            className="mb-12"
            title={`FreeJ2ME-Plus ${t('emulatorConfig.emuParams')}`}
            open={freeOpen}
            onToggle={() => setFreeOpen((o) => !o)}
          >
            <FreeJ2MEPlusConfig
              context="game"
              caps={selectedCaps || {}}
              values={
                (perEmu.freej2mePlus?.useGlobal ?? true)
                  ? globalDefaults
                  : perEmu.freej2mePlus?.params || globalDefaults
              }
              onChange={(partial) =>
                setPerEmu((m) => ({
                  ...m,
                  freej2mePlus: {
                    ...(m.freej2mePlus || {}),
                    params: { ...(m.freej2mePlus?.params || {}), ...partial },
                  },
                }))
              }
              disabled={perEmu.freej2mePlus?.useGlobal ?? true}
              romCache={perEmu.freej2mePlus?.romCache ?? true}
              onRomCacheChange={(v) =>
                setPerEmu((m) => ({
                  ...m,
                  freej2mePlus: { ...(m.freej2mePlus || {}), romCache: !!v },
                }))
              }
              romCacheDisabled={false}
            />
            <div className="hint text-12 text-secondary mt-8">{t('emulatorConfig.saveHint')}</div>
          </Collapsible>
        )}

        {/* KEmulator per-game section */}
        {emulator === 'ke' && (
          <Collapsible
            className="mb-12"
            title={`KEmulator nnmod ${t('emulatorConfig.emuParams')}`}
            open={keOpen}
            onToggle={() => setKeOpen((o) => !o)}
          >
            <KEmulator
              romCache={perEmu.ke?.romCache ?? true}
              onRomCacheChange={(v) =>
                setPerEmu((m) => ({ ...m, ke: { ...(m.ke || {}), romCache: !!v } }))
              }
              disabled={false}
            />
          </Collapsible>
        )}

        {/* SquirrelJME per-game section */}
        {emulator === 'squirreljme' && (
          <Collapsible
            className="mb-12"
            title={`SquirrelJME ${t('emulatorConfig.emuParams')}`}
            open={squirrelOpen}
            onToggle={() => setSquirrelOpen((o) => !o)}
          >
            <RomCacheSwitch
              checked={perEmu.squirreljme?.romCache ?? true}
              onChange={(v) =>
                setPerEmu((m) => ({
                  ...m,
                  squirreljme: { ...(m.squirreljme || {}), romCache: !!v },
                }))
              }
              disabled={false}
            />
          </Collapsible>
        )}

        {emulator === 'freej2meZb3' && (
          <Collapsible
            className="mb-12"
            title={`FreeJ2ME-ZB3 ${t('emulatorConfig.emuParams')}`}
            open={zb3Open}
            onToggle={() => setZb3Open((o) => !o)}
          >
            <FreeJ2MEZb3Config
              values={
                (perEmu.freej2meZb3?.useGlobal ?? true)
                  ? { ...zb3Defaults }
                  : perEmu.freej2meZb3?.params || {
                      width: zb3Defaults.width,
                      height: zb3Defaults.height,
                      fps: zb3Defaults.fps,
                      rotate: zb3Defaults.rotate,
                      sound: zb3Defaults.sound,
                      phone: zb3Defaults.phone,
                      dgFormat: zb3Defaults.dgFormat || 'default',
                      forceFullscreen: zb3Defaults.forceFullscreen || 'off',
                      forceVolatileFields: zb3Defaults.forceVolatileFields || 'off',
                    }
              }
              onChange={(partial) =>
                setPerEmu((m) => ({
                  ...m,
                  freej2meZb3: {
                    ...(m.freej2meZb3 || {}),
                    params: { ...(m.freej2meZb3?.params || {}), ...partial },
                  },
                }))
              }
              disabled={perEmu.freej2meZb3?.useGlobal ?? true}
              romCache={perEmu.freej2meZb3?.romCache ?? true}
              onRomCacheChange={(v) =>
                setPerEmu((m) => ({
                  ...m,
                  freej2meZb3: { ...(m.freej2meZb3 || {}), romCache: !!v },
                }))
              }
              resOptions={RES_OPTIONS}
            />
            <div className="hint text-12 text-secondary mt-8">{t('emulatorConfig.saveHint')}</div>
          </Collapsible>
        )}

        {/* Libretro per-game section */}
        {emulator === 'libretro' && (
          <Collapsible
            className="mb-12"
            title={`Libretro Core（FreeJ2ME-Plus） ${t('emulatorConfig.emuParams')}`}
            open={libretroOpen}
            onToggle={() => setLibretroOpen((o) => !o)}
          >
            <LibretroFJPlus
              romCache={perEmu.libretro?.romCache ?? false}
              onRomCacheChange={(v) =>
                setPerEmu((m) => ({ ...m, libretro: { ...(m.libretro || {}), romCache: !!v } }))
              }
              disabled={false}
            />
          </Collapsible>
        )}
      </div>
    </ModalWithFooter>
  );
}

export default GameLaunchDialog;
