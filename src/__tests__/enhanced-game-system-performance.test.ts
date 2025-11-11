// Performance and Load tests for Enhanced Game System
// Tests Requirements: Performance optimization

import { GameModeStatsService } from '../services/GameModeStatsService';
import { TrustScoreService } from '../services/TrustScoreService';
import { FriendService } from '../services/FriendService';
import { PartyService } from '../services/PartyService';

// Mock database manager with performance simulation
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

describe('Enhanced Game System Performance Tests', () => {
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

    // Mock successful database operations with realistic delays
    mockDatabaseManager.executeRawQuery.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve([]), 10))
    );
    mockDatabaseManager.executeRawCommand.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({}), 5))
    );
  });

  describe('Matchmaking Performance Tests', () => {
    it('should handle large player pools efficiently', async () => {
      const startTime = Date.now();
      
      // Create large pool of players with varying trust scores
      const largePlayerPool = Array.from({ length: 1000 }, (_, i) => ({
        id: `player${i}`,
        stats: { 
          trustScore: Math.floor(Math.random() * 100),
          totalGames: Math.floor(Math.random() * 50) + 1
        }
      }));

      // Test matchmaking performance
      const playerTrustScore = 50;
      const suitableOpponents = trustScoreService.findSuitableOpponents(playerTrustScore, largePlayerPool);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should complete within reasonable time (< 100ms for 1000 players)
      expect(executionTime).toBeLessThan(100);
      expect(suitableOpponents.length).toBeGreaterThan(0);
      expect(suitableOpponents.length).toBeLessThan(largePlayerPool.length);
    });

    it('should efficiently calculate trust scores for multiple players', async () => {
      const startTime = Date.now();
      
      // Generate multiple player statistics with valid cooperation/betrayal ratios
      const playerStats = Array.from({ length: 500 }, (_, i) => {
        const totalActions = Math.floor(Math.random() * 50) + 10;
        const cooperations = Math.floor(Math.random() * totalActions);
        const betrayals = totalActions - cooperations;
        return {
          totalGames: Math.floor(Math.random() * 100) + 10,
          cooperations,
          betrayals
        };
      });

      // Calculate trust scores for all players
      const trustScores = playerStats.map(stats => 
        trustScoreService.calculateTrustScore(stats)
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should complete within reasonable time (< 50ms for 500 calculations)
      expect(executionTime).toBeLessThan(50);
      expect(trustScores).toHaveLength(500);
      expect(trustScores.every(score => score >= 0 && score <= 100)).toBe(true);
    });

    it('should handle concurrent matchmaking requests', async () => {
      const startTime = Date.now();
      
      const playerPool = Array.from({ length: 200 }, (_, i) => ({
        id: `player${i}`,
        stats: { trustScore: Math.floor(Math.random() * 100) }
      }));

      // Simulate 20 concurrent matchmaking requests
      const matchmakingPromises = Array.from({ length: 20 }, (_, i) => {
        const playerTrustScore = 30 + (i * 2); // Varying trust scores
        return Promise.resolve(trustScoreService.findSuitableOpponents(playerTrustScore, playerPool));
      });

      const results = await Promise.all(matchmakingPromises);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should handle concurrent requests efficiently (< 200ms)
      expect(executionTime).toBeLessThan(200);
      expect(results).toHaveLength(20);
      expect(results.every(result => Array.isArray(result))).toBe(true);
    });
  });

  describe('Statistics Calculation Performance', () => {
    it('should efficiently process multiple game results', async () => {
      const startTime = Date.now();
      
      // Mock database responses
      mockDatabaseManager.executeRawQuery.mockResolvedValue([{
        total_games: 10, wins: 5, losses: 5, draws: 0,
        cooperations: 15, betrayals: 10, total_score: 150,
        highest_score: 25, win_rate: 50, betrayal_rate: 40,
        average_score: 15, longest_win_streak: 3, current_win_streak: 0,
        total_playtime: 3000, rank_points: 1000
      }]);

      // Generate multiple game results
      const gameResults = Array.from({ length: 100 }, (_, i) => ({
        id: `game${i}`,
        gameMode: 'multi' as const,
        affectsStats: true,
        winner: Math.random() > 0.5 ? 'user1' : 'user2',
        finalScores: { user1: Math.floor(Math.random() * 30), user2: Math.floor(Math.random() * 30) },
        duration: Math.floor(Math.random() * 600) + 60,
        statistics: {
          playerStats: {
            user1: { 
              cooperations: Math.floor(Math.random() * 5), 
              betrayals: Math.floor(Math.random() * 3) 
            }
          }
        }
      }));

      // Process all game results
      const promises = gameResults.map(result => 
        gameModeStatsService.recordGameResult('user1', result)
      );

      await Promise.all(promises);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should process 100 game results efficiently (< 2000ms including mock delays)
      expect(executionTime).toBeLessThan(2000);
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalledTimes(100);
    });

    it('should efficiently generate leaderboards', async () => {
      const startTime = Date.now();
      
      // Mock large leaderboard data
      const mockLeaderboardData = Array.from({ length: 1000 }, (_, i) => ({
        user_id: `user${i}`,
        username: `player${i}`,
        display_name: `Player ${i}`,
        avatar: '👤',
        total_games: Math.floor(Math.random() * 100) + 10,
        wins: Math.floor(Math.random() * 80),
        highest_score: Math.floor(Math.random() * 50) + 10,
        average_score: Math.floor(Math.random() * 30) + 5,
        rank_points: Math.floor(Math.random() * 2000) + 500,
        win_rate: Math.floor(Math.random() * 100)
      }));

      mockDatabaseManager.executeRawQuery.mockResolvedValue(mockLeaderboardData);

      const leaderboard = await gameModeStatsService.getLeaderboard('multi', 1000); // Request all 1000
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should generate leaderboard efficiently (< 100ms)
      expect(executionTime).toBeLessThan(100);
      expect(leaderboard).toHaveLength(1000);
      expect(leaderboard[0].rank).toBe(1);
    });

    it('should handle bulk statistics updates', async () => {
      const startTime = Date.now();
      
      // Mock current stats
      mockDatabaseManager.executeRawQuery.mockResolvedValue([{
        total_games: 0, wins: 0, losses: 0, draws: 0,
        total_score: 0, highest_score: 0, average_score: 0, total_playtime: 0
      }]);

      // Simulate bulk update for multiple users
      const userIds = Array.from({ length: 50 }, (_, i) => `user${i}`);
      const gameResult = {
        id: 'bulk-game',
        gameMode: 'single' as const,
        affectsStats: true,
        winner: 'user1',
        finalScores: { user1: 20 },
        duration: 300,
        statistics: { playerStats: { user1: { cooperations: 0, betrayals: 0 } } }
      };

      const promises = userIds.map(userId => 
        gameModeStatsService.recordGameResult(userId, gameResult)
      );

      await Promise.all(promises);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should handle bulk updates efficiently (< 1000ms)
      expect(executionTime).toBeLessThan(1000);
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalledTimes(50);
    });
  });

  describe('Party Synchronization Performance', () => {
    it('should handle multiple party operations concurrently', async () => {
      const startTime = Date.now();
      
      // Mock users for party creation
      mockAdapter.findOne.mockImplementation((table, query) => {
        if (table === 'users') {
          return Promise.resolve({
            id: query.id,
            username: `user${query.id}`,
            display_name: `User ${query.id}`,
            avatar: '👤'
          });
        }
        return Promise.resolve(null);
      });

      const partySettings = {
        maxPlayers: 8,
        roundCount: 10,
        tournamentFormat: 'single_elimination',
        allowSpectators: true,
        chatEnabled: true
      };

      // Create multiple parties concurrently
      const partyPromises = Array.from({ length: 10 }, (_, i) => 
        partyService.createParty(`host${i}`, partySettings)
      );

      const parties = await Promise.all(partyPromises);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should create 10 parties efficiently (< 500ms)
      expect(executionTime).toBeLessThan(500);
      expect(parties).toHaveLength(10);
      expect(parties.every(party => party.hostPlayerId.startsWith('host'))).toBe(true);
    });

    it('should efficiently handle party member updates', async () => {
      const startTime = Date.now();
      
      // Create a party first
      const host = { id: 'host1', username: 'host', display_name: 'Host', avatar: '👑' };
      mockAdapter.findOne.mockResolvedValue(host);

      const party = await partyService.createParty('host1', {
        maxPlayers: 16,
        roundCount: 10,
        tournamentFormat: 'single_elimination'
      });

      // Simulate multiple players joining
      const joinPromises = Array.from({ length: 15 }, (_, i) => {
        mockAdapter.findOne.mockResolvedValue({
          id: `player${i}`,
          username: `player${i}`,
          display_name: `Player ${i}`,
          avatar: '🎮'
        });
        return partyService.joinParty(`player${i}`, party.code);
      });

      await Promise.all(joinPromises);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should handle 15 players joining efficiently (< 300ms)
      expect(executionTime).toBeLessThan(300);
      
      const updatedParty = await partyService.getParty(party.id);
      expect(updatedParty?.currentPlayerCount).toBe(16); // Host + 15 players
    });

    it('should handle high-frequency chat messages', async () => {
      const startTime = Date.now();
      
      // Create party with chat enabled
      const host = { id: 'host1', username: 'host', display_name: 'Host', avatar: '👑' };
      mockAdapter.findOne.mockResolvedValue(host);

      const party = await partyService.createParty('host1', {
        maxPlayers: 8,
        chatEnabled: true
      });

      // Mock tournament for chat messages
      mockAdapter.findOne.mockResolvedValue({ id: 'tournament1' });

      // Simulate rapid chat messages
      const chatPromises = Array.from({ length: 50 }, (_, i) => 
        partyService.sendChatMessage(party.id, 'host1', `Message ${i}`)
      );

      await Promise.all(chatPromises);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should handle 50 chat messages efficiently (< 400ms)
      expect(executionTime).toBeLessThan(400);
      expect(mockAdapter.create).toHaveBeenCalledTimes(53); // 50 chat + 3 party creation calls (party_lobbies, party_lobby_settings, party_lobby_participants)
    });
  });

  describe('Friend System Performance', () => {
    it('should efficiently handle large friend networks', async () => {
      const startTime = Date.now();
      
      // Mock large friendship network
      const largeFriendshipList = Array.from({ length: 200 }, (_, i) => ({
        id: `friendship${i}`,
        requester_id: 'user1',
        addressee_id: `friend${i}`,
        status: 'accepted'
      }));

      mockAdapter.findMany.mockResolvedValue(largeFriendshipList);
      
      // Mock friend details with slight delay to simulate database load
      mockAdapter.findOne.mockImplementation((table, query) => {
        if (table === 'users' && query.id.startsWith('friend')) {
          return new Promise(resolve => 
            setTimeout(() => resolve({
              id: query.id,
              username: `friend${query.id.slice(6)}`,
              display_name: `Friend ${query.id.slice(6)}`,
              avatar: '👤',
              last_active: new Date().toISOString(),
              trust_score: Math.floor(Math.random() * 100)
            }), 1)
          );
        }
        return Promise.resolve(null);
      });

      const friendsList = await friendService.getFriendsList('user1');
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should handle 200 friends efficiently (< 5000ms - allowing for 200 sequential DB calls)
      expect(executionTime).toBeLessThan(5000);
      expect(friendsList).toHaveLength(200);
    });

    it('should handle concurrent friend operations', async () => {
      const startTime = Date.now();
      
      // Mock users
      const users = Array.from({ length: 20 }, (_, i) => ({
        id: `user${i}`,
        username: `user${i}`,
        display_name: `User ${i}`
      }));

      mockAdapter.findOne.mockImplementation((table, query) => {
        const user = users.find(u => u.id === query.id);
        return Promise.resolve(user || null);
      });

      // Simulate concurrent friend requests
      const friendRequestPromises = Array.from({ length: 10 }, (_, i) => {
        // Set up fresh mocks for each request
        const mockFindOne = jest.fn()
          .mockResolvedValueOnce(users[0]) // fromUser
          .mockResolvedValueOnce(users[i + 1]) // toUser
          .mockResolvedValueOnce(null); // No existing friendship
        
        mockAdapter.findOne = mockFindOne;
        
        return friendService.sendFriendRequest('user0', `user${i + 1}`);
      });

      await Promise.all(friendRequestPromises);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should handle 10 concurrent friend requests efficiently (< 200ms)
      expect(executionTime).toBeLessThan(200);
      expect(mockAdapter.create).toHaveBeenCalledTimes(10);
    });

    it('should efficiently search through large user base', async () => {
      const startTime = Date.now();
      
      // Mock large user base
      const largeUserBase = Array.from({ length: 5000 }, (_, i) => ({
        id: `user${i}`,
        username: `player${i}`,
        display_name: `Player ${i}`,
        avatar: '👤',
        trust_score: Math.floor(Math.random() * 100),
        total_games: Math.floor(Math.random() * 100),
        is_guest: 0
      }));

      // Filter users matching search query
      const searchQuery = 'player1';
      const matchingUsers = largeUserBase.filter(user => 
        user.username.includes(searchQuery) || user.display_name.includes(searchQuery)
      ).slice(0, 20); // Limit to 20 results

      mockAdapter.findMany.mockResolvedValue(matchingUsers);
      
      // Mock friendship status checks
      mockAdapter.findOne.mockResolvedValue(null);

      const searchResults = await friendService.searchUsers(searchQuery, 'user0');
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should search efficiently (< 100ms)
      expect(executionTime).toBeLessThan(100);
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should manage party cache efficiently', async () => {
      const startTime = Date.now();
      
      // Create many parties to test cache management
      mockAdapter.findOne.mockImplementation((table, query) => {
        if (table === 'users') {
          return Promise.resolve({
            id: query.id,
            username: query.id,
            display_name: query.id,
            avatar: '👤'
          });
        }
        return Promise.resolve(null);
      });

      const parties = [];
      for (let i = 0; i < 100; i++) {
        const party = await partyService.createParty(`host${i}`, {
          maxPlayers: 4,
          roundCount: 5,
          tournamentFormat: 'single_elimination'
        });
        parties.push(party);
      }

      // Verify cache size is manageable
      expect(partyService.activeParties.size).toBe(100);
      expect(partyService.partyCodeToId.size).toBe(100);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should create 100 parties efficiently (< 1000ms)
      expect(executionTime).toBeLessThan(1000);
    });

    it('should handle cleanup operations efficiently', async () => {
      const startTime = Date.now();
      
      // Create parties and then clean them up
      mockAdapter.findOne.mockResolvedValue({
        id: 'host1',
        username: 'host',
        display_name: 'Host',
        avatar: '👑'
      });

      const parties = [];
      for (let i = 0; i < 50; i++) {
        // Clear party tracking for each new party
        partyService.playerToParty.clear();
        
        const party = await partyService.createParty(`host${i}`, {
          maxPlayers: 4,
          roundCount: 5
        });
        parties.push(party);
      }

      // Mock expired parties for cleanup
      mockAdapter.findMany
        .mockResolvedValueOnce(
          parties.map(party => ({
            id: party.id,
            code: party.code,
            created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
            status: 'waiting_for_players'
          }))
        )
        .mockResolvedValue([]); // No participants for each party

      const cleanedCount = await partyService.cleanupExpiredParties();
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should cleanup efficiently (< 200ms)
      expect(executionTime).toBeLessThan(200);
      expect(cleanedCount).toBe(50);
    });
  });

  describe('Stress Testing', () => {
    it('should handle peak load simulation', async () => {
      const startTime = Date.now();
      
      // Simulate peak load with multiple concurrent operations
      const operations = [];

      // Trust score calculations
      for (let i = 0; i < 100; i++) {
        operations.push(Promise.resolve(trustScoreService.calculateTrustScore({
          totalGames: Math.floor(Math.random() * 100),
          cooperations: Math.floor(Math.random() * 80),
          betrayals: Math.floor(Math.random() * 20)
        })));
      }

      // Matchmaking operations
      const playerPool = Array.from({ length: 500 }, (_, i) => ({
        id: `player${i}`,
        stats: { trustScore: Math.floor(Math.random() * 100) }
      }));

      for (let i = 0; i < 50; i++) {
        operations.push(Promise.resolve(
          trustScoreService.findSuitableOpponents(Math.floor(Math.random() * 100), playerPool)
        ));
      }

      // Statistics operations
      mockDatabaseManager.executeRawQuery.mockResolvedValue([{
        total_games: 10, wins: 5, losses: 5, draws: 0,
        total_score: 150, highest_score: 25, average_score: 15, total_playtime: 3000
      }]);

      for (let i = 0; i < 30; i++) {
        operations.push(gameModeStatsService.getPlayerStats(`user${i}`, 'single'));
      }

      await Promise.all(operations);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should handle peak load efficiently (< 1000ms for 180 operations)
      expect(executionTime).toBeLessThan(1000);
    });
  });
});