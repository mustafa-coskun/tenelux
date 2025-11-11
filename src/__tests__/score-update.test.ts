import { describe, it, expect } from '@jest/globals';
import { GameEngine } from '../services/GameEngine';
import { Decision } from '../types';

describe('Score Update Tests', () => {
  it('should handle payoff matrix correctly', () => {
    // Test all payoff combinations
    const testCases = [
      {
        p1: Decision.STAY_SILENT,
        p2: Decision.STAY_SILENT,
        expected: { playerA: 3, playerB: 3 },
      },
      {
        p1: Decision.STAY_SILENT,
        p2: Decision.CONFESS,
        expected: { playerA: 0, playerB: 5 },
      },
      {
        p1: Decision.CONFESS,
        p2: Decision.STAY_SILENT,
        expected: { playerA: 5, playerB: 0 },
      },
      {
        p1: Decision.CONFESS,
        p2: Decision.CONFESS,
        expected: { playerA: 1, playerB: 1 },
      },
    ];

    testCases.forEach(({ p1, p2, expected }) => {
      const result = gameEngine.calculatePayoffs(p1, p2);
      expect(result.playerA).toBe(expected.playerA);
      expect(result.playerB).toBe(expected.playerB);
    });
  });
});
