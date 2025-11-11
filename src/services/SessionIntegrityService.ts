import { GameSession, PlayerDecision } from '../types';

export interface SessionToken {
  sessionId: string;
  playerId: string;
  issuedAt: Date;
  expiresAt: Date;
  signature: string;
  nonce: string;
}

export interface IntegrityValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
  details?: any;
}

export class SessionIntegrityService {
  private readonly SECRET_KEY: string;
  private readonly TOKEN_EXPIRY_HOURS = 24;

  // Store session tokens
  private sessionTokens: Map<string, SessionToken> = new Map();

  constructor(secretKey?: string) {
    this.SECRET_KEY = secretKey || this.generateSecretKey();
  }

  /**
   * Generate a simple session token for a player
   */
  generateSessionToken(sessionId: string, playerId: string): SessionToken {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    );
    const nonce = Math.random().toString(36).substring(2, 15);

    const tokenData = {
      sessionId,
      playerId,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      nonce,
    };

    const signature = this.signTokenData(tokenData);

    const token: SessionToken = {
      sessionId,
      playerId,
      issuedAt: now,
      expiresAt,
      signature,
      nonce,
    };

    // Store token
    const tokenKey = `${sessionId}:${playerId}`;
    this.sessionTokens.set(tokenKey, token);

    return token;
  }

  /**
   * Validate a session token
   */
  validateSessionToken(token: SessionToken): IntegrityValidationResult {
    const tokenKey = `${token.sessionId}:${token.playerId}`;
    const storedToken = this.sessionTokens.get(tokenKey);

    if (!storedToken) {
      return {
        isValid: false,
        errorCode: 'TOKEN_NOT_FOUND',
        errorMessage: 'Session token not found',
      };
    }

    // Check expiration
    if (new Date() > token.expiresAt) {
      this.sessionTokens.delete(tokenKey);
      return {
        isValid: false,
        errorCode: 'TOKEN_EXPIRED',
        errorMessage: 'Session token has expired',
      };
    }

    return { isValid: true };
  }

  /**
   * Validate trust score changes to prevent manipulation
   */
  validateTrustScoreChange(
    playerId: string,
    oldScore: number,
    newScore: number
  ): IntegrityValidationResult {
    const scoreDifference = newScore - oldScore;
    const maxAllowedChange = 50; // Maximum trust score change per session

    if (Math.abs(scoreDifference) > maxAllowedChange) {
      return {
        isValid: false,
        errorCode: 'EXCESSIVE_TRUST_SCORE_CHANGE',
        errorMessage: `Trust score change too large: ${scoreDifference}`,
        details: { oldScore, newScore, maxAllowed: maxAllowedChange },
      };
    }

    return { isValid: true };
  }

  /**
   * Revoke a session token
   */
  revokeSessionToken(sessionId: string, playerId: string): void {
    const tokenKey = `${sessionId}:${playerId}`;
    this.sessionTokens.delete(tokenKey);
  }

  /**
   * Clean up expired tokens
   */
  cleanup(): void {
    const now = new Date();

    // Clean up expired tokens
    const tokensToDelete: string[] = [];
    this.sessionTokens.forEach((token, key) => {
      if (now > token.expiresAt) {
        tokensToDelete.push(key);
      }
    });
    tokensToDelete.forEach((key) => {
      this.sessionTokens.delete(key);
    });
  }

  private generateSecretKey(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  private signTokenData(tokenData: any): string {
    // Simple hash function for browser compatibility
    const dataString = JSON.stringify(tokenData) + this.SECRET_KEY;
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
}
