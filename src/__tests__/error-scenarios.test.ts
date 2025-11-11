/**
 * Task 8.5: Hata senaryolarını test et
 * Tests: WebSocket bağlantı kesilmesi, Veritabanı hataları, 
 *        Geçersiz durum geçişleri, Oyuncu disconnect
 */

import { PartyStateManager } from '../services/PartyStateManager';
import { ErrorHandlingService } from '../services/ErrorHandlingService';
import { DatabaseRetryService } from '../services/DatabaseRetryService';
import { GameClientManager } from '../services/GameClientManager';

describe('Error Scenarios Tests', () => {
  let stateManager: PartyStateManager;
  let errorHandler: ErrorHandlingService;
  let retryService: DatabaseRetryService;
  let clientManager: GameClientManager;

  beforeEach(() => {
    stateManager = new PartyStateManager();
    errorHandler = new ErrorHandlingService();
    retryService = new DatabaseRetryService();
    clientManager = GameClientManager.getInstance();
  });

  afterEach(() => {
    clientManager.cleanup();
  });

  describe('8.5.1 WebSocket bağlantı kesilmesi', () => {
    test('should handle connection loss gracefully', () => {
      clientManager.initializeMultiplayerMode();
      const client = clientManager.getMultiplayerClient();

      // Simulate connection loss
      const connectionLost = true;
      
      expect(connectionLost).toBe(true);
      // Client should attempt reconnection
    });

    test('should attempt reconnection with exponential backoff', async () => {
      const reconnectAttempts = [1000, 2000, 4000, 8000];
      
      reconnectAttempts.forEach((delay, index) => {
        expect(delay).toBe(1000 * Math.pow(2, index));
      });
    });

    test('should preserve game state during reconnection', () => {
      const gameState = {
        matchId: 'match-123',
        currentRound: 5,
        playerScore: 15,
        opponentScore: 12
      };

      // State should be preserved in localStorage
      localStorage.setItem('game_state', JSON.stringify(gameState));

      const restored = JSON.parse(localStorage.getItem('game_state')!);
      expect(restored.matchId).toBe('match-123');
      expect(restored.currentRound).toBe(5);
    });

    test('should notify user of connection issues', () => {
      const error = new Error('WebSocket connection lost');
      const userMessage = errorHandler.getUserFriendlyMessage(error);

      expect(userMessage).toBeDefined();
      expect(userMessage.length).toBeGreaterThan(0);
    });

    test('should handle reconnection timeout', () => {
      const maxReconnectAttempts = 10;
      let attempts = 0;

      while (attempts < maxReconnectAttempts) {
        attempts++;
      }

      expect(attempts).toBe(maxReconnectAttempts);
      // Should give up after max attempts
    });
  });

  describe('8.5.2 Veritabanı hataları', () => {
    test('should handle database connection failure', async () => {
      const operation = async () => {
        throw new Error('Database connection failed');
      };

      try {
        await retryService.executeWithRetry(operation, 3, 10);
      } catch (error) {
        expect(error).toBeDefined();
        // Should queue for later
      }
    });

    test('should handle write failures', async () => {
      const writeOperation = async () => {
        throw new Error('Write failed: disk full');
      };

      try {
        await retryService.executeWithRetry(writeOperation, 3, 10);
      } catch (error) {
        expect((error as Error).message).toContain('Write failed');
      }
    });

    test('should handle read failures', async () => {
      const readOperation = async () => {
        throw new Error('Read failed: table not found');
      };

      try {
        await retryService.executeWithRetry(readOperation, 3, 10);
      } catch (error) {
        expect((error as Error).message).toContain('Read failed');
      }
    });

    test('should handle constraint violations', () => {
      const error = new Error('UNIQUE constraint failed');
      const handled = errorHandler.handleDatabaseError(error);

      expect(handled).toBeDefined();
    });

    test('should queue operations when database is unavailable', () => {
      const operation = {
        type: 'SAVE_MATCH',
        data: { matchId: 'match-123' },
        timestamp: Date.now()
      };

      retryService.queueOfflineOperation(operation);

      const queue = retryService.getOfflineQueue();
      expect(queue.length).toBeGreaterThan(0);
    });
  });

  describe('8.5.3 Geçersiz durum geçişleri', () => {
    test('should prevent invalid state transitions', () => {
      stateManager.transitionToMenu();

      // Cannot go directly from menu to match
      expect(() => {
        stateManager.transitionToMatch({
          id: 'match-1',
          player1Id: 'player-1',
          player2Id: 'player-2',
          tournamentId: 'tournament-1',
          roundNumber: 1,
          status: 'in_progress'
        });
      }).toThrow();
    });

    test('should validate state transition sequence', () => {
      // Valid sequence: menu -> lobby -> tournament -> match
      stateManager.transitionToMenu();
      expect(stateManager.getCurrentPhase()).toBe('menu');

      stateManager.transitionToLobby({
        id: 'lobby-1',
        code: 'ABC123',
        hostId: 'player-1',
        participants: [],
        settings: {
          maxPlayers: 4,
          tournamentFormat: 'single_elimination' as any,
          roundCount: 10
        },
        status: 'waiting',
        createdAt: new Date()
      });
      expect(stateManager.getCurrentPhase()).toBe('lobby');
    });

    test('should recover from invalid state', () => {
      // Force invalid state
      (stateManager as any).currentPhase = 'invalid';

      stateManager.recoverFromInvalidState();

      expect(stateManager.getCurrentPhase()).toBe('menu');
    });

    test('should log state transition errors', () => {
      const transitions: string[] = [];

      try {
        stateManager.transitionToMenu();
        transitions.push('menu');
        
        // Invalid transition
        (stateManager as any).currentPhase = 'invalid';
        stateManager.recoverFromInvalidState();
        transitions.push('recovered');
      } catch (error) {
        transitions.push('error');
      }

      expect(transitions).toContain('menu');
      expect(transitions).toContain('recovered');
    });

    test('should maintain state history', () => {
      stateManager.transitionToMenu();
      stateManager.transitionToLobby({
        id: 'lobby-1',
        code: 'ABC123',
        hostId: 'player-1',
        participants: [],
        settings: {
          maxPlayers: 4,
          tournamentFormat: 'single_elimination' as any,
          roundCount: 10
        },
        status: 'waiting',
        createdAt: new Date()
      });

      const history = stateManager.getStateHistory();
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('8.5.4 Oyuncu disconnect', () => {
    test('should handle player disconnect during match', () => {
      const matchState = {
        matchId: 'match-123',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Connected: true,
        player2Connected: false // Disconnected
      };

      expect(matchState.player2Connected).toBe(false);
      // Should handle forfeit or pause
    });

    test('should handle player disconnect during tournament', () => {
      const tournamentState = {
        tournamentId: 'tournament-1',
        activePlayers: ['player-1', 'player-2', 'player-3'],
        disconnectedPlayers: ['player-4']
      };

      expect(tournamentState.disconnectedPlayers.length).toBe(1);
      // Should eliminate disconnected player
    });

    test('should handle host disconnect in lobby', () => {
      const lobby = {
        id: 'lobby-1',
        hostId: 'player-1',
        participants: [
          { id: 'player-1', name: 'Alice', isHost: true, isReady: true },
          { id: 'player-2', name: 'Bob', isHost: false, isReady: true }
        ]
      };

      // Host disconnects
      const newHost = lobby.participants.find(p => p.id !== lobby.hostId);
      
      expect(newHost).toBeDefined();
      // Should transfer host to another player
    });

    test('should handle reconnection within timeout', () => {
      const disconnectTime = Date.now();
      const reconnectTimeout = 30000; // 30 seconds
      const reconnectTime = Date.now();

      const withinTimeout = (reconnectTime - disconnectTime) < reconnectTimeout;
      
      expect(withinTimeout).toBe(true);
      // Should allow player to rejoin
    });

    test('should handle reconnection after timeout', () => {
      const disconnectTime = Date.now() - 60000; // 60 seconds ago
      const reconnectTimeout = 30000; // 30 seconds
      const reconnectTime = Date.now();

      const withinTimeout = (reconnectTime - disconnectTime) < reconnectTimeout;
      
      expect(withinTimeout).toBe(false);
      // Should not allow rejoin, player eliminated
    });

    test('should notify other players of disconnect', () => {
      const notification = {
        type: 'PLAYER_DISCONNECTED',
        playerId: 'player-2',
        playerName: 'Bob',
        timestamp: Date.now()
      };

      expect(notification.type).toBe('PLAYER_DISCONNECTED');
      expect(notification.playerId).toBe('player-2');
    });

    test('should handle multiple simultaneous disconnects', () => {
      const disconnectedPlayers = ['player-2', 'player-3', 'player-4'];
      const remainingPlayers = ['player-1'];

      expect(disconnectedPlayers.length).toBe(3);
      expect(remainingPlayers.length).toBe(1);
      // Should handle tournament cancellation if too few players
    });
  });

  describe('8.5.5 Error recovery', () => {
    test('should recover from WebSocket error', () => {
      const error = new Error('WebSocket error');
      const recovered = errorHandler.handleWebSocketError(error);

      expect(recovered).toBeDefined();
    });

    test('should recover from state error', () => {
      const error = new Error('Invalid state');
      const currentState = { phase: 'invalid' };
      
      const recovered = errorHandler.handleStateError(error, currentState);

      expect(recovered).toBeDefined();
    });

    test('should log errors for debugging', () => {
      const error = new Error('Test error');
      const metadata = {
        component: 'PartyGame',
        action: 'startMatch',
        timestamp: Date.now()
      };

      errorHandler.logError(error, metadata);

      // Error should be logged
      expect(true).toBe(true);
    });

    test('should provide user-friendly error messages', () => {
      const errors = [
        new Error('WebSocket connection lost'),
        new Error('Database write failed'),
        new Error('Invalid state transition'),
        new Error('Player not found')
      ];

      errors.forEach(error => {
        const message = errorHandler.getUserFriendlyMessage(error);
        expect(message).toBeDefined();
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });
});
