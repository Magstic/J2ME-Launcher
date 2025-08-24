import React, { useState } from 'react';
import { ModalWithFooter, Card } from '@ui';

const WelcomeGuideDialog = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const steps = [
    {
      id: 'welcome',
      title: '歡迎使用 J2ME Launcher',
      icon: '☕',
      content: (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>☕</div>
          <p style={{ margin: '0 0 24px 0', fontSize: '16px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            現代化的 J2ME 前端（Front-end）<br/>
            讓我們花幾分鐘進行基本設定，從而快速上手
          </p>
          <div style={{ 
            padding: '16px', 
            backgroundColor: 'var(--overlay-on-light-05)',
            borderRadius: '8px',
            border: '1px solid var(--overlay-on-light-12)'
          }}>
            <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              💡 所有設定都是可選的，您可以隨時跳過或稍後配置
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'emulator',
      title: '模擬器配置',
      icon: '⚙️',
      description: '設定 J2ME 模擬器路徑',
      content: (
        <div style={{ padding: '20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '32px', marginRight: '12px' }}>⚙️</span>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600' }}>模擬器配置</h3>
              <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                因 Lisence 的不相容，本程式不提供模擬器，請自行下載：
              </p>
            </div>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'grid', gap: '8px' }}>
              <Card style={{ padding: '12px', cursor: 'pointer' }} onClick={() => window.electronAPI?.openExternal?.('https://github.com/TASEmulators/freej2me-plus')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--overlay-on-light-12)', borderRadius: '8px', padding: '12px' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>FreeJ2ME-Plus</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>J2ME EMU 的後起之秀。不僅與多種 J2ME 規範相容，而且同時提供了 AWT 前端和 Libretro 核心。</div>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>↗</span>
                </div>
              </Card>
              <Card style={{ padding: '12px', cursor: 'pointer' }} onClick={() => window.electronAPI?.openExternal?.('https://github.com/shinovon/KEmulator')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--overlay-on-light-12)', borderRadius: '8px', padding: '12px' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>KEmulator nnmod</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>老牌模擬器 KEmulator 的逆向工程，在進行諸多優化的同時，也提供了多桌面平台的支援。</div>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>↗</span>
                </div>
              </Card>
            </div>
          </div>

          <button 
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
            onClick={() => {
              // 觸發模擬器配置，但不關閉引導
              window.dispatchEvent(new CustomEvent('open-emulator-config-from-guide'));
              // 標記此步驟為已完成並進入下一步
              setCompletedSteps(prev => new Set([...prev, 'emulator']));
              nextStep();
            }}
          >
            立即配置模擬器
          </button>
        </div>
      )
    },
    {
      id: 'roms',
      title: 'ROM 目錄',
      icon: '📁',
      description: '選擇遊戲檔案存放位置',
      content: (
        <div style={{ padding: '20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '32px', marginRight: '12px' }}>📁</span>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600' }}>配置 ROM 資料夾</h3>
              <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                選擇包含 J2ME 遊戲檔案的資料夾
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>支援的 J2ME 規範：</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                borderRadius: '12px',
                padding: '12px', 
                border: '1px solid var(--overlay-on-light-12)',
                backgroundColor: 'var(--overlay-on-light-05)'
              }}>
                <span style={{ fontSize: '20px' }}>📱</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>J2ME-MIDP</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>流行的 J2ME 標準規範，其 ROM 檔的後綴為 <code>.jar</code>。</div>
                </div>
              </div>
            </div>
          </div>

          <button 
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
            onClick={() => {
              // 觸發目錄管理器，但不關閉引導
              window.dispatchEvent(new CustomEvent('open-directory-manager-from-guide'));
              // 標記此步驟為已完成並進入下一步
              setCompletedSteps(prev => new Set([...prev, 'roms']));
              nextStep();
            }}
          >
            配置 ROM 資料夾
          </button>
        </div>
      )
    },
    {
      id: 'cloud',
      title: '雲端備份',
      icon: '☁️',
      description: '配置雲端同步服務（可選）',
      content: (
        <div style={{ padding: '20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '32px', marginRight: '12px' }}>☁️</span>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600' }}>雲端備份</h3>
              <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                保護您的軟體配置和遊戲存檔
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>支援的雲端服務：</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                borderRadius: '12px',
                padding: '12px', 
                border: '1px solid var(--overlay-on-light-12)',
                backgroundColor: 'var(--overlay-on-light-05)'
              }}>
                <span style={{ fontSize: '16px' }}>📦</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '12px' }}>Dropbox</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>簡單易用</div>
                </div>
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                borderRadius: '12px',
                padding: '12px', 
                border: '1px solid var(--overlay-on-light-12)',
                backgroundColor: 'var(--overlay-on-light-05)'
              }}>
                <span style={{ fontSize: '16px' }}>🌐</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '12px' }}>WebDAV</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>通用協議</div>
                </div>
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                borderRadius: '12px',
                padding: '12px', 
                border: '1px solid var(--overlay-on-light-12)',
                backgroundColor: 'var(--overlay-on-light-05)'
              }}>
                <span style={{ fontSize: '16px' }}>☁️</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '12px' }}>S3 API</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>相容服務</div>
                </div>
              </div>
            </div>
          </div>

          <button 
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
            onClick={() => {
              // 觸發備份配置，但不關閉引導
              window.dispatchEvent(new CustomEvent('open-backup-config-from-guide'));
              // 標記此步驟為已完成並進入下一步
              setCompletedSteps(prev => new Set([...prev, 'cloud']));
              nextStep();
            }}
          >
            配置雲端備份
          </button>
        </div>
      )
    },
    {
      id: 'tutorial',
      title: '基本操作',
      icon: '🎯',
      description: '基本使用方式',
      content: (
        <div style={{ padding: '20px 0' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Card style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px',borderRadius: '12px',padding: '12px', border: '1px solid var(--overlay-on-light-12)' }}>
                <span style={{ fontSize: '20px' }}>⚔️</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>啟動遊戲</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>雙擊遊戲卡片即可啟動</div>
                </div>
              </div>
            </Card>

            <Card style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px',borderRadius: '12px',padding: '12px', border: '1px solid var(--overlay-on-light-12)' }}>
                <span style={{ fontSize: '20px' }}>📁</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>整理遊戲</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>拖拽遊戲到左側資料夾進行分類</div>
                </div>
              </div>
            </Card>

            <Card style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px',borderRadius: '12px',padding: '12px', border: '1px solid var(--overlay-on-light-12)' }}>
                <span style={{ fontSize: '20px' }}>🔍</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>搜尋遊戲</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>使用頂部搜尋列快速找到遊戲</div>
                </div>
              </div>
            </Card>

            <Card style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px',borderRadius: '12px',padding: '12px', border: '1px solid var(--overlay-on-light-12)' }}>
                <span style={{ fontSize: '20px' }}>⚙️</span>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>遊戲設定</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>右鍵遊戲卡片可進行個別設定</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )
    },
    {
      id: 'complete',
      title: '設定完成',
      icon: '✅',
      description: '在 J2ME 的海洋中遨游吧',
      content: (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: '600' }}>
            設定完成
          </h2>
          <p style={{ margin: '0 0 24px 0', fontSize: '16px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            您已經準備好開始使用 J2ME Launcher<br/>
            現在可以透過該程式管理您的 J2ME 收藏了！
          </p>

          <button 
            style={{
              padding: '12px 24px',
              backgroundColor: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
            onClick={() => {
              onComplete();
              onClose();
            }}
          >
            開始使用 J2ME Launcher
          </button>
        </div>
      )
    }
  ];

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

  const skipStep = () => {
    setCompletedSteps(prev => new Set([...prev, steps[currentStep].id]));
    nextStep();
  };

  const currentStepData = steps[currentStep];

  // Define footer actions based on current step
  const getFooterActions = () => {
    const actions = [];
    
    // Previous button
    if (currentStep > 0) {
      actions.push({
        key: 'prev',
        label: '上一步',
        variant: 'secondary',
        onClick: prevStep
      });
    }
    
    // Skip button (only show for middle steps)
    if (currentStep > 0 && currentStep < steps.length - 1) {
      actions.push({
        key: 'skip',
        label: '跳過',
        variant: 'secondary',
        onClick: skipStep
      });
    }
    
    // Next/Complete button
    if (currentStep < steps.length - 1) {
      actions.push({
        key: 'next',
        label: '下一步',
        variant: 'primary',
        onClick: nextStep
      });
    } else {
      actions.push({
        key: 'later',
        label: '稍後設定',
        variant: 'secondary',
        onClick: onClose
      });
    }
    
    return actions;
  };

  return (
    <div style={{ zIndex: 9999 }}>
      <ModalWithFooter 
        isOpen={isOpen} 
        onClose={onClose} 
        title="快速設定指南" 
        size="lg"
        actions={getFooterActions()}
        bodyClassName="welcome-guide-body"
      >
        <div style={{ 
          padding: '0',  
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'space-between'
        }}>
        {/* Progress Bar */}
        <div style={{ 
          padding: '20px 24px 0 24px',
          borderBottom: '1px solid var(--overlay-on-light-10)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  backgroundColor: index <= currentStep ? 'var(--accent-color)' : 'var(--overlay-on-light-10)',
                  color: index <= currentStep ? 'white' : 'var(--text-secondary)',
                  fontWeight: '600'
                }}>
                  {index < currentStep ? '✓' : step.icon}
                </div>
                {index < steps.length - 1 && (
                  <div style={{
                    flex: 1,
                    height: '2px',
                    backgroundColor: index < currentStep ? 'var(--accent-color)' : 'var(--overlay-on-light-10)',
                    margin: '0 8px'
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>
          <div style={{ textAlign: 'center', paddingBottom: '16px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600' }}>
              {currentStepData.title}
            </h3>
            <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {currentStepData.description}
            </p>
          </div>
        </div>

        {/* Step Content */}
        <div style={{ 
          padding: '0 24px', 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'stretch'
        }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '300px'
          }}>
            {currentStepData.content}
          </div>
        </div>
      </div>
      </ModalWithFooter>
    </div>
  );
};

export default WelcomeGuideDialog;
