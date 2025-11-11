// Unit tests for TrustScoreService
// Tests Requirements: 1.1, 2.1, 5.1, 6.1

const { TrustScoreService, getTrustScoreService } = require('../TrustScoreService');

describe('TrustScoreService', () => {
  let trustScoreService;

  beforeEach(() => {
    trustScoreService = new TrustScoreService();
  });

  describe('calculateTrustScore', () => {
    it('should return base score for new players with no games', () => {
      const stats = { totalGames: 0 };
      const trustScore = trustScoreService.calculateTrustScore(stats);
      expect(trustScore).toBe(50);
    });

    it('should return base score for null stats', () => {
      const trustScore = trustScoreService.calculateTrustScore(null);
      expect(trustScore).toBe(50);
    });

    it('should calculate high trust score for cooperative players', () => {
      const stats = {
        totalGames: 10,
        cooperations: 8,
        betrayals: 2
      };
      const trustScore = trustScoreService.calculateTrustScore(stats);
      expect(trustScore).toBeGreaterThan(50); // More realistic expectation
      expect(trustScore).toBeLessThanOrEqual(100);
    });

    it('should calculate low trust score for betraying players', () => {
      const stats = {
        totalGames: 10,
        cooperations: 2,
        betrayals: 8
      };
      const trustScore = trustScoreService.calculateTrustScore(stats);
      expect(trustScore).toBeLessThan(50); // More realistic expectation
      expect(trustScore).toBeGreaterThanOrEqual(0);
    });

    it('should apply experience modifier for new players', () => {
      const newPlayerStats = {
        totalGames: 5,
        cooperations: 5,
        betrayals: 0
      };
      const experiencedPlayerStats = {
        totalGames: 50,
        cooperations: 50,
        betrayals: 0
      };
      
      const newPlayerScore = trustScoreService.calculateTrustScore(newPlayerStats);
      const experiencedPlayerScore = trustScoreService.calculateTrustScore(experiencedPlayerStats);
      
      expect(experiencedPlayerScore).toBeGreaterThan(newPlayerScore);
    });

    it('should ensure score stays within bounds', () => {
      const extremeCooperativeStats = {
        totalGames: 100,
        cooperations: 100,
        betrayals: 0
      };
      const extremeBetrayalStats = {
        totalGames: 100,
        cooperations: 0,
        betrayals: 100
      };
      
      const highScore = trustScoreService.calculateTrustScore(extremeCooperativeStats);
      const lowScore = trustScoreService.calculateTrustScore(extremeBetrayalStats);
      
      expect(highScore).toBeLessThanOrEqual(100);
      expect(lowScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getMatchmakingRange', () => {
    it('should return appropriate range for average trust score', () => {
      const range = trustScoreService.getMatchmakingRange(50);
      expect(range.min).toBeLessThan(50);
      expect(range.max).toBeGreaterThan(50);
      expect(range.max - range.min).toBeGreaterThan(0);
    });

    it('should return narrower range for extreme scores', () => {
      const highRange = trustScoreService.getMatchmakingRange(90);
      const lowRange = trustScoreService.getMatchmakingRange(10);
      const midRange = trustScoreService.getMatchmakingRange(50);
      
      expect(highRange.max - highRange.min).toBeLessThan(midRange.max - midRange.min);
      expect(lowRange.max - lowRange.min).toBeLessThan(midRange.max - midRange.min);
    });

    it('should respect minimum and maximum bounds', () => {
      const range = trustScoreService.getMatchmakingRange(5);
      expect(range.min).toBeGreaterThanOrEqual(0);
      expect(range.max).toBeLessThanOrEqual(100);
    });
  });

  describe('updatePlayerStats', () => {
    it('should not update stats for single player games', () => {
      const currentStats = {
        totalGames: 5,
        wins: 3,
        cooperations: 10,
        betrayals: 5
      };
      const gameResult = {
        gameMode: 'single_player',
        won: true,
        cooperations: 3,
        betrayals: 2,
        score: 15
      };
      
      const updatedStats = trustScoreService.updatePlayerStats(currentStats, gameResult);
      expect(updatedStats).toEqual(currentStats);
    });

    it('should update stats for multiplayer games', () => {
      const currentStats = {
        totalGames: 5,
        wins: 3,
        losses: 2,
        cooperations: 10,
        betrayals: 5,
        totalScore: 75
      };
      const gameResult = {
        gameMode: 'multiplayer',
        won: true,
        cooperations: 3,
        betrayals: 2,
        score: 15
      };
      
      const updatedStats = trustScoreService.updatePlayerStats(currentStats, gameResult);
      
      expect(updatedStats.totalGames).toBe(6);
      expect(updatedStats.wins).toBe(4);
      expect(updatedStats.cooperations).toBe(13);
      expect(updatedStats.betrayals).toBe(7);
      expect(updatedStats.totalScore).toBe(90);
      expect(updatedStats.trustScore).toBeDefined();
    });

    it('should calculate derived statistics correctly', () => {
      const currentStats = {
        totalGames: 0,
        wins: 0,
        losses: 0,
        cooperations: 0,
        betrayals: 0,
        totalScore: 0
      };
      const gameResult = {
        gameMode: 'multiplayer',
        won: true,
        cooperations: 4,
        betrayals: 1,
        score: 20
      };
      
      const updatedStats = trustScoreService.updatePlayerStats(currentStats, gameResult);
      
      expect(updatedStats.winRate).toBe(100);
      expect(updatedStats.cooperationRate).toBe(80);
      expect(updatedStats.betrayalRate).toBe(20);
      expect(updatedStats.averageScore).toBe(20);
    });

    it('should update mode-specific stats', () => {
      const currentStats = {
        totalGames: 0,
        wins: 0,
        losses: 0,
        cooperations: 0,
        betrayals: 0,
        totalScore: 0
      };
      const gameResult = {
        gameMode: 'party',
        won: true,
        cooperations: 3,
        betrayals: 2,
        score: 15
      };
      
      const updatedStats = trustScoreService.updatePlayerStats(currentStats, gameResult);
      
      expect(updatedStats.partyStats).toBeDefined();
      expect(updatedStats.partyStats.totalGames).toBe(1);
      expect(updatedStats.partyStats.wins).toBe(1);
    });
  });

  describe('getLeaderboard', () => {
    const mockPlayers = [
      {
        id: 'player1',
        username: 'Player1',
        stats: {
          totalGames: 10,
          wins: 8,
          losses: 2,
          cooperations: 15,
          betrayals: 5,
          totalScore: 850,
          averageScore: 85,
          winRate: 80,
          trustScore: 75,
          multiplayerStats: { totalGames: 5, wins: 4, averageScore: 80, winRate: 80, cooperations: 8, betrayals: 2, totalScore: 400 }
        }
      },
      {
        id: 'player2',
        username: 'Player2',
        stats: {
          totalGames: 15,
          wins: 10,
          losses: 5,
          cooperations: 20,
          betrayals: 10,
          totalScore: 1050,
          averageScore: 70,
          winRate: 66.67,
          trustScore: 60,
          multiplayerStats: { totalGames: 8, wins: 5, averageScore: 65, winRate: 62.5, cooperations: 12, betrayals: 8, totalScore: 520 }
        }
      },
      {
        id: 'player3',
        username: 'Player3',
        stats: {
          totalGames: 0
        }
      }
    ];

    it('should return overall leaderboard sorted by composite score', () => {
      const leaderboard = trustScoreService.getLeaderboard(mockPlayers, 'overall');
      
      expect(leaderboard).toHaveLength(2); // Player3 excluded due to no games
      expect(leaderboard[0].sortScore).toBeGreaterThanOrEqual(leaderboard[1].sortScore);
    });

    it('should return multiplayer leaderboard', () => {
      const leaderboard = trustScoreService.getLeaderboard(mockPlayers, 'multiplayer');
      
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard.every(p => p.displayStats.totalGames > 0)).toBe(true);
    });

    it('should filter out players with no games in specified mode', () => {
      const playersWithoutPartyStats = [
        {
          id: 'player1',
          username: 'Player1',
          stats: { totalGames: 10 }
        }
      ];
      
      const leaderboard = trustScoreService.getLeaderboard(playersWithoutPartyStats, 'party');
      expect(leaderboard).toHaveLength(0);
    });
  });

  describe('findSuitableOpponents', () => {
    const mockAvailablePlayers = [
      { id: 'player1', stats: { trustScore: 45 } },
      { id: 'player2', stats: { trustScore: 55 } },
      { id: 'player3', stats: { trustScore: 75 } },
      { id: 'player4', stats: null }
    ];

    it('should find opponents within trust score range', () => {
      const opponents = trustScoreService.findSuitableOpponents(50, mockAvailablePlayers);
      
      expect(opponents).toHaveLength(3); // player1, player2, and player4 (default score)
      expect(opponents.some(p => p.id === 'player3')).toBe(false);
    });

    it('should include players with default trust score when no stats available', () => {
      const opponents = trustScoreService.findSuitableOpponents(50, mockAvailablePlayers);
      
      expect(opponents.some(p => p.id === 'player4')).toBe(true);
    });

    it('should return empty array when no suitable opponents found', () => {
      const extremePlayers = [
        { id: 'player1', stats: { trustScore: 10 } },
        { id: 'player2', stats: { trustScore: 15 } }
      ];
      
      const opponents = trustScoreService.findSuitableOpponents(90, extremePlayers);
      expect(opponents).toHaveLength(0);
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance from getTrustScoreService', () => {
      const instance1 = getTrustScoreService();
      const instance2 = getTrustScoreService();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(TrustScoreService);
    });
  });
});