/**
 * ErrorHandlingService
 * 
 * Ortak hata işleme mantığı, kullanıcı dostu hata mesajları ve loglama
 * ErrorHandler'ı wrap eder ve ek yardımcı fonksiyonlar sağlar
 */

import { getErrorHandler, ErrorType, ErrorSeverity, SessionError } from './ErrorHandler';

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  lobbyId?: string;
  tournamentId?: string;
  matchId?: string;
  operation?: string;
  component?: string;
  additionalInfo?: any;
}

export interface UserFriendlyError {
  title: string;
  message: string;
  actionLabel?: string;
  actionCallback?: () => void;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

class ErrorHandlingService {
  private errorHandler = getErrorHandler();
  private errorListeners: Array<(error: UserFriendlyError) => void> = [];

  /**
   * Genel hata işleme - tüm hata türleri için
   */
  handleError(
    error: Error | string | any,
    context?: ErrorContext,
    showToUser: boolean = true
  ): SessionError {
    const errorType = this.classifyError(error);
    const errorMessage = this.extractErrorMessage(error);
    
    const sessionError = this.errorHandler.createError(
      errorType,
      errorMessage,
      { originalError: error },
      context
    );

    if (showToUser) {
      const userFriendlyError = this.toUserFriendlyError(sessionError);
      this.notifyErrorListeners(userFriendlyError);
    }

    return sessionError;
  }

  /**
   * WebSocket hata işleme
   */
  handleWebSocketError(
    error: Error | any,
    context?: ErrorContext
  ): SessionError {
    console.error('🔌 WebSocket Error:', error, context);
    
    return this.errorHandler.createError(
      ErrorType.NETWORK_ERROR,
      this.getWebSocketErrorMessage(error),
      { error },
      { ...context, operation: 'websocket' }
    );
  }

  /**
   * Durum yönetimi hata işleme
   */
  handleStateError(
    error: Error | string,
    currentState: any,
    context?: ErrorContext
  ): SessionError {
    console.error('🎮 State Error:', error, currentState, context);
    
    return this.errorHandler.createError(
      ErrorType.VALIDATION_ERROR,
      typeof error === 'string' ? error : error.message,
      { error, currentState },
      { ...context, operation: 'state_management' }
    );
  }

  /**
   * Veritabanı hata işleme
   */
  handleDatabaseError(
    error: Error | any,
    operation: string,
    context?: ErrorContext
  ): SessionError {
    console.error('💾 Database Error:', error, operation, context);
    
    return this.errorHandler.createError(
      ErrorType.STORAGE_ERROR,
      `Veritabanı işlemi başarısız: ${operation}`,
      { error, operation },
      { ...context, operation: `database_${operation}` }
    );
  }

  /**
   * Ağ bağlantı hatası işleme
   */
  handleNetworkError(
    error: Error | any,
    context?: ErrorContext
  ): SessionError {
    console.error('🌐 Network Error:', error, context);
    
    return this.errorHandler.createError(
      ErrorType.NETWORK_ERROR,
      'Ağ bağlantısı hatası',
      { error },
      { ...context, operation: 'network' }
    );
  }

  /**
   * Doğrulama hatası işleme
   */
  handleValidationError(
    message: string,
    invalidData: any,
    context?: ErrorContext
  ): SessionError {
    console.warn('✅ Validation Error:', message, invalidData, context);
    
    return this.errorHandler.createError(
      ErrorType.VALIDATION_ERROR,
      message,
      { invalidData },
      { ...context, operation: 'validation' }
    );
  }

  /**
   * İzin hatası işleme
   */
  handlePermissionError(
    message: string,
    context?: ErrorContext
  ): SessionError {
    console.error('🔒 Permission Error:', message, context);
    
    return this.errorHandler.createError(
      ErrorType.PERMISSION_DENIED,
      message,
      {},
      { ...context, operation: 'permission_check' }
    );
  }

  /**
   * Zaman aşımı hatası işleme
   */
  handleTimeoutError(
    operation: string,
    timeoutMs: number,
    context?: ErrorContext
  ): SessionError {
    console.error('⏱️ Timeout Error:', operation, timeoutMs, context);
    
    return this.errorHandler.createError(
      ErrorType.RECOVERY_TIMEOUT,
      `İşlem zaman aşımına uğradı: ${operation} (${timeoutMs}ms)`,
      { operation, timeoutMs },
      { ...context, operation: `timeout_${operation}` }
    );
  }

  /**
   * Bulunamadı hatası işleme
   */
  handleNotFoundError(
    resourceType: 'user' | 'lobby' | 'tournament' | 'match',
    resourceId: string,
    context?: ErrorContext
  ): SessionError {
    console.error('🔍 Not Found Error:', resourceType, resourceId, context);
    
    const errorTypeMap = {
      user: ErrorType.USER_NOT_FOUND,
      lobby: ErrorType.LOBBY_NOT_FOUND,
      tournament: ErrorType.TOURNAMENT_NOT_FOUND,
      match: ErrorType.UNKNOWN_ERROR
    };

    const messageMap = {
      user: 'Kullanıcı bulunamadı',
      lobby: 'Lobi bulunamadı',
      tournament: 'Turnuva bulunamadı',
      match: 'Maç bulunamadı'
    };
    
    return this.errorHandler.createError(
      errorTypeMap[resourceType],
      messageMap[resourceType],
      { resourceType, resourceId },
      { ...context, operation: `find_${resourceType}` }
    );
  }

  /**
   * Kullanıcı dostu hata mesajı oluştur
   */
  getUserFriendlyMessage(error: SessionError | ErrorType | string): string {
    if (typeof error === 'string') {
      return error;
    }

    const errorType = typeof error === 'object' ? error.type : error;

    const messages: Record<ErrorType, string> = {
      [ErrorType.SESSION_CORRUPTED]: 'Oturum verileri bozulmuş. Lütfen yeniden giriş yapın.',
      [ErrorType.SESSION_EXPIRED]: 'Oturumunuzun süresi dolmuş. Lütfen yeniden giriş yapın.',
      [ErrorType.NETWORK_ERROR]: 'Bağlantı sorunu yaşanıyor. Lütfen internet bağlantınızı kontrol edin.',
      [ErrorType.VALIDATION_ERROR]: 'Girdiğiniz bilgiler geçersiz. Lütfen kontrol edin.',
      [ErrorType.RECOVERY_TIMEOUT]: 'İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.',
      [ErrorType.STORAGE_ERROR]: 'Veri kaydedilemedi. Tarayıcı depolama alanınızı kontrol edin.',
      [ErrorType.SYNC_CONFLICT]: 'Senkronizasyon sorunu. Sayfa yenilenecek.',
      [ErrorType.USER_NOT_FOUND]: 'Kullanıcı bulunamadı.',
      [ErrorType.LOBBY_NOT_FOUND]: 'Lobi bulunamadı veya kapatılmış.',
      [ErrorType.TOURNAMENT_NOT_FOUND]: 'Turnuva bulunamadı veya sona ermiş.',
      [ErrorType.PERMISSION_DENIED]: 'Bu işlem için yetkiniz yok.',
      [ErrorType.UNKNOWN_ERROR]: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'
    };

    return messages[errorType] || 'Bir hata oluştu.';
  }

  /**
   * SessionError'ı kullanıcı dostu formata dönüştür
   */
  toUserFriendlyError(error: SessionError): UserFriendlyError {
    const severityMap: Record<ErrorSeverity, UserFriendlyError['severity']> = {
      [ErrorSeverity.LOW]: 'info',
      [ErrorSeverity.MEDIUM]: 'warning',
      [ErrorSeverity.HIGH]: 'error',
      [ErrorSeverity.CRITICAL]: 'critical'
    };

    return {
      title: this.getErrorTitle(error.type),
      message: this.getUserFriendlyMessage(error),
      actionLabel: this.getActionLabel(error.fallbackAction),
      actionCallback: this.getActionCallback(error.fallbackAction),
      severity: severityMap[error.severity]
    };
  }

  /**
   * Hata başlığı oluştur
   */
  private getErrorTitle(errorType: ErrorType): string {
    const titles: Record<ErrorType, string> = {
      [ErrorType.SESSION_CORRUPTED]: 'Oturum Hatası',
      [ErrorType.SESSION_EXPIRED]: 'Oturum Süresi Doldu',
      [ErrorType.NETWORK_ERROR]: 'Bağlantı Sorunu',
      [ErrorType.VALIDATION_ERROR]: 'Geçersiz Veri',
      [ErrorType.RECOVERY_TIMEOUT]: 'Zaman Aşımı',
      [ErrorType.STORAGE_ERROR]: 'Depolama Hatası',
      [ErrorType.SYNC_CONFLICT]: 'Senkronizasyon Sorunu',
      [ErrorType.USER_NOT_FOUND]: 'Kullanıcı Bulunamadı',
      [ErrorType.LOBBY_NOT_FOUND]: 'Lobi Bulunamadı',
      [ErrorType.TOURNAMENT_NOT_FOUND]: 'Turnuva Bulunamadı',
      [ErrorType.PERMISSION_DENIED]: 'Erişim Reddedildi',
      [ErrorType.UNKNOWN_ERROR]: 'Hata'
    };

    return titles[errorType] || 'Hata';
  }

  /**
   * Aksiyon etiketi oluştur
   */
  private getActionLabel(fallbackAction?: SessionError['fallbackAction']): string | undefined {
    const labels: Record<NonNullable<SessionError['fallbackAction']>, string> = {
      retry: 'Tekrar Dene',
      clear_session: 'Oturumu Temizle',
      fallback_menu: 'Ana Menü',
      logout: 'Çıkış Yap',
      none: 'Tamam'
    };

    return fallbackAction ? labels[fallbackAction] : undefined;
  }

  /**
   * Aksiyon callback oluştur
   */
  private getActionCallback(fallbackAction?: SessionError['fallbackAction']): (() => void) | undefined {
    if (!fallbackAction || fallbackAction === 'none') {
      return undefined;
    }

    const callbacks: Record<NonNullable<SessionError['fallbackAction']>, () => void> = {
      retry: () => {
        console.log('🔄 User requested retry');
        window.location.reload();
      },
      clear_session: () => {
        console.log('🗑️ Clearing session');
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      },
      fallback_menu: () => {
        console.log('🏠 Returning to menu');
        window.location.hash = '#/';
        window.location.reload();
      },
      logout: () => {
        console.log('👋 Logging out');
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/';
      },
      none: () => {}
    };

    return callbacks[fallbackAction];
  }

  /**
   * Hata türünü sınıflandır
   */
  private classifyError(error: any): ErrorType {
    if (!error) return ErrorType.UNKNOWN_ERROR;

    const message = (error.message || error.toString()).toLowerCase();

    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return ErrorType.NETWORK_ERROR;
    }
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorType.RECOVERY_TIMEOUT;
    }
    
    if (message.includes('storage') || message.includes('quota') || message.includes('localstorage')) {
      return ErrorType.STORAGE_ERROR;
    }
    
    if (message.includes('expired') || message.includes('session expired')) {
      return ErrorType.SESSION_EXPIRED;
    }
    
    if (message.includes('corrupted') || message.includes('invalid') || message.includes('malformed')) {
      return ErrorType.SESSION_CORRUPTED;
    }
    
    if (message.includes('not found') || message.includes('404')) {
      return ErrorType.USER_NOT_FOUND;
    }
    
    if (message.includes('permission') || message.includes('unauthorized') || message.includes('forbidden')) {
      return ErrorType.PERMISSION_DENIED;
    }

    if (message.includes('validation') || message.includes('invalid data')) {
      return ErrorType.VALIDATION_ERROR;
    }

    return ErrorType.UNKNOWN_ERROR;
  }

  /**
   * Hata mesajını çıkar
   */
  private extractErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (error && error.message) {
      return error.message;
    }

    return 'Bilinmeyen hata';
  }

  /**
   * WebSocket hata mesajı oluştur
   */
  private getWebSocketErrorMessage(error: any): string {
    const message = this.extractErrorMessage(error);

    if (message.includes('close') || message.includes('disconnect')) {
      return 'WebSocket bağlantısı kesildi';
    }

    if (message.includes('timeout')) {
      return 'WebSocket bağlantısı zaman aşımına uğradı';
    }

    if (message.includes('refused') || message.includes('failed')) {
      return 'WebSocket bağlantısı kurulamadı';
    }

    return `WebSocket hatası: ${message}`;
  }

  /**
   * Hata dinleyicisi ekle
   */
  onError(callback: (error: UserFriendlyError) => void): () => void {
    this.errorListeners.push(callback);
    
    return () => {
      const index = this.errorListeners.indexOf(callback);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  /**
   * Hata dinleyicilerini bilgilendir
   */
  private notifyErrorListeners(error: UserFriendlyError): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (err) {
        console.error('Error in error listener:', err);
      }
    });
  }

  /**
   * Hata logla (konsol ve ErrorHandler)
   */
  logError(
    message: string,
    error?: any,
    context?: ErrorContext
  ): void {
    console.error(`🚨 ${message}`, error, context);
    
    if (error) {
      this.handleError(error, context, false);
    }
  }

  /**
   * Uyarı logla
   */
  logWarning(
    message: string,
    data?: any,
    context?: ErrorContext
  ): void {
    console.warn(`⚠️ ${message}`, data, context);
  }

  /**
   * Bilgi logla
   */
  logInfo(
    message: string,
    data?: any
  ): void {
    console.info(`ℹ️ ${message}`, data);
  }

  /**
   * Hata geçmişini al
   */
  getErrorHistory(): SessionError[] {
    return this.errorHandler.getErrorHistory();
  }

  /**
   * Son hataları al
   */
  getRecentErrors(type?: ErrorType, minutes: number = 5): SessionError[] {
    return this.errorHandler.getRecentErrors(type, minutes);
  }

  /**
   * Hata geçmişini temizle
   */
  clearErrorHistory(): void {
    this.errorHandler.clearHistory();
  }

  /**
   * Güvenli try-catch wrapper
   */
  async tryCatch<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: ErrorContext,
    showToUser: boolean = true
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      this.handleError(
        error,
        { ...context, operation: operationName },
        showToUser
      );
      return null;
    }
  }

  /**
   * Güvenli senkron try-catch wrapper
   */
  tryCatchSync<T>(
    operation: () => T,
    operationName: string,
    context?: ErrorContext,
    showToUser: boolean = true
  ): T | null {
    try {
      return operation();
    } catch (error) {
      this.handleError(
        error,
        { ...context, operation: operationName },
        showToUser
      );
      return null;
    }
  }

  /**
   * Yeniden deneme ile işlem yürüt
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    context?: ErrorContext
  ): Promise<T> {
    return this.errorHandler.retryOperation(
      operation,
      operationName,
      maxRetries,
      context
    );
  }

  /**
   * Zaman aşımı ile işlem yürüt
   */
  async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    operationName?: string
  ): Promise<T> {
    try {
      return await this.errorHandler.withTimeout(operation, timeoutMs);
    } catch (error) {
      if (operationName) {
        throw this.handleTimeoutError(operationName, timeoutMs);
      }
      throw error;
    }
  }
}

// Singleton instance
let errorHandlingServiceInstance: ErrorHandlingService | null = null;

export function getErrorHandlingService(): ErrorHandlingService {
  if (!errorHandlingServiceInstance) {
    errorHandlingServiceInstance = new ErrorHandlingService();
  }
  return errorHandlingServiceInstance;
}

export default ErrorHandlingService;
