import {
  Round,
  PlayerDecision,
  GamePhase,
  PayoffResult,
  Decision,
} from '../types';

// RoundManager handles individual round creation, decision tracking, and reversal mechanics
export class RoundManager {
  private roundHistory: Round[] = [];
  private pendingDecisions: Map<string, PlayerDecision> = new Map();

  createRound(roundNumber: number, phaseType: GamePhase): Round {
    const round: Round = {
      roundNumber,
      decisions: [],
      results: { playerA: 0, playerB: 0 },
      timestamp: new Date(),
      phaseType,
    };

    return round;
  }

  addDecision(round: Round, decision: PlayerDecision): void {
    // Check if player already made a decision for this round
    const existingDecisionIndex = round.decisions.findIndex(
      (d) => d.playerId === decision.playerId
    );

    if (existingDecisionIndex >= 0) {
      // Replace existing decision (for decision reversal)
      round.decisions[existingDecisionIndex] = decision;
    } else {
      // Add new decision
      round.decisions.push(decision);
    }
  }

  isRoundComplete(round: Round, expectedPlayerCount: number = 2): boolean {
    return (
      round.decisions.length === expectedPlayerCount &&
      round.decisions.every((d) => d.decision !== undefined)
    );
  }

  setRoundResults(round: Round, results: PayoffResult): void {
    round.results = results;
  }

  getRoundHistory(): Round[] {
    return [...this.roundHistory];
  }

  addToHistory(round: Round): void {
    this.roundHistory.push(round);
  }

  clearHistory(): void {
    this.roundHistory = [];
  }

  // Decision reversal mechanics
  canReverseDecision(
    round: Round,
    playerId: string,
    currentPhase: GamePhase
  ): boolean {
    // Decision reversal is only allowed in the Decision Reversal Phase
    if (currentPhase !== GamePhase.DECISION_REVERSAL_PHASE) {
      return false;
    }

    // Find the player's decision in this round
    const playerDecision = round.decisions.find((d) => d.playerId === playerId);

    return playerDecision ? playerDecision.canReverse : false;
  }

  reverseDecision(
    round: Round,
    playerId: string,
    newDecision: Decision
  ): boolean {
    const decisionIndex = round.decisions.findIndex(
      (d) => d.playerId === playerId
    );

    if (decisionIndex === -1) {
      return false;
    }

    const playerDecision = round.decisions[decisionIndex];

    if (!playerDecision.canReverse) {
      return false;
    }

    // Update the decision
    playerDecision.decision = newDecision;
    playerDecision.timestamp = new Date();
    playerDecision.canReverse = false; // Can only reverse once

    return true;
  }

  enableDecisionReversal(round: Round, playerId: string): void {
    const decision = round.decisions.find((d) => d.playerId === playerId);
    if (decision) {
      decision.canReverse = true;
    }
  }

  enableAllDecisionReversals(round: Round): void {
    round.decisions.forEach((decision) => {
      decision.canReverse = true;
    });
  }

  // Get decisions for specific players
  getPlayerDecision(
    round: Round,
    playerId: string
  ): PlayerDecision | undefined {
    return round.decisions.find((d) => d.playerId === playerId);
  }

  getDecisionsByPhase(phaseType: GamePhase): Round[] {
    return this.roundHistory.filter((round) => round.phaseType === phaseType);
  }

  // Statistics helpers
  getCooperationCount(playerId: string): number {
    return this.roundHistory.reduce((count, round) => {
      const decision = this.getPlayerDecision(round, playerId);
      return count + (decision?.decision === Decision.STAY_SILENT ? 1 : 0);
    }, 0);
  }

  getBetrayalCount(playerId: string): number {
    return this.roundHistory.reduce((count, round) => {
      const decision = this.getPlayerDecision(round, playerId);
      return count + (decision?.decision === Decision.CONFESS ? 1 : 0);
    }, 0);
  }

  getTotalRoundsForPlayer(playerId: string): number {
    return this.roundHistory.filter((round) =>
      round.decisions.some((d) => d.playerId === playerId)
    ).length;
  }

  // Find the round where player was most fearful (confessed after staying silent)
  getMostFearfulRound(playerId: string): number | undefined {
    let previousDecision: Decision | null = null;

    for (const round of this.roundHistory) {
      const decision = this.getPlayerDecision(round, playerId);

      if (decision) {
        if (
          previousDecision === Decision.STAY_SILENT &&
          decision.decision === Decision.CONFESS
        ) {
          return round.roundNumber;
        }
        previousDecision = decision.decision;
      }
    }

    return undefined;
  }

  // Validate round data integrity
  validateRound(round: Round): boolean {
    // Check basic round structure
    if (!round.roundNumber || round.roundNumber < 1) {
      return false;
    }

    if (!round.timestamp || round.timestamp > new Date()) {
      return false;
    }

    // Validate decisions
    for (const decision of round.decisions) {
      if (!decision.playerId || !decision.timestamp) {
        return false;
      }

      if (!Object.values(Decision).includes(decision.decision)) {
        return false;
      }
    }

    // Validate results if round is complete
    if (this.isRoundComplete(round)) {
      if (
        typeof round.results.playerA !== 'number' ||
        typeof round.results.playerB !== 'number'
      ) {
        return false;
      }
    }

    return true;
  }
}
