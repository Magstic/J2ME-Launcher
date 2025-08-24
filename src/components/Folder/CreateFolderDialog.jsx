import React, { useState, useEffect, useRef } from 'react';
import './Folder.css';
import '../DirectoryManager.css';
import { ModalWithFooter } from '@ui';

/**
 * 創建資料夾對話框組件
 */
const CreateFolderDialog = ({
  isOpen,
  onClose,
  onConfirm,
  initialData = null,
  mode = 'create' // 'create' | 'edit'
}) => {
  const requestCloseRef = useRef(null);
  const nameInputRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '📁',
    color: '#4a90e2'
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeName, setShakeName] = useState(false); // 名稱輸入抖動

  // 預設圖標選項
  const iconOptions = [
    '📁', '📂', '🎮', '🎯', '🎲', '🎪', '🎨', '🎭', 
    '🎳', '🎸', '🎹', '🎺', '🎻', '🎤', '🏆', '🎖️',
    '⚡', '🔥', '💎', '⭐', '🌟', '✨', '🎊', '🎉'
  ];

  // 預設顏色選項
  const colorOptions = [
    '#4a90e2', '#5cb85c', '#f0ad4e', '#d9534f',
    '#5bc0de', '#9b59b6', '#e67e22', '#1abc9c',
    '#34495e', '#95a5a6', '#e74c3c', '#3498db'
  ];

  // 初始化表單數據
  useEffect(() => {
    if (isOpen) {
      if (initialData && mode === 'edit') {
        setFormData({
          name: initialData.name || '',
          description: initialData.description || '',
          icon: initialData.icon || '📁',
          color: initialData.color || '#4a90e2'
        });
      } else {
        setFormData({
          name: '',
          description: '',
          icon: '📁',
          color: '#4a90e2'
        });
      }
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, initialData, mode]);

  // 處理輸入變更
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // 清除相關錯誤
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  // 驗證表單
  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = '資料夾名稱不能為空';
    } else if (formData.name.trim().length > 50) {
      newErrors.name = '資料夾名稱不能超過50個字符';
    }

    if (formData.description.length > 200) {
      newErrors.description = '描述不能超過200個字符';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 處理確認
  const handleConfirm = async () => {
    if (!validateForm()) {
      // 若名稱為空，觸發抖動動畫
      if (!formData.name.trim()) {
        if (nameInputRef.current) nameInputRef.current.focus();
        setShakeName(false);
        // 先關一次以允許重新觸發動畫
        requestAnimationFrame(() => {
          setShakeName(true);
          setTimeout(() => setShakeName(false), 400);
        });
      }
      return;
    }

    setIsSubmitting(true);

    try {
      await onConfirm({
        ...formData,
        name: formData.name.trim(),
        description: formData.description.trim()
      });
      if (requestCloseRef.current) requestCloseRef.current();
    } catch (error) {
      console.error('創建/編輯資料夾失敗:', error);
      setErrors({ submit: '操作失敗，請重試' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 處理取消
  const handleCancel = () => {
    if (requestCloseRef.current) requestCloseRef.current();
  };

  // 處理鍵盤事件
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleConfirm();
    } else if (event.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? '創建資料夾' : '編輯資料夾'}
      size="md"
      requestCloseRef={requestCloseRef}
      bodyClassName=""
      footer={
        <div className="flex gap-8 push-right">
          <button 
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            取消
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? '處理中...' : (mode === 'create' ? '創建' : '保存')}
          </button>
        </div>
      }
    >
        <div onKeyDown={handleKeyDown}>
          {/* 兩欄佈局：左側預覽（方形，跨兩行）；右側名稱與描述輸入框 */}
          <div className="create-folder-two-col">
            {/* 左：預覽（跨兩行） */}
            <div className="left-preview" aria-label="預覽">
              <div className="folder-preview compact">
                <div 
                  className="preview-folder-card"
                  style={{ '--folder-color': formData.color }}
                >
                  <div className="folder-icon">
                    <span className="folder-emoji">{formData.icon}</span>
                    <div className="folder-badge" style={{ backgroundColor: formData.color }}>
                      0
                    </div>
                  </div>
                  <div className="folder-name">
                    {formData.name || '新資料夾'}
                  </div>
                </div>
              </div>
            </div>

            {/* 右上：名稱 */}
            <div className="right-fields">
              <div className="form-group">
                <label htmlFor="folder-name">資料夾名稱 *</label>
                <div className="input-with-overlay">
                  <input
                    id="folder-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder={errors.name && !formData.name ? errors.name : '輸入資料夾名稱'}
                    maxLength={20}
                    autoFocus
                    ref={nameInputRef}
                    aria-invalid={!!errors.name}
                    className={`${errors.name ? 'error' : ''} ${shakeName ? 'shake' : ''}`.trim()}
                  />
                  {errors.name && !!formData.name && (
                    <span className="input-overlay-error" aria-live="polite">{errors.name}</span>
                  )}
                </div>
                {/* 名稱錯誤改為在輸入框內以 placeholder 顯示 */}
              </div>

              {/* 右下：描述 */}
              <div className="form-group form-group--description">
                <label htmlFor="folder-description">描述</label>
                <textarea
                  id="folder-description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="輸入資料夾描述（可選）"
                  maxLength={200}
                  rows={3}
                  className={errors.description ? 'error' : ''}
                />
                {errors.description && <span className="error-text">{errors.description}</span>}
              </div>
            </div>
          </div>

          {/* 圖標選擇 */}
          <div className="form-group">
            <label>圖標</label>
            <div className="icon-selector">
              {iconOptions.map(icon => (
                <button
                  key={icon}
                  type="button"
                  className={`icon-option ${formData.icon === icon ? 'selected' : ''}`}
                  onClick={() => handleInputChange('icon', icon)}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* 顏色選擇 */}
          <div className="form-group">
            <label>顏色</label>
            <div className="color-selector">
              {colorOptions.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`color-option ${formData.color === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => handleInputChange('color', color)}
                  aria-label={`選擇顏色 ${color}`}
                />
              ))}
            </div>
          </div>

          {/* 預覽已移至頂部 */}

          {errors.submit && (
            <div className="error-message">{errors.submit}</div>
          )}
        </div>
    </ModalWithFooter>
  );
};

export default CreateFolderDialog;
