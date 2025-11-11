import { GameEngine } from '../GameEngine';
import {
  Decision,
  GamePhase,
  GameMode,
  Player,
  PlayerDecision,
  GameSession,
  SessionConfig,
} from '../../types';
import { PAYOFF_MATRIX } from '../../utils/constants';

describe('GameEngine', () => {
  let gameEngine: GameEngine;
  let mockPlayers: Player[];
  let mockSession: GameSession;

  beforeEach(() => {
    gameEngine = new GameEngine();

    mockPlayers = [
      {
        id: 'player1',
        name: 'Player 1',
        isAI: false,
        trustScore: 50,
        totalGamesPlayed: 0,
        createdAt: new Date(),
      },
      {
        id: 'player2',
        name: 'Player 2',
        isAI: false,
        trustScore: 50,
        totalGamesPlayed: 0,
        createdAt: new Date(),
      },
    ];

    const sessionConfig: SessionConfig = {
      maxRounds: 5,
      trustPhaseRounds: 5,
      communicationTimeLimit: 60,
      allowDecisionReversal: true,
      gameMode: GameMode.MULTIPLAYER,
    };

    mockSession = {
      id: 'session1',
      players: mockPlayers,
      rounds: [],
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig,
    };

    gameEngine.setCurrentSession(mockSession);
  });

  describe('calculatePayoffs', () => {
    test('should calculate correct payoffs for both players staying silent', () => {
      const result = gameEngine.calculatePayoffs(
        Decision.STAY_SILENT,
        Decision.STAY_SILENT
      );
      expect(result).toEqual({ playerA: 3, playerB: 3 });
    });

    test('should calculate correct payoffs for player A confessing, player B staying silent', () => {
      const result = gameEngine.calculatePayoffs(
        Decision.CONFESS,
        Decision.STAY_SILENT
      );
      expect(result).toEqual({ playerA: 5, playerB: 0 });
    });

    test('should calculate correct payoffs for player A staying silent, player B confessing', () => {
      const result = gameEngine.calculatePayoffs(
        Decision.STAY_SILENT,
        Decision.CONFESS
      );
      expect(result).toEqual({ playerA: 0, playerB: 5 });
    });

    test('should calculate correct payoffs for both players confessing', () => {
      const result = gameEngine.calculatePayoffs(
        Decision.CONFESS,
        Decision.CONFESS
      );
      expect(result).toEqual({ playerA: 1, playerB: 1 });
    });

    test('should throw error for invalid decision combination', () => {
      expect(() => {
        gameEngine.calculatePayoffs(
          'invalid' as Decision,
          Decision.STAY_SILENT
        );
      }).toThrow('Invalid decision combination');
    });
  });

  describe('processRound', () => {
    test('should process a valid round with two decisions', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      const result = gameEngine.processRound(decisions);

      expect(result.round).toBeDefined();
      expect(result.round.roundNumber).toBe(1);
      expect(result.round.decisions).toHaveLength(2);
      expect(result.round.results).toEqual({ playerA: 0, playerB: 5 });
      expect(result.gameEnded).toBe(false);
    });

    test('should end game when max rounds reached', () => {
      // Add 4 rounds to reach the limit (maxRounds = 5)
      for (let i = 0; i < 4; i++) {
        mockSession.rounds.push({
          roundNumber: i + 1,
          decisions: [
            {
              playerId: 'player1',
              decision: Decision.STAY_SILENT,
              timestamp: new Date(),
              canReverse: false,
            },
            {
              playerId: 'player2',
              decision: Decision.STAY_SILENT,
              timestamp: new Date(),
              canReverse: false,
            },
          ],
          results: { playerA: 3, playerB: 3 },
          timestamp: new Date(),
          phaseType: GamePhase.TRUST_PHASE,
        });
      }

      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      const result = gameEngine.processRound(decisions);

      expect(result.gameEnded).toBe(true);
      expect(result.winner).toBeDefined();
      expect(mockSession.endTime).toBeDefined();
    });

    test('should throw error when no active session', () => {
      gameEngine.setCurrentSession(null);

      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      expect(() => gameEngine.processRound(decisions)).toThrow(
        'No active game session'
      );
    });

    test('should throw error with wrong number of decisions', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      expect(() => gameEngine.processRound(decisions)).toThrow(
        'Round requires exactly 2 player decisions'
      );
    });
  });

  describe('decision validation', () => {
    test('should validate decisions successfully', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      expect(() => gameEngine.processRound(decisions)).not.toThrow();
    });

    test('should throw error for missing player ID', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: '',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      expect(() => gameEngine.processRound(decisions)).toThrow(
        'Player ID is required'
      );
    });

    test('should throw error for invalid decision', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: 'invalid' as Decision,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      expect(() => gameEngine.processRound(decisions)).toThrow(
        'Invalid decision'
      );
    });

    test('should throw error for duplicate player decisions', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player1',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      expect(() => gameEngine.processRound(decisions)).toThrow(
        'Duplicate player decisions detected'
      );
    });

    test('should throw error for player not in session', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'unknown_player',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      expect(() => gameEngine.processRound(decisions)).toThrow(
        'Player unknown_player is not part of the current session'
      );
    });
  });

  describe('winner determination', () => {
    test('should determine winner based on total points', () => {
      // Player 1 gets 5 points, Player 2 gets 0 points
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      // Set up session to end after this round
      mockSession.sessionConfig.maxRounds = 1;

      const result = gameEngine.processRound(decisions);

      expect(result.gameEnded).toBe(true);
      expect(result.winner?.id).toBe('player1');
    });

    test('should handle tie scenarios', () => {
      // Both players get 3 points
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      // Set up session to end after this round
      mockSession.sessionConfig.maxRounds = 1;

      const result = gameEngine.processRound(decisions);

      expect(result.gameEnded).toBe(true);
      expect(result.winner).toBeDefined(); // One of the players will be selected
    });
  });
});
