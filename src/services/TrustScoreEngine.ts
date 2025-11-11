import { SessionResult, Decision, Player, GameSession } from '../types';

export interface TrustScoreCalculation {
  newScore: number;
  scoreChange: number;
  cooperationRate: number;
  qualifiesForTrustworthyTitle: boolean;
  reasoning: string;
}

export interface TrustScoreHistoryEntry {
  score: number;
  timestamp: Date;
  sessionId: string;
  cooperationRate: number;
  scoreChange: number;
  reasoning: string;
}

export class TrustScoreEngine {
  private static readonly MIN_TRUST_SCORE = 0;
  private static readonly MAX_TRUST_SCORE = 100;
  private static readonly INITIAL_TRUST_SCORE = 50;
  private static readonly HIGH_COOPERATION_THRESHOLD = 0.6;
  private static readonly LOW_COOPERATION_THRESHOLD = 0.4;
  private static readonly TRUSTWORTHY_TITLE_MAX_CONFESSIONS = 3;

  /**
   * Calculate new trust score based on session results
   * Requirements: 4.2, 4.3
   */
  calculateTrustScore(
    currentScore: number,
    sessionResult: SessionResult,
    playerId: string
  ): TrustScoreCalculation {
    const cooperationRate = this.calculateCooperationRate(
      sessionResult,
      playerId
    );
    const scoreChange = this.calculateScoreChange(
      currentScore,
      cooperationRate
    );
    const newScore = this.clampScore(currentScore + scoreChange);
    const qualifiesForTrustworthyTitle = this.checkTrustworthyTitle(
      sessionResult,
      playerId
    );
    const reasoning = this.generateScoreReasoning(cooperationRate, scoreChange);

    return {
      newScore,
      scoreChange,
      cooperationRate,
      qualifiesForTrustworthyTitle,
      reasoning,
    };
  }

  /**
   * Calculate cooperation rate for a player in a session
   */
  private calculateCooperationRate(
    sessionResult: SessionResult,
    playerId: string
  ): number {
    const playerRounds = sessionResult.session.rounds.filter((round) =>
      round.decisions.some((decision) => decision.playerId === playerId)
    );

    if (playerRounds.length === 0) {
      return 0;
    }

    const cooperativeDecisions = playerRounds.filter((round) => {
      const playerDecision = round.decisions.find(
        (d) => d.playerId === playerId
      );
      return playerDecision?.decision === Decision.STAY_SILENT;
    }).length;

    return cooperativeDecisions / playerRounds.length;
  }

  /**
   * Calculate score change based on cooperation rate
   * Requirements: 4.2, 4.3
   */
  private calculateScoreChange(
    currentScore: number,
    cooperationRate: number
  ): number {
    if (cooperationRate > TrustScoreEngine.HIGH_COOPERATION_THRESHOLD) {
      // Increase trust score for high cooperation (>60%)
      const baseIncrease = cooperationRate * 15; // Up to 15 points for 100% cooperation
      const diminishingReturns = this.applyDiminishingReturns(
        currentScore,
        baseIncrease,
        true
      );
      return Math.round(diminishingReturns);
    } else if (cooperationRate < TrustScoreEngine.LOW_COOPERATION_THRESHOLD) {
      // Decrease trust score for low cooperation (<40%)
      const baseDecrease = (1 - cooperationRate) * 15; // Up to 15 points for 0% cooperation
      const diminishingReturns = this.applyDiminishingReturns(
        currentScore,
        baseDecrease,
        false
      );
      return -Math.round(diminishingReturns);
    }

    // Neutral cooperation rate (40-60%) - small adjustment toward 50
    const neutralAdjustment = (50 - currentScore) * 0.1;
    return Math.round(neutralAdjustment);
  }

  /**
   * Apply diminishing returns to score changes
   */
  private applyDiminishingReturns(
    currentScore: number,
    baseChange: number,
    isIncrease: boolean
  ): number {
    if (isIncrease) {
      // Diminishing returns as score approaches 100
      const distanceFromMax = TrustScoreEngine.MAX_TRUST_SCORE - currentScore;
      const multiplier = distanceFromMax / TrustScoreEngine.MAX_TRUST_SCORE;
      return baseChange * multiplier;
    } else {
      // Diminishing returns as score approaches 0
      const distanceFromMin = currentScore - TrustScoreEngine.MIN_TRUST_SCORE;
      const multiplier = distanceFromMin / TrustScoreEngine.MAX_TRUST_SCORE;
      return baseChange * multiplier;
    }
  }

  /**
   * Clamp score to valid range
   */
  private clampScore(score: number): number {
    return Math.max(
      TrustScoreEngine.MIN_TRUST_SCORE,
      Math.min(TrustScoreEngine.MAX_TRUST_SCORE, score)
    );
  }

  /**
   * Check if player qualifies for "Most Trustworthy Player" title
   * Requirement: 4.5
   */
  checkTrustworthyTitle(
    sessionResult: SessionResult,
    playerId: string
  ): boolean {
    const playerRounds = sessionResult.session.rounds.filter((round) =>
      round.decisions.some((decision) => decision.playerId === playerId)
    );

    const confessCount = playerRounds.filter((round) => {
      const playerDecision = round.decisions.find(
        (d) => d.playerId === playerId
      );
      return playerDecision?.decision === Decision.CONFESS;
    }).length;

    return confessCount < TrustScoreEngine.TRUSTWORTHY_TITLE_MAX_CONFESSIONS;
  }

  /**
   * Generate human-readable reasoning for score change
   */
  private generateScoreReasoning(
    cooperationRate: number,
    scoreChange: number
  ): string {
    const cooperationPercentage = Math.round(cooperationRate * 100);

    if (cooperationRate > TrustScoreEngine.HIGH_COOPERATION_THRESHOLD) {
      return `High cooperation rate (${cooperationPercentage}%) increased trust score by ${scoreChange} points`;
    } else if (cooperationRate < TrustScoreEngine.LOW_COOPERATION_THRESHOLD) {
      return `Low cooperation rate (${cooperationPercentage}%) decreased trust score by ${Math.abs(scoreChange)} points`;
    } else {
      return `Moderate cooperation rate (${cooperationPercentage}%) resulted in minor adjustment of ${scoreChange} points`;
    }
  }

  /**
   * Calculate trust score trend over multiple sessions
   */
  calculateTrustTrend(
    history: TrustScoreHistoryEntry[]
  ): 'improving' | 'declining' | 'stable' {
    if (history.length < 3) {
      return 'stable';
    }

    const recent = history.slice(-3);
    const scoreChanges = recent.map((entry) => entry.scoreChange);
    const averageChange =
      scoreChanges.reduce((sum, change) => sum + change, 0) /
      scoreChanges.length;

    if (averageChange > 2) {
      return 'improving';
    } else if (averageChange < -2) {
      return 'declining';
    } else {
      return 'stable';
    }
  }

  /**
   * Get trust score category for display purposes
   */
  getTrustCategory(score: number): string {
    if (score >= 80) return 'Highly Trustworthy';
    if (score >= 60) return 'Trustworthy';
    if (score >= 40) return 'Neutral';
    if (score >= 20) return 'Untrustworthy';
    return 'Highly Untrustworthy';
  }

  /**
   * Calculate percentile ranking among all players
   */
  calculatePercentileRank(playerScore: number, allScores: number[]): number {
    if (allScores.length === 0) return 50;

    const lowerScores = allScores.filter((score) => score < playerScore).length;
    return Math.round((lowerScores / allScores.length) * 100);
  }
}
