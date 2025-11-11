import { GameEngine } from './GameEngine';
import { SessionManager } from './SessionManager';
import { PlayerManager } from './PlayerManager';
import { AIStrategyEngine } from './AIStrategyEngine';
import { SinglePlayerManager } from './SinglePlayerManager';
import { MultiplayerSyncService } from './MultiplayerSyncService';
import { StatisticsEngine } from './StatisticsEngine';
import { DatabaseConnection } from '../database/DatabaseConnection';
import {
  GameMode,
  Decision,
  AIStrategy,
  SessionConfig,
  GamePhase,
  GameSession,
  SessionResult,
  PlayerDecision,
  Round,
} from '../types';

/**
 * IntegrationService - Orchestrates all game systems for end-to-end functionality
 * This service ensures all components work together seamlessly
 */
export class IntegrationService {
  private gameEngine: GameEngine;
  private sessionManager: SessionManager;
  private playerManager: PlayerManager;
  private aiStrategyEngine: AIStrategyEngine;
  private singlePlayerManager: SinglePlayerManager;
  private multiplayerSyncService: MultiplayerSyncService | null = null;
  private statisticsEngine: StatisticsEngine;
  private database: DatabaseConnection;

  constructor() {
    this.gameEngine = new GameEngine();
    this.sessionManager = new SessionManager();
    this.playerManager = new PlayerManager();
    this.aiStrategyEngine = new AIStrategyEngine();
    this.singlePlayerManager = new SinglePlayerManager();
    this.statisticsEngine = new StatisticsEngine();
    this.database = DatabaseConnection.getInstance();
  }

  /**
   * Initialize all systems and ensure they're properly connected
   */
  async initialize(): Promise<void> {
    try {
      // Initialize database
      await this.database.initialize();

      // Initialize multiplayer service for multiplayer games
      this.multiplayerSyncService = new MultiplayerSyncService({
        port: 8080,
        enableHeartbeat: true,
        heartbeatInterval: 30000,
        connectionTimeout: 60000,
      });

      console.log('Integration service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize integration service:', error);
      throw error;
    }
  }

  /**
   * Start a complete single-player game session
   */
  async startSinglePlayerGame(
    humanPlayerName: string,
    aiStrategy: AIStrategy = AIStrategy.ADAPTIVE,
    sessionConfig?: Partial<SessionConfig>
  ): Promise<GameSession> {
    try {
      // Create players
      const humanPlayer = this.playerManager.createPlayer(
        humanPlayerName,
        false
      );
      const aiPlayer = this.playerManager.createPlayer(
        `AI_${aiStrategy}`,
        true
      );

      // Create session config
      const config: SessionConfig = {
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
        aiStrategy,
        ...sessionConfig,
      };

      // Start game session
      const session = this.gameEngine.startSession(
        [humanPlayer, aiPlayer],
        GameMode.SINGLE_PLAYER
      );

      // Initialize session manager
      this.sessionManager.createSession(config);
      this.sessionManager.addPlayersToSession([humanPlayer, aiPlayer]);

      // Initialize single player manager
      this.singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        aiStrategy,
        config
      );

      return session;
    } catch (error) {
      console.error('Failed to start single-player game:', error);
      throw error;
    }
  }

  /**
   * Start a complete multiplayer game session
   */
  async startMultiplayerGame(
    player1Name: string,
    player2Name: string,
    sessionConfig?: Partial<SessionConfig>
  ): Promise<GameSession> {
    try {
      // Create players
      const player1 = this.playerManager.createPlayer(player1Name, false);
      const player2 = this.playerManager.createPlayer(player2Name, false);

      // Create session config
      const config: SessionConfig = {
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.MULTIPLAYER,
        ...sessionConfig,
      };

      // Start game session
      const session = this.gameEngine.startSession(
        [player1, player2],
        GameMode.MULTIPLAYER
      );

      // Initialize session manager
      this.sessionManager.createSession(config);
      this.sessionManager.addPlayersToSession([player1, player2]);

      // Start multiplayer sync service if not already running
      if (
        this.multiplayerSyncService &&
        !this.multiplayerSyncService.getServiceStats().isRunning
      ) {
        await this.multiplayerSyncService.start(8080);
      }

      return session;
    } catch (error) {
      console.error('Failed to start multiplayer game:', error);
      throw error;
    }
  }

  /**
   * Process a complete game round with all systems integration
   */
  async processGameRound(
    session: GameSession,
    humanDecision: Decision,
    aiDecision?: Decision
  ): Promise<Round> {
    try {
      const decisions: PlayerDecision[] = [];

      // Add human player decision
      decisions.push({
        playerId: session.players[0].id,
        decision: humanDecision,
        timestamp: new Date(),
        canReverse:
          this.sessionManager.getCurrentSession()?.sessionConfig
            .allowDecisionReversal || false,
      });

      // Add AI decision for single-player or second player decision for multiplayer
      if (session.sessionConfig.gameMode === GameMode.SINGLE_PLAYER) {
        const aiPlayerDecision =
          aiDecision ||
          this.aiStrategyEngine.executeStrategy(
            session.sessionConfig.aiStrategy || AIStrategy.ADAPTIVE,
            session.rounds
          );

        decisions.push({
          playerId: session.players[1].id,
          decision: aiPlayerDecision,
          timestamp: new Date(),
          canReverse: false, // AI decisions typically can't be reversed
        });
      } else if (aiDecision) {
        // For multiplayer, the second decision is from another human player
        decisions.push({
          playerId: session.players[1].id,
          decision: aiDecision,
          timestamp: new Date(),
          canReverse:
            this.sessionManager.getCurrentSession()?.sessionConfig
              .allowDecisionReversal || false,
        });
      }

      // Validate decisions
      if (!this.sessionManager.validateDecisions(decisions)) {
        throw new Error('Invalid decisions provided');
      }

      // Process round through game engine
      const roundResult = this.gameEngine.processRound(decisions);

      // Add round to session manager
      this.sessionManager.addRoundToSession(roundResult.round);

      // Update single player manager if applicable
      if (session.sessionConfig.gameMode === GameMode.SINGLE_PLAYER) {
        this.singlePlayerManager.addRoundToSession(roundResult.round);
      }

      return roundResult.round;
    } catch (error) {
      console.error('Failed to process game round:', error);
      throw error;
    }
  }

  /**
   * Handle communication phase with full integration
   */
  async handleCommunicationPhase(session: GameSession): Promise<void> {
    try {
      // Advance to communication phase if not already there
      if (
        this.sessionManager.getCurrentPhase() !== GamePhase.COMMUNICATION_PHASE
      ) {
        this.sessionManager.advancePhase();
      }

      // For multiplayer games, sync communication through multiplayer service
      if (
        session.sessionConfig.gameMode === GameMode.MULTIPLAYER &&
        this.multiplayerSyncService
      ) {
        // Set up communication sync
        // Sync messages through multiplayer service
        // This would be implemented based on the specific multiplayer architecture
      }

      console.log('Communication phase started');
    } catch (error) {
      console.error('Failed to handle communication phase:', error);
      throw error;
    }
  }

  /**
   * Complete a game session with full statistics and cleanup
   */
  async completeGameSession(session: GameSession): Promise<SessionResult> {
    try {
      // End the session through game engine
      const sessionResult = this.gameEngine.endSession(session);

      // Calculate comprehensive statistics
      const enhancedStats =
        this.statisticsEngine.calculateSessionStats(session);
      sessionResult.statistics = enhancedStats;

      // Update player trust scores and statistics
      for (const player of session.players) {
        this.playerManager.updateTrustScore(player.id, sessionResult);
        this.statisticsEngine.updateHistoricalStats(player.id, sessionResult);
      }

      // Clean up session manager
      this.sessionManager.cleanup();

      // Clean up single player manager if applicable
      if (session.sessionConfig.gameMode === GameMode.SINGLE_PLAYER) {
        this.singlePlayerManager.cleanup();
      }

      console.log('Game session completed successfully');
      return sessionResult;
    } catch (error) {
      console.error('Failed to complete game session:', error);
      throw error;
    }
  }

  /**
   * Run a complete end-to-end game flow for testing
   */
  async runCompleteGameFlow(
    gameMode: GameMode,
    player1Name: string,
    player2Name?: string,
    aiStrategy: AIStrategy = AIStrategy.ADAPTIVE
  ): Promise<SessionResult> {
    try {
      let session: GameSession;

      // Start appropriate game type
      if (gameMode === GameMode.SINGLE_PLAYER) {
        session = await this.startSinglePlayerGame(player1Name, aiStrategy);
      } else {
        if (!player2Name) {
          throw new Error('Player 2 name required for multiplayer game');
        }
        session = await this.startMultiplayerGame(player1Name, player2Name);
      }

      // Play through trust phase rounds
      const trustPhaseRounds = session.sessionConfig.trustPhaseRounds;
      for (let round = 1; round <= trustPhaseRounds; round++) {
        // Simulate decisions (in real game, these would come from UI)
        const humanDecision =
          round % 2 === 0 ? Decision.CONFESS : Decision.STAY_SILENT;
        const secondDecision =
          gameMode === GameMode.SINGLE_PLAYER
            ? undefined // AI will decide automatically
            : round % 3 === 0
              ? Decision.CONFESS
              : Decision.STAY_SILENT;

        await this.processGameRound(session, humanDecision, secondDecision);
      }

      // Handle communication phase
      await this.handleCommunicationPhase(session);

      // Simulate communication phase timeout
      setTimeout(() => {
        this.sessionManager.advancePhase(); // Move to decision reversal phase
      }, 1000);

      // Wait for communication phase to complete
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Complete the session
      const result = await this.completeGameSession(session);

      return result;
    } catch (error) {
      console.error('Failed to run complete game flow:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus(): {
    database: boolean;
    multiplayer: boolean;
    activeSession: boolean;
    services: string[];
  } {
    return {
      database: this.database !== null,
      multiplayer:
        this.multiplayerSyncService?.getServiceStats().isRunning || false,
      activeSession: this.sessionManager.getCurrentSession() !== null,
      services: [
        'GameEngine',
        'SessionManager',
        'PlayerManager',
        'AIStrategyEngine',
        'SinglePlayerManager',
        'StatisticsEngine',
        ...(this.multiplayerSyncService ? ['MultiplayerSyncService'] : []),
      ],
    };
  }

  /**
   * Cleanup all systems
   */
  async cleanup(): Promise<void> {
    try {
      // Stop multiplayer service
      if (this.multiplayerSyncService) {
        await this.multiplayerSyncService.stop();
      }

      // Cleanup session manager
      this.sessionManager.cleanup();

      // Cleanup single player manager
      this.singlePlayerManager.cleanup();

      // Close database
      await this.database.close();

      console.log('Integration service cleaned up successfully');
    } catch (error) {
      console.error('Failed to cleanup integration service:', error);
      throw error;
    }
  }
}
