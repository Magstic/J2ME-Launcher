import React, { useRef } from 'react';
import './FolderSelectDialog.css';
import ModalWithFooter from "../ModalWithFooter.jsx";
import { useTranslation } from '@hooks/useTranslation';

const FolderSelectDialog = ({ 
  isOpen, 
  folders = [], 
  onClose, 
  onSelect,
  // 新接口（推薦）：直接傳遞文案字串
  title,
  message,
  // 舊接口（兼容）：早期錯誤命名，實為字串而非回調
  onTitle,
  onMessage
}) => {
  const { t } = useTranslation();
  const effectiveTitle = (title ?? onTitle) ?? t('desktopManager.folderSelect.title');
  const effectiveMessage = (message ?? onMessage) ?? t('desktopManager.folderSelect.single');
  const requestCloseRef = useRef(null);
  if (!isOpen) return null;

  const handleFolderClick = (folder) => {
    onSelect(folder);
    if (requestCloseRef.current) requestCloseRef.current();
  };

  return (
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title={effectiveTitle}
      size="md"
      requestCloseRef={requestCloseRef}
      footer={
        <div className="folder-select-footer">
          {/* 使用共用按鈕樣式，統一尺寸與風格 */}
          <button className="btn btn-secondary" onClick={() => requestCloseRef.current && requestCloseRef.current()}>
            {t('app.cancel')}
          </button>
        </div>
      }
    >
      <div className="folder-select-content">
        <p className="folder-select-message">{effectiveMessage}</p>
        {folders.length === 0 ? (
          <div className="no-folders">
            <div className="no-folders-icon">📁</div>
            <p>{t('desktopManager.noFolder.message')}</p>
          </div>
        ) : (
          <div className="folder-list">
            {folders.map(folder => (
              <div
                key={folder.id}
                className="folder-item"
                onClick={() => handleFolderClick(folder)}
              >
                <div className="folder-icon">📁</div>
                <div className="folder-info">
                  <div className="folder-name">{folder.name}</div>
                  <div className="folder-count">
                    {t('app.member')}：{folder.gameCount || 0}
                  </div>
                </div>
                <div className="folder-arrow">→</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalWithFooter>
  );
};

export default FolderSelectDialog;
