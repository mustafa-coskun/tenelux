import React, { useEffect, useState } from 'react';
import { getNotificationService, Notification, NotificationType, LoadingState } from '../services/NotificationService';
import './NotificationCenter.css';

interface NotificationItemProps {
  notification: Notification;
  onRemove: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onRemove }) => {
  const getIcon = (type: NotificationType): string => {
    switch (type) {
      case NotificationType.SUCCESS:
        return '✅';
      case NotificationType.INFO:
        return 'ℹ️';
      case NotificationType.WARNING:
        return '⚠️';
      case NotificationType.ERROR:
        return '❌';
      case NotificationType.LOADING:
        return '⏳';
      default:
        return 'ℹ️';
    }
  };

  const getClassName = (type: NotificationType): string => {
    const baseClass = 'notification-item';
    switch (type) {
      case NotificationType.SUCCESS:
        return `${baseClass} notification-success`;
      case NotificationType.INFO:
        return `${baseClass} notification-info`;
      case NotificationType.WARNING:
        return `${baseClass} notification-warning`;
      case NotificationType.ERROR:
        return `${baseClass} notification-error`;
      case NotificationType.LOADING:
        return `${baseClass} notification-loading`;
      default:
        return `${baseClass} notification-info`;
    }
  };

  return (
    <div className={getClassName(notification.type)}>
      <div className="notification-header">
        <span className="notification-icon">{getIcon(notification.type)}</span>
        <span className="notification-title">{notification.title}</span>
        {!notification.persistent && (
          <button 
            className="notification-close"
            onClick={() => onRemove(notification.id)}
            aria-label="Bildirimi kapat"
          >
            ×
          </button>
        )}
      </div>
      
      <div className="notification-message">
        {notification.message.split('\n').map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
      
      {notification.actions && notification.actions.length > 0 && (
        <div className="notification-actions">
          {notification.actions.map((action, index) => (
            <button
              key={index}
              className={`notification-action notification-action-${action.style || 'secondary'}`}
              onClick={() => {
                action.action();
                onRemove(notification.id);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface LoadingOverlayProps {
  loadingState: LoadingState;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ loadingState }) => {
  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-spinner"></div>
        <div className="loading-message">{loadingState.message}</div>
        
        {loadingState.progress !== undefined && (
          <div className="loading-progress">
            <div className="loading-progress-bar">
              <div 
                className="loading-progress-fill"
                style={{ width: `${loadingState.progress}%` }}
              ></div>
            </div>
            <div className="loading-progress-text">{Math.round(loadingState.progress)}%</div>
          </div>
        )}
        
        {loadingState.subMessage && (
          <div className="loading-sub-message">{loadingState.subMessage}</div>
        )}
        
        {loadingState.cancellable && loadingState.onCancel && (
          <button 
            className="loading-cancel"
            onClick={loadingState.onCancel}
          >
            İptal
          </button>
        )}
      </div>
    </div>
  );
};

const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingStates, setLoadingStates] = useState<LoadingState[]>([]);
  const notificationService = getNotificationService();

  useEffect(() => {
    // Subscribe to notifications
    const unsubscribeNotifications = notificationService.subscribe(setNotifications);
    
    // Subscribe to loading states
    const unsubscribeLoading = notificationService.subscribeToLoading(setLoadingStates);

    return () => {
      unsubscribeNotifications();
      unsubscribeLoading();
    };
  }, [notificationService]);

  const handleRemoveNotification = (id: string) => {
    notificationService.remove(id);
  };

  return (
    <>
      {/* Loading overlays */}
      {loadingStates.map(loadingState => (
        <LoadingOverlay key={loadingState.id} loadingState={loadingState} />
      ))}
      
      {/* Notification container */}
      {notifications.length > 0 && (
        <div className="notification-center">
          <div className="notification-list">
            {notifications.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onRemove={handleRemoveNotification}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default NotificationCenter;