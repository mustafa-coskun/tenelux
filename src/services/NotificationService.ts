export enum NotificationType {
  SUCCESS = 'SUCCESS',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  LOADING = 'LOADING'
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number; // in milliseconds, 0 = persistent
  actions?: NotificationAction[];
  timestamp: Date;
  persistent?: boolean;
  context?: {
    operation?: string;
    userId?: string;
    sessionId?: string;
  };
}

export interface NotificationAction {
  label: string;
  action: () => void;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface LoadingState {
  id: string;
  message: string;
  progress?: number; // 0-100
  subMessage?: string;
  cancellable?: boolean;
  onCancel?: () => void;
}

class NotificationService {
  private notifications: Map<string, Notification> = new Map();
  private loadingStates: Map<string, LoadingState> = new Map();
  private subscribers: Array<(notifications: Notification[]) => void> = [];
  private loadingSubscribers: Array<(loadingStates: LoadingState[]) => void> = [];
  private nextId = 1;

  // Show a notification
  show(
    type: NotificationType,
    title: string,
    message: string,
    options?: {
      duration?: number;
      actions?: NotificationAction[];
      persistent?: boolean;
      context?: Notification['context'];
    }
  ): string {
    const id = `notification_${this.nextId++}`;
    
    const notification: Notification = {
      id,
      type,
      title,
      message,
      duration: options?.duration ?? this.getDefaultDuration(type),
      actions: options?.actions,
      timestamp: new Date(),
      persistent: options?.persistent ?? false,
      context: options?.context
    };

    this.notifications.set(id, notification);
    this.notifySubscribers();

    // Auto-remove after duration (unless persistent)
    if (notification.duration && notification.duration > 0 && !notification.persistent) {
      setTimeout(() => {
        this.remove(id);
      }, notification.duration);
    }

    console.log(`📢 Notification [${type}]: ${title} - ${message}`);
    return id;
  }

  // Show success notification
  success(title: string, message: string, options?: { duration?: number; actions?: NotificationAction[] }): string {
    return this.show(NotificationType.SUCCESS, title, message, options);
  }

  // Show info notification
  info(title: string, message: string, options?: { duration?: number; actions?: NotificationAction[] }): string {
    return this.show(NotificationType.INFO, title, message, options);
  }

  // Show warning notification
  warning(title: string, message: string, options?: { duration?: number; actions?: NotificationAction[] }): string {
    return this.show(NotificationType.WARNING, title, message, options);
  }

  // Show error notification
  error(title: string, message: string, options?: { duration?: number; actions?: NotificationAction[] }): string {
    return this.show(NotificationType.ERROR, title, message, {
      ...options,
      duration: options?.duration ?? 8000 // Errors stay longer by default
    });
  }

  // Show session recovery notifications
  showSessionRecoveryStart(sessionType?: string): string {
    return this.show(
      NotificationType.INFO,
      'Oturum Geri Yükleniyor',
      sessionType ? `${sessionType} oturumunuz geri yükleniyor...` : 'Oyun oturumunuz geri yükleniyor...',
      { persistent: true }
    );
  }

  showSessionRecoverySuccess(sessionType?: string): string {
    return this.success(
      'Oturum Geri Yüklendi',
      sessionType ? `${sessionType} oturumunuz başarıyla geri yüklendi.` : 'Oyun oturumunuz başarıyla geri yüklendi.',
      { duration: 4000 }
    );
  }

  showSessionRecoveryFailed(error?: string, actions?: NotificationAction[]): string {
    return this.error(
      'Oturum Geri Yüklenemedi',
      error || 'Oyun oturumunuz geri yüklenemedi. Ana menüden yeni bir oyun başlatabilirsiniz.',
      { 
        duration: 0, // Persistent until user acts
        actions: actions || [{
          label: 'Ana Menü',
          action: () => window.location.reload(),
          style: 'primary'
        }]
      }
    );
  }

  // Show connection status notifications
  showConnectionLost(): string {
    return this.show(
      NotificationType.WARNING,
      'Bağlantı Kesildi',
      'Sunucu bağlantısı kesildi. Yeniden bağlanmaya çalışılıyor...',
      { persistent: true }
    );
  }

  showReconnecting(attempt: number, maxAttempts: number): string {
    return this.show(
      NotificationType.INFO,
      'Yeniden Bağlanılıyor',
      `Bağlantı denemesi ${attempt}/${maxAttempts}...`,
      { persistent: true }
    );
  }

  showReconnected(): string {
    return this.success(
      'Bağlantı Kuruldu',
      'Sunucu bağlantısı yeniden kuruldu.',
      { duration: 3000 }
    );
  }

  showConnectionFailed(actions?: NotificationAction[]): string {
    return this.error(
      'Bağlantı Başarısız',
      'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.',
      {
        duration: 0,
        actions: actions || [{
          label: 'Yeniden Dene',
          action: () => window.location.reload(),
          style: 'primary'
        }]
      }
    );
  }

  // Show validation error notifications
  showValidationError(errors: string[]): string {
    const message = errors.length === 1 
      ? errors[0] 
      : `Birden fazla sorun tespit edildi:\n${errors.map(e => `• ${e}`).join('\n')}`;
    
    return this.error(
      'Veri Doğrulama Hatası',
      message,
      { duration: 6000 }
    );
  }

  // Remove a notification
  remove(id: string): void {
    if (this.notifications.delete(id)) {
      this.notifySubscribers();
    }
  }

  // Clear all notifications
  clear(): void {
    this.notifications.clear();
    this.notifySubscribers();
  }

  // Clear notifications by type
  clearByType(type: NotificationType): void {
    const toRemove: string[] = [];
    this.notifications.forEach((notification, id) => {
      if (notification.type === type) {
        toRemove.push(id);
      }
    });
    
    toRemove.forEach(id => this.notifications.delete(id));
    if (toRemove.length > 0) {
      this.notifySubscribers();
    }
  }

  // Get all notifications
  getAll(): Notification[] {
    return Array.from(this.notifications.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  // Subscribe to notification changes
  subscribe(callback: (notifications: Notification[]) => void): () => void {
    this.subscribers.push(callback);
    // Immediately call with current notifications
    callback(this.getAll());
    
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  // Loading state management
  showLoading(
    message: string,
    options?: {
      progress?: number;
      subMessage?: string;
      cancellable?: boolean;
      onCancel?: () => void;
    }
  ): string {
    const id = `loading_${this.nextId++}`;
    
    const loadingState: LoadingState = {
      id,
      message,
      progress: options?.progress,
      subMessage: options?.subMessage,
      cancellable: options?.cancellable ?? false,
      onCancel: options?.onCancel
    };

    this.loadingStates.set(id, loadingState);
    this.notifyLoadingSubscribers();

    console.log(`⏳ Loading: ${message}`);
    return id;
  }

  // Update loading state
  updateLoading(
    id: string,
    updates: {
      message?: string;
      progress?: number;
      subMessage?: string;
    }
  ): void {
    const loadingState = this.loadingStates.get(id);
    if (loadingState) {
      Object.assign(loadingState, updates);
      this.notifyLoadingSubscribers();
    }
  }

  // Hide loading state
  hideLoading(id: string): void {
    if (this.loadingStates.delete(id)) {
      this.notifyLoadingSubscribers();
    }
  }

  // Clear all loading states
  clearAllLoading(): void {
    this.loadingStates.clear();
    this.notifyLoadingSubscribers();
  }

  // Get all loading states
  getAllLoading(): LoadingState[] {
    return Array.from(this.loadingStates.values());
  }

  // Subscribe to loading state changes
  subscribeToLoading(callback: (loadingStates: LoadingState[]) => void): () => void {
    this.loadingSubscribers.push(callback);
    // Immediately call with current loading states
    callback(this.getAllLoading());
    
    return () => {
      const index = this.loadingSubscribers.indexOf(callback);
      if (index > -1) {
        this.loadingSubscribers.splice(index, 1);
      }
    };
  }

  // Session recovery loading helpers
  showSessionRecoveryLoading(): string {
    return this.showLoading('Oturum geri yükleniyor...', {
      subMessage: 'Lütfen bekleyin',
      cancellable: false
    });
  }

  showReconnectionLoading(attempt: number, maxAttempts: number): string {
    return this.showLoading(`Yeniden bağlanılıyor (${attempt}/${maxAttempts})`, {
      progress: (attempt / maxAttempts) * 100,
      subMessage: 'Bağlantı kuruluyor...',
      cancellable: true,
      onCancel: () => {
        this.error(
          'Bağlantı İptal Edildi',
          'Yeniden bağlantı denemesi iptal edildi.',
          { duration: 4000 }
        );
      }
    });
  }

  // Private methods
  private getDefaultDuration(type: NotificationType): number {
    switch (type) {
      case NotificationType.SUCCESS:
        return 4000;
      case NotificationType.INFO:
        return 5000;
      case NotificationType.WARNING:
        return 6000;
      case NotificationType.ERROR:
        return 8000;
      case NotificationType.LOADING:
        return 0; // Persistent until manually removed
      default:
        return 5000;
    }
  }

  private notifySubscribers(): void {
    const notifications = this.getAll();
    this.subscribers.forEach(callback => {
      try {
        callback(notifications);
      } catch (error) {
        console.error('📢 Error in notification subscriber:', error);
      }
    });
  }

  private notifyLoadingSubscribers(): void {
    const loadingStates = this.getAllLoading();
    this.loadingSubscribers.forEach(callback => {
      try {
        callback(loadingStates);
      } catch (error) {
        console.error('⏳ Error in loading subscriber:', error);
      }
    });
  }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}

export default NotificationService;