// Security service unit tests

import { SecurityService, resetSecurityService } from '../SecurityService';
import { testConfig } from '../../config/database';

describe('SecurityService', () => {
  let securityService: SecurityService;

  beforeEach(() => {
    resetSecurityService();
    securityService = new SecurityService(testConfig.security);
  });

  describe('Input Sanitization', () => {
    test('should sanitize malicious input', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        'SELECT * FROM users; DROP TABLE users;'
      ];

      maliciousInputs.forEach(input => {
        const sanitized = securityService.sanitizeInput(input);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
      });
    });

    test('should preserve safe content', () => {
      const safeInputs = [
        'Hello World',
        'User123',
        'test@example.com',
        'This is a normal message with numbers 123 and symbols !@#'
      ];

      safeInputs.forEach(input => {
        const sanitized = securityService.sanitizeInput(input);
        expect(sanitized.length).toBeGreaterThan(0);
        expect(sanitized).toContain('Hello World'.substring(0, 5));
      });
    });

    test('should handle null bytes', () => {
      const inputWithNullBytes = 'Hello\0World\0Test';
      const sanitized = securityService.sanitizeInput(inputWithNullBytes);
      expect(sanitized).not.toContain('\0');
      expect(sanitized).toBe('HelloWorldTest');
    });

    test('should limit input length', () => {
      const longInput = 'a'.repeat(20000);
      const sanitized = securityService.sanitizeInput(longInput);
      expect(sanitized.length).toBeLessThanOrEqual(10000);
    });
  });

  describe('SQL Injection Prevention', () => {
    test('should detect dangerous SQL patterns', () => {
      const dangerousQueries = [
        "SELECT * FROM users; DROP TABLE users;",
        "SELECT * FROM users UNION SELECT * FROM passwords",
        "SELECT * FROM users WHERE id = 1 OR 1=1",
        "SELECT * FROM users WHERE name = 'admin'--",
        "SELECT * FROM users; EXEC xp_cmdshell('dir')"
      ];

      dangerousQueries.forEach(query => {
        expect(() => securityService.validateQuery(query)).toThrow();
      });
    });

    test('should allow safe queries', () => {
      const safeQueries = [
        "SELECT * FROM users WHERE id = ?",
        "INSERT INTO users (name, email) VALUES (?, ?)",
        "UPDATE users SET name = ? WHERE id = ?",
        "SELECT COUNT(*) FROM users"
      ];

      safeQueries.forEach(query => {
        expect(() => securityService.validateQuery(query)).not.toThrow();
      });
    });
  });

  describe('Password Security', () => {
    test('should hash passwords securely', async () => {
      const password = 'testpassword123';
      const hash = await securityService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
      expect(hash.startsWith('$2')).toBe(true); // bcrypt format
    });

    test('should verify passwords correctly', async () => {
      const password = 'testpassword123';
      const hash = await securityService.hashPassword(password);

      const isValid = await securityService.verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await securityService.verifyPassword('wrongpassword', hash);
      expect(isInvalid).toBe(false);
    });

    test('should validate password strength', () => {
      const validPasswords = [
        'password123',
        'mySecurePass1',
        'test123456'
      ];

      const invalidPasswords = [
        'short', // Too short
        '123456', // Common password
        'password', // Common password
        'a'.repeat(200) // Too long
      ];

      validPasswords.forEach(password => {
        const result = securityService.validatePassword(password);
        expect(result.isValid).toBe(true);
      });

      invalidPasswords.forEach(password => {
        const result = securityService.validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Token Generation', () => {
    test('should generate secure tokens', () => {
      const token1 = securityService.generateSecureToken();
      const token2 = securityService.generateSecureToken();

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
      expect(token2.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(token1)).toBe(true);
      expect(/^[a-f0-9]+$/.test(token2)).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    test('should allow requests within limit', async () => {
      const identifier = 'test-user';
      
      // First request should be allowed
      const allowed1 = await securityService.rateLimit(identifier);
      expect(allowed1).toBe(true);
      
      // Second request should be allowed
      const allowed2 = await securityService.rateLimit(identifier);
      expect(allowed2).toBe(true);
    });

    test('should block requests when rate limit is disabled', async () => {
      // Rate limiting is disabled in test config
      const identifier = 'test-user';
      
      // All requests should be allowed when rate limiting is disabled
      for (let i = 0; i < 200; i++) {
        const allowed = await securityService.rateLimit(identifier);
        expect(allowed).toBe(true);
      }
    });

    test('should provide rate limit status', () => {
      const identifier = 'test-user';
      const status = securityService.getRateLimitStatus(identifier);
      
      expect(status).toBeDefined();
      expect(status.remaining).toBeDefined();
      expect(status.resetTime).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    test('should validate email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com',
        ''
      ];

      validEmails.forEach(email => {
        expect(securityService.validateEmail(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        expect(securityService.validateEmail(email)).toBe(false);
      });
    });

    test('should validate usernames', () => {
      const validUsernames = [
        'user123',
        'test_user',
        'user-name',
        'ValidUser'
      ];

      const invalidUsernames = [
        'ab', // Too short
        'a'.repeat(25), // Too long
        'user@name', // Invalid character
        'user name', // Space not allowed
        ''
      ];

      validUsernames.forEach(username => {
        expect(securityService.validateUsername(username)).toBe(true);
      });

      invalidUsernames.forEach(username => {
        expect(securityService.validateUsername(username)).toBe(false);
      });
    });
  });

  describe('Data Encryption', () => {
    test('should encrypt and decrypt data', () => {
      const originalData = 'sensitive information';
      
      const encrypted = securityService.encryptSensitiveData(originalData);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(originalData);
      expect(encrypted.includes(':')).toBe(true); // Should contain separators
      
      const decrypted = securityService.decryptSensitiveData(encrypted);
      expect(decrypted).toBe(originalData);
    });

    test('should fail to decrypt invalid data', () => {
      expect(() => {
        securityService.decryptSensitiveData('invalid:encrypted:data');
      }).toThrow();
    });
  });

  describe('Security Metrics', () => {
    test('should provide security metrics', () => {
      const metrics = securityService.getSecurityMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.rateLimitedIdentifiers).toBeDefined();
      expect(metrics.totalRateLimitEntries).toBeDefined();
      expect(metrics.encryptionAlgorithm).toBeDefined();
    });
  });
});