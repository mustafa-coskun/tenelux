import { getStateManager, StoredSession } from '../StateManager';
import { User, GameSession } from '../UserService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock performance.now for consistent timing
const mockPerformanceNow = jest.fn(() => Date.now());
Object.defineProperty(window, 'performance', {
  value: { now: mockPerformanceNow }
});

describe('StateManager', () => {
  let stateManager: any;
  let mockUser: User;
  let mockSession: GameSession;
  let mockStoredSession: StoredSession;

  beforeEach(() => {
    // Clear storage before each test
    localStorageMock.clear();
    
    // Get fresh instance
    stateManager = getStateManager();
    
    // Create mock data
    mockUser = {
      id: 'test-user-123',
      name: 'TestPlayer',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      lastActive: new Date('2024-01-01T12:00:00Z')
    };

    mockSession = {
      userId: 'test-user-123',
      currentState: 'lobby',
      lobbyId: 'test-lobby-456',
      lastUpdated: new Date('2024-01-01T12:00:00Z')
    };

    mockStoredSession = {
      user: mockUser,
      gameSession: mockSession,
      timestamp: Date.now(),
      version: '1.0.0',
      lobbyData: {
        id: 'test-lobby-456',
        code: 'ABC123',
        name: 'Test Lobby',
        status: 'waiting_for_players',
        hostPlayerId: 'test-user-123',
        currentPlayerCount: 1,
        maxPlayers: 4,
        participants: [
          {
            id: 'test-user-123',
            name: 'TestPlayer',
            isHost: true,
            isReady: false
          }
        ],
        createdAt: new Date('2024-01-01T11:00:00Z')
      }
    };
  });

  describe('State Saving and Loading', () => {
    test('should save state with optimization', () => {
      stateManager.saveState(mockUser, mockSession, { lobbyData: mockStoredSession.lobbyData });
      
      const savedData = localStorageMock.getItem('tenebris_full_session');
      expect(savedData).toBeDefined();
      expect(savedData).not.toBe('');
    });

    test('should load and deserialize state correctly', async () => {
      stateManager.saveState(mockUser, mockSession, { lobbyData: mockStoredSession.lobbyData });
      
      const loadedSession = await stateManager.loadState();
      
      expect(loadedSession).toBeDefined();
      expect(loadedSession!.user.id).toBe(mockUser.id);
      expect(loadedSession!.user.name).toBe(mockUser.name);
      expect(loadedSession!.gameSession.currentState).toBe(mockSession.currentState);
      expect(loadedSession!.gameSession.lobbyId).toBe(mockSession.lobbyId);
    });

    test('should return null when no state exists', async () => {
      const loadedSession = await stateManager.loadState();
      expect(loadedSession).toBeNull();
    });

    test('should handle corrupted state data gracefully', async () => {
      localStorageMock.setItem('tenebris_full_session', 'invalid-json');
      
      const loadedSession = await stateManager.loadState();
      expect(loadedSession).toBeNull();
      expect(localStorageMock.getItem('tenebris_full_session')).toBeNull();
    });
  });

  describe('State Validation', () => {
    test('should validate correct session data', () => {
      const validation = stateManager.isStateValid(mockStoredSession);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.canRecover).toBe(true);
    });

    test('should detect expired sessions', () => {
      const expiredSession = {
        ...mockStoredSession,
        timestamp: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
      };
      
      const validation = stateManager.isStateValid(expiredSession);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Session expired');
      expect(validation.canRecover).toBe(false);
    });

    test('should detect version mismatch', () => {
      const versionMismatchSession = {
        ...mockStoredSession,
        version: '0.9.0'
      };
      
      const validation = stateManager.isStateValid(versionMismatchSession);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Version mismatch');
    });

    test('should detect invalid user data', () => {
      const invalidUserSession = {
        ...mockStoredSession,
        user: { ...mockUser, id: '' }
      };
      
      const validation = stateManager.isStateValid(invalidUserSession);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid user data');
      expect(validation.canRecover).toBe(false);
    });

    test('should detect user ID mismatch', () => {
      const mismatchSession = {
        ...mockStoredSession,
        gameSession: { ...mockSession, userId: 'different-user' }
      };
      
      const validation = stateManager.isStateValid(mismatchSession);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('User ID mismatch');
      expect(validation.canRecover).toBe(false);
    });

    test('should validate lobby state requirements', () => {
      const invalidLobbySession = {
        ...mockStoredSession,
        gameSession: { ...mockSession, currentState: 'lobby' as const, lobbyId: undefined },
        lobbyData: undefined
      };
      
      const validation = stateManager.isStateValid(invalidLobbySession);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Lobby state incomplete');
      expect(validation.canRecover).toBe(false);
    });
  });

  describe('State Recovery', () => {
    test('should recover lobby state successfully', async () => {
      const result = await stateManager.recoverFromState(mockStoredSession);
      
      expect(result.success).toBe(true);
      expect(result.recoveredState).toBeDefined();
      expect(result.recoveredState.gameState).toBe('lobby');
      expect(result.recoveredState.lobbyData).toBeDefined();
    });

    test('should fail recovery for invalid session', async () => {
      const invalidSession = {
        ...mockStoredSession,
        user: { ...mockUser, id: '' }
      };
      
      const result = await stateManager.recoverFromState(invalidSession);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should recover tournament state', async () => {
      const tournamentSession = {
        ...mockStoredSession,
        gameSession: { ...mockSession, currentState: 'tournament' as const, tournamentId: 'test-tournament' },
        tournamentData: {
          id: 'test-tournament',
          name: 'Test Tournament',
          status: 'in_progress',
          format: 'single_elimination',
          currentRound: 1,
          totalRounds: 3,
          players: [
            { id: 'test-user-123', name: 'TestPlayer', status: 'ready' }
          ]
        }
      };
      
      const result = await stateManager.recoverFromState(tournamentSession);
      
      expect(result.success).toBe(true);
      expect(result.recoveredState.gameState).toBe('tournament');
      expect(result.recoveredState.tournamentData).toBeDefined();
    });

    test('should recover spectator state', async () => {
      const spectatorSession = {
        ...mockStoredSession,
        gameSession: { ...mockSession, currentState: 'spectator' as const }
      };
      
      const result = await stateManager.recoverFromState(spectatorSession);
      
      expect(result.success).toBe(true);
      expect(result.recoveredState.gameState).toBe('spectator');
    });
  });

  describe('State Cleanup', () => {
    test('should clear all state data', () => {
      stateManager.saveState(mockUser, mockSession);
      stateManager.saveLobbyData(mockStoredSession.lobbyData!);
      
      stateManager.clearState();
      
      expect(localStorageMock.getItem('tenebris_full_session')).toBeNull();
      expect(localStorageMock.getItem('tenebris_lobby_cache')).toBeNull();
      expect(localStorageMock.getItem('tenebris_tournament_cache')).toBeNull();
    });

    test('should clear only lobby state', () => {
      stateManager.saveState(mockUser, mockSession, { lobbyData: mockStoredSession.lobbyData });
      
      stateManager.clearLobbyState();
      
      const remainingSession = JSON.parse(localStorageMock.getItem('tenebris_full_session') || '{}');
      expect(remainingSession.gameSession?.currentState).toBe('menu');
      expect(remainingSession.gameSession?.lobbyId).toBeUndefined();
      expect(remainingSession.lobbyData).toBeUndefined();
    });

    test('should clear all data on complete logout', () => {
      stateManager.saveState(mockUser, mockSession);
      localStorageMock.setItem('tenebris_user', JSON.stringify(mockUser));
      localStorageMock.setItem('currentLobby', JSON.stringify(mockStoredSession.lobbyData));
      
      stateManager.clearAllData();
      
      expect(localStorageMock.getItem('tenebris_full_session')).toBeNull();
      expect(localStorageMock.getItem('tenebris_user')).toBeNull();
      expect(localStorageMock.getItem('currentLobby')).toBeNull();
    });
  });

  describe('Cache Management', () => {
    test('should save and load lobby data', () => {
      stateManager.saveLobbyData(mockStoredSession.lobbyData!);
      
      const loadedLobby = stateManager.loadLobbyData();
      
      expect(loadedLobby).toBeDefined();
      expect(loadedLobby!.id).toBe(mockStoredSession.lobbyData!.id);
      expect(loadedLobby!.code).toBe(mockStoredSession.lobbyData!.code);
    });

    test('should expire old lobby cache', () => {
      // Manually set old cache
      const oldCache = {
        data: mockStoredSession.lobbyData,
        timestamp: Date.now() - (2 * 60 * 60 * 1000) // 2 hours ago
      };
      localStorageMock.setItem('tenebris_lobby_cache', JSON.stringify(oldCache));
      
      const loadedLobby = stateManager.loadLobbyData();
      expect(loadedLobby).toBeNull();
    });

    test('should handle corrupted cache gracefully', () => {
      localStorageMock.setItem('tenebris_lobby_cache', 'invalid-json');
      
      const loadedLobby = stateManager.loadLobbyData();
      expect(loadedLobby).toBeNull();
      expect(localStorageMock.getItem('tenebris_lobby_cache')).toBeNull();
    });
  });

  describe('Recovery Information', () => {
    test('should provide recovery info for existing session', () => {
      stateManager.saveState(mockUser, mockSession, { lobbyData: mockStoredSession.lobbyData });
      
      const info = stateManager.getRecoveryInfo();
      
      expect(info.hasRecoverableSession).toBe(true);
      expect(info.sessionType).toBe('lobby');
      expect(info.canRecover).toBe(true);
      expect(info.sessionAge).toBeGreaterThan(0);
    });

    test('should indicate no recoverable session when none exists', () => {
      const info = stateManager.getRecoveryInfo();
      
      expect(info.hasRecoverableSession).toBe(false);
      expect(info.sessionType).toBeUndefined();
    });

    test('should provide session statistics', () => {
      stateManager.saveState(mockUser, mockSession);
      
      const stats = stateManager.getSessionStats();
      
      expect(stats.hasSession).toBe(true);
      expect(stats.currentState).toBe('lobby');
      expect(stats.version).toBe('1.0.0');
      expect(stats.sessionAge).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle recovery failure gracefully', () => {
      const failureResult = stateManager.handleRecoveryFailure('Session expired', mockStoredSession);
      
      expect(failureResult.fallbackState).toBe('menu');
      expect(failureResult.userMessage).toContain('süresi dolmuş');
      expect(failureResult.shouldClearSession).toBe(true);
    });

    test('should handle network errors differently', () => {
      const networkFailure = stateManager.handleRecoveryFailure('Network connection failed', mockStoredSession);
      
      expect(networkFailure.fallbackState).toBe('menu');
      expect(networkFailure.shouldClearSession).toBe(false);
    });

    test('should handle corrupted data errors', () => {
      const corruptionFailure = stateManager.handleRecoveryFailure('Data corrupted', mockStoredSession);
      
      expect(corruptionFailure.fallbackState).toBe('menu');
      expect(corruptionFailure.shouldClearSession).toBe(true);
    });
  });

  describe('Migration', () => {
    test('should migrate old session data', () => {
      localStorageMock.setItem('currentLobby', JSON.stringify(mockStoredSession.lobbyData));
      
      const migrated = stateManager.migrateOldSessions();
      
      expect(migrated).toBe(true);
      expect(localStorageMock.getItem('currentLobby')).toBeNull();
      expect(localStorageMock.getItem('tenebris_lobby_cache')).toBeDefined();
    });

    test('should return false when no migration needed', () => {
      const migrated = stateManager.migrateOldSessions();
      expect(migrated).toBe(false);
    });
  });
});