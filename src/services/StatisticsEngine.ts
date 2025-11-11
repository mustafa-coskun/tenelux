import {
  StatisticsEngine as IStatisticsEngine,
  GameSession,
  PlayerStatistics,
  SessionResult,
  Decision,
  Player,
} from '../types';

// StatisticsEngine implementation for calculating game statistics
export class StatisticsEngine implements IStatisticsEngine {
  private historicalStats: Map<string, PlayerStatistics> = new Map();
  private t: ((key: string, params?: any) => string) | null = null;

  constructor(translateFunction?: (key: string, params?: any) => string) {
    this.t = translateFunction || null;
  }

  /**
   * Update the translation function
   */
  updateTranslationFunction(
    translateFunction: (key: string, params?: any) => string
  ): void {
    this.t = translateFunction;
  }

  /**
   * Calculate statistics for a specific player in a game session
   * Requirements: 5.1, 5.2, 5.4, 5.5
   */
  calculateSessionStats(session: GameSession): PlayerStatistics {
    if (!session.players || session.players.length === 0) {
      throw new Error('Session must have players to calculate statistics');
    }

    if (session.rounds.length === 0) {
      return this.createEmptyStats();
    }

    // For now, calculate stats for the first player (human player)
    // In multiplayer, this would need to be called for each player
    const player = session.players.find((p) => !p.isAI) || session.players[0];
    return this.calculatePlayerSessionStats(session, player);
  }

  /**
   * Generate comprehensive report for a player across all their games
   * Requirements: 5.1, 5.2, 5.5
   */
  generateReport(playerId: string): PlayerStatistics {
    const historicalStats = this.historicalStats.get(playerId);

    if (!historicalStats) {
      return this.createEmptyStats();
    }

    return { ...historicalStats };
  }

  /**
   * Update historical statistics for a player after a session
   * Requirements: 5.5
   */
  updateHistoricalStats(playerId: string, sessionResult: SessionResult): void {
    const sessionStats = this.calculatePlayerSessionStats(
      sessionResult.session,
      sessionResult.session.players.find((p) => p.id === playerId)!
    );

    const existingStats =
      this.historicalStats.get(playerId) || this.createEmptyStats();

    // Update cumulative statistics
    const existingGames = existingStats.gamesWon + existingStats.gamesLost;
    const isWinner = sessionResult.winner.id === playerId;

    const updatedStats: PlayerStatistics = {
      cooperationPercentage: this.calculateWeightedAverage(
        existingStats.cooperationPercentage,
        sessionStats.cooperationPercentage,
        existingGames,
        1
      ),
      betrayalPercentage: this.calculateWeightedAverage(
        existingStats.betrayalPercentage,
        sessionStats.betrayalPercentage,
        existingGames,
        1
      ),
      mostFearfulRound:
        sessionStats.mostFearfulRound || existingStats.mostFearfulRound,
      totalPoints: existingStats.totalPoints + sessionStats.totalPoints,
      gamesWon: existingStats.gamesWon + (isWinner ? 1 : 0),
      gamesLost: existingStats.gamesLost + (isWinner ? 0 : 1),
      averageTrustScore: this.calculateWeightedAverage(
        existingStats.averageTrustScore,
        sessionStats.averageTrustScore,
        existingGames,
        1
      ),
    };

    this.historicalStats.set(playerId, updatedStats);
  }

  /**
   * Calculate statistics for a specific player in a session
   */
  private calculatePlayerSessionStats(
    session: GameSession,
    player: Player
  ): PlayerStatistics {
    if (!player) {
      throw new Error('Player not found in session');
    }

    const playerDecisions = this.getPlayerDecisions(session, player.id);
    const totalDecisions = playerDecisions.length;

    if (totalDecisions === 0) {
      return this.createEmptyStats();
    }

    // Calculate cooperation and betrayal percentages
    const cooperationCount = playerDecisions.filter(
      (d) => d === Decision.STAY_SILENT
    ).length;
    const betrayalCount = playerDecisions.filter(
      (d) => d === Decision.CONFESS
    ).length;

    const cooperationPercentage = (cooperationCount / totalDecisions) * 100;
    const betrayalPercentage = (betrayalCount / totalDecisions) * 100;

    // Find most fearful round (first round where player confessed)
    const mostFearfulRound = this.findMostFearfulRound(session, player.id);

    // Calculate total points for this player
    const totalPoints = this.calculatePlayerTotalPoints(session, player.id);

    // Determine win/loss for this session
    const isWinner = session.winner?.id === player.id;

    return {
      cooperationPercentage: Math.round(cooperationPercentage * 100) / 100, // Round to 2 decimal places
      betrayalPercentage: Math.round(betrayalPercentage * 100) / 100,
      mostFearfulRound,
      totalPoints,
      gamesWon: isWinner ? 1 : 0,
      gamesLost: isWinner ? 0 : 1,
      averageTrustScore: player.trustScore,
    };
  }

  /**
   * Extract all decisions made by a specific player in a session
   * Uses final decisions if available (after decision reversal phase)
   */
  private getPlayerDecisions(
    session: GameSession,
    playerId: string
  ): Decision[] {
    const decisions: Decision[] = [];

    for (const round of session.rounds) {
      const playerDecision = round.decisions.find(
        (d) => d.playerId === playerId
      );
      if (playerDecision) {
        // Use final decision if it exists (after reversal), otherwise use original decision
        const finalDecision =
          playerDecision.finalDecision || playerDecision.decision;
        decisions.push(finalDecision);
      }
    }

    return decisions;
  }

  /**
   * Find the round number where the player was most fearful (first confession)
   * Uses final decisions if available (after decision reversal phase)
   * Requirements: 5.2
   */
  private findMostFearfulRound(
    session: GameSession,
    playerId: string
  ): number | undefined {
    for (const round of session.rounds) {
      const playerDecision = round.decisions.find(
        (d) => d.playerId === playerId
      );
      if (playerDecision) {
        // Use final decision if it exists (after reversal), otherwise use original decision
        const finalDecision =
          playerDecision.finalDecision || playerDecision.decision;
        if (finalDecision === Decision.CONFESS) {
          return round.roundNumber;
        }
      }
    }
    return undefined;
  }

  /**
   * Calculate total points earned by a player in a session
   * Recalculates points based on final decisions if any reversals occurred
   */
  private calculatePlayerTotalPoints(
    session: GameSession,
    playerId: string
  ): number {
    let totalPoints = 0;

    for (const round of session.rounds) {
      const playerIndex = round.decisions.findIndex(
        (d) => d.playerId === playerId
      );
      if (playerIndex !== -1) {
        // Check if any decisions were reversed in this round
        const hasReversals = round.decisions.some(
          (d) => d.finalDecision !== undefined
        );

        if (hasReversals) {
          // Recalculate points based on final decisions
          const finalDecisions = round.decisions.map(
            (d) => d.finalDecision || d.decision
          );
          const recalculatedResults = this.calculateRoundPayoff(
            finalDecisions[0],
            finalDecisions[1]
          );
          totalPoints +=
            playerIndex === 0
              ? recalculatedResults.playerA
              : recalculatedResults.playerB;
        } else {
          // Use original results
          totalPoints +=
            playerIndex === 0 ? round.results.playerA : round.results.playerB;
        }
      }
    }

    return totalPoints;
  }

  /**
   * Calculate payoff for a round based on two decisions
   */
  private calculateRoundPayoff(
    playerADecision: Decision,
    playerBDecision: Decision
  ): { playerA: number; playerB: number } {
    // Payoff matrix implementation
    if (
      playerADecision === Decision.STAY_SILENT &&
      playerBDecision === Decision.STAY_SILENT
    ) {
      return { playerA: 3, playerB: 3 };
    } else if (
      playerADecision === Decision.STAY_SILENT &&
      playerBDecision === Decision.CONFESS
    ) {
      return { playerA: 0, playerB: 5 };
    } else if (
      playerADecision === Decision.CONFESS &&
      playerBDecision === Decision.STAY_SILENT
    ) {
      return { playerA: 5, playerB: 0 };
    } else if (
      playerADecision === Decision.CONFESS &&
      playerBDecision === Decision.CONFESS
    ) {
      return { playerA: 1, playerB: 1 };
    }

    // Default case (should not happen)
    return { playerA: 0, playerB: 0 };
  }

  /**
   * Calculate weighted average for cumulative statistics
   */
  private calculateWeightedAverage(
    existingValue: number,
    newValue: number,
    existingWeight: number,
    newWeight: number
  ): number {
    if (existingWeight === 0) {
      return newValue;
    }

    const totalWeight = existingWeight + newWeight;
    return (
      (existingValue * existingWeight + newValue * newWeight) / totalWeight
    );
  }

  /**
   * Create empty statistics object
   */
  private createEmptyStats(): PlayerStatistics {
    return {
      cooperationPercentage: 0,
      betrayalPercentage: 0,
      mostFearfulRound: undefined,
      totalPoints: 0,
      gamesWon: 0,
      gamesLost: 0,
      averageTrustScore: 0,
    };
  }

  /**
   * Get decision pattern analysis for a player
   * Requirements: 5.4
   */
  public analyzeDecisionPatterns(
    session: GameSession,
    playerId: string
  ): {
    mostCommonDecision: Decision;
    decisionSequence: Decision[];
    consistencyScore: number;
  } {
    const decisions = this.getPlayerDecisions(session, playerId);

    if (decisions.length === 0) {
      return {
        mostCommonDecision: Decision.STAY_SILENT,
        decisionSequence: [],
        consistencyScore: 0,
      };
    }

    // Find most common decision
    const cooperationCount = decisions.filter(
      (d) => d === Decision.STAY_SILENT
    ).length;
    const betrayalCount = decisions.filter(
      (d) => d === Decision.CONFESS
    ).length;
    const mostCommonDecision =
      cooperationCount >= betrayalCount
        ? Decision.STAY_SILENT
        : Decision.CONFESS;

    // Calculate consistency score (how often they stick to their most common choice)
    const mostCommonCount = Math.max(cooperationCount, betrayalCount);
    const consistencyScore = (mostCommonCount / decisions.length) * 100;

    return {
      mostCommonDecision,
      decisionSequence: [...decisions],
      consistencyScore: Math.round(consistencyScore * 100) / 100,
    };
  }

  /**
   * Generate comparative statistics text
   * Requirements: 5.3
   */
  public generateComparativeText(stats: PlayerStatistics): string {
    const t = this.t || ((key: string, params?: any) => key); // Fallback to key if no translation function

    const cooperationPercentage = Math.round(stats.cooperationPercentage);
    const betrayalPercentage = Math.round(stats.betrayalPercentage);

    return t('statisticsPanel.comparativeText', {
      cooperationPercentage,
      betrayalPercentage,
    });
  }

  /**
   * Clear all historical statistics (useful for testing)
   */
  public clearHistoricalStats(): void {
    this.historicalStats.clear();
  }

  /**
   * Get all historical statistics (useful for testing and debugging)
   */
  public getAllHistoricalStats(): Map<string, PlayerStatistics> {
    return new Map(this.historicalStats);
  }
}
