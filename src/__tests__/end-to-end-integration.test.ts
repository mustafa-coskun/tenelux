import { GameEngine } from '../services/GameEngine';
import { SessionManager } from '../services/SessionManager';
import { PlayerManager } from '../services/PlayerManager';
import { AIStrategyEngine } from '../services/AIStrategyEngine';
import { SinglePlayerManager } from '../services/SinglePlayerManager';
import { StatisticsEngine } from '../services/StatisticsEngine';
import {
  GameMode,
  Decision,
  AIStrategy,
  SessionConfig,
  GamePhase,
} from '../types';
import { DatabaseConnection } from '../database/DatabaseConnection';

describe('End-to-End Integration Tests', () => {
  let gameEngine: GameEngine;
  let sessionManager: SessionManager;
  let playerManager: PlayerManager;
  let aiStrategyEngine: AIStrategyEngine;
  let singlePlayerManager: SinglePlayerManager;
  let statisticsEngine: StatisticsEngine;
  let database: DatabaseConnection;

  beforeAll(async () => {
    database = DatabaseConnection.getInstance();
    await database.initialize();

    gameEngine = new GameEngine();
    sessionManager = new SessionManager();
    playerManager = new PlayerManager();
    aiStrategyEngine = new AIStrategyEngine();
    singlePlayerManager = new SinglePlayerManager();
    statisticsEngine = new StatisticsEngine();
  });

  afterAll(async () => {
    await database.close();
  });

  describe('Complete Single Player Game Flow', () => {
    test('should run complete single-player game with Loyal AI', async () => {
      // Create human player with unique name
      const humanPlayer = playerManager.createPlayer(
        `TestPlayer_${Date.now()}`,
        false
      );

      // Create single player session
      const session = singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.LOYAL,
        { maxRounds: 5, trustPhaseRounds: 3 }
      );

      expect(session).toBeDefined();
      expect(session.players).toHaveLength(2);
      expect(session.players[0].isAI).toBe(false);
      expect(session.players[1].isAI).toBe(true);

      // Set the current session in game engine
      gameEngine['currentSession'] = session;

      // Play through trust phase rounds
      for (let round = 1; round <= 3; round++) {
        const humanDecision =
          round % 2 === 0 ? Decision.CONFESS : Decision.STAY_SILENT;

        const humanPlayerDecision = {
          playerId: humanPlayer.id,
          decision: humanDecision,
          timestamp: new Date(),
          canReverse: true,
        };

        // Get AI decision and process round
        const decisions =
          singlePlayerManager.processRoundWithAI(humanPlayerDecision);
        expect(decisions).toHaveLength(2);
        expect(decisions[1].decision).toBe(Decision.STAY_SILENT); // Loyal AI

        // Process through game engine
        const roundResult = gameEngine.processRound(decisions);
        expect(roundResult).toBeDefined();

        // Add to session
        singlePlayerManager.addRoundToSession(roundResult.round);
      }

      // End session
      const sessionResult = gameEngine.endSession(session);
      expect(sessionResult).toBeDefined();
      expect(sessionResult.session.endTime).toBeDefined();

      // Calculate statistics
      const stats = statisticsEngine.calculateSessionStats(session);
      expect(stats).toBeDefined();
      expect(stats.cooperationPercentage).toBeGreaterThanOrEqual(0);
    });

    test('should handle all AI strategies correctly', () => {
      // Test each AI strategy with unique players
      const strategies = [
        AIStrategy.LOYAL,
        AIStrategy.ADAPTIVE,
        AIStrategy.FEARFUL,
      ];

      strategies.forEach((strategy, index) => {
        const humanPlayer = playerManager.createPlayer(
          `StrategyTestPlayer_${strategy}_${index}`,
          false
        );
        const session = singlePlayerManager.createSinglePlayerSession(
          humanPlayer,
          strategy,
          { maxRounds: 3, trustPhaseRounds: 2 }
        );

        expect(session).toBeDefined();
        expect(session.sessionConfig.aiStrategy).toBe(strategy);

        // Clean up
        singlePlayerManager.cleanup();
      });
    });
  });

  describe('Complete Multiplayer Game Flow', () => {
    test('should create and manage multiplayer session', () => {
      const player1 = playerManager.createPlayer(
        `Player1_${Date.now()}`,
        false
      );
      const player2 = playerManager.createPlayer(
        `Player2_${Date.now()}`,
        false
      );

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
      sessionManager.addPlayersToSession([player1, player2]);

      expect(session).toBeDefined();
      expect(session.players).toHaveLength(2);
      expect(session.players[0].isAI).toBe(false);
      expect(session.players[1].isAI).toBe(false);

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
    });
  });

  describe('System Integration Status', () => {
    test('should have all core services initialized', () => {
      expect(gameEngine).toBeDefined();
      expect(sessionManager).toBeDefined();
      expect(playerManager).toBeDefined();
      expect(aiStrategyEngine).toBeDefined();
      expect(singlePlayerManager).toBeDefined();
      expect(statisticsEngine).toBeDefined();
      expect(database).toBeDefined();
    });
  });

  describe('Individual System Integration', () => {
    test('should integrate game engine with session manager', () => {
      const player1 = playerManager.createPlayer('IntegrationPlayer1', false);
      const player2 = playerManager.createPlayer('IntegrationPlayer2', false);

      const session = gameEngine.startSession(
        [player1, player2],
        GameMode.MULTIPLAYER
      );

      const sessionConfig: SessionConfig = {
        maxRounds: 3,
        trustPhaseRounds: 2,
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

      // Add round to session manager
      sessionManager.addRoundToSession(roundResult.round);

      // Advance session manager phase
      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.COMMUNICATION_PHASE
      );
    });

    test('should integrate statistics engine with game results', () => {
      const player = playerManager.createPlayer('StatsPlayer', false);
      const session = singlePlayerManager.createSinglePlayerSession(
        player,
        AIStrategy.LOYAL,
        { maxRounds: 3, trustPhaseRounds: 2 }
      );

      // Add some rounds to the session
      const round1 = {
        roundNumber: 1,
        decisions: [
          {
            playerId: player.id,
            decision: Decision.STAY_SILENT,
            timestamp: new Date(),
            canReverse: true,
          },
        ],
        results: { playerA: 3, playerB: 3 },
        timestamp: new Date(),
        phaseType: GamePhase.TRUST_PHASE,
      };

      session.rounds.push(round1);

      // Calculate statistics
      const stats = statisticsEngine.calculateSessionStats(session);
      expect(stats).toBeDefined();
      expect(stats.cooperationPercentage).toBeGreaterThanOrEqual(0);
      expect(stats.betrayalPercentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle invalid AI strategy gracefully', () => {
      expect(() => {
        aiStrategyEngine.executeStrategy('INVALID_STRATEGY' as AIStrategy, []);
      }).toThrow();
    });

    test('should handle duplicate player names', () => {
      playerManager.createPlayer('DuplicatePlayer', false);

      expect(() => {
        playerManager.createPlayer('DuplicatePlayer', false);
      }).toThrow('Player with name "DuplicatePlayer" already exists');
    });

    test('should handle invalid game session operations', () => {
      // Try to process round with missing decisions
      expect(() => {
        gameEngine.processRound([
          {
            playerId: 'player1',
            decision: Decision.STAY_SILENT,
            timestamp: new Date(),
            canReverse: true,
          },
          // Missing second player decision
        ]);
      }).toThrow();
    });
  });

  describe('Performance and Concurrent Operations', () => {
    test('should handle multiple concurrent player creations', () => {
      const players = [];

      for (let i = 0; i < 10; i++) {
        const player = playerManager.createPlayer(
          `ConcurrentPlayer${i}`,
          false
        );
        players.push(player);
      }

      expect(players).toHaveLength(10);
      players.forEach((player, index) => {
        expect(player.name).toBe(`ConcurrentPlayer${index}`);
        expect(player.isAI).toBe(false);
      });
    });

    test('should handle rapid session creation and cleanup', () => {
      for (let i = 0; i < 5; i++) {
        const player = playerManager.createPlayer(`RapidPlayer${i}`, false);
        const session = singlePlayerManager.createSinglePlayerSession(
          player,
          AIStrategy.LOYAL,
          { maxRounds: 1, trustPhaseRounds: 1 }
        );

        expect(session).toBeDefined();

        // Clean up
        singlePlayerManager.cleanup();
      }
    });
  });

  describe('Data Persistence Integration', () => {
    test('should maintain player data consistency', () => {
      const player = playerManager.createPlayer('PersistentPlayer', false);
      const initialTrustScore = player.trustScore;

      // Create mock session result
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
              results: { playerA: 3, playerB: 3 },
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

      // Update trust score
      playerManager.updateTrustScore(player.id, mockSessionResult);

      const updatedPlayer = playerManager.getPlayer(player.id);
      expect(updatedPlayer).toBeDefined();
      expect(updatedPlayer!.totalGamesPlayed).toBe(1);
      expect(updatedPlayer!.trustScore).toBeGreaterThanOrEqual(
        initialTrustScore
      );
    });
  });
});
