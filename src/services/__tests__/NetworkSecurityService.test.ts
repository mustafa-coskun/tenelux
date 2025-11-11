import {
  NetworkSecurityService,
  AuthenticationToken,
} from '../NetworkSecurityService';
import { NetworkMessage, NetworkMessageType } from '../../types/network';

describe('NetworkSecurityService', () => {
  let networkSecurity: NetworkSecurityService;

  beforeEach(() => {
    networkSecurity = new NetworkSecurityService('test-secret-key');
  });

  describe('Authentication Tokens', () => {
    it('should generate valid authentication token', () => {
      const token = networkSecurity.generateAuthToken('player1', 'session1', [
        'basic',
      ]);

      expect(token.playerId).toBe('player1');
      expect(token.sessionId).toBe('session1');
      expect(token.permissions).toContain('basic');
      expect(token.signature).toBeDefined();
      expect(token.nonce).toBeDefined();
      expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should validate correct authentication token', () => {
      const token = networkSecurity.generateAuthToken('player1', 'session1', [
        'basic',
      ]);

      const validation = networkSecurity.validateAuthToken(token);
      expect(validation.isValid).toBe(true);
    });

    it('should reject token with invalid signature', () => {
      const token = networkSecurity.generateAuthToken('player1', 'session1', [
        'basic',
      ]);
      token.signature = 'invalid-signature';

      const validation = networkSecurity.validateAuthToken(token);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('INVALID_TOKEN_SIGNATURE');
    });

    it('should reject expired token', () => {
      const token = networkSecurity.generateAuthToken('player1', 'session1', [
        'basic',
      ]);
      token.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago

      const validation = networkSecurity.validateAuthToken(token);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('TOKEN_EXPIRED');
    });

    it('should validate permissions', () => {
      const token = networkSecurity.generateAuthToken('player1', 'session1', [
        'basic',
      ]);

      // Should pass with basic permission
      let validation = networkSecurity.validateAuthToken(token, 'basic');
      expect(validation.isValid).toBe(true);

      // Should fail with admin permission
      validation = networkSecurity.validateAuthToken(token, 'admin');
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should revoke authentication token', () => {
      const token = networkSecurity.generateAuthToken('player1', 'session1', [
        'basic',
      ]);

      // Token should be valid initially
      let validation = networkSecurity.validateAuthToken(token);
      expect(validation.isValid).toBe(true);

      // Revoke token
      networkSecurity.revokeAuthToken('player1', 'session1');

      // Token should be invalid after revocation
      validation = networkSecurity.validateAuthToken(token);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('TOKEN_NOT_FOUND');
    });
  });

  describe('Message Encryption', () => {
    it('should encrypt and decrypt messages correctly', () => {
      const originalMessage: NetworkMessage = {
        type: NetworkMessageType.PLAYER_DECISION,
        payload: { decision: 'stay_silent', roundNumber: 1 },
        timestamp: new Date(),
        playerId: 'player1',
      };

      const encrypted = networkSecurity.encryptMessage(originalMessage);
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      const decrypted = networkSecurity.decryptMessage(encrypted);
      expect(decrypted.type).toBe(originalMessage.type);
      expect(decrypted.payload).toEqual(originalMessage.payload);
      expect(decrypted.playerId).toBe(originalMessage.playerId);
    });

    it('should fail to decrypt tampered message', () => {
      const originalMessage: NetworkMessage = {
        type: NetworkMessageType.PLAYER_DECISION,
        payload: { decision: 'stay_silent' },
        timestamp: new Date(),
      };

      const encrypted = networkSecurity.encryptMessage(originalMessage);

      // Tamper with encrypted data
      encrypted.encryptedData = encrypted.encryptedData.slice(0, -2) + '00';

      expect(() => {
        networkSecurity.decryptMessage(encrypted);
      }).toThrow('Failed to decrypt message - possible tampering detected');
    });
  });

  describe('IP Rate Limiting', () => {
    it('should allow requests within rate limit', () => {
      const ip = '192.168.1.1';

      const validation = networkSecurity.validateIPRateLimit(ip);
      expect(validation.isValid).toBe(true);
    });

    it('should block IP after rate limit exceeded', () => {
      const ip = '192.168.1.2';

      // Make requests up to the limit
      for (let i = 0; i < 100; i++) {
        networkSecurity.validateIPRateLimit(ip);
      }

      // Next request should be blocked
      const validation = networkSecurity.validateIPRateLimit(ip);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(validation.shouldBlock).toBe(true);
    });

    it('should manually block and unblock IP', () => {
      const ip = '192.168.1.3';

      // Initially should be allowed
      let validation = networkSecurity.validateIPRateLimit(ip);
      expect(validation.isValid).toBe(true);

      // Block IP
      networkSecurity.blockIP(ip);

      // Should be blocked
      validation = networkSecurity.validateIPRateLimit(ip);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('IP_BLOCKED');

      // Unblock IP
      networkSecurity.unblockIP(ip);

      // Should be allowed again
      validation = networkSecurity.validateIPRateLimit(ip);
      expect(validation.isValid).toBe(true);
    });
  });

  describe('Message Security Validation', () => {
    it('should validate normal message', () => {
      const message = {
        type: 'PLAYER_DECISION',
        payload: { decision: 'stay_silent' },
      };

      const validation = networkSecurity.validateMessageSecurity(
        message,
        'conn1'
      );
      expect(validation.isValid).toBe(true);
    });

    it('should reject oversized message', () => {
      const largePayload = 'x'.repeat(20000); // Larger than 10KB limit
      const message = {
        type: 'PLAYER_DECISION',
        payload: { data: largePayload },
      };

      const validation = networkSecurity.validateMessageSecurity(
        message,
        'conn1'
      );
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('MESSAGE_TOO_LARGE');
    });

    it('should reject message with suspicious content', () => {
      const message = {
        type: 'PLAYER_DECISION',
        payload: { script: '<script>alert("xss")</script>' },
      };

      const validation = networkSecurity.validateMessageSecurity(
        message,
        'conn1'
      );
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('SUSPICIOUS_CONTENT');
      expect(validation.shouldBlock).toBe(true);
    });
  });

  describe('Security Status', () => {
    it('should provide security status', () => {
      // Generate some tokens and rate limit entries
      networkSecurity.generateAuthToken('player1', 'session1');
      networkSecurity.generateAuthToken('player2', 'session2');
      networkSecurity.validateIPRateLimit('192.168.1.1');
      networkSecurity.blockIP('192.168.1.100');

      const status = networkSecurity.getSecurityStatus();
      expect(status.activeTokens).toBe(2);
      expect(status.blockedIPs).toBe(1);
      expect(status.rateLimitedIPs).toBe(0);
      expect(status.suspiciousActivities).toBe(0);
    });
  });
});
