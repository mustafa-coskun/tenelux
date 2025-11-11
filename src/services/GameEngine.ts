import {
  GameEngine as IGameEngine,
  Player,
  GameMode,
  GameSession,
  PlayerDecision,
  RoundResult,
  Decision,
  PayoffResult,
  SessionResult,
  Round,
  GamePhase,
} from '../types';
import { PAYOFF_MATRIX } from '../utils/constants';
import { isValidDecisionCombination } from '../utils/payoffUtils';
import {
  SecurityValidationService,
  DecisionValidationContext,
} from './SecurityValidationService';
import { SessionIntegrityService } from './SessionIntegrityService';

// GameEngine implementation - to be completed in task 2
export class GameEngine implements IGameEngine {
  private currentSession: GameSession | null = null;
  private securityValidator: SecurityValidationService;
  private integrityService: SessionIntegrityService;

  constructor() {
    this.securityValidator = new SecurityValidationService();
    this.integrityService = new SessionIntegrityService();
  }

  startSession(players: Player[], mode: GameMode): GameSession {
    if (players.length !== 2) {
      throw new Error('Game session requires exactly 2 players');
    }

    const sessionId = this.generateSessionId();
    const session: GameSession = {
      id: sessionId,
      players: [...players],
      rounds: [],
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig: {
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: mode,
      },
    };

    this.currentSession = session;
    return session;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  processRound(decisions: PlayerDecision[]): RoundResult {
    if (!this.currentSession) {
      throw new Error('No active game session');
    }

    // Validate decisions with security checks
    this.validateDecisions(decisions);

    // Ensure we have exactly 2 decisions
    if (decisions.length !== 2) {
      throw new Error('Round requires exactly 2 player decisions');
    }

    // Sort decisions to ensure consistent ordering (playerA, playerB)
    const sortedDecisions = this.sortDecisionsByPlayerId(decisions);
    const [decisionA, decisionB] = sortedDecisions;

    // Create decision hashes for integrity protection
    const roundNumber = this.currentSession.rounds.length + 1;

    // Calculate payoffs
    const payoffResult = this.calculatePayoffs(
      decisionA.decision,
      decisionB.decision
    );

    // Create round object
    const round: Round = {
      roundNumber,
      decisions: sortedDecisions,
      results: payoffResult,
      timestamp: new Date(),
      phaseType: this.currentSession.currentPhase,
    };

    // Add round to session
    this.currentSession.rounds.push(round);

    // Basic integrity check
    if (!this.currentSession || !this.currentSession.players) {
      throw new Error('Invalid game state detected');
    }

    // Check if game should end
    const gameEnded = this.shouldEndGame();
    let winner: Player | undefined;

    if (gameEnded) {
      winner = this.determineWinner();
      this.currentSession.endTime = new Date();
      this.currentSession.winner = winner;

      // Final integrity check
      if (!this.currentSession || this.currentSession.rounds.length === 0) {
        throw new Error('Invalid final game state');
      }
    }

    return {
      round,
      gameEnded,
      winner,
    };
  }

  calculatePayoffs(playerA: Decision, playerB: Decision): PayoffResult {
    const key = `${playerA},${playerB}`;
    const payoff = PAYOFF_MATRIX[key];

    if (!payoff) {
      throw new Error(`Invalid decision combination: ${playerA}, ${playerB}`);
    }

    return payoff;
  }

  endSession(session: GameSession): SessionResult {
    throw new Error('Method not implemented - will be completed in task 2');
  }

  /**
   * Validate player decisions for a round with comprehensive security checks
   */
  private validateDecisions(decisions: PlayerDecision[]): void {
    if (!decisions || decisions.length === 0) {
      throw new Error('No decisions provided');
    }

    if (decisions.length !== 2) {
      throw new Error('Round requires exactly 2 player decisions');
    }

    if (!this.currentSession) {
      throw new Error('No active session for validation');
    }

    // Get all previous decisions for context
    const previousDecisions = this.currentSession.rounds.flatMap(
      (round) => round.decisions
    );
    const currentRoundNumber = this.currentSession.rounds.length + 1;

    // Validate each decision with comprehensive security checks
    for (const decision of decisions) {
      const player = this.currentSession.players.find(
        (p) => p.id === decision.playerId
      );
      if (!player) {
        throw new Error(
          `Player ${decision.playerId} is not part of the current session`
        );
      }

      const validationContext: DecisionValidationContext = {
        session: this.currentSession,
        player: player,
        roundNumber: currentRoundNumber,
        previousDecisions: previousDecisions,
      };

      const validationResult = this.securityValidator.validatePlayerDecision(
        decision,
        validationContext
      );
      if (!validationResult.isValid) {
        throw new Error(
          `Security validation failed: ${validationResult.errorMessage} (${validationResult.errorCode})`
        );
      }
    }

    // Check for duplicate player IDs
    const playerIds = decisions.map((d) => d.playerId);
    const uniquePlayerIds = new Set(playerIds);
    if (uniquePlayerIds.size !== playerIds.length) {
      throw new Error('Duplicate player decisions detected');
    }

    // Validate decision combination
    const [decisionA, decisionB] = this.sortDecisionsByPlayerId(decisions);
    if (!isValidDecisionCombination(decisionA.decision, decisionB.decision)) {
      throw new Error(
        `Invalid decision combination: ${decisionA.decision}, ${decisionB.decision}`
      );
    }
  }

  /**
   * Sort decisions by player ID to ensure consistent ordering
   */
  private sortDecisionsByPlayerId(
    decisions: PlayerDecision[]
  ): [PlayerDecision, PlayerDecision] {
    if (decisions.length !== 2) {
      throw new Error('Expected exactly 2 decisions');
    }

    // Sort by player ID to ensure consistent ordering
    const sorted = [...decisions].sort((a, b) =>
      a.playerId.localeCompare(b.playerId)
    );
    return [sorted[0], sorted[1]];
  }

  /**
   * Determine if the game should end based on current session state
   */
  private shouldEndGame(): boolean {
    if (!this.currentSession) {
      return false;
    }

    const config = this.currentSession.sessionConfig;
    const currentRounds = this.currentSession.rounds.length;

    // End if we've reached the maximum number of rounds
    return currentRounds >= config.maxRounds;
  }

  /**
   * Determine the winner based on total points scored
   */
  private determineWinner(): Player | undefined {
    if (!this.currentSession || this.currentSession.rounds.length === 0) {
      return undefined;
    }

    const playerScores = new Map<string, number>();

    // Initialize scores
    for (const player of this.currentSession.players) {
      playerScores.set(player.id, 0);
    }

    // Calculate total scores
    for (const round of this.currentSession.rounds) {
      const [decisionA, decisionB] = round.decisions;
      const payoff = round.results;

      playerScores.set(
        decisionA.playerId,
        (playerScores.get(decisionA.playerId) || 0) + payoff.playerA
      );
      playerScores.set(
        decisionB.playerId,
        (playerScores.get(decisionB.playerId) || 0) + payoff.playerB
      );
    }

    // Find the player with the highest score
    let maxScore = -1;
    let winner: Player | undefined;

    playerScores.forEach((score, playerId) => {
      if (score > maxScore) {
        maxScore = score;
        winner = this.currentSession!.players.find((p) => p.id === playerId);
      }
    });

    return winner;
  }

  /**
   * Set the current session (used for testing and session management)
   */
  public setCurrentSession(session: GameSession): void {
    this.currentSession = session;
  }

  /**
   * Get the current session
   */
  public getCurrentSession(): GameSession | null {
    return this.currentSession;
  }

  /**
   * Get the security validator instance
   */
  public getSecurityValidator(): SecurityValidationService {
    return this.securityValidator;
  }

  /**
   * Get the session integrity service instance
   */
  public getIntegrityService(): SessionIntegrityService {
    return this.integrityService;
  }
}
