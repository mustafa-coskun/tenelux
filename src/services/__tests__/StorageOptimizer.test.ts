import { getStorageOptimizer } from '../StorageOptimizer';
import { StoredSession } from '../StateManager';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() { return Object.keys(store).length; }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock Blob for size calculations
global.Blob = class MockBlob {
  size: number;
  constructor(content: any[]) {
    this.size = JSON.stringify(content[0] || '').length;
  }
} as any;

describe('StorageOptimizer', () => {
  let storageOptimizer: any;
  let mockSession: StoredSession;

  beforeEach(() => {
    localStorageMock.clear();
    storageOptimizer = getStorageOptimizer();
    
    mockSession = {
      user: {
        id: 'test-user-123',
        name: 'TestPlayer',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        lastActive: new Date('2024-01-01T12:00:00Z'),
        avatar: 'avatar-url'
      },
      gameSession: {
        userId: 'test-user-123',
        currentState: 'lobby',
        lobbyId: 'test-lobby-456',
        tournamentId: 'test-tournament-789',
        playerData: { score: 100, level: 5 },
        lastUpdated: new Date('2024-01-01T12:00:00Z')
      },
      timestamp: Date.now(),
      version: '1.0.0',
      lobbyData: {
        id: 'test-lobby-456',
        code: 'ABC123',
        name: 'Test Lobby',
        status: 'waiting_for_players',
        hostPlayerId: 'test-user-123',
        currentPlayerCount: 2,
        maxPlayers: 4,
        participants: [
          { id: 'test-user-123', name: 'TestPlayer', isHost: true, isReady: true },
          { id: 'other-user', name: 'OtherPlayer', isHost: false, isReady: false }
        ],
        createdAt: new Date('2024-01-01T11:00:00Z')
      },
      tournamentData: {
        id: 'test-tournament-789',
        name: 'Test Tournament',
        status: 'in_progress',
        format: 'single_elimination',
        currentRound: 1,
        totalRounds: 3,
        players: [
          { id: 'test-user-123', name: 'TestPlayer', status: 'ready' },
          { id: 'other-user', name: 'OtherPlayer', status: 'ready' }
        ],
        bracket: {
          eliminatedPlayers: [
            { id: 'eliminated-user', name: 'EliminatedPlayer' }
          ],
          rounds: [
            { status: 'completed', matches: [] },
            { status: 'in_progress', matches: [] }
          ]
        }
      }
    };
  });

  describe('Serialization and Deserialization', () => {
    test('should serialize session data correctly', () => {
      const serialized = storageOptimizer.serializeSession(mockSession);
      
      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe('string');
      expect(serialized.length).toBeGreaterThan(0);
    });

    test('should deserialize session data correctly', () => {
      const serialized = storageOptimizer.serializeSession(mockSession);
      const deserialized = storageOptimizer.deserializeSession(serialized);
      
      expect(deserialized).toBeDefined();
      expect(deserialized.user.id).toBe(mockSession.user.id);
      expect(deserialized.user.name).toBe(mockSession.user.name);
      expect(deserialized.gameSession.currentState).toBe(mockSession.gameSession.currentState);
      expect(deserialized.gameSession.lobbyId).toBe(mockSession.gameSession.lobbyId);
      expect(deserialized.timestamp).toBe(mockSession.timestamp);
      expect(deserialized.version).toBe(mockSession.version);
    });

    test('should preserve date objects during serialization cycle', () => {
      const serialized = storageOptimizer.serializeSession(mockSession);
      const deserialized = storageOptimizer.deserializeSession(serialized);
      
      expect(deserialized.user.createdAt).toBeInstanceOf(Date);
      expect(deserialized.user.lastActive).toBeInstanceOf(Date);
      expect(deserialized.gameSession.lastUpdated).toBeInstanceOf(Date);
      expect(deserialized.user.createdAt.getTime()).toBe(mockSession.user.createdAt.getTime());
    });

    test('should handle optional fields correctly', () => {
      const minimalSession = {
        user: {
          id: 'minimal-user',
          name: 'MinimalUser',
          createdAt: new Date(),
          lastActive: new Date()
        },
        gameSession: {
          userId: 'minimal-user',
          currentState: 'menu' as const,
          lastUpdated: new Date()
        },
        timestamp: Date.now(),
        version: '1.0.0'
      };

      const serialized = storageOptimizer.serializeSession(minimalSession);
      const deserialized = storageOptimizer.deserializeSession(serialized);
      
      expect(deserialized.user.id).toBe(minimalSession.user.id);
      expect(deserialized.gameSession.currentState).toBe(minimalSession.gameSession.currentState);
      expect(deserialized.gameSession.lobbyId).toBeUndefined();
      expect(deserialized.lobbyData).toBeUndefined();
    });

    test('should throw error for invalid serialization input', () => {
      expect(() => {
        storageOptimizer.serializeSession(null);
      }).toThrow();
    });

    test('should throw error for invalid deserialization input', () => {
      expect(() => {
        storageOptimizer.deserializeSession('invalid-json');
      }).toThrow();
    });
  });

  describe('Compression', () => {
    test('should compress large data automatically', () => {
      // Create a large session with repeated data
      const largeSession = {
        ...mockSession,
        gameSession: {
          ...mockSession.gameSession,
          playerData: {
            largeArray: new Array(1000).fill('repeated-data-string'),
            moreData: 'x'.repeat(2000)
          }
        }
      };

      const serialized = storageOptimizer.serializeSession(largeSession);
      
      // Should be compressed (starts with COMP:)
      expect(serialized.startsWith('COMP:')).toBe(true);
      
      // Should still deserialize correctly
      const deserialized = storageOptimizer.deserializeSession(serialized);
      expect(deserialized.gameSession.playerData.largeArray).toHaveLength(1000);
      expect(deserialized.gameSession.playerData.moreData).toBe('x'.repeat(2000));
    });

    test('should not compress small data', () => {
      const smallSession = {
        user: { id: 'small', name: 'Small', createdAt: new Date(), lastActive: new Date() },
        gameSession: { userId: 'small', currentState: 'menu' as const, lastUpdated: new Date() },
        timestamp: Date.now(),
        version: '1.0.0'
      };

      const serialized = storageOptimizer.serializeSession(smallSession);
      
      // Should not be compressed
      expect(serialized.startsWith('COMP:')).toBe(false);
      
      // Should still deserialize correctly
      const deserialized = storageOptimizer.deserializeSession(serialized);
      expect(deserialized.user.id).toBe('small');
    });

    test('should get compression statistics', () => {
      const largeData = JSON.stringify({ data: 'x'.repeat(5000) });
      const stats = storageOptimizer.getCompressionStats(largeData);
      
      expect(stats.originalSize).toBeGreaterThan(0);
      expect(stats.compressedSize).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeLessThanOrEqual(1);
      expect(stats.data).toBeDefined();
    });
  });

  describe('Storage Cleanup', () => {
    test('should clean up expired sessions', () => {
      // Add some expired sessions
      const expiredTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      localStorageMock.setItem('tenebris_expired_1', JSON.stringify({ timestamp: expiredTimestamp }));
      localStorageMock.setItem('tenebris_expired_2', JSON.stringify({ timestamp: expiredTimestamp }));
      localStorageMock.setItem('tenebris_current', JSON.stringify({ timestamp: Date.now() }));
      localStorageMock.setItem('other_key', 'should not be touched');

      const result = storageOptimizer.cleanupOldSessions();
      
      expect(result.cleaned).toBe(2);
      expect(result.freedBytes).toBeGreaterThan(0);
      expect(localStorageMock.getItem('tenebris_expired_1')).toBeNull();
      expect(localStorageMock.getItem('tenebris_expired_2')).toBeNull();
      expect(localStorageMock.getItem('tenebris_current')).toBeDefined();
      expect(localStorageMock.getItem('other_key')).toBe('should not be touched');
    });

    test('should clean up corrupted data', () => {
      localStorageMock.setItem('tenebris_corrupted', 'invalid-json-data');
      localStorageMock.setItem('tenebris_valid', JSON.stringify({ timestamp: Date.now() }));

      const result = storageOptimizer.cleanupOldSessions();
      
      expect(result.cleaned).toBe(1);
      expect(localStorageMock.getItem('tenebris_corrupted')).toBeNull();
      expect(localStorageMock.getItem('tenebris_valid')).toBeDefined();
    });

    test('should perform auto cleanup when threshold reached', () => {
      // Mock shouldCleanup to return true
      const originalShouldCleanup = storageOptimizer.shouldCleanup;
      storageOptimizer.shouldCleanup = jest.fn(() => true);

      // Add expired data
      localStorageMock.setItem('tenebris_old', JSON.stringify({ 
        timestamp: Date.now() - (25 * 60 * 60 * 1000) 
      }));

      const cleaned = storageOptimizer.autoCleanup();
      
      expect(cleaned).toBe(true);
      expect(localStorageMock.getItem('tenebris_old')).toBeNull();

      // Restore original method
      storageOptimizer.shouldCleanup = originalShouldCleanup;
    });

    test('should not cleanup when threshold not reached', () => {
      const cleaned = storageOptimizer.autoCleanup();
      expect(cleaned).toBe(false);
    });
  });

  describe('Storage Metrics', () => {
    test('should calculate storage metrics correctly', () => {
      // Add some test data
      localStorageMock.setItem('tenebris_item1', JSON.stringify({ 
        timestamp: Date.now() - 1000,
        data: 'test1' 
      }));
      localStorageMock.setItem('tenebris_item2', JSON.stringify({ 
        timestamp: Date.now() - 2000,
        data: 'test2' 
      }));
      localStorageMock.setItem('other_item', 'should be ignored');

      const metrics = storageOptimizer.getStorageMetrics();
      
      expect(metrics.totalSize).toBeGreaterThan(0);
      expect(metrics.itemCount).toBe(2);
      expect(metrics.averageSize).toBeGreaterThan(0);
      expect(metrics.oldestItem).toBeInstanceOf(Date);
      expect(metrics.newestItem).toBeInstanceOf(Date);
      expect(metrics.oldestItem!.getTime()).toBeLessThan(metrics.newestItem!.getTime());
    });

    test('should handle empty storage', () => {
      const metrics = storageOptimizer.getStorageMetrics();
      
      expect(metrics.totalSize).toBe(0);
      expect(metrics.itemCount).toBe(0);
      expect(metrics.averageSize).toBe(0);
      expect(metrics.oldestItem).toBeUndefined();
      expect(metrics.newestItem).toBeUndefined();
    });

    test('should ignore non-tenebris items in metrics', () => {
      localStorageMock.setItem('other_app_data', 'large data string that should be ignored');
      localStorageMock.setItem('tenebris_data', JSON.stringify({ timestamp: Date.now() }));

      const metrics = storageOptimizer.getStorageMetrics();
      
      expect(metrics.itemCount).toBe(1);
    });
  });

  describe('Data Optimization', () => {
    test('should optimize lobby data structure', () => {
      const serialized = storageOptimizer.serializeSession(mockSession);
      const deserialized = storageOptimizer.deserializeSession(serialized);
      
      expect(deserialized.lobbyData).toBeDefined();
      expect(deserialized.lobbyData!.id).toBe(mockSession.lobbyData!.id);
      expect(deserialized.lobbyData!.code).toBe(mockSession.lobbyData!.code);
      expect(deserialized.lobbyData!.participants).toHaveLength(2);
      expect(deserialized.lobbyData!.participants[0].isHost).toBe(true);
    });

    test('should optimize tournament data structure', () => {
      const serialized = storageOptimizer.serializeSession(mockSession);
      const deserialized = storageOptimizer.deserializeSession(serialized);
      
      expect(deserialized.tournamentData).toBeDefined();
      expect(deserialized.tournamentData!.id).toBe(mockSession.tournamentData!.id);
      expect(deserialized.tournamentData!.players).toHaveLength(2);
      expect(deserialized.tournamentData!.bracket).toBeDefined();
      expect(deserialized.tournamentData!.bracket.eliminatedPlayers).toHaveLength(1);
    });

    test('should handle missing optional data gracefully', () => {
      const sessionWithoutOptionalData = {
        ...mockSession,
        lobbyData: undefined,
        tournamentData: undefined
      };

      const serialized = storageOptimizer.serializeSession(sessionWithoutOptionalData);
      const deserialized = storageOptimizer.deserializeSession(serialized);
      
      expect(deserialized.lobbyData).toBeUndefined();
      expect(deserialized.tournamentData).toBeUndefined();
      expect(deserialized.user.id).toBe(mockSession.user.id);
    });
  });

  describe('Error Handling', () => {
    test('should handle serialization errors gracefully', () => {
      // Create circular reference
      const circularSession: any = { ...mockSession };
      circularSession.circular = circularSession;

      expect(() => {
        storageOptimizer.serializeSession(circularSession);
      }).toThrow('Session serialization failed');
    });

    test('should handle compression errors gracefully', () => {
      // Mock compression to fail
      const originalCompressData = storageOptimizer.compressData;
      storageOptimizer.compressData = jest.fn(() => {
        throw new Error('Compression failed');
      });

      // Should fall back to uncompressed data
      const serialized = storageOptimizer.serializeSession(mockSession);
      expect(serialized).toBeDefined();
      expect(serialized.startsWith('COMP:')).toBe(false);

      // Restore original method
      storageOptimizer.compressData = originalCompressData;
    });

    test('should handle decompression errors gracefully', () => {
      expect(() => {
        storageOptimizer.deserializeSession('COMP:invalid-compressed-data');
      }).toThrow('Session deserialization failed');
    });

    test('should handle storage access errors gracefully', () => {
      // Mock localStorage to throw error
      const originalGetItem = localStorageMock.getItem;
      localStorageMock.getItem = jest.fn(() => {
        throw new Error('Storage access denied');
      });

      const metrics = storageOptimizer.getStorageMetrics();
      expect(metrics.totalSize).toBe(0);
      expect(metrics.itemCount).toBe(0);

      // Restore original method
      localStorageMock.getItem = originalGetItem;
    });
  });
});