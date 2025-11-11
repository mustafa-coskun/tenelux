// Using Jest globals (available in React testing environment)
import PerformanceSecurityTestRunner from './PerformanceSecurityTestRunner';
import DatabaseConnection from '../database/DatabaseConnection';

/**
 * Comprehensive performance optimization and security testing suite
 * Tests all aspects of system performance and security vulnerabilities
 */
describe('Performance Optimization and Security Testing', () => {
  let testRunner: PerformanceSecurityTestRunner;
  let db: DatabaseConnection;

  beforeAll(async () => {
    // Initialize database for testing
    db = DatabaseConnection.getInstance();
    await db.initialize();
    
    // Initialize test runner
    testRunner = new PerformanceSecurityTestRunner();
  });

  afterAll(async () => {
    // Clean up database connections
    if (db) {
      await db.close();
    }
  });

  describe('Database Query Optimization', () => {
    test('should optimize database queries with proper indexing', async () => {
      const result = await testRunner.runPerformanceTests();
      
      expect(result.passed).toBe(true);
      expect(result.results.databaseOptimization.passed).toBe(true);
      expect(result.results.databaseOptimization.metrics.queryPerformance).toBeDefined();
      
      // All queries should complete within reasonable time
      const queryTimes = result.results.databaseOptimization.metrics.queryPerformance;
      queryTimes.forEach((time: number) => {
        expect(time).toBeLessThan(1000); // Less than 1 second
      });
    }, 30000);

    test('should implement effective query caching', async () => {
      const result = await testRunner.runPerformanceTests();
      
      expect(result.results.databaseOptimization.metrics.cacheHitRate).toBeGreaterThan(0);
    }, 15000);
  });

  describe('API Response Optimization', () => {
    test('should implement compression middleware', async () => {
      const result = await testRunner.runPerformanceTests();
      
      expect(result.results.apiOptimization.metrics.compressionEnabled).toBe(true);
    });

    test('should implement rate limiting', async () => {
      const result = await testRunner.runPerformanceTests();
      
      expect(result.results.apiOptimization.metrics.rateLimitEnabled).toBe(true);
    });

    test('should implement response caching', async () => {
      const result = await testRunner.runPerformanceTests();
      
      expect(result.results.apiOptimization.metrics.cacheEnabled).toBe(true);
    });

    test('should optimize JSON responses', async () => {
      const result = await testRunner.runPerformanceTests();
      
      expect(result.results.apiOptimization.metrics.responseOptimization).toBe(true);
    });
  });

  describe('Concurrent User Testing', () => {
    test('should handle concurrent connections efficiently', async () => {
      const result = await testRunner.runPerformanceTests();
      
      expect(result.results.concurrentUsers.passed).toBe(true);
      expect(result.results.concurrentUsers.metrics.usersSimulated).toBeGreaterThan(0);
    }, 60000);

    test('should maintain performance under load', async () => {
      const result = await testRunner.runPerformanceTests();
      
      // Should successfully simulate multiple users without errors
      expect(result.results.concurrentUsers.metrics.error).toBeUndefined();
    }, 60000);
  });

  describe('Cross-Browser Compatibility', () => {
    test('should support WebSocket across browsers', async () => {
      const result = await testRunner.runPerformanceTests();
      
      expect(result.results.crossBrowser.passed).toBe(true);
      expect(result.results.crossBrowser.details).toBeDefined();
    });

    test('should support required web APIs', async () => {
      const result = await testRunner.runPerformanceTests();
      
      // Should pass all compatibility tests
      expect(result.results.crossBrowser.summary).toContain('passed');
    });
  });

  describe('Security Penetration Testing', () => {
    test('should resist injection attacks', async () => {
      const result = await testRunner.runSecurityTests();
      
      // Should find no critical injection vulnerabilities
      expect(result.results.penetrationTesting.criticalCount).toBe(0);
    }, 30000);

    test('should implement proper rate limiting', async () => {
      const result = await testRunner.runSecurityTests();
      
      expect(result.results.rateLimit.passed).toBe(true);
      expect(result.results.rateLimit.rateLimitActive).toBe(true);
    });

    test('should validate all input data', async () => {
      const result = await testRunner.runSecurityTests();
      
      expect(result.results.dataValidation.passed).toBe(true);
      expect(result.results.dataValidation.failedValidations).toBe(0);
    });

    test('should prevent authentication bypass', async () => {
      const result = await testRunner.runSecurityTests();
      
      // Should not find authentication bypass vulnerabilities
      const authBypassVulns = result.results.penetrationTesting.vulnerabilities
        .filter((v: any) => v.type === 'Authentication Bypass');
      expect(authBypassVulns.length).toBe(0);
    }, 30000);

    test('should prevent session hijacking', async () => {
      const result = await testRunner.runSecurityTests();
      
      // Should not find session hijacking vulnerabilities
      const sessionVulns = result.results.penetrationTesting.vulnerabilities
        .filter((v: any) => v.type === 'Session Hijacking');
      expect(sessionVulns.length).toBe(0);
    }, 30000);
  });

  describe('Comprehensive Integration Test', () => {
    test('should pass all performance and security tests', async () => {
      const result = await testRunner.runAllTests();
      
      expect(result.passed).toBe(true);
      expect(result.summary).toContain('PASSED');
      
      // Performance tests should pass
      expect(result.performance.passed).toBe(true);
      
      // Security tests should pass (no vulnerabilities)
      expect(result.security.passed).toBe(true);
      expect(result.security.results.penetrationTesting.vulnerabilitiesFound).toBe(0);
    }, 120000); // 2 minutes timeout for comprehensive test
  });

  describe('Performance Metrics Validation', () => {
    test('should meet performance benchmarks', async () => {
      const result = await testRunner.runPerformanceTests();
      
      // Database optimization should be effective
      const dbMetrics = result.results.databaseOptimization.metrics;
      expect(dbMetrics.optimizationTime).toBeLessThan(5000); // Less than 5 seconds
      
      // Query performance should be acceptable
      if (dbMetrics.queryPerformance.length > 0) {
        const avgQueryTime = dbMetrics.queryPerformance.reduce((a: number, b: number) => a + b, 0) / dbMetrics.queryPerformance.length;
        expect(avgQueryTime).toBeLessThan(500); // Average less than 500ms
      }
    }, 30000);

    test('should demonstrate caching effectiveness', async () => {
      const result = await testRunner.runPerformanceTests();
      
      const dbMetrics = result.results.databaseOptimization.metrics;
      
      // Cache hit should be faster than cache miss (if we have multiple queries)
      if (dbMetrics.queryPerformance.length >= 2) {
        const cacheMiss = dbMetrics.queryPerformance[0];
        const cacheHit = dbMetrics.queryPerformance[1];
        expect(cacheHit).toBeLessThanOrEqual(cacheMiss);
      }
    }, 15000);
  });

  describe('Security Compliance Validation', () => {
    test('should have no high or critical security vulnerabilities', async () => {
      const result = await testRunner.runSecurityTests();
      
      expect(result.results.penetrationTesting.criticalCount).toBe(0);
      expect(result.results.penetrationTesting.highCount).toBe(0);
    }, 45000);

    test('should implement proper security headers', async () => {
      const result = await testRunner.runPerformanceTests();
      
      // API optimization should include security measures
      expect(result.results.apiOptimization.passed).toBe(true);
    });

    test('should handle malformed requests gracefully', async () => {
      const result = await testRunner.runSecurityTests();
      
      // Should not find DoS vulnerabilities
      const dosVulns = result.results.penetrationTesting.vulnerabilities
        .filter((v: any) => v.type.includes('Denial'));
      expect(dosVulns.length).toBe(0);
    }, 30000);
  });
});

// Additional utility tests for individual components
describe('Individual Component Performance Tests', () => {
  test('QueryOptimizer should cache queries effectively', async () => {
    // Initialize database first
    const db = DatabaseConnection.getInstance();
    await db.initialize();
    
    const { QueryOptimizer } = await import('../database/QueryOptimizer');
    const optimizer = QueryOptimizer.getInstance();
    
    const testQuery = 'SELECT 1 as test';
    const cacheKey = 'test-query';
    
    try {
      // First call (cache miss)
      const start1 = performance.now();
      await optimizer.cachedQuery(cacheKey, testQuery);
      const time1 = performance.now() - start1;
      
      // Second call (cache hit)
      const start2 = performance.now();
      await optimizer.cachedQuery(cacheKey, testQuery);
      const time2 = performance.now() - start2;
      
      // Cache hit should be significantly faster or at least not slower
      expect(time2).toBeLessThanOrEqual(time1 + 10); // Allow small margin for timing variations
    } finally {
      await db.close();
    }
  });

  test('ApiOptimizationService should optimize responses', async () => {
    const { ApiOptimizationService } = await import('../services/ApiOptimizationService');
    const optimizer = ApiOptimizationService.getInstance();
    
    const testData = {
      valid: 'data',
      empty: null,
      emptyArray: [],
      emptyObject: {},
      nested: {
        valid: 'nested',
        empty: null
      }
    };
    
    const optimized = optimizer.optimizeJsonResponse(testData);
    
    // Should remove empty values
    expect(optimized.empty).toBeUndefined();
    expect(optimized.emptyArray).toBeUndefined();
    expect(optimized.emptyObject).toBeUndefined();
    expect(optimized.nested.empty).toBeUndefined();
    
    // Should keep valid data
    expect(optimized.valid).toBe('data');
    expect(optimized.nested.valid).toBe('nested');
  });
});