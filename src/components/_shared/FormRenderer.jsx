import React from 'react';
import { Card, ToggleSwitch } from '@ui';

/**
 * Generic schema-driven form renderer.
 * Props:
 * - schema: { groups: [{ id, label, fields: [{ key, type, label, options?, mapTo? }] }] }
 * - values: object (current values)
 * - onChange: (partial) => void
 * - disabled: boolean
 * - excludeTypes: string[] (field types to skip rendering)
 */
export default function FormRenderer({ schema, values, onChange, disabled = false, excludeTypes = [] }) {
  if (!schema || !Array.isArray(schema.groups)) return null;

  // Normalize option list into [{ value, label }]
  const normalizeOptions = (options = []) => {
    return (options || []).map(opt => {
      const isObj = opt && typeof opt === 'object';
      const value = isObj ? opt.value : opt;
      const label = isObj ? (opt.label ?? String(value)) : String(value);
      return { value, label };
    });
  };

  const handleChange = (key, value, mapTo) => {
    if (Array.isArray(mapTo) && mapTo.length === 2 && key === 'resolution') {
      // value like '240x320' -> { width: 240, height: 320 }
      if (typeof value === 'string' && value.includes('x')) {
        const [w, h] = value.split('x').map(v => parseInt(v, 10));
        if (Number.isFinite(w) && Number.isFinite(h)) {
          onChange({ width: w, height: h });
          return;
        }
      }
    }
    onChange({ [key]: value });
  };

  const getResolutionValue = () => {
    const w = parseInt(values?.width, 10);
    const h = parseInt(values?.height, 10);
    if (Number.isFinite(w) && Number.isFinite(h)) return `${w}x${h}`;
    return '';
  };

  // Helpers
  const fieldId = (key) => `frm-${key}`;
  const coerceValue = (field, raw) => {
    if (!field) return raw;
    if (field.type === 'number') {
      const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
      return Number.isFinite(n) ? n : 0;
    }
    return raw;
  };

  // Renderer registry per field type
  const typeRenderers = {
    text: (field) => {
      const key = field.key;
      const label = field.label || key;
      const id = fieldId(key);
      const isDisabled = disabled || !!field.disabled;
      const value = values?.[key] ?? '';
      return (
        <div className="form-row" key={key}>
          <label className="form-label" htmlFor={id}>{label}</label>
          <input
            id={id}
            type="text"
            className="form-input"
            value={String(value)}
            onChange={e => handleChange(key, e.target.value, field.mapTo)}
            disabled={isDisabled}
            placeholder={field.placeholder || ''}
          />
          {field.description && (
            <div className="form-help">{field.description}</div>
          )}
        </div>
      );
    },
    number: (field) => {
      const key = field.key;
      const label = field.label || key;
      const id = fieldId(key);
      const isDisabled = disabled || !!field.disabled;
      const value = Number.isFinite(values?.[key]) ? values[key] : (values?.[key] ?? '');
      return (
        <div className="form-row" key={key}>
          <label className="form-label" htmlFor={id}>{label}</label>
          <input
            id={id}
            type="number"
            className="form-input"
            value={String(value)}
            onChange={e => handleChange(key, coerceValue(field, e.target.value), field.mapTo)}
            disabled={isDisabled}
            placeholder={field.placeholder || ''}
            min={field.min}
            max={field.max}
            step={field.step}
          />
          {field.description && (
            <div className="form-help">{field.description}</div>
          )}
        </div>
      );
    },
    select: (field) => {
      const key = field.key;
      const label = field.label || key;
      const id = fieldId(key);
      const isDisabled = disabled || !!field.disabled || (typeof field.disabledWhen === 'function' && field.disabledWhen(values));
      const value = key === 'resolution' ? getResolutionValue() : (values?.[key] ?? '');
      const rawOptions = typeof field.optionsFrom === 'function' ? field.optionsFrom(values) : field.options;
      const options = normalizeOptions(rawOptions);
      const error = typeof field.validate === 'function' ? field.validate(value, values) : null;
      return (
        <div className="form-row" key={key}>
          <label className="form-label" htmlFor={id}>{label}</label>
          <select
            id={id}
            className="form-input"
            value={String(value)}
            onChange={e => handleChange(key, isNaN(+e.target.value) ? e.target.value : +e.target.value, field.mapTo)}
            disabled={isDisabled}
          >
            {field.placeholder && (
              <option value="" disabled hidden>{field.placeholder}</option>
            )}
            {options.map(opt => (
              <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
            ))}
          </select>
          {field.description && (
            <div className="form-help">{field.description}</div>
          )}
          {error && (
            <div className="form-error">{error}</div>
          )}
        </div>
      );
    },
    toggle: (field) => {
      const key = field.key;
      const label = field.label || key;
      const isDisabled = disabled || !!field.disabled;
      const checked = String(values?.[key]) === 'on' || values?.[key] === 1 || values?.[key] === true;
      const onToggle = (nextChecked) => {
        // Preserve existing shapes: for fullscreen we use 0/1; for others 'on'/'off'
        let newVal;
        if (key === 'fullscreen') newVal = nextChecked ? 1 : 0;
        else newVal = nextChecked ? 'on' : 'off';
        handleChange(key, newVal, field.mapTo);
      };
      return (
        <div className="form-row" key={key}>
          <ToggleSwitch label={label} checked={!!checked} onChange={onToggle} disabled={isDisabled} />
          {field.description && (
            <div className="form-help">{field.description}</div>
          )}
        </div>
      );
    }
  };

  const renderField = (field) => {
    if (!field || (excludeTypes && excludeTypes.includes(field.type))) return null;
    if (typeof field.when === 'function' && !field.when(values)) return null;
    const renderer = typeRenderers[field.type];
    if (!renderer) return null; // Unsupported types are skipped
    return renderer(field);
  };

  return (
    <div className="schema-form">
      {schema.groups.map(group => {
        const rendered = (group.fields || []).map(renderField).filter(Boolean);
        if (rendered.length === 0) return null; // Skip empty groups (e.g., all fields excluded)
        return (
          <Card key={group.id} variant="muted" className="p-12 mb-12">
            {group.label && (
              <div className="section-subheader mb-8 opacity-90">{group.label}</div>
            )}
            <div className="grid-2">
              {rendered}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
