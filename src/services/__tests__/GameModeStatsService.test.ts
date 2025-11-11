// Unit tests for GameModeStatsService
// Tests Requirements: 1.1, 2.1, 5.1, 6.1

import { GameModeStatsService, getGameModeStatsService, resetGameModeStatsService } from '../GameModeStatsService';
import { GameMode, EnhancedGameResult } from '../../database/core/types';

// Mock the database manager
const mockDatabaseManager = {
  executeRawQuery: jest.fn(),
  executeRawCommand: jest.fn()
};

jest.mock('../LoggingService', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  })
}));

jest.mock('../../database/DatabaseManager', () => ({
  getDatabaseManager: () => mockDatabaseManager
}));

describe('GameModeStatsService', () => {
  let gameModeStatsService: GameModeStatsService;

  beforeEach(() => {
    resetGameModeStatsService();
    gameModeStatsService = new GameModeStatsService();
    jest.clearAllMocks();
  });

  describe('recordGameResult', () => {
    const mockGameResult: EnhancedGameResult = {
      id: 'game1',
      gameMode: 'multi' as GameMode,
      affectsStats: true,
      winner: 'user1',
      finalScores: { user1: 15, user2: 10 },
      duration: 300,
      statistics: {
        playerStats: {
          user1: { cooperations: 3, betrayals: 2 },
          user2: { cooperations: 2, betrayals: 3 }
        }
      }
    };

    beforeEach(() => {
      // Mock default stats for getPlayerStats calls
      mockDatabaseManager.executeRawQuery.mockResolvedValue([{
        total_games: 0, wins: 0, losses: 0, draws: 0,
        total_score: 0, highest_score: 0, average_score: 0, total_playtime: 0,
        cooperations: 0, betrayals: 0, win_rate: 0, betrayal_rate: 0,
        longest_win_streak: 0, current_win_streak: 0, rank_points: 1000,
        parties_hosted: 0, parties_joined: 0
      }]);
    });

    it('should record single player game results', async () => {
      const singlePlayerResult = { ...mockGameResult, gameMode: 'single' as GameMode };
      
      await gameModeStatsService.recordGameResult('user1', singlePlayerResult);
      
      // Should call updateSinglePlayerStats (via executeRawCommand)
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalled();
    });

    it('should record multiplayer game results when affects stats', async () => {
      await gameModeStatsService.recordGameResult('user1', mockGameResult);
      
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalled();
    });

    it('should not record multiplayer stats when affects stats is false', async () => {
      const nonStatsResult = { ...mockGameResult, affectsStats: false };
      
      await gameModeStatsService.recordGameResult('user1', nonStatsResult);
      
      // Should not call database update for multiplayer stats
      expect(mockDatabaseManager.executeRawCommand).not.toHaveBeenCalled();
    });

    it('should record party game results', async () => {
      const partyResult = { ...mockGameResult, gameMode: 'party' as GameMode };
      
      await gameModeStatsService.recordGameResult('user1', partyResult);
      
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalled();
    });
  });

  describe('getPlayerStats', () => {
    it('should return single player stats', async () => {
      const mockStats = {
        user_id: 'user1',
        total_games: 10,
        wins: 7,
        losses: 3,
        draws: 0,
        total_score: 150,
        highest_score: 25,
        average_score: 15,
        total_playtime: 3000
      };
      
      mockDatabaseManager.executeRawQuery.mockResolvedValue([mockStats]);
      
      const stats = await gameModeStatsService.getPlayerStats('user1', 'single');
      
      expect(stats.totalGames).toBe(10);
      expect(stats.wins).toBe(7);
      expect(stats.averageScore).toBe(15);
      expect(mockDatabaseManager.executeRawQuery).toHaveBeenCalledWith(
        'SELECT * FROM user_single_stats WHERE user_id = ?',
        ['user1']
      );
    });

    it('should return multiplayer stats', async () => {
      const mockStats = {
        user_id: 'user1',
        total_games: 15,
        wins: 10,
        losses: 5,
        draws: 0,
        cooperations: 25,
        betrayals: 10,
        total_score: 200,
        highest_score: 30,
        win_rate: 66.67,
        betrayal_rate: 28.57,
        average_score: 13.33,
        longest_win_streak: 5,
        current_win_streak: 2,
        total_playtime: 4500,
        rank_points: 1250
      };
      
      mockDatabaseManager.executeRawQuery.mockResolvedValue([mockStats]);
      
      const stats = await gameModeStatsService.getPlayerStats('user1', 'multi');
      
      expect(stats.totalGames).toBe(15);
      expect(stats.cooperations).toBe(25);
      expect(stats.rankPoints).toBe(1250);
    });

    it('should return default stats when no record exists', async () => {
      mockDatabaseManager.executeRawQuery.mockResolvedValue([]);
      
      const stats = await gameModeStatsService.getPlayerStats('user1', 'single');
      
      expect(stats.totalGames).toBe(0);
      expect(stats.wins).toBe(0);
      expect(stats.averageScore).toBe(0);
    });

    it('should throw error for invalid game mode', async () => {
      await expect(
        gameModeStatsService.getPlayerStats('user1', 'invalid' as GameMode)
      ).rejects.toThrow('Invalid game mode: invalid');
    });
  });

  describe('getLeaderboard', () => {
    const mockLeaderboardData = [
      {
        user_id: 'user1',
        username: 'Player1',
        display_name: 'Player One',
        avatar: '👤',
        total_games: 20,
        wins: 15,
        highest_score: 30,
        average_score: 18,
        rank_points: 1500
      },
      {
        user_id: 'user2',
        username: 'Player2',
        display_name: 'Player Two',
        avatar: '🎮',
        total_games: 18,
        wins: 12,
        highest_score: 25,
        average_score: 16,
        rank_points: 1300
      }
    ];

    it('should return single player leaderboard', async () => {
      mockDatabaseManager.executeRawQuery.mockResolvedValue(mockLeaderboardData);
      
      const leaderboard = await gameModeStatsService.getLeaderboard('single', 10);
      
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[0].userId).toBe('user1');
      expect(mockDatabaseManager.executeRawQuery).toHaveBeenCalledWith(
        expect.stringContaining('user_single_stats'),
        [10]
      );
    });

    it('should return multiplayer leaderboard ordered by rank points', async () => {
      mockDatabaseManager.executeRawQuery.mockResolvedValue(mockLeaderboardData);
      
      const leaderboard = await gameModeStatsService.getLeaderboard('multi', 50);
      
      expect(leaderboard).toHaveLength(2);
      expect(mockDatabaseManager.executeRawQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY rank_points DESC'),
        [50]
      );
    });

    it('should use default limit when not specified', async () => {
      mockDatabaseManager.executeRawQuery.mockResolvedValue([]);
      
      await gameModeStatsService.getLeaderboard('party');
      
      expect(mockDatabaseManager.executeRawQuery).toHaveBeenCalledWith(
        expect.any(String),
        [50]
      );
    });
  });

  describe('getSeparateStatistics', () => {
    it('should return statistics for all game modes', async () => {
      const mockSingleStats = { 
        total_games: 5, wins: 3, losses: 2, draws: 0,
        total_score: 75, highest_score: 20, average_score: 15, total_playtime: 1500
      };
      const mockMultiStats = { 
        total_games: 10, wins: 7, losses: 3, draws: 0,
        cooperations: 15, betrayals: 5, total_score: 150, highest_score: 25,
        win_rate: 70, betrayal_rate: 25, average_score: 15,
        longest_win_streak: 3, current_win_streak: 1, total_playtime: 3000, rank_points: 1200
      };
      const mockPartyStats = { 
        total_games: 8, wins: 5, losses: 3, draws: 0,
        cooperations: 12, betrayals: 4, total_score: 120, highest_score: 22,
        win_rate: 62.5, betrayal_rate: 25, average_score: 15,
        parties_hosted: 2, parties_joined: 8, total_playtime: 2400
      };
      
      mockDatabaseManager.executeRawQuery
        .mockResolvedValueOnce([mockSingleStats])
        .mockResolvedValueOnce([mockMultiStats])
        .mockResolvedValueOnce([mockPartyStats]);
      
      const separateStats = await gameModeStatsService.getSeparateStatistics('user1');
      
      expect(separateStats.singlePlayer.totalGames).toBe(5);
      expect(separateStats.multiplayer.totalGames).toBe(10);
      expect(separateStats.party.totalGames).toBe(8);
    });
  });

  describe('updateModeSpecificStats', () => {
    const mockGameResult: EnhancedGameResult = {
      id: 'game1',
      gameMode: 'multi' as GameMode,
      affectsStats: true,
      winner: 'user1',
      finalScores: { user1: 15, user2: 10 },
      duration: 300,
      statistics: {
        playerStats: {
          user1: { cooperations: 3, betrayals: 2 }
        }
      }
    };

    it('should update single player stats', async () => {
      const singleResult = { ...mockGameResult, gameMode: 'single' as GameMode };
      mockDatabaseManager.executeRawQuery.mockResolvedValue([{
        total_games: 0, wins: 0, losses: 0, draws: 0,
        total_score: 0, highest_score: 0, average_score: 0, total_playtime: 0
      }]);
      
      await gameModeStatsService.updateModeSpecificStats('user1', 'single', singleResult);
      
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO user_single_stats'),
        expect.any(Array)
      );
    });

    it('should update multiplayer stats with rank points', async () => {
      mockDatabaseManager.executeRawQuery.mockResolvedValue([{
        total_games: 5, wins: 3, losses: 2, draws: 0,
        cooperations: 10, betrayals: 5, total_score: 75,
        highest_score: 20, win_rate: 60, betrayal_rate: 33.33,
        average_score: 15, longest_win_streak: 2, current_win_streak: 1,
        total_playtime: 1500, rank_points: 1100
      }]);
      
      await gameModeStatsService.updateModeSpecificStats('user1', 'multi', mockGameResult);
      
      expect(mockDatabaseManager.executeRawCommand).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO user_multi_stats'),
        expect.arrayContaining([expect.any(Number)]) // rank_points should be included
      );
    });

    it('should throw error for invalid game mode', async () => {
      await expect(
        gameModeStatsService.updateModeSpecificStats('user1', 'invalid' as GameMode, mockGameResult)
      ).rejects.toThrow('Invalid game mode: invalid');
    });
  });

  describe('helper methods', () => {
    const mockGameResult: EnhancedGameResult = {
      id: 'game1',
      gameMode: 'multi' as GameMode,
      affectsStats: true,
      winner: 'user1',
      finalScores: { user1: 15, user2: 10 },
      duration: 300,
      statistics: {
        playerStats: {
          user1: { cooperations: 3, betrayals: 2 }
        }
      }
    };

    it('should correctly identify wins and losses', () => {
      // Access private methods through any casting for testing
      const service = gameModeStatsService as any;
      
      expect(service.isWin(mockGameResult, 'user1')).toBe(true);
      expect(service.isWin(mockGameResult, 'user2')).toBe(false);
      expect(service.isLoss(mockGameResult, 'user2')).toBe(true);
      expect(service.isLoss(mockGameResult, 'user1')).toBe(false);
    });

    it('should correctly identify draws', () => {
      const drawResult = { ...mockGameResult, winner: null };
      const service = gameModeStatsService as any;
      
      expect(service.isDraw(drawResult)).toBe(true);
      expect(service.isDraw(mockGameResult)).toBe(false);
    });

    it('should get player scores correctly', () => {
      const service = gameModeStatsService as any;
      
      expect(service.getPlayerScore(mockGameResult, 'user1')).toBe(15);
      expect(service.getPlayerScore(mockGameResult, 'user2')).toBe(10);
      expect(service.getPlayerScore(mockGameResult, 'user3')).toBe(0);
    });

    it('should calculate rank points correctly', () => {
      const service = gameModeStatsService as any;
      
      expect(service.calculateNewRankPoints(1000, true, false)).toBe(1025);
      expect(service.calculateNewRankPoints(1000, false, true)).toBe(985);
      expect(service.calculateNewRankPoints(1000, false, false)).toBe(1000);
      expect(service.calculateNewRankPoints(10, false, true)).toBe(0); // Minimum bound
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance from getGameModeStatsService', () => {
      const instance1 = getGameModeStatsService();
      const instance2 = getGameModeStatsService();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(GameModeStatsService);
    });

    it('should reset singleton instance', () => {
      const instance1 = getGameModeStatsService();
      resetGameModeStatsService();
      const instance2 = getGameModeStatsService();
      
      expect(instance1).not.toBe(instance2);
    });
  });
});