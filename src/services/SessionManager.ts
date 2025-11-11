import {
  SessionManager as ISessionManager,
  SessionConfig,
  GameSession,
  GamePhase,
  PlayerDecision,
  Player,
  Round,
  CommunicationMessage,
  PredefinedMessage,
} from '../types';
import { RoundManager } from './RoundManager';
import { CommunicationManager } from './CommunicationManager';

// SessionManager implementation for handling game session lifecycle
export class SessionManager implements ISessionManager {
  private currentSession: GameSession | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private phaseStartTime: Date | null = null;
  private roundManager: RoundManager = new RoundManager();
  private communicationManager: CommunicationManager =
    new CommunicationManager();

  createSession(config: SessionConfig): GameSession {
    const sessionId = this.generateSessionId();

    const session: GameSession = {
      id: sessionId,
      players: [], // Players will be added separately
      rounds: [],
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig: config,
    };

    this.currentSession = session;
    this.phaseStartTime = new Date();

    // Set up phase timer for communication phase
    this.setupPhaseTimer();

    return session;
  }

  getCurrentPhase(): GamePhase {
    if (!this.currentSession) {
      throw new Error('No active session');
    }
    return this.currentSession.currentPhase;
  }

  advancePhase(): void {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const currentPhase = this.currentSession.currentPhase;

    switch (currentPhase) {
      case GamePhase.TRUST_PHASE:
        // Check if trust phase is complete (5 rounds)
        if (
          this.currentSession.rounds.length >=
          this.currentSession.sessionConfig.trustPhaseRounds
        ) {
          this.currentSession.currentPhase = GamePhase.COMMUNICATION_PHASE;
          this.phaseStartTime = new Date();
          this.startCommunicationPhase();
          this.setupPhaseTimer();
        }
        break;

      case GamePhase.COMMUNICATION_PHASE:
        this.communicationManager.stopCommunicationPhase();
        this.currentSession.currentPhase = GamePhase.DECISION_REVERSAL_PHASE;
        this.phaseStartTime = new Date();
        this.clearPhaseTimer();
        break;

      case GamePhase.DECISION_REVERSAL_PHASE:
        // Session ends after decision reversal phase
        this.endSession();
        break;

      default:
        throw new Error(`Unknown phase: ${currentPhase}`);
    }
  }

  handlePhaseTimeout(): void {
    if (!this.currentSession) {
      return;
    }

    // Only communication phase has a timeout
    if (this.currentSession.currentPhase === GamePhase.COMMUNICATION_PHASE) {
      this.advancePhase();
    }
  }

  validateDecisions(decisions: PlayerDecision[]): boolean {
    if (!this.currentSession) {
      return false;
    }

    // Must have exactly 2 decisions (one per player)
    if (decisions.length !== 2) {
      return false;
    }

    // Check that decisions are from valid players
    const playerIds = this.currentSession.players.map((p) => p.id);
    const decisionPlayerIds = decisions.map((d) => d.playerId);

    return (
      decisionPlayerIds.every((id) => playerIds.includes(id)) &&
      decisionPlayerIds.length === new Set(decisionPlayerIds).size
    ); // No duplicate players
  }

  // Additional methods for session lifecycle management

  addPlayersToSession(players: Player[]): void {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    if (players.length !== 2) {
      throw new Error('Session requires exactly 2 players');
    }

    this.currentSession.players = players;
  }

  addRoundToSession(round: Round): void {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    // Validate round before adding
    if (!this.roundManager.validateRound(round)) {
      throw new Error('Invalid round data');
    }

    this.currentSession.rounds.push(round);
    this.roundManager.addToHistory(round);

    // Check if we should advance phase after trust phase rounds
    if (
      this.currentSession.currentPhase === GamePhase.TRUST_PHASE &&
      this.currentSession.rounds.length >=
        this.currentSession.sessionConfig.trustPhaseRounds
    ) {
      this.advancePhase();
    }
  }

  getCurrentSession(): GameSession | null {
    return this.currentSession;
  }

  endSession(): void {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.endTime = new Date();
    this.clearPhaseTimer();

    // Determine winner based on total scores
    const finalScores = this.calculateFinalScores();
    const scoreEntries = Object.entries(finalScores);
    
    console.log('🏆 Final scores for winner determination:', finalScores);
    
    // Check for tie
    const maxScore = Math.max(...Object.values(finalScores));
    const winnersWithMaxScore = scoreEntries.filter(([_, score]) => score === maxScore);
    
    console.log('🏆 Max score:', maxScore);
    console.log('🏆 Winners with max score:', winnersWithMaxScore);
    
    // If more than one player has the max score, it's a tie
    if (winnersWithMaxScore.length > 1) {
      console.log('🏆 TIE DETECTED - Setting winner to null');
      this.currentSession.winner = null; // Tie game
    } else {
      // Single winner
      const winnerEntry = winnersWithMaxScore[0];
      const winner = this.currentSession.players.find(
        (p) => p.id === winnerEntry[0]
      );
      console.log('🏆 WINNER DETECTED:', winner?.name, 'with score:', winnerEntry[1]);
      this.currentSession.winner = winner;
    }
  }

  cleanup(): void {
    this.clearPhaseTimer();
    this.communicationManager.reset();
    this.currentSession = null;
    this.phaseStartTime = null;
    this.roundManager.clearHistory();
  }

  // Round management methods

  createNewRound(): Round {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const roundNumber = this.currentSession.rounds.length + 1;
    return this.roundManager.createRound(
      roundNumber,
      this.currentSession.currentPhase
    );
  }

  addDecisionToRound(round: Round, decision: PlayerDecision): void {
    this.roundManager.addDecision(round, decision);
  }

  isRoundComplete(round: Round): boolean {
    return this.roundManager.isRoundComplete(
      round,
      this.currentSession?.players.length || 2
    );
  }

  setRoundResults(round: Round, results: any): void {
    this.roundManager.setRoundResults(round, results);
  }

  getRoundHistory(): Round[] {
    return this.roundManager.getRoundHistory();
  }

  // Decision reversal methods

  canReverseDecision(round: Round, playerId: string): boolean {
    if (!this.currentSession) {
      return false;
    }
    return this.roundManager.canReverseDecision(
      round,
      playerId,
      this.currentSession.currentPhase
    );
  }

  reverseDecision(round: Round, playerId: string, newDecision: any): boolean {
    return this.roundManager.reverseDecision(round, playerId, newDecision);
  }

  enableDecisionReversalForRound(round: Round): void {
    if (this.currentSession?.sessionConfig.allowDecisionReversal) {
      this.roundManager.enableAllDecisionReversals(round);
    }
  }

  getPlayerDecision(
    round: Round,
    playerId: string
  ): PlayerDecision | undefined {
    return this.roundManager.getPlayerDecision(round, playerId);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupPhaseTimer(): void {
    this.clearPhaseTimer();

    if (this.currentSession?.currentPhase === GamePhase.COMMUNICATION_PHASE) {
      const timeoutMs =
        this.currentSession.sessionConfig.communicationTimeLimit * 1000;
      this.phaseTimer = setTimeout(() => {
        this.handlePhaseTimeout();
      }, timeoutMs);
    }
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private calculateFinalScores(): { [playerId: string]: number } {
    if (!this.currentSession) {
      return {};
    }

    const scores: { [playerId: string]: number } = {};

    // Initialize scores
    this.currentSession.players.forEach((player) => {
      scores[player.id] = 0;
    });

    // Sum up scores from all rounds
    this.currentSession.rounds.forEach((round) => {
      if (round.results) {
        const [playerA, playerB] = this.currentSession!.players;
        scores[playerA.id] += round.results.playerA;
        scores[playerB.id] += round.results.playerB;
      }
    });

    return scores;
  }

  // Communication phase methods

  private startCommunicationPhase(): void {
    this.communicationManager.startCommunicationPhase(
      () => this.handlePhaseTimeout(),
      (message) => this.handleMessageReceived(message)
    );
  }

  sendCommunicationMessage(
    playerId: string,
    message: PredefinedMessage
  ): CommunicationMessage {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    // Validate that the player is part of the current session
    const isValidPlayer = this.currentSession.players.some(
      (p) => p.id === playerId
    );
    if (!isValidPlayer) {
      throw new Error('Player is not part of the current session');
    }

    return this.communicationManager.sendMessage(playerId, message);
  }

  getCommunicationMessages(): CommunicationMessage[] {
    return this.communicationManager.getMessages();
  }

  getCommunicationTimeRemaining(): number {
    return this.communicationManager.getTimeRemaining();
  }

  isCommunicationPhaseActive(): boolean {
    return this.communicationManager.isPhaseActive();
  }

  getPredefinedMessages(): PredefinedMessage[] {
    return this.communicationManager.getPredefinedMessages();
  }

  private handleMessageReceived(message: CommunicationMessage): void {
    // This can be extended to notify UI components or other systems
    // For now, messages are stored in the communication manager
  }
}
