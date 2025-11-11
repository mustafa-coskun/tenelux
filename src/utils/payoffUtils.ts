import { Decision, PayoffResult } from '../types';
import { PAYOFF_MATRIX } from './constants';

/**
 * Utility functions for payoff calculations and matrix operations
 */

/**
 * Get all possible decision combinations and their payoffs
 */
export function getAllPayoffCombinations(): Array<{
  playerA: Decision;
  playerB: Decision;
  payoff: PayoffResult;
}> {
  const combinations = [];

  for (const playerADecision of Object.values(Decision)) {
    for (const playerBDecision of Object.values(Decision)) {
      const key = `${playerADecision},${playerBDecision}`;
      const payoff = PAYOFF_MATRIX[key];

      if (payoff) {
        combinations.push({
          playerA: playerADecision,
          playerB: playerBDecision,
          payoff,
        });
      }
    }
  }

  return combinations;
}

/**
 * Validate that a decision combination exists in the payoff matrix
 */
export function isValidDecisionCombination(
  playerA: Decision,
  playerB: Decision
): boolean {
  const key = `${playerA},${playerB}`;
  return key in PAYOFF_MATRIX;
}

/**
 * Get the payoff for a specific decision combination
 */
export function getPayoff(playerA: Decision, playerB: Decision): PayoffResult {
  const key = `${playerA},${playerB}`;
  const payoff = PAYOFF_MATRIX[key];

  if (!payoff) {
    throw new Error(`Invalid decision combination: ${playerA}, ${playerB}`);
  }

  return payoff;
}

/**
 * Calculate total points for a player across multiple rounds
 */
export function calculateTotalPoints(
  playerId: string,
  decisions: Array<{
    playerA: string;
    playerB: string;
    decisionA: Decision;
    decisionB: Decision;
  }>
): number {
  let totalPoints = 0;

  for (const round of decisions) {
    const isPlayerA = round.playerA === playerId;
    const isPlayerB = round.playerB === playerId;

    // Skip rounds where the player is not involved
    if (!isPlayerA && !isPlayerB) {
      continue;
    }

    // Always pass decisions in the correct order: playerA decision first, playerB decision second
    const payoff = getPayoff(round.decisionA, round.decisionB);
    const points = isPlayerA ? payoff.playerA : payoff.playerB;

    totalPoints += points;
  }

  return totalPoints;
}
