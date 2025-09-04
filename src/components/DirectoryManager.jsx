import React, { useState, useEffect, useRef } from 'react';
import './DirectoryManager.css';
import { ModalWithFooter } from '@ui';
import { useTranslation } from '@hooks/useTranslation';

function DirectoryManager({ isOpen, onClose, onDirectoriesChanged }) {
  const { t } = useTranslation();

  const [directories, setDirectories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const requestCloseRef = useRef(null);
  // 刪除資料夾確認對話框
  const [confirmRemove, setConfirmRemove] = useState({ isOpen: false, directoryPath: null });
  const confirmRemoveCloseRef = useRef(null);

  // 當外部再次打開時
  useEffect(() => {
    if (!isOpen) return;
  }, [isOpen]);

  // 載入目錄列表
  useEffect(() => {
    if (isOpen) {
      loadDirectories();
    }
  }, [isOpen]);

  const loadDirectories = async () => {
    try {
      const dirs = await window.electronAPI.getDirectories();
      setDirectories(dirs);
    } catch (error) {
      console.error('載入目錄失敗:', error);
    }
  };

  // 添加新目錄
  const handleAddDirectories = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.addDirectories();
      if (result.success) {
        await loadDirectories(); // 重新載入目錄列表
        
        // 顯示添加結果
        if (result.addedDirectories.length > 0) {
          console.log(`成功添加 ${result.addedDirectories.length} 個目錄`);
        }
        if (result.existingDirectories.length > 0) {
          console.log(`${result.existingDirectories.length} 個目錄已存在`);
        }
      }
    } catch (error) {
      console.error('添加目錄失敗:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 觸發刪除確認對話框
  const handleRemoveDirectory = (directoryPath) => {
    setConfirmRemove({ isOpen: true, directoryPath });
  };

  // 確認刪除目錄
  const performRemoveDirectory = async () => {
    const path = confirmRemove.directoryPath;
    if (!path) {
      // 未選定路徑則直接關閉
      setConfirmRemove({ isOpen: false, directoryPath: null });
      return;
    }
    try {
      const result = await window.electronAPI.removeDirectory(path);
      if (result?.success) {
        await loadDirectories();
        onDirectoriesChanged?.();
      }
    } catch (error) {
      console.error('移除目錄失敗:', error);
    }
    // 觸發漸出動畫，動畫結束後由 onClose 重置狀態
    if (confirmRemoveCloseRef.current) confirmRemoveCloseRef.current();
  };

  // 啟用/禁用目錄
  const handleToggleDirectory = async (directoryPath, enabled) => {
    try {
      await window.electronAPI.toggleDirectory(directoryPath, enabled);
      await loadDirectories();
    } catch (error) {
      console.error('切換目錄狀態失敗:', error);
    }
  };

  // 執行掃描
  const handleScan = async (forceFullScan = false) => {
    setIsLoading(true);
    setScanProgress({ message: t('directoryManager.state'), details: '' });
    
    try {
      const result = await window.electronAPI.scanDirectories(forceFullScan);
      
      if (result.success) {
        setScanProgress({
          message: t('directoryManager.over'),
          details: t('directoryManager.gain', { count: result.scanResult.summary.totalNewGames })
        });
        
        // 重新載入目錄列表以顯示更新的掃描時間
        await loadDirectories();
        
        // 通知父組件更新遊戲列表
        onDirectoriesChanged?.();
        
        // 3秒後清除進度信息
        setTimeout(() => setScanProgress(null), 3000);
      } else {
        setScanProgress({
          message: t('directoryManager.error'),
          details: result.error || t('directoryManager.log')
        });
      }
    } catch (error) {
      console.error('掃描失敗:', error);
      setScanProgress({
        message: t('directoryManager.error'),
        details: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 僅當完全關閉時不渲染（容器負責關閉動畫）
  if (!isOpen) return null;

  return (
    <>
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title={t('directoryManager.title')}
      size="md"
      className="directory-manager-specific"
      requestCloseRef={requestCloseRef}
      footer={
        <>
          <div className="directory-stats">
            {directories.length > 0 && (
              <span>
                {t('directoryManager.stats', { count: directories.length, enabledCount: directories.filter(d => d.enabled).length })}
              </span>
            )}
          </div>
          <div className="flex gap-8 push-right">
            <button className="btn btn-secondary" onClick={() => requestCloseRef.current && requestCloseRef.current()}>
              {t('app.close')}
            </button>
          </div>
        </>
      }
    >
        <div>
          {/* 操作按鈕區 */}
          <div className="action-buttons">
            <button 
              className="btn btn-primary" 
              onClick={handleAddDirectories}
              disabled={isLoading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              {t('directoryManager.add')}
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={() => handleScan(false)}
              disabled={isLoading || directories.length === 0}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
              </svg>
              {t('directoryManager.scan')}
            </button>
            
            <button 
              className="btn btn-warning" 
              onClick={() => handleScan(true)}
              disabled={isLoading || directories.length === 0}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
              </svg>
              {t('directoryManager.fullScan')}
            </button>
          </div>

          {/* 掃描進度 */}
          {scanProgress && (
            <div className="scan-progress">
              <div className="progress-message">{scanProgress.message}</div>
              {scanProgress.details && (
                <div className="progress-details">{scanProgress.details}</div>
              )}
            </div>
          )}

          {/* 目錄列表 */}
          <div className={`directory-list ${directories.length === 0 ? 'empty' : ''}`}>
            {directories.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📁</div>
                <p>{t('directoryManager.empty')}</p>
                <p className="empty-hint">{t('directoryManager.emptyHint')}</p>
              </div>
            ) : (
              directories.map((directory, index) => (
                <div key={index} className={`directory-item ${!directory.enabled ? 'disabled' : ''}`}>
                  <div className="directory-info">
                    <div className="directory-path" title={directory.path}>
                      {directory.path}
                    </div>
                    <div className="directory-meta">
                      {directory.lastScanTime ? (
                        <span className="last-scan">
                          {t('directoryManager.lastScan', { date: new Date(directory.lastScanTime).toLocaleString() })}
                        </span>
                      ) : (
                        <span className="never-scanned">{t('directoryManager.neverScanned')}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="directory-actions">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={directory.enabled}
                        onChange={(e) => handleToggleDirectory(directory.path, e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    
                    <button
                      className="btn-icon btn-danger"
                      onClick={() => handleRemoveDirectory(directory.path)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
    </ModalWithFooter>

    {/* 刪除資料夾確認彈窗（使用通用 ModalWithFooter） */}
    <ModalWithFooter
      isOpen={confirmRemove.isOpen}
      onClose={() => setConfirmRemove({ isOpen: false, directoryPath: null })}
      title={t('directoryManager.confirmRemove.title')}
      size="sm"
      requestCloseRef={confirmRemoveCloseRef}
      footer={
        <div className="flex gap-8 push-right">
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (confirmRemoveCloseRef.current) confirmRemoveCloseRef.current();
            }}
          >
            {t('app.cancel')}
          </button>
          <button
            className="btn btn-danger"
            onClick={performRemoveDirectory}
          >
            {t('app.delete')}
          </button>
        </div>
      }
    >
      <div>
        <p>{t('directoryManager.confirmRemove.message1')}</p>
        {confirmRemove.directoryPath && (
          <p style={{ wordBreak: 'break-all' }}>{confirmRemove.directoryPath}</p>
        )}
        <br />
        <p>{t('directoryManager.confirmRemove.message2')}</p>
      </div>
    </ModalWithFooter>
    </>
  );
}

export default DirectoryManager;
