// Performance monitoring utilities

const { logPerformance } = require('./logging');

// Performance timer utility
class PerformanceTimer {
  constructor(operation) {
    this.operation = operation;
    this.startTime = Date.now();
    this.checkpoints = [];
  }

  checkpoint(name) {
    const now = Date.now();
    this.checkpoints.push({
      name,
      time: now,
      duration: now - this.startTime
    });
  }

  end(metadata = {}) {
    const totalDuration = Date.now() - this.startTime;
    
    logPerformance(this.operation, this.startTime, {
      ...metadata,
      totalDuration,
      checkpoints: this.checkpoints
    });

    return totalDuration;
  }
}

// Database query performance monitoring
function monitorDatabaseQuery(queryName, queryFn) {
  return async (...args) => {
    const timer = new PerformanceTimer(`DB_${queryName}`);
    
    try {
      const result = await queryFn(...args);
      timer.end({ success: true, resultCount: Array.isArray(result) ? result.length : 1 });
      return result;
    } catch (error) {
      timer.end({ success: false, error: error.message });
      throw error;
    }
  };
}

// API endpoint performance monitoring
function monitorApiEndpoint(endpointName) {
  return (req, res, next) => {
    const timer = new PerformanceTimer(`API_${endpointName}`);
    
    const originalSend = res.send;
    res.send = function(data) {
      timer.end({
        method: req.method,
        statusCode: res.statusCode,
        success: res.statusCode < 400
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

// Memory usage monitoring
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
    arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) // MB
  };
}

// Performance metrics collection
class PerformanceCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
        averageResponseTime: 0
      },
      database: {
        queries: 0,
        slowQueries: 0,
        averageQueryTime: 0
      },
      websocket: {
        connections: 0,
        messages: 0,
        errors: 0
      },
      memory: {
        current: getMemoryUsage(),
        peak: getMemoryUsage()
      }
    };
    
    this.responseTimes = [];
    this.queryTimes = [];
    
    // Update memory metrics periodically
    setInterval(() => {
      this.updateMemoryMetrics();
    }, 30000); // Every 30 seconds
  }

  recordRequest(duration, success = true) {
    this.metrics.requests.total++;
    
    if (success) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.errors++;
    }
    
    this.responseTimes.push(duration);
    
    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
    
    // Update average
    this.metrics.requests.averageResponseTime = 
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  recordDatabaseQuery(duration) {
    this.metrics.database.queries++;
    
    if (duration > 1000) { // Slow query threshold: 1 second
      this.metrics.database.slowQueries++;
    }
    
    this.queryTimes.push(duration);
    
    // Keep only last 1000 query times
    if (this.queryTimes.length > 1000) {
      this.queryTimes = this.queryTimes.slice(-1000);
    }
    
    // Update average
    this.metrics.database.averageQueryTime = 
      this.queryTimes.reduce((sum, time) => sum + time, 0) / this.queryTimes.length;
  }

  recordWebSocketEvent(type) {
    switch (type) {
      case 'connection':
        this.metrics.websocket.connections++;
        break;
      case 'message':
        this.metrics.websocket.messages++;
        break;
      case 'error':
        this.metrics.websocket.errors++;
        break;
    }
  }

  updateMemoryMetrics() {
    const current = getMemoryUsage();
    this.metrics.memory.current = current;
    
    // Update peak values
    Object.keys(current).forEach(key => {
      if (current[key] > this.metrics.memory.peak[key]) {
        this.metrics.memory.peak[key] = current[key];
      }
    });
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  reset() {
    this.metrics = {
      requests: { total: 0, success: 0, errors: 0, averageResponseTime: 0 },
      database: { queries: 0, slowQueries: 0, averageQueryTime: 0 },
      websocket: { connections: 0, messages: 0, errors: 0 },
      memory: { current: getMemoryUsage(), peak: getMemoryUsage() }
    };
    this.responseTimes = [];
    this.queryTimes = [];
  }
}

// Singleton performance collector
const performanceCollector = new PerformanceCollector();

// Cache implementation for frequently accessed data
class SimpleCache {
  constructor(maxSize = 1000, ttl = 300000) { // 5 minutes default TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key, value) {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // Check if item has expired
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Create caches for different data types
const userCache = new SimpleCache(500, 300000); // 5 minutes
const sessionCache = new SimpleCache(1000, 600000); // 10 minutes
const leaderboardCache = new SimpleCache(10, 60000); // 1 minute

// Periodic cache cleanup
setInterval(() => {
  userCache.cleanup();
  sessionCache.cleanup();
  leaderboardCache.cleanup();
}, 60000); // Every minute

module.exports = {
  PerformanceTimer,
  monitorDatabaseQuery,
  monitorApiEndpoint,
  getMemoryUsage,
  performanceCollector,
  SimpleCache,
  userCache,
  sessionCache,
  leaderboardCache
};