import React, { useRef } from 'react';
import './FolderSelectDialog.css';
import ModalWithFooter from "../ModalWithFooter.jsx";

const FolderSelectDialog = ({ 
  isOpen, 
  folders = [], 
  onClose, 
  onSelect,
  title = "選擇資料夾",
  message = "請選擇要加入的資料夾："
}) => {
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
      title={title}
      size="md"
      requestCloseRef={requestCloseRef}
      footer={
        <div className="folder-select-footer">
          {/* 使用共用按鈕樣式，統一尺寸與風格 */}
          <button className="btn btn-secondary" onClick={() => requestCloseRef.current && requestCloseRef.current()}>
            取消
          </button>
        </div>
      }
    >
      <div className="folder-select-content">
        <p className="folder-select-message">{message}</p>
        {folders.length === 0 ? (
          <div className="no-folders">
            <div className="no-folders-icon">📁</div>
            <p>沒有可用的資料夾</p>
            <p className="no-folders-hint">請先創建一個資料夾</p>
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
                    {folder.gameCount || 0} 個遊戲
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
