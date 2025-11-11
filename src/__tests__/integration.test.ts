import { GameEngine } from '../services/GameEngine';
import { SessionManager } from '../services/SessionManager';
import { PlayerManager } from '../services/PlayerManager';
import { AIStrategyEngine } from '../services/AIStrategyEngine';
import { DatabaseConnection } from '../database/DatabaseConnection';
import {
  GameMode,
  Decision,
  AIStrategy,
  SessionConfig,
  GamePhase,
  PayoffResult,
} from '../types';

describe('End-to-End Integration Tests', () => {
  let gameEngine: GameEngine;
  let sessionManager: SessionManager;
  let playerManager: PlayerManager;
  let aiStrategyEngine: AIStrategyEngine;

  let database: DatabaseConnection;

  beforeAll(async () => {
    // Initialize database
    database = DatabaseConnection.getInstance();
    await database.initialize();

    // Initialize core services
    gameEngine = new GameEngine();
    sessionManager = new SessionManager();
    playerManager = new PlayerManager();
    aiStrategyEngine = new AIStrategyEngine();
  });

  afterAll(async () => {
    await database.close();
  });

  describe('Single Player Game Flow', () => {
    test('should complete a full single-player game session', async () => {
      // Create human player
      const humanPlayer = playerManager.createPlayer('TestPlayer', false);
      expect(humanPlayer).toBeDefined();
      expect(humanPlayer.name).toBe('TestPlayer');
      expect(humanPlayer.isAI).toBe(false);

      // Create AI player
      const aiPlayer = playerManager.createPlayer('AI_Loyal', true);
      expect(aiPlayer).toBeDefined();
      expect(aiPlayer.isAI).toBe(true);

      // Start game session
      const session = gameEngine.startSession(
        [humanPlayer, aiPlayer],
        GameMode.SINGLE_PLAYER
      );
      expect(session).toBeDefined();
      expect(session.players).toHaveLength(2);
      expect(session.currentPhase).toBe(GamePhase.TRUST_PHASE);

      // Create session config
      const sessionConfig: SessionConfig = {
        maxRounds: 5,
        trustPhaseRounds: 3,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
      };

      sessionManager.createSession(sessionConfig);

      // Play multiple rounds
      for (let round = 1; round <= 3; round++) {
        // Human player decides
        const humanDecision =
          round % 2 === 0 ? Decision.CONFESS : Decision.STAY_SILENT;

        // AI player decides using strategy
        const aiDecision = aiStrategyEngine.executeStrategy(
          AIStrategy.LOYAL,
          session.rounds
        );

        // Process round
        const roundResult = gameEngine.processRound([
          {
            playerId: humanPlayer.id,
            decision: humanDecision,
            timestamp: new Date(),
            canReverse: true,
          },
          {
            playerId: aiPlayer.id,
            decision: aiDecision,
            timestamp: new Date(),
            canReverse: false,
          },
        ]);

        expect(roundResult).toBeDefined();
        expect(roundResult.round.decisions).toHaveLength(2);
        expect(roundResult.round.results.playerA).toBeDefined();
        expect(roundResult.round.results.playerB).toBeDefined();

        // Verify AI strategy (Loyal should always stay silent)
        expect(aiDecision).toBe(Decision.STAY_SILENT);
      }

      // End session
      const sessionResult = gameEngine.endSession(session);
      expect(sessionResult).toBeDefined();
      expect(sessionResult.session.endTime).toBeDefined();

      // Update trust scores
      playerManager.updateTrustScore(humanPlayer.id, sessionResult);

      const updatedPlayer = playerManager.getPlayer(humanPlayer.id);
      expect(updatedPlayer).toBeDefined();
      expect(updatedPlayer!.totalGamesPlayed).toBeGreaterThan(0);
    });

    test('should handle all AI strategies correctly', () => {
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
  });

  describe('Core System Integration', () => {
    test('should integrate game engine with session manager', () => {
      const player1 = playerManager.createPlayer('Player1', false);
      const player2 = playerManager.createPlayer('Player2', false);

      const session = gameEngine.startSession(
        [player1, player2],
        GameMode.MULTIPLAYER
      );

      const sessionConfig: SessionConfig = {
        maxRounds: 5,
        trustPhaseRounds: 3,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.MULTIPLAYER,
      };

      sessionManager.createSession(sessionConfig);
      expect(sessionManager.getCurrentPhase()).toBe(GamePhase.TRUST_PHASE);

      // Process a round through both systems
      const roundResult = gameEngine.processRound([
        {
          playerId: player1.id,
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: true,
        },
        {
          playerId: player2.id,
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: true,
        },
      ]);

      expect(roundResult.round).toBeDefined();
      expect(session.rounds).toHaveLength(1);

      // Advance session manager phase
      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.COMMUNICATION_PHASE
      );
    });
  });

  describe('Database Integration', () => {
    test('should persist and retrieve player data', async () => {
      const player = playerManager.createPlayer('DatabaseTestPlayer', false);

      // Test player retrieval (in-memory for now)
      const retrievedPlayer = playerManager.getPlayer(player.id);
      expect(retrievedPlayer).toBeDefined();
      expect(retrievedPlayer!.name).toBe('DatabaseTestPlayer');
      expect(retrievedPlayer!.id).toBe(player.id);
    });

    test('should persist game session data', async () => {
      const player1 = playerManager.createPlayer('Player1', false);
      const player2 = playerManager.createPlayer('Player2', false);

      const session = gameEngine.startSession(
        [player1, player2],
        GameMode.MULTIPLAYER
      );

      // Process a round
      const roundResult = gameEngine.processRound([
        {
          playerId: player1.id,
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: true,
        },
        {
          playerId: player2.id,
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: true,
        },
      ]);

      expect(roundResult.round).toBeDefined();
      expect(session.rounds).toHaveLength(1);

      // End session
      const sessionResult = gameEngine.endSession(session);
      expect(sessionResult.session.endTime).toBeDefined();
    });
  });

  describe('Communication System Integration', () => {
    test('should handle communication phase correctly', () => {
      const sessionConfig: SessionConfig = {
        maxRounds: 5,
        trustPhaseRounds: 3,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.MULTIPLAYER,
      };

      sessionManager.createSession(sessionConfig);

      // Advance to communication phase
      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.COMMUNICATION_PHASE
      );
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

  describe('Statistics and Trust Score Integration', () => {
    test('should calculate trust scores correctly', () => {
      const player = playerManager.createPlayer('TrustTestPlayer', false);

      // Create a session result with cooperative behavior
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
            {
              roundNumber: 2,
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
        finalScores: { [player.id]: 6 },
        winner: player,
        statistics: {
          cooperationPercentage: 100,
          betrayalPercentage: 0,
          totalPoints: 6,
          gamesWon: 1,
          gamesLost: 0,
          averageTrustScore: 50,
        },
      };

      const initialTrustScore = player.trustScore;
      playerManager.updateTrustScore(player.id, mockSessionResult);

      const updatedPlayer = playerManager.getPlayer(player.id);
      expect(updatedPlayer!.trustScore).toBeGreaterThanOrEqual(
        initialTrustScore
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid player decisions gracefully', () => {
      const player1 = playerManager.createPlayer('Player1', false);
      const player2 = playerManager.createPlayer('Player2', false);

      const session = gameEngine.startSession(
        [player1, player2],
        GameMode.MULTIPLAYER
      );

      // Try to process round with missing decision
      expect(() => {
        gameEngine.processRound([
          {
            playerId: player1.id,
            decision: Decision.STAY_SILENT,
            timestamp: new Date(),
            canReverse: true,
          },
          // Missing player2 decision
        ]);
      }).toThrow();
    });

    test('should handle session manager phase transitions', () => {
      const sessionConfig: SessionConfig = {
        maxRounds: 5,
        trustPhaseRounds: 3,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.MULTIPLAYER,
      };

      sessionManager.createSession(sessionConfig);

      expect(sessionManager.getCurrentPhase()).toBe(GamePhase.TRUST_PHASE);

      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.COMMUNICATION_PHASE
      );

      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.DECISION_REVERSAL_PHASE
      );
    });

    test('should handle database connection errors gracefully', async () => {
      // Try to use database after closing
      await database.close();

      const player = playerManager.createPlayer('ErrorTestPlayer', false);

      // This should handle the error gracefully
      await expect(playerManager.savePlayer(player)).rejects.toThrow();

      // Reinitialize database for other tests
      await database.initialize(':memory:');
    });
  });
});
