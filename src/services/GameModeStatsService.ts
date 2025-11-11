// Game Mode Statistics Service - Separate tracking for different game modes

import { 
  GameMode, 
  SinglePlayerStats, 
  MultiPlayerStats, 
  PartyStats, 
  SeparateStats,
  EnhancedGameResult
} from '../database/core/types';
import { getLogger } from './LoggingService';
import { getDatabaseManager } from '../database/DatabaseManager';

export interface IGameModeStatsService {
  recordGameResult(userId: string, gameResult: EnhancedGameResult): Promise<void>;
  getPlayerStats(userId: string, mode: GameMode): Promise<SinglePlayerStats | MultiPlayerStats | PartyStats>;
  getLeaderboard(mode: GameMode, limit: number): Promise<LeaderboardEntry[]>;
  getSeparateStatistics(userId: string): Promise<SeparateStats>;
  updateModeSpecificStats(userId: string, mode: GameMode, gameResult: EnhancedGameResult): Promise<void>;
}

interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  stats: SinglePlayerStats | MultiPlayerStats | PartyStats;
  rank: number;
  score: number;
}

export class GameModeStatsService implements IGameModeStatsService {
  private readonly logger = getLogger();

  constructor() {
    this.logger.info('Game Mode Statistics Service initialized');
  }

  /**
   * Record game result and update appropriate statistics
   */
  async recordGameResult(userId: string, gameResult: EnhancedGameResult): Promise<void> {
    try {
      const { gameMode, affectsStats } = gameResult;

      this.logger.debug('Recording game result', {
        userId,
        gameMode,
        affectsStats
      });

      // Single player games don't affect multiplayer/party stats
      if (gameMode === 'single') {
        await this.updateSinglePlayerStats(userId, gameResult);
      } else if (affectsStats) {
        // Only update multiplayer/party stats if the game affects stats
        if (gameMode === 'multi') {
          await this.updateMultiPlayerStats(userId, gameResult);
        } else if (gameMode === 'party') {
          await this.updatePartyStats(userId, gameResult);
        }
      }

      this.logger.info('Game result recorded successfully', {
        userId,
        gameMode,
        affectsStats
      });
    } catch (error) {
      this.logger.error('Failed to record game result', error as Error, { userId, gameResult });
      throw error;
    }
  }

  /**
   * Get player statistics for a specific game mode
   */
  async getPlayerStats(userId: string, mode: GameMode): Promise<SinglePlayerStats | MultiPlayerStats | PartyStats> {
    try {
      const dbManager = getDatabaseManager();
      
      let tableName: string;
      switch (mode) {
        case 'single':
          tableName = 'user_single_stats';
          break;
        case 'multi':
          tableName = 'user_multi_stats';
          break;
        case 'party':
          tableName = 'user_party_stats';
          break;
        default:
          throw new Error(`Invalid game mode: ${mode}`);
      }

      const result = await dbManager.executeRawQuery<any>(
        `SELECT * FROM ${tableName} WHERE user_id = ?`,
        [userId]
      );

      if (result.length === 0) {
        // Return default stats if no record exists
        return this.getDefaultStatsForMode(mode);
      }

      return this.mapDatabaseStatsToInterface(result[0], mode);
    } catch (error) {
      this.logger.error('Failed to get player stats', error as Error, { userId, mode });
      throw error;
    }
  }

  /**
   * Get leaderboard for a specific game mode
   */
  async getLeaderboard(mode: GameMode, limit: number = 50): Promise<LeaderboardEntry[]> {
    try {
      const dbManager = getDatabaseManager();
      
      let tableName: string;
      let orderByClause: string;
      
      switch (mode) {
        case 'single':
          tableName = 'user_single_stats';
          orderByClause = 'ORDER BY highest_score DESC, average_score DESC, total_games DESC';
          break;
        case 'multi':
          tableName = 'user_multi_stats';
          orderByClause = 'ORDER BY rank_points DESC, win_rate DESC, total_games DESC';
          break;
        case 'party':
          tableName = 'user_party_stats';
          orderByClause = 'ORDER BY win_rate DESC, average_score DESC, total_games DESC';
          break;
        default:
          throw new Error(`Invalid game mode: ${mode}`);
      }

      const query = `
        SELECT 
          s.*,
          u.username,
          u.display_name,
          u.avatar
        FROM ${tableName} s
        JOIN users u ON s.user_id = u.id
        WHERE s.total_games > 0
        ${orderByClause}
        LIMIT ?
      `;

      const results = await dbManager.executeRawQuery<any>(query, [limit]);

      return results.map((row, index) => ({
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatar: row.avatar,
        stats: this.mapDatabaseStatsToInterface(row, mode),
        rank: index + 1,
        score: this.calculateLeaderboardScore(row, mode)
      }));
    } catch (error) {
      this.logger.error('Failed to get leaderboard', error as Error, { mode, limit });
      throw error;
    }
  }

  /**
   * Get separate statistics for all game modes
   */
  async getSeparateStatistics(userId: string): Promise<SeparateStats> {
    try {
      const [singlePlayer, multiplayer, party] = await Promise.all([
        this.getPlayerStats(userId, 'single') as Promise<SinglePlayerStats>,
        this.getPlayerStats(userId, 'multi') as Promise<MultiPlayerStats>,
        this.getPlayerStats(userId, 'party') as Promise<PartyStats>
      ]);

      return {
        singlePlayer,
        multiplayer,
        party
      };
    } catch (error) {
      this.logger.error('Failed to get separate statistics', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Update mode-specific statistics
   */
  async updateModeSpecificStats(userId: string, mode: GameMode, gameResult: EnhancedGameResult): Promise<void> {
    switch (mode) {
      case 'single':
        await this.updateSinglePlayerStats(userId, gameResult);
        break;
      case 'multi':
        await this.updateMultiPlayerStats(userId, gameResult);
        break;
      case 'party':
        await this.updatePartyStats(userId, gameResult);
        break;
      default:
        throw new Error(`Invalid game mode: ${mode}`);
    }
  }

  /**
   * Update single player statistics
   */
  private async updateSinglePlayerStats(userId: string, gameResult: EnhancedGameResult): Promise<void> {
    const dbManager = getDatabaseManager();
    
    // Get current stats
    const currentStats = await this.getPlayerStats(userId, 'single') as SinglePlayerStats;
    
    // Calculate new stats
    const newStats = {
      totalGames: currentStats.totalGames + 1,
      wins: currentStats.wins + (this.isWin(gameResult, userId) ? 1 : 0),
      losses: currentStats.losses + (this.isLoss(gameResult, userId) ? 1 : 0),
      draws: currentStats.draws + (this.isDraw(gameResult) ? 1 : 0),
      totalScore: currentStats.totalScore + this.getPlayerScore(gameResult, userId),
      highestScore: Math.max(currentStats.highestScore, this.getPlayerScore(gameResult, userId)),
      totalPlaytime: currentStats.totalPlaytime + (gameResult.duration || 0),
      averageScore: 0 // Will be calculated below
    };
    
    newStats.averageScore = newStats.totalScore / newStats.totalGames;

    // Upsert stats
    await dbManager.executeRawCommand(
      `INSERT OR REPLACE INTO user_single_stats 
       (user_id, total_games, wins, losses, draws, total_score, highest_score, average_score, total_playtime, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, newStats.totalGames, newStats.wins, newStats.losses, newStats.draws,
        newStats.totalScore, newStats.highestScore, newStats.averageScore, 
        newStats.totalPlaytime, new Date().toISOString()
      ]
    );
  }

  /**
   * Update multiplayer statistics
   */
  private async updateMultiPlayerStats(userId: string, gameResult: EnhancedGameResult): Promise<void> {
    const dbManager = getDatabaseManager();
    
    // Get current stats
    const currentStats = await this.getPlayerStats(userId, 'multi') as MultiPlayerStats;
    
    // Calculate new stats
    const isWin = this.isWin(gameResult, userId);
    const isLoss = this.isLoss(gameResult, userId);
    const playerScore = this.getPlayerScore(gameResult, userId);
    
    const newStats = {
      totalGames: currentStats.totalGames + 1,
      wins: currentStats.wins + (isWin ? 1 : 0),
      losses: currentStats.losses + (isLoss ? 1 : 0),
      draws: currentStats.draws + (this.isDraw(gameResult) ? 1 : 0),
      cooperations: currentStats.cooperations + this.getCooperations(gameResult, userId),
      betrayals: currentStats.betrayals + this.getBetrayals(gameResult, userId),
      totalScore: currentStats.totalScore + playerScore,
      highestScore: Math.max(currentStats.highestScore, playerScore),
      totalPlaytime: currentStats.totalPlaytime + (gameResult.duration || 0),
      rankPoints: this.calculateNewRankPoints(currentStats.rankPoints, isWin, isLoss),
      winRate: 0, // Will be calculated below
      betrayalRate: 0, // Will be calculated below
      averageScore: 0, // Will be calculated below
      longestWinStreak: currentStats.longestWinStreak,
      currentWinStreak: currentStats.currentWinStreak
    };
    
    newStats.winRate = (newStats.wins / newStats.totalGames) * 100;
    newStats.betrayalRate = newStats.betrayals / (newStats.cooperations + newStats.betrayals) * 100;
    newStats.averageScore = newStats.totalScore / newStats.totalGames;
    
    // Update win streak
    if (isWin) {
      newStats.currentWinStreak = currentStats.currentWinStreak + 1;
      newStats.longestWinStreak = Math.max(currentStats.longestWinStreak, newStats.currentWinStreak);
    } else {
      newStats.currentWinStreak = 0;
    }

    // Upsert stats
    await dbManager.executeRawCommand(
      `INSERT OR REPLACE INTO user_multi_stats 
       (user_id, total_games, wins, losses, draws, cooperations, betrayals, total_score, 
        highest_score, win_rate, betrayal_rate, average_score, longest_win_streak, 
        current_win_streak, total_playtime, rank_points, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, newStats.totalGames, newStats.wins, newStats.losses, newStats.draws,
        newStats.cooperations, newStats.betrayals, newStats.totalScore, newStats.highestScore,
        newStats.winRate, newStats.betrayalRate, newStats.averageScore, 
        newStats.longestWinStreak, newStats.currentWinStreak, newStats.totalPlaytime,
        newStats.rankPoints, new Date().toISOString()
      ]
    );
  }

  /**
   * Update party statistics
   */
  private async updatePartyStats(userId: string, gameResult: EnhancedGameResult): Promise<void> {
    const dbManager = getDatabaseManager();
    
    // Get current stats
    const currentStats = await this.getPlayerStats(userId, 'party') as PartyStats;
    
    // Calculate new stats
    const isWin = this.isWin(gameResult, userId);
    const playerScore = this.getPlayerScore(gameResult, userId);
    
    const newStats = {
      totalGames: currentStats.totalGames + 1,
      wins: currentStats.wins + (isWin ? 1 : 0),
      losses: currentStats.losses + (this.isLoss(gameResult, userId) ? 1 : 0),
      draws: currentStats.draws + (this.isDraw(gameResult) ? 1 : 0),
      cooperations: currentStats.cooperations + this.getCooperations(gameResult, userId),
      betrayals: currentStats.betrayals + this.getBetrayals(gameResult, userId),
      totalScore: currentStats.totalScore + playerScore,
      highestScore: Math.max(currentStats.highestScore, playerScore),
      partiesHosted: currentStats.partiesHosted + (this.wasHost(gameResult, userId) ? 1 : 0),
      partiesJoined: currentStats.partiesJoined + 1,
      totalPlaytime: currentStats.totalPlaytime + (gameResult.duration || 0),
      winRate: 0, // Will be calculated below
      betrayalRate: 0, // Will be calculated below
      averageScore: 0 // Will be calculated below
    };
    
    newStats.winRate = (newStats.wins / newStats.totalGames) * 100;
    newStats.betrayalRate = newStats.betrayals / (newStats.cooperations + newStats.betrayals) * 100;
    newStats.averageScore = newStats.totalScore / newStats.totalGames;

    // Upsert stats
    await dbManager.executeRawCommand(
      `INSERT OR REPLACE INTO user_party_stats 
       (user_id, total_games, wins, losses, draws, cooperations, betrayals, total_score, 
        highest_score, win_rate, betrayal_rate, average_score, parties_hosted, 
        parties_joined, total_playtime, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, newStats.totalGames, newStats.wins, newStats.losses, newStats.draws,
        newStats.cooperations, newStats.betrayals, newStats.totalScore, newStats.highestScore,
        newStats.winRate, newStats.betrayalRate, newStats.averageScore, 
        newStats.partiesHosted, newStats.partiesJoined, newStats.totalPlaytime,
        new Date().toISOString()
      ]
    );
  }

  /**
   * Helper methods for game result analysis
   */
  private isWin(gameResult: EnhancedGameResult, userId: string): boolean {
    return gameResult.winner === userId;
  }

  private isLoss(gameResult: EnhancedGameResult, userId: string): boolean {
    return gameResult.winner !== null && gameResult.winner !== userId;
  }

  private isDraw(gameResult: EnhancedGameResult): boolean {
    return gameResult.winner === null;
  }

  private getPlayerScore(gameResult: EnhancedGameResult, userId: string): number {
    return gameResult.finalScores[userId] || 0;
  }

  private getCooperations(gameResult: EnhancedGameResult, userId: string): number {
    return gameResult.statistics?.playerStats?.[userId]?.cooperations || 0;
  }

  private getBetrayals(gameResult: EnhancedGameResult, userId: string): number {
    return gameResult.statistics?.playerStats?.[userId]?.betrayals || 0;
  }

  private wasHost(gameResult: EnhancedGameResult, userId: string): boolean {
    // This would need to be determined from game metadata or party information
    return false; // Placeholder
  }

  private calculateNewRankPoints(currentPoints: number, isWin: boolean, isLoss: boolean): number {
    if (isWin) {
      return currentPoints + 25;
    } else if (isLoss) {
      return Math.max(0, currentPoints - 15);
    }
    return currentPoints; // Draw - no change
  }

  private getDefaultStatsForMode(mode: GameMode): SinglePlayerStats | MultiPlayerStats | PartyStats {
    const baseStats = {
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      totalScore: 0,
      highestScore: 0,
      averageScore: 0,
      totalPlaytime: 0
    };

    switch (mode) {
      case 'single':
        return baseStats as SinglePlayerStats;
      case 'multi':
        return {
          ...baseStats,
          cooperations: 0,
          betrayals: 0,
          winRate: 0,
          betrayalRate: 0,
          longestWinStreak: 0,
          currentWinStreak: 0,
          rankPoints: 1000
        } as MultiPlayerStats;
      case 'party':
        return {
          ...baseStats,
          cooperations: 0,
          betrayals: 0,
          winRate: 0,
          betrayalRate: 0,
          partiesHosted: 0,
          partiesJoined: 0
        } as PartyStats;
      default:
        throw new Error(`Invalid game mode: ${mode}`);
    }
  }

  private mapDatabaseStatsToInterface(dbStats: any, mode: GameMode): SinglePlayerStats | MultiPlayerStats | PartyStats {
    const baseStats = {
      totalGames: dbStats.total_games || 0,
      wins: dbStats.wins || 0,
      losses: dbStats.losses || 0,
      draws: dbStats.draws || 0,
      totalScore: dbStats.total_score || 0,
      highestScore: dbStats.highest_score || 0,
      averageScore: dbStats.average_score || 0,
      totalPlaytime: dbStats.total_playtime || 0
    };

    switch (mode) {
      case 'single':
        return baseStats as SinglePlayerStats;
      case 'multi':
        return {
          ...baseStats,
          cooperations: dbStats.cooperations || 0,
          betrayals: dbStats.betrayals || 0,
          winRate: dbStats.win_rate || 0,
          betrayalRate: dbStats.betrayal_rate || 0,
          longestWinStreak: dbStats.longest_win_streak || 0,
          currentWinStreak: dbStats.current_win_streak || 0,
          rankPoints: dbStats.rank_points || 1000
        } as MultiPlayerStats;
      case 'party':
        return {
          ...baseStats,
          cooperations: dbStats.cooperations || 0,
          betrayals: dbStats.betrayals || 0,
          winRate: dbStats.win_rate || 0,
          betrayalRate: dbStats.betrayal_rate || 0,
          partiesHosted: dbStats.parties_hosted || 0,
          partiesJoined: dbStats.parties_joined || 0
        } as PartyStats;
      default:
        throw new Error(`Invalid game mode: ${mode}`);
    }
  }

  private calculateLeaderboardScore(stats: any, mode: GameMode): number {
    switch (mode) {
      case 'single':
        return stats.highest_score || 0;
      case 'multi':
        return stats.rank_points || 1000;
      case 'party':
        return (stats.win_rate || 0) * 10 + (stats.average_score || 0);
      default:
        return 0;
    }
  }
}

// Singleton instance
let gameModeStatsServiceInstance: GameModeStatsService | null = null;

export function getGameModeStatsService(): GameModeStatsService {
  if (!gameModeStatsServiceInstance) {
    gameModeStatsServiceInstance = new GameModeStatsService();
  }
  return gameModeStatsServiceInstance;
}

// Reset for testing
export function resetGameModeStatsService(): void {
  gameModeStatsServiceInstance = null;
}