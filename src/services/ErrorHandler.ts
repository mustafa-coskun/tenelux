export enum ErrorType {
  SESSION_CORRUPTED = 'SESSION_CORRUPTED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RECOVERY_TIMEOUT = 'RECOVERY_TIMEOUT',
  STORAGE_ERROR = 'STORAGE_ERROR',
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  LOBBY_NOT_FOUND = 'LOBBY_NOT_FOUND',
  TOURNAMENT_NOT_FOUND = 'TOURNAMENT_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface SessionError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  timestamp: Date;
  context?: {
    userId?: string;
    sessionId?: string;
    lobbyId?: string;
    tournamentId?: string;
    operation?: string;
  };
  recoverable: boolean;
  fallbackAction?: 'retry' | 'clear_session' | 'fallback_menu' | 'logout' | 'none';
}

export interface ErrorHandlerConfig {
  maxRetries: number;
  retryDelay: number;
  timeoutDuration: number;
  enableLogging: boolean;
  enableUserNotifications: boolean;
}

export interface ValidationRule<T> {
  name: string;
  validate: (data: T) => boolean;
  errorMessage: string;
  severity: ErrorSeverity;
}

export interface FallbackStrategy {
  condition: (error: SessionError) => boolean;
  action: (error: SessionError) => Promise<any>;
  description: string;
}

class ErrorHandler {
  private config: ErrorHandlerConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    timeoutDuration: 10000,
    enableLogging: true,
    enableUserNotifications: true
  };

  private errorHistory: SessionError[] = [];
  private maxHistorySize = 100;
  private fallbackStrategies: FallbackStrategy[] = [];
  private errorCallbacks: Array<(error: SessionError) => void> = [];
  private notificationService: any = null;

  constructor(config?: Partial<ErrorHandlerConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.setupDefaultFallbackStrategies();
    
    // Lazy load notification service to avoid circular dependencies
    setTimeout(() => {
      try {
        const { getNotificationService } = require('./NotificationService');
        this.notificationService = getNotificationService();
      } catch (error) {
        console.warn('🚨 Could not load NotificationService:', error);
      }
    }, 0);
  }

  // Configure error handler
  configure(config: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Create and handle an error
  createError(
    type: ErrorType,
    message: string,
    details?: any,
    context?: SessionError['context']
  ): SessionError {
    const error: SessionError = {
      type,
      severity: this.getSeverityForType(type),
      message,
      details,
      timestamp: new Date(),
      context,
      recoverable: this.isRecoverable(type),
      fallbackAction: this.getFallbackAction(type)
    };

    this.handleError(error);
    return error;
  }

  // Handle an existing error
  async handleError(error: SessionError): Promise<any> {
    // Add to history
    this.addToHistory(error);

    // Log error if enabled
    if (this.config.enableLogging) {
      this.logError(error);
    }

    // Show user notification if enabled
    if (this.config.enableUserNotifications && this.notificationService) {
      this.showUserNotification(error);
    }

    // Notify callbacks
    this.notifyCallbacks(error);

    // Execute fallback strategy if available
    const strategy = this.findFallbackStrategy(error);
    if (strategy) {
      try {
        console.log(`🚨 Executing fallback strategy: ${strategy.description}`);
        return await strategy.action(error);
      } catch (fallbackError) {
        console.error('🚨 Fallback strategy failed:', fallbackError);
        // Create a new error for the fallback failure
        return this.createError(
          ErrorType.UNKNOWN_ERROR,
          'Fallback strategy failed',
          { originalError: error, fallbackError },
          error.context
        );
      }
    }

    return null;
  }

  // Validate data with timeout
  async validateWithTimeout<T>(
    data: T,
    rules: ValidationRule<T>[],
    timeoutMs?: number
  ): Promise<{ isValid: boolean; errors: SessionError[] }> {
    const timeout = timeoutMs || this.config.timeoutDuration;
    
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const timeoutError = this.createError(
          ErrorType.RECOVERY_TIMEOUT,
          `Validation timed out after ${timeout}ms`,
          { rules: rules.map(r => r.name) }
        );
        resolve({ isValid: false, errors: [timeoutError] });
      }, timeout);

      try {
        const errors: SessionError[] = [];

        for (const rule of rules) {
          try {
            if (!rule.validate(data)) {
              const error = this.createError(
                ErrorType.VALIDATION_ERROR,
                rule.errorMessage,
                { ruleName: rule.name, data }
              );
              error.severity = rule.severity;
              errors.push(error);
            }
          } catch (ruleError) {
            const error = this.createError(
              ErrorType.VALIDATION_ERROR,
              `Validation rule '${rule.name}' threw an error`,
              { ruleError, data }
            );
            errors.push(error);
          }
        }

        clearTimeout(timer);
        resolve({ isValid: errors.length === 0, errors });
      } catch (validationError) {
        clearTimeout(timer);
        const error = this.createError(
          ErrorType.VALIDATION_ERROR,
          'Validation process failed',
          { validationError, data }
        );
        resolve({ isValid: false, errors: [error] });
      }
    });
  }

  // Retry operation with exponential backoff
  async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries?: number,
    context?: SessionError['context']
  ): Promise<T> {
    const retries = maxRetries || this.config.maxRetries;
    let lastError: any;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.withTimeout(operation(), this.config.timeoutDuration);
      } catch (error) {
        lastError = error;
        
        const sessionError = this.createError(
          this.classifyError(error),
          `${operationName} failed (attempt ${attempt}/${retries})`,
          { error, attempt },
          context
        );

        if (attempt === retries) {
          // Final attempt failed
          throw sessionError;
        }

        // Wait before retry with exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        console.log(`🚨 Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  // Wrap operation with timeout
  async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(this.createError(
          ErrorType.RECOVERY_TIMEOUT,
          `Operation timed out after ${timeoutMs}ms`
        ));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  // Safe localStorage operations
  safeLocalStorageGet(key: string): any | null {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      this.createError(
        ErrorType.STORAGE_ERROR,
        `Failed to read from localStorage: ${key}`,
        { error, key }
      );
      return null;
    }
  }

  safeLocalStorageSet(key: string, value: any): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      this.createError(
        ErrorType.STORAGE_ERROR,
        `Failed to write to localStorage: ${key}`,
        { error, key, value }
      );
      return false;
    }
  }

  safeLocalStorageRemove(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      this.createError(
        ErrorType.STORAGE_ERROR,
        `Failed to remove from localStorage: ${key}`,
        { error, key }
      );
      return false;
    }
  }

  // Subscribe to error events
  onError(callback: (error: SessionError) => void): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      const index = this.errorCallbacks.indexOf(callback);
      if (index > -1) {
        this.errorCallbacks.splice(index, 1);
      }
    };
  }

  // Get error history
  getErrorHistory(): SessionError[] {
    return [...this.errorHistory];
  }

  // Get recent errors by type
  getRecentErrors(type?: ErrorType, minutes: number = 5): SessionError[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.errorHistory.filter(error => 
      error.timestamp >= cutoff && (!type || error.type === type)
    );
  }

  // Clear error history
  clearHistory(): void {
    this.errorHistory = [];
  }

  // Add custom fallback strategy
  addFallbackStrategy(strategy: FallbackStrategy): void {
    this.fallbackStrategies.push(strategy);
  }

  // Private methods

  private getSeverityForType(type: ErrorType): ErrorSeverity {
    switch (type) {
      case ErrorType.SESSION_CORRUPTED:
      case ErrorType.PERMISSION_DENIED:
        return ErrorSeverity.CRITICAL;
      
      case ErrorType.SESSION_EXPIRED:
      case ErrorType.USER_NOT_FOUND:
      case ErrorType.LOBBY_NOT_FOUND:
      case ErrorType.TOURNAMENT_NOT_FOUND:
        return ErrorSeverity.HIGH;
      
      case ErrorType.NETWORK_ERROR:
      case ErrorType.RECOVERY_TIMEOUT:
      case ErrorType.SYNC_CONFLICT:
        return ErrorSeverity.MEDIUM;
      
      case ErrorType.VALIDATION_ERROR:
      case ErrorType.STORAGE_ERROR:
        return ErrorSeverity.LOW;
      
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  private isRecoverable(type: ErrorType): boolean {
    switch (type) {
      case ErrorType.NETWORK_ERROR:
      case ErrorType.RECOVERY_TIMEOUT:
      case ErrorType.STORAGE_ERROR:
      case ErrorType.SYNC_CONFLICT:
        return true;
      
      case ErrorType.SESSION_EXPIRED:
      case ErrorType.VALIDATION_ERROR:
        return true; // Can recover by clearing and restarting
      
      case ErrorType.SESSION_CORRUPTED:
      case ErrorType.USER_NOT_FOUND:
      case ErrorType.LOBBY_NOT_FOUND:
      case ErrorType.TOURNAMENT_NOT_FOUND:
        return false; // Need to start fresh
      
      case ErrorType.PERMISSION_DENIED:
        return false;
      
      default:
        return false;
    }
  }

  private getFallbackAction(type: ErrorType): SessionError['fallbackAction'] {
    switch (type) {
      case ErrorType.NETWORK_ERROR:
      case ErrorType.RECOVERY_TIMEOUT:
        return 'retry';
      
      case ErrorType.SESSION_EXPIRED:
      case ErrorType.SESSION_CORRUPTED:
      case ErrorType.VALIDATION_ERROR:
        return 'clear_session';
      
      case ErrorType.USER_NOT_FOUND:
      case ErrorType.LOBBY_NOT_FOUND:
      case ErrorType.TOURNAMENT_NOT_FOUND:
        return 'fallback_menu';
      
      case ErrorType.PERMISSION_DENIED:
        return 'logout';
      
      case ErrorType.STORAGE_ERROR:
      case ErrorType.SYNC_CONFLICT:
        return 'retry';
      
      default:
        return 'fallback_menu';
    }
  }

  private classifyError(error: any): ErrorType {
    if (!error) return ErrorType.UNKNOWN_ERROR;

    const message = error.message || error.toString().toLowerCase();

    if (message.includes('network') || message.includes('connection')) {
      return ErrorType.NETWORK_ERROR;
    }
    
    if (message.includes('timeout')) {
      return ErrorType.RECOVERY_TIMEOUT;
    }
    
    if (message.includes('storage') || message.includes('quota')) {
      return ErrorType.STORAGE_ERROR;
    }
    
    if (message.includes('expired')) {
      return ErrorType.SESSION_EXPIRED;
    }
    
    if (message.includes('corrupted') || message.includes('invalid')) {
      return ErrorType.SESSION_CORRUPTED;
    }
    
    if (message.includes('not found')) {
      return ErrorType.USER_NOT_FOUND;
    }
    
    if (message.includes('permission') || message.includes('unauthorized')) {
      return ErrorType.PERMISSION_DENIED;
    }

    return ErrorType.UNKNOWN_ERROR;
  }

  private setupDefaultFallbackStrategies(): void {
    // Network error strategy - retry with backoff
    this.addFallbackStrategy({
      condition: (error) => error.type === ErrorType.NETWORK_ERROR,
      action: async (error) => {
        console.log('🚨 Network error fallback: Will retry on next operation');
        return { action: 'retry_later' };
      },
      description: 'Network error - retry later'
    });

    // Session expired strategy - clear and restart
    this.addFallbackStrategy({
      condition: (error) => error.type === ErrorType.SESSION_EXPIRED,
      action: async (error) => {
        console.log('🚨 Session expired fallback: Clearing session data');
        // Clear session data
        localStorage.removeItem('tenebris_full_session');
        localStorage.removeItem('tenebris_lobby_cache');
        localStorage.removeItem('tenebris_tournament_cache');
        return { action: 'session_cleared', fallbackToMenu: true };
      },
      description: 'Session expired - clear and restart'
    });

    // Corrupted data strategy - clear and restart
    this.addFallbackStrategy({
      condition: (error) => error.type === ErrorType.SESSION_CORRUPTED,
      action: async (error) => {
        console.log('🚨 Corrupted data fallback: Clearing all session data');
        // Clear all session data
        localStorage.clear();
        sessionStorage.clear();
        return { action: 'data_cleared', fallbackToMenu: true };
      },
      description: 'Corrupted data - clear all and restart'
    });

    // Storage error strategy - try alternative storage
    this.addFallbackStrategy({
      condition: (error) => error.type === ErrorType.STORAGE_ERROR,
      action: async (error) => {
        console.log('🚨 Storage error fallback: Using memory storage');
        return { action: 'memory_storage', warning: 'Using temporary storage' };
      },
      description: 'Storage error - use memory storage'
    });
  }

  private findFallbackStrategy(error: SessionError): FallbackStrategy | null {
    return this.fallbackStrategies.find(strategy => strategy.condition(error)) || null;
  }

  private addToHistory(error: SessionError): void {
    this.errorHistory.push(error);
    
    // Keep history size manageable
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  private logError(error: SessionError): void {
    const logLevel = this.getLogLevel(error.severity);
    const logMessage = `🚨 [${error.type}] ${error.message}`;
    
    switch (logLevel) {
      case 'error':
        console.error(logMessage, error);
        break;
      case 'warn':
        console.warn(logMessage, error);
        break;
      case 'info':
        console.info(logMessage, error);
        break;
      default:
        console.log(logMessage, error);
    }
  }

  private getLogLevel(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'log';
    }
  }

  private notifyCallbacks(error: SessionError): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('🚨 Error in error callback:', callbackError);
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private showUserNotification(error: SessionError): void {
    if (!this.notificationService) return;

    const title = this.getNotificationTitle(error.type);
    const message = this.getNotificationMessage(error);
    const actions = this.getNotificationActions(error);

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        this.notificationService.error(title, message, { 
          duration: error.recoverable ? 8000 : 0,
          actions 
        });
        break;
      
      case ErrorSeverity.MEDIUM:
        this.notificationService.warning(title, message, { 
          duration: 6000,
          actions 
        });
        break;
      
      case ErrorSeverity.LOW:
        this.notificationService.info(title, message, { 
          duration: 4000 
        });
        break;
    }
  }

  private getNotificationTitle(type: ErrorType): string {
    switch (type) {
      case ErrorType.SESSION_CORRUPTED:
        return 'Oturum Verileri Bozulmuş';
      case ErrorType.SESSION_EXPIRED:
        return 'Oturum Süresi Dolmuş';
      case ErrorType.NETWORK_ERROR:
        return 'Bağlantı Sorunu';
      case ErrorType.VALIDATION_ERROR:
        return 'Veri Doğrulama Hatası';
      case ErrorType.RECOVERY_TIMEOUT:
        return 'Geri Yükleme Zaman Aşımı';
      case ErrorType.STORAGE_ERROR:
        return 'Depolama Hatası';
      case ErrorType.SYNC_CONFLICT:
        return 'Senkronizasyon Sorunu';
      case ErrorType.USER_NOT_FOUND:
        return 'Kullanıcı Bulunamadı';
      case ErrorType.LOBBY_NOT_FOUND:
        return 'Lobi Bulunamadı';
      case ErrorType.TOURNAMENT_NOT_FOUND:
        return 'Turnuva Bulunamadı';
      case ErrorType.PERMISSION_DENIED:
        return 'Erişim Reddedildi';
      default:
        return 'Beklenmeyen Hata';
    }
  }

  private getNotificationMessage(error: SessionError): string {
    // Use the error message, but make it more user-friendly if needed
    let message = error.message;

    // Add context-specific information
    if (error.context?.operation) {
      message += ` (İşlem: ${error.context.operation})`;
    }

    // Add recovery information
    if (error.recoverable) {
      message += '\n\nBu sorun düzeltilebilir.';
    } else {
      message += '\n\nYeni bir oturum başlatmanız gerekebilir.';
    }

    return message;
  }

  private getNotificationActions(error: SessionError): any[] {
    const actions: any[] = [];

    switch (error.fallbackAction) {
      case 'retry':
        actions.push({
          label: 'Yeniden Dene',
          action: () => {
            // The retry logic should be handled by the calling code
            console.log('🚨 User requested retry for error:', error.type);
          },
          style: 'primary'
        });
        break;

      case 'clear_session':
        actions.push({
          label: 'Oturumu Temizle',
          action: () => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
          },
          style: 'danger'
        });
        break;

      case 'fallback_menu':
        actions.push({
          label: 'Ana Menü',
          action: () => {
            window.location.hash = '#/';
            window.location.reload();
          },
          style: 'primary'
        });
        break;

      case 'logout':
        actions.push({
          label: 'Çıkış Yap',
          action: () => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/';
          },
          style: 'danger'
        });
        break;
    }

    // Always add a dismiss option for non-critical errors
    if (error.severity !== ErrorSeverity.CRITICAL) {
      actions.push({
        label: 'Tamam',
        action: () => {
          // Just dismiss the notification
        },
        style: 'secondary'
      });
    }

    return actions;
  }
}

// Singleton instance
let errorHandlerInstance: ErrorHandler | null = null;

export function getErrorHandler(): ErrorHandler {
  if (!errorHandlerInstance) {
    errorHandlerInstance = new ErrorHandler();
  }
  return errorHandlerInstance;
}

export default ErrorHandler;