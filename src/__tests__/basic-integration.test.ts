import { PlayerManager } from '../services/PlayerManager';
import { AIStrategyEngine } from '../services/AIStrategyEngine';
import { SessionManager } from '../services/SessionManager';
import { DatabaseConnection } from '../database/DatabaseConnection';
import {
  GameMode,
  Decision,
  AIStrategy,
  SessionConfig,
  GamePhase,
  PayoffResult,
} from '../types';

describe('Basic Integration Tests', () => {
  let playerManager: PlayerManager;
  let aiStrategyEngine: AIStrategyEngine;
  let sessionManager: SessionManager;
  let database: DatabaseConnection;

  beforeAll(async () => {
    // Initialize database
    database = DatabaseConnection.getInstance();
    await database.initialize();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(() => {
    // Reset services for each test
    playerManager = new PlayerManager();
    sessionManager = new SessionManager();
    aiStrategyEngine = new AIStrategyEngine();
  });

  describe('Player Management Integration', () => {
    test('should create and manage players', () => {
      const humanPlayer = playerManager.createPlayer('TestPlayer', false);
      expect(humanPlayer).toBeDefined();
      expect(humanPlayer.name).toBe('TestPlayer');
      expect(humanPlayer.isAI).toBe(false);
      expect(humanPlayer.trustScore).toBe(50); // Default trust score

      const aiPlayer = playerManager.createPlayer('AI_Test', true);
      expect(aiPlayer).toBeDefined();
      expect(aiPlayer.isAI).toBe(true);

      // Test player retrieval
      const retrievedPlayer = playerManager.getPlayer(humanPlayer.id);
      expect(retrievedPlayer).toBeDefined();
      expect(retrievedPlayer!.id).toBe(humanPlayer.id);
    });

    test('should handle duplicate player names', () => {
      playerManager.createPlayer('DuplicateTest', false);

      expect(() => {
        playerManager.createPlayer('DuplicateTest', false);
      }).toThrow('Player with name "DuplicateTest" already exists');
    });

    test('should update trust scores', () => {
      const player = playerManager.createPlayer('TrustTest', false);
      const initialTrustScore = player.trustScore;

      // Mock session result with cooperative behavior
      const mockSessionResult = {
        session: {
          id: 'test-session',
          players: [player],
          rounds: [
            {
              roundNumber: 1,
              decisions: [
                {
                  playerId: player.id,
                  decision: Decision.STAY_SILENT,
                  timestamp: new Date(),
                  canReverse: true,
                },
              ],
              results: { playerA: 3, playerB: 3 } as PayoffResult,
              timestamp: new Date(),
              phaseType: GamePhase.TRUST_PHASE,
            },
          ],
          currentPhase: GamePhase.TRUST_PHASE,
          startTime: new Date(),
          endTime: new Date(),
          sessionConfig: {
            maxRounds: 5,
            trustPhaseRounds: 3,
            communicationTimeLimit: 60,
            allowDecisionReversal: true,
            gameMode: GameMode.SINGLE_PLAYER,
          },
        },
        finalScores: { [player.id]: 3 },
        winner: player,
        statistics: {
          cooperationPercentage: 100,
          betrayalPercentage: 0,
          totalPoints: 3,
          gamesWon: 1,
          gamesLost: 0,
          averageTrustScore: 50,
        },
      };

      playerManager.updateTrustScore(player.id, mockSessionResult);

      const updatedPlayer = playerManager.getPlayer(player.id);
      expect(updatedPlayer!.trustScore).toBeGreaterThanOrEqual(
        initialTrustScore
      );
      expect(updatedPlayer!.totalGamesPlayed).toBe(1);
    });
  });

  describe('AI Strategy Integration', () => {
    test('should execute all AI strategies correctly', () => {
      const gameHistory = [
        {
          roundNumber: 1,
          decisions: [
            {
              playerId: 'human',
              decision: Decision.CONFESS,
              timestamp: new Date(),
              canReverse: true,
            },
          ],
          results: { playerA: 1, playerB: 1 } as PayoffResult,
          timestamp: new Date(),
          phaseType: GamePhase.TRUST_PHASE,
        },
      ];

      // Test Loyal AI (always stays silent)
      const loyalDecision = aiStrategyEngine.executeStrategy(
        AIStrategy.LOYAL,
        gameHistory
      );
      expect(loyalDecision).toBe(Decision.STAY_SILENT);

      // Test Fearful AI (always confesses)
      const fearfulDecision = aiStrategyEngine.executeStrategy(
        AIStrategy.FEARFUL,
        gameHistory
      );
      expect(fearfulDecision).toBe(Decision.CONFESS);

      // Test Adaptive AI (mirrors last human decision)
      const adaptiveDecision = aiStrategyEngine.executeStrategy(
        AIStrategy.ADAPTIVE,
        gameHistory
      );
      expect(adaptiveDecision).toBe(Decision.CONFESS); // Should mirror human's confess
    });

    test('should handle empty game history', () => {
      const emptyHistory: any[] = [];

      // Loyal should still stay silent
      const loyalDecision = aiStrategyEngine.executeStrategy(
        AIStrategy.LOYAL,
        emptyHistory
      );
      expect(loyalDecision).toBe(Decision.STAY_SILENT);

      // Fearful should still confess
      const fearfulDecision = aiStrategyEngine.executeStrategy(
        AIStrategy.FEARFUL,
        emptyHistory
      );
      expect(fearfulDecision).toBe(Decision.CONFESS);

      // Adaptive should default to stay silent when no history
      const adaptiveDecision = aiStrategyEngine.executeStrategy(
        AIStrategy.ADAPTIVE,
        emptyHistory
      );
      expect(adaptiveDecision).toBe(Decision.STAY_SILENT);
    });
  });

  describe('Session Management Integration', () => {
    test('should create and manage game sessions', () => {
      const sessionConfig: SessionConfig = {
        maxRounds: 5,
        trustPhaseRounds: 3,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
      };

      const session = sessionManager.createSession(sessionConfig);
      expect(session).toBeDefined();
      expect(sessionManager.getCurrentPhase()).toBe(GamePhase.TRUST_PHASE);
    });

    test('should handle phase transitions', () => {
      const sessionConfig: SessionConfig = {
        maxRounds: 5,
        trustPhaseRounds: 0, // Set to 0 so we can advance immediately
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.MULTIPLAYER,
      };

      sessionManager.createSession(sessionConfig);
      expect(sessionManager.getCurrentPhase()).toBe(GamePhase.TRUST_PHASE);

      // Advance through phases
      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.COMMUNICATION_PHASE
      );
      expect(sessionManager.isCommunicationPhaseActive()).toBe(true);

      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.DECISION_REVERSAL_PHASE
      );
    });

    test('should handle communication messages', () => {
      const sessionConfig: SessionConfig = {
        maxRounds: 5,
        trustPhaseRounds: 0, // Set to 0 so we can advance immediately
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.MULTIPLAYER,
      };

      sessionManager.createSession(sessionConfig);
      sessionManager.advancePhase(); // Move to communication phase

      expect(sessionManager.isCommunicationPhaseActive()).toBe(true);

      // Send communication message
      const message = sessionManager.sendCommunicationMessage(
        'player1',
        'Trust' as any
      );
      expect(message).toBeDefined();
      expect(message.playerId).toBe('player1');
      expect(message.message).toBe('Trust');

      // Get communication messages
      const messages = sessionManager.getCommunicationMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toBe('Trust');
    });
  });

  describe('Database Integration', () => {
    test('should initialize database successfully', async () => {
      expect(database).toBeDefined();
      // Database is initialized in beforeAll, so it should be ready
    });

    test('should handle database operations', async () => {
      // Test basic database functionality - just verify it exists
      expect(database).toBeDefined();
      // Database operations are tested in individual service tests
    });
  });

  describe('Component Integration', () => {
    test('should integrate player manager with AI strategy engine', () => {
      const humanPlayer = playerManager.createPlayer('Human', false);
      const aiPlayer = playerManager.createPlayer('AI', true);

      expect(humanPlayer.isAI).toBe(false);
      expect(aiPlayer.isAI).toBe(true);

      // AI player should be able to use strategies
      const decision = aiStrategyEngine.executeStrategy(AIStrategy.LOYAL, []);
      expect(decision).toBe(Decision.STAY_SILENT);
    });

    test('should integrate session manager with player decisions', () => {
      const sessionConfig: SessionConfig = {
        maxRounds: 3,
        trustPhaseRounds: 2,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
      };

      const session = sessionManager.createSession(sessionConfig);
      expect(session).toBeDefined();

      // Simulate player decisions in different phases
      expect(sessionManager.getCurrentPhase()).toBe(GamePhase.TRUST_PHASE);

      // Move to communication phase
      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.COMMUNICATION_PHASE
      );

      // Send a message
      const message = sessionManager.sendCommunicationMessage(
        'player1',
        'Trust' as any
      );
      expect(message.message).toBe('Trust');

      // Move to decision reversal phase
      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.DECISION_REVERSAL_PHASE
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid AI strategy gracefully', () => {
      expect(() => {
        aiStrategyEngine.executeStrategy('INVALID_STRATEGY' as AIStrategy, []);
      }).toThrow();
    });

    test('should handle session manager errors', () => {
      // Try to send communication message without creating session
      expect(() => {
        sessionManager.sendCommunicationMessage('player1', 'Trust' as any);
      }).toThrow();
    });

    test('should handle player manager edge cases', () => {
      // Try to get non-existent player
      const nonExistentPlayer = playerManager.getPlayer('non-existent-id');
      expect(nonExistentPlayer).toBeNull();

      // Try to update trust score for non-existent player
      expect(() => {
        playerManager.updateTrustScore('non-existent-id', {} as any);
      }).toThrow();
    });
  });
});
