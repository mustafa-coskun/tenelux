import {
  GameSession,
  Player,
  AIStrategy,
  SessionConfig,
  GameMode,
  PlayerDecision,
  Decision,
  Round,
} from '../types';
import { SessionManager } from './SessionManager';
import { AIStrategyEngine } from './AIStrategyEngine';
import { PlayerManager } from './PlayerManager';

export class SinglePlayerManager {
  private sessionManager: SessionManager;
  private aiStrategyEngine: AIStrategyEngine;
  private playerManager: PlayerManager;
  private currentAIStrategy: AIStrategy | null = null;
  private aiPlayer: Player | null = null;

  constructor() {
    this.sessionManager = new SessionManager();
    this.aiStrategyEngine = new AIStrategyEngine();
    this.playerManager = new PlayerManager();
  }

  /**
   * Create a new single-player game session with AI opponent
   */
  createSinglePlayerSession(
    humanPlayer: Player,
    aiStrategy: AIStrategy,
    config?: Partial<SessionConfig>
  ): GameSession {
    // Create AI player with anonymous name
    const anonymousNames = ['Agent', 'Subject', 'Entity', 'Unit', 'Player'];
    const randomNumber = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
    const randomName =
      anonymousNames[Math.floor(Math.random() * anonymousNames.length)];
    this.aiPlayer = this.playerManager.createPlayer(
      `${randomName}-${randomNumber}`,
      true
    );
    this.currentAIStrategy = aiStrategy;

    // Create session configuration
    const sessionConfig: SessionConfig = {
      maxRounds: 10,
      trustPhaseRounds: 5,
      communicationTimeLimit: 60,
      allowDecisionReversal: true,
      gameMode: GameMode.SINGLE_PLAYER,
      aiStrategy: aiStrategy,
      ...config,
    };

    // Create the session
    const session = this.sessionManager.createSession(sessionConfig);

    // Add players to the session
    this.sessionManager.addPlayersToSession([humanPlayer, this.aiPlayer]);

    return session;
  }

  /**
   * Get available AI strategies
   */
  getAvailableAIStrategies(): AIStrategy[] {
    return this.aiStrategyEngine.getAvailableStrategies();
  }

  /**
   * Get AI strategy information
   */
  getAIStrategyInfo(strategy: AIStrategy): {
    name: string;
    description: string;
  } {
    const availableStrategies = this.aiStrategyEngine.getAvailableStrategies();
    if (!availableStrategies.includes(strategy)) {
      throw new Error(`Unknown AI strategy: ${strategy}`);
    }

    // Get strategy info from AIStrategyFactory
    const { AIStrategyFactory } = require('./AIStrategyEngine');
    return AIStrategyFactory.getStrategyInfo(strategy);
  }

  /**
   * Process a round with human decision and AI decision
   */
  processRoundWithAI(humanDecision: PlayerDecision): PlayerDecision[] {
    if (!this.currentAIStrategy || !this.aiPlayer) {
      throw new Error('No AI strategy or AI player configured');
    }

    const currentSession = this.sessionManager.getCurrentSession();
    if (!currentSession) {
      throw new Error('No active session');
    }

    // Get AI decision based on strategy and round history
    const roundHistory = this.sessionManager.getRoundHistory();
    const aiDecision = this.aiStrategyEngine.executeStrategy(
      this.currentAIStrategy,
      roundHistory
    );

    // Create AI player decision
    const aiPlayerDecision: PlayerDecision = {
      playerId: this.aiPlayer.id,
      decision: aiDecision,
      timestamp: new Date(),
      canReverse: false, // AI decisions typically can't be reversed
    };

    return [humanDecision, aiPlayerDecision];
  }

  /**
   * Get the current session
   */
  getCurrentSession(): GameSession | null {
    return this.sessionManager.getCurrentSession();
  }

  /**
   * Get the AI player for the current session
   */
  getAIPlayer(): Player | null {
    return this.aiPlayer;
  }

  /**
   * Get the current AI strategy
   */
  getCurrentAIStrategy(): AIStrategy | null {
    return this.currentAIStrategy;
  }

  /**
   * End the current single-player session
   */
  endSession(): void {
    this.sessionManager.endSession();
    this.currentAIStrategy = null;
    this.aiPlayer = null;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.sessionManager.cleanup();
    this.currentAIStrategy = null;
    this.aiPlayer = null;
  }

  // Delegate methods to SessionManager for common operations

  getCurrentPhase() {
    return this.sessionManager.getCurrentPhase();
  }

  advancePhase() {
    return this.sessionManager.advancePhase();
  }

  addRoundToSession(round: Round) {
    return this.sessionManager.addRoundToSession(round);
  }

  createNewRound() {
    return this.sessionManager.createNewRound();
  }

  addDecisionToRound(round: Round, decision: PlayerDecision) {
    return this.sessionManager.addDecisionToRound(round, decision);
  }

  isRoundComplete(round: Round) {
    return this.sessionManager.isRoundComplete(round);
  }

  setRoundResults(round: Round, results: any) {
    return this.sessionManager.setRoundResults(round, results);
  }

  sendCommunicationMessage(playerId: string, message: any) {
    return this.sessionManager.sendCommunicationMessage(playerId, message);
  }

  getCommunicationMessages() {
    return this.sessionManager.getCommunicationMessages();
  }

  getCommunicationTimeRemaining() {
    return this.sessionManager.getCommunicationTimeRemaining();
  }

  isCommunicationPhaseActive() {
    return this.sessionManager.isCommunicationPhaseActive();
  }

  getPredefinedMessages() {
    return this.sessionManager.getPredefinedMessages();
  }
}
