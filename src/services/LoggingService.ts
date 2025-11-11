// Secure logging service implementation

import * as fs from 'fs';
import * as path from 'path';
import { LoggingConfig } from '../config/database';

export interface ILogger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
  debug(message: string, meta?: any): void;
  audit(action: string, userId?: string, meta?: any): void;
  performance(metric: string, value: number, unit: string, meta?: any): void;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: any;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class SecureLogger implements ILogger {
  private logDir: string;
  private currentLogFile: string;
  private logStream?: fs.WriteStream;
  private sensitiveFields = [
    'password', 'passwordHash', 'token', 'sessionToken', 'secret',
    'key', 'apiKey', 'authorization', 'cookie', 'email', 'phone',
    'ssn', 'creditCard', 'bankAccount', 'personalId'
  ];

  constructor(private config: LoggingConfig) {
    this.logDir = path.join(process.cwd(), 'logs');
    this.currentLogFile = this.generateLogFileName();
    
    if (this.config.file) {
      this.initializeFileLogging();
    }
  }

  // Info level logging
  info(message: string, meta?: any): void {
    if (this.shouldLog('info')) {
      this.writeLog('info', message, meta);
    }
  }

  // Warning level logging
  warn(message: string, meta?: any): void {
    if (this.shouldLog('warn')) {
      this.writeLog('warn', message, meta);
    }
  }

  // Error level logging
  error(message: string, error?: Error, meta?: any): void {
    if (this.shouldLog('error')) {
      const errorMeta = error ? {
        name: error.name,
        message: error.message,
        stack: this.config.level === 'debug' ? error.stack : undefined
      } : undefined;

      this.writeLog('error', message, meta, errorMeta);
    }
  }

  // Debug level logging
  debug(message: string, meta?: any): void {
    if (this.shouldLog('debug')) {
      this.writeLog('debug', message, meta);
    }
  }

  // Audit logging for security events
  audit(action: string, userId?: string, meta?: any): void {
    const auditMeta = {
      ...meta,
      userId,
      timestamp: new Date().toISOString(),
      type: 'audit'
    };

    this.writeLog('info', `AUDIT: ${action}`, auditMeta);
  }

  // Performance logging
  performance(metric: string, value: number, unit: string, meta?: any): void {
    if (this.shouldLog('info')) {
      const perfMeta = {
        ...meta,
        metric,
        value,
        unit,
        type: 'performance'
      };

      this.writeLog('info', `PERFORMANCE: ${metric} = ${value}${unit}`, perfMeta);
    }
  }

  // Check if we should log at this level
  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.level);
    const messageLevel = levels.indexOf(level);
    
    return messageLevel >= configLevel;
  }

  // Write log entry
  private writeLog(level: string, message: string, meta?: any, error?: any): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: this.sanitizeMessage(message),
      meta: meta ? this.sanitizeMetadata(meta) : undefined,
      error
    };

    // Add request context if available
    this.addRequestContext(logEntry);

    const logString = this.formatLogEntry(logEntry);

    // Console logging
    if (this.config.console) {
      this.writeToConsole(level, logString);
    }

    // File logging
    if (this.config.file && this.logStream) {
      this.writeToFile(logString);
    }
  }

  // Sanitize log message
  private sanitizeMessage(message: string): string {
    if (typeof message !== 'string') {
      return String(message);
    }

    // Remove potential sensitive data patterns
    let sanitized = message
      .replace(/password[=:]\s*\S+/gi, 'password=***')
      .replace(/token[=:]\s*\S+/gi, 'token=***')
      .replace(/key[=:]\s*\S+/gi, 'key=***')
      .replace(/secret[=:]\s*\S+/gi, 'secret=***');

    return sanitized;
  }

  // Sanitize metadata object
  private sanitizeMetadata(meta: any): any {
    if (!meta || typeof meta !== 'object') {
      return meta;
    }

    const sanitized = JSON.parse(JSON.stringify(meta));
    this.recursiveSanitize(sanitized);
    return sanitized;
  }

  // Recursively sanitize object properties
  private recursiveSanitize(obj: any): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const lowerKey = key.toLowerCase();
        
        // Check if key contains sensitive field names
        if (this.sensitiveFields.some(field => lowerKey.includes(field))) {
          obj[key] = '***';
        } else if (typeof obj[key] === 'object') {
          this.recursiveSanitize(obj[key]);
        } else if (typeof obj[key] === 'string') {
          // Check if value looks like sensitive data
          if (this.isSensitiveValue(obj[key])) {
            obj[key] = '***';
          }
        }
      }
    }
  }

  // Check if a value looks like sensitive data
  private isSensitiveValue(value: string): boolean {
    if (typeof value !== 'string' || value.length < 8) {
      return false;
    }

    // Check for patterns that look like tokens, hashes, etc.
    const sensitivePatterns = [
      /^[a-f0-9]{32,}$/i, // Hex strings (tokens, hashes)
      /^[A-Za-z0-9+/]{20,}={0,2}$/, // Base64 strings
      /^\$2[aby]\$\d+\$/, // Bcrypt hashes
      /^Bearer\s+/i, // Bearer tokens
      /^Basic\s+/i, // Basic auth
      /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/, // Credit card numbers
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ // Email addresses
    ];

    return sensitivePatterns.some(pattern => pattern.test(value));
  }

  // Add request context to log entry
  private addRequestContext(logEntry: LogEntry): void {
    // In a real application, this would extract context from async local storage
    // or request context. For now, we'll add basic context if available.
    
    // This is a placeholder - in practice you'd use something like:
    // const context = AsyncLocalStorage.getStore();
    // if (context) {
    //   logEntry.requestId = context.requestId;
    //   logEntry.sessionId = context.sessionId;
    //   logEntry.userId = context.userId;
    // }
  }

  // Format log entry for output
  private formatLogEntry(logEntry: LogEntry): string {
    if (this.config.structured) {
      return JSON.stringify(logEntry);
    } else {
      let formatted = `[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}`;
      
      if (logEntry.meta) {
        formatted += ` | Meta: ${JSON.stringify(logEntry.meta)}`;
      }
      
      if (logEntry.error) {
        formatted += ` | Error: ${logEntry.error.name}: ${logEntry.error.message}`;
        if (logEntry.error.stack) {
          formatted += `\nStack: ${logEntry.error.stack}`;
        }
      }
      
      return formatted;
    }
  }

  // Write to console with appropriate method
  private writeToConsole(level: string, logString: string): void {
    switch (level) {
      case 'error':
        console.error(logString);
        break;
      case 'warn':
        console.warn(logString);
        break;
      case 'debug':
        console.debug(logString);
        break;
      default:
        console.log(logString);
    }
  }

  // Write to file
  private writeToFile(logString: string): void {
    if (this.logStream) {
      this.logStream.write(logString + '\n');
    }
  }

  // Initialize file logging
  private initializeFileLogging(): void {
    try {
      // Ensure log directory exists
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Create log file path
      const logFilePath = path.join(this.logDir, this.currentLogFile);

      // Create write stream
      this.logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

      // Handle stream errors
      this.logStream.on('error', (error) => {
        console.error('Log file write error:', error);
      });

      // Rotate logs if needed
      this.setupLogRotation();

    } catch (error) {
      console.error('Failed to initialize file logging:', error);
    }
  }

  // Generate log file name
  private generateLogFileName(): string {
    const date = new Date().toISOString().split('T')[0];
    return `tenebris-${date}.log`;
  }

  // Setup log rotation
  private setupLogRotation(): void {
    // Check file size and rotate if needed
    setInterval(() => {
      this.checkAndRotateLog();
    }, 60000); // Check every minute
  }

  // Check and rotate log file if needed
  private checkAndRotateLog(): void {
    if (!this.logStream) return;

    try {
      const logFilePath = path.join(this.logDir, this.currentLogFile);
      const stats = fs.statSync(logFilePath);
      const maxSize = this.parseFileSize(this.config.maxFileSize || '10m');

      if (stats.size > maxSize) {
        this.rotateLog();
      }
    } catch (error) {
      // File might not exist yet, ignore
    }
  }

  // Parse file size string (e.g., "10m", "100k")
  private parseFileSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 10 * 1024 * 1024; // Default 10MB

    const size = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'k': return size * 1024;
      case 'm': return size * 1024 * 1024;
      case 'g': return size * 1024 * 1024 * 1024;
      default: return size;
    }
  }

  // Rotate log file
  private rotateLog(): void {
    if (!this.logStream) return;

    try {
      // Close current stream
      this.logStream.end();

      // Rename current log file
      const oldPath = path.join(this.logDir, this.currentLogFile);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newPath = path.join(this.logDir, `${this.currentLogFile}.${timestamp}`);
      
      fs.renameSync(oldPath, newPath);

      // Create new log file
      this.currentLogFile = this.generateLogFileName();
      this.initializeFileLogging();

      // Clean up old log files
      this.cleanupOldLogs();

    } catch (error) {
      console.error('Log rotation failed:', error);
    }
  }

  // Clean up old log files
  private cleanupOldLogs(): void {
    try {
      const maxFiles = this.config.maxFiles || 5;
      const files = fs.readdirSync(this.logDir)
        .filter(file => file.startsWith('tenebris-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          mtime: fs.statSync(path.join(this.logDir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Remove excess files
      if (files.length > maxFiles) {
        const filesToDelete = files.slice(maxFiles);
        filesToDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (error) {
            console.error(`Failed to delete old log file ${file.name}:`, error);
          }
        });
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  // Close logger and cleanup resources
  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = undefined;
    }
  }

  // Get logging statistics
  getStats(): {
    logDir: string;
    currentLogFile: string;
    fileLoggingEnabled: boolean;
    consoleLoggingEnabled: boolean;
    logLevel: string;
  } {
    return {
      logDir: this.logDir,
      currentLogFile: this.currentLogFile,
      fileLoggingEnabled: this.config.file,
      consoleLoggingEnabled: this.config.console,
      logLevel: this.config.level
    };
  }
}

// Singleton instance
let loggerInstance: SecureLogger | null = null;

export function getLogger(config?: LoggingConfig): SecureLogger {
  if (!loggerInstance) {
    if (!config) {
      throw new Error('Logger configuration is required for first initialization');
    }
    loggerInstance = new SecureLogger(config);
  }
  return loggerInstance;
}

// Reset singleton (for testing)
export function resetLogger(): void {
  if (loggerInstance) {
    loggerInstance.close();
    loggerInstance = null;
  }
}

// Create a no-op logger for production when logging is disabled
export class NoOpLogger implements ILogger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
  audit(): void {}
  performance(): void {}
}

// Factory function to get appropriate logger
export function createLogger(config: LoggingConfig): ILogger {
  if (config.console || config.file) {
    return new SecureLogger(config);
  } else {
    return new NoOpLogger();
  }
}