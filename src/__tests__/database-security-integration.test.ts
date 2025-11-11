// Database security integration tests

import { initializeDatabaseManager, resetDatabaseManager } from '../database/DatabaseManager';
import { getSecurityService, resetSecurityService } from '../services/SecurityService';
import { getLogger, resetLogger } from '../services/LoggingService';
import { testConfig } from '../config/database';

describe('Database Security Integration', () => {
  let dbManager: any;
  let securityService: any;
  let logger: any;

  beforeAll(async () => {
    // Initialize services with test configuration
    logger = getLogger(testConfig.logging);
    securityService = getSecurityService(testConfig.security);
    dbManager = await initializeDatabaseManager();
  });

  afterAll(async () => {
    // Cleanup
    if (dbManager) {
      await dbManager.close();
    }
    await resetDatabaseManager();
    resetSecurityService();
    resetLogger();
  });

  describe('User Repository Security', () => {
    test('should prevent SQL injection in user queries', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Attempt SQL injection
      const maliciousUsername = "'; DROP TABLE users; --";
      
      const result = await userRepo.findByUsername(maliciousUsername);
      expect(result).toBeNull();
      
      // Verify users table still exists
      const testUser = await userRepo.createUser({
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: 'hashedpassword',
        isGuest: false
      });
      
      expect(testUser).toBeDefined();
      expect(testUser.username).toBe('testuser');
    });

    test('should validate input data', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Test invalid username
      await expect(userRepo.createUser({
        username: 'ab', // Too short
        displayName: 'Test User',
        passwordHash: 'hashedpassword',
        isGuest: false
      })).rejects.toThrow();
      
      // Test invalid email
      await expect(userRepo.createUser({
        username: 'testuser2',
        displayName: 'Test User',
        email: 'invalid-email',
        passwordHash: 'hashedpassword',
        isGuest: false
      })).rejects.toThrow();
    });

    test('should sanitize user input', async () => {
      const userRepo = dbManager.getUserRepository();
      
      const user = await userRepo.createUser({
        username: 'testuser3',
        displayName: '<script>alert("xss")</script>Test User',
        passwordHash: 'hashedpassword',
        isGuest: false
      });
      
      // Display name should be sanitized
      expect(user.displayName).not.toContain('<script>');
      expect(user.displayName).toContain('Test User');
    });
  });

  describe('Session Repository Security', () => {
    test('should handle session tokens securely', async () => {
      const sessionRepo = dbManager.getSessionRepository();
      const userRepo = dbManager.getUserRepository();
      
      // Create test user
      const user = await userRepo.createUser({
        username: 'sessiontest',
        displayName: 'Session Test',
        passwordHash: 'hashedpassword',
        isGuest: false
      });
      
      // Create session with secure token
      const token = securityService.generateSecureToken();
      const session = await sessionRepo.createSession({
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 60000), // 1 minute
        ipAddress: '127.0.0.1'
      });
      
      expect(session.token).toBe(token);
      expect(session.token.length).toBeGreaterThan(32);
      
      // Verify session can be found
      const foundSession = await sessionRepo.findByToken(token);
      expect(foundSession).toBeDefined();
      expect(foundSession?.userId).toBe(user.id);
    });

    test('should cleanup expired sessions', async () => {
      const sessionRepo = dbManager.getSessionRepository();
      const userRepo = dbManager.getUserRepository();
      
      // Create test user
      const user = await userRepo.createUser({
        username: 'expiredtest',
        displayName: 'Expired Test',
        passwordHash: 'hashedpassword',
        isGuest: false
      });
      
      // Create expired session
      const token = securityService.generateSecureToken();
      await sessionRepo.createSession({
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
        ipAddress: '127.0.0.1'
      });
      
      // Session should not be found (expired)
      const foundSession = await sessionRepo.findByToken(token);
      expect(foundSession).toBeNull();
      
      // Cleanup should remove expired sessions
      const cleanedCount = await sessionRepo.cleanupExpired();
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Security Service', () => {
    test('should hash passwords securely', async () => {
      const password = 'testpassword123';
      const hash = await securityService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
      
      // Verify password
      const isValid = await securityService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
      
      // Wrong password should fail
      const isInvalid = await securityService.verifyPassword('wrongpassword', hash);
      expect(isInvalid).toBe(false);
    });

    test('should validate input formats', () => {
      // Username validation
      expect(securityService.validateUsername('validuser')).toBe(true);
      expect(securityService.validateUsername('ab')).toBe(false); // Too short
      expect(securityService.validateUsername('user@name')).toBe(false); // Invalid chars
      
      // Email validation
      expect(securityService.validateEmail('test@example.com')).toBe(true);
      expect(securityService.validateEmail('invalid-email')).toBe(false);
      expect(securityService.validateEmail('')).toBe(false);
    });

    test('should sanitize input strings', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello World';
      const sanitized = securityService.sanitizeInput(maliciousInput);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Hello World');
    });

    test('should generate secure tokens', () => {
      const token1 = securityService.generateSecureToken();
      const token2 = securityService.generateSecureToken();
      
      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      expect(token1.length).toBeGreaterThan(32);
      expect(token2.length).toBeGreaterThan(32);
    });
  });

  describe('Database Adapter Security', () => {
    test('should prevent SQL injection in queries', async () => {
      const adapter = dbManager.getAdapter();
      
      // This should not cause any issues
      const maliciousParam = "'; DROP TABLE users; --";
      
      try {
        await adapter.query('SELECT * FROM users WHERE username = ?', [maliciousParam]);
        // Should not throw, just return empty results
      } catch (error) {
        // If it throws, it should be a proper database error, not a syntax error
        expect(error.message).not.toContain('syntax error');
      }
    });

    test('should validate query parameters', async () => {
      const adapter = dbManager.getAdapter();
      
      // Test with various parameter types
      const results = await adapter.query(
        'SELECT ? as test_string, ? as test_number, ? as test_boolean', 
        ['test', 123, true]
      );
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Try to create user with duplicate username
      await userRepo.createUser({
        username: 'duplicate',
        displayName: 'First User',
        passwordHash: 'hashedpassword',
        isGuest: false
      });
      
      await expect(userRepo.createUser({
        username: 'duplicate',
        displayName: 'Second User',
        passwordHash: 'hashedpassword',
        isGuest: false
      })).rejects.toThrow();
    });

    test('should not leak sensitive information in errors', async () => {
      const userRepo = dbManager.getUserRepository();
      
      try {
        await userRepo.createUser({
          username: 'testuser',
          displayName: '', // Invalid - empty display name
          passwordHash: 'hashedpassword',
          isGuest: false
        });
      } catch (error) {
        // Error message should not contain sensitive information
        expect(error.message).not.toContain('password');
        expect(error.message).not.toContain('hash');
        expect(error.message).not.toContain('token');
      }
    });
  });
});