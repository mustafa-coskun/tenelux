import { TrustScoreEngine } from '../TrustScoreEngine';
import {
  SessionResult,
  GameSession,
  Player,
  Decision,
  GamePhase,
  GameMode,
} from '../../types';

describe('TrustScoreEngine', () => {
  let trustScoreEngine: TrustScoreEngine;

  beforeEach(() => {
    trustScoreEngine = new TrustScoreEngine();
  });

  describe('calculateTrustScore', () => {
    it('should increase score for high cooperation rate', () => {
      const sessionResult = createMockSessionResult(0.8); // 80% cooperation
      const calculation = trustScoreEngine.calculateTrustScore(
        50,
        sessionResult,
        'player1'
      );

      expect(calculation.newScore).toBeGreaterThan(50);
      expect(calculation.scoreChange).toBeGreaterThan(0);
      expect(calculation.cooperationRate).toBe(0.8);
      expect(calculation.reasoning).toContain('High cooperation rate');
    });

    it('should decrease score for low cooperation rate', () => {
      const sessionResult = createMockSessionResult(0.2); // 20% cooperation
      const calculation = trustScoreEngine.calculateTrustScore(
        50,
        sessionResult,
        'player1'
      );

      expect(calculation.newScore).toBeLessThan(50);
      expect(calculation.scoreChange).toBeLessThan(0);
      expect(calculation.cooperationRate).toBe(0.2);
      expect(calculation.reasoning).toContain('Low cooperation rate');
    });

    it('should increase score for cooperation above high threshold', () => {
      const sessionResult = createMockSessionResultWithDecisions([
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
        Decision.CONFESS,
      ]); // Exactly 4/5 = 0.8 cooperation (above high threshold)
      const calculation = trustScoreEngine.calculateTrustScore(
        50,
        sessionResult,
        'player1'
      );

      expect(calculation.cooperationRate).toBe(0.8);
      expect(calculation.reasoning).toContain('High cooperation rate');
      expect(calculation.scoreChange).toBeGreaterThan(0);
    });

    it('should make minor adjustment for moderate cooperation', () => {
      // Use 10 rounds to get exactly 0.5 cooperation rate
      const sessionResult = createMockSessionResultWithDecisions([
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
        Decision.CONFESS,
        Decision.CONFESS,
        Decision.CONFESS,
        Decision.CONFESS,
        Decision.CONFESS,
      ]); // Exactly 5/10 = 0.5 cooperation (between thresholds)
      const calculation = trustScoreEngine.calculateTrustScore(
        50,
        sessionResult,
        'player1'
      );

      expect(calculation.cooperationRate).toBe(0.5);
      expect(calculation.reasoning).toContain('Moderate cooperation rate');
      expect(Math.abs(calculation.scoreChange)).toBeLessThan(5);
    });

    it('should apply diminishing returns for high scores', () => {
      const sessionResult = createMockSessionResult(1.0); // 100% cooperation
      const lowScoreCalc = trustScoreEngine.calculateTrustScore(
        20,
        sessionResult,
        'player1'
      );
      const highScoreCalc = trustScoreEngine.calculateTrustScore(
        90,
        sessionResult,
        'player1'
      );

      expect(lowScoreCalc.scoreChange).toBeGreaterThan(
        highScoreCalc.scoreChange
      );
    });

    it('should apply diminishing returns for low scores', () => {
      const sessionResult = createMockSessionResult(0.0); // 0% cooperation
      const highScoreCalc = trustScoreEngine.calculateTrustScore(
        80,
        sessionResult,
        'player1'
      );
      const lowScoreCalc = trustScoreEngine.calculateTrustScore(
        10,
        sessionResult,
        'player1'
      );

      expect(Math.abs(highScoreCalc.scoreChange)).toBeGreaterThan(
        Math.abs(lowScoreCalc.scoreChange)
      );
    });

    it('should not exceed maximum score', () => {
      const sessionResult = createMockSessionResult(1.0); // 100% cooperation
      const calculation = trustScoreEngine.calculateTrustScore(
        95,
        sessionResult,
        'player1'
      );

      expect(calculation.newScore).toBeLessThanOrEqual(100);
    });

    it('should not go below minimum score', () => {
      const sessionResult = createMockSessionResult(0.0); // 0% cooperation
      const calculation = trustScoreEngine.calculateTrustScore(
        5,
        sessionResult,
        'player1'
      );

      expect(calculation.newScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkTrustworthyTitle', () => {
    it('should award title for fewer than 3 confessions', () => {
      const sessionResult = createMockSessionResultWithDecisions([
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
        Decision.CONFESS,
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
      ]);

      const qualifies = trustScoreEngine.checkTrustworthyTitle(
        sessionResult,
        'player1'
      );
      expect(qualifies).toBe(true);
    });

    it('should not award title for 3 or more confessions', () => {
      const sessionResult = createMockSessionResultWithDecisions([
        Decision.CONFESS,
        Decision.CONFESS,
        Decision.CONFESS,
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
      ]);

      const qualifies = trustScoreEngine.checkTrustworthyTitle(
        sessionResult,
        'player1'
      );
      expect(qualifies).toBe(false);
    });

    it('should handle edge case of exactly 3 confessions', () => {
      const sessionResult = createMockSessionResultWithDecisions([
        Decision.CONFESS,
        Decision.CONFESS,
        Decision.STAY_SILENT,
        Decision.CONFESS,
        Decision.STAY_SILENT,
      ]);

      const qualifies = trustScoreEngine.checkTrustworthyTitle(
        sessionResult,
        'player1'
      );
      expect(qualifies).toBe(false);
    });
  });

  describe('getTrustCategory', () => {
    it('should return correct categories for different scores', () => {
      expect(trustScoreEngine.getTrustCategory(90)).toBe('Highly Trustworthy');
      expect(trustScoreEngine.getTrustCategory(70)).toBe('Trustworthy');
      expect(trustScoreEngine.getTrustCategory(50)).toBe('Neutral');
      expect(trustScoreEngine.getTrustCategory(30)).toBe('Untrustworthy');
      expect(trustScoreEngine.getTrustCategory(10)).toBe(
        'Highly Untrustworthy'
      );
    });

    it('should handle boundary values', () => {
      expect(trustScoreEngine.getTrustCategory(80)).toBe('Highly Trustworthy');
      expect(trustScoreEngine.getTrustCategory(60)).toBe('Trustworthy');
      expect(trustScoreEngine.getTrustCategory(40)).toBe('Neutral');
      expect(trustScoreEngine.getTrustCategory(20)).toBe('Untrustworthy');
    });
  });

  describe('calculateTrustTrend', () => {
    it('should identify improving trend', () => {
      const history = [
        {
          score: 40,
          scoreChange: 5,
          timestamp: new Date(),
          sessionId: '1',
          cooperationRate: 0.6,
          reasoning: 'test',
        },
        {
          score: 45,
          scoreChange: 7,
          timestamp: new Date(),
          sessionId: '2',
          cooperationRate: 0.7,
          reasoning: 'test',
        },
        {
          score: 52,
          scoreChange: 6,
          timestamp: new Date(),
          sessionId: '3',
          cooperationRate: 0.8,
          reasoning: 'test',
        },
      ];

      const trend = trustScoreEngine.calculateTrustTrend(history);
      expect(trend).toBe('improving');
    });

    it('should identify declining trend', () => {
      const history = [
        {
          score: 60,
          scoreChange: -5,
          timestamp: new Date(),
          sessionId: '1',
          cooperationRate: 0.3,
          reasoning: 'test',
        },
        {
          score: 55,
          scoreChange: -7,
          timestamp: new Date(),
          sessionId: '2',
          cooperationRate: 0.2,
          reasoning: 'test',
        },
        {
          score: 48,
          scoreChange: -6,
          timestamp: new Date(),
          sessionId: '3',
          cooperationRate: 0.1,
          reasoning: 'test',
        },
      ];

      const trend = trustScoreEngine.calculateTrustTrend(history);
      expect(trend).toBe('declining');
    });

    it('should identify stable trend', () => {
      const history = [
        {
          score: 50,
          scoreChange: 1,
          timestamp: new Date(),
          sessionId: '1',
          cooperationRate: 0.5,
          reasoning: 'test',
        },
        {
          score: 51,
          scoreChange: -1,
          timestamp: new Date(),
          sessionId: '2',
          cooperationRate: 0.4,
          reasoning: 'test',
        },
        {
          score: 50,
          scoreChange: 0,
          timestamp: new Date(),
          sessionId: '3',
          cooperationRate: 0.5,
          reasoning: 'test',
        },
      ];

      const trend = trustScoreEngine.calculateTrustTrend(history);
      expect(trend).toBe('stable');
    });

    it('should return stable for insufficient history', () => {
      const history = [
        {
          score: 50,
          scoreChange: 0,
          timestamp: new Date(),
          sessionId: '1',
          cooperationRate: 0.5,
          reasoning: 'test',
        },
      ];

      const trend = trustScoreEngine.calculateTrustTrend(history);
      expect(trend).toBe('stable');
    });
  });

  describe('calculatePercentileRank', () => {
    it('should calculate correct percentile rank', () => {
      const allScores = [10, 20, 30, 40, 50, 60, 70, 80, 90];
      const percentile = trustScoreEngine.calculatePercentileRank(
        60,
        allScores
      );

      expect(percentile).toBe(56); // 5 out of 9 scores are lower than 60
    });

    it('should handle edge cases', () => {
      expect(trustScoreEngine.calculatePercentileRank(50, [])).toBe(50);
      expect(trustScoreEngine.calculatePercentileRank(100, [10, 20, 30])).toBe(
        100
      );
      expect(trustScoreEngine.calculatePercentileRank(5, [10, 20, 30])).toBe(0);
    });
  });

  // Helper functions
  function createMockSessionResult(cooperationRate: number): SessionResult {
    const totalRounds = 5;
    const cooperativeRounds = Math.round(totalRounds * cooperationRate);
    const rounds = [];

    for (let i = 0; i < totalRounds; i++) {
      const decision =
        i < cooperativeRounds ? Decision.STAY_SILENT : Decision.CONFESS;
      rounds.push({
        roundNumber: i + 1,
        decisions: [
          {
            playerId: 'player1',
            decision,
            timestamp: new Date(),
            canReverse: false,
          },
        ],
        results: { playerA: 3, playerB: 3 },
        timestamp: new Date(),
        phaseType: GamePhase.TRUST_PHASE,
      });
    }

    const mockPlayer: Player = {
      id: 'player1',
      name: 'TestPlayer',
      isAI: false,
      trustScore: 50,
      totalGamesPlayed: 0,
      createdAt: new Date(),
    };

    const session: GameSession = {
      id: `session_${Date.now()}`,
      players: [mockPlayer],
      rounds,
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig: {
        maxRounds: 5,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: false,
        gameMode: GameMode.SINGLE_PLAYER,
      },
    };

    return {
      session,
      finalScores: { player1: 15 },
      winner: mockPlayer,
      statistics: {
        cooperationPercentage: cooperationRate * 100,
        betrayalPercentage: (1 - cooperationRate) * 100,
        totalPoints: 15,
        gamesWon: 1,
        gamesLost: 0,
        averageTrustScore: 50,
      },
    };
  }

  function createMockSessionResultWithDecisions(
    decisions: Decision[]
  ): SessionResult {
    const rounds = decisions.map((decision, index) => ({
      roundNumber: index + 1,
      decisions: [
        {
          playerId: 'player1',
          decision,
          timestamp: new Date(),
          canReverse: false,
        },
      ],
      results: { playerA: 3, playerB: 3 },
      timestamp: new Date(),
      phaseType: GamePhase.TRUST_PHASE,
    }));

    const cooperationRate =
      decisions.filter((d) => d === Decision.STAY_SILENT).length /
      decisions.length;

    const mockPlayer: Player = {
      id: 'player1',
      name: 'TestPlayer',
      isAI: false,
      trustScore: 50,
      totalGamesPlayed: 0,
      createdAt: new Date(),
    };

    const session: GameSession = {
      id: `session_${Date.now()}`,
      players: [mockPlayer],
      rounds,
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig: {
        maxRounds: decisions.length,
        trustPhaseRounds: decisions.length,
        communicationTimeLimit: 60,
        allowDecisionReversal: false,
        gameMode: GameMode.SINGLE_PLAYER,
      },
    };

    return {
      session,
      finalScores: { player1: 15 },
      winner: mockPlayer,
      statistics: {
        cooperationPercentage: cooperationRate * 100,
        betrayalPercentage: (1 - cooperationRate) * 100,
        totalPoints: 15,
        gamesWon: 1,
        gamesLost: 0,
        averageTrustScore: 50,
      },
    };
  }
});
