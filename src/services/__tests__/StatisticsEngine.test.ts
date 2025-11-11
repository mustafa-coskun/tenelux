import { StatisticsEngine } from '../StatisticsEngine';
import {
  GameSession,
  Player,
  Round,
  Decision,
  GamePhase,
  PayoffResult,
  PlayerDecision,
  SessionResult,
  GameMode,
} from '../../types';

describe('StatisticsEngine', () => {
  let statisticsEngine: StatisticsEngine;
  let mockPlayer1: Player;
  let mockPlayer2: Player;
  let mockSession: GameSession;

  beforeEach(() => {
    statisticsEngine = new StatisticsEngine();

    mockPlayer1 = {
      id: 'player1',
      name: 'Alice',
      isAI: false,
      trustScore: 75,
      totalGamesPlayed: 5,
      createdAt: new Date(),
    };

    mockPlayer2 = {
      id: 'player2',
      name: 'Bob',
      isAI: true,
      trustScore: 60,
      totalGamesPlayed: 3,
      createdAt: new Date(),
    };

    mockSession = {
      id: 'session1',
      players: [mockPlayer1, mockPlayer2],
      rounds: [],
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig: {
        maxRounds: 5,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
      },
    };
  });

  describe('calculateSessionStats', () => {
    it('should calculate correct cooperation and betrayal percentages', () => {
      // Create rounds with mixed decisions
      const rounds: Round[] = [
        createMockRound(1, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(2, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
        createMockRound(3, Decision.CONFESS, Decision.STAY_SILENT, {
          playerA: 5,
          playerB: 0,
        }),
        createMockRound(4, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(5, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
      ];

      mockSession.rounds = rounds;
      mockSession.winner = mockPlayer1;

      const stats = statisticsEngine.calculateSessionStats(mockSession);

      // Player 1: 4 cooperations (STAY_SILENT), 1 betrayal (CONFESS) out of 5 rounds
      expect(stats.cooperationPercentage).toBe(80); // 4/5 * 100
      expect(stats.betrayalPercentage).toBe(20); // 1/5 * 100
      expect(stats.totalPoints).toBe(11); // 0 + 3 + 5 + 0 + 3
      expect(stats.gamesWon).toBe(1);
      expect(stats.gamesLost).toBe(0);
    });

    it('should identify the most fearful round correctly', () => {
      const rounds: Round[] = [
        createMockRound(1, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(2, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
        createMockRound(3, Decision.CONFESS, Decision.STAY_SILENT, {
          playerA: 5,
          playerB: 0,
        }),
      ];

      mockSession.rounds = rounds;

      const stats = statisticsEngine.calculateSessionStats(mockSession);

      expect(stats.mostFearfulRound).toBe(3); // First round where player1 confessed
    });

    it('should return undefined for mostFearfulRound if player never confessed', () => {
      const rounds: Round[] = [
        createMockRound(1, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(2, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
        createMockRound(3, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
      ];

      mockSession.rounds = rounds;

      const stats = statisticsEngine.calculateSessionStats(mockSession);

      expect(stats.mostFearfulRound).toBeUndefined();
      expect(stats.cooperationPercentage).toBe(100);
      expect(stats.betrayalPercentage).toBe(0);
    });

    it('should handle empty session with no rounds', () => {
      mockSession.rounds = [];

      const stats = statisticsEngine.calculateSessionStats(mockSession);

      expect(stats.cooperationPercentage).toBe(0);
      expect(stats.betrayalPercentage).toBe(0);
      expect(stats.mostFearfulRound).toBeUndefined();
      expect(stats.totalPoints).toBe(0);
      expect(stats.gamesWon).toBe(0);
      expect(stats.gamesLost).toBe(0);
    });

    it('should throw error for session without players', () => {
      mockSession.players = [];

      expect(() => {
        statisticsEngine.calculateSessionStats(mockSession);
      }).toThrow('Session must have players to calculate statistics');
    });
  });

  describe('generateReport', () => {
    it('should return empty stats for unknown player', () => {
      const stats = statisticsEngine.generateReport('unknown-player');

      expect(stats.cooperationPercentage).toBe(0);
      expect(stats.betrayalPercentage).toBe(0);
      expect(stats.totalPoints).toBe(0);
      expect(stats.gamesWon).toBe(0);
      expect(stats.gamesLost).toBe(0);
    });

    it('should return historical stats for known player', () => {
      // Create a session with actual rounds for proper statistics calculation
      const rounds: Round[] = [
        createMockRound(1, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(2, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
        createMockRound(3, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(4, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
        createMockRound(5, Decision.CONFESS, Decision.STAY_SILENT, {
          playerA: 5,
          playerB: 0,
        }),
      ];

      mockSession.rounds = rounds;
      mockSession.winner = mockPlayer1;

      const sessionResult: SessionResult = {
        session: mockSession,
        finalScores: { player1: 11, player2: 16 },
        winner: mockPlayer1,
        statistics: {
          cooperationPercentage: 80,
          betrayalPercentage: 20,
          totalPoints: 11,
          gamesWon: 1,
          gamesLost: 0,
          averageTrustScore: 75,
        },
      };

      statisticsEngine.updateHistoricalStats('player1', sessionResult);

      const report = statisticsEngine.generateReport('player1');

      expect(report.cooperationPercentage).toBe(80); // 4 cooperations out of 5 rounds
      expect(report.betrayalPercentage).toBe(20); // 1 betrayal out of 5 rounds
      expect(report.totalPoints).toBe(11); // 0 + 3 + 0 + 3 + 5
      expect(report.gamesWon).toBe(1);
      expect(report.gamesLost).toBe(0);
    });
  });

  describe('updateHistoricalStats', () => {
    it('should update historical statistics correctly for new player', () => {
      const rounds: Round[] = [
        createMockRound(1, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(2, Decision.CONFESS, Decision.STAY_SILENT, {
          playerA: 5,
          playerB: 0,
        }),
      ];

      mockSession.rounds = rounds;
      mockSession.winner = mockPlayer1;

      const sessionResult: SessionResult = {
        session: mockSession,
        finalScores: { player1: 5, player2: 5 },
        winner: mockPlayer1,
        statistics: {
          cooperationPercentage: 50,
          betrayalPercentage: 50,
          totalPoints: 5,
          gamesWon: 1,
          gamesLost: 0,
          averageTrustScore: 75,
        },
      };

      statisticsEngine.updateHistoricalStats('player1', sessionResult);

      const report = statisticsEngine.generateReport('player1');

      expect(report.cooperationPercentage).toBe(50);
      expect(report.betrayalPercentage).toBe(50);
      expect(report.totalPoints).toBe(5);
      expect(report.gamesWon).toBe(1);
      expect(report.gamesLost).toBe(0);
    });

    it('should accumulate statistics across multiple sessions', () => {
      // First session - 4 cooperations, 1 betrayal
      const firstSessionRounds: Round[] = [
        createMockRound(1, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(2, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
        createMockRound(3, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(4, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
        createMockRound(5, Decision.CONFESS, Decision.STAY_SILENT, {
          playerA: 5,
          playerB: 0,
        }),
      ];

      const firstSession = {
        ...mockSession,
        rounds: firstSessionRounds,
        winner: mockPlayer1,
      };

      const firstSessionResult: SessionResult = {
        session: firstSession,
        finalScores: { player1: 11, player2: 16 },
        winner: mockPlayer1,
        statistics: {
          cooperationPercentage: 80,
          betrayalPercentage: 20,
          totalPoints: 11,
          gamesWon: 1,
          gamesLost: 0,
          averageTrustScore: 75,
        },
      };

      statisticsEngine.updateHistoricalStats('player1', firstSessionResult);

      // Second session - 2 cooperations, 3 betrayals
      const secondSessionRounds: Round[] = [
        createMockRound(1, Decision.CONFESS, Decision.STAY_SILENT, {
          playerA: 5,
          playerB: 0,
        }),
        createMockRound(2, Decision.CONFESS, Decision.CONFESS, {
          playerA: 1,
          playerB: 1,
        }),
        createMockRound(3, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(4, Decision.CONFESS, Decision.STAY_SILENT, {
          playerA: 5,
          playerB: 0,
        }),
        createMockRound(5, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
      ];

      const secondSession = {
        ...mockSession,
        rounds: secondSessionRounds,
        winner: mockPlayer2,
      };

      const secondSessionResult: SessionResult = {
        session: secondSession,
        finalScores: { player1: 14, player2: 9 },
        winner: mockPlayer2,
        statistics: {
          cooperationPercentage: 40,
          betrayalPercentage: 60,
          totalPoints: 14,
          gamesWon: 0,
          gamesLost: 1,
          averageTrustScore: 70,
        },
      };

      statisticsEngine.updateHistoricalStats('player1', secondSessionResult);

      const report = statisticsEngine.generateReport('player1');

      expect(report.cooperationPercentage).toBe(60); // Weighted average: (80*1 + 40*1) / 2
      expect(report.betrayalPercentage).toBe(40); // Weighted average: (20*1 + 60*1) / 2
      expect(report.totalPoints).toBe(25); // 11 + 14
      expect(report.gamesWon).toBe(1);
      expect(report.gamesLost).toBe(1);
    });
  });

  describe('analyzeDecisionPatterns', () => {
    it('should identify most common decision and calculate consistency', () => {
      const rounds: Round[] = [
        createMockRound(1, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(2, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
        createMockRound(3, Decision.CONFESS, Decision.STAY_SILENT, {
          playerA: 5,
          playerB: 0,
        }),
        createMockRound(4, Decision.STAY_SILENT, Decision.CONFESS, {
          playerA: 0,
          playerB: 5,
        }),
        createMockRound(5, Decision.STAY_SILENT, Decision.STAY_SILENT, {
          playerA: 3,
          playerB: 3,
        }),
      ];

      mockSession.rounds = rounds;

      const analysis = statisticsEngine.analyzeDecisionPatterns(
        mockSession,
        'player1'
      );

      expect(analysis.mostCommonDecision).toBe(Decision.STAY_SILENT);
      expect(analysis.decisionSequence).toEqual([
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
        Decision.CONFESS,
        Decision.STAY_SILENT,
        Decision.STAY_SILENT,
      ]);
      expect(analysis.consistencyScore).toBe(80); // 4 out of 5 decisions were STAY_SILENT
    });

    it('should handle empty decision sequence', () => {
      mockSession.rounds = [];

      const analysis = statisticsEngine.analyzeDecisionPatterns(
        mockSession,
        'player1'
      );

      expect(analysis.mostCommonDecision).toBe(Decision.STAY_SILENT);
      expect(analysis.decisionSequence).toEqual([]);
      expect(analysis.consistencyScore).toBe(0);
    });
  });

  describe('generateComparativeText', () => {
    it('should generate correct comparative text', () => {
      const stats = {
        cooperationPercentage: 66.67,
        betrayalPercentage: 33.33,
        totalPoints: 15,
        gamesWon: 2,
        gamesLost: 1,
        averageTrustScore: 72.5,
      };

      const text = statisticsEngine.generateComparativeText(stats);

      expect(text).toBe('67% trustworthy, 33% betrayal rate');
    });

    it('should handle zero percentages', () => {
      const stats = {
        cooperationPercentage: 0,
        betrayalPercentage: 0,
        totalPoints: 0,
        gamesWon: 0,
        gamesLost: 0,
        averageTrustScore: 0,
      };

      const text = statisticsEngine.generateComparativeText(stats);

      expect(text).toBe('0% trustworthy, 0% betrayal rate');
    });
  });

  describe('utility methods', () => {
    it('should clear historical stats', () => {
      const sessionResult: SessionResult = {
        session: mockSession,
        finalScores: { player1: 10, player2: 8 },
        winner: mockPlayer1,
        statistics: {
          cooperationPercentage: 80,
          betrayalPercentage: 20,
          totalPoints: 10,
          gamesWon: 1,
          gamesLost: 0,
          averageTrustScore: 75,
        },
      };

      statisticsEngine.updateHistoricalStats('player1', sessionResult);
      expect(statisticsEngine.getAllHistoricalStats().size).toBe(1);

      statisticsEngine.clearHistoricalStats();
      expect(statisticsEngine.getAllHistoricalStats().size).toBe(0);
    });

    it('should get all historical stats', () => {
      const sessionResult: SessionResult = {
        session: mockSession,
        finalScores: { player1: 10, player2: 8 },
        winner: mockPlayer1,
        statistics: {
          cooperationPercentage: 80,
          betrayalPercentage: 20,
          totalPoints: 10,
          gamesWon: 1,
          gamesLost: 0,
          averageTrustScore: 75,
        },
      };

      statisticsEngine.updateHistoricalStats('player1', sessionResult);
      statisticsEngine.updateHistoricalStats('player2', sessionResult);

      const allStats = statisticsEngine.getAllHistoricalStats();
      expect(allStats.size).toBe(2);
      expect(allStats.has('player1')).toBe(true);
      expect(allStats.has('player2')).toBe(true);
    });
  });

  // Helper function to create mock rounds
  function createMockRound(
    roundNumber: number,
    player1Decision: Decision,
    player2Decision: Decision,
    results: PayoffResult
  ): Round {
    const decisions: PlayerDecision[] = [
      {
        playerId: 'player1',
        decision: player1Decision,
        timestamp: new Date(),
        canReverse: false,
      },
      {
        playerId: 'player2',
        decision: player2Decision,
        timestamp: new Date(),
        canReverse: false,
      },
    ];

    return {
      roundNumber,
      decisions,
      results,
      timestamp: new Date(),
      phaseType: GamePhase.TRUST_PHASE,
    };
  }
});
