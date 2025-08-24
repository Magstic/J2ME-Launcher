import React from 'react';
import { ModalWithFooter, Collapsible, Card } from '@ui';

const SettingsDialog = ({ isOpen, onClose, theme, setTheme }) => {
  return (
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title="軟體配置"
      size="md"
      actions={[{ key: 'close', label: '關閉', variant: 'primary', onClick: onClose, autoFocus: true }]}
      bodyClassName="settings-modal"
    >
      {/* 主題切換：摺疊區塊，使用 section 與 mb-12 */}
      <Collapsible title="主題" defaultOpen className="mb-12">
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Card
            className="theme-card"
            onClick={() => setTheme('light')}
            style={{
              cursor: 'pointer',
              border: `1px solid ${theme === 'light' ? 'var(--accent-color)' : 'var(--overlay-on-light-10)'}`,
              boxShadow: theme === 'light' ? '0 0 0 2px var(--accent-color-alpha)' : 'none',
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>亮色（Beta）</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>淺色承載陽光</div>
              </div>
              {theme === 'light' && <span style={{ color: 'var(--accent-color)' }}>✓</span>}
            </div>
          </Card>
          <Card
            className="theme-card"
            onClick={() => setTheme('dark')}
            style={{
              cursor: 'pointer',
              border: `1px solid ${theme === 'dark' ? 'var(--accent-color)' : 'var(--overlay-on-light-10)'}`,
              boxShadow: theme === 'dark' ? '0 0 0 2px var(--accent-color-alpha)' : 'none',
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>暗色</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>深色擁抱黑夜</div>
              </div>
              {theme === 'dark' && <span style={{ color: 'var(--accent-color)' }}>✓</span>}
            </div>
          </Card>
        </div>
      </Collapsible>
    </ModalWithFooter>
  );
};

export default SettingsDialog;
