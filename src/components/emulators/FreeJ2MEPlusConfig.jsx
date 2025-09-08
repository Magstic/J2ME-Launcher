import React from 'react';
import { Card, RomCacheSwitch, Select, ToggleSwitch } from '@ui';
import { useTranslation } from '@hooks/useTranslation';

// FreeJ2ME-Plus configuration block used by both EmulatorConfig and GameLaunch dialogs.
// Renders exactly three cards (selects, assets, toggles) following the layout in EmulatorConfigDialog.
// Props:
// - context: 'emulator' | 'game' -> controls Assets rendering and import buttons
// - caps: { supportsAssets?: string[] } -> capabilities
// - values: object -> current values (width, height, scale, framerate, keyLayout, backlightcolor, fontoffset, rotate, fpshack, and various compat flags)
// - onChange: (partial: object) => void -> merge updater
// - disabled: boolean -> disable inputs (e.g., when useGlobal is true in game dialog)
export default function FreeJ2MEPlusConfig({ context = 'emulator', caps = {}, values = {}, onChange, disabled = false, romCache, onRomCacheChange, romCacheDisabled = false }) {
  const supportsAssets = Array.isArray(caps?.supportsAssets) ? caps.supportsAssets : [];
  const isEmu = context === 'emulator';

  const { t } = useTranslation();

  const RES_OPTIONS = [
    '96x65','101x64','101x80','128x128','130x130','120x160','128x160','132x176','176x208','176x220','220x176','208x208','180x320','320x180','208x320','240x320','320x240','240x400','400x240','240x432','240x480','360x360','352x416','360x640','640x360','640x480','480x800','800x480'
  ];
  const SCALE_OPTIONS = [1, 2, 3, 4, 5];
  const FPS_OPTIONS = [60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10];

  const getResValue = () => `${values.width ?? 240}x${values.height ?? 320}`;
  const setResValue = (val) => {
    const [w, h] = (val || '240x320').split('x').map(s => parseInt(s, 10));
    if (Number.isFinite(w) && Number.isFinite(h)) onChange?.({ width: w, height: h });
  };

  const setVal = (key, val) => onChange?.({ [key]: val });

  return (
    <>
      {/* Selects container */}
      <Card className="selects p-12 mb-12" variant="muted">
        <div className="grid-2">
          {/* 解析度（合併 width/height） */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.resolution')}</label>
            <Select
              value={getResValue()}
              onChange={setResValue}
              disabled={disabled}
              options={RES_OPTIONS.map(v => ({ value: v, label: v }))}
              placeholder="選擇解析度"
            />
          </div>
          {/* 縮放 scale */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.scale')}</label>
            <Select
              value={values.scale ?? 2}
              onChange={(v) => setVal('scale', parseInt(v, 10))}
              disabled={disabled}
              options={SCALE_OPTIONS.map(v => ({ value: v, label: String(v) }))}
              placeholder="選擇縮放"
            />
          </div>
          {/* 幀率 framerate */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.framerate')}</label>
            <Select
              value={values.framerate ?? 60}
              onChange={(v) => setVal('framerate', parseInt(v, 10))}
              disabled={disabled}
              options={FPS_OPTIONS.map(v => ({ value: v, label: `${v} FPS` }))}
              placeholder="選擇幀率"
            />
          </div>
          {/* 鍵位佈局 keyLayout */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.keyLayout')}</label>
            <Select
              value={values.keyLayout ?? 0}
              onChange={(v) => setVal('keyLayout', parseInt(v, 10))}
              disabled={disabled}
              options={[
                { value: 0, label: 'Default' },
                { value: 1, label: 'LG' },
                { value: 2, label: 'Motorola/Softbank' },
                { value: 3, label: 'Motorola Triplets' },
                { value: 4, label: 'Motorola V8' },
                { value: 5, label: 'Nokia Full Keyboard' },
                { value: 6, label: 'Sagem' },
                { value: 7, label: 'Siemens' },
                { value: 8, label: 'Sharp' },
                { value: 9, label: 'SKT' },
                { value: 10, label: 'KDDI' },
              ]}
              placeholder="選擇鍵位佈局"
            />
          </div>
          {/* 背光顔色 backlightcolor */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.backlightcolor')}</label>
            <Select
              value={values.backlightcolor ?? 'Disabled'}
              onChange={(v) => setVal('backlightcolor', v)}
              disabled={disabled}
              options={[
                { value: 'Disabled', label: t('emulatorConfig.freej2mePlus.bgcolor.disabled') },
                { value: 'Green', label: t('emulatorConfig.freej2mePlus.bgcolor.green') },
                { value: 'Cyan', label: t('emulatorConfig.freej2mePlus.bgcolor.cyan') },
                { value: 'Orange', label: t('emulatorConfig.freej2mePlus.bgcolor.orange') },
                { value: 'Violet', label: t('emulatorConfig.freej2mePlus.bgcolor.violet') },
                { value: 'Red', label: t('emulatorConfig.freej2mePlus.bgcolor.red') },
              ]}
              placeholder="選擇背光顏色"
            />
          </div>
          {/* 字體尺寸 fontoffset */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.fontoffset')}</label>
            <Select
              value={values.fontoffset ?? '-2'}
              onChange={(v) => setVal('fontoffset', v)}
              disabled={disabled}
              options={['-4','-3','-2','-1','0','1','2','3','4'].map(v => ({ value: v, label: `${v} pt` }))}
              placeholder="選擇字體尺寸"
            />
          </div>
          {/* 螢幕旋轉 rotate */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.rotate')}</label>
            <Select
              value={values.rotate ?? '0'}
              onChange={(v) => setVal('rotate', v)}
              disabled={disabled}
              options={[
                { value: '0', label: 'Disabled' },
                { value: '90', label: '90°' },
                { value: '180', label: '180°' },
                { value: '270', label: '270°' },
              ]}
              placeholder="選擇旋轉"
            />
          </div>
          {/* FPS HACK */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.fpshack')}</label>
            <Select
              value={values.fpshack ?? 'Disabled'}
              onChange={(v) => setVal('fpshack', v)}
              disabled={disabled}
              options={[
                { value: 'Disabled', label: 'Disabled' },
                { value: 'Safe', label: 'Safe' },
                { value: 'Extended', label: 'Extended' },
                { value: 'Aggressive', label: 'Aggressive' },
              ]}
              placeholder="選擇 FPS HACK"
            />
          </div>
        </div>
      </Card>

      {/* Assets container: emulator shows controls if supported; game shows note only */}
      {isEmu && supportsAssets.length > 0 ? (
          <Card className="assets p-12 mb-12" variant="muted">
            <div className="grid-2">
              {supportsAssets.includes('soundfont') && (
                <div className="form-row">
                  <label className="form-label">{t('emulatorConfig.freej2mePlus.sf2')}</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '1 1 auto' }}>
                    <ToggleSwitch
                      checked={(values.soundfont ?? 'Default') === 'Custom'}
                      onChange={(checked) => setVal('soundfont', checked ? 'Custom' : 'Default')}
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={disabled || (values.soundfont ?? 'Default') !== 'Custom'}
                      onClick={async () => {
                        try {
                          const src = await window.electronAPI.pickFreej2meAsset('soundfont');
                          if (!src) return;
                          const res = await window.electronAPI.importFreej2meAsset('soundfont', src);
                          if (!res?.success) console.warn('匯入音色庫失敗:', res?.error);
                        } catch (e) {
                          console.warn('選擇/匯入音色庫發生錯誤:', e);
                        }
                      }}
                    >{t('app.load')}</button>
                  </div>
                </div>
              )}
              {supportsAssets.includes('textfont') && (
                <div className="form-row">
                  <label className="form-label">{t('emulatorConfig.freej2mePlus.font')}</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '1 1 auto' }}>
                    <ToggleSwitch
                      checked={(values.textfont ?? 'Default') === 'Custom'}
                      onChange={(checked) => setVal('textfont', checked ? 'Custom' : 'Default')}
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={disabled || (values.textfont ?? 'Default') !== 'Custom'}
                      onClick={async () => {
                        try {
                          console.log('[DEBUG] 開始選擇文字字體檔案...');
                          const src = await window.electronAPI.pickFreej2meAsset('textfont');
                          console.log('[DEBUG] 選擇結果:', src);
                          if (!src) return;
                          console.log('[DEBUG] 開始匯入文字字體:', src);
                          const res = await window.electronAPI.importFreej2meAsset('textfont', src);
                          console.log('[DEBUG] 匯入結果:', res);
                          if (!res?.success) console.warn('匯入文字字體失敗:', res?.error);
                          else console.log('[DEBUG] 文字字體匯入成功');
                        } catch (e) {
                          console.error('[DEBUG] 選擇/匯入文字字體發生錯誤:', e);
                        }
                      }}
                    >{t('app.load')}</button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card className="assets p-12 mb-12" variant="muted">
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              {t('emulatorConfig.freej2mePlus.hint2')}
            </p>
          </Card>
        )}

      {/* Toggles container */}
      <Card className="toggles p-12 mb-12" variant="muted">
        <div className="grid-2">
          {/* 相容性選項 */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.compatfantasyzonefix')}</label>
            <ToggleSwitch
              checked={(values.compatfantasyzonefix ?? 'off') === 'on'}
              onChange={(checked) => setVal('compatfantasyzonefix', checked ? 'on' : 'off')}
              disabled={disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.compatimmediaterepaints')}</label>
            <ToggleSwitch
              checked={(values.compatimmediaterepaints ?? 'off') === 'on'}
              onChange={(checked) => setVal('compatimmediaterepaints', checked ? 'on' : 'off')}
              disabled={disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.compatoverrideplatchecks')}</label>
            <ToggleSwitch
              checked={(values.compatoverrideplatchecks ?? 'on') === 'on'}
              onChange={(checked) => setVal('compatoverrideplatchecks', checked ? 'on' : 'off')}
              disabled={disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.compatsiemensfriendlydrawing')}</label>
            <ToggleSwitch
              checked={(values.compatsiemensfriendlydrawing ?? 'off') === 'on'}
              onChange={(checked) => setVal('compatsiemensfriendlydrawing', checked ? 'on' : 'off')}
              disabled={disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.compattranstooriginonreset')}</label>
            <ToggleSwitch
              checked={(values.compattranstooriginonreset ?? 'off') === 'on'}
              onChange={(checked) => setVal('compattranstooriginonreset', checked ? 'on' : 'off')}
              disabled={disabled}
            />
          </div>
          {/* 模擬手機聲音 sound */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.sound')}</label>
            <ToggleSwitch
              checked={(values.sound ?? 'on') === 'on'}
              onChange={(checked) => setVal('sound', checked ? 'on' : 'off')}
              disabled={disabled}
            />
          </div>
          {/* 無 Alpha 空白影像 spdhacknoalpha */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.spdhacknoalpha')}</label>
            <ToggleSwitch
              checked={(values.spdhacknoalpha ?? 'off') === 'on'}
              onChange={(checked) => setVal('spdhacknoalpha', checked ? 'on' : 'off')}
              disabled={disabled}
            />
          </div>
          {/* 全螢幕 fullscreen */}
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2mePlus.fullscreen')}</label>
            <ToggleSwitch
              checked={(values.fullscreen ?? 0) === 1}
              onChange={(checked) => setVal('fullscreen', checked ? 1 : 0)}
              disabled={disabled}
            />
          </div>
        </div>
      </Card>
      {/* ROM Cache switch (optional, per-game only) */}
      {context === 'game' && (
        <RomCacheSwitch
          checked={romCache}
          onChange={onRomCacheChange}
          disabled={romCacheDisabled}
        />
      )}
    </>
  );
}
