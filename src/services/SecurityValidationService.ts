import { PlayerDecision, Decision, GameSession, Player } from '../types';
import { NetworkMessage, NetworkMessageType } from '../types/network';

export interface ValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
  details?: any;
}

export interface RateLimitEntry {
  playerId: string;
  lastDecisionTime: Date;
  decisionCount: number;
  windowStart: Date;
}

export interface DecisionValidationContext {
  session: GameSession;
  player: Player;
  roundNumber: number;
  previousDecisions: PlayerDecision[];
}

export class SecurityValidationService {
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_DECISIONS_PER_WINDOW = 10;
  private readonly MIN_DECISION_INTERVAL = 1000; // 1 second between decisions
  private readonly MAX_TIMESTAMP_DRIFT = 30000; // 30 seconds
  private readonly REPLAY_ATTACK_WINDOW = 300000; // 5 minutes

  /**
   * Check if a player is an AI player based on session context
   */
  private isAIPlayer(playerId: string, session?: GameSession): boolean {
    if (!session) return false;
    const player = session.players.find(p => p.id === playerId);
    return player?.isAI || false;
  }

  /**
   * Validate a player decision with comprehensive security checks
   */
  validatePlayerDecision(
    decision: PlayerDecision,
    context: DecisionValidationContext
  ): ValidationResult {
    // Skip all validation for AI players in single player mode
    const isAI = this.isAIPlayer(decision.playerId, context.session);
    if (isAI) {
      return { isValid: true };
    }
    
    // 1. Basic decision validation
    const basicValidation = this.validateBasicDecision(decision, context);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    // 2. Player authorization validation
    const authValidation = this.validatePlayerAuthorization(decision, context);
    if (!authValidation.isValid) {
      return authValidation;
    }

    // 3. Timestamp validation (prevent replay attacks)
    const timestampValidation = this.validateDecisionTimestamp(
      decision,
      context
    );
    if (!timestampValidation.isValid) {
      return timestampValidation;
    }

    // 4. Rate limiting validation
    const rateLimitValidation = this.validateRateLimit(decision, context);
    if (!rateLimitValidation.isValid) {
      return rateLimitValidation;
    }

    // 5. Session state validation
    const sessionValidation = this.validateSessionState(decision, context);
    if (!sessionValidation.isValid) {
      return sessionValidation;
    }

    // 6. Round validation
    const roundValidation = this.validateRoundState(decision, context);
    if (!roundValidation.isValid) {
      return roundValidation;
    }

    // Update rate limiting tracking
    this.updateRateLimitTracking(decision.playerId, context.session);

    return { isValid: true };
  }

  /**
   * Validate basic decision structure and content
   */
  private validateBasicDecision(decision: PlayerDecision, context: DecisionValidationContext): ValidationResult {
    if (!decision) {
      return {
        isValid: false,
        errorCode: 'INVALID_DECISION',
        errorMessage: 'Decision object is required',
      };
    }

    // Player ID is required and must be a string
    if (!decision.playerId || typeof decision.playerId !== 'string') {
      return {
        isValid: false,
        errorCode: 'INVALID_PLAYER_ID',
        errorMessage: 'Valid player ID is required',
      };
    }

    if (!Object.values(Decision).includes(decision.decision)) {
      return {
        isValid: false,
        errorCode: 'INVALID_DECISION_VALUE',
        errorMessage: `Invalid decision value: ${decision.decision}`,
      };
    }

    if (!decision.timestamp || !(decision.timestamp instanceof Date)) {
      return {
        isValid: false,
        errorCode: 'INVALID_TIMESTAMP',
        errorMessage: 'Valid timestamp is required',
      };
    }

    return { isValid: true };
  }

  /**
   * Validate that the player is authorized to make this decision
   */
  private validatePlayerAuthorization(
    decision: PlayerDecision,
    context: DecisionValidationContext
  ): ValidationResult {
    const player = context.session.players.find(
      (p) => p.id === decision.playerId
    );

    if (!player) {
      return {
        isValid: false,
        errorCode: 'PLAYER_NOT_IN_SESSION',
        errorMessage: 'Player is not part of this game session',
      };
    }

    if (player.id !== context.player.id) {
      return {
        isValid: false,
        errorCode: 'UNAUTHORIZED_DECISION',
        errorMessage:
          'Player is not authorized to make decisions for another player',
      };
    }

    return { isValid: true };
  }

  /**
   * Validate decision timestamp to prevent replay attacks
   */
  private validateDecisionTimestamp(
    decision: PlayerDecision,
    context: DecisionValidationContext
  ): ValidationResult {
    const now = new Date();
    const decisionTime = decision.timestamp;
    const timeDiff = Math.abs(now.getTime() - decisionTime.getTime());

    // Check for timestamp drift (clock synchronization issues)
    if (timeDiff > this.MAX_TIMESTAMP_DRIFT) {
      return {
        isValid: false,
        errorCode: 'TIMESTAMP_DRIFT',
        errorMessage: 'Decision timestamp is too far from server time',
        details: { timeDiff, maxDrift: this.MAX_TIMESTAMP_DRIFT },
      };
    }

    // Check for replay attacks (decision too old)
    if (now.getTime() - decisionTime.getTime() > this.REPLAY_ATTACK_WINDOW) {
      return {
        isValid: false,
        errorCode: 'REPLAY_ATTACK_DETECTED',
        errorMessage: 'Decision timestamp is too old, possible replay attack',
      };
    }

    // Check for future timestamps
    if (decisionTime.getTime() > now.getTime() + this.MAX_TIMESTAMP_DRIFT) {
      return {
        isValid: false,
        errorCode: 'FUTURE_TIMESTAMP',
        errorMessage: 'Decision timestamp cannot be in the future',
      };
    }

    // Check against previous decisions to prevent duplicate timestamps
    const duplicateTimestamp = context.previousDecisions.find(
      (prevDecision) =>
        prevDecision.playerId === decision.playerId &&
        Math.abs(prevDecision.timestamp.getTime() - decisionTime.getTime()) <
          1000
    );

    if (duplicateTimestamp) {
      return {
        isValid: false,
        errorCode: 'DUPLICATE_TIMESTAMP',
        errorMessage: 'Decision timestamp too close to previous decision',
      };
    }

    return { isValid: true };
  }

  /**
   * Validate rate limiting to prevent rapid-fire decision changes
   */
  private validateRateLimit(decision: PlayerDecision, context: DecisionValidationContext): ValidationResult {
    const playerId = decision.playerId;
    
    // Skip rate limiting for AI players
    if (this.isAIPlayer(playerId, context.session)) {
      return { isValid: true };
    }
    
    const now = new Date();
    const rateLimitEntry = this.rateLimitMap.get(playerId);

    if (!rateLimitEntry) {
      // First decision for this player
      return { isValid: true };
    }

    // Check minimum interval between decisions
    const timeSinceLastDecision =
      now.getTime() - rateLimitEntry.lastDecisionTime.getTime();
    if (timeSinceLastDecision < this.MIN_DECISION_INTERVAL) {
      return {
        isValid: false,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        errorMessage: 'Decisions are being made too quickly',
        details: {
          minInterval: this.MIN_DECISION_INTERVAL,
          actualInterval: timeSinceLastDecision,
        },
      };
    }

    // Check decisions per window
    const windowElapsed = now.getTime() - rateLimitEntry.windowStart.getTime();
    if (windowElapsed < this.RATE_LIMIT_WINDOW) {
      if (rateLimitEntry.decisionCount >= this.MAX_DECISIONS_PER_WINDOW) {
        return {
          isValid: false,
          errorCode: 'RATE_LIMIT_WINDOW_EXCEEDED',
          errorMessage: 'Too many decisions in time window',
          details: {
            maxDecisions: this.MAX_DECISIONS_PER_WINDOW,
            windowSize: this.RATE_LIMIT_WINDOW,
            currentCount: rateLimitEntry.decisionCount,
          },
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Validate session state and phase
   */
  private validateSessionState(
    decision: PlayerDecision,
    context: DecisionValidationContext
  ): ValidationResult {
    const session = context.session;

    if (!session) {
      return {
        isValid: false,
        errorCode: 'NO_ACTIVE_SESSION',
        errorMessage: 'No active game session found',
      };
    }

    if (session.endTime) {
      return {
        isValid: false,
        errorCode: 'SESSION_ENDED',
        errorMessage: 'Game session has already ended',
      };
    }

    // Validate that decisions are allowed in current phase
    const allowedPhases = ['trust_phase', 'decision_reversal_phase'];
    if (!allowedPhases.includes(session.currentPhase)) {
      return {
        isValid: false,
        errorCode: 'INVALID_PHASE_FOR_DECISION',
        errorMessage: `Decisions not allowed in phase: ${session.currentPhase}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Validate round state and prevent duplicate decisions
   */
  private validateRoundState(
    decision: PlayerDecision,
    context: DecisionValidationContext
  ): ValidationResult {
    const session = context.session;
    const currentRound = context.roundNumber;

    // Check if player has already made a decision for this round
    const existingDecision = session.rounds
      .filter((round) => round.roundNumber === currentRound)
      .flatMap((round) => round.decisions)
      .find((d) => d.playerId === decision.playerId);

    if (
      existingDecision &&
      session.currentPhase !== 'decision_reversal_phase'
    ) {
      return {
        isValid: false,
        errorCode: 'DUPLICATE_ROUND_DECISION',
        errorMessage: 'Player has already made a decision for this round',
      };
    }

    // Validate round number
    if (currentRound < 1 || currentRound > session.sessionConfig.maxRounds) {
      return {
        isValid: false,
        errorCode: 'INVALID_ROUND_NUMBER',
        errorMessage: 'Invalid round number',
        details: {
          roundNumber: currentRound,
          maxRounds: session.sessionConfig.maxRounds,
        },
      };
    }

    return { isValid: true };
  }

  /**
   * Update rate limiting tracking for a player
   */
  private updateRateLimitTracking(playerId: string, session?: GameSession): void {
    // Skip tracking for AI players
    if (this.isAIPlayer(playerId, session)) {
      return;
    }
    
    const now = new Date();
    const existing = this.rateLimitMap.get(playerId);

    if (!existing) {
      this.rateLimitMap.set(playerId, {
        playerId,
        lastDecisionTime: now,
        decisionCount: 1,
        windowStart: now,
      });
      return;
    }

    const windowElapsed = now.getTime() - existing.windowStart.getTime();

    if (windowElapsed >= this.RATE_LIMIT_WINDOW) {
      // Reset window
      this.rateLimitMap.set(playerId, {
        playerId,
        lastDecisionTime: now,
        decisionCount: 1,
        windowStart: now,
      });
    } else {
      // Update existing window
      existing.lastDecisionTime = now;
      existing.decisionCount++;
    }
  }

  /**
   * Validate network message for security issues
   */
  validateNetworkMessage(
    message: NetworkMessage,
    connectionId: string
  ): ValidationResult {
    if (!message) {
      return {
        isValid: false,
        errorCode: 'INVALID_MESSAGE',
        errorMessage: 'Message object is required',
      };
    }

    if (!Object.values(NetworkMessageType).includes(message.type)) {
      return {
        isValid: false,
        errorCode: 'INVALID_MESSAGE_TYPE',
        errorMessage: `Invalid message type: ${message.type}`,
      };
    }

    if (!message.timestamp || !(message.timestamp instanceof Date)) {
      return {
        isValid: false,
        errorCode: 'INVALID_MESSAGE_TIMESTAMP',
        errorMessage: 'Valid timestamp is required',
      };
    }

    // Validate timestamp drift
    const now = new Date();
    const timeDiff = Math.abs(now.getTime() - message.timestamp.getTime());
    if (timeDiff > this.MAX_TIMESTAMP_DRIFT) {
      return {
        isValid: false,
        errorCode: 'MESSAGE_TIMESTAMP_DRIFT',
        errorMessage: 'Message timestamp is too far from server time',
      };
    }

    return { isValid: true };
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimitEntries(): void {
    const now = new Date();
    const cutoffTime = now.getTime() - this.RATE_LIMIT_WINDOW * 2;

    const entriesToDelete: string[] = [];
    this.rateLimitMap.forEach((entry, playerId) => {
      if (entry.windowStart.getTime() < cutoffTime) {
        entriesToDelete.push(playerId);
      }
    });

    entriesToDelete.forEach((playerId) => {
      this.rateLimitMap.delete(playerId);
    });
  }

  /**
   * Get rate limit status for a player
   */
  getRateLimitStatus(playerId: string): {
    decisionsInWindow: number;
    windowTimeRemaining: number;
    lastDecisionTime?: Date;
  } {
    const entry = this.rateLimitMap.get(playerId);
    if (!entry) {
      return {
        decisionsInWindow: 0,
        windowTimeRemaining: 0,
      };
    }

    const now = new Date();
    const windowElapsed = now.getTime() - entry.windowStart.getTime();
    const windowTimeRemaining = Math.max(
      0,
      this.RATE_LIMIT_WINDOW - windowElapsed
    );

    return {
      decisionsInWindow: entry.decisionCount,
      windowTimeRemaining,
      lastDecisionTime: entry.lastDecisionTime,
    };
  }
}
