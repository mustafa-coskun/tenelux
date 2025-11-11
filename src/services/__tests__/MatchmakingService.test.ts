import { MatchmakingService } from '../MatchmakingService';
import { ConnectionManager } from '../ConnectionManager';
import { Player } from '../../types';
import { NetworkMessageType } from '../../types/network';

// Mock ConnectionManager
jest.mock('../ConnectionManager');

describe('MatchmakingService', () => {
  let matchmakingService: MatchmakingService;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockPlayers: Player[];

  beforeEach(() => {
    mockConnectionManager =
      new ConnectionManager() as jest.Mocked<ConnectionManager>;
    mockConnectionManager.sendToPlayer = jest.fn().mockReturnValue(true);

    matchmakingService = new MatchmakingService(mockConnectionManager);

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
      {
        id: 'player3',
        name: 'Player 3',
        isAI: false,
        trustScore: 80,
        totalGamesPlayed: 10,
        createdAt: new Date(),
      },
    ];
  });

  afterEach(() => {
    matchmakingService.stop();
    jest.clearAllMocks();
  });

  describe('addToQueue', () => {
    test('should add player to matchmaking queue', () => {
      matchmakingService.addToQueue(mockPlayers[0]);

      const queueStatus = matchmakingService.getQueueStatus();
      expect(queueStatus).toHaveLength(1);
      expect(queueStatus[0].playerId).toBe('player1');
      expect(queueStatus[0].player).toEqual(mockPlayers[0]);
    });

    test('should notify player about queue status', () => {
      matchmakingService.addToQueue(mockPlayers[0]);

      expect(mockConnectionManager.sendToPlayer).toHaveBeenCalledWith(
        'player1',
        expect.objectContaining({
          type: NetworkMessageType.JOIN_QUEUE,
          payload: expect.objectContaining({
            status: 'queued',
            position: 1,
          }),
        })
      );
    });

    test('should replace existing queue entry for same player', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[0]);

      const queueStatus = matchmakingService.getQueueStatus();
      expect(queueStatus).toHaveLength(1);
    });
  });

  describe('removeFromQueue', () => {
    test('should remove player from queue', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.removeFromQueue('player1');

      const queueStatus = matchmakingService.getQueueStatus();
      expect(queueStatus).toHaveLength(0);
    });

    test('should notify player about removal', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      jest.clearAllMocks(); // Clear the add notification

      matchmakingService.removeFromQueue('player1');

      expect(mockConnectionManager.sendToPlayer).toHaveBeenCalledWith(
        'player1',
        expect.objectContaining({
          type: NetworkMessageType.LEAVE_QUEUE,
          payload: { status: 'removed' },
        })
      );
    });

    test('should handle removal of non-existent player gracefully', () => {
      matchmakingService.removeFromQueue('non-existent');

      // Should not throw error
      expect(mockConnectionManager.sendToPlayer).not.toHaveBeenCalled();
    });
  });

  describe('findMatch', () => {
    test('should find match between compatible players', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[1]);

      const match = matchmakingService.findMatch('player1');

      expect(match).toBeDefined();
      expect(match?.players).toHaveLength(2);
      expect(match?.players.map((p) => p.id)).toContain('player1');
      expect(match?.players.map((p) => p.id)).toContain('player2');
    });

    test('should remove matched players from queue', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[1]);

      matchmakingService.findMatch('player1');

      const queueStatus = matchmakingService.getQueueStatus();
      expect(queueStatus).toHaveLength(0);
    });

    test('should notify both players about match found', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[1]);
      jest.clearAllMocks(); // Clear add notifications

      matchmakingService.findMatch('player1');

      expect(mockConnectionManager.sendToPlayer).toHaveBeenCalledWith(
        'player1',
        expect.objectContaining({
          type: NetworkMessageType.MATCH_FOUND,
        })
      );

      expect(mockConnectionManager.sendToPlayer).toHaveBeenCalledWith(
        'player2',
        expect.objectContaining({
          type: NetworkMessageType.MATCH_FOUND,
        })
      );
    });

    test('should return null when no suitable opponent found', () => {
      matchmakingService.addToQueue(mockPlayers[0]);

      const match = matchmakingService.findMatch('player1');

      expect(match).toBeNull();
    });

    test('should return null for non-existent player', () => {
      const match = matchmakingService.findMatch('non-existent');

      expect(match).toBeNull();
    });
  });

  describe('compatibility scoring', () => {
    test('should prefer players with similar trust scores', () => {
      // Add players with different trust scores
      matchmakingService.addToQueue(mockPlayers[0]); // trust: 50
      matchmakingService.addToQueue(mockPlayers[1]); // trust: 55
      matchmakingService.addToQueue(mockPlayers[2]); // trust: 80

      const match = matchmakingService.findMatch('player1');

      expect(match).toBeDefined();
      // Should match with player2 (trust: 55) rather than player3 (trust: 80)
      const opponentIds = match?.players
        .map((p) => p.id)
        .filter((id) => id !== 'player1');
      expect(opponentIds).toContain('player2');
    });

    test('should give wait time bonus to longer waiting players', (done) => {
      matchmakingService.addToQueue(mockPlayers[0]);

      // Add second player after a delay
      setTimeout(() => {
        matchmakingService.addToQueue(mockPlayers[1]);

        const match = matchmakingService.findMatch('player2');
        expect(match).toBeDefined();
        done();
      }, 100);
    });
  });

  describe('queue management', () => {
    test('should process queue automatically', (done) => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[1]);

      // Wait for automatic queue processing
      setTimeout(() => {
        const queueStatus = matchmakingService.getQueueStatus();
        expect(queueStatus).toHaveLength(0); // Players should be matched and removed
        done();
      }, 6000); // Wait longer than matchmaking interval
    });

    test('should remove expired queue entries', (done) => {
      const playerWithShortTimeout = {
        ...mockPlayers[0],
        id: 'short-timeout-player',
      };

      matchmakingService.addToQueue(playerWithShortTimeout, {
        maxWaitTime: 100, // Very short timeout
      });

      setTimeout(() => {
        const queueStatus = matchmakingService.getQueueStatus();
        expect(queueStatus).toHaveLength(0);

        expect(mockConnectionManager.sendToPlayer).toHaveBeenCalledWith(
          'short-timeout-player',
          expect.objectContaining({
            type: NetworkMessageType.ERROR,
            payload: expect.objectContaining({
              code: 'QUEUE_TIMEOUT',
            }),
          })
        );
        done();
      }, 200);
    });
  });

  describe('statistics', () => {
    test('should provide queue statistics', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[1]);

      const stats = matchmakingService.getQueueStats();

      expect(stats.queueSize).toBe(2);
      expect(stats.averageWaitTime).toBeGreaterThanOrEqual(0);
      expect(stats.activeMatches).toBe(0);
    });

    test('should track active matches', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[1]);

      const match = matchmakingService.findMatch('player1');
      expect(match).toBeDefined();

      const stats = matchmakingService.getQueueStats();
      expect(stats.activeMatches).toBe(1);
    });
  });

  describe('match management', () => {
    test('should store and retrieve active matches', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[1]);

      const match = matchmakingService.findMatch('player1');
      expect(match).toBeDefined();

      const retrievedMatch = matchmakingService.getMatch(match!.id);
      expect(retrievedMatch).toEqual(match);
    });

    test('should remove completed matches', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[1]);

      const match = matchmakingService.findMatch('player1');
      expect(match).toBeDefined();

      matchmakingService.removeMatch(match!.id);

      const retrievedMatch = matchmakingService.getMatch(match!.id);
      expect(retrievedMatch).toBeUndefined();
    });

    test('should list all active matches', () => {
      matchmakingService.addToQueue(mockPlayers[0]);
      matchmakingService.addToQueue(mockPlayers[1]);
      matchmakingService.addToQueue(mockPlayers[2]);

      // Create first match
      const match1 = matchmakingService.findMatch('player1');
      expect(match1).toBeDefined();

      // Add another player and create second match
      const player4: Player = {
        id: 'player4',
        name: 'Player 4',
        isAI: false,
        trustScore: 75,
        totalGamesPlayed: 8,
        createdAt: new Date(),
      };
      matchmakingService.addToQueue(player4);

      const match2 = matchmakingService.findMatch('player3');
      expect(match2).toBeDefined();

      const activeMatches = matchmakingService.getActiveMatches();
      expect(activeMatches).toHaveLength(2);
    });
  });
});
