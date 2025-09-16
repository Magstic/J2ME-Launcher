import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../DirectoryManager.css';
import { Card, Collapsible, ModalWithFooter, Select } from '@ui';
import { FreeJ2MEPlusConfig, KEmulator, LibretroFJPlus } from '@components';
import { useTranslation } from '@hooks/useTranslation'

// 首次啟動彈窗：選擇使用全局預設或自訂當前遊戲參數
function GameLaunchDialog({ isOpen, game, onClose, onSavedAndLaunch, configureOnly = false, zIndex = 10000 }) {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  // 自訂名稱狀態
  const [customName, setCustomName] = useState('');
  const [customVendor, setCustomVendor] = useState('');
  const [useGlobal, setUseGlobal] = useState(true);
  const [params, setParams] = useState({
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
    spdhacknoalpha: 'off'
  });
  const [globalDefaults, setGlobalDefaults] = useState(params);
  const [freeOpen, setFreeOpen] = useState(true);
  const [emulator, setEmulator] = useState('freej2mePlus'); // 預設 FreeJ2ME-Plus
  const [emulatorList, setEmulatorList] = useState([]);
  const modalRef = useRef(null);
  // Per-emulator ROM cache toggles (per-game override). Defaults: Free/KE ON, Libretro OFF
  const [freeRomCache, setFreeRomCache] = useState(true);
  const [keRomCache, setKeRomCache] = useState(true);
  const [libretroRomCache, setLibretroRomCache] = useState(false);
  // Collapsible states for KE and Libretro
  const [keOpen, setKeOpen] = useState(true);
  const [libretroOpen, setLibretroOpen] = useState(true);
  const requestCloseRef = React.useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const focusablesRef = useRef([]);
  const selectedEmu = useMemo(() => (emulatorList || []).find(e => e?.id === emulator) || null, [emulatorList, emulator]);
  const selectedCaps = selectedEmu?.capabilities || {};
  const [schema, setSchema] = useState(null);
  const emulatorOptions = useMemo(() => (
    (emulatorList && emulatorList.length ? emulatorList : [
      { id: 'freej2mePlus', name: 'FreeJ2ME-Plus(AWT)' },
      { id: 'ke', name: 'KEmulator nnmod' },
      { id: 'libretro', name: 'Libretro Core(FreeJ2ME-Plus)' },
    ]).map(opt => ({ value: opt.id, label: opt.name }))
  ), [emulatorList]);

  // 當前選擇的模擬器若支援 per-game params，嘗試取得 Schema（目前支援 FreeJ2ME-Plus）
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (isOpen && selectedCaps?.perGameParams) {
          const sc = await window.electronAPI.getEmulatorSchema(emulator);
          if (mounted) setSchema(sc || null);
        } else {
          if (mounted) setSchema(null);
        }
      } catch (e) {
        if (mounted) setSchema(null);
      }
    })();
    return () => { mounted = false; };
  }, [isOpen, emulator, selectedCaps?.perGameParams]);

  // 固定解析度選項（取值寫入 width/height）
  const RES_OPTIONS = useMemo(() => [
    '96x65','101x64','101x80','128x128','130x130','120x160','128x160','132x176','176x208','176x220','220x176','208x208','180x320','320x180','208x320','240x320','320x240','240x400','400x240','240x432','240x480','360x360','352x416','360x640','640x360','640x480','480x800','800x480'
  ], []);
  
  const SCALE_OPTIONS = [1,2,3,4,5];
  const FPS_OPTIONS = [60,55,50,45,40,35,30,25,20,15,10];

  const rebuildFocusables = () => {
    try {
      const root = modalRef.current;
      if (!root) return;
      const raw = [
        ...Array.from(root.querySelectorAll('.modal-header .modal-close-btn')),
        ...Array.from(root.querySelectorAll('.modal-body .form-row select')),
        ...Array.from(root.querySelectorAll('.modal-body .form-row input')),
        ...Array.from(root.querySelectorAll('.modal-body .form-row button')),
        ...Array.from(root.querySelectorAll('.modal-body .radio-group label')),
        ...Array.from(root.querySelectorAll('.modal-body label.toggle-switch')),
        ...Array.from(root.querySelectorAll('.modal-body .section-header')),
        ...Array.from(root.querySelectorAll('.modal-footer button')),
      ];
      const list = raw.filter(el => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (el.tagName.toLowerCase() === 'input') {
          const type = el.getAttribute('type') || 'text';
          if (type === 'hidden') return false;
        }
        return true;
      });
      // 去重並保留原始順序
      const seen = new Set();
      const dedup = [];
      for (const el of list) {
        if (!seen.has(el)) { seen.add(el); dedup.push(el); }
      }
      focusablesRef.current = dedup;
      if (dedup.length) {
        if (activeIndex >= dedup.length) setActiveIndex(dedup.length - 1);
      }
    } catch {}
  };

  // 狀態變更時重建可聚焦元素（影響可見/可用項目）
  useEffect(() => {
    if (!isOpen) return;
    rebuildFocusables();
  }, [isOpen, freeOpen, useGlobal, emulator]);

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
          let idx = list.findIndex(el => el.tagName?.toLowerCase() === 'select');
          if (idx < 0) idx = list.findIndex(el => el.tagName?.toLowerCase() === 'input' && !el.readOnly);
          if (idx < 0) idx = list.findIndex(el => !el.classList.contains('modal-close-btn'));
          if (idx < 0) idx = 0;
          setActiveIndex(idx);
          try { list[idx].focus(); } catch {}
        }
      }, 0);
      (async () => {
        try {
          // 動態讀取可用模擬器清單
          const listed = await window.electronAPI.listEmulators();
          setEmulatorList(Array.isArray(listed) ? listed : []);

          const emu = await window.electronAPI.getEmulatorConfig();
          // 與內建基線合併，避免舊版全局預設缺少新欄位導致 UI 退回到第一個選項（如 -4/off）
          const defaults = { ...params, ...((emu && emu.freej2mePlus && emu.freej2mePlus.defaults) || {}) };
          setGlobalDefaults(defaults);
          // Initialize ROM cache defaults from global config
          const globalFreeRom = (emu && emu.freej2mePlus && typeof emu.freej2mePlus.romCache === 'boolean') ? emu.freej2mePlus.romCache : true;
          const globalKeRom = (emu && emu.ke && typeof emu.ke.romCache === 'boolean') ? emu.ke.romCache : true;
          const globalLibretroRom = (emu && emu.libretro && typeof emu.libretro.romCache === 'boolean') ? emu.libretro.romCache : false;

          // 嘗試讀取該遊戲的已保存模擬器配置
          let selectedEmulator = 'freej2mePlus';
          let nextUseGlobal = true;
          let nextParams = defaults;
          if (game?.filePath) {
            try {
              const perGame = await window.electronAPI.getGameEmulatorConfig(game.filePath);
              if (perGame) {
                const sel = perGame.emulator || perGame.selectedEmulator || 'freej2mePlus';
                selectedEmulator = (sel === 'kemulator') ? 'ke' : sel;
                const pgFree = perGame.freej2mePlus || {};
                const useGlob = !(pgFree && pgFree.useGlobal === false);
                nextUseGlobal = useGlob;
                nextParams = useGlob ? defaults : { ...defaults, ...(pgFree.params || {}) };
                // per-game ROM cache overrides
                if (pgFree && typeof pgFree.romCache === 'boolean') setFreeRomCache(pgFree.romCache);
                if (perGame.ke && typeof perGame.ke.romCache === 'boolean') setKeRomCache(perGame.ke.romCache);
                if (perGame.libretro && typeof perGame.libretro.romCache === 'boolean') setLibretroRomCache(perGame.libretro.romCache);
              }
            } catch (_) {}
          }
          // If no per-game overrides, fall back to globals
          if (typeof freeRomCache !== 'boolean') setFreeRomCache(globalFreeRom);
          if (typeof keRomCache !== 'boolean') setKeRomCache(globalKeRom);
          if (typeof libretroRomCache !== 'boolean') setLibretroRomCache(globalLibretroRom);

          // 若所選模擬器不在清單中，回退到第一個可用者
          if (Array.isArray(listed) && listed.length) {
            const exists = listed.some(e => e?.id === selectedEmulator);
            if (!exists) selectedEmulator = listed[0].id;
          }

          setParams(nextParams);
          setUseGlobal(nextUseGlobal);
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
  }, [freeOpen, useGlobal, emulator, isOpen, activeIndex]);


  if (!isOpen) return null;

  const focusAt = (idx) => {
    const list = focusablesRef.current;
    if (!list || !list.length) return;
    const clamped = Math.max(0, Math.min(idx, list.length - 1));
    setActiveIndex(clamped);
    try {
      const el = list[clamped];
      el.focus();
      // 讓目標在模態視窗中可見
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } catch {}
  };

  // 簡化版：不做左右調整，僅上下移動與 A 互動

  const activateCurrent = () => {
    const el = focusablesRef.current[activeIndex];
    if (!el) return;
    const tag = (el.tagName || '').toLowerCase();
    const isLabel = el.tagName === 'LABEL' || el.getAttribute('role') === 'button';
    // 若是 SECTION HEADER：展開/收合
    if (el.classList.contains('section-header')) {
      try { el.click(); } catch {}
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
      try { el.click(); } catch {}
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
      try { el.click(); } catch {}
      return;
    }
    // BUTTON：點擊
    if (tag === 'button') {
      try { el.click(); } catch {}
      return;
    }
    // 其他：嘗試 click
    try { el.click(); } catch {}
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
        freej2mePlus: { useGlobal: !!useGlobal, params: useGlobal ? {} : params, romCache: freeRomCache },
        ke: { romCache: keRomCache },
        libretro: { romCache: libretroRomCache }
      };
      await window.electronAPI.setGameEmulatorConfig(game.filePath, cfg);
      // 需要在「配置」時立即更新 game.conf 的分辨率（首次啟動不寫入）
      if (configureOnly) {
        const effective = useGlobal ? globalDefaults : params;
        try {
          await window.electronAPI.updateFreej2meGameConf(game.filePath, effective);
        } catch (e) {
          console.warn('更新 game.conf 失敗（忽略不中斷）：', e);
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
        { key: 'cancel', label: t('app.cancel'), variant: 'secondary', onClick: () => requestCloseRef.current && requestCloseRef.current() },
        { key: 'save', label: configureOnly ? t('app.save') : t('app.add'), variant: 'primary', onClick: () => handleSaveAndLaunch(), disabled: loading, allowFocusRing: true },
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
        <div className="form-row" style={{ display: selectedCaps?.perGameParams ? undefined : 'none' }}>
          <label className="form-label">{t('emulatorConfig.params')}</label>
          <div className="radio-group">
            <label className={`radio-option ${useGlobal ? 'checked' : ''}`} tabIndex={0} role="button">
              <input className="radio-input" type="radio" name="useGlobal" checked={useGlobal} onChange={() => setUseGlobal(true)} />
              {t('emulatorConfig.default')}
            </label>
            <label className={`radio-option ${!useGlobal ? 'checked' : ''}`} tabIndex={0} role="button">
              <input className="radio-input" type="radio" name="useGlobal" checked={!useGlobal} onChange={() => setUseGlobal(false)} />
              {t('emulatorConfig.custom')}
            </label>
          </div>
        </div>

        {emulator === 'freej2mePlus' && (
            <Collapsible
              className="mb-12"
              title={`FreeJ2ME-Plus ${t('emulatorConfig.emuParams')}`}
              open={freeOpen}
              onToggle={() => setFreeOpen(o => !o)}
            >
              <FreeJ2MEPlusConfig
                context="game"
                caps={selectedCaps || {}}
                values={useGlobal ? globalDefaults : params}
                onChange={(partial) => setParams(p => ({ ...p, ...partial }))}
                disabled={useGlobal}
                romCache={freeRomCache}
                onRomCacheChange={setFreeRomCache}
                romCacheDisabled={false}
              />
              <div className="hint text-12 text-secondary mt-8">
                {t('emulatorConfig.saveHint')}
              </div>
            </Collapsible>
          )}

          {/* KEmulator per-game section */}
          {emulator === 'ke' && (
            <Collapsible
              className="mb-12"
              title={`KEmulator nnmod ${t('emulatorConfig.emuParams')}`}
              open={keOpen}
              onToggle={() => setKeOpen(o => !o)}
            >
              <KEmulator romCache={keRomCache} onRomCacheChange={setKeRomCache} disabled={false} />
            </Collapsible>
          )}

          {/* Libretro per-game section */}
          {emulator === 'libretro' && (
            <Collapsible
              className="mb-12"
              title={`Libretro Core（FreeJ2ME-Plus） ${t('emulatorConfig.emuParams')}`}
              open={libretroOpen}
              onToggle={() => setLibretroOpen(o => !o)}
            >
              <LibretroFJPlus romCache={libretroRomCache} onRomCacheChange={setLibretroRomCache} disabled={false} />
            </Collapsible>
          )}
      </div>
    </ModalWithFooter>
  );
}

export default GameLaunchDialog;
