import {
  SecurityValidationService,
  DecisionValidationContext,
} from '../SecurityValidationService';
import {
  PlayerDecision,
  Decision,
  GameSession,
  Player,
  GamePhase,
  SessionConfig,
  GameMode,
} from '../../types';
import { NetworkMessageType } from '../../types/network';

describe('SecurityValidationService', () => {
  let securityValidator: SecurityValidationService;
  let mockSession: GameSession;
  let mockPlayer: Player;
  let mockContext: DecisionValidationContext;

  beforeEach(() => {
    securityValidator = new SecurityValidationService();

    mockPlayer = {
      id: 'player1',
      name: 'Test Player',
      isAI: false,
      trustScore: 50,
      totalGamesPlayed: 0,
      createdAt: new Date(),
    };

    const sessionConfig: SessionConfig = {
      maxRounds: 10,
      trustPhaseRounds: 5,
      communicationTimeLimit: 60,
      allowDecisionReversal: true,
      gameMode: GameMode.MULTIPLAYER,
    };

    mockSession = {
      id: 'session1',
      players: [mockPlayer],
      rounds: [],
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig,
    };

    mockContext = {
      session: mockSession,
      player: mockPlayer,
      roundNumber: 1,
      previousDecisions: [],
    };
  });

  describe('validatePlayerDecision', () => {
    it('should validate a correct decision', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      const result = securityValidator.validatePlayerDecision(
        decision,
        mockContext
      );
      expect(result.isValid).toBe(true);
    });

    it('should reject decision with invalid player ID', () => {
      const decision: PlayerDecision = {
        playerId: '',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      const result = securityValidator.validatePlayerDecision(
        decision,
        mockContext
      );
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('INVALID_PLAYER_ID');
    });

    it('should reject decision with invalid decision value', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: 'invalid_decision' as Decision,
        timestamp: new Date(),
        canReverse: false,
      };

      const result = securityValidator.validatePlayerDecision(
        decision,
        mockContext
      );
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('INVALID_DECISION_VALUE');
    });

    it('should reject decision from unauthorized player', () => {
      const decision: PlayerDecision = {
        playerId: 'unauthorized_player',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      const result = securityValidator.validatePlayerDecision(
        decision,
        mockContext
      );
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('PLAYER_NOT_IN_SESSION');
    });

    it('should reject decision with timestamp drift', () => {
      const futureTime = new Date(Date.now() + 60000); // 1 minute in future
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: futureTime,
        canReverse: false,
      };

      const result = securityValidator.validatePlayerDecision(
        decision,
        mockContext
      );
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('TIMESTAMP_DRIFT');
    });

    it('should enforce rate limiting', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      // First decision should pass
      let result = securityValidator.validatePlayerDecision(
        decision,
        mockContext
      );
      expect(result.isValid).toBe(true);

      // Immediate second decision should fail due to rate limiting
      const immediateDecision: PlayerDecision = {
        ...decision,
        timestamp: new Date(),
      };

      result = securityValidator.validatePlayerDecision(
        immediateDecision,
        mockContext
      );
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should reject decisions in ended session', () => {
      mockSession.endTime = new Date();

      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      const result = securityValidator.validatePlayerDecision(
        decision,
        mockContext
      );
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('SESSION_ENDED');
    });

    it('should reject decisions in communication phase', () => {
      mockSession.currentPhase = GamePhase.COMMUNICATION_PHASE;

      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      const result = securityValidator.validatePlayerDecision(
        decision,
        mockContext
      );
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('INVALID_PHASE_FOR_DECISION');
    });
  });

  describe('validateNetworkMessage', () => {
    it('should validate a correct network message', () => {
      const message = {
        type: NetworkMessageType.PLAYER_DECISION,
        payload: { decision: 'stay_silent' },
        timestamp: new Date(),
      };

      const result = securityValidator.validateNetworkMessage(message, 'conn1');
      expect(result.isValid).toBe(true);
    });

    it('should reject message with invalid timestamp', () => {
      const message = {
        type: NetworkMessageType.PLAYER_DECISION,
        payload: { decision: 'stay_silent' },
        timestamp: 'invalid_timestamp' as any,
      };

      const result = securityValidator.validateNetworkMessage(message, 'conn1');
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('INVALID_MESSAGE_TIMESTAMP');
    });
  });

  describe('rate limiting', () => {
    it('should track rate limit status', () => {
      const playerId = 'player1';

      // Initially no rate limit data
      let status = securityValidator.getRateLimitStatus(playerId);
      expect(status.decisionsInWindow).toBe(0);

      // Make a decision to create rate limit entry
      const decision: PlayerDecision = {
        playerId,
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      securityValidator.validatePlayerDecision(decision, mockContext);

      status = securityValidator.getRateLimitStatus(playerId);
      expect(status.decisionsInWindow).toBe(1);
      expect(status.lastDecisionTime).toBeDefined();
    });

    it('should clean up old rate limit entries', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      securityValidator.validatePlayerDecision(decision, mockContext);

      // Verify entry exists
      let status = securityValidator.getRateLimitStatus('player1');
      expect(status.decisionsInWindow).toBe(1);

      // Clean up
      securityValidator.cleanupRateLimitEntries();

      // Entry should still exist since it's recent
      status = securityValidator.getRateLimitStatus('player1');
      expect(status.decisionsInWindow).toBe(1);
    });
  });
});
