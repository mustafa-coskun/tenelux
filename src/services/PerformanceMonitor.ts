export interface SessionRecoveryMetrics {
  attemptId: string;
  userId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  sessionType: 'lobby' | 'tournament' | 'spectator' | 'menu' | 'in_game';
  errorType?: string;
  dataSize?: number;
  compressionRatio?: number;
}

export interface SyncPerformanceMetrics {
  operationId: string;
  operationType: 'broadcast' | 'receive' | 'conflict_resolution';
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  participantCount?: number;
  dataSize?: number;
  retryCount?: number;
}

export interface UserSessionPattern {
  userId: string;
  sessionCount: number;
  totalDuration: number;
  averageDuration: number;
  mostCommonState: string;
  recoverySuccessRate: number;
  lastActivity: Date;
}

export interface PerformanceReport {
  sessionRecovery: {
    totalAttempts: number;
    successRate: number;
    averageDuration: number;
    errorBreakdown: Record<string, number>;
  };
  synchronization: {
    totalOperations: number;
    averageDuration: number;
    successRate: number;
    operationBreakdown: Record<string, number>;
  };
  storage: {
    totalSize: number;
    compressionEfficiency: number;
    cleanupFrequency: number;
  };
  userPatterns: UserSessionPattern[];
}

/**
 * Performance monitoring and analytics service for session management
 */
class PerformanceMonitor {
  private recoveryMetrics: SessionRecoveryMetrics[] = [];
  private syncMetrics: SyncPerformanceMetrics[] = [];
  private userPatterns: Map<string, UserSessionPattern> = new Map();
  
  private readonly MAX_METRICS_HISTORY = 1000;
  private readonly METRICS_STORAGE_KEY = 'tenebris_performance_metrics';
  private readonly PATTERNS_STORAGE_KEY = 'tenebris_user_patterns';

  constructor() {
    this.loadMetricsFromStorage();
    this.setupPeriodicReporting();
  }

  /**
   * Start tracking a session recovery operation
   */
  startSessionRecovery(userId: string, sessionType: 'lobby' | 'tournament' | 'spectator' | 'menu' | 'in_game'): string {
    const attemptId = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const metrics: SessionRecoveryMetrics = {
      attemptId,
      userId,
      startTime: performance.now(),
      success: false,
      sessionType
    };

    this.recoveryMetrics.push(metrics);
    this.trimMetricsHistory();

    console.log(`📊 Started recovery tracking: ${attemptId}`);
    return attemptId;
  }

  /**
   * Complete session recovery tracking
   */
  completeSessionRecovery(
    attemptId: string, 
    success: boolean, 
    errorType?: string,
    dataSize?: number,
    compressionRatio?: number
  ): void {
    const metrics = this.recoveryMetrics.find(m => m.attemptId === attemptId);
    if (!metrics) {
      console.warn(`📊 Recovery metrics not found: ${attemptId}`);
      return;
    }

    metrics.endTime = performance.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.success = success;
    metrics.errorType = errorType;
    metrics.dataSize = dataSize;
    metrics.compressionRatio = compressionRatio;

    // Update user patterns
    this.updateUserPattern(metrics.userId, metrics);

    console.log(`📊 Completed recovery tracking: ${attemptId} (${success ? 'SUCCESS' : 'FAILED'}) - ${metrics.duration.toFixed(2)}ms`);
    
    this.saveMetricsToStorage();
  }

  /**
   * Start tracking a synchronization operation
   */
  startSyncOperation(
    operationType: 'broadcast' | 'receive' | 'conflict_resolution',
    participantCount?: number
  ): string {
    const operationId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const metrics: SyncPerformanceMetrics = {
      operationId,
      operationType,
      startTime: performance.now(),
      success: false,
      participantCount,
      retryCount: 0
    };

    this.syncMetrics.push(metrics);
    this.trimMetricsHistory();

    return operationId;
  }

  /**
   * Complete synchronization operation tracking
   */
  completeSyncOperation(
    operationId: string,
    success: boolean,
    dataSize?: number,
    retryCount?: number
  ): void {
    const metrics = this.syncMetrics.find(m => m.operationId === operationId);
    if (!metrics) {
      console.warn(`📊 Sync metrics not found: ${operationId}`);
      return;
    }

    metrics.endTime = performance.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.success = success;
    metrics.dataSize = dataSize;
    metrics.retryCount = retryCount || 0;

    console.log(`📊 Completed sync tracking: ${operationId} (${success ? 'SUCCESS' : 'FAILED'}) - ${metrics.duration.toFixed(2)}ms`);
    
    this.saveMetricsToStorage();
  }

  /**
   * Record a retry for a sync operation
   */
  recordSyncRetry(operationId: string): void {
    const metrics = this.syncMetrics.find(m => m.operationId === operationId);
    if (metrics) {
      metrics.retryCount = (metrics.retryCount || 0) + 1;
    }
  }

  /**
   * Update user session patterns
   */
  private updateUserPattern(userId: string, recoveryMetrics: SessionRecoveryMetrics): void {
    let pattern = this.userPatterns.get(userId);
    
    if (!pattern) {
      pattern = {
        userId,
        sessionCount: 0,
        totalDuration: 0,
        averageDuration: 0,
        mostCommonState: recoveryMetrics.sessionType,
        recoverySuccessRate: 0,
        lastActivity: new Date()
      };
      this.userPatterns.set(userId, pattern);
    }

    // Update pattern data
    pattern.sessionCount++;
    pattern.lastActivity = new Date();
    
    if (recoveryMetrics.duration) {
      pattern.totalDuration += recoveryMetrics.duration;
      pattern.averageDuration = pattern.totalDuration / pattern.sessionCount;
    }

    // Calculate success rate
    const userRecoveries = this.recoveryMetrics.filter(m => m.userId === userId);
    const successfulRecoveries = userRecoveries.filter(m => m.success).length;
    pattern.recoverySuccessRate = successfulRecoveries / userRecoveries.length;

    // Update most common state
    const stateCounts = userRecoveries.reduce((acc, m) => {
      acc[m.sessionType] = (acc[m.sessionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    pattern.mostCommonState = Object.entries(stateCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || recoveryMetrics.sessionType;
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(): PerformanceReport {
    const now = Date.now();
    const recentMetrics = this.recoveryMetrics.filter(m => 
      m.startTime > now - (24 * 60 * 60 * 1000) // Last 24 hours
    );
    const recentSyncMetrics = this.syncMetrics.filter(m => 
      m.startTime > now - (24 * 60 * 60 * 1000)
    );

    // Session recovery analysis
    const successfulRecoveries = recentMetrics.filter(m => m.success);
    const recoveryDurations = successfulRecoveries
      .map(m => m.duration)
      .filter((d): d is number => d !== undefined);

    const errorBreakdown = recentMetrics
      .filter(m => !m.success && m.errorType)
      .reduce((acc, m) => {
        acc[m.errorType!] = (acc[m.errorType!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    // Synchronization analysis
    const successfulSyncs = recentSyncMetrics.filter(m => m.success);
    const syncDurations = successfulSyncs
      .map(m => m.duration)
      .filter((d): d is number => d !== undefined);

    const operationBreakdown = recentSyncMetrics.reduce((acc, m) => {
      acc[m.operationType] = (acc[m.operationType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Storage analysis
    const compressionRatios = recentMetrics
      .map(m => m.compressionRatio)
      .filter((r): r is number => r !== undefined);

    const report: PerformanceReport = {
      sessionRecovery: {
        totalAttempts: recentMetrics.length,
        successRate: recentMetrics.length > 0 ? successfulRecoveries.length / recentMetrics.length : 0,
        averageDuration: recoveryDurations.length > 0 
          ? recoveryDurations.reduce((a, b) => a + b, 0) / recoveryDurations.length 
          : 0,
        errorBreakdown
      },
      synchronization: {
        totalOperations: recentSyncMetrics.length,
        averageDuration: syncDurations.length > 0 
          ? syncDurations.reduce((a, b) => a + b, 0) / syncDurations.length 
          : 0,
        successRate: recentSyncMetrics.length > 0 ? successfulSyncs.length / recentSyncMetrics.length : 0,
        operationBreakdown
      },
      storage: {
        totalSize: this.calculateStorageSize(),
        compressionEfficiency: compressionRatios.length > 0 
          ? compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length 
          : 1,
        cleanupFrequency: this.calculateCleanupFrequency()
      },
      userPatterns: Array.from(this.userPatterns.values())
        .sort((a, b) => b.sessionCount - a.sessionCount)
        .slice(0, 10) // Top 10 most active users
    };

    console.log('📊 Performance report generated:', report);
    return report;
  }

  /**
   * Get real-time performance metrics
   */
  getRealTimeMetrics(): {
    activeRecoveries: number;
    activeSyncs: number;
    averageRecoveryTime: number;
    recentSuccessRate: number;
  } {
    const now = performance.now();
    const recentWindow = 5 * 60 * 1000; // 5 minutes

    const activeRecoveries = this.recoveryMetrics.filter(m => 
      !m.endTime && (now - m.startTime) < 30000 // Active for less than 30 seconds
    ).length;

    const activeSyncs = this.syncMetrics.filter(m => 
      !m.endTime && (now - m.startTime) < 10000 // Active for less than 10 seconds
    ).length;

    const recentRecoveries = this.recoveryMetrics.filter(m => 
      m.endTime && (now - m.startTime) < recentWindow
    );

    const recentSuccessful = recentRecoveries.filter(m => m.success);
    const recentDurations = recentSuccessful
      .map(m => m.duration)
      .filter((d): d is number => d !== undefined);

    return {
      activeRecoveries,
      activeSyncs,
      averageRecoveryTime: recentDurations.length > 0 
        ? recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length 
        : 0,
      recentSuccessRate: recentRecoveries.length > 0 
        ? recentSuccessful.length / recentRecoveries.length 
        : 0
    };
  }

  /**
   * Calculate total storage size used by the application
   */
  private calculateStorageSize(): number {
    try {
      let totalSize = 0;
      for (let key in localStorage) {
        if (key.startsWith('tenebris_')) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += new Blob([value]).size;
          }
        }
      }
      return totalSize;
    } catch (error) {
      console.error('Failed to calculate storage size:', error);
      return 0;
    }
  }

  /**
   * Calculate cleanup frequency based on recent activity
   */
  private calculateCleanupFrequency(): number {
    // This would be implemented based on actual cleanup events
    // For now, return a placeholder value
    return 0.1; // 10% of sessions require cleanup
  }

  /**
   * Trim metrics history to prevent memory bloat
   */
  private trimMetricsHistory(): void {
    if (this.recoveryMetrics.length > this.MAX_METRICS_HISTORY) {
      this.recoveryMetrics = this.recoveryMetrics.slice(-this.MAX_METRICS_HISTORY);
    }
    
    if (this.syncMetrics.length > this.MAX_METRICS_HISTORY) {
      this.syncMetrics = this.syncMetrics.slice(-this.MAX_METRICS_HISTORY);
    }
  }

  /**
   * Save metrics to localStorage
   */
  private saveMetricsToStorage(): void {
    try {
      const metricsData = {
        recovery: this.recoveryMetrics.slice(-100), // Keep last 100 entries
        sync: this.syncMetrics.slice(-100),
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.METRICS_STORAGE_KEY, JSON.stringify(metricsData));
      
      const patternsData = {
        patterns: Array.from(this.userPatterns.entries()),
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.PATTERNS_STORAGE_KEY, JSON.stringify(patternsData));
    } catch (error) {
      console.error('Failed to save metrics to storage:', error);
    }
  }

  /**
   * Load metrics from localStorage
   */
  private loadMetricsFromStorage(): void {
    try {
      const metricsData = localStorage.getItem(this.METRICS_STORAGE_KEY);
      if (metricsData) {
        const parsed = JSON.parse(metricsData);
        this.recoveryMetrics = parsed.recovery || [];
        this.syncMetrics = parsed.sync || [];
      }

      const patternsData = localStorage.getItem(this.PATTERNS_STORAGE_KEY);
      if (patternsData) {
        const parsed = JSON.parse(patternsData);
        this.userPatterns = new Map(parsed.patterns || []);
      }
    } catch (error) {
      console.error('Failed to load metrics from storage:', error);
      this.recoveryMetrics = [];
      this.syncMetrics = [];
      this.userPatterns = new Map();
    }
  }

  /**
   * Setup periodic reporting
   */
  private setupPeriodicReporting(): void {
    // Generate report every hour
    setInterval(() => {
      const report = this.generateReport();
      console.log('📊 Hourly performance report:', {
        recoverySuccessRate: `${(report.sessionRecovery.successRate * 100).toFixed(1)}%`,
        avgRecoveryTime: `${report.sessionRecovery.averageDuration.toFixed(2)}ms`,
        syncSuccessRate: `${(report.synchronization.successRate * 100).toFixed(1)}%`,
        storageSize: `${(report.storage.totalSize / 1024).toFixed(1)}KB`
      });
    }, 60 * 60 * 1000); // 1 hour

    // Save metrics every 5 minutes
    setInterval(() => {
      this.saveMetricsToStorage();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Clear all metrics (for testing or reset)
   */
  clearMetrics(): void {
    this.recoveryMetrics = [];
    this.syncMetrics = [];
    this.userPatterns.clear();
    localStorage.removeItem(this.METRICS_STORAGE_KEY);
    localStorage.removeItem(this.PATTERNS_STORAGE_KEY);
    console.log('📊 All metrics cleared');
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(): {
    recovery: SessionRecoveryMetrics[];
    sync: SyncPerformanceMetrics[];
    patterns: UserSessionPattern[];
    exportTime: Date;
  } {
    return {
      recovery: [...this.recoveryMetrics],
      sync: [...this.syncMetrics],
      patterns: Array.from(this.userPatterns.values()),
      exportTime: new Date()
    };
  }
}

// Singleton instance
let performanceMonitorInstance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new PerformanceMonitor();
  }
  return performanceMonitorInstance;
}

export default PerformanceMonitor;