import React from 'react';
import { ModalHeaderOnly, AboutNetworkCard } from '@ui';
import { getAvatar } from '../../../assets/avatars';
import { useTranslation } from '@hooks/useTranslation';
import { AppIconSvg, MitLicenseSvg } from '@/assets/icons';

export default function AboutDialog({ isOpen, onClose }) {
  const { t } = useTranslation();
  return (
    <ModalHeaderOnly isOpen={isOpen} onClose={onClose} title="J2ME Launcher" size="md">
      <div style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
        
        {/* Header Section */}
        <div style={{ 
          marginBottom: '24px', 
          padding: '24px', 
          background: 'linear-gradient(135deg, var(--overlay-on-light-8) 0%, var(--overlay-on-light-4) 100%)',
          border: '1px solid var(--overlay-on-light-20)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '80px'
        }}>
          {/* Left side: App icon, title and subtitle */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center',
              gap: '16px',
              flex: 1,
              cursor: 'pointer',
              borderRadius: '8px',
              padding: '8px',
              transition: 'background-color 0.2s ease'
            }}
            onClick={() => window.electronAPI?.openExternal?.('https://github.com/Magstic/J2ME-Launcher')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--overlay-on-light-08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <img 
              src={AppIconSvg} 
              alt="J2ME Launcher Icon" 
              style={{ 
                width: '48px', 
                height: '48px',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
              }} 
            />
            <div>
              <h3 style={{ 
                margin: '0', 
                fontSize: '20px', 
                fontWeight: '600',
                color: 'var(--text-primary)',
                letterSpacing: '0.5px'
              }}>
                J2ME Launcher
              </h3>
              <p style={{ 
                margin: '4px 0 0 0', 
                fontSize: '14px', 
                color: 'var(--text-secondary)',
                fontWeight: '400'
              }}>
                {t('about.description')}
              </p>
            </div>
          </div>
          
          {/* Right side: Large MIT License icon */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: '8px',
              padding: '8px',
              transition: 'background-color 0.2s ease'
            }}
            onClick={() => window.electronAPI?.openExternal?.('https://en.wikipedia.org/wiki/MIT_License')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--overlay-on-light-08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <img 
              src={MitLicenseSvg} 
              alt="MIT License" 
              style={{ 
                height: '56px',
                opacity: 0.9,
                filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))'
              }} 
            />
          </div>
        </div>

        {/* Divider */}
        <div style={{ 
          height: '1px', 
          background: 'var(--divider-rail)', 
          margin: '24px 0' 
        }} />

                {/* Important Notice Section */}
                <div style={{ 
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: 'var(--overlay-on-light-05)',
          border: '1px solid var(--overlay-on-light-12)',
          borderRadius: '8px',
          borderLeft: '4px solid var(--accent-color)'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: '12px' 
          }}>
            <div style={{ 
              fontSize: '18px', 
              color: 'var(--accent-color)',
              marginTop: '2px'
            }}>
              ⚠️
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ 
                margin: '0', 
                fontSize: '13px', 
                lineHeight: '1.5', 
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-line'
              }}>
                {t('about.notice')}
              </p>
            </div>
          </div>
        </div>

        {/* Emulators Section */}
        <div style={{ marginBottom: '24px' }}>
          
          {/* FreeJ2ME-Plus Card */}
          <div 
            style={{ 
              marginBottom: '12px', 
              padding: '16px', 
              backgroundColor: 'var(--background-secondary)',
              border: '1px solid var(--overlay-on-light-10)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={() => window.electronAPI?.openExternal?.('https://github.com/TASEmulators/freej2me-plus')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--overlay-on-light-08)';
              e.currentTarget.style.borderColor = 'var(--overlay-on-light-20)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--background-secondary)';
              e.currentTarget.style.borderColor = 'var(--overlay-on-light-10)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <h5 style={{ margin: '0', fontSize: '15px', fontWeight: '600', color: 'var(--text-accent)' }}>FreeJ2ME-Plus</h5>
              <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>↗</span>
            </div>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--text-primary)' }}>{t('about.maintainer') + 'AShiningRay'}</p>
            <p style={{ margin: '0', fontSize: '13px', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
              {t('about.freej2mePlusDescription')}
            </p>
          </div>

          {/* KEmulator nnmod Card */}
          <div 
            style={{ 
              marginBottom: '12px', 
              padding: '16px', 
              backgroundColor: 'var(--background-secondary)',
              border: '1px solid var(--overlay-on-light-10)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={() => window.electronAPI?.openExternal?.('https://github.com/shinovon/KEmulator')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--overlay-on-light-08)';
              e.currentTarget.style.borderColor = 'var(--overlay-on-light-20)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--background-secondary)';
              e.currentTarget.style.borderColor = 'var(--overlay-on-light-10)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <h5 style={{ margin: '0', fontSize: '15px', fontWeight: '600', color: 'var(--text-accent)' }}>KEmulator nnmod</h5>
              <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>↗</span>
            </div>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--text-primary)' }}>{t('about.maintainer') + 'shinovon'}</p>
            <p style={{ margin: '0', fontSize: '13px', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
              {t('about.kemulatorDescription')}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div style={{ 
          height: '1px', 
          background: 'var(--divider-rail)', 
          margin: '24px 0' 
        }} />

        {/* Contributors Sci‑fi Network Card */}
        <div style={{ marginBottom: '24px' }}>
          <AboutNetworkCard
            developer={{ id: 'magstic', name: 'Magstic (Developer)', link: 'https://magstic.art' , avatarUrl: getAvatar('magstic') }}
            testers={[
              { id: 'lavinia-616', name: 'lavinia-616 (Tester)', link: 'https://github.com/lavinia-616', avatarUrl: getAvatar('lavinia') },
              { id: 'marisa', name: 'Marisa (Tester)', avatarUrl: getAvatar('marisa') },
            ]}
            paused={!isOpen}
          />
        </div>
      </div>
    </ModalHeaderOnly>
  );
}
