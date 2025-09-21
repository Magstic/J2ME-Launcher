import React, { useState, useEffect } from 'react';
import { ModalWithFooter, Collapsible, Card } from '@ui';
import { useTranslation } from '@hooks/useTranslation';
import './SettingsDialog.css';

const SettingsDialog = ({ isOpen, onClose, theme, setTheme }) => {
  const { t, changeLanguage, language: currentLanguage } = useTranslation();
  const [javaPath, setJavaPath] = useState({ current: '', custom: '', autoDetected: '' });
  const [autoDetectedPath, setAutoDetectedPath] = useState('');
  const [customJavaPath, setCustomJavaPath] = useState('');
  const [isValidatingJava, setIsValidatingJava] = useState(false);
  const [tagsDevicesText, setTagsDevicesText] = useState('');
  const [tagsResolutionsText, setTagsResolutionsText] = useState('');
  const [tagsVersionsText, setTagsVersionsText] = useState('');
  const [isSavingTags, setIsSavingTags] = useState(false);

  const languages = [
    { code: 'zh-TW', name: '繁體中文' },
    { code: 'zh-CN', name: '简体中文' },
    { code: 'en-US', name: 'English' },
  ];

  // Load Java path configuration on dialog open
  useEffect(() => {
    if (isOpen) {
      window.electronAPI
        .getJavaPath()
        .then((result) => {
          setJavaPath(result);
          setCustomJavaPath(result.custom || '');
          // Store the auto-detected path separately and keep it constant
          if (!autoDetectedPath) {
            setAutoDetectedPath(result.autoDetected || result.current);
          }
        })
        .catch(console.error);
      // Load cluster tag extras (append-only; UI will union with built-ins when used)
      (async () => {
        try {
          const opts = await window.electronAPI.getClusterTagOptions();
          const uniq = (arr) =>
            Array.from(
              new Set((arr || []).filter((v) => typeof v === 'string' && v.trim().length > 0))
            );
          const extras =
            opts && typeof opts === 'object'
              ? opts
              : { devices: [], resolutions: [], versions: [] };
          setTagsDevicesText(uniq(extras.devices).join('\n'));
          setTagsResolutionsText(uniq(extras.resolutions).join('\n'));
          setTagsVersionsText(uniq(extras.versions).join('\n'));
        } catch (e) {
          setTagsDevicesText('');
          setTagsResolutionsText('');
          setTagsVersionsText('');
        }
      })();
    }
  }, [isOpen, autoDetectedPath]);

  const handleJavaPathChange = (e) => {
    setCustomJavaPath(e.target.value);
  };

  const handleJavaPathSave = async (pathToSave = null) => {
    setIsValidatingJava(true);
    try {
      const finalPath = pathToSave !== null ? pathToSave : customJavaPath.trim();

      if (finalPath) {
        // Validate path first
        const validation = await window.electronAPI.validateJavaPath(finalPath);
        if (!validation.valid) {
          alert(t('settings.java.invalidPath'));
          return;
        }
      }

      // Save the path
      const result = await window.electronAPI.setJavaPath(finalPath || null);
      if (result.success) {
        // Update local state
        setCustomJavaPath(finalPath || '');
        // Reload current path
        const updated = await window.electronAPI.getJavaPath();
        setJavaPath(updated);
      } else {
        alert(result.error || t('settings.java.saveFailed'));
      }
    } catch (error) {
      console.error('Failed to save Java path:', error);
      alert(t('settings.java.saveFailed'));
    } finally {
      setIsValidatingJava(false);
    }
  };

  const handleJavaPathBrowse = async () => {
    try {
      const result = await window.electronAPI.browseJavaExecutable();
      if (result.success && result.filePath) {
        // Auto-save after selection
        await handleJavaPathSave(result.filePath);
      }
    } catch (error) {
      console.error('Failed to browse Java executable:', error);
      alert(t('settings.java.browseFailed'));
    }
  };

  const handleJavaPathReset = async () => {
    await handleJavaPathSave(''); // Empty string triggers auto-detect
  };

  // ==================== Cluster Tag Options Handlers ====================
  const parseTextToList = (text) => {
    if (!text) return [];
    // split by newline or comma; trim and de-duplicate
    const parts = text
      .split(/\r?\n|,/g)
      .map((s) => (s || '').trim())
      .filter(Boolean);
    return Array.from(new Set(parts));
  };
  const handleSaveClusterTags = async () => {
    setIsSavingTags(true);
    try {
      const payload = {
        devices: parseTextToList(tagsDevicesText),
        resolutions: parseTextToList(tagsResolutionsText),
        versions: parseTextToList(tagsVersionsText),
      };
      const res = await window.electronAPI.setClusterTagOptions(payload);
      if (!res?.success) {
        alert(res?.error || t('settings.clusterTags.saveFailed'));
      }
    } catch (e) {
      alert(t('settings.clusterTags.saveFailed'));
    } finally {
      setIsSavingTags(false);
    }
  };
  const handleResetClusterTags = async () => {
    // Clear extras; built-ins remain available by default
    setTagsDevicesText('');
    setTagsResolutionsText('');
    setTagsVersionsText('');
    try {
      await window.electronAPI.setClusterTagOptions({ devices: [], resolutions: [], versions: [] });
    } catch (_) {}
  };
  return (
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.title')}
      size="md"
      actions={[
        {
          key: 'close',
          label: t('app.close'),
          variant: 'primary',
          onClick: onClose,
          autoFocus: true,
        },
      ]}
      bodyClassName="settings-modal"
    >
      {/* 主題切換：摺疊區塊，使用 section 與 mb-12 */}
      <Collapsible title={t('settings.theme.title')} defaultOpen className="mb-12">
        <div
          className="grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}
        >
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
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {t('settings.theme.light.name')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {t('settings.theme.light.description')}
                </div>
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
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {t('settings.theme.dark.name')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {t('settings.theme.dark.description')}
                </div>
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
          <div
            className="grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}
          >
            {languages.map((lang) => (
              <Card
                key={lang.code}
                className={`language-card ${currentLanguage === lang.code ? 'selected' : ''}`}
                onClick={() => changeLanguage(lang.code)}
                data-selected={currentLanguage === lang.code}
                style={{
                  cursor: 'pointer',
                  border: `1px solid ${currentLanguage === lang.code ? 'var(--accent-color)' : 'var(--overlay-on-light-10)'}`,
                  boxShadow:
                    currentLanguage === lang.code ? '0 0 0 2px var(--accent-color-alpha)' : 'none',
                  padding: 12,
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
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

      {/* Java 路徑配置：摺疊區塊 */}
      <Collapsible title={t('settings.java.title')} defaultOpen className="mb-12">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {t('settings.java.description')}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {t('settings.java.currentPath')}
            </label>
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--overlay-on-light-5)',
                border: '1px solid var(--overlay-on-light-10)',
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 400,
                color: 'var(--text-secondary)',
              }}
            >
              {autoDetectedPath || javaPath.autoDetected || javaPath.current}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {t('settings.java.customPath')}
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={customJavaPath}
                onChange={handleJavaPathChange}
                placeholder={t('settings.java.customPathPlaceholder')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid var(--overlay-on-light-10)',
                  borderRadius: 4,
                  fontSize: 14,
                  fontWeight: 400,
                  backgroundColor: 'var(--background-color)',
                  color: 'var(--text-secondary)',
                }}
              />
              <button
                className="btn btn-primary"
                onClick={handleJavaPathBrowse}
                disabled={isValidatingJava}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                {t('settings.java.browse')}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleJavaPathReset}
                disabled={isValidatingJava}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                {t('settings.java.reset')}
              </button>
            </div>
          </div>
        </div>
      </Collapsible>

      {/* Cluster Tag Options (Append-only extras) */}
      <Collapsible title={t('settings.clusterTags.titleExtras')} defaultOpen className="mb-12">
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {t('settings.clusterTags.helper')}
        </div>
        <div
          className="grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {t('settings.clusterTags.device')}
            </label>
            <textarea
              className="form-input"
              value={tagsDevicesText}
              onChange={(e) => setTagsDevicesText(e.target.value)}
              rows={8}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {t('settings.clusterTags.resolution')}
            </label>
            <textarea
              className="form-input"
              value={tagsResolutionsText}
              onChange={(e) => setTagsResolutionsText(e.target.value)}
              rows={8}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {t('settings.clusterTags.version')}
            </label>
            <textarea
              className="form-input"
              value={tagsVersionsText}
              onChange={(e) => setTagsVersionsText(e.target.value)}
              rows={8}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            className="btn btn-primary"
            onClick={handleSaveClusterTags}
            disabled={isSavingTags}
          >
            {t('app.save')}
          </button>
          <button className="btn btn-secondary" onClick={handleResetClusterTags}>
            {t('settings.clusterTags.resetExtras')}
          </button>
        </div>
      </Collapsible>
    </ModalWithFooter>
  );
};

export default SettingsDialog;
