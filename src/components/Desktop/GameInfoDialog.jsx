import React, { useEffect, useRef } from 'react';
import './GameInfoDialog.css';
import '../DirectoryManager.css';
import { ModalHeaderOnly } from '@ui';
import { useTranslation } from '@hooks/useTranslation';

const GameInfoDialog = ({ 
  isOpen, 
  game, 
  onClose
}) => {
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const { t } = useTranslation();


  // 阻止滾輪與鍵盤方向鍵導致滾動
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('wheel', prevent, { passive: false });
    const onKeyDown = (e) => {
      const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Space'];
      if (keys.includes(e.key)) prevent(e);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      el.removeEventListener('wheel', prevent);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [isOpen]);

  if (!isOpen || !game) return null;

  // 格式化檔案大小
  const formatFileSize = (bytes) => {
    if (!bytes) return '未知';
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  // 格式化日期
  const formatDate = (dateString) => {
    if (!dateString) return '未知';
    try {
      return new Date(dateString).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '未知';
    }
  };

  // 獲取檔案名
  const getFileName = () => {
    if (!game.filePath) return '未知';
    return game.filePath.split(/[/\\]/).pop();
  };

  // 獲取檔案目錄
  const getFileDirectory = () => {
    if (!game.filePath) return '未知';
    const parts = game.filePath.split(/[/\\]/);
    parts.pop(); // 移除檔案名
    return parts.join('/') || '根目錄';
  };

  return (
    <ModalHeaderOnly isOpen={isOpen} onClose={onClose} title={t('gameInfo.title')} size="md">
      {/* 遊戲圖標和基本信息 */}
      <div className="game-info-main" ref={dialogRef}>
        <div className="game-icon-large">
          {game.iconUrl ? (
            <img src={game.iconUrl} alt={(game.gameName || game.name || getFileName() || 'N/A')} />
          ) : (
            <div className="game-icon-placeholder">🎮</div>
          )}
        </div>
        <div className="game-basic-info">
          <h3 className="game-title">{game.gameName || game.name || getFileName() || 'N/A'}</h3>
          <p className="game-filename">{getFileName()}</p>
        </div>
      </div>

      {/* 詳細信息 */}
      <div className="game-details">
        <div className="detail-section">
          <h4>{t('gameInfo.detailSection')}</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">{t('gameInfo.size')}</span>
              <span className="detail-value">{formatFileSize(game.size)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t('gameInfo.path')}</span>
              <span className="detail-value" title={getFileDirectory()}>
                {getFileDirectory()}
              </span>
            </div>
          </div>
        </div>

        {/* 遊戲信息 */}
        {(game.manifest || game.version || game.vendor) && (
          <div className="detail-section">
            <h4>{t('gameInfo.detailSection')}</h4>
            <div className="detail-grid">
              {game.version && (
                <div className="detail-item">
                  <span className="detail-label">{t('gameInfo.ver')}</span>
                  <span className="detail-value">{game.version}</span>
                </div>
              )}
              {game.vendor && (
                <div className="detail-item">
                  <span className="detail-label">{t('gameInfo.vendor')}</span>
                  <span className="detail-value">{game.vendor}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 分類信息 */}
        {game.categories && game.categories.length > 0 && (
          <div className="detail-section">
            <h4>分類</h4>
            <div className="categories">
              {game.categories.map((category, index) => (
                <span key={index} className="category-tag">
                  {category}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalHeaderOnly>
  );
};

export default GameInfoDialog;
