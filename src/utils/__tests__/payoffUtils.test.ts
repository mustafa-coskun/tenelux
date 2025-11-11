import { Decision } from '../../types';
import {
  getAllPayoffCombinations,
  isValidDecisionCombination,
  getPayoff,
  calculateTotalPoints,
} from '../payoffUtils';

describe('payoffUtils', () => {
  describe('getAllPayoffCombinations', () => {
    test('should return all 4 possible decision combinations', () => {
      const combinations = getAllPayoffCombinations();

      expect(combinations).toHaveLength(4);

      // Check that all combinations are present
      const combinationKeys = combinations.map(
        (c) => `${c.playerA},${c.playerB}`
      );
      expect(combinationKeys).toContain('stay_silent,stay_silent');
      expect(combinationKeys).toContain('stay_silent,confess');
      expect(combinationKeys).toContain('confess,stay_silent');
      expect(combinationKeys).toContain('confess,confess');
    });

    test('should return correct payoffs for each combination', () => {
      const combinations = getAllPayoffCombinations();

      const silentSilent = combinations.find(
        (c) =>
          c.playerA === Decision.STAY_SILENT &&
          c.playerB === Decision.STAY_SILENT
      );
      expect(silentSilent?.payoff).toEqual({ playerA: 3, playerB: 3 });

      const silentConfess = combinations.find(
        (c) =>
          c.playerA === Decision.STAY_SILENT && c.playerB === Decision.CONFESS
      );
      expect(silentConfess?.payoff).toEqual({ playerA: 0, playerB: 5 });

      const confessSilent = combinations.find(
        (c) =>
          c.playerA === Decision.CONFESS && c.playerB === Decision.STAY_SILENT
      );
      expect(confessSilent?.payoff).toEqual({ playerA: 5, playerB: 0 });

      const confessConfess = combinations.find(
        (c) => c.playerA === Decision.CONFESS && c.playerB === Decision.CONFESS
      );
      expect(confessConfess?.payoff).toEqual({ playerA: 1, playerB: 1 });
    });
  });

  describe('isValidDecisionCombination', () => {
    test('should return true for valid combinations', () => {
      expect(
        isValidDecisionCombination(Decision.STAY_SILENT, Decision.STAY_SILENT)
      ).toBe(true);
      expect(
        isValidDecisionCombination(Decision.STAY_SILENT, Decision.CONFESS)
      ).toBe(true);
      expect(
        isValidDecisionCombination(Decision.CONFESS, Decision.STAY_SILENT)
      ).toBe(true);
      expect(
        isValidDecisionCombination(Decision.CONFESS, Decision.CONFESS)
      ).toBe(true);
    });

    test('should return false for invalid combinations', () => {
      expect(
        isValidDecisionCombination('invalid' as Decision, Decision.STAY_SILENT)
      ).toBe(false);
      expect(
        isValidDecisionCombination(Decision.STAY_SILENT, 'invalid' as Decision)
      ).toBe(false);
      expect(
        isValidDecisionCombination(
          'invalid1' as Decision,
          'invalid2' as Decision
        )
      ).toBe(false);
    });
  });

  describe('getPayoff', () => {
    test('should return correct payoffs for valid combinations', () => {
      expect(getPayoff(Decision.STAY_SILENT, Decision.STAY_SILENT)).toEqual({
        playerA: 3,
        playerB: 3,
      });
      expect(getPayoff(Decision.STAY_SILENT, Decision.CONFESS)).toEqual({
        playerA: 0,
        playerB: 5,
      });
      expect(getPayoff(Decision.CONFESS, Decision.STAY_SILENT)).toEqual({
        playerA: 5,
        playerB: 0,
      });
      expect(getPayoff(Decision.CONFESS, Decision.CONFESS)).toEqual({
        playerA: 1,
        playerB: 1,
      });
    });

    test('should throw error for invalid combinations', () => {
      expect(() =>
        getPayoff('invalid' as Decision, Decision.STAY_SILENT)
      ).toThrow('Invalid decision combination: invalid, stay_silent');

      expect(() =>
        getPayoff(Decision.STAY_SILENT, 'invalid' as Decision)
      ).toThrow('Invalid decision combination: stay_silent, invalid');
    });
  });

  describe('calculateTotalPoints', () => {
    test('should calculate total points for player A correctly', () => {
      const decisions = [
        {
          playerA: 'player1',
          playerB: 'player2',
          decisionA: Decision.STAY_SILENT,
          decisionB: Decision.STAY_SILENT,
        },
        {
          playerA: 'player1',
          playerB: 'player2',
          decisionA: Decision.CONFESS,
          decisionB: Decision.STAY_SILENT,
        },
        {
          playerA: 'player1',
          playerB: 'player2',
          decisionA: Decision.STAY_SILENT,
          decisionB: Decision.CONFESS,
        },
      ];

      const totalPoints = calculateTotalPoints('player1', decisions);
      // Round 1: 3 points (both silent)
      // Round 2: 5 points (player1 confess, player2 silent)
      // Round 3: 0 points (player1 silent, player2 confess)
      // Total: 8 points
      expect(totalPoints).toBe(8);
    });

    test('should calculate total points for player B correctly', () => {
      const decisions = [
        {
          playerA: 'player1',
          playerB: 'player2',
          decisionA: Decision.STAY_SILENT,
          decisionB: Decision.STAY_SILENT,
        },
        {
          playerA: 'player1',
          playerB: 'player2',
          decisionA: Decision.CONFESS,
          decisionB: Decision.STAY_SILENT,
        },
        {
          playerA: 'player1',
          playerB: 'player2',
          decisionA: Decision.STAY_SILENT,
          decisionB: Decision.CONFESS,
        },
      ];

      const totalPoints = calculateTotalPoints('player2', decisions);
      // Round 1: 3 points (both silent)
      // Round 2: 0 points (player1 confess, player2 silent)
      // Round 3: 5 points (player1 silent, player2 confess)
      // Total: 8 points
      expect(totalPoints).toBe(8);
    });

    test('should return 0 for player not in any decisions', () => {
      const decisions = [
        {
          playerA: 'player1',
          playerB: 'player2',
          decisionA: Decision.STAY_SILENT,
          decisionB: Decision.STAY_SILENT,
        },
      ];

      const totalPoints = calculateTotalPoints('player3', decisions);
      expect(totalPoints).toBe(0);
    });

    test('should handle empty decisions array', () => {
      const totalPoints = calculateTotalPoints('player1', []);
      expect(totalPoints).toBe(0);
    });

    test('should handle mixed player positions correctly', () => {
      const decisions = [
        {
          playerA: 'player1',
          playerB: 'player2',
          decisionA: Decision.CONFESS,
          decisionB: Decision.STAY_SILENT,
        },
        {
          playerA: 'player2',
          playerB: 'player1',
          decisionA: Decision.STAY_SILENT,
          decisionB: Decision.CONFESS,
        },
      ];

      const player1Points = calculateTotalPoints('player1', decisions);
      const player2Points = calculateTotalPoints('player2', decisions);

      // Round 1: player1 (playerA) confesses, player2 (playerB) stays silent
      // Payoff for confess,stay_silent is {playerA: 5, playerB: 0} -> player1 gets 5, player2 gets 0
      // Round 2: player2 (playerA) stays silent, player1 (playerB) confesses
      // Payoff for stay_silent,confess is {playerA: 0, playerB: 5} -> player2 gets 0, player1 gets 5
      // Total: player1 = 5 + 5 = 10, player2 = 0 + 0 = 0
      expect(player1Points).toBe(10);
      expect(player2Points).toBe(0);
    });
  });
});
