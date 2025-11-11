import { WebSocketServer } from '../WebSocketServer';
import { NetworkMessage, NetworkMessageType } from '../../types/network';
import WebSocket from 'ws';

// Mock WebSocket for testing
jest.mock('ws');

describe('WebSocketServer', () => {
  let webSocketServer: WebSocketServer;
  let mockWebSocketServer: jest.Mocked<WebSocket.Server>;
  let mockSocket: jest.Mocked<WebSocket>;

  beforeEach(() => {
    webSocketServer = new WebSocketServer();

    // Create mock WebSocket server
    mockWebSocketServer = {
      on: jest.fn(),
      close: jest.fn(),
      clients: new Set(),
    } as any;

    // Create mock WebSocket
    mockSocket = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      ping: jest.fn(),
      readyState: WebSocket.OPEN,
    } as any;

    // Mock WebSocket.Server constructor
    (
      WebSocket.Server as jest.MockedClass<typeof WebSocket.Server>
    ).mockImplementation(() => mockWebSocketServer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    test('should start WebSocket server on specified port', async () => {
      const port = 8080;

      // Mock successful server start
      mockWebSocketServer.on.mockImplementation((event, callback) => {
        if (event === 'listening') {
          setTimeout(callback, 0);
        }
        return mockWebSocketServer;
      });

      await expect(webSocketServer.start(port)).resolves.toBeUndefined();

      expect(WebSocket.Server).toHaveBeenCalledWith({ port });
      expect(mockWebSocketServer.on).toHaveBeenCalledWith(
        'connection',
        expect.any(Function)
      );
      expect(mockWebSocketServer.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
      expect(mockWebSocketServer.on).toHaveBeenCalledWith(
        'listening',
        expect.any(Function)
      );
    });

    test('should reject if server fails to start', async () => {
      const port = 8080;
      const error = new Error('Port already in use');

      mockWebSocketServer.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(error), 0);
        }
        return mockWebSocketServer;
      });

      await expect(webSocketServer.start(port)).rejects.toThrow(
        'Port already in use'
      );
    });
  });

  describe('stop', () => {
    test('should stop WebSocket server and close connections', async () => {
      mockWebSocketServer.close.mockImplementation((callback) => {
        if (callback) callback();
        return mockWebSocketServer;
      });

      await expect(webSocketServer.stop()).resolves.toBeUndefined();
      expect(mockWebSocketServer.close).toHaveBeenCalled();
    });
  });

  describe('connection handling', () => {
    test('should handle new WebSocket connections', () => {
      const connectionHandler = jest.fn();

      mockWebSocketServer.on.mockImplementation((event, callback) => {
        if (event === 'connection') {
          connectionHandler.mockImplementation(callback);
        }
        return mockWebSocketServer;
      });

      // Start server to set up handlers
      webSocketServer.start(8080).catch(() => {});

      // Simulate new connection
      connectionHandler(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
      expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('pong', expect.any(Function));
    });
  });

  describe('message handling', () => {
    test('should handle valid JSON messages', () => {
      const message: NetworkMessage = {
        type: NetworkMessageType.HEARTBEAT,
        payload: { timestamp: new Date() },
        timestamp: new Date(),
      };

      const messageHandler = jest.fn();
      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          messageHandler.mockImplementation(callback);
        }
        return mockSocket;
      });

      // Start server and simulate connection
      webSocketServer.start(8080).catch(() => {});
      webSocketServer.handleConnection({
        id: 'test-connection',
        socket: mockSocket,
        isAlive: true,
        lastPing: new Date(),
      });

      // Simulate message
      messageHandler(JSON.stringify(message));

      // Verify message was processed (would trigger pong response for heartbeat)
      expect(mockSocket.send).toHaveBeenCalled();
    });

    test('should handle invalid JSON messages gracefully', () => {
      const messageHandler = jest.fn();
      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          messageHandler.mockImplementation(callback);
        }
        return mockSocket;
      });

      webSocketServer.start(8080).catch(() => {});
      webSocketServer.handleConnection({
        id: 'test-connection',
        socket: mockSocket,
        isAlive: true,
        lastPing: new Date(),
      });

      // Simulate invalid JSON
      messageHandler('invalid json');

      // Should send error message
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('INVALID_MESSAGE')
      );
    });
  });

  describe('broadcasting', () => {
    test('should broadcast messages to all connected clients', () => {
      const message: NetworkMessage = {
        type: NetworkMessageType.GAME_STATE_UPDATE,
        payload: { test: 'data' },
        timestamp: new Date(),
      };

      // Add multiple connections
      const connection1 = {
        id: 'conn1',
        socket: { ...mockSocket, readyState: WebSocket.OPEN },
        isAlive: true,
        lastPing: new Date(),
      };

      const connection2 = {
        id: 'conn2',
        socket: { ...mockSocket, readyState: WebSocket.OPEN, send: jest.fn() },
        isAlive: true,
        lastPing: new Date(),
      };

      webSocketServer.handleConnection(connection1);
      webSocketServer.handleConnection(connection2);

      webSocketServer.broadcast(message);

      expect(connection1.socket.send).toHaveBeenCalledWith(
        JSON.stringify(message)
      );
      expect(connection2.socket.send).toHaveBeenCalledWith(
        JSON.stringify(message)
      );
    });

    test('should exclude specified connection from broadcast', () => {
      const message: NetworkMessage = {
        type: NetworkMessageType.GAME_STATE_UPDATE,
        payload: { test: 'data' },
        timestamp: new Date(),
      };

      const connection1 = {
        id: 'conn1',
        socket: { ...mockSocket, readyState: WebSocket.OPEN },
        isAlive: true,
        lastPing: new Date(),
      };

      const connection2 = {
        id: 'conn2',
        socket: { ...mockSocket, readyState: WebSocket.OPEN, send: jest.fn() },
        isAlive: true,
        lastPing: new Date(),
      };

      webSocketServer.handleConnection(connection1);
      webSocketServer.handleConnection(connection2);

      webSocketServer.broadcast(message, 'conn1');

      expect(connection1.socket.send).not.toHaveBeenCalled();
      expect(connection2.socket.send).toHaveBeenCalledWith(
        JSON.stringify(message)
      );
    });
  });

  describe('player messaging', () => {
    test('should send message to specific player', () => {
      const message: NetworkMessage = {
        type: NetworkMessageType.MATCH_FOUND,
        payload: { matchId: 'test-match' },
        timestamp: new Date(),
      };

      const connection = {
        id: 'conn1',
        playerId: 'player1',
        socket: mockSocket,
        isAlive: true,
        lastPing: new Date(),
      };

      webSocketServer.handleConnection(connection);

      const result = webSocketServer.sendToPlayer('player1', message);

      expect(result).toBe(true);
      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    test('should return false for non-existent player', () => {
      const message: NetworkMessage = {
        type: NetworkMessageType.MATCH_FOUND,
        payload: { matchId: 'test-match' },
        timestamp: new Date(),
      };

      const result = webSocketServer.sendToPlayer(
        'non-existent-player',
        message
      );

      expect(result).toBe(false);
    });
  });

  describe('heartbeat system', () => {
    test('should perform heartbeat checks', (done) => {
      const connection = {
        id: 'conn1',
        socket: mockSocket,
        isAlive: true,
        lastPing: new Date(Date.now() - 70000), // 70 seconds ago (should timeout)
      };

      webSocketServer.handleConnection(connection);

      // Mock the heartbeat interval to trigger immediately
      setTimeout(() => {
        // Connection should be removed due to timeout
        const activeConnections = webSocketServer.getActiveConnections();
        expect(activeConnections).toHaveLength(0);
        done();
      }, 100);
    });

    test('should ping active connections', () => {
      const connection = {
        id: 'conn1',
        socket: mockSocket,
        isAlive: true,
        lastPing: new Date(), // Recent ping
      };

      webSocketServer.handleConnection(connection);

      // Simulate heartbeat check
      setTimeout(() => {
        expect(mockSocket.ping).toHaveBeenCalled();
      }, 100);
    });
  });
});
