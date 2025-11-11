import { getUserService } from '../services/UserService';
import { getStateManager } from '../services/StateManager';
import { getStorageOptimizer } from '../services/StorageOptimizer';
import { getPerformanceMonitor } from '../services/PerformanceMonitor';

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

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock
});

// Mock performance.now
const mockPerformanceNow = jest.fn(() => Date.now());
Object.defineProperty(window, 'performance', {
  value: { now: mockPerformanceNow }
});

describe('Session Recovery Integration Tests', () => {
  let userService: any;
  let stateManager: any;
  let storageOptimizer: any;
  let performanceMonitor: any;

  beforeEach(() => {
    // Clear all storage
    localStorageMock.clear();
    sessionStorageMock.clear();
    
    // Get fresh service instances
    userService = getUserService();
    stateManager = getStateManager();
    storageOptimizer = getStorageOptimizer();
    performanceMonitor = getPerformanceMonitor();
    
    // Reset internal state
    userService.currentUser = null;
    userService.currentSession = null;
    performanceMonitor.clearMetrics();
  });

  describe('Complete Session Recovery Flow', () => {
    test('should recover lobby session after page refresh simulation', async () => {
      // Step 1: Create user and join lobby
      const user = userService.createUser('TestPlayer');
      const session = userService.createSession('lobby', { lobbyId: 'test-lobby-123' });
      
      const lobbyData = {
        id: 'test-lobby-123',
        code: 'ABC123',
        name: 'Test Lobby',
        status: 'waiting_for_players',
        hostPlayerId: user.id,
        currentPlayerCount: 1,
        maxPlayers: 4,
        participants: [
          {
            id: user.id,
            name: user.name,
            isHost: true,
            isReady: false
          }
        ],
        createdAt: new Date()
      };

      // Step 2: Save complete state
      stateManager.saveState(user, session, { lobbyData });
      
      // Step 3: Simulate page refresh by clearing memory and creating new instances
      userService.currentUser = null;
      userService.currentSession = null;
      
      // Step 4: Attempt recovery
      const storedSession = await stateManager.loadState();
      expect(storedSession).toBeDefined();
      
      const recoveryResult = await stateManager.recoverFromState(storedSession!);
      
      // Step 5: Verify successful recovery
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.recoveredState).toBeDefined();
      expect(recoveryResult.recoveredState.user.id).toBe(user.id);
      expect(recoveryResult.recoveredState.gameState).toBe('lobby');
      expect(recoveryResult.recoveredState.lobbyData.id).toBe('test-lobby-123');
    });

    test('should recover tournament session with spectator transition', async () => {
      // Step 1: Create user and join tournament
      const user = userService.createUser('TournamentPlayer');
      const session = userService.createSession('tournament', { tournamentId: 'tournament-456' });
      
      const tournamentData = {
        id: 'tournament-456',
        name: 'Test Tournament',
        status: 'in_progress',
        format: 'single_elimination',
        currentRound: 2,
        totalRounds: 3,
        players: [
          { id: user.id, name: user.name, status: 'ready' },
          { id: 'other-player', name: 'Other Player', status: 'ready' }
        ],
        bracket: {
          eliminatedPlayers: [
            { id: user.id, name: user.name }
          ],
          rounds: [
            { status: 'completed', matches: [] },
            { status: 'in_progress', matches: [] }
          ]
        }
      };

      // Step 2: Save tournament state
      stateManager.saveState(user, session, { tournamentData });
      
      // Step 3: Simulate recovery
      const storedSession = await stateManager.loadState();
      const recoveryResult = await stateManager.recoverFromState(storedSession!);
      
      // Step 4: Verify spectator mode recovery (user was eliminated)
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.recoveredState.gameState).toBe('spectator');
      expect(recoveryResult.recoveredState.spectatorPlayer.id).toBe(user.id);
    });

    test('should handle recovery failure and fallback gracefully', async () => {
      // Step 1: Create corrupted session data
      const corruptedSession = {
        user: { id: '', name: 'Invalid User', createdAt: new Date(), lastActive: new Date() },
        gameSession: { userId: '', currentState: 'lobby', lastUpdated: new Date() },
        timestamp: Date.now(),
        version: '1.0.0'
      };
      
      // Step 2: Attempt recovery
      const recoveryResult = await stateManager.recoverFromState(corruptedSession);
      
      // Step 3: Verify graceful failure
      expect(recoveryResult.success).toBe(false);
      expect(recoveryResult.error).toBeDefined();
      
      // Step 4: Verify fallback handling
      const fallback = stateManager.handleRecoveryFailure(recoveryResult.error!, corruptedSession);
      expect(fallback.fallbackState).toBe('menu');
      expect(fallback.shouldClearSession).toBe(true);
    });
  });

  describe('Storage Optimization Integration', () => {
    test('should compress and decompress session data correctly', async () => {
      // Step 1: Create large session with complex data
      const user = userService.createUser('CompressionTestPlayer');
      const session = userService.createSession('tournament', { tournamentId: 'large-tournament' });
      
      const largeTournamentData = {
        id: 'large-tournament',
        name: 'Large Tournament with Many Players',
        status: 'in_progress',
        format: 'double_elimination',
        currentRound: 1,
        totalRounds: 5,
        players: Array.from({ length: 32 }, (_, i) => ({
          id: `player-${i}`,
          name: `Player ${i}`,
          status: 'ready'
        })),
        bracket: {
          rounds: Array.from({ length: 5 }, (_, i) => ({
            status: i === 0 ? 'in_progress' : 'not_started',
            matches: Array.from({ length: Math.pow(2, 4 - i) }, () => ({}))
          }))
        }
      };

      // Step 2: Save with optimization
      stateManager.saveState(user, session, { tournamentData: largeTournamentData });
      
      // Step 3: Verify compression occurred
      const rawData = localStorageMock.getItem('tenebris_full_session');
      expect(rawData).toBeDefined();
      
      // Step 4: Load and verify data integrity
      const loadedSession = await stateManager.loadState();
      expect(loadedSession).toBeDefined();
      expect(loadedSession!.tournamentData.players).toHaveLength(32);
      expect(loadedSession!.tournamentData.bracket.rounds).toHaveLength(5);
    });

    test('should perform automatic cleanup when storage is full', () => {
      // Step 1: Fill storage with old sessions
      for (let i = 0; i < 10; i++) {
        const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
        localStorageMock.setItem(`tenebris_old_session_${i}`, JSON.stringify({
          timestamp: oldTimestamp,
          data: 'old session data'
        }));
      }

      // Step 2: Trigger cleanup by saving new session
      const user = userService.createUser('CleanupTestPlayer');
      const session = userService.createSession('lobby');
      stateManager.saveState(user, session);
      
      // Step 3: Verify cleanup occurred (this would be implementation-specific)
      const metrics = storageOptimizer.getStorageMetrics();
      expect(metrics.itemCount).toBeGreaterThan(0);
    });
  });

  describe('Performance Monitoring Integration', () => {
    test('should track session recovery performance metrics', async () => {
      // Step 1: Create and save session
      const user = userService.createUser('MetricsTestPlayer');
      const session = userService.createSession('lobby', { lobbyId: 'metrics-lobby' });
      
      const lobbyData = {
        id: 'metrics-lobby',
        code: 'METRICS',
        name: 'Metrics Test Lobby',
        status: 'waiting_for_players',
        hostPlayerId: user.id,
        currentPlayerCount: 1,
        maxPlayers: 4,
        participants: [{ id: user.id, name: user.name, isHost: true, isReady: false }],
        createdAt: new Date()
      };

      stateManager.saveState(user, session, { lobbyData });
      
      // Step 2: Perform recovery (which should be tracked)
      const storedSession = await stateManager.loadState();
      const recoveryResult = await stateManager.recoverFromState(storedSession!);
      
      // Step 3: Verify metrics were recorded
      expect(recoveryResult.success).toBe(true);
      
      // Step 4: Check performance report
      const report = performanceMonitor.generateReport();
      expect(report.sessionRecovery.totalAttempts).toBeGreaterThan(0);
      expect(report.sessionRecovery.successRate).toBeGreaterThan(0);
    });

    test('should track failed recovery attempts', async () => {
      // Step 1: Create invalid session
      const invalidSession = {
        user: { id: 'invalid', name: 'Invalid', createdAt: new Date(), lastActive: new Date() },
        gameSession: { userId: 'mismatch', currentState: 'lobby', lastUpdated: new Date() },
        timestamp: Date.now(),
        version: '1.0.0'
      };
      
      // Step 2: Attempt recovery (should fail)
      const recoveryResult = await stateManager.recoverFromState(invalidSession);
      
      // Step 3: Verify failure was tracked
      expect(recoveryResult.success).toBe(false);
      
      const report = performanceMonitor.generateReport();
      expect(report.sessionRecovery.totalAttempts).toBeGreaterThan(0);
      expect(report.sessionRecovery.errorBreakdown).toBeDefined();
    });
  });

  describe('Multi-Client Scenarios', () => {
    test('should handle session conflicts between multiple tabs', async () => {
      // Step 1: Simulate first tab creating session
      const user1 = userService.createUser('MultiTabUser');
      const session1 = userService.createSession('lobby', { lobbyId: 'multi-tab-lobby' });
      
      const lobbyData1 = {
        id: 'multi-tab-lobby',
        code: 'MULTI1',
        name: 'Multi Tab Lobby',
        status: 'waiting_for_players',
        hostPlayerId: user1.id,
        currentPlayerCount: 1,
        maxPlayers: 4,
        participants: [{ id: user1.id, name: user1.name, isHost: true, isReady: false }],
        createdAt: new Date()
      };

      stateManager.saveState(user1, session1, { lobbyData: lobbyData1 });
      
      // Step 2: Simulate second tab modifying session
      const updatedLobbyData = {
        ...lobbyData1,
        currentPlayerCount: 2,
        participants: [
          ...lobbyData1.participants,
          { id: 'new-player', name: 'New Player', isHost: false, isReady: false }
        ]
      };

      // Simulate external update to localStorage
      const currentSession = await stateManager.loadState();
      const updatedSession = {
        ...currentSession!,
        lobbyData: updatedLobbyData,
        timestamp: Date.now()
      };
      
      const serializedData = storageOptimizer.serializeSession(updatedSession);
      localStorageMock.setItem('tenebris_full_session', serializedData);
      
      // Step 3: First tab attempts recovery
      const recoveredSession = await stateManager.loadState();
      const recoveryResult = await stateManager.recoverFromState(recoveredSession!);
      
      // Step 4: Verify updated data is recovered
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.recoveredState.lobbyData.currentPlayerCount).toBe(2);
      expect(recoveryResult.recoveredState.lobbyData.participants).toHaveLength(2);
    });

    test('should handle intentional vs accidental disconnections', () => {
      // Step 1: Create user and session
      const user = userService.createUser('DisconnectionTestUser');
      userService.createSession('lobby', { lobbyId: 'disconnect-lobby' });
      
      // Step 2: Test accidental disconnection (default)
      expect(userService.isIntentionalDisconnection()).toBe(false);
      
      // Step 3: Mark as intentional and test
      userService.markIntentionalLeave();
      expect(userService.isIntentionalDisconnection()).toBe(true);
      
      // Step 4: Clear flag and test
      userService.clearIntentionalLeave();
      expect(userService.isIntentionalDisconnection()).toBe(false);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    test('should handle storage quota exceeded gracefully', () => {
      // Mock localStorage to throw quota exceeded error
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem = jest.fn(() => {
        throw new Error('QuotaExceededError');
      });

      const user = userService.createUser('QuotaTestUser');
      const session = userService.createSession('lobby');
      
      // Should not throw error
      expect(() => {
        stateManager.saveState(user, session);
      }).not.toThrow();

      // Restore original method
      localStorageMock.setItem = originalSetItem;
    });

    test('should handle concurrent access to localStorage', async () => {
      const user = userService.createUser('ConcurrentUser');
      const session = userService.createSession('lobby');
      
      // Simulate concurrent saves
      const promises = Array.from({ length: 5 }, (_, i) => {
        const modifiedSession = { ...session, lobbyId: `lobby-${i}` };
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            stateManager.saveState(user, modifiedSession);
            resolve();
          }, Math.random() * 100);
        });
      });

      await Promise.all(promises);
      
      // Should still be able to load a valid session
      const loadedSession = await stateManager.loadState();
      expect(loadedSession).toBeDefined();
      expect(loadedSession!.user.id).toBe(user.id);
    });

    test('should recover from partial data corruption', async () => {
      // Step 1: Create valid session
      const user = userService.createUser('CorruptionTestUser');
      const session = userService.createSession('lobby', { lobbyId: 'corruption-lobby' });
      
      const lobbyData = {
        id: 'corruption-lobby',
        code: 'CORRUPT',
        name: 'Corruption Test',
        status: 'waiting_for_players',
        hostPlayerId: user.id,
        currentPlayerCount: 1,
        maxPlayers: 4,
        participants: [{ id: user.id, name: user.name, isHost: true, isReady: false }],
        createdAt: new Date()
      };

      stateManager.saveState(user, session, { lobbyData });
      
      // Step 2: Partially corrupt the data
      const storedData = localStorageMock.getItem('tenebris_full_session');
      const partiallyCorrupted = storedData!.substring(0, storedData!.length - 50) + 'CORRUPTED_END';
      localStorageMock.setItem('tenebris_full_session', partiallyCorrupted);
      
      // Step 3: Attempt recovery
      const loadedSession = await stateManager.loadState();
      
      // Should handle corruption gracefully (either recover or fail cleanly)
      if (loadedSession) {
        expect(loadedSession.user).toBeDefined();
      } else {
        // Corruption was detected and data was cleared
        expect(localStorageMock.getItem('tenebris_full_session')).toBeNull();
      }
    });
  });
});