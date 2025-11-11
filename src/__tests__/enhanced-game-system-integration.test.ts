// Integration tests for Enhanced Game System
// Tests Requirements: All requirements integration

import { GameModeStatsService } from '../services/GameModeStatsService';
import { TrustScoreService } from '../services/TrustScoreService';
import { FriendService } from '../services/FriendService';
import { PartyService } from '../services/PartyService';

// Mock database manager
const mockDatabaseManager = {
  executeRawQuery: jest.fn(),
  executeRawCommand: jest.fn(),
  getAdapter: jest.fn()
};

const mockAdapter = {
  findOne: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
};

jest.mock('../services/LoggingService', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  })
}));

jest.mock('../database/DatabaseManager', () => ({
  getDatabaseManager: () => mockDatabaseManager
}));

describe('Enhanced Game System Integration Tests', () => {
  let gameModeStatsService: GameModeStatsService;
  let trustScoreService: any;
  let friendService: FriendService;
  let partyService: PartyService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabaseManager.getAdapter.mockReturnValue(mockAdapter);
    
    gameModeStatsService = new GameModeStatsService();
    trustScoreService = new (require('../services/TrustScoreService').TrustScoreService)();
    friendService = new FriendService(mockDatabaseManager);
    partyService = new PartyService(mockDatabaseManager);
  });

  describe('Complete Game Flow Integration', () => {
    it('should handle complete multiplayer game flow with trust score updates', async () => {
      // Mock initial player stats
      mockDatabaseManager.executeRawQuery.mockResolvedValue([{
        total_games: 5, wins: 3, losses: 2, draws: 0,
        cooperations: 8, betrayals: 2, total_score: 75,
        highest_score: 20, win_rate: 60, betrayal_rate: 20,
        average_score: 15, longest_win_streak: 2, current_win_streak: 1,
        total_playtime: 1500, rank_points: 1100
      }]);

      // Simulate game result
      const gameResult = {
        id: 'game1',
        gameMode: 'multi' as const,
        affectsStats: true,
        winner: 'user1',
        finalScores: { user1: 20, user2: 15 },
        duration: 300,
        statistics: {
          playerStats: {
            user1: { cooperations: 4, betrayals: 1 },
            user2: { cooperations: 3, betrayals: 2 }
          }
        }
      };

      // Record game result
      await gameModeStatsService.recordGameResult('user1', gameResult);

      // Verify database updates were called
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO user_multi_stats'),
        expect.any(Array)
      );

      // Test trust score calculation
      const playerStats = {
        totalGames: 6,
        cooperations: 12,
        betrayals: 3
      };
      
      const trustScore = trustScoreService.calculateTrustScore(playerStats);
      expect(trustScore).toBeGreaterThan(50); // Should be high due to good cooperation rate
    });

    it('should handle party game flow with friend integration', async () => {
      // Mock users
      const host = { id: 'host1', username: 'host', display_name: 'Host Player', avatar: '👑' };
      const friend = { id: 'friend1', username: 'friend', display_name: 'Friend Player', avatar: '🎮' };
      
      mockAdapter.findOne
        .mockResolvedValueOnce(host) // Host user
        .mockResolvedValueOnce(friend); // Friend user

      // Create party
      const partySettings = {
        maxPlayers: 4,
        roundCount: 10,
        tournamentFormat: 'single_elimination',
        allowSpectators: true,
        chatEnabled: true
      };

      const party = await partyService.createParty('host1', partySettings);
      expect(party.hostPlayerId).toBe('host1');
      expect(party.participants).toHaveLength(1);

      // Friend joins party
      const updatedParty = await partyService.joinParty('friend1', party.code);
      expect(updatedParty.participants).toHaveLength(2);

      // Simulate party game completion and stats update
      const partyGameResult = {
        id: 'party-game1',
        gameMode: 'party' as const,
        affectsStats: true,
        winner: 'host1',
        finalScores: { host1: 25, friend1: 20 },
        duration: 450,
        statistics: {
          playerStats: {
            host1: { cooperations: 5, betrayals: 0 },
            friend1: { cooperations: 4, betrayals: 1 }
          }
        }
      };

      // Mock party stats query
      mockDatabaseManager.executeRawQuery.mockResolvedValue([{
        total_games: 2, wins: 1, losses: 1, draws: 0,
        cooperations: 3, betrayals: 2, total_score: 40,
        highest_score: 25, win_rate: 50, betrayal_rate: 40,
        average_score: 20, parties_hosted: 1, parties_joined: 2, total_playtime: 900
      }]);

      await gameModeStatsService.recordGameResult('host1', partyGameResult);
      
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO user_party_stats'),
        expect.any(Array)
      );
    });
  });

  describe('Trust Score and Matchmaking Integration', () => {
    it('should integrate trust score updates with matchmaking', async () => {
      // Test trust score calculation and matchmaking range
      const playerStats = {
        totalGames: 20,
        cooperations: 15,
        betrayals: 5
      };

      const trustScore = trustScoreService.calculateTrustScore(playerStats);
      const matchmakingRange = trustScoreService.getMatchmakingRange(trustScore);

      expect(matchmakingRange.min).toBeLessThan(trustScore);
      expect(matchmakingRange.max).toBeGreaterThan(trustScore);

      // Test finding suitable opponents
      const availablePlayers = [
        { id: 'player1', stats: { trustScore: trustScore - 5 } },
        { id: 'player2', stats: { trustScore: trustScore + 3 } },
        { id: 'player3', stats: { trustScore: trustScore + 20 } }, // Too far
        { id: 'player4', stats: null } // Default trust score
      ];

      const suitableOpponents = trustScoreService.findSuitableOpponents(trustScore, availablePlayers);
      
      expect(suitableOpponents).toHaveLength(3); // Should exclude player3
      expect(suitableOpponents.some(p => p.id === 'player3')).toBe(false);
    });

    it('should update trust scores after game completion', async () => {
      // Simulate multiple games and trust score evolution
      const initialStats = {
        totalGames: 5,
        cooperations: 3,
        betrayals: 2
      };

      const initialTrustScore = trustScoreService.calculateTrustScore(initialStats);

      // Simulate cooperative game
      const cooperativeGameResult = {
        gameMode: 'multiplayer',
        won: true,
        cooperations: 4,
        betrayals: 1,
        score: 20
      };

      const updatedStats = trustScoreService.updatePlayerStats(initialStats, cooperativeGameResult);
      const newTrustScore = updatedStats.trustScore;

      expect(newTrustScore).toBeGreaterThan(initialTrustScore);
      expect(updatedStats.cooperationRate).toBeGreaterThan(60); // Should be above 60%
    });
  });

  describe('Friend System and Party Integration', () => {
    it('should integrate friend management with party invitations', async () => {
      const user1 = { id: 'user1', username: 'player1', display_name: 'Player One' };
      const user2 = { id: 'user2', username: 'player2', display_name: 'Player Two' };

      // Mock friend request flow
      mockAdapter.findOne
        .mockResolvedValueOnce(user1) // From user
        .mockResolvedValueOnce(user2) // To user
        .mockResolvedValueOnce(null); // No existing friendship

      await friendService.sendFriendRequest('user1', 'user2');

      expect(mockAdapter.create).toHaveBeenCalledWith('friendships', expect.objectContaining({
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'pending'
      }));

      // Mock friendship acceptance
      mockAdapter.findOne.mockResolvedValue({
        id: 'friendship1',
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'pending'
      });

      await friendService.acceptFriendRequest('friendship1');

      expect(mockAdapter.update).toHaveBeenCalledWith(
        'friendships',
        { id: 'friendship1' },
        expect.objectContaining({ status: 'accepted' })
      );

      // Test friends list retrieval
      mockAdapter.findMany.mockResolvedValue([{
        id: 'friendship1',
        requester_id: 'user1',
        addressee_id: 'user2',
        status: 'accepted'
      }]);

      mockAdapter.findOne.mockResolvedValue({
        id: 'user2',
        username: 'player2',
        display_name: 'Player Two',
        avatar: '🎮',
        last_active: new Date().toISOString(),
        trust_score: 65
      });

      const friendsList = await friendService.getFriendsList('user1');
      
      expect(friendsList).toHaveLength(1);
      expect(friendsList[0]).toMatchObject({
        id: 'user2',
        username: 'player2',
        canInviteToParty: true
      });
    });
  });

  describe('Statistics Separation Integration', () => {
    it('should properly separate statistics by game mode', async () => {
      const userId = 'user1';

      // Mock separate statistics for each mode
      const mockSingleStats = {
        total_games: 10, wins: 7, losses: 3, draws: 0,
        total_score: 150, highest_score: 25, average_score: 15, total_playtime: 3000
      };

      const mockMultiStats = {
        total_games: 15, wins: 10, losses: 5, draws: 0,
        cooperations: 25, betrayals: 10, total_score: 225,
        highest_score: 30, win_rate: 66.67, betrayal_rate: 28.57,
        average_score: 15, longest_win_streak: 4, current_win_streak: 2,
        total_playtime: 4500, rank_points: 1300
      };

      const mockPartyStats = {
        total_games: 8, wins: 5, losses: 3, draws: 0,
        cooperations: 15, betrayals: 5, total_score: 160,
        highest_score: 28, win_rate: 62.5, betrayal_rate: 25,
        average_score: 20, parties_hosted: 3, parties_joined: 8, total_playtime: 2400
      };

      mockDatabaseManager.executeRawQuery
        .mockResolvedValueOnce([mockSingleStats])
        .mockResolvedValueOnce([mockMultiStats])
        .mockResolvedValueOnce([mockPartyStats]);

      const separateStats = await gameModeStatsService.getSeparateStatistics(userId);

      expect(separateStats.singlePlayer.totalGames).toBe(10);
      expect(separateStats.multiplayer.totalGames).toBe(15);
      expect(separateStats.party.totalGames).toBe(8);

      // Verify that each mode has appropriate fields
      expect(separateStats.singlePlayer).not.toHaveProperty('cooperations');
      expect(separateStats.multiplayer).toHaveProperty('rankPoints');
      expect(separateStats.party).toHaveProperty('partiesHosted');
    });

    it('should handle leaderboards for different game modes', async () => {
      const mockLeaderboardData = [
        {
          user_id: 'user1', username: 'Player1', display_name: 'Player One',
          avatar: '👤', total_games: 20, wins: 15, highest_score: 30,
          average_score: 18, rank_points: 1500, win_rate: 75
        },
        {
          user_id: 'user2', username: 'Player2', display_name: 'Player Two',
          avatar: '🎮', total_games: 18, wins: 10, highest_score: 25,
          average_score: 16, rank_points: 1200, win_rate: 55.56
        }
      ];

      mockDatabaseManager.executeRawQuery.mockResolvedValue(mockLeaderboardData);

      // Test single player leaderboard
      const singleLeaderboard = await gameModeStatsService.getLeaderboard('single', 10);
      expect(singleLeaderboard).toHaveLength(2);
      expect(singleLeaderboard[0].rank).toBe(1);

      // Test multiplayer leaderboard
      const multiLeaderboard = await gameModeStatsService.getLeaderboard('multi', 10);
      expect(multiLeaderboard).toHaveLength(2);
      expect(multiLeaderboard[0].userId).toBe('user1'); // Higher rank points
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle database errors gracefully', async () => {
      mockDatabaseManager.executeRawQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        gameModeStatsService.getPlayerStats('user1', 'single')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle invalid game modes', async () => {
      await expect(
        gameModeStatsService.getPlayerStats('user1', 'invalid' as any)
      ).rejects.toThrow('Invalid game mode: invalid');
    });

    it('should handle party creation failures', async () => {
      mockAdapter.findOne.mockResolvedValue(null); // User not found

      await expect(
        partyService.createParty('invalid-user', {})
      ).rejects.toThrow('Host user not found');
    });
  });

  describe('Performance Integration', () => {
    it('should handle multiple concurrent operations', async () => {
      // Mock successful database operations
      mockDatabaseManager.executeRawQuery.mockResolvedValue([{
        total_games: 5, wins: 3, losses: 2, draws: 0,
        total_score: 75, highest_score: 20, average_score: 15, total_playtime: 1500
      }]);

      // Simulate concurrent game result processing
      const gameResults = Array.from({ length: 5 }, (_, i) => ({
        id: `game${i}`,
        gameMode: 'multi' as const,
        affectsStats: true,
        winner: 'user1',
        finalScores: { user1: 15 + i, user2: 10 + i },
        duration: 300,
        statistics: {
          playerStats: {
            user1: { cooperations: 3, betrayals: 2 }
          }
        }
      }));

      const promises = gameResults.map(result => 
        gameModeStatsService.recordGameResult('user1', result)
      );

      await Promise.all(promises);

      // Verify all operations completed
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalledTimes(5);
    });

    it('should handle large friend lists efficiently', async () => {
      // Mock large friend list
      const largeFriendshipList = Array.from({ length: 50 }, (_, i) => ({
        id: `friendship${i}`,
        requester_id: 'user1',
        addressee_id: `friend${i}`,
        status: 'accepted'
      }));

      mockAdapter.findMany.mockResolvedValue(largeFriendshipList);
      
      // Mock friend details
      mockAdapter.findOne.mockImplementation((table, query) => {
        if (table === 'users' && query.id.startsWith('friend')) {
          return Promise.resolve({
            id: query.id,
            username: `friend${query.id.slice(6)}`,
            display_name: `Friend ${query.id.slice(6)}`,
            avatar: '👤',
            last_active: new Date().toISOString(),
            trust_score: 50
          });
        }
        return Promise.resolve(null);
      });

      const friendsList = await friendService.getFriendsList('user1');
      
      expect(friendsList).toHaveLength(50);
      expect(friendsList[0]).toHaveProperty('username');
      expect(friendsList[49]).toHaveProperty('username');
    });
  });
});