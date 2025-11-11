import React from 'react';
import ResponsiveModal from './ResponsiveModal';
import './ResponsiveDialog.css';

interface ResponsiveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  type?: 'info' | 'warning' | 'error' | 'success';
  showCancelButton?: boolean;
}

/**
 * Responsive dialog component for confirmations and alerts
 * Built on top of ResponsiveModal with predefined action buttons
 */
const ResponsiveDialog: React.FC<ResponsiveDialogProps> = ({
  isOpen,
  onClose,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'info',
  showCancelButton = true,
}) => {
  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'warning':
        return '⚠';
      case 'error':
        return '✕';
      case 'info':
      default:
        return 'ℹ';
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      mobileFullScreen={false}
      showCloseButton={false}
      className="responsive-dialog"
    >
      <div className={`dialog-content dialog-${type}`}>
        <div className="dialog-icon">{getIcon()}</div>
        <p className="dialog-message">{message}</p>
      </div>

      <div className="dialog-actions">
        {showCancelButton && (
          <button className="dialog-btn dialog-btn-cancel" onClick={handleCancel}>
            {cancelText}
          </button>
        )}
        <button
          className={`dialog-btn dialog-btn-confirm dialog-btn-${type}`}
          onClick={handleConfirm}
        >
          {confirmText}
        </button>
      </div>
    </ResponsiveModal>
  );
};

export default ResponsiveDialog;
