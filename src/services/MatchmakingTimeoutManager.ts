// Matchmaking Timeout and Retry Manager - Handles timeouts and retry logic

import { getLogger } from './LoggingService';

export interface TimeoutConfig {
  initialTimeout: number;
  maxTimeout: number;
  retryMultiplier: number;
  maxRetries: number;
}

export interface RetryAttempt {
  attemptNumber: number;
  timestamp: Date;
  timeout: number;
  reason?: string;
}

export interface MatchmakingSession {
  playerId: string;
  startTime: Date;
  lastAttempt: Date;
  attempts: RetryAttempt[];
  currentTimeout: number;
  maxWaitTime: number;
  isActive: boolean;
  preferences: any;
}

export class MatchmakingTimeoutManager {
  private readonly logger = getLogger();
  private readonly activeSessions = new Map<string, MatchmakingSession>();
  private readonly timeoutHandles = new Map<string, NodeJS.Timeout>();
  
  // Default configuration
  private readonly defaultConfig: TimeoutConfig = {
    initialTimeout: 10000,    // 10 seconds
    maxTimeout: 60000,        // 1 minute
    retryMultiplier: 1.5,     // Exponential backoff
    maxRetries: 10            // Maximum retry attempts
  };

  constructor() {
    this.logger.info('Matchmaking Timeout Manager initialized');
    this.startSessionCleanup();
  }

  /**
   * Start a matchmaking session with timeout management
   * Implements Requirements 3.3, 3.5
   */
  startSession(
    playerId: string, 
    maxWaitTime: number, 
    preferences: any,
    config?: Partial<TimeoutConfig>
  ): void {
    // Stop existing session if any
    this.stopSession(playerId);

    const sessionConfig = { ...this.defaultConfig, ...config };
    
    const session: MatchmakingSession = {
      playerId,
      startTime: new Date(),
      lastAttempt: new Date(),
      attempts: [],
      currentTimeout: sessionConfig.initialTimeout,
      maxWaitTime,
      isActive: true,
      preferences
    };

    this.activeSessions.set(playerId, session);
    
    // Schedule first retry
    this.scheduleRetry(playerId, sessionConfig);

    this.logger.debug('Matchmaking session started', {
      playerId,
      maxWaitTime,
      initialTimeout: sessionConfig.initialTimeout
    });
  }

  /**
   * Stop a matchmaking session
   */
  stopSession(playerId: string): void {
    const session = this.activeSessions.get(playerId);
    if (session) {
      session.isActive = false;
      this.activeSessions.delete(playerId);
      
      // Clear timeout handle
      const timeoutHandle = this.timeoutHandles.get(playerId);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.timeoutHandles.delete(playerId);
      }

      this.logger.debug('Matchmaking session stopped', {
        playerId,
        totalAttempts: session.attempts.length,
        totalTime: Date.now() - session.startTime.getTime()
      });
    }
  }

  /**
   * Record a retry attempt
   */
  recordAttempt(playerId: string, reason?: string): void {
    const session = this.activeSessions.get(playerId);
    if (!session || !session.isActive) {
      return;
    }

    const attempt: RetryAttempt = {
      attemptNumber: session.attempts.length + 1,
      timestamp: new Date(),
      timeout: session.currentTimeout,
      reason
    };

    session.attempts.push(attempt);
    session.lastAttempt = new Date();

    this.logger.debug('Matchmaking attempt recorded', {
      playerId,
      attemptNumber: attempt.attemptNumber,
      reason,
      currentTimeout: session.currentTimeout
    });
  }

  /**
   * Check if session has exceeded maximum wait time
   */
  isSessionExpired(playerId: string): boolean {
    const session = this.activeSessions.get(playerId);
    if (!session) {
      return true;
    }

    const elapsedTime = Date.now() - session.startTime.getTime();
    return elapsedTime > session.maxWaitTime;
  }

  /**
   * Check if session has exceeded maximum retries
   */
  hasExceededMaxRetries(playerId: string): boolean {
    const session = this.activeSessions.get(playerId);
    if (!session) {
      return true;
    }

    return session.attempts.length >= this.defaultConfig.maxRetries;
  }

  /**
   * Get session statistics
   */
  getSessionStats(playerId: string): {
    totalTime: number;
    attempts: number;
    averageRetryInterval: number;
    isActive: boolean;
  } | null {
    const session = this.activeSessions.get(playerId);
    if (!session) {
      return null;
    }

    const totalTime = Date.now() - session.startTime.getTime();
    const attempts = session.attempts.length;
    
    let averageRetryInterval = 0;
    if (attempts > 1) {
      const intervals = [];
      for (let i = 1; i < session.attempts.length; i++) {
        const interval = session.attempts[i].timestamp.getTime() - session.attempts[i - 1].timestamp.getTime();
        intervals.push(interval);
      }
      averageRetryInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    }

    return {
      totalTime,
      attempts,
      averageRetryInterval,
      isActive: session.isActive
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): MatchmakingSession[] {
    return Array.from(this.activeSessions.values()).filter(session => session.isActive);
  }

  /**
   * Calculate next retry timeout with exponential backoff
   */
  private calculateNextTimeout(session: MatchmakingSession): number {
    const config = this.defaultConfig;
    const nextTimeout = Math.min(
      session.currentTimeout * config.retryMultiplier,
      config.maxTimeout
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * nextTimeout;
    return Math.round(nextTimeout + jitter);
  }

  /**
   * Schedule next retry attempt
   */
  private scheduleRetry(playerId: string, config: TimeoutConfig): void {
    const session = this.activeSessions.get(playerId);
    if (!session || !session.isActive) {
      return;
    }

    // Check if session has expired
    if (this.isSessionExpired(playerId)) {
      this.handleSessionTimeout(playerId, 'MAX_WAIT_TIME_EXCEEDED');
      return;
    }

    // Check if max retries exceeded
    if (this.hasExceededMaxRetries(playerId)) {
      this.handleSessionTimeout(playerId, 'MAX_RETRIES_EXCEEDED');
      return;
    }

    // Schedule next attempt
    const timeoutHandle = setTimeout(() => {
      this.handleRetryTimeout(playerId);
    }, session.currentTimeout);

    this.timeoutHandles.set(playerId, timeoutHandle);

    // Update timeout for next attempt
    session.currentTimeout = this.calculateNextTimeout(session);
  }

  /**
   * Handle retry timeout
   */
  private handleRetryTimeout(playerId: string): void {
    const session = this.activeSessions.get(playerId);
    if (!session || !session.isActive) {
      return;
    }

    // Record the retry attempt
    this.recordAttempt(playerId, 'RETRY_TIMEOUT');

    // Emit retry event (would be handled by matchmaking service)
    this.emitRetryEvent(playerId, session);

    // Schedule next retry
    this.scheduleRetry(playerId, this.defaultConfig);
  }

  /**
   * Handle session timeout (max wait time or retries exceeded)
   */
  private handleSessionTimeout(playerId: string, reason: string): void {
    const session = this.activeSessions.get(playerId);
    if (!session) {
      return;
    }

    this.logger.info('Matchmaking session timed out', {
      playerId,
      reason,
      totalTime: Date.now() - session.startTime.getTime(),
      totalAttempts: session.attempts.length
    });

    // Emit timeout event
    this.emitTimeoutEvent(playerId, session, reason);

    // Stop the session
    this.stopSession(playerId);
  }

  /**
   * Emit retry event (to be handled by matchmaking service)
   */
  private emitRetryEvent(playerId: string, session: MatchmakingSession): void {
    // This would typically emit an event that the matchmaking service listens to
    // For now, we'll just log it
    this.logger.debug('Retry event emitted', {
      playerId,
      attemptNumber: session.attempts.length + 1,
      elapsedTime: Date.now() - session.startTime.getTime()
    });
  }

  /**
   * Emit timeout event (to be handled by matchmaking service)
   */
  private emitTimeoutEvent(playerId: string, session: MatchmakingSession, reason: string): void {
    // This would typically emit an event that the matchmaking service listens to
    // For now, we'll just log it
    this.logger.info('Timeout event emitted', {
      playerId,
      reason,
      totalTime: Date.now() - session.startTime.getTime(),
      totalAttempts: session.attempts.length
    });
  }

  /**
   * Start periodic session cleanup
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Clean up every minute
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [playerId, session] of this.activeSessions.entries()) {
      const elapsedTime = now - session.startTime.getTime();
      
      // Clean up sessions that have been inactive for too long
      if (!session.isActive || elapsedTime > session.maxWaitTime + 60000) { // 1 minute grace period
        expiredSessions.push(playerId);
      }
    }

    expiredSessions.forEach(playerId => {
      this.stopSession(playerId);
    });

    if (expiredSessions.length > 0) {
      this.logger.debug('Cleaned up expired sessions', { count: expiredSessions.length });
    }
  }

  /**
   * Get timeout manager statistics
   */
  getManagerStats(): {
    activeSessions: number;
    totalRetries: number;
    averageSessionTime: number;
    timeoutRate: number;
  } {
    const sessions = this.getActiveSessions();
    const totalRetries = sessions.reduce((sum, session) => sum + session.attempts.length, 0);
    
    let averageSessionTime = 0;
    if (sessions.length > 0) {
      const totalTime = sessions.reduce((sum, session) => 
        sum + (Date.now() - session.startTime.getTime()), 0
      );
      averageSessionTime = totalTime / sessions.length;
    }

    // This would need to be tracked over time for accurate timeout rate
    const timeoutRate = 0.05; // Placeholder: 5% timeout rate

    return {
      activeSessions: sessions.length,
      totalRetries,
      averageSessionTime: Math.round(averageSessionTime / 1000), // Convert to seconds
      timeoutRate
    };
  }

  /**
   * Update session preferences (for dynamic adjustment)
   */
  updateSessionPreferences(playerId: string, preferences: any): void {
    const session = this.activeSessions.get(playerId);
    if (session && session.isActive) {
      session.preferences = { ...session.preferences, ...preferences };
      
      this.logger.debug('Session preferences updated', {
        playerId,
        preferences
      });
    }
  }

  /**
   * Get recommended retry strategy based on current conditions
   */
  getRecommendedRetryStrategy(playerId: string): {
    shouldRetry: boolean;
    recommendedDelay: number;
    reason: string;
  } {
    const session = this.activeSessions.get(playerId);
    if (!session) {
      return {
        shouldRetry: false,
        recommendedDelay: 0,
        reason: 'NO_ACTIVE_SESSION'
      };
    }

    if (this.isSessionExpired(playerId)) {
      return {
        shouldRetry: false,
        recommendedDelay: 0,
        reason: 'SESSION_EXPIRED'
      };
    }

    if (this.hasExceededMaxRetries(playerId)) {
      return {
        shouldRetry: false,
        recommendedDelay: 0,
        reason: 'MAX_RETRIES_EXCEEDED'
      };
    }

    // Calculate recommended delay based on current conditions
    const baseDelay = session.currentTimeout;
    const queueSize = this.activeSessions.size;
    
    // Adjust delay based on queue congestion
    let adjustedDelay = baseDelay;
    if (queueSize > 50) {
      adjustedDelay *= 1.5; // Increase delay when queue is congested
    } else if (queueSize < 10) {
      adjustedDelay *= 0.8; // Decrease delay when queue is light
    }

    return {
      shouldRetry: true,
      recommendedDelay: Math.round(adjustedDelay),
      reason: 'NORMAL_RETRY'
    };
  }
}

// Singleton instance
let matchmakingTimeoutManagerInstance: MatchmakingTimeoutManager | null = null;

export function getMatchmakingTimeoutManager(): MatchmakingTimeoutManager {
  if (!matchmakingTimeoutManagerInstance) {
    matchmakingTimeoutManagerInstance = new MatchmakingTimeoutManager();
  }
  return matchmakingTimeoutManagerInstance;
}

// Reset for testing
export function resetMatchmakingTimeoutManager(): void {
  matchmakingTimeoutManagerInstance = null;
}