import { SessionManager } from '../SessionManager';
import {
  GamePhase,
  GameMode,
  SessionConfig,
  Player,
  PlayerDecision,
  Decision,
  Round,
} from '../../types';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockPlayers: Player[];
  let mockSessionConfig: SessionConfig;

  beforeEach(() => {
    sessionManager = new SessionManager();

    mockPlayers = [
      {
        id: 'player1',
        name: 'Player 1',
        isAI: false,
        trustScore: 50,
        totalGamesPlayed: 0,
        createdAt: new Date(),
      },
      {
        id: 'player2',
        name: 'Player 2',
        isAI: true,
        trustScore: 50,
        totalGamesPlayed: 0,
        createdAt: new Date(),
      },
    ];

    mockSessionConfig = {
      maxRounds: 7,
      trustPhaseRounds: 5,
      communicationTimeLimit: 60,
      allowDecisionReversal: true,
      gameMode: GameMode.SINGLE_PLAYER,
    };
  });

  afterEach(() => {
    sessionManager.cleanup();
  });

  describe('createSession', () => {
    test('should create a new session with correct initial state', () => {
      const session = sessionManager.createSession(mockSessionConfig);

      expect(session.id).toBeDefined();
      expect(session.players).toEqual([]);
      expect(session.rounds).toEqual([]);
      expect(session.currentPhase).toBe(GamePhase.TRUST_PHASE);
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.endTime).toBeUndefined();
      expect(session.winner).toBeUndefined();
      expect(session.sessionConfig).toEqual(mockSessionConfig);
    });

    test('should set current session', () => {
      const session = sessionManager.createSession(mockSessionConfig);
      expect(sessionManager.getCurrentSession()).toEqual(session);
    });
  });

  describe('phase management', () => {
    beforeEach(() => {
      sessionManager.createSession(mockSessionConfig);
      sessionManager.addPlayersToSession(mockPlayers);
    });

    test('should start in trust phase', () => {
      expect(sessionManager.getCurrentPhase()).toBe(GamePhase.TRUST_PHASE);
    });

    test('should advance from trust phase to communication phase after 5 rounds', () => {
      // Add 5 rounds to complete trust phase
      for (let i = 1; i <= 5; i++) {
        const round = sessionManager.createNewRound();
        const decisions: PlayerDecision[] = [
          {
            playerId: 'player1',
            decision: Decision.STAY_SILENT,
            timestamp: new Date(),
            canReverse: false,
          },
          {
            playerId: 'player2',
            decision: Decision.STAY_SILENT,
            timestamp: new Date(),
            canReverse: false,
          },
        ];

        decisions.forEach((decision) =>
          sessionManager.addDecisionToRound(round, decision)
        );
        sessionManager.setRoundResults(round, { playerA: 3, playerB: 3 });
        sessionManager.addRoundToSession(round);
      }

      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.COMMUNICATION_PHASE
      );
    });

    test('should advance from communication phase to decision reversal phase', () => {
      // First complete trust phase
      for (let i = 1; i <= 5; i++) {
        const round = sessionManager.createNewRound();
        const decisions: PlayerDecision[] = [
          {
            playerId: 'player1',
            decision: Decision.STAY_SILENT,
            timestamp: new Date(),
            canReverse: false,
          },
          {
            playerId: 'player2',
            decision: Decision.STAY_SILENT,
            timestamp: new Date(),
            canReverse: false,
          },
        ];

        decisions.forEach((decision) =>
          sessionManager.addDecisionToRound(round, decision)
        );
        sessionManager.setRoundResults(round, { playerA: 3, playerB: 3 });
        sessionManager.addRoundToSession(round);
      }

      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.COMMUNICATION_PHASE
      );

      sessionManager.advancePhase();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.DECISION_REVERSAL_PHASE
      );
    });

    test('should handle phase timeout for communication phase', () => {
      // Complete trust phase first
      for (let i = 1; i <= 5; i++) {
        const round = sessionManager.createNewRound();
        const decisions: PlayerDecision[] = [
          {
            playerId: 'player1',
            decision: Decision.STAY_SILENT,
            timestamp: new Date(),
            canReverse: false,
          },
          {
            playerId: 'player2',
            decision: Decision.STAY_SILENT,
            timestamp: new Date(),
            canReverse: false,
          },
        ];

        decisions.forEach((decision) =>
          sessionManager.addDecisionToRound(round, decision)
        );
        sessionManager.setRoundResults(round, { playerA: 3, playerB: 3 });
        sessionManager.addRoundToSession(round);
      }

      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.COMMUNICATION_PHASE
      );

      sessionManager.handlePhaseTimeout();
      expect(sessionManager.getCurrentPhase()).toBe(
        GamePhase.DECISION_REVERSAL_PHASE
      );
    });
  });

  describe('player management', () => {
    beforeEach(() => {
      sessionManager.createSession(mockSessionConfig);
    });

    test('should add players to session', () => {
      sessionManager.addPlayersToSession(mockPlayers);
      const session = sessionManager.getCurrentSession();
      expect(session?.players).toEqual(mockPlayers);
    });

    test('should throw error when adding wrong number of players', () => {
      expect(() => {
        sessionManager.addPlayersToSession([mockPlayers[0]]);
      }).toThrow('Session requires exactly 2 players');
    });

    test('should throw error when no active session', () => {
      sessionManager.cleanup();
      expect(() => {
        sessionManager.addPlayersToSession(mockPlayers);
      }).toThrow('No active session');
    });
  });

  describe('decision validation', () => {
    beforeEach(() => {
      sessionManager.createSession(mockSessionConfig);
      sessionManager.addPlayersToSession(mockPlayers);
    });

    test('should validate correct decisions', () => {
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

      expect(sessionManager.validateDecisions(decisions)).toBe(true);
    });

    test('should reject decisions with wrong number of players', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      expect(sessionManager.validateDecisions(decisions)).toBe(false);
    });

    test('should reject decisions from invalid players', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'invalid_player',
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

      expect(sessionManager.validateDecisions(decisions)).toBe(false);
    });

    test('should reject duplicate player decisions', () => {
      const decisions: PlayerDecision[] = [
        {
          playerId: 'player1',
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'player1',
          decision: Decision.CONFESS,
          timestamp: new Date(),
          canReverse: false,
        },
      ];

      expect(sessionManager.validateDecisions(decisions)).toBe(false);
    });
  });

  describe('round management', () => {
    beforeEach(() => {
      sessionManager.createSession(mockSessionConfig);
      sessionManager.addPlayersToSession(mockPlayers);
    });

    test('should create new round with correct properties', () => {
      const round = sessionManager.createNewRound();

      expect(round.roundNumber).toBe(1);
      expect(round.decisions).toEqual([]);
      expect(round.results).toEqual({ playerA: 0, playerB: 0 });
      expect(round.timestamp).toBeInstanceOf(Date);
      expect(round.phaseType).toBe(GamePhase.TRUST_PHASE);
    });

    test('should add decisions to round', () => {
      const round = sessionManager.createNewRound();
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: false,
      };

      sessionManager.addDecisionToRound(round, decision);
      expect(round.decisions).toContain(decision);
    });

    test('should check if round is complete', () => {
      const round = sessionManager.createNewRound();
      expect(sessionManager.isRoundComplete(round)).toBe(false);

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
        sessionManager.addDecisionToRound(round, decision)
      );
      expect(sessionManager.isRoundComplete(round)).toBe(true);
    });

    test('should track round history', () => {
      const round = sessionManager.createNewRound();
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
        sessionManager.addDecisionToRound(round, decision)
      );
      sessionManager.setRoundResults(round, { playerA: 0, playerB: 5 });
      sessionManager.addRoundToSession(round);

      const history = sessionManager.getRoundHistory();
      expect(history).toContain(round);
    });
  });

  describe('decision reversal', () => {
    beforeEach(() => {
      sessionManager.createSession(mockSessionConfig);
      sessionManager.addPlayersToSession(mockPlayers);
    });

    test('should allow decision reversal in decision reversal phase', () => {
      const round = sessionManager.createNewRound();
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: true,
      };

      sessionManager.addDecisionToRound(round, decision);

      // Manually set phase to decision reversal
      const session = sessionManager.getCurrentSession();
      if (session) {
        session.currentPhase = GamePhase.DECISION_REVERSAL_PHASE;
      }

      expect(sessionManager.canReverseDecision(round, 'player1')).toBe(true);
    });

    test('should not allow decision reversal in other phases', () => {
      const round = sessionManager.createNewRound();
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: true,
      };

      sessionManager.addDecisionToRound(round, decision);

      expect(sessionManager.canReverseDecision(round, 'player1')).toBe(false);
    });

    test('should reverse decision successfully', () => {
      const round = sessionManager.createNewRound();
      const decision: PlayerDecision = {
        playerId: 'player1',
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: true,
      };

      sessionManager.addDecisionToRound(round, decision);

      const success = sessionManager.reverseDecision(
        round,
        'player1',
        Decision.CONFESS
      );
      expect(success).toBe(true);

      const playerDecision = sessionManager.getPlayerDecision(round, 'player1');
      expect(playerDecision?.decision).toBe(Decision.CONFESS);
      expect(playerDecision?.canReverse).toBe(false);
    });

    test('should enable decision reversal for round', () => {
      const round = sessionManager.createNewRound();
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
        sessionManager.addDecisionToRound(round, decision)
      );
      sessionManager.enableDecisionReversalForRound(round);

      expect(round.decisions.every((d) => d.canReverse)).toBe(true);
    });
  });

  describe('session cleanup', () => {
    test('should cleanup session properly', () => {
      sessionManager.createSession(mockSessionConfig);
      sessionManager.addPlayersToSession(mockPlayers);

      expect(sessionManager.getCurrentSession()).not.toBeNull();

      sessionManager.cleanup();

      expect(sessionManager.getCurrentSession()).toBeNull();
      expect(sessionManager.getRoundHistory()).toEqual([]);
    });
  });
});
