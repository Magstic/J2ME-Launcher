import React from 'react';
import { Select, RomCacheSwitch } from '@ui';
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

  return (
    <div>
      <div className="form-row">
        <label className="form-label">{t('emulatorConfig.freej2mePlus.resolution')}</label>
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
          placeholder={t('emulatorConfig.freej2mePlus.resolution')}
          disabled={!!disabled}
        />
      </div>
      {!hideRomCache && (
        <RomCacheSwitch checked={!!romCache} onChange={onRomCacheChange} disabled={false} />
      )}
    </div>
  );
}
