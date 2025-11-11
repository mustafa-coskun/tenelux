import { getUserService, User, GameSession } from './UserService';
import { getStateManager, StoredSession } from './StateManager';
import { getErrorHandler } from './ErrorHandler';
import { getValidationService } from './ValidationService';
import { getSyncService } from './SyncService';
import { getReconnectionService } from './ReconnectionService';

export interface DebugInfo {
  timestamp: Date;
  user: User | null;
  session: GameSession | null;
  storedSession: StoredSession | null;
  localStorage: { [key: string]: any };
  sessionStorage: { [key: string]: any };
  errorHistory: any[];
  connectionState: any;
  validationResults: any;
  systemInfo: {
    userAgent: string;
    platform: string;
    language: string;
    cookieEnabled: boolean;
    onLine: boolean;
    storageQuota?: any;
  };
}

export interface SessionExport {
  version: string;
  exportDate: Date;
  debugInfo: DebugInfo;
  compressed: boolean;
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  data?: any;
}

class SessionDebugger {
  private userService = getUserService();
  private stateManager = getStateManager();
  private errorHandler = getErrorHandler();
  private validationService = getValidationService();
  private syncService = getSyncService();
  private reconnectionService = getReconnectionService();
  
  private logs: LogEntry[] = [];
  private maxLogEntries = 1000;
  private isLoggingEnabled = false;
  private logSubscribers: Array<(entry: LogEntry) => void> = [];

  constructor() {
    this.setupLogging();
  }

  // Enable/disable debug logging
  enableLogging(enabled: boolean = true): void {
    this.isLoggingEnabled = enabled;
    this.log('info', 'debugger', `Debug logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Get comprehensive debug information
  async getDebugInfo(): Promise<DebugInfo> {
    const user = this.userService.getCurrentUser();
    const session = this.userService.getCurrentSession();
    const storedSession = await this.stateManager.loadState();
    
    // Get localStorage data
    const localStorage: { [key: string]: any } = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        try {
          const value = window.localStorage.getItem(key);
          localStorage[key] = value ? JSON.parse(value) : value;
        } catch {
          localStorage[key] = window.localStorage.getItem(key);
        }
      }
    }

    // Get sessionStorage data
    const sessionStorage: { [key: string]: any } = {};
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key) {
        try {
          const value = window.sessionStorage.getItem(key);
          sessionStorage[key] = value ? JSON.parse(value) : value;
        } catch {
          sessionStorage[key] = window.sessionStorage.getItem(key);
        }
      }
    }

    // Get validation results
    let validationResults: any = {};
    if (storedSession) {
      try {
        validationResults = await this.validationService.validateStoredSession(storedSession);
      } catch (error) {
        validationResults = { error: error instanceof Error ? error.message : 'Validation failed' };
      }
    }

    // Get storage quota information
    let storageQuota: any = undefined;
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        storageQuota = await navigator.storage.estimate();
      } catch (error) {
        storageQuota = { error: 'Could not estimate storage' };
      }
    }

    return {
      timestamp: new Date(),
      user,
      session,
      storedSession,
      localStorage,
      sessionStorage,
      errorHistory: this.errorHandler.getErrorHistory(),
      connectionState: {
        isConnected: this.syncService.isConnectedToServer(),
        pendingUpdates: this.syncService.getPendingUpdatesCount(),
        reconnectionState: this.reconnectionService.getState()
      },
      validationResults,
      systemInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        storageQuota
      }
    };
  }

  // Export session data for debugging
  async exportSessionData(compress: boolean = false): Promise<SessionExport> {
    const debugInfo = await this.getDebugInfo();
    
    const exportData: SessionExport = {
      version: '1.0.0',
      exportDate: new Date(),
      debugInfo,
      compressed: compress
    };

    if (compress) {
      // Simple compression by removing some verbose data
      if (exportData.debugInfo.localStorage) {
        Object.keys(exportData.debugInfo.localStorage).forEach(key => {
          if (!key.startsWith('tenebris_')) {
            delete exportData.debugInfo.localStorage[key];
          }
        });
      }
      
      if (exportData.debugInfo.sessionStorage) {
        Object.keys(exportData.debugInfo.sessionStorage).forEach(key => {
          if (!key.startsWith('tenebris_')) {
            delete exportData.debugInfo.sessionStorage[key];
          }
        });
      }
    }

    this.log('info', 'debugger', 'Session data exported', { compressed: compress });
    return exportData;
  }

  // Import session data for testing
  async importSessionData(exportData: SessionExport): Promise<boolean> {
    try {
      this.log('info', 'debugger', 'Importing session data', { version: exportData.version });

      if (exportData.version !== '1.0.0') {
        throw new Error(`Unsupported export version: ${exportData.version}`);
      }

      const { debugInfo } = exportData;

      // Import localStorage data (only tenebris keys)
      if (debugInfo.localStorage) {
        Object.keys(debugInfo.localStorage).forEach(key => {
          if (key.startsWith('tenebris_')) {
            try {
              const value = typeof debugInfo.localStorage[key] === 'string' 
                ? debugInfo.localStorage[key] 
                : JSON.stringify(debugInfo.localStorage[key]);
              localStorage.setItem(key, value);
            } catch (error) {
              console.warn(`Failed to import localStorage key: ${key}`, error);
            }
          }
        });
      }

      // Import sessionStorage data (only tenebris keys)
      if (debugInfo.sessionStorage) {
        Object.keys(debugInfo.sessionStorage).forEach(key => {
          if (key.startsWith('tenebris_')) {
            try {
              const value = typeof debugInfo.sessionStorage[key] === 'string' 
                ? debugInfo.sessionStorage[key] 
                : JSON.stringify(debugInfo.sessionStorage[key]);
              sessionStorage.setItem(key, value);
            } catch (error) {
              console.warn(`Failed to import sessionStorage key: ${key}`, error);
            }
          }
        });
      }

      this.log('info', 'debugger', 'Session data imported successfully');
      return true;

    } catch (error) {
      this.log('error', 'debugger', 'Failed to import session data', { error });
      return false;
    }
  }

  // Download debug data as JSON file
  async downloadDebugData(filename?: string): Promise<void> {
    const debugInfo = await this.getDebugInfo();
    const exportData = await this.exportSessionData(false);
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `tenebris-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    
    this.log('info', 'debugger', 'Debug data downloaded', { filename: link.download });
  }

  // Clear all session data (for testing)
  clearAllSessionData(): void {
    this.log('warn', 'debugger', 'Clearing all session data');
    
    // Clear localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tenebris_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Clear sessionStorage
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('tenebris_')) {
        sessionKeysToRemove.push(key);
      }
    }
    sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
    
    // Clear error history
    this.errorHandler.clearHistory();
    
    this.log('info', 'debugger', 'All session data cleared');
  }

  // Simulate various error conditions for testing
  simulateError(errorType: 'network' | 'storage' | 'corruption' | 'timeout'): void {
    this.log('warn', 'debugger', `Simulating ${errorType} error`);
    
    switch (errorType) {
      case 'network':
        this.errorHandler.createError(
          'NETWORK_ERROR' as any,
          'Simulated network error for testing',
          { simulated: true },
          { operation: 'debug_simulation' }
        );
        break;
        
      case 'storage':
        this.errorHandler.createError(
          'STORAGE_ERROR' as any,
          'Simulated storage error for testing',
          { simulated: true },
          { operation: 'debug_simulation' }
        );
        break;
        
      case 'corruption':
        // Corrupt the stored session
        localStorage.setItem('tenebris_full_session', 'invalid_json{');
        this.errorHandler.createError(
          'SESSION_CORRUPTED' as any,
          'Simulated session corruption for testing',
          { simulated: true },
          { operation: 'debug_simulation' }
        );
        break;
        
      case 'timeout':
        this.errorHandler.createError(
          'RECOVERY_TIMEOUT' as any,
          'Simulated timeout error for testing',
          { simulated: true },
          { operation: 'debug_simulation' }
        );
        break;
    }
  }

  // Get session statistics
  getSessionStats(): any {
    const stats = this.stateManager.getSessionStats();
    const errorHistory = this.errorHandler.getErrorHistory();
    const recentErrors = this.errorHandler.getRecentErrors();
    
    return {
      ...stats,
      errorCount: errorHistory.length,
      recentErrorCount: recentErrors.length,
      logEntries: this.logs.length,
      isLoggingEnabled: this.isLoggingEnabled,
      connectionState: {
        isConnected: this.syncService.isConnectedToServer(),
        pendingUpdates: this.syncService.getPendingUpdatesCount()
      }
    };
  }

  // Logging functionality
  log(level: LogEntry['level'], category: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data
    };

    this.logs.push(entry);
    
    // Keep log size manageable
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }

    // Console output if logging is enabled
    if (this.isLoggingEnabled) {
      const logMessage = `[${category.toUpperCase()}] ${message}`;
      switch (level) {
        case 'debug':
          console.debug(logMessage, data);
          break;
        case 'info':
          console.info(logMessage, data);
          break;
        case 'warn':
          console.warn(logMessage, data);
          break;
        case 'error':
          console.error(logMessage, data);
          break;
      }
    }

    // Notify subscribers
    this.notifyLogSubscribers(entry);
  }

  // Get all logs
  getLogs(category?: string, level?: LogEntry['level']): LogEntry[] {
    let filteredLogs = [...this.logs];
    
    if (category) {
      filteredLogs = filteredLogs.filter(log => log.category === category);
    }
    
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    
    return filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Clear logs
  clearLogs(): void {
    this.logs = [];
    this.log('info', 'debugger', 'Logs cleared');
  }

  // Subscribe to log entries
  subscribeToLogs(callback: (entry: LogEntry) => void): () => void {
    this.logSubscribers.push(callback);
    return () => {
      const index = this.logSubscribers.indexOf(callback);
      if (index > -1) {
        this.logSubscribers.splice(index, 1);
      }
    };
  }

  // Performance monitoring
  measurePerformance<T>(operation: string, fn: () => T): T {
    const startTime = performance.now();
    
    try {
      const result = fn();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      this.log('debug', 'performance', `Operation completed: ${operation}`, {
        duration: `${duration.toFixed(2)}ms`,
        success: true
      });
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      this.log('error', 'performance', `Operation failed: ${operation}`, {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
      
      throw error;
    }
  }

  // Async performance monitoring
  async measureAsyncPerformance<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await fn();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      this.log('debug', 'performance', `Async operation completed: ${operation}`, {
        duration: `${duration.toFixed(2)}ms`,
        success: true
      });
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      this.log('error', 'performance', `Async operation failed: ${operation}`, {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
      
      throw error;
    }
  }

  // Private methods
  private setupLogging(): void {
    // Intercept console methods to capture logs
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error
    };

    // Only intercept if not already intercepted
    if (!(console.log as any).__intercepted) {
      console.log = (...args) => {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('🎮')) {
          this.log('info', 'session', args[0], args.slice(1));
        }
        originalConsole.log(...args);
      };
      (console.log as any).__intercepted = true;

      console.warn = (...args) => {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('🎮')) {
          this.log('warn', 'session', args[0], args.slice(1));
        }
        originalConsole.warn(...args);
      };
      (console.warn as any).__intercepted = true;

      console.error = (...args) => {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('🎮')) {
          this.log('error', 'session', args[0], args.slice(1));
        }
        originalConsole.error(...args);
      };
      (console.error as any).__intercepted = true;
    }
  }

  private notifyLogSubscribers(entry: LogEntry): void {
    this.logSubscribers.forEach(callback => {
      try {
        callback(entry);
      } catch (error) {
        console.error('Error in log subscriber:', error);
      }
    });
  }
}

// Singleton instance
let sessionDebuggerInstance: SessionDebugger | null = null;

export function getSessionDebugger(): SessionDebugger {
  if (!sessionDebuggerInstance) {
    sessionDebuggerInstance = new SessionDebugger();
  }
  return sessionDebuggerInstance;
}

// Global debug interface for browser console
if (typeof window !== 'undefined') {
  (window as any).TenebrisDebug = {
    getDebugger: getSessionDebugger,
    exportData: () => getSessionDebugger().exportSessionData(),
    downloadData: () => getSessionDebugger().downloadDebugData(),
    clearData: () => getSessionDebugger().clearAllSessionData(),
    getStats: () => getSessionDebugger().getSessionStats(),
    enableLogging: (enabled: boolean) => getSessionDebugger().enableLogging(enabled),
    simulateError: (type: string) => getSessionDebugger().simulateError(type as any),
    getLogs: () => getSessionDebugger().getLogs()
  };
}

export default SessionDebugger;