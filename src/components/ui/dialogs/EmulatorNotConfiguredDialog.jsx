import React from 'react';
import { ModalWithFooter } from '@ui';
import { useTranslation } from '@hooks/useTranslation';

function EmulatorNotConfiguredDialog({ isOpen, onClose, onGoToConfig }) {
  const { t } = useTranslation();

  return (
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title={t('app.warning')}
      size="sm"
      actions={[
        {
          key: 'goToConfig',
          label: t('app.goToConfig'),
          variant: 'primary',
          onClick: onGoToConfig,
          allowFocusRing: true,
        },
      ]}
    >
      <div className="text-center">
        <p>{t('app.emulost')}</p>
      </div>
    </ModalWithFooter>
  );
}

export default EmulatorNotConfiguredDialog;
