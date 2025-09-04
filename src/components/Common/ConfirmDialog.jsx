import React, { useRef } from 'react';
import '../DirectoryManager.css';
import { ModalWithFooter } from '@ui';

const ConfirmDialog = ({
  isOpen,
  title = '確認操作',
  message = '',
  confirmText = '確認',
  cancelText = '取消',
  variant = 'primary', // 'primary' | 'danger'
  onConfirm,
  onCancel,
  onClose,
}) => {
  if (!isOpen) return null;

  // 使用 ModalWithFooter 的動畫關閉能力
  const requestCloseRef = useRef(null);
  const lastActionRef = useRef(null); // 'confirm' | 'cancel' | null

  const handleClose = () => {
    // 在動畫完成後觸發對應回調
    if (lastActionRef.current === 'confirm' && onConfirm) {
      onConfirm();
    } else if (lastActionRef.current === 'cancel' && onCancel) {
      onCancel();
    } else {
      onClose ? onClose() : onCancel && onCancel();
    }
    lastActionRef.current = null;
  };

  const handleCancelClick = () => {
    lastActionRef.current = 'cancel';
    if (requestCloseRef.current) requestCloseRef.current();
  };

  const handleConfirmClick = () => {
    lastActionRef.current = 'confirm';
    if (requestCloseRef.current) requestCloseRef.current();
  };

  return (
    <ModalWithFooter
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="sm"
      requestCloseRef={requestCloseRef}
      actions={[
        { key: 'cancel', label: cancelText, variant: 'secondary', onClick: handleCancelClick },
        { key: 'confirm', label: confirmText, variant: variant === 'danger' ? 'danger' : 'primary', onClick: handleConfirmClick, autoFocus: true, allowFocusRing: true },
      ]}
    >
      <div className="modal-message" style={{ whiteSpace: 'pre-line' }}>{message}</div>
    </ModalWithFooter>
  );
};

export default ConfirmDialog;

