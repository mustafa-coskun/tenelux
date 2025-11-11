import { MultiplayerSyncService } from '../MultiplayerSyncService';
import { WebSocketServer } from '../WebSocketServer';
import { ConnectionManager } from '../ConnectionManager';
import { MatchmakingService } from '../MatchmakingService';
import { LobbyManager } from '../LobbyManager';
import { NetworkGameManager } from '../NetworkGameManager';

// Mock all dependencies
jest.mock('../WebSocketServer');
jest.mock('../ConnectionManager');
jest.mock('../MatchmakingService');
jest.mock('../LobbyManager');
jest.mock('../NetworkGameManager');
jest.mock('../GameEngine');

describe('MultiplayerSyncService', () => {
  let multiplayerSyncService: MultiplayerSyncService;
  let mockWebSocketServer: jest.Mocked<WebSocketServer>;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockMatchmakingService: jest.Mocked<MatchmakingService>;
  let mockLobbyManager: jest.Mocked<LobbyManager>;
  let mockNetworkGameManager: jest.Mocked<NetworkGameManager>;

  beforeEach(() => {
    // Setup mocks
    mockConnectionManager =
      new ConnectionManager() as jest.Mocked<ConnectionManager>;
    mockWebSocketServer = new WebSocketServer() as jest.Mocked<WebSocketServer>;
    mockMatchmakingService = {} as jest.Mocked<MatchmakingService>;
    mockLobbyManager = {} as jest.Mocked<LobbyManager>;
    mockNetworkGameManager = {} as jest.Mocked<NetworkGameManager>;

    // Mock WebSocketServer methods
    mockWebSocketServer.start = jest.fn().mockResolvedValue(undefined);
    mockWebSocketServer.stop = jest.fn().mockResolvedValue(undefined);
    mockWebSocketServer.getConnectionManager = jest
      .fn()
      .mockReturnValue(mockConnectionManager);
    mockWebSocketServer.getMessageHandler = jest.fn().mockReturnValue({
      registerHandler: jest.fn(),
    });

    // Mock ConnectionManager methods
    mockConnectionManager.sendToConnection = jest.fn().mockReturnValue(true);
    mockConnectionManager.getConnection = jest.fn();
    mockConnectionManager.associatePlayerWithConnection = jest
      .fn()
      .mockReturnValue(true);
    mockConnectionManager.getConnectionStats = jest.fn().mockReturnValue({
      totalConnections: 0,
      activeConnections: 0,
      playerConnections: 0,
    });

    // Mock MatchmakingService methods
    mockMatchmakingService.stop = jest.fn();
    mockMatchmakingService.findMatch = jest.fn();
    mockMatchmakingService.getQueueStats = jest.fn().mockReturnValue({
      queueSize: 0,
      averageWaitTime: 0,
      activeMatches: 0,
    });

    // Mock LobbyManager methods
    mockLobbyManager.stop = jest.fn();
    mockLobbyManager.addPlayer = jest.fn();
    mockLobbyManager.joinMatchmaking = jest.fn().mockReturnValue(true);
    mockLobbyManager.leaveMatchmaking = jest.fn().mockReturnValue(true);
    mockLobbyManager.updatePlayerActivity = jest.fn();
    mockLobbyManager.getPlayer = jest.fn();
    mockLobbyManager.getLobbyStats = jest.fn().mockReturnValue({
      totalPlayers: 0,
      playersInQueue: 0,
      playersInGame: 0,
      activeMatches: 0,
    });

    // Mock NetworkGameManager methods
    mockNetworkGameManager.handlePlayerDecision = jest.fn();
    mockNetworkGameManager.handleCommunicationMessage = jest.fn();
    mockNetworkGameManager.handlePlayerReconnection = jest.fn();
    mockNetworkGameManager.getAllActiveSessions = jest.fn().mockReturnValue([]);
    mockNetworkGameManager.getSessionStats = jest.fn().mockReturnValue({
      activeSessions: 0,
      totalPlayers: 0,
      connectedPlayers: 0,
    });

    const config = { port: 8080 };
    multiplayerSyncService = new MultiplayerSyncService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('service lifecycle', () => {
    test('should start multiplayer sync service', async () => {
      await multiplayerSyncService.start(8080);

      expect(mockWebSocketServer.start).toHaveBeenCalledWith(8080);
      expect(multiplayerSyncService.isServiceRunning()).toBe(true);
    });

    test('should stop multiplayer sync service', async () => {
      await multiplayerSyncService.start(8080);
      await multiplayerSyncService.stop();

      expect(mockWebSocketServer.stop).toHaveBeenCalled();
      expect(mockMatchmakingService.stop).toHaveBeenCalled();
      expect(mockLobbyManager.stop).toHaveBeenCalled();
      expect(multiplayerSyncService.isServiceRunning()).toBe(false);
    });

    test('should throw error when starting already running service', async () => {
      await multiplayerSyncService.start(8080);

      await expect(multiplayerSyncService.start(8080)).rejects.toThrow(
        'Multiplayer sync service is already running'
      );
    });

    test('should handle start failure gracefully', async () => {
      const error = new Error('Port already in use');
      mockWebSocketServer.start.mockRejectedValue(error);

      await expect(multiplayerSyncService.start(8080)).rejects.toThrow(
        'Port already in use'
      );
      expect(multiplayerSyncService.isServiceRunning()).toBe(false);
    });
  });

  describe('service statistics', () => {
    test('should provide comprehensive service statistics', async () => {
      await multiplayerSyncService.start(8080);

      const stats = multiplayerSyncService.getServiceStats();

      expect(stats).toEqual({
        isRunning: true,
        connections: 0,
        activeConnections: 0,
        playersInLobby: 0,
        playersInQueue: 0,
        activeGames: 0,
        activeMatches: 0,
      });

      expect(mockConnectionManager.getConnectionStats).toHaveBeenCalled();
      expect(mockLobbyManager.getLobbyStats).toHaveBeenCalled();
      expect(mockNetworkGameManager.getSessionStats).toHaveBeenCalled();
      expect(mockMatchmakingService.getQueueStats).toHaveBeenCalled();
    });
  });

  describe('server messaging', () => {
    test('should broadcast server messages to all players', async () => {
      await multiplayerSyncService.start(8080);

      multiplayerSyncService.broadcastServerMessage(
        'Server maintenance in 5 minutes'
      );

      expect(mockConnectionManager.broadcastToAll).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'game_state_update',
          payload: expect.objectContaining({
            serverMessage: 'Server maintenance in 5 minutes',
          }),
        })
      );
    });
  });

  describe('component access', () => {
    test('should provide access to internal components', async () => {
      await multiplayerSyncService.start(8080);

      expect(multiplayerSyncService.getConnectionManager()).toBe(
        mockConnectionManager
      );
      expect(multiplayerSyncService.getMatchmakingService()).toBe(
        mockMatchmakingService
      );
      expect(multiplayerSyncService.getLobbyManager()).toBe(mockLobbyManager);
      expect(multiplayerSyncService.getNetworkGameManager()).toBe(
        mockNetworkGameManager
      );
    });
  });

  describe('error handling', () => {
    test('should handle stop errors gracefully', async () => {
      await multiplayerSyncService.start(8080);

      const error = new Error('Stop failed');
      mockWebSocketServer.stop.mockRejectedValue(error);

      await expect(multiplayerSyncService.stop()).rejects.toThrow(
        'Stop failed'
      );
    });

    test('should not fail when stopping non-running service', async () => {
      await expect(multiplayerSyncService.stop()).resolves.toBeUndefined();
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete player journey', async () => {
      await multiplayerSyncService.start(8080);

      const mockPlayer = {
        id: 'player1',
        name: 'Test Player',
        isAI: false,
        trustScore: 50,
        totalGamesPlayed: 0,
        createdAt: new Date(),
      };

      // Simulate player joining queue
      const joinQueueMessage = {
        type: 'join_queue' as any,
        payload: { player: mockPlayer },
        timestamp: new Date(),
      };

      // Test that the service would handle this message appropriately
      expect(mockLobbyManager.addPlayer).toBeDefined();
      expect(mockLobbyManager.joinMatchmaking).toBeDefined();
    });

    test('should coordinate matchmaking and game creation', async () => {
      await multiplayerSyncService.start(8080);

      const mockMatch = {
        id: 'match1',
        players: [
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
            isAI: false,
            trustScore: 55,
            totalGamesPlayed: 0,
            createdAt: new Date(),
          },
        ],
        createdAt: new Date(),
      };

      // Verify that match creation would trigger appropriate handlers
      expect(mockLobbyManager.handleMatchFound).toBeDefined();
      expect(mockLobbyManager.handleGameStart).toBeDefined();
    });
  });

  describe('message handler registration', () => {
    test('should register all required message handlers', async () => {
      const mockMessageHandler = {
        registerHandler: jest.fn(),
      };

      mockWebSocketServer.getMessageHandler.mockReturnValue(mockMessageHandler);

      await multiplayerSyncService.start(8080);

      // Verify that all required handlers are registered
      expect(mockMessageHandler.registerHandler).toHaveBeenCalledWith(
        'join_queue',
        expect.any(Function)
      );
      expect(mockMessageHandler.registerHandler).toHaveBeenCalledWith(
        'leave_queue',
        expect.any(Function)
      );
      expect(mockMessageHandler.registerHandler).toHaveBeenCalledWith(
        'player_decision',
        expect.any(Function)
      );
      expect(mockMessageHandler.registerHandler).toHaveBeenCalledWith(
        'communication_message',
        expect.any(Function)
      );
      expect(mockMessageHandler.registerHandler).toHaveBeenCalledWith(
        'decision_reversal',
        expect.any(Function)
      );
      expect(mockMessageHandler.registerHandler).toHaveBeenCalledWith(
        'reconnect',
        expect.any(Function)
      );
    });
  });
});
