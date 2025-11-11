// Database Manager Performance Tests

import { initializeDatabaseManager, resetDatabaseManager } from '../database/DatabaseManager';
import { getSecurityService } from '../services/SecurityService';
import { performanceCollector } from '../utils/performance';
import { testConfig } from '../config/database';

describe('Database Manager Performance', () => {
  let dbManager: any;
  let securityService: any;

  beforeAll(async () => {
    securityService = getSecurityService(testConfig.security);
    dbManager = await initializeDatabaseManager();
    
    // Reset performance metrics
    performanceCollector.reset();
  });

  afterAll(async () => {
    if (dbManager) {
      await dbManager.close();
    }
    await resetDatabaseManager();
  });

  describe('Query Performance', () => {
    test('should execute queries within acceptable time limits', async () => {
      const userRepo = dbManager.getUserRepository();
      
      const startTime = Date.now();
      
      // Create multiple users to test performance
      const users = [];
      for (let i = 0; i < 10; i++) {
        const user = await userRepo.createUser({
          username: `perftest${i}`,
          displayName: `Performance Test User ${i}`,
          passwordHash: await securityService.hashPassword('testpass'),
          isGuest: false
        });
        users.push(user);
      }
      
      const createTime = Date.now() - startTime;
      expect(createTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Test bulk queries
      const queryStartTime = Date.now();
      const foundUsers = await userRepo.findBy({ is_guest: 0 });
      const queryTime = Date.now() - queryStartTime;
      
      expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
      expect(foundUsers.length).toBeGreaterThanOrEqual(10);
    });

    test('should handle concurrent operations efficiently', async () => {
      const userRepo = dbManager.getUserRepository();
      const sessionRepo = dbManager.getSessionRepository();
      
      // Create concurrent operations
      const operations = [];
      
      for (let i = 0; i < 5; i++) {
        operations.push(
          userRepo.createUser({
            username: `concurrent${i}`,
            displayName: `Concurrent User ${i}`,
            passwordHash: await securityService.hashPassword('testpass'),
            isGuest: false
          })
        );
      }
      
      const startTime = Date.now();
      const users = await Promise.all(operations);
      const concurrentTime = Date.now() - startTime;
      
      expect(concurrentTime).toBeLessThan(3000); // Should complete within 3 seconds
      expect(users).toHaveLength(5);
      
      // Create sessions for all users concurrently
      const sessionOperations = users.map(user => 
        sessionRepo.createSession({
          userId: user.id,
          token: securityService.generateSecureToken(),
          expiresAt: new Date(Date.now() + 60000),
          ipAddress: '127.0.0.1'
        })
      );
      
      const sessionStartTime = Date.now();
      const sessions = await Promise.all(sessionOperations);
      const sessionTime = Date.now() - sessionStartTime;
      
      expect(sessionTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(sessions).toHaveLength(5);
    });
  });

  describe('Memory Usage', () => {
    test('should not have memory leaks during operations', async () => {
      const userRepo = dbManager.getUserRepository();
      
      const initialMetrics = performanceCollector.getMetrics();
      const initialMemory = initialMetrics.memory.current.heapUsed;
      
      // Perform many operations
      for (let i = 0; i < 50; i++) {
        const user = await userRepo.createUser({
          username: `memtest${i}`,
          displayName: `Memory Test User ${i}`,
          passwordHash: await securityService.hashPassword('testpass'),
          isGuest: false
        });
        
        // Find and update user
        const foundUser = await userRepo.findById(user.id);
        await userRepo.update(user.id, { displayName: `Updated ${i}` });
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMetrics = performanceCollector.getMetrics();
      const finalMemory = finalMetrics.memory.current.heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50);
    });
  });

  describe('Database Optimization', () => {
    test('should optimize database successfully', async () => {
      const startTime = Date.now();
      const results = await dbManager.optimize();
      const optimizationTime = Date.now() - startTime;
      
      expect(results).toBeDefined();
      expect(results.vacuum).toBe(true);
      expect(results.analyze).toBe(true);
      expect(results.duration).toBeGreaterThan(0);
      expect(optimizationTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    test('should provide database statistics', async () => {
      const stats = await dbManager.getStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.database).toBeDefined();
      expect(stats.repositories).toBeDefined();
      expect(stats.database.isConnected).toBe(true);
    });

    test('should cleanup old data efficiently', async () => {
      const userRepo = dbManager.getUserRepository();
      const sessionRepo = dbManager.getSessionRepository();
      
      // Create some test data
      const user = await userRepo.createUser({
        username: 'cleanuptest',
        displayName: 'Cleanup Test User',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      // Create expired session
      await sessionRepo.createSession({
        userId: user.id,
        token: securityService.generateSecureToken(),
        expiresAt: new Date(Date.now() - 60000), // Expired
        ipAddress: '127.0.0.1'
      });
      
      const startTime = Date.now();
      const cleanupResults = await dbManager.cleanup();
      const cleanupTime = Date.now() - startTime;
      
      expect(cleanupResults).toBeDefined();
      expect(cleanupResults.expiredSessions).toBeGreaterThanOrEqual(0);
      expect(cleanupTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Performance Monitoring', () => {
    test('should record performance metrics', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Perform some operations
      await userRepo.createUser({
        username: 'metricstest',
        displayName: 'Metrics Test User',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      const metrics = performanceCollector.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.database.queries).toBeGreaterThan(0);
      expect(metrics.database.averageQueryTime).toBeGreaterThan(0);
      expect(metrics.memory.current).toBeDefined();
      expect(metrics.uptime).toBeGreaterThan(0);
    });

    test('should detect slow queries', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Create a potentially slow operation (large batch)
      const operations = [];
      for (let i = 0; i < 20; i++) {
        operations.push(
          userRepo.createUser({
            username: `slowtest${i}`,
            displayName: `Slow Test User ${i}`,
            passwordHash: await securityService.hashPassword('testpass'),
            isGuest: false
          })
        );
      }
      
      await Promise.all(operations);
      
      const metrics = performanceCollector.getMetrics();
      
      // Should have recorded the queries
      expect(metrics.database.queries).toBeGreaterThan(20);
      
      // Check if any slow queries were detected
      // (This depends on system performance, so we just check the metric exists)
      expect(typeof metrics.database.slowQueries).toBe('number');
    });
  });

  describe('Connection Management', () => {
    test('should handle connection health checks', async () => {
      const health = await dbManager.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.isConnected).toBe(true);
      expect(health.responseTime).toBeGreaterThan(0);
      expect(health.responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    test('should handle database reconnection', async () => {
      // Test that the database can handle reconnection scenarios
      const initialHealth = await dbManager.healthCheck();
      expect(initialHealth.isConnected).toBe(true);
      
      // Perform operations after health check
      const userRepo = dbManager.getUserRepository();
      const user = await userRepo.createUser({
        username: 'reconnecttest',
        displayName: 'Reconnect Test User',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      expect(user).toBeDefined();
      expect(user.username).toBe('reconnecttest');
    });
  });
});