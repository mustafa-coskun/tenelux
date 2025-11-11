import { getPerformanceMonitor } from '../PerformanceMonitor';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock performance.now
const mockPerformanceNow = jest.fn(() => Date.now());
Object.defineProperty(window, 'performance', {
  value: { now: mockPerformanceNow }
});

// Mock setInterval and clearInterval
const mockSetInterval = jest.fn();
const mockClearInterval = jest.fn();
global.setInterval = mockSetInterval;
global.clearInterval = mockClearInterval;

describe('PerformanceMonitor', () => {
  let performanceMonitor: any;
  let mockTime = 1000;

  beforeEach(() => {
    localStorageMock.clear();
    mockSetInterval.mockClear();
    mockClearInterval.mockClear();
    
    // Mock performance.now to return predictable values
    mockPerformanceNow.mockImplementation(() => mockTime);
    
    performanceMonitor = getPerformanceMonitor();
    performanceMonitor.clearMetrics();
  });

  describe('Session Recovery Tracking', () => {
    test('should start session recovery tracking', () => {
      const trackingId = performanceMonitor.startSessionRecovery('test-user', 'lobby');
      
      expect(trackingId).toBeDefined();
      expect(trackingId).toMatch(/^recovery_\d+_[a-z0-9]+$/);
    });

    test('should complete successful session recovery', () => {
      const trackingId = performanceMonitor.startSessionRecovery('test-user', 'lobby');
      
      // Advance time
      mockTime += 150;
      mockPerformanceNow.mockReturnValue(mockTime);
      
      performanceMonitor.completeSessionRecovery(trackingId, true, undefined, 1024, 0.8);
      
      const report = performanceMonitor.generateReport();
      expect(report.sessionRecovery.totalAttempts).toBe(1);
      expect(report.sessionRecovery.successRate).toBe(1);
      expect(report.sessionRecovery.averageDuration).toBe(150);
    });

    test('should complete failed session recovery', () => {
      const trackingId = performanceMonitor.startSessionRecovery('test-user', 'tournament');
      
      mockTime += 200;
      mockPerformanceNow.mockReturnValue(mockTime);
      
      performanceMonitor.completeSessionRecovery(trackingId, false, 'network_error');
      
      const report = performanceMonitor.generateReport();
      expect(report.sessionRecovery.totalAttempts).toBe(1);
      expect(report.sessionRecovery.successRate).toBe(0);
      expect(report.sessionRecovery.errorBreakdown.network_error).toBe(1);
    });

    test('should handle completion of non-existent tracking ID', () => {
      // Should not throw error
      expect(() => {
        performanceMonitor.completeSessionRecovery('non-existent-id', true);
      }).not.toThrow();
    });

    test('should track multiple recovery attempts', () => {
      const trackingIds = [
        performanceMonitor.startSessionRecovery('user1', 'lobby'),
        performanceMonitor.startSessionRecovery('user2', 'tournament'),
        performanceMonitor.startSessionRecovery('user3', 'spectator')
      ];

      mockTime += 100;
      mockPerformanceNow.mockReturnValue(mockTime);

      performanceMonitor.completeSessionRecovery(trackingIds[0], true);
      performanceMonitor.completeSessionRecovery(trackingIds[1], false, 'timeout');
      performanceMonitor.completeSessionRecovery(trackingIds[2], true);

      const report = performanceMonitor.generateReport();
      expect(report.sessionRecovery.totalAttempts).toBe(3);
      expect(report.sessionRecovery.successRate).toBe(2/3);
      expect(report.sessionRecovery.errorBreakdown.timeout).toBe(1);
    });
  });

  describe('Synchronization Tracking', () => {
    test('should start sync operation tracking', () => {
      const operationId = performanceMonitor.startSyncOperation('broadcast', 4);
      
      expect(operationId).toBeDefined();
      expect(operationId).toMatch(/^sync_\d+_[a-z0-9]+$/);
    });

    test('should complete successful sync operation', () => {
      const operationId = performanceMonitor.startSyncOperation('broadcast', 3);
      
      mockTime += 50;
      mockPerformanceNow.mockReturnValue(mockTime);
      
      performanceMonitor.completeSyncOperation(operationId, true, 512, 0);
      
      const report = performanceMonitor.generateReport();
      expect(report.synchronization.totalOperations).toBe(1);
      expect(report.synchronization.successRate).toBe(1);
      expect(report.synchronization.averageDuration).toBe(50);
      expect(report.synchronization.operationBreakdown.broadcast).toBe(1);
    });

    test('should complete failed sync operation with retries', () => {
      const operationId = performanceMonitor.startSyncOperation('conflict_resolution');
      
      // Record some retries
      performanceMonitor.recordSyncRetry(operationId);
      performanceMonitor.recordSyncRetry(operationId);
      
      mockTime += 300;
      mockPerformanceNow.mockReturnValue(mockTime);
      
      performanceMonitor.completeSyncOperation(operationId, false, 256, 2);
      
      const report = performanceMonitor.generateReport();
      expect(report.synchronization.totalOperations).toBe(1);
      expect(report.synchronization.successRate).toBe(0);
    });

    test('should handle retry recording for non-existent operation', () => {
      expect(() => {
        performanceMonitor.recordSyncRetry('non-existent-id');
      }).not.toThrow();
    });

    test('should track different operation types', () => {
      const broadcastId = performanceMonitor.startSyncOperation('broadcast', 5);
      const receiveId = performanceMonitor.startSyncOperation('receive', 1);
      const conflictId = performanceMonitor.startSyncOperation('conflict_resolution', 2);

      mockTime += 75;
      mockPerformanceNow.mockReturnValue(mockTime);

      performanceMonitor.completeSyncOperation(broadcastId, true);
      performanceMonitor.completeSyncOperation(receiveId, true);
      performanceMonitor.completeSyncOperation(conflictId, false);

      const report = performanceMonitor.generateReport();
      expect(report.synchronization.totalOperations).toBe(3);
      expect(report.synchronization.operationBreakdown.broadcast).toBe(1);
      expect(report.synchronization.operationBreakdown.receive).toBe(1);
      expect(report.synchronization.operationBreakdown.conflict_resolution).toBe(1);
    });
  });

  describe('User Pattern Tracking', () => {
    test('should track user session patterns', () => {
      const userId = 'pattern-test-user';
      
      // Simulate multiple recovery attempts
      for (let i = 0; i < 5; i++) {
        const trackingId = performanceMonitor.startSessionRecovery(userId, 'lobby');
        mockTime += 100;
        mockPerformanceNow.mockReturnValue(mockTime);
        performanceMonitor.completeSessionRecovery(trackingId, i < 4); // 4 successes, 1 failure
      }

      const report = performanceMonitor.generateReport();
      const userPattern = report.userPatterns.find(p => p.userId === userId);
      
      expect(userPattern).toBeDefined();
      expect(userPattern!.sessionCount).toBe(5);
      expect(userPattern!.recoverySuccessRate).toBe(0.8);
      expect(userPattern!.mostCommonState).toBe('lobby');
      expect(userPattern!.averageDuration).toBe(100);
    });

    test('should update most common state correctly', () => {
      const userId = 'state-test-user';
      
      // More tournament sessions than lobby
      for (let i = 0; i < 3; i++) {
        const trackingId = performanceMonitor.startSessionRecovery(userId, 'tournament');
        mockTime += 50;
        mockPerformanceNow.mockReturnValue(mockTime);
        performanceMonitor.completeSessionRecovery(trackingId, true);
      }

      for (let i = 0; i < 2; i++) {
        const trackingId = performanceMonitor.startSessionRecovery(userId, 'lobby');
        mockTime += 50;
        mockPerformanceNow.mockReturnValue(mockTime);
        performanceMonitor.completeSessionRecovery(trackingId, true);
      }

      const report = performanceMonitor.generateReport();
      const userPattern = report.userPatterns.find(p => p.userId === userId);
      
      expect(userPattern!.mostCommonState).toBe('tournament');
    });
  });

  describe('Performance Reports', () => {
    test('should generate comprehensive performance report', () => {
      // Add some recovery metrics
      const recoveryId1 = performanceMonitor.startSessionRecovery('user1', 'lobby');
      const recoveryId2 = performanceMonitor.startSessionRecovery('user2', 'tournament');
      
      mockTime += 100;
      mockPerformanceNow.mockReturnValue(mockTime);
      
      performanceMonitor.completeSessionRecovery(recoveryId1, true, undefined, 1024);
      performanceMonitor.completeSessionRecovery(recoveryId2, false, 'corruption');

      // Add some sync metrics
      const syncId1 = performanceMonitor.startSyncOperation('broadcast', 3);
      const syncId2 = performanceMonitor.startSyncOperation('receive', 1);
      
      mockTime += 50;
      mockPerformanceNow.mockReturnValue(mockTime);
      
      performanceMonitor.completeSyncOperation(syncId1, true, 512);
      performanceMonitor.completeSyncOperation(syncId2, true, 256);

      const report = performanceMonitor.generateReport();
      
      expect(report.sessionRecovery.totalAttempts).toBe(2);
      expect(report.sessionRecovery.successRate).toBe(0.5);
      expect(report.sessionRecovery.errorBreakdown.corruption).toBe(1);
      
      expect(report.synchronization.totalOperations).toBe(2);
      expect(report.synchronization.successRate).toBe(1);
      expect(report.synchronization.operationBreakdown.broadcast).toBe(1);
      expect(report.synchronization.operationBreakdown.receive).toBe(1);
      
      expect(report.storage.totalSize).toBeGreaterThanOrEqual(0);
      expect(report.userPatterns).toHaveLength(2);
    });

    test('should handle empty metrics gracefully', () => {
      const report = performanceMonitor.generateReport();
      
      expect(report.sessionRecovery.totalAttempts).toBe(0);
      expect(report.sessionRecovery.successRate).toBe(0);
      expect(report.sessionRecovery.averageDuration).toBe(0);
      expect(report.synchronization.totalOperations).toBe(0);
      expect(report.userPatterns).toHaveLength(0);
    });

    test('should filter metrics by time window', () => {
      // Add old metrics (should be filtered out)
      const oldTime = mockTime - (25 * 60 * 60 * 1000); // 25 hours ago
      mockPerformanceNow.mockReturnValue(oldTime);
      
      const oldRecoveryId = performanceMonitor.startSessionRecovery('old-user', 'lobby');
      performanceMonitor.completeSessionRecovery(oldRecoveryId, true);

      // Add recent metrics
      mockPerformanceNow.mockReturnValue(mockTime);
      const recentRecoveryId = performanceMonitor.startSessionRecovery('recent-user', 'tournament');
      performanceMonitor.completeSessionRecovery(recentRecoveryId, true);

      const report = performanceMonitor.generateReport();
      
      // Should only include recent metrics
      expect(report.sessionRecovery.totalAttempts).toBe(1);
    });
  });

  describe('Real-time Metrics', () => {
    test('should provide real-time metrics', () => {
      // Start some operations but don't complete them
      performanceMonitor.startSessionRecovery('active-user1', 'lobby');
      performanceMonitor.startSessionRecovery('active-user2', 'tournament');
      performanceMonitor.startSyncOperation('broadcast', 3);

      const realTimeMetrics = performanceMonitor.getRealTimeMetrics();
      
      expect(realTimeMetrics.activeRecoveries).toBe(2);
      expect(realTimeMetrics.activeSyncs).toBe(1);
      expect(realTimeMetrics.averageRecoveryTime).toBe(0); // No completed recoveries yet
      expect(realTimeMetrics.recentSuccessRate).toBe(0);
    });

    test('should calculate recent success rate correctly', () => {
      // Complete some recent operations
      const recoveryId1 = performanceMonitor.startSessionRecovery('user1', 'lobby');
      const recoveryId2 = performanceMonitor.startSessionRecovery('user2', 'tournament');
      
      mockTime += 100;
      mockPerformanceNow.mockReturnValue(mockTime);
      
      performanceMonitor.completeSessionRecovery(recoveryId1, true);
      performanceMonitor.completeSessionRecovery(recoveryId2, false, 'error');

      const realTimeMetrics = performanceMonitor.getRealTimeMetrics();
      
      expect(realTimeMetrics.recentSuccessRate).toBe(0.5);
      expect(realTimeMetrics.averageRecoveryTime).toBe(100);
    });
  });

  describe('Data Persistence', () => {
    test('should save and load metrics from localStorage', () => {
      // Add some metrics
      const recoveryId = performanceMonitor.startSessionRecovery('persist-user', 'lobby');
      mockTime += 100;
      mockPerformanceNow.mockReturnValue(mockTime);
      performanceMonitor.completeSessionRecovery(recoveryId, true);

      // Manually trigger save
      performanceMonitor.saveMetricsToStorage();
      
      // Verify data was saved
      const metricsData = localStorageMock.getItem('tenebris_performance_metrics');
      const patternsData = localStorageMock.getItem('tenebris_user_patterns');
      
      expect(metricsData).toBeDefined();
      expect(patternsData).toBeDefined();
      
      const parsedMetrics = JSON.parse(metricsData!);
      expect(parsedMetrics.recovery).toHaveLength(1);
    });

    test('should handle corrupted stored metrics gracefully', () => {
      localStorageMock.setItem('tenebris_performance_metrics', 'invalid-json');
      localStorageMock.setItem('tenebris_user_patterns', 'invalid-json');
      
      // Should not throw error when creating new instance
      expect(() => {
        getPerformanceMonitor();
      }).not.toThrow();
    });

    test('should export metrics for external analysis', () => {
      // Add some test data
      const recoveryId = performanceMonitor.startSessionRecovery('export-user', 'lobby');
      mockTime += 50;
      mockPerformanceNow.mockReturnValue(mockTime);
      performanceMonitor.completeSessionRecovery(recoveryId, true);

      const exported = performanceMonitor.exportMetrics();
      
      expect(exported.recovery).toHaveLength(1);
      expect(exported.sync).toHaveLength(0);
      expect(exported.patterns).toHaveLength(1);
      expect(exported.exportTime).toBeInstanceOf(Date);
    });
  });

  describe('Metrics Management', () => {
    test('should trim metrics history when limit exceeded', () => {
      // Mock MAX_METRICS_HISTORY to a small number for testing
      const originalMaxHistory = performanceMonitor.MAX_METRICS_HISTORY;
      performanceMonitor.MAX_METRICS_HISTORY = 3;

      // Add more metrics than the limit
      for (let i = 0; i < 5; i++) {
        const trackingId = performanceMonitor.startSessionRecovery(`user${i}`, 'lobby');
        mockTime += 10;
        mockPerformanceNow.mockReturnValue(mockTime);
        performanceMonitor.completeSessionRecovery(trackingId, true);
      }

      // Should only keep the last 3
      expect(performanceMonitor.recoveryMetrics.length).toBe(3);

      // Restore original value
      performanceMonitor.MAX_METRICS_HISTORY = originalMaxHistory;
    });

    test('should clear all metrics', () => {
      // Add some metrics
      const recoveryId = performanceMonitor.startSessionRecovery('clear-user', 'lobby');
      performanceMonitor.completeSessionRecovery(recoveryId, true);
      
      const syncId = performanceMonitor.startSyncOperation('broadcast');
      performanceMonitor.completeSyncOperation(syncId, true);

      // Clear metrics
      performanceMonitor.clearMetrics();

      // Verify everything is cleared
      const report = performanceMonitor.generateReport();
      expect(report.sessionRecovery.totalAttempts).toBe(0);
      expect(report.synchronization.totalOperations).toBe(0);
      expect(report.userPatterns).toHaveLength(0);
      
      expect(localStorageMock.getItem('tenebris_performance_metrics')).toBeNull();
      expect(localStorageMock.getItem('tenebris_user_patterns')).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw error
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem = jest.fn(() => {
        throw new Error('Storage quota exceeded');
      });

      // Should not throw error
      expect(() => {
        performanceMonitor.saveMetricsToStorage();
      }).not.toThrow();

      // Restore original method
      localStorageMock.setItem = originalSetItem;
    });

    test('should handle performance.now errors gracefully', () => {
      // Mock performance.now to throw error
      mockPerformanceNow.mockImplementation(() => {
        throw new Error('Performance API not available');
      });

      // Should still work with fallback
      expect(() => {
        performanceMonitor.startSessionRecovery('error-user', 'lobby');
      }).not.toThrow();

      // Restore mock
      mockPerformanceNow.mockImplementation(() => mockTime);
    });
  });
});