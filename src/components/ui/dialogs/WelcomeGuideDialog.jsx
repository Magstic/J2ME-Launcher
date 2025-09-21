import React, { useState, useMemo, useEffect } from 'react';
import { ModalWithFooter, Card } from '@ui';
import { useTranslation } from '@hooks/useTranslation';
import { useI18n } from '../../../contexts/I18nContext';
import { S3Svg, WebdavSvg, DropboxSvg } from '@/assets/icons';

const WelcomeGuideDialog = ({ isOpen, onClose, onComplete }) => {
  const { t } = useTranslation();
  const { currentLanguage, changeLanguage, supportedLanguages } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);

  // 動態響應主題變化
  const [currentTheme, setCurrentTheme] = useState(() => {
    // 組件初始化時獲取當前主題
    const theme = document.body?.dataset?.theme || 'dark';
    console.log('WelcomeGuideDialog init theme:', theme);
    return theme;
  });
  const svgFilter = currentTheme === 'light' ? 'none' : 'brightness(0) invert(1)';

  // 監聽主題變化事件
  useEffect(() => {
    const handleThemeChangeEvent = (event) => {
      console.log('Theme change event received:', event.detail);
      setCurrentTheme(event.detail);
    };

    window.addEventListener('theme-change', handleThemeChangeEvent);

    return () => {
      window.removeEventListener('theme-change', handleThemeChangeEvent);
    };
  }, []);

  // 監聽步驟變化，同步當前主題狀態
  useEffect(() => {
    if (currentStep === 2) {
      // 主題選擇步驟
      const actualTheme = document.body?.dataset?.theme || 'dark';
      console.log(
        'Entering theme step, actual theme:',
        actualTheme,
        'current state:',
        currentTheme
      );
      if (actualTheme !== currentTheme) {
        setCurrentTheme(actualTheme);
      }
    }
  }, [currentStep, currentTheme]);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const steps = useMemo(
    () => [
      {
        id: 'welcome',
        title: t('welcome.title'),
        icon: '☕',
        content: (
          <div style={{ padding: '20px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ fontSize: '64px', marginBottom: '24px' }}>☕</div>
              <h3
                style={{
                  margin: '0 0 16px 0',
                  fontSize: '20px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                }}
              >
                {t('welcome.subtitle')}
              </h3>
              <p
                style={{
                  margin: '0 0 24px 0',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6',
                }}
              >
                {t('welcome.description')}
              </p>
            </div>

            {/* 語言選擇器 */}
            <div
              style={{
                marginBottom: '24px',
                padding: '20px',
                backgroundColor: 'var(--overlay-on-light-03)',
                borderRadius: '8px',
                border: '1px solid var(--overlay-on-light-08)',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  marginBottom: '12px',
                  textAlign: 'center',
                }}
              >
                {t('welcome.language')}
              </label>
              <div
                style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}
              >
                {[
                  { value: 'zh-TW', label: '繁體中文' },
                  { value: 'zh-CN', label: '简体中文' },
                  { value: 'en-US', label: 'English' },
                ].map((option) => (
                  <button
                    key={option.value}
                    className={`btn ${currentLanguage === option.value ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => changeLanguage(option.value)}
                    style={{ minWidth: '80px' }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'theme',
        title: t('welcome.steps.theme.title'),
        icon: '🎨',
        description: t('welcome.steps.theme.description'),
        content: (
          <div style={{ padding: '20px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ fontSize: '64px', marginBottom: '24px' }}>🎨</div>
              <p
                style={{
                  margin: '0 0 24px 0',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6',
                }}
              >
                {t('welcome.steps.theme.notice')}
              </p>
            </div>

            {/* 主題選擇器 */}
            <div
              style={{
                display: 'grid',
                gap: '12px',
                gridTemplateColumns: '1fr 1fr',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  border: '1px solid',
                  borderColor:
                    currentTheme === 'dark' ? 'var(--accent-color)' : 'var(--overlay-on-light-12)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--overlay-on-light-05)',
                  cursor: 'pointer',
                }}
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('theme-change', { detail: 'dark' }))
                }
              >
                <span style={{ fontSize: '24px', marginRight: '16px' }}>🌙</span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}
                  >
                    {t('welcome.steps.theme.darkMode')}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t('welcome.steps.theme.darkModeDesc')}
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  border: '1px solid',
                  borderColor:
                    currentTheme === 'light' ? 'var(--accent-color)' : 'var(--overlay-on-light-12)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--overlay-on-light-05)',
                  cursor: 'pointer',
                }}
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('theme-change', { detail: 'light' }))
                }
              >
                <span style={{ fontSize: '24px', marginRight: '16px' }}>☀️</span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}
                  >
                    {t('welcome.steps.theme.lightMode')}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t('welcome.steps.theme.lightModeDesc')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'emulator',
        title: t('welcome.steps.emulator.title'),
        icon: '⚙️',
        description: t('welcome.steps.emulator.description'),
        content: (
          <div style={{ padding: '20px 0' }}>
            <div style={{ marginBottom: '24px' }}>
              <p
                style={{
                  margin: '0 0 16px 0',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6',
                }}
              >
                {t('welcome.steps.emulator.notice')}
              </p>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  border: '1px solid var(--overlay-on-light-12)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--overlay-on-light-03)',
                  cursor: 'pointer',
                }}
                onClick={() =>
                  window.electronAPI?.openExternal?.(
                    'https://github.com/TASEmulators/freej2me-plus'
                  )
                }
              >
                <span style={{ fontSize: '24px', marginRight: '16px' }}>🎮</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                    {t('welcome.steps.emulator.freej2me.name')}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {t('welcome.steps.emulator.freej2me.description')}
                  </div>
                </div>
                <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>↗</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  border: '1px solid var(--overlay-on-light-12)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--overlay-on-light-03)',
                  cursor: 'pointer',
                }}
                onClick={() =>
                  window.electronAPI?.openExternal?.('https://github.com/shinovon/KEmulator')
                }
              >
                <span style={{ fontSize: '24px', marginRight: '16px' }}>📱</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                    {t('welcome.steps.emulator.kemulator.name')}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {t('welcome.steps.emulator.kemulator.description')}
                  </div>
                </div>
                <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>↗</span>
              </div>
            </div>

            <div
              style={{
                marginTop: '20px',
                textAlign: 'center',
              }}
            >
              <button
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--accent-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-emulator-config-from-guide'));
                }}
              >
                {t('welcome.steps.emulator.configureNow')}
              </button>
            </div>
          </div>
        ),
      },
      {
        id: 'roms',
        title: t('welcome.steps.roms.title'),
        icon: '📁',
        description: t('welcome.steps.roms.description'),
        content: (
          <div style={{ padding: '20px 0' }}>
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
                {t('welcome.steps.roms.supportedFormats')}
              </h4>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid var(--overlay-on-light-12)',
                  backgroundColor: 'var(--overlay-on-light-03)',
                }}
              >
                <span style={{ fontSize: '32px' }}>📱</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                    {t('welcome.steps.roms.midp.name')}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {t('welcome.steps.roms.midp.description')}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '16px',
                textAlign: 'center',
              }}
            >
              <button
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--accent-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-directory-manager-from-guide'));
                }}
              >
                {t('welcome.steps.roms.configureFolder')}
              </button>
            </div>
          </div>
        ),
      },
      {
        id: 'cloud',
        title: t('welcome.steps.cloud.title'),
        icon: '☁️',
        description: t('welcome.steps.cloud.description'),
        content: (
          <div style={{ padding: '20px 0' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    borderRadius: '8px',
                    padding: '16px',
                    border: '1px solid var(--overlay-on-light-12)',
                    backgroundColor: 'var(--overlay-on-light-03)',
                  }}
                >
                  <img
                    src={DropboxSvg}
                    alt="Dropbox"
                    style={{
                      height: '24px',
                      opacity: 0.9,
                      filter: svgFilter,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                      {t('welcome.steps.cloud.services.dropbox.name')}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {t('welcome.steps.cloud.services.dropbox.description')}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    borderRadius: '8px',
                    padding: '16px',
                    border: '1px solid var(--overlay-on-light-12)',
                    backgroundColor: 'var(--overlay-on-light-03)',
                  }}
                >
                  <img
                    src={WebdavSvg}
                    alt="Webdav"
                    style={{
                      height: '24px',
                      opacity: 0.9,
                      filter: svgFilter,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                      {t('welcome.steps.cloud.services.webdav.name')}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {t('welcome.steps.cloud.services.webdav.description')}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    borderRadius: '8px',
                    padding: '16px',
                    border: '1px solid var(--overlay-on-light-12)',
                    backgroundColor: 'var(--overlay-on-light-03)',
                  }}
                >
                  <img
                    src={S3Svg}
                    alt="S3"
                    style={{
                      height: '24px',
                      opacity: 0.9,
                      filter: svgFilter,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                      {t('welcome.steps.cloud.services.s3.name')}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {t('welcome.steps.cloud.services.s3.description')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '20px',
                textAlign: 'center',
              }}
            >
              <button
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--accent-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-backup-config-from-guide'));
                }}
              >
                {t('welcome.steps.cloud.configureBackup')}
              </button>
            </div>
          </div>
        ),
      },
      {
        id: 'tutorial',
        title: t('welcome.steps.tutorial.title'),
        icon: '🎯',
        content: (
          <div style={{ padding: '20px 0' }}>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid var(--overlay-on-light-12)',
                  backgroundColor: 'var(--overlay-on-light-03)',
                }}
              >
                <span style={{ fontSize: '24px' }}>⚔️</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                    {t('welcome.steps.tutorial.actions.launch.title')}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {t('welcome.steps.tutorial.actions.launch.description')}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid var(--overlay-on-light-12)',
                  backgroundColor: 'var(--overlay-on-light-03)',
                }}
              >
                <span style={{ fontSize: '24px' }}>📁</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                    {t('welcome.steps.tutorial.actions.organize.title')}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {t('welcome.steps.tutorial.actions.organize.description')}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid var(--overlay-on-light-12)',
                  backgroundColor: 'var(--overlay-on-light-03)',
                }}
              >
                <span style={{ fontSize: '24px' }}>🔍</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                    {t('welcome.steps.tutorial.actions.search.title')}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {t('welcome.steps.tutorial.actions.search.description')}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid var(--overlay-on-light-12)',
                  backgroundColor: 'var(--overlay-on-light-03)',
                }}
              >
                <span style={{ fontSize: '24px' }}>⚙️</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                    {t('welcome.steps.tutorial.actions.settings.title')}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {t('welcome.steps.tutorial.actions.settings.description')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'complete',
        title: t('welcome.steps.complete.title'),
        icon: '✅',
        content: (
          <div
            style={{
              padding: '40px 0',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              minHeight: '300px',
            }}
          >
            <div style={{ fontSize: '96px', marginBottom: '32px' }}>🎉</div>
            <h2
              style={{
                margin: '0 0 24px 0',
                fontSize: '32px',
                fontWeight: '700',
                color: 'var(--text-primary)',
              }}
            >
              {t('welcome.steps.complete.subtitle')}
            </h2>
            <p
              style={{
                margin: '0',
                fontSize: '18px',
                color: 'var(--text-secondary)',
                lineHeight: '1.6',
                maxWidth: '400px',
              }}
            >
              {t('welcome.steps.complete.message')}
              <br />
              {t('welcome.steps.complete.submessage')}
            </p>
          </div>
        ),
      },
    ],
    [t, svgFilter]
  );

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentStepData = steps[currentStep];

  // Define footer actions based on current step
  const getFooterActions = () => {
    const actions = [];

    // Previous button
    if (currentStep > 0) {
      actions.push({
        key: 'prev',
        label: t('app.previous'),
        variant: 'secondary',
        onClick: prevStep,
      });
    }

    // Next/Complete button
    if (currentStep < steps.length - 1) {
      actions.push({
        key: 'next',
        label: t('app.next'),
        variant: 'primary',
        onClick: nextStep,
      });
    } else {
      actions.push({
        key: 'start',
        label: t('app.startUsing'),
        variant: 'primary',
        onClick: () => {
          onComplete();
          onClose();
        },
      });
    }

    return actions;
  };

  return (
    <div style={{ zIndex: 9999 }}>
      <ModalWithFooter
        isOpen={isOpen}
        onClose={onClose}
        title={t('welcome.guide.title')}
        size="md"
        actions={getFooterActions()}
        bodyClassName="welcome-guide-body"
      >
        <div
          style={{
            padding: '0',
            display: 'flex',
          }}
        >
          {/* Left Sidebar - Windows Installer Style */}
          <div
            style={{
              width: '120px',
              backgroundColor: 'var(--overlay-on-light-03)',
              borderRight: '1px solid var(--overlay-on-light-10)',
              padding: '24px 16px',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'center',
              minHeight: '400px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                marginTop: '60px',
                alignItems: 'center',
              }}
            >
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor:
                      index === currentStep
                        ? 'var(--accent-color)'
                        : index < currentStep
                          ? 'var(--accent-color)'
                          : 'var(--overlay-on-light-10)',
                    color: index <= currentStep ? 'white' : 'var(--text-secondary)',
                    fontSize: '20px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    border:
                      index === currentStep
                        ? '3px solid var(--accent-color-alpha)'
                        : '3px solid transparent',
                  }}
                >
                  {index < currentStep ? '✓' : step.icon}
                </div>
              ))}
            </div>
          </div>

          {/* Right Content Area */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '24px 32px 16px 32px',
                borderBottom: '1px solid var(--overlay-on-light-08)',
                flexShrink: 0,
              }}
            >
              <h2
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '24px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                }}
              >
                {currentStepData.title}
              </h2>
              {currentStepData.description && (
                <p
                  style={{
                    margin: '0',
                    fontSize: '16px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.5',
                  }}
                >
                  {currentStepData.description}
                </p>
              )}
            </div>

            {/* Content */}
            <div
              className="welcome-guide-content-scroll"
              style={{
                padding: '24px 32px',
                overflowY: 'scroll',
                flex: 1,
                minHeight: 0,
                maxHeight: 'calc(75vh - 200px)',
              }}
            >
              {currentStepData.content}
            </div>
          </div>
        </div>
      </ModalWithFooter>
    </div>
  );
};

export default WelcomeGuideDialog;
