import crypto from 'crypto';
import { NetworkMessage, WebSocketConnection } from '../types/network';

export interface AuthenticationToken {
  playerId: string;
  sessionId?: string;
  issuedAt: Date;
  expiresAt: Date;
  permissions: string[];
  signature: string;
  nonce: string;
}

export interface IPRateLimitEntry {
  ip: string;
  requestCount: number;
  windowStart: Date;
  lastRequest: Date;
  isBlocked: boolean;
  blockExpiresAt?: Date;
}

export interface SecurityValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
  shouldBlock?: boolean;
  details?: any;
}

export interface EncryptedMessage {
  encryptedData: string;
  iv: string;
  authTag: string;
  timestamp: Date;
}

export class NetworkSecurityService {
  private readonly SECRET_KEY: string;
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private readonly TOKEN_EXPIRY_HOURS = 2;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 100;
  private readonly BLOCK_DURATION = 300000; // 5 minutes
  private readonly MAX_MESSAGE_SIZE = 10240; // 10KB

  // Storage for security data
  private authTokens: Map<string, AuthenticationToken> = new Map();
  private ipRateLimits: Map<string, IPRateLimitEntry> = new Map();
  private blockedIPs: Set<string> = new Set();
  private suspiciousActivity: Map<string, number> = new Map();

  constructor(secretKey?: string) {
    this.SECRET_KEY = secretKey || this.generateSecretKey();

    // Start cleanup intervals
    setInterval(() => this.cleanupExpiredTokens(), 300000); // 5 minutes
    setInterval(() => this.cleanupRateLimitEntries(), 600000); // 10 minutes
  }

  /**
   * Generate an authentication token for a player
   */
  generateAuthToken(
    playerId: string,
    sessionId?: string,
    permissions: string[] = ['basic']
  ): AuthenticationToken {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    );
    const nonce = crypto.randomBytes(16).toString('hex');

    const tokenData = {
      playerId,
      sessionId,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      permissions,
      nonce,
    };

    const signature = this.signData(tokenData);

    const token: AuthenticationToken = {
      playerId,
      sessionId,
      issuedAt: now,
      expiresAt,
      permissions,
      signature,
      nonce,
    };

    // Store token
    this.authTokens.set(this.getTokenKey(playerId, sessionId), token);

    return token;
  }

  /**
   * Validate an authentication token
   */
  validateAuthToken(
    token: AuthenticationToken,
    requiredPermission?: string
  ): SecurityValidationResult {
    const tokenKey = this.getTokenKey(token.playerId, token.sessionId);
    const storedToken = this.authTokens.get(tokenKey);

    if (!storedToken) {
      return {
        isValid: false,
        errorCode: 'TOKEN_NOT_FOUND',
        errorMessage: 'Authentication token not found',
      };
    }

    // Check expiration
    if (new Date() > token.expiresAt) {
      this.authTokens.delete(tokenKey);
      return {
        isValid: false,
        errorCode: 'TOKEN_EXPIRED',
        errorMessage: 'Authentication token has expired',
      };
    }

    // Verify signature
    const tokenData = {
      playerId: token.playerId,
      sessionId: token.sessionId,
      issuedAt: token.issuedAt.toISOString(),
      expiresAt: token.expiresAt.toISOString(),
      permissions: token.permissions,
      nonce: token.nonce,
    };

    const expectedSignature = this.signData(tokenData);
    if (token.signature !== expectedSignature) {
      this.recordSuspiciousActivity(token.playerId);
      return {
        isValid: false,
        errorCode: 'INVALID_TOKEN_SIGNATURE',
        errorMessage: 'Authentication token signature is invalid',
      };
    }

    // Check permissions
    if (
      requiredPermission &&
      !token.permissions.includes(requiredPermission) &&
      !token.permissions.includes('admin')
    ) {
      return {
        isValid: false,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        errorMessage: `Required permission '${requiredPermission}' not found in token`,
      };
    }

    return { isValid: true };
  }

  /**
   * Encrypt a WebSocket message
   */
  encryptMessage(message: NetworkMessage): EncryptedMessage {
    const messageString = JSON.stringify(message);
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const key = crypto.scryptSync(this.SECRET_KEY, 'salt', 32); // Derive key from secret
    const cipher = crypto.createCipher('aes-256-cbc', key);

    let encrypted = cipher.update(messageString, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: '', // Not used in CBC mode
      timestamp: new Date(),
    };
  }

  /**
   * Decrypt a WebSocket message
   */
  decryptMessage(encryptedMessage: EncryptedMessage): NetworkMessage {
    try {
      const key = crypto.scryptSync(this.SECRET_KEY, 'salt', 32); // Derive same key
      const iv = Buffer.from(encryptedMessage.iv, 'hex');
      const decipher = crypto.createDecipher('aes-256-cbc', key);

      let decrypted = decipher.update(
        encryptedMessage.encryptedData,
        'hex',
        'utf8'
      );
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(
        'Failed to decrypt message - possible tampering detected'
      );
    }
  }

  /**
   * Validate IP-based rate limiting and abuse detection
   */
  validateIPRateLimit(ip: string): SecurityValidationResult {
    // Check if IP is blocked
    if (this.blockedIPs.has(ip)) {
      return {
        isValid: false,
        errorCode: 'IP_BLOCKED',
        errorMessage: 'IP address is blocked due to suspicious activity',
        shouldBlock: true,
      };
    }

    const now = new Date();
    let rateLimitEntry = this.ipRateLimits.get(ip);

    if (!rateLimitEntry) {
      // First request from this IP
      rateLimitEntry = {
        ip,
        requestCount: 1,
        windowStart: now,
        lastRequest: now,
        isBlocked: false,
      };
      this.ipRateLimits.set(ip, rateLimitEntry);
      return { isValid: true };
    }

    // Check if block has expired
    if (
      rateLimitEntry.isBlocked &&
      rateLimitEntry.blockExpiresAt &&
      now > rateLimitEntry.blockExpiresAt
    ) {
      rateLimitEntry.isBlocked = false;
      rateLimitEntry.blockExpiresAt = undefined;
      rateLimitEntry.requestCount = 1;
      rateLimitEntry.windowStart = now;
      this.blockedIPs.delete(ip);
    }

    // Check if currently blocked
    if (rateLimitEntry.isBlocked) {
      return {
        isValid: false,
        errorCode: 'RATE_LIMIT_BLOCKED',
        errorMessage: 'IP address is temporarily blocked due to rate limiting',
        shouldBlock: true,
      };
    }

    // Check rate limit window
    const windowElapsed = now.getTime() - rateLimitEntry.windowStart.getTime();

    if (windowElapsed >= this.RATE_LIMIT_WINDOW) {
      // Reset window
      rateLimitEntry.requestCount = 1;
      rateLimitEntry.windowStart = now;
    } else {
      rateLimitEntry.requestCount++;
    }

    rateLimitEntry.lastRequest = now;

    // Check if rate limit exceeded
    if (rateLimitEntry.requestCount > this.MAX_REQUESTS_PER_WINDOW) {
      rateLimitEntry.isBlocked = true;
      rateLimitEntry.blockExpiresAt = new Date(
        now.getTime() + this.BLOCK_DURATION
      );
      this.blockedIPs.add(ip);

      this.recordSuspiciousActivity(ip);

      return {
        isValid: false,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        errorMessage: 'Rate limit exceeded - IP temporarily blocked',
        shouldBlock: true,
        details: {
          requestCount: rateLimitEntry.requestCount,
          maxRequests: this.MAX_REQUESTS_PER_WINDOW,
          blockDuration: this.BLOCK_DURATION,
        },
      };
    }

    return { isValid: true };
  }

  /**
   * Validate message size and content for security
   */
  validateMessageSecurity(
    message: any,
    connectionId: string
  ): SecurityValidationResult {
    // Check message size
    const messageSize = JSON.stringify(message).length;
    if (messageSize > this.MAX_MESSAGE_SIZE) {
      this.recordSuspiciousActivity(connectionId);
      return {
        isValid: false,
        errorCode: 'MESSAGE_TOO_LARGE',
        errorMessage: 'Message exceeds maximum allowed size',
        details: { size: messageSize, maxSize: this.MAX_MESSAGE_SIZE },
      };
    }

    // Check for potential injection attacks
    const messageString = JSON.stringify(message);
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /function\s*\(/i,
      /\$\{.*\}/,
      /<%.*%>/,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(messageString)) {
        this.recordSuspiciousActivity(connectionId);
        return {
          isValid: false,
          errorCode: 'SUSPICIOUS_CONTENT',
          errorMessage: 'Message contains potentially malicious content',
          shouldBlock: true,
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Prevent session hijacking by validating connection consistency
   */
  validateConnectionConsistency(
    connection: WebSocketConnection,
    expectedPlayerId: string
  ): SecurityValidationResult {
    if (!connection.playerId) {
      return {
        isValid: false,
        errorCode: 'NO_PLAYER_ASSOCIATED',
        errorMessage: 'No player associated with connection',
      };
    }

    if (connection.playerId !== expectedPlayerId) {
      this.recordSuspiciousActivity(connection.id);
      return {
        isValid: false,
        errorCode: 'PLAYER_MISMATCH',
        errorMessage: 'Connection player ID does not match expected player',
        shouldBlock: true,
      };
    }

    // Check for connection age (prevent very old connections)
    const connectionAge = new Date().getTime() - connection.lastPing.getTime();
    const maxConnectionAge = 3600000; // 1 hour

    if (connectionAge > maxConnectionAge) {
      return {
        isValid: false,
        errorCode: 'CONNECTION_TOO_OLD',
        errorMessage: 'Connection is too old and may be compromised',
      };
    }

    return { isValid: true };
  }

  /**
   * Record suspicious activity for monitoring
   */
  private recordSuspiciousActivity(identifier: string): void {
    const currentCount = this.suspiciousActivity.get(identifier) || 0;
    this.suspiciousActivity.set(identifier, currentCount + 1);

    // Auto-block if too many suspicious activities
    if (currentCount >= 5) {
      this.blockedIPs.add(identifier);
      console.warn(
        `Auto-blocked identifier ${identifier} due to suspicious activity`
      );
    }
  }

  /**
   * Get security status for monitoring
   */
  getSecurityStatus(): {
    activeTokens: number;
    blockedIPs: number;
    rateLimitedIPs: number;
    suspiciousActivities: number;
  } {
    return {
      activeTokens: this.authTokens.size,
      blockedIPs: this.blockedIPs.size,
      rateLimitedIPs: Array.from(this.ipRateLimits.values()).filter(
        (entry) => entry.isBlocked
      ).length,
      suspiciousActivities: this.suspiciousActivity.size,
    };
  }

  /**
   * Manually block an IP address
   */
  blockIP(ip: string, duration?: number): void {
    this.blockedIPs.add(ip);

    if (duration) {
      const rateLimitEntry = this.ipRateLimits.get(ip) || {
        ip,
        requestCount: 0,
        windowStart: new Date(),
        lastRequest: new Date(),
        isBlocked: true,
      };

      rateLimitEntry.isBlocked = true;
      rateLimitEntry.blockExpiresAt = new Date(Date.now() + duration);
      this.ipRateLimits.set(ip, rateLimitEntry);
    }
  }

  /**
   * Unblock an IP address
   */
  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip);
    const rateLimitEntry = this.ipRateLimits.get(ip);
    if (rateLimitEntry) {
      rateLimitEntry.isBlocked = false;
      rateLimitEntry.blockExpiresAt = undefined;
    }
  }

  /**
   * Revoke an authentication token
   */
  revokeAuthToken(playerId: string, sessionId?: string): void {
    const tokenKey = this.getTokenKey(playerId, sessionId);
    this.authTokens.delete(tokenKey);
  }

  /**
   * Clean up expired tokens
   */
  private cleanupExpiredTokens(): void {
    const now = new Date();
    const tokensToDelete: string[] = [];

    this.authTokens.forEach((token, key) => {
      if (now > token.expiresAt) {
        tokensToDelete.push(key);
      }
    });

    tokensToDelete.forEach((key) => {
      this.authTokens.delete(key);
    });
  }

  /**
   * Clean up old rate limit entries
   */
  private cleanupRateLimitEntries(): void {
    const now = new Date();
    const cutoffTime = now.getTime() - this.RATE_LIMIT_WINDOW * 2;
    const entriesToDelete: string[] = [];

    this.ipRateLimits.forEach((entry, ip) => {
      if (!entry.isBlocked && entry.lastRequest.getTime() < cutoffTime) {
        entriesToDelete.push(ip);
      }
    });

    entriesToDelete.forEach((ip) => {
      this.ipRateLimits.delete(ip);
    });

    // Clean up old suspicious activity records
    this.suspiciousActivity.clear();
  }

  private generateSecretKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private signData(data: any): string {
    const dataString = JSON.stringify(data);
    return crypto
      .createHmac('sha256', this.SECRET_KEY)
      .update(dataString)
      .digest('hex');
  }

  private getTokenKey(playerId: string, sessionId?: string): string {
    return sessionId ? `${playerId}:${sessionId}` : playerId;
  }
}
