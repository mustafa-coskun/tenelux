/**
 * Multiplayer Matchmaking System Test
 * Tests the localStorage-based cross-tab matchmaking functionality
 */

import { Player, GameMode } from '../types';

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

// Constants from MultiplayerGame component
const QUEUE_STORAGE_KEY = 'tenelux_matchmaking_queue';
const MATCH_STORAGE_KEY = 'tenelux_active_matches';

interface QueueEntry {
  player: Player;
  timestamp: number;
  id: string;
}

interface ActiveMatch {
  id: string;
  player1Id: string;
  player2Id: string;
  player1: Player;
  player2: Player;
  timestamp: number;
}

// Helper functions (copied from MultiplayerGame)
const getQueue = (): QueueEntry[] => {
  try {
    const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setQueue = (queue: QueueEntry[]) => {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
};

const getMatches = (): ActiveMatch[] => {
  try {
    const stored = localStorage.getItem(MATCH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setMatches = (matches: ActiveMatch[]) => {
  localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(matches));
};

// Create mock players
const createMockPlayer = (id: string, name: string): Player => ({
  id,
  name,
  isAI: false,
  trustScore: 50,
  totalGamesPlayed: 0,
  createdAt: new Date(),
});

// Simulate matchmaking logic
const simulateMatchmaking = (
  playerId: string
): { matched: boolean; opponent?: Player } => {
  const currentQueue = getQueue();

  if (currentQueue.length >= 2) {
    const sortedQueue = currentQueue.sort((a, b) => a.timestamp - b.timestamp);
    const myIndex = sortedQueue.findIndex((entry) => entry.id === playerId);

    if (myIndex === -1) return { matched: false };

    // Only first player can initiate matching
    if (myIndex === 0 && sortedQueue.length >= 2) {
      const player1 = sortedQueue[0];
      const player2 = sortedQueue[1];

      // Double check we're still first
      const freshQueue = getQueue().sort((a, b) => a.timestamp - b.timestamp);
      if (freshQueue.length < 2 || freshQueue[0].id !== playerId) {
        return { matched: false };
      }

      // Create match
      const matchId = `match-${Date.now()}-${Math.random()}`;
      const newMatch: ActiveMatch = {
        id: matchId,
        player1Id: player1.id,
        player2Id: player2.id,
        player1: player1.player,
        player2: player2.player,
        timestamp: Date.now(),
      };

      // Add to matches and remove from queue
      const matches = getMatches();
      matches.push(newMatch);
      setMatches(matches);

      const updatedQueue = freshQueue.filter(
        (entry) => entry.id !== player1.id && entry.id !== player2.id
      );
      setQueue(updatedQueue);

      return { matched: true, opponent: player2.player };
    }
  }

  return { matched: false };
};

describe('Multiplayer Matchmaking System', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('should create unique player IDs', () => {
    const player1Id = `player-${Date.now()}-${Math.random()}`;
    const player2Id = `player-${Date.now()}-${Math.random()}`;

    expect(player1Id).not.toBe(player2Id);
    console.log('✅ Player IDs are unique:', {
      player1Id: player1Id.slice(-8),
      player2Id: player2Id.slice(-8),
    });
  });

  test('should handle single player in queue', () => {
    const player1 = createMockPlayer('player1', 'Test Player 1');
    const queueEntry: QueueEntry = {
      player: player1,
      timestamp: Date.now(),
      id: 'player1',
    };

    setQueue([queueEntry]);
    const queue = getQueue();

    expect(queue).toHaveLength(1);
    expect(queue[0].player.name).toBe('Test Player 1');
    console.log('✅ Single player queue works');
  });

  test('should handle two players joining queue', () => {
    const player1 = createMockPlayer('player1', 'Test Player 1');
    const player2 = createMockPlayer('player2', 'Test Player 2');

    // Player 1 joins
    const entry1: QueueEntry = {
      player: player1,
      timestamp: Date.now(),
      id: 'player1',
    };
    setQueue([entry1]);

    // Player 2 joins
    const entry2: QueueEntry = {
      player: player2,
      timestamp: Date.now() + 1, // Slightly later
      id: 'player2',
    };
    const currentQueue = getQueue();
    currentQueue.push(entry2);
    setQueue(currentQueue);

    const finalQueue = getQueue();
    expect(finalQueue).toHaveLength(2);
    console.log(
      '✅ Two players in queue:',
      finalQueue.map((q) => ({ name: q.player.name, id: q.id }))
    );
  });

  test('should match two players correctly', () => {
    const player1 = createMockPlayer('player1', 'Test Player 1');
    const player2 = createMockPlayer('player2', 'Test Player 2');

    // Add both players to queue
    const queue: QueueEntry[] = [
      {
        player: player1,
        timestamp: Date.now(),
        id: 'player1',
      },
      {
        player: player2,
        timestamp: Date.now() + 1,
        id: 'player2',
      },
    ];
    setQueue(queue);

    // First player tries to match
    const result1 = simulateMatchmaking('player1');
    expect(result1.matched).toBe(true);
    expect(result1.opponent?.name).toBe('Test Player 2');

    // Check that players were removed from queue
    const remainingQueue = getQueue();
    expect(remainingQueue).toHaveLength(0);

    // Check that match was created
    const matches = getMatches();
    expect(matches).toHaveLength(1);
    expect(matches[0].player1Id).toBe('player1');
    expect(matches[0].player2Id).toBe('player2');

    console.log('✅ Matchmaking successful:', {
      matched: result1.matched,
      opponent: result1.opponent?.name,
      remainingQueue: remainingQueue.length,
      matches: matches.length,
    });
  });

  test('should prevent second player from initiating match', () => {
    const player1 = createMockPlayer('player1', 'Test Player 1');
    const player2 = createMockPlayer('player2', 'Test Player 2');

    // Add both players to queue
    const queue: QueueEntry[] = [
      {
        player: player1,
        timestamp: Date.now(),
        id: 'player1',
      },
      {
        player: player2,
        timestamp: Date.now() + 1,
        id: 'player2',
      },
    ];
    setQueue(queue);

    // Second player tries to match (should fail)
    const result2 = simulateMatchmaking('player2');
    expect(result2.matched).toBe(false);

    // Queue should still have both players
    const remainingQueue = getQueue();
    expect(remainingQueue).toHaveLength(2);

    console.log('✅ Second player correctly prevented from matching');
  });

  test('should handle queue position calculation', () => {
    const player1 = createMockPlayer('player1', 'Test Player 1');
    const player2 = createMockPlayer('player2', 'Test Player 2');
    const player3 = createMockPlayer('player3', 'Test Player 3');

    // Add three players to queue
    const queue: QueueEntry[] = [
      {
        player: player1,
        timestamp: Date.now(),
        id: 'player1',
      },
      {
        player: player2,
        timestamp: Date.now() + 1,
        id: 'player2',
      },
      {
        player: player3,
        timestamp: Date.now() + 2,
        id: 'player3',
      },
    ];
    setQueue(queue);

    const sortedQueue = queue.sort((a, b) => a.timestamp - b.timestamp);

    const player1Position =
      sortedQueue.findIndex((entry) => entry.id === 'player1') + 1;
    const player2Position =
      sortedQueue.findIndex((entry) => entry.id === 'player2') + 1;
    const player3Position =
      sortedQueue.findIndex((entry) => entry.id === 'player3') + 1;

    expect(player1Position).toBe(1);
    expect(player2Position).toBe(2);
    expect(player3Position).toBe(3);

    console.log('✅ Queue positions correct:', {
      player1: player1Position,
      player2: player2Position,
      player3: player3Position,
      totalPlayers: sortedQueue.length,
    });
  });

  test('should simulate full matchmaking flow', () => {
    console.log('\n🎮 SIMULATING FULL MATCHMAKING FLOW:');

    // Clear everything
    localStorage.clear();

    // Create two players with unique IDs
    const timestamp = Date.now();
    const player1Id = `player-${timestamp}-${Math.random()}`;
    const player2Id = `player-${timestamp + 1}-${Math.random()}`;

    const player1 = createMockPlayer(player1Id, 'Device 1 Player');
    const player2 = createMockPlayer(player2Id, 'Device 2 Player');

    console.log('📱 Device 1 - Player ID:', player1Id.slice(-8));
    console.log('📱 Device 2 - Player ID:', player2Id.slice(-8));

    // Device 1 joins queue
    const entry1: QueueEntry = {
      player: player1,
      timestamp: timestamp + Math.random(),
      id: player1Id,
    };
    setQueue([entry1]);

    let queue = getQueue();
    console.log(
      '📱 Device 1 joined - Queue size:',
      queue.length,
      'Position: 1'
    );

    // Device 2 joins queue
    const entry2: QueueEntry = {
      player: player2,
      timestamp: timestamp + 1 + Math.random(),
      id: player2Id,
    };
    queue.push(entry2);
    setQueue(queue);

    queue = getQueue();
    const sortedQueue = queue.sort((a, b) => a.timestamp - b.timestamp);
    const device2Position =
      sortedQueue.findIndex((entry) => entry.id === player2Id) + 1;

    console.log(
      '📱 Device 2 joined - Queue size:',
      queue.length,
      'Position:',
      device2Position
    );

    // Device 1 (first in queue) initiates matching
    const matchResult = simulateMatchmaking(player1Id);

    if (matchResult.matched) {
      console.log('🎉 MATCH FOUND!');
      console.log('📱 Device 1 matched with:', matchResult.opponent?.name);
      console.log('📱 Device 2 matched with:', player1.name);

      const finalQueue = getQueue();
      const matches = getMatches();

      console.log('✅ Final queue size:', finalQueue.length);
      console.log('✅ Active matches:', matches.length);
      console.log('✅ Match details:', {
        matchId: matches[0]?.id.slice(-8),
        player1: matches[0]?.player1.name,
        player2: matches[0]?.player2.name,
      });
    } else {
      console.log('❌ Matching failed');
    }

    expect(matchResult.matched).toBe(true);
    expect(getQueue()).toHaveLength(0);
    expect(getMatches()).toHaveLength(1);
  });
});
