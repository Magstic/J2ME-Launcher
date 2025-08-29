import React from 'react';
import { ModalWithFooter, Collapsible, Card } from '@ui';
import { useTranslation } from '@hooks/useTranslation';
import './SettingsDialog.css';

const SettingsDialog = ({ isOpen, onClose, theme, setTheme }) => {
  const { t, changeLanguage, language: currentLanguage } = useTranslation();
  
  const languages = [
    { code: 'zh-TW', name: '繁體中文' },
    { code: 'zh-CN', name: '简体中文' },
    { code: 'en-US', name: 'English' }
  ];
  return (
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.title')}
      size="md"
      actions={[{ key: 'close', label: t('app.close'), variant: 'primary', onClick: onClose, autoFocus: true }]}
      bodyClassName="settings-modal"
    >
      {/* 主題切換：摺疊區塊，使用 section 與 mb-12 */}
      <Collapsible title={t('settings.theme.title')} defaultOpen className="mb-12">
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Card
            className={`theme-card ${theme === 'light' ? 'selected' : ''}`}
            onClick={() => setTheme('light')}
            data-selected={theme === 'light'}
            style={{
              cursor: 'pointer',
              border: `1px solid ${theme === 'light' ? 'var(--accent-color)' : 'var(--overlay-on-light-10)'}`,
              boxShadow: theme === 'light' ? '0 0 0 2px var(--accent-color-alpha)' : 'none',
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('settings.theme.light.name')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('settings.theme.light.description')}</div>
              </div>
            </div>
            <span className="checkmark">✓</span>
          </Card>
          <Card
            className={`theme-card ${theme === 'dark' ? 'selected' : ''}`}
            onClick={() => setTheme('dark')}
            data-selected={theme === 'dark'}
            style={{
              cursor: 'pointer',
              border: `1px solid ${theme === 'dark' ? 'var(--accent-color)' : 'var(--overlay-on-light-10)'}`,
              boxShadow: theme === 'dark' ? '0 0 0 2px var(--accent-color-alpha)' : 'none',
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('settings.theme.dark.name')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('settings.theme.dark.description')}</div>
              </div>
            </div>
            <span className="checkmark">✓</span>
          </Card>
        </div>
      </Collapsible>

      {/* 語言切換：摺疊區塊 */}
      <Collapsible title={t('settings.language.title')} defaultOpen className="mb-12">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {t('settings.language.description')}
          </div>
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            {languages.map(lang => (
              <Card
                key={lang.code}
                className={`language-card ${currentLanguage === lang.code ? 'selected' : ''}`}
                onClick={() => changeLanguage(lang.code)}
                data-selected={currentLanguage === lang.code}
                style={{
                  cursor: 'pointer',
                  border: `1px solid ${currentLanguage === lang.code ? 'var(--accent-color)' : 'var(--overlay-on-light-10)'}`,
                  boxShadow: currentLanguage === lang.code ? '0 0 0 2px var(--accent-color-alpha)' : 'none',
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{lang.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{lang.code}</div>
                  </div>
                </div>
                <span className="checkmark">✓</span>
              </Card>
            ))}
          </div>
        </div>
      </Collapsible>
    </ModalWithFooter>
  );
};

export default SettingsDialog;
