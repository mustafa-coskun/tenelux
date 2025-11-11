import { RoundManager } from '../RoundManager';
import { GamePhase, Decision, PlayerDecision, Round } from '../../types';

describe('RoundManager', () => {
  let roundManager: RoundManager;

  beforeEach(() => {
    roundManager = new RoundManager();
  });

  describe('createRound', () => {
    test('should create a round with correct properties', () => {
      const round = roundManager.createRound(1, GamePhase.TRUST_PHASE);

      expect(round.roundNumber).toBe(1);
      expect(round.decisions).toEqual([]);
      expect(round.results).toEqual({ playerA: 0, playerB: 0 });
      expect(round.timestamp).toBeInstanceOf(Date);
      expect(round.phaseType).toBe(GamePhase.TRUST_PHASE);
    });
  });

  describe('decision management', () => {
    let round: Round;

    beforeEach(() => {
      round = roundManager.createRound(1, GamePhase.TRUST_PHASE);
    });

    test('should add decision to round', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, decision);
      expect(round.decisions).toContain(decision);
    });

    test('should replace existing decision for same player', () => {
      const decision1: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      const decision2: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.CONFESS,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, decision1);
      roundManager.addDecision(round, decision2);

      expect(round.decisions).toHaveLength(1);
      expect(round.decisions[0].decision).toBe(Decision.CONFESS);
    });

    test('should check if round is complete', () => {
      expect(roundManager.isRoundComplete(round)).toBe(false);

      const decision1: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, decision1);
      expect(roundManager.isRoundComplete(round)).toBe(false);

      const decision2: PlayerDecision = {
        playerId: 'player2',
        decision: Decision.CONFESS,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, decision2);
      expect(roundManager.isRoundComplete(round)).toBe(true);
    });

    test('should get player decision from round', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, decision);

      const retrieved = roundManager.getPlayerDecision(round, 'player1');
      expect(retrieved).toEqual(decision);

      const notFound = roundManager.getPlayerDecision(round, 'player2');
      expect(notFound).toBeUndefined();
    });
  });

  describe('round history', () => {
    test('should track round history', () => {
      const round1 = roundManager.createRound(1, GamePhase.TRUST_PHASE);
      const round2 = roundManager.createRound(2, GamePhase.TRUST_PHASE);

      roundManager.addToHistory(round1);
      roundManager.addToHistory(round2);

      const history = roundManager.getRoundHistory();
      expect(history).toContain(round1);
      expect(history).toContain(round2);
      expect(history).toHaveLength(2);
    });

    test('should clear history', () => {
      const round = roundManager.createRound(1, GamePhase.TRUST_PHASE);
      roundManager.addToHistory(round);

      expect(roundManager.getRoundHistory()).toHaveLength(1);

      roundManager.clearHistory();
      expect(roundManager.getRoundHistory()).toHaveLength(0);
    });

    test('should get decisions by phase', () => {
      const trustRound = roundManager.createRound(1, GamePhase.TRUST_PHASE);
      const commRound = roundManager.createRound(
        2,
        GamePhase.COMMUNICATION_PHASE
      );

      roundManager.addToHistory(trustRound);
      roundManager.addToHistory(commRound);

      const trustRounds = roundManager.getDecisionsByPhase(
        GamePhase.TRUST_PHASE
      );
      expect(trustRounds).toContain(trustRound);
      expect(trustRounds).not.toContain(commRound);
    });
  });

  describe('decision reversal', () => {
    let round: Round;

    beforeEach(() => {
      round = roundManager.createRound(1, GamePhase.DECISION_REVERSAL_PHASE);
    });

    test('should allow decision reversal in correct phase', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: true,
      };

      roundManager.addDecision(round, decision);

      expect(
        roundManager.canReverseDecision(
          round,
          'player1',
          GamePhase.DECISION_REVERSAL_PHASE
        )
      ).toBe(true);
    });

    test('should not allow decision reversal in wrong phase', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: true,
      };

      roundManager.addDecision(round, decision);

      expect(
        roundManager.canReverseDecision(round, 'player1', GamePhase.TRUST_PHASE)
      ).toBe(false);
    });

    test('should not allow decision reversal when canReverse is false', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, decision);

      expect(
        roundManager.canReverseDecision(
          round,
          'player1',
          GamePhase.DECISION_REVERSAL_PHASE
        )
      ).toBe(false);
    });

    test('should reverse decision successfully', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: true,
      };

      roundManager.addDecision(round, decision);

      const success = roundManager.reverseDecision(
        round,
        'player1',
        Decision.CONFESS
      );
      expect(success).toBe(true);

      const updatedDecision = roundManager.getPlayerDecision(round, 'player1');
      expect(updatedDecision?.decision).toBe(Decision.CONFESS);
      expect(updatedDecision?.canReverse).toBe(false);
    });

    test('should fail to reverse non-existent decision', () => {
      const success = roundManager.reverseDecision(
        round,
        'player1',
        Decision.CONFESS
      );
      expect(success).toBe(false);
    });

    test('should enable decision reversal for player', () => {
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, decision);
      roundManager.enableDecisionReversal(round, 'player1');

      expect(decision.canReverse).toBe(true);
    });

    test('should enable decision reversal for all players', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player2',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      decisions.forEach((decision) =>
        roundManager.addDecision(round, decision)
      );
      roundManager.enableAllDecisionReversals(round);

      expect(round.decisions.every((d) => d.canReverse)).toBe(true);
    });
  });

  describe('statistics helpers', () => {
    beforeEach(() => {
      // Add some rounds to history for testing
      const rounds = [
        { roundNumber: 1, playerId: 'player1', decision: Decision.STAY_SILENT },
        { roundNumber: 2, playerId: 'player1', decision: Decision.CONFESS },
        { roundNumber: 3, playerId: 'player1', decision: Decision.STAY_SILENT },
        { roundNumber: 4, playerId: 'player1', decision: Decision.STAY_SILENT },
      ];

      rounds.forEach(({ roundNumber, playerId, decision }) => {
        const round = roundManager.createRound(
          roundNumber,
          GamePhase.TRUST_PHASE
        );
        const playerDecision: PlayerDecision = {
          playerId,
          decision,
          timestamp: new Date(),
          canReverse: false,
        };
        roundManager.addDecision(round, playerDecision);
        roundManager.addToHistory(round);
      });
    });

    test('should count cooperation correctly', () => {
      const cooperationCount = roundManager.getCooperationCount('player1');
      expect(cooperationCount).toBe(3); // 3 STAY_SILENT decisions
    });

    test('should count betrayal correctly', () => {
      const betrayalCount = roundManager.getBetrayalCount('player1');
      expect(betrayalCount).toBe(1); // 1 CONFESS decision
    });

    test('should count total rounds for player', () => {
      const totalRounds = roundManager.getTotalRoundsForPlayer('player1');
      expect(totalRounds).toBe(4);
    });

    test('should find most fearful round', () => {
      // Clear history and add specific pattern
      roundManager.clearHistory();

      const rounds = [
        { roundNumber: 1, decision: Decision.STAY_SILENT },
        { roundNumber: 2, decision: Decision.CONFESS }, // This should be the fearful round
        { roundNumber: 3, decision: Decision.STAY_SILENT },
      ];

      rounds.forEach(({ roundNumber, decision }) => {
        const round = roundManager.createRound(
          roundNumber,
          GamePhase.TRUST_PHASE
        );
        const playerDecision: PlayerDecision = {
          playerId: 'player1',
          decision,
          timestamp: new Date(),
          canReverse: false,
        };
        roundManager.addDecision(round, playerDecision);
        roundManager.addToHistory(round);
      });

      const fearfulRound = roundManager.getMostFearfulRound('player1');
      expect(fearfulRound).toBe(2);
    });

    test('should return undefined when no fearful round found', () => {
      roundManager.clearHistory();

      const round = roundManager.createRound(1, GamePhase.TRUST_PHASE);
      const playerDecision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };
      roundManager.addDecision(round, playerDecision);
      roundManager.addToHistory(round);

      const fearfulRound = roundManager.getMostFearfulRound('player1');
      expect(fearfulRound).toBeUndefined();
    });
  });

  describe('round validation', () => {
    test('should validate correct round', () => {
      const round = roundManager.createRound(1, GamePhase.TRUST_PHASE);
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, decision);
      roundManager.setRoundResults(round, { playerA: 3, playerB: 3 });

      expect(roundManager.validateRound(round)).toBe(true);
    });

    test('should reject round with invalid round number', () => {
      const round = roundManager.createRound(0, GamePhase.TRUST_PHASE);
      expect(roundManager.validateRound(round)).toBe(false);
    });

    test('should reject round with future timestamp', () => {
      const round = roundManager.createRound(1, GamePhase.TRUST_PHASE);
      round.timestamp = new Date(Date.now() + 10000); // Future timestamp
      expect(roundManager.validateRound(round)).toBe(false);
    });

    test('should reject round with invalid decision', () => {
      const round = roundManager.createRound(1, GamePhase.TRUST_PHASE);
      const invalidDecision: PlayerDecision = {
        playerId: 'player1',
        decision: 'invalid' as Decision,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, invalidDecision);
      expect(roundManager.validateRound(round)).toBe(false);
    });

    test('should reject round with missing player ID', () => {
      const round = roundManager.createRound(1, GamePhase.TRUST_PHASE);
      const invalidDecision: PlayerDecision = {
        playerId: '',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      roundManager.addDecision(round, invalidDecision);
      expect(roundManager.validateRound(round)).toBe(false);
    });
  });
});
