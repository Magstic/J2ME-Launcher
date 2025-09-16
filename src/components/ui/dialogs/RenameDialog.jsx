import React, { useEffect, useRef, useState } from 'react';
import { ModalWithFooter } from '@ui';
import { useTranslation } from '@hooks/useTranslation';

/**
 * Generic Rename Dialog
 * Props:
 * - isOpen: boolean
 * - title: string
 * - label: string
 * - defaultValue: string
 * - confirmText?: string
 * - cancelText?: string
 * - onConfirm: (value: string) => Promise<void> | void
 * - onClose: () => void
 */
export default function RenameDialog({
  isOpen,
  onTitle,
  onLabel,
  defaultValue = '',
  confirmText,
  cancelText,
  onConfirm,
  onClose,
}) {
  const { t } = useTranslation();
  const confirmLabel = confirmText ?? t('app.save');
  const cancelLabel = cancelText ?? t('app.cancel');
  const title = onTitle ?? t('app.rename');
  const label = onLabel ?? t('app.name');
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue || '');
      setIsSaving(false);
      // Autofocus slightly delayed to ensure mount
      setTimeout(() => {
        try { inputRef.current && inputRef.current.focus(); } catch (_) {}
      }, 10);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await onConfirm?.(trimmed);
    } finally {
      setIsSaving(false);
      onClose?.();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  };

  return (
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      actions={[
        { key: 'cancel', label: cancelLabel, variant: 'secondary', onClick: onClose },
        { key: 'confirm', label: confirmLabel, variant: 'primary', onClick: handleSave, autoFocus: false, disabled: !value.trim() || isSaving },
      ]}
    >
      <div className="form-group" onKeyDown={handleKeyDown}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{label}</label>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={64}
          className="form-input"
          style={{ width: '100%' }}
        />
      </div>
    </ModalWithFooter>
  );
}
