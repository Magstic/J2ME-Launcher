import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './NotificationBubble.css';
import { useTranslation } from '@hooks/useTranslation';

const NotificationBubble = () => {
    const [notifications, setNotifications] = useState([]);
    const { t } = useTranslation();

  // 添加通知
  const addNotification = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    const notification = { id, message, type, duration };
    
    setNotifications(prev => [...prev, notification]);
    
    // 自動移除通知
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  }, []);

  // 監聽全域事件
  useEffect(() => {
    try { console.debug('[NotificationBubble] Mounting and attaching listeners'); } catch (_) {}
    const handleShortcutSuccess = (e) => {
      const { count = 1 } = (e && e.detail) || {};
      try { console.debug('[NotificationBubble] Received shortcut-created', { count }); } catch (_) {}
      addNotification(`✅ ${t('notification.success')}${count > 1 ? ` ×${count}` : ''}`, 'success');
    };

    const handleShortcutError = (e) => {
      const { count = 1, error } = (e && e.detail) || {};
      try { console.debug('[NotificationBubble] Received shortcut-error', { count, error }); } catch (_) {}
      if (count === 1) {
        addNotification(`❌ ${t('notification.failure')}: ${error || ''}`.trim(), 'error', 5000);
      } else {
        addNotification(`⚠️ ${t('notification.partialFailure')}: ${error || ''}`.trim(), 'warning', 5000);
      }
    };

    const handleDropboxUrlCopied = () => {
      try { console.debug('[NotificationBubble] Received dropbox-url-copied'); } catch (_) {}
      addNotification(`📃 ${t('notification.dropboxUrlCopied')}`, 'warning', 10000);
    };

    // 註冊全域事件監聽器（僅 window，避免與 document 冒泡造成重複觸發）
    window.addEventListener('shortcut-created', handleShortcutSuccess);
    window.addEventListener('shortcut-error', handleShortcutError);
    window.addEventListener('dropbox-url-copied', handleDropboxUrlCopied);

    return () => {
      window.removeEventListener('shortcut-created', handleShortcutSuccess);
      window.removeEventListener('shortcut-error', handleShortcutError);
      window.removeEventListener('dropbox-url-copied', handleDropboxUrlCopied);
    };
  }, [addNotification, t]);

  if (notifications.length === 0) return null;

  return createPortal(
    <div className="notification-container">
      {notifications.map(notification => (
        <div 
          key={notification.id} 
          className={`notification-bubble notification-${notification.type}`}
        >
          <span className="notification-message">{notification.message}</span>
        </div>
      ))}
    </div>,
    document.body
  );
};

export default NotificationBubble;
