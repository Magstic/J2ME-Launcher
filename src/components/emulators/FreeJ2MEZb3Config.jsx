import React from 'react';
import { Card, Select, RomCacheSwitch, ToggleSwitch } from '@ui';
import { useTranslation } from '@hooks/useTranslation';

export default function FreeJ2MEZb3Config({
  values,
  onChange,
  disabled,
  romCache,
  onRomCacheChange,
  resOptions = [],
  hideRomCache = false,
}) {
  const { t } = useTranslation();
  const width = Number.isFinite(parseInt(values?.width, 10)) ? parseInt(values.width, 10) : 240;
  const height = Number.isFinite(parseInt(values?.height, 10)) ? parseInt(values.height, 10) : 320;
  const valueStr = `${width}x${height}`;
  const fpsVal = (() => {
    const raw = values?.fps;
    if (raw === 'auto' || raw === 0) return 'auto';
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? String(n) : '60';
  })();
  const rotateOn = (values && String(values.rotate)) === 'on';
  const soundOn = (values && String(values.sound)) === 'off' ? false : true;
  const phoneVal = (values && String(values.phone)) || 'Nokia';
  const dgFormatVal = String(values?.dgFormat ?? 'default');
  const forceFullscreenOn = String(values?.forceFullscreen) === 'on';
  const forceVolatileOn = String(values?.forceVolatileFields) === 'on';

  return (
    <>
      <Card className="selects p-12 mb-12" variant="muted">
        <div className="grid-2">
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2meZb3.resolution')}</label>
            <Select
              value={valueStr}
              onChange={(val) => {
                const [w, h] = String(val)
                  .split('x')
                  .map((s) => parseInt(s, 10));
                if (!disabled && onChange) {
                  onChange({
                    width: Number.isFinite(w) ? w : 240,
                    height: Number.isFinite(h) ? h : 320,
                  });
                }
              }}
              options={(resOptions || []).map((r) => ({ value: r, label: r }))}
              placeholder={t('emulatorConfig.freej2meZb3.resolution')}
              disabled={!!disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2meZb3.framerate')}</label>
            <Select
              value={fpsVal}
              onChange={(v) => {
                if (!disabled && onChange) {
                  if (String(v) === 'auto') {
                    onChange({ fps: 0 });
                  } else {
                    const n = parseInt(v, 10);
                    onChange({ fps: Number.isFinite(n) ? n : 60 });
                  }
                }
              }}
              options={[
                { value: 'auto', label: t('emulatorConfig.freej2meZb3.fps.auto') },
                { value: '60', label: t('emulatorConfig.freej2meZb3.fps.fast60') },
                { value: '30', label: t('emulatorConfig.freej2meZb3.fps.slow30') },
                { value: '15', label: t('emulatorConfig.freej2meZb3.fps.turtle15') },
              ]}
              placeholder={t('emulatorConfig.freej2meZb3.framerate')}
              disabled={!!disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2meZb3.phone.label')}</label>
            <Select
              value={phoneVal}
              onChange={(v) => {
                if (!disabled && onChange) onChange({ phone: String(v) });
              }}
              options={['Standard', 'Nokia', 'Siemens', 'Motorola', 'SonyEricsson'].map((p) => ({
                value: p,
                label: t(`emulatorConfig.freej2meZb3.phone.options.${p}`),
              }))}
              placeholder={t('emulatorConfig.freej2meZb3.phone.label')}
              disabled={!!disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2meZb3.dgFormat.label')}</label>
            <Select
              value={dgFormatVal}
              onChange={(v) => {
                if (!disabled && onChange) onChange({ dgFormat: String(v) });
              }}
              options={[
                {
                  value: 'default',
                  label: t('emulatorConfig.freej2meZb3.dgFormat.options.default'),
                },
                { value: '444', label: t('emulatorConfig.freej2meZb3.dgFormat.options.444') },
                { value: '4444', label: t('emulatorConfig.freej2meZb3.dgFormat.options.4444') },
                { value: '565', label: t('emulatorConfig.freej2meZb3.dgFormat.options.565') },
              ]}
              placeholder={t('emulatorConfig.freej2meZb3.dgFormat.label')}
              disabled={!!disabled}
            />
          </div>
        </div>
      </Card>
      <Card className="toggles p-12 mb-12" variant="muted">
        <div className="grid-2">
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2meZb3.rotate')}</label>
            <ToggleSwitch
              checked={!!rotateOn}
              onChange={(checked) => {
                if (!disabled && onChange) onChange({ rotate: checked ? 'on' : 'off' });
              }}
              disabled={!!disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2meZb3.sound')}</label>
            <ToggleSwitch
              checked={!!soundOn}
              onChange={(checked) => {
                if (!disabled && onChange) onChange({ sound: checked ? 'on' : 'off' });
              }}
              disabled={!!disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">{t('emulatorConfig.freej2meZb3.forceFullscreen')}</label>
            <ToggleSwitch
              checked={!!forceFullscreenOn}
              onChange={(checked) => {
                if (!disabled && onChange) onChange({ forceFullscreen: checked ? 'on' : 'off' });
              }}
              disabled={!!disabled}
            />
          </div>
          <div className="form-row">
            <label className="form-label">
              {t('emulatorConfig.freej2meZb3.forceVolatileFields')}
            </label>
            <ToggleSwitch
              checked={!!forceVolatileOn}
              onChange={(checked) => {
                if (!disabled && onChange)
                  onChange({ forceVolatileFields: checked ? 'on' : 'off' });
              }}
              disabled={!!disabled}
            />
          </div>
        </div>
      </Card>
      {!hideRomCache && (
        <RomCacheSwitch checked={!!romCache} onChange={onRomCacheChange} disabled={false} />
      )}
    </>
  );
}
