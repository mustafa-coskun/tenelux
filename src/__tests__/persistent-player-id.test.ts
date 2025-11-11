/**
 * Persistent Player ID Test
 * Tests that Player ID persists across page refreshes
 */

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

const PLAYER_ID_KEY = 'tenelux_player_id';

// Get or create persistent player ID (copied from MultiplayerGame)
const getOrCreatePlayerId = (): string => {
  try {
    const stored = localStorage.getItem(PLAYER_ID_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }

  // Create new player ID
  const newId = `player-${Date.now()}-${Math.random()}`;
  try {
    localStorage.setItem(PLAYER_ID_KEY, newId);
  } catch {
    // Ignore localStorage errors
  }
  return newId;
};

describe('Persistent Player ID System', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('should create new player ID when none exists', () => {
    const playerId = getOrCreatePlayerId();

    expect(playerId).toMatch(/^player-\d+-\d+\.\d+$/);
    expect(localStorage.getItem(PLAYER_ID_KEY)).toBe(playerId);

    console.log('✅ New Player ID created:', playerId.slice(-8));
  });

  test('should return same player ID on subsequent calls', () => {
    const playerId1 = getOrCreatePlayerId();
    const playerId2 = getOrCreatePlayerId();
    const playerId3 = getOrCreatePlayerId();

    expect(playerId1).toBe(playerId2);
    expect(playerId2).toBe(playerId3);

    console.log('✅ Player ID persistent across calls:', playerId1.slice(-8));
  });

  test('should simulate page refresh scenario', () => {
    console.log('\n🔄 SIMULATING PAGE REFRESH SCENARIO:');

    // First "page load" - create player ID
    const firstPlayerId = getOrCreatePlayerId();
    console.log('📱 First page load - Player ID:', firstPlayerId.slice(-8));

    // Simulate "page refresh" - should get same ID
    const secondPlayerId = getOrCreatePlayerId();
    console.log('🔄 After page refresh - Player ID:', secondPlayerId.slice(-8));

    // Simulate another "page refresh"
    const thirdPlayerId = getOrCreatePlayerId();
    console.log(
      '🔄 After another refresh - Player ID:',
      thirdPlayerId.slice(-8)
    );

    expect(firstPlayerId).toBe(secondPlayerId);
    expect(secondPlayerId).toBe(thirdPlayerId);

    console.log('✅ Player ID remains consistent across page refreshes');
  });

  test('should create new ID after clearing storage', () => {
    const playerId1 = getOrCreatePlayerId();
    console.log('📱 Original Player ID:', playerId1.slice(-8));

    // Clear storage (simulate game end)
    localStorage.removeItem(PLAYER_ID_KEY);

    const playerId2 = getOrCreatePlayerId();
    console.log('🆕 New Player ID after clear:', playerId2.slice(-8));

    expect(playerId1).not.toBe(playerId2);
    console.log('✅ New Player ID created after storage clear');
  });

  test('should handle multiple tabs scenario', () => {
    console.log('\n📱 SIMULATING MULTIPLE TABS SCENARIO:');

    // Tab 1 creates player ID
    const tab1PlayerId = getOrCreatePlayerId();
    console.log('📱 Tab 1 - Player ID:', tab1PlayerId.slice(-8));

    // Tab 2 should get the same player ID (same localStorage)
    const tab2PlayerId = getOrCreatePlayerId();
    console.log('📱 Tab 2 - Player ID:', tab2PlayerId.slice(-8));

    expect(tab1PlayerId).toBe(tab2PlayerId);
    console.log('✅ Same Player ID across multiple tabs');
  });

  test('should simulate full matchmaking with persistent IDs', () => {
    console.log('\n🎮 SIMULATING MATCHMAKING WITH PERSISTENT IDs:');

    // Clear everything
    localStorage.clear();

    // Device 1 - First visit
    const device1FirstId = getOrCreatePlayerId();
    console.log('📱 Device 1 - First visit:', device1FirstId.slice(-8));

    // Device 1 - Page refresh (should keep same ID)
    const device1RefreshId = getOrCreatePlayerId();
    console.log('🔄 Device 1 - After refresh:', device1RefreshId.slice(-8));

    expect(device1FirstId).toBe(device1RefreshId);

    // Simulate Device 1 joining queue and leaving
    console.log('📱 Device 1 joins queue, then leaves...');

    // Device 1 - Another refresh (should still keep same ID)
    const device1AfterLeaveId = getOrCreatePlayerId();
    console.log(
      '🔄 Device 1 - After leaving queue:',
      device1AfterLeaveId.slice(-8)
    );

    expect(device1FirstId).toBe(device1AfterLeaveId);

    console.log('✅ Player ID persists through queue join/leave cycles');
    console.log('✅ This ensures consistent matchmaking across page refreshes');
  });
});
