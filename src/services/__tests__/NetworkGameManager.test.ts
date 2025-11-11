import { NetworkGameManager } from '../NetworkGameManager';
import { ConnectionManager } from '../ConnectionManager';
import { GameEngine } from '../GameEngine';
import { Player, Decision, GamePhase } from '../../types';
import { GameMatch, NetworkMessageType } from '../../types/network';

// Mock dependencies
jest.mock('../ConnectionManager');
jest.mock('../GameEngine');

describe('NetworkGameManager', () => {
  let networkGameManager: NetworkGameManager;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockGameEngine: jest.Mocked<GameEngine>;
  let mockPlayers: Player[];
  let mockMatch: GameMatch;

  beforeEach(() => {
    mockConnectionManager =
      new ConnectionManager() as jest.Mocked<ConnectionManager>;
    mockGameEngine = new GameEngine() as jest.Mocked<GameEngine>;

    mockConnectionManager.sendToPlayer = jest.fn().mockReturnValue(true);
    mockConnectionManager.broadcastToPlayers = jest.fn();

    networkGameManager = new NetworkGameManager(
      mockConnectionManager,
      mockGameEngine
    );

    mockPlayers = [
      {
        id: 'player1',
        name: 'Player 1',
        isAI: false,
        trustScore: 50,
        totalGamesPlayed: 5,
        createdAt: new Date(),
      },
      {
        id: 'player2',
        name: 'Player 2',
        isAI: false,
        trustScore: 55,
        totalGamesPlayed: 3,
        createdAt: new Date(),
      },
    ];

    mockMatch = {
      id: 'match1',
      players: mockPlayers,
      createdAt: new Date(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createNetworkSession', () => {
    test('should create network game session from match', () => {
      const mockSession = {
        id: 'session1',
        players: mockPlayers,
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig: {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
          gameMode: 'multiplayer' as any,
        },
      };

      mockGameEngine.startSession.mockReturnValue(mockSession);

      const result = networkGameManager.createNetworkSession(mockMatch);

      expect(mockGameEngine.startSession).toHaveBeenCalledWith(
        mockPlayers,
        'multiplayer'
      );
      expect(result).toEqual(mockSession);
    });

    test('should notify players about session start', () => {
      const mockSession = {
        id: 'session1',
        players: mockPlayers,
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig: {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
          gameMode: 'multiplayer' as any,
        },
      };

      mockGameEngine.startSession.mockReturnValue(mockSession);

      networkGameManager.createNetworkSession(mockMatch);

      expect(mockConnectionManager.broadcastToPlayers).toHaveBeenCalledWith(
        ['player1', 'player2'],
        expect.objectContaining({
          type: NetworkMessageType.SESSION_START,
        })
      );
    });
  });

  describe('handlePlayerDecision', () => {
    let sessionId: string;

    beforeEach(() => {
      const mockSession = {
        id: 'session1',
        players: mockPlayers,
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig: {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
          gameMode: 'multiplayer' as any,
        },
      };

      mockGameEngine.startSession.mockReturnValue(mockSession);
      networkGameManager.createNetworkSession(mockMatch);
      sessionId = mockSession.id;
    });

    test('should handle player decision and confirm receipt', () => {
      networkGameManager.handlePlayerDecision(
        sessionId,
        'player1',
        Decision.STAY_SILENT
      );

      expect(mockConnectionManager.sendToPlayer).toHaveBeenCalledWith(
        'player1',
        expect.objectContaining({
          type: NetworkMessageType.PLAYER_DECISION,
          payload: expect.objectContaining({
            status: 'received',
            decision: Decision.STAY_SILENT,
          }),
        })
      );
    });

    test('should notify other players about decision received', () => {
      networkGameManager.handlePlayerDecision(
        sessionId,
        'player1',
        Decision.STAY_SILENT
      );

      expect(mockConnectionManager.broadcastToPlayers).toHaveBeenCalledWith(
        ['player2'], // Exclude the player who made the decision
        expect.objectContaining({
          type: NetworkMessageType.WAITING_FOR_OPPONENT,
          payload: expect.objectContaining({
            playerId: 'player1',
            hasDecided: true,
          }),
        })
      );
    });

    test('should process round when all players have decided', () => {
      const mockRoundResult = {
        round: {
          roundNumber: 1,
          decisions: [],
          results: { playerA: 3, playerB: 3 },
          timestamp: new Date(),
          phaseType: GamePhase.TRUST_PHASE,
        },
        gameEnded: false,
      };

      mockGameEngine.processRound.mockReturnValue(mockRoundResult);

      // Both players make decisions
      networkGameManager.handlePlayerDecision(
        sessionId,
        'player1',
        Decision.STAY_SILENT
      );
      networkGameManager.handlePlayerDecision(
        sessionId,
        'player2',
        Decision.STAY_SILENT
      );

      expect(mockGameEngine.processRound).toHaveBeenCalled();
      expect(mockConnectionManager.broadcastToPlayers).toHaveBeenCalledWith(
        ['player1', 'player2'],
        expect.objectContaining({
          type: NetworkMessageType.ROUND_RESULT,
        })
      );
    });

    test('should handle non-existent session gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      networkGameManager.handlePlayerDecision(
        'non-existent',
        'player1',
        Decision.STAY_SILENT
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Session not found: non-existent'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handlePlayerDisconnection', () => {
    let sessionId: string;

    beforeEach(() => {
      const mockSession = {
        id: 'session1',
        players: mockPlayers,
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig: {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
          gameMode: 'multiplayer' as any,
        },
      };

      mockGameEngine.startSession.mockReturnValue(mockSession);
      networkGameManager.createNetworkSession(mockMatch);
      sessionId = mockSession.id;
    });

    test('should handle player disconnection', () => {
      networkGameManager.handlePlayerDisconnection(sessionId, 'player1');

      expect(mockConnectionManager.broadcastToPlayers).toHaveBeenCalledWith(
        ['player2'], // Notify remaining players
        expect.objectContaining({
          type: NetworkMessageType.DISCONNECT,
          payload: expect.objectContaining({
            playerId: 'player1',
            status: 'disconnected',
          }),
        })
      );
    });

    test('should track disconnected players', () => {
      networkGameManager.handlePlayerDisconnection(sessionId, 'player1');

      const session = networkGameManager.getActiveSession(sessionId);
      expect(session?.disconnectedPlayers.has('player1')).toBe(true);
      expect(session?.connectedPlayers.has('player1')).toBe(false);
    });
  });

  describe('handlePlayerReconnection', () => {
    let sessionId: string;

    beforeEach(() => {
      const mockSession = {
        id: 'session1',
        players: mockPlayers,
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig: {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
          gameMode: 'multiplayer' as any,
        },
      };

      mockGameEngine.startSession.mockReturnValue(mockSession);
      networkGameManager.createNetworkSession(mockMatch);
      sessionId = mockSession.id;

      // First disconnect the player
      networkGameManager.handlePlayerDisconnection(sessionId, 'player1');
    });

    test('should handle player reconnection', () => {
      networkGameManager.handlePlayerReconnection(sessionId, 'player1');

      expect(mockConnectionManager.sendToPlayer).toHaveBeenCalledWith(
        'player1',
        expect.objectContaining({
          type: NetworkMessageType.RECONNECT,
          payload: expect.objectContaining({
            status: 'reconnected',
          }),
        })
      );
    });

    test('should notify other players about reconnection', () => {
      networkGameManager.handlePlayerReconnection(sessionId, 'player1');

      expect(mockConnectionManager.broadcastToPlayers).toHaveBeenCalledWith(
        ['player2'],
        expect.objectContaining({
          type: NetworkMessageType.RECONNECT,
          payload: expect.objectContaining({
            playerId: 'player1',
            status: 'reconnected',
          }),
        })
      );
    });

    test('should move player back to connected set', () => {
      networkGameManager.handlePlayerReconnection(sessionId, 'player1');

      const session = networkGameManager.getActiveSession(sessionId);
      expect(session?.connectedPlayers.has('player1')).toBe(true);
      expect(session?.disconnectedPlayers.has('player1')).toBe(false);
    });
  });

  describe('synchronizeGameState', () => {
    let sessionId: string;

    beforeEach(() => {
      const mockSession = {
        id: 'session1',
        players: mockPlayers,
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig: {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
          gameMode: 'multiplayer' as any,
        },
      };

      mockGameEngine.startSession.mockReturnValue(mockSession);
      networkGameManager.createNetworkSession(mockMatch);
      sessionId = mockSession.id;
    });

    test('should synchronize game state to all players', () => {
      const gameState = networkGameManager.synchronizeGameState(sessionId);

      expect(gameState).toBeDefined();
      expect(gameState.session).toBeDefined();
      expect(mockConnectionManager.broadcastToPlayers).toHaveBeenCalledWith(
        ['player1', 'player2'],
        expect.objectContaining({
          type: NetworkMessageType.GAME_STATE_UPDATE,
        })
      );
    });

    test('should throw error for non-existent session', () => {
      expect(() => {
        networkGameManager.synchronizeGameState('non-existent');
      }).toThrow('Session not found: non-existent');
    });
  });

  describe('session management', () => {
    test('should track active sessions', () => {
      const mockSession = {
        id: 'session1',
        players: mockPlayers,
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig: {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
          gameMode: 'multiplayer' as any,
        },
      };

      mockGameEngine.startSession.mockReturnValue(mockSession);
      networkGameManager.createNetworkSession(mockMatch);

      const activeSessions = networkGameManager.getAllActiveSessions();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].session.id).toBe('session1');
    });

    test('should provide session statistics', () => {
      const mockSession = {
        id: 'session1',
        players: mockPlayers,
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig: {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
          gameMode: 'multiplayer' as any,
        },
      };

      mockGameEngine.startSession.mockReturnValue(mockSession);
      networkGameManager.createNetworkSession(mockMatch);

      const stats = networkGameManager.getSessionStats();
      expect(stats.activeSessions).toBe(1);
      expect(stats.totalPlayers).toBe(2);
      expect(stats.connectedPlayers).toBe(2);
    });
  });

  describe('game ending', () => {
    let sessionId: string;

    beforeEach(() => {
      const mockSession = {
        id: 'session1',
        players: mockPlayers,
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig: {
          maxRounds: 1, // End after 1 round
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
          gameMode: 'multiplayer' as any,
        },
      };

      mockGameEngine.startSession.mockReturnValue(mockSession);
      networkGameManager.createNetworkSession(mockMatch);
      sessionId = mockSession.id;
    });

    test('should end session when game completes', () => {
      const mockRoundResult = {
        round: {
          roundNumber: 1,
          decisions: [],
          results: { playerA: 3, playerB: 3 },
          timestamp: new Date(),
          phaseType: GamePhase.TRUST_PHASE,
        },
        gameEnded: true,
        winner: mockPlayers[0],
      };

      const mockSessionResult = {
        session: {
          id: sessionId,
          players: mockPlayers,
          rounds: [mockRoundResult.round],
          currentPhase: GamePhase.TRUST_PHASE,
          startTime: new Date(),
          endTime: new Date(),
          winner: mockPlayers[0],
          sessionConfig: {
            maxRounds: 1,
            trustPhaseRounds: 5,
            communicationTimeLimit: 60,
            allowDecisionReversal: true,
            gameMode: 'multiplayer' as any,
          },
        },
        finalScores: { player1: 3, player2: 3 },
        winner: mockPlayers[0],
        statistics: {
          cooperationPercentage: 100,
          betrayalPercentage: 0,
          totalPoints: 3,
          gamesWon: 1,
          gamesLost: 0,
          averageTrustScore: 50,
        },
      };

      mockGameEngine.processRound.mockReturnValue(mockRoundResult);
      mockGameEngine.endSession.mockReturnValue(mockSessionResult);

      // Both players make decisions
      networkGameManager.handlePlayerDecision(
        sessionId,
        'player1',
        Decision.STAY_SILENT
      );
      networkGameManager.handlePlayerDecision(
        sessionId,
        'player2',
        Decision.STAY_SILENT
      );

      expect(mockGameEngine.endSession).toHaveBeenCalled();
      expect(mockConnectionManager.broadcastToPlayers).toHaveBeenCalledWith(
        ['player1', 'player2'],
        expect.objectContaining({
          type: NetworkMessageType.SESSION_END,
        })
      );

      // Session should be cleaned up
      const activeSession = networkGameManager.getActiveSession(sessionId);
      expect(activeSession).toBeUndefined();
    });
  });
});
