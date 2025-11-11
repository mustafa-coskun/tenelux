// Logging utilities for production-safe logging

// Temporary: Use simple logger until TypeScript setup is complete
const getLogger = () => ({
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
  audit: (...args) => console.log('[AUDIT]', ...args)
});

// Safe console replacement for development
class SafeConsole {
  constructor() {
    this.logger = null;
    this.isDevelopment = process.env.NODE_ENV === 'development';
    
    try {
      this.logger = getLogger();
    } catch (error) {
      // Logger not available, fall back to console in development only
    }
  }

  log(...args) {
    if (this.logger) {
      this.logger.info(this.formatMessage(args));
    } else if (this.isDevelopment) {
      console.log(...args);
    }
  }

  info(...args) {
    if (this.logger) {
      this.logger.info(this.formatMessage(args));
    } else if (this.isDevelopment) {
      console.info(...args);
    }
  }

  warn(...args) {
    if (this.logger) {
      this.logger.warn(this.formatMessage(args));
    } else if (this.isDevelopment) {
      console.warn(...args);
    }
  }

  error(...args) {
    if (this.logger) {
      const error = args.find(arg => arg instanceof Error);
      const message = this.formatMessage(args.filter(arg => !(arg instanceof Error)));
      this.logger.error(message, error);
    } else if (this.isDevelopment) {
      console.error(...args);
    }
  }

  debug(...args) {
    if (this.logger) {
      this.logger.debug(this.formatMessage(args));
    } else if (this.isDevelopment) {
      console.debug(...args);
    }
  }

  formatMessage(args) {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }
}

// Create safe console instance
const safeConsole = new SafeConsole();

// Performance logging utility
function logPerformance(operation, startTime, metadata = {}) {
  const duration = Date.now() - startTime;
  
  if (safeConsole.logger) {
    safeConsole.logger.performance(operation, duration, 'ms', metadata);
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`⏱️ ${operation}: ${duration}ms`, metadata);
  }
}

// Error logging utility with context
function logError(error, context = {}) {
  if (safeConsole.logger) {
    safeConsole.logger.error('Application error', error, context);
  } else if (process.env.NODE_ENV === 'development') {
    console.error('Application error:', error, context);
  }
}

// Audit logging utility
function logAudit(action, userId, metadata = {}) {
  if (safeConsole.logger) {
    safeConsole.logger.audit(action, userId, metadata);
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 AUDIT: ${action}`, { userId, ...metadata });
  }
}

// Security event logging
function logSecurityEvent(event, severity = 'info', metadata = {}) {
  const securityLog = {
    type: 'security_event',
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...metadata
  };

  if (safeConsole.logger) {
    switch (severity) {
      case 'critical':
      case 'high':
        safeConsole.logger.error(`Security Event: ${event}`, null, securityLog);
        break;
      case 'medium':
        safeConsole.logger.warn(`Security Event: ${event}`, securityLog);
        break;
      default:
        safeConsole.logger.info(`Security Event: ${event}`, securityLog);
    }
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`🔒 SECURITY: ${event}`, securityLog);
  }
}

// Request logging middleware
function createRequestLogger() {
  return (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;

    // Override res.send to capture response
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      const logData = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress,
        contentLength: res.get('content-length')
      };

      // Log based on status code
      if (res.statusCode >= 500) {
        logError(new Error(`HTTP ${res.statusCode}`), logData);
      } else if (res.statusCode >= 400) {
        safeConsole.warn('HTTP Client Error', logData);
      } else {
        safeConsole.info('HTTP Request', logData);
      }

      // Call original send
      originalSend.call(this, data);
    };

    next();
  };
}

// WebSocket logging utility
function logWebSocketEvent(event, clientId, data = {}) {
  const logData = {
    event,
    clientId,
    timestamp: new Date().toISOString(),
    ...data
  };

  if (safeConsole.logger) {
    safeConsole.logger.debug(`WebSocket: ${event}`, logData);
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`🔌 WS: ${event}`, logData);
  }
}

// Game event logging
function logGameEvent(event, gameId, players = [], metadata = {}) {
  const logData = {
    event,
    gameId,
    playerCount: players.length,
    timestamp: new Date().toISOString(),
    ...metadata
  };

  if (safeConsole.logger) {
    safeConsole.logger.info(`Game: ${event}`, logData);
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`🎮 GAME: ${event}`, logData);
  }
}

// Database operation logging
function logDatabaseOperation(operation, table, duration, metadata = {}) {
  const logData = {
    operation,
    table,
    duration,
    timestamp: new Date().toISOString(),
    ...metadata
  };

  if (duration > 1000) { // Log slow queries
    safeConsole.warn('Slow Database Query', logData);
  } else if (safeConsole.logger) {
    safeConsole.logger.debug(`Database: ${operation}`, logData);
  }
}

// Startup logging
function logStartup(message, metadata = {}) {
  if (safeConsole.logger) {
    safeConsole.logger.info(`Startup: ${message}`, metadata);
  } else {
    console.log(`🚀 ${message}`, metadata);
  }
}

// Shutdown logging
function logShutdown(message, metadata = {}) {
  if (safeConsole.logger) {
    safeConsole.logger.info(`Shutdown: ${message}`, metadata);
  } else {
    console.log(`🛑 ${message}`, metadata);
  }
}

module.exports = {
  safeConsole,
  logPerformance,
  logError,
  logAudit,
  logSecurityEvent,
  createRequestLogger,
  logWebSocketEvent,
  logGameEvent,
  logDatabaseOperation,
  logStartup,
  logShutdown
};