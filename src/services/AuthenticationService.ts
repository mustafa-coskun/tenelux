// Authentication service for password and token security

import * as crypto from 'crypto';
import { SecurityService } from './SecurityService';
import { SecurityConfig } from '../config/database';
import { SecurityError, ValidationError, UnauthorizedError } from '../database/core/errors';

export interface TokenPayload {
  userId: string;
  sessionId: string;
  type: 'access' | 'refresh' | 'reset' | 'verification';
  expiresAt: number;
  issuedAt: number;
  permissions?: string[];
}

export interface SessionInfo {
  userId: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  lastUsed: Date;
}

export interface LoginAttempt {
  identifier: string; // username or email
  ipAddress: string;
  timestamp: Date;
  success: boolean;
  userAgent?: string;
}

export class AuthenticationService {
  private loginAttempts = new Map<string, LoginAttempt[]>();
  private activeSessions = new Map<string, SessionInfo>();
  private tokenBlacklist = new Set<string>();

  constructor(
    private securityService: SecurityService,
    private config: SecurityConfig
  ) {
    // Clean up expired data periodically
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  // Generate secure session token
  generateSessionToken(): string {
    return this.securityService.generateSecureToken();
  }

  // Generate JWT-like token with payload
  generateToken(payload: TokenPayload): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    const signature = this.signToken(`${encodedHeader}.${encodedPayload}`);
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  // Verify and decode token
  verifyToken(token: string): TokenPayload | null {
    try {
      // Check if token is blacklisted
      if (this.tokenBlacklist.has(token)) {
        throw new UnauthorizedError('Token has been revoked');
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new ValidationError('Invalid token format');
      }

      const [encodedHeader, encodedPayload, signature] = parts;
      
      // Verify signature
      const expectedSignature = this.signToken(`${encodedHeader}.${encodedPayload}`);
      if (signature !== expectedSignature) {
        throw new UnauthorizedError('Invalid token signature');
      }

      // Decode payload
      const payload: TokenPayload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString()
      );

      // Check expiration
      if (Date.now() > payload.expiresAt) {
        throw new UnauthorizedError('Token has expired');
      }

      return payload;
    } catch (error) {
      if (error instanceof SecurityError) {
        throw error;
      }
      throw new UnauthorizedError('Token verification failed', { error: error.message });
    }
  }

  // Create session
  createSession(userId: string, ipAddress?: string, userAgent?: string): SessionInfo {
    const sessionId = this.generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (this.config.sessionTimeout || 24 * 60 * 60 * 1000));

    const session: SessionInfo = {
      userId,
      sessionId,
      createdAt: now,
      expiresAt,
      ipAddress,
      userAgent,
      isActive: true,
      lastUsed: now
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  // Validate session
  validateSession(sessionId: string): SessionInfo | null {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    if (!session.isActive || Date.now() > session.expiresAt.getTime()) {
      this.activeSessions.delete(sessionId);
      return null;
    }

    // Update last used time
    session.lastUsed = new Date();
    return session;
  }

  // Extend session
  extendSession(sessionId: string, additionalTime?: number): boolean {
    const session = this.activeSessions.get(sessionId);
    
    if (!session || !session.isActive) {
      return false;
    }

    const extension = additionalTime || (this.config.sessionTimeout || 24 * 60 * 60 * 1000);
    session.expiresAt = new Date(Date.now() + extension);
    session.lastUsed = new Date();
    
    return true;
  }

  // Invalidate session
  invalidateSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    
    if (session) {
      session.isActive = false;
      this.activeSessions.delete(sessionId);
      return true;
    }
    
    return false;
  }

  // Invalidate all user sessions
  invalidateUserSessions(userId: string): number {
    let count = 0;
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.userId === userId) {
        session.isActive = false;
        this.activeSessions.delete(sessionId);
        count++;
      }
    }
    
    return count;
  }

  // Record login attempt
  recordLoginAttempt(identifier: string, ipAddress: string, success: boolean, userAgent?: string): void {
    const attempt: LoginAttempt = {
      identifier: identifier.toLowerCase(),
      ipAddress,
      timestamp: new Date(),
      success,
      userAgent
    };

    const key = `${identifier.toLowerCase()}:${ipAddress}`;
    const attempts = this.loginAttempts.get(key) || [];
    attempts.push(attempt);

    // Keep only recent attempts (last hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentAttempts = attempts.filter(a => a.timestamp.getTime() > oneHourAgo);
    
    this.loginAttempts.set(key, recentAttempts);
  }

  // Check if account is locked due to failed attempts
  isAccountLocked(identifier: string, ipAddress: string): boolean {
    const key = `${identifier.toLowerCase()}:${ipAddress}`;
    const attempts = this.loginAttempts.get(key) || [];
    
    const maxAttempts = this.config.maxLoginAttempts || 5;
    const lockoutDuration = this.config.lockoutDuration || 30 * 60 * 1000; // 30 minutes
    
    // Count failed attempts in lockout period
    const lockoutTime = Date.now() - lockoutDuration;
    const failedAttempts = attempts.filter(a => 
      !a.success && a.timestamp.getTime() > lockoutTime
    );

    return failedAttempts.length >= maxAttempts;
  }

  // Get remaining lockout time
  getLockoutTimeRemaining(identifier: string, ipAddress: string): number {
    const key = `${identifier.toLowerCase()}:${ipAddress}`;
    const attempts = this.loginAttempts.get(key) || [];
    
    const maxAttempts = this.config.maxLoginAttempts || 5;
    const lockoutDuration = this.config.lockoutDuration || 30 * 60 * 1000;
    
    const lockoutTime = Date.now() - lockoutDuration;
    const failedAttempts = attempts
      .filter(a => !a.success && a.timestamp.getTime() > lockoutTime)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (failedAttempts.length >= maxAttempts) {
      const lastFailedAttempt = failedAttempts[0];
      const unlockTime = lastFailedAttempt.timestamp.getTime() + lockoutDuration;
      return Math.max(0, unlockTime - Date.now());
    }

    return 0;
  }

  // Clear login attempts for identifier
  clearLoginAttempts(identifier: string, ipAddress?: string): void {
    if (ipAddress) {
      const key = `${identifier.toLowerCase()}:${ipAddress}`;
      this.loginAttempts.delete(key);
    } else {
      // Clear all attempts for this identifier
      const keysToDelete = Array.from(this.loginAttempts.keys())
        .filter(key => key.startsWith(`${identifier.toLowerCase()}:`));
      
      keysToDelete.forEach(key => this.loginAttempts.delete(key));
    }
  }

  // Generate password reset token
  generatePasswordResetToken(userId: string): string {
    const payload: TokenPayload = {
      userId,
      sessionId: this.generateSessionToken(),
      type: 'reset',
      expiresAt: Date.now() + (15 * 60 * 1000), // 15 minutes
      issuedAt: Date.now()
    };

    return this.generateToken(payload);
  }

  // Generate email verification token
  generateVerificationToken(userId: string): string {
    const payload: TokenPayload = {
      userId,
      sessionId: this.generateSessionToken(),
      type: 'verification',
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      issuedAt: Date.now()
    };

    return this.generateToken(payload);
  }

  // Blacklist token (for logout, password change, etc.)
  blacklistToken(token: string): void {
    this.tokenBlacklist.add(token);
  }

  // Generate refresh token
  generateRefreshToken(userId: string, sessionId: string): string {
    const payload: TokenPayload = {
      userId,
      sessionId,
      type: 'refresh',
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      issuedAt: Date.now()
    };

    return this.generateToken(payload);
  }

  // Refresh access token
  refreshAccessToken(refreshToken: string): string | null {
    try {
      const payload = this.verifyToken(refreshToken);
      
      if (!payload || payload.type !== 'refresh') {
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Validate session still exists
      const session = this.validateSession(payload.sessionId);
      if (!session) {
        throw new UnauthorizedError('Session no longer valid');
      }

      // Generate new access token
      const newPayload: TokenPayload = {
        userId: payload.userId,
        sessionId: payload.sessionId,
        type: 'access',
        expiresAt: Date.now() + (60 * 60 * 1000), // 1 hour
        issuedAt: Date.now(),
        permissions: payload.permissions
      };

      return this.generateToken(newPayload);
    } catch (error) {
      return null;
    }
  }

  // Sign token data
  private signToken(data: string): string {
    const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');
  }

  // Cleanup expired data
  private cleanup(): void {
    const now = Date.now();
    
    // Clean up expired sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now > session.expiresAt.getTime()) {
        this.activeSessions.delete(sessionId);
      }
    }

    // Clean up old login attempts (older than 24 hours)
    const dayAgo = now - 24 * 60 * 60 * 1000;
    for (const [key, attempts] of this.loginAttempts.entries()) {
      const recentAttempts = attempts.filter(a => a.timestamp.getTime() > dayAgo);
      if (recentAttempts.length === 0) {
        this.loginAttempts.delete(key);
      } else {
        this.loginAttempts.set(key, recentAttempts);
      }
    }

    // Clean up old blacklisted tokens (this is simplified - in production you'd store expiry times)
    if (this.tokenBlacklist.size > 10000) {
      this.tokenBlacklist.clear(); // Simple cleanup - in production, track expiry times
    }
  }

  // Get authentication statistics
  getAuthStats(): {
    activeSessions: number;
    blacklistedTokens: number;
    loginAttemptKeys: number;
    lockedAccounts: number;
  } {
    let lockedAccounts = 0;
    for (const [key] of this.loginAttempts.entries()) {
      const [identifier, ipAddress] = key.split(':');
      if (this.isAccountLocked(identifier, ipAddress)) {
        lockedAccounts++;
      }
    }

    return {
      activeSessions: this.activeSessions.size,
      blacklistedTokens: this.tokenBlacklist.size,
      loginAttemptKeys: this.loginAttempts.size,
      lockedAccounts
    };
  }

  // Get user sessions
  getUserSessions(userId: string): SessionInfo[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId && session.isActive);
  }
}

// Singleton instance
let authServiceInstance: AuthenticationService | null = null;

export function getAuthenticationService(
  securityService?: SecurityService,
  config?: SecurityConfig
): AuthenticationService {
  if (!authServiceInstance) {
    if (!securityService || !config) {
      throw new Error('AuthenticationService dependencies are required for first initialization');
    }
    authServiceInstance = new AuthenticationService(securityService, config);
  }
  return authServiceInstance;
}

// Reset singleton (for testing)
export function resetAuthenticationService(): void {
  authServiceInstance = null;
}