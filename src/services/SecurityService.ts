// Security service implementation

import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SecurityConfig } from '../config/database';
import { SecurityError, SqlInjectionError, ValidationError } from '../database/core/errors';

export interface ISecurityService {
  sanitizeInput(input: string): string;
  validateQuery(query: string): boolean;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  generateSecureToken(): string;
  rateLimit(identifier: string): Promise<boolean>;
  validateEmail(email: string): boolean;
  validateUsername(username: string): boolean;
  validatePassword(password: string): { isValid: boolean; errors: string[] };
  encryptSensitiveData(data: string): string;
  decryptSensitiveData(encryptedData: string): string;
}

export class SecurityService implements ISecurityService {
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  private encryptionKey: string;
  private algorithm = 'aes-256-cbc';

  constructor(private config: SecurityConfig) {
    // Generate or use provided encryption key
    this.encryptionKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    
    // Clean up rate limit store periodically
    setInterval(() => this.cleanupRateLimitStore(), 60000); // Every minute
  }

  // Input sanitization
  sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      throw new ValidationError('Input must be a string');
    }

    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');
    
    // Remove or escape potentially dangerous characters
    sanitized = sanitized
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/script/gi, '') // Remove script tags
      .trim();

    // Limit length
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000);
    }

    return sanitized;
  }

  // SQL injection prevention
  validateQuery(query: string): boolean {
    if (typeof query !== 'string') {
      throw new SqlInjectionError('Query must be a string');
    }

    // List of dangerous SQL patterns
    const dangerousPatterns = [
      /(\b(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE)\b(?!\s+(IF\s+EXISTS|OR\s+REPLACE)))/i,
      /(UNION\s+SELECT)/i,
      /(;\s*DROP)/i,
      /(;\s*DELETE)/i,
      /(;\s*INSERT)/i,
      /(;\s*UPDATE)/i,
      /(--\s*$)/m,
      /\/\*.*\*\//s,
      /(EXEC\s*\()/i,
      /(EXECUTE\s*\()/i,
      /(sp_\w+)/i,
      /(xp_\w+)/i,
      /(\bOR\s+1\s*=\s*1\b)/i,
      /(\bAND\s+1\s*=\s*1\b)/i,
      /(LOAD_FILE\s*\()/i,
      /(INTO\s+OUTFILE)/i,
      /(BENCHMARK\s*\()/i,
      /(SLEEP\s*\()/i,
      /(WAITFOR\s+DELAY)/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        throw new SqlInjectionError(`Potentially dangerous SQL pattern detected: ${pattern.source}`);
      }
    }

    return true;
  }

  // Password hashing
  async hashPassword(password: string): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password must be a non-empty string');
    }

    if (password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters long');
    }

    const saltRounds = this.config.bcryptRounds || 12;
    return bcrypt.hash(password, saltRounds);
  }

  // Password verification
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }

    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      throw new SecurityError('Password verification failed', { error: error.message });
    }
  }

  // Secure token generation
  generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Rate limiting
  async rateLimit(identifier: string): Promise<boolean> {
    if (!this.config.rateLimit) {
      return true; // Rate limiting disabled
    }

    const now = Date.now();
    const windowMs = this.config.rateLimitWindowMs || 15 * 60 * 1000; // 15 minutes
    const maxRequests = this.config.rateLimitMaxRequests || 100;

    const record = this.rateLimitStore.get(identifier);

    if (!record) {
      // First request from this identifier
      this.rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + windowMs
      });
      return true;
    }

    if (now > record.resetTime) {
      // Window has expired, reset
      this.rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + windowMs
      });
      return true;
    }

    if (record.count >= maxRequests) {
      // Rate limit exceeded
      return false;
    }

    // Increment count
    record.count++;
    return true;
  }

  // Email validation
  validateEmail(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  // Username validation
  validateUsername(username: string): boolean {
    if (!username || typeof username !== 'string') {
      return false;
    }

    // Username rules: 3-20 characters, alphanumeric, underscore, hyphen
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    return usernameRegex.test(username);
  }

  // Password validation
  validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!password || typeof password !== 'string') {
      errors.push('Password is required');
      return { isValid: false, errors };
    }

    if (password.length < 6) {
      errors.push('Password must be at least 6 characters long');
    }

    if (password.length > 128) {
      errors.push('Password must be less than 128 characters');
    }

    // Check for at least one letter
    if (!/[a-zA-Z]/.test(password)) {
      errors.push('Password must contain at least one letter');
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Check for common weak passwords
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey'
    ];

    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Encrypt sensitive data
  encryptSensitiveData(data: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const key = Buffer.from(this.encryptionKey, 'hex');
      const cipher = crypto.createCipher(this.algorithm, key);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      throw new SecurityError('Encryption failed', { error: error.message });
    }
  }

  // Decrypt sensitive data
  decryptSensitiveData(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const key = Buffer.from(this.encryptionKey, 'hex');
      const decipher = crypto.createDecipher(this.algorithm, key);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new SecurityError('Decryption failed', { error: error.message });
    }
  }

  // Clean up expired rate limit entries
  private cleanupRateLimitStore(): void {
    const now = Date.now();
    for (const [identifier, record] of this.rateLimitStore.entries()) {
      if (now > record.resetTime) {
        this.rateLimitStore.delete(identifier);
      }
    }
  }

  // Get rate limit status for identifier
  getRateLimitStatus(identifier: string): { remaining: number; resetTime: number } {
    const record = this.rateLimitStore.get(identifier);
    const maxRequests = this.config.rateLimitMaxRequests || 100;

    if (!record) {
      return { remaining: maxRequests, resetTime: 0 };
    }

    return {
      remaining: Math.max(0, maxRequests - record.count),
      resetTime: record.resetTime
    };
  }

  // Clear rate limit for identifier (admin function)
  clearRateLimit(identifier: string): void {
    this.rateLimitStore.delete(identifier);
  }

  // Get security metrics
  getSecurityMetrics(): {
    rateLimitedIdentifiers: number;
    totalRateLimitEntries: number;
    encryptionAlgorithm: string;
  } {
    return {
      rateLimitedIdentifiers: this.rateLimitStore.size,
      totalRateLimitEntries: this.rateLimitStore.size,
      encryptionAlgorithm: this.algorithm
    };
  }
}

// Singleton instance
let securityServiceInstance: SecurityService | null = null;

export function getSecurityService(config?: SecurityConfig): SecurityService {
  if (!securityServiceInstance) {
    if (!config) {
      throw new Error('SecurityService configuration is required for first initialization');
    }
    securityServiceInstance = new SecurityService(config);
  }
  return securityServiceInstance;
}

// Reset singleton (for testing)
export function resetSecurityService(): void {
  securityServiceInstance = null;
}