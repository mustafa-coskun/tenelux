// Enhanced Trust Score Service - Based on silence ratio algorithm

import { 
  BehaviorStats, 
  TrustScoreData, 
  GameMode, 
  EnhancedGameResult,
  Player 
} from '../database/core/types';
import { getLogger } from './LoggingService';
import { getDatabaseManager } from '../database/DatabaseManager';

export interface ITrustScoreService {
  calculateTrustScore(userId: string): Promise<number>;
  updateSilenceRatio(userId: string, wasSilent: boolean, gameMode: GameMode): Promise<void>;
  getTrustScoreRange(targetScore: number, tolerance: number): Promise<number[]>;
  getPlayerBehaviorStats(userId: string): Promise<BehaviorStats>;
  updateAfterGame(userId: string, gameResult: EnhancedGameResult): Promise<void>;
  findSuitableOpponents(playerTrustScore: number, availablePlayers: Player[]): Player[];
}

export class EnhancedTrustScoreService implements ITrustScoreService {
  private readonly baseScore = 50.0;
  private readonly maxScore = 100.0;
  private readonly minScore = 0.0;
  private readonly logger = getLogger();

  constructor() {
    this.logger.info('Enhanced Trust Score Service initialized');
  }

  /**
   * Calculate trust score based on silence ratio across all games
   * Algorithm: Trust score = (1 - silence_ratio) * 100, adjusted by global average
   */
  async calculateTrustScore(userId: string): Promise<number> {
    try {
      const dbManager = getDatabaseManager();
      const userRepo = dbManager.getUserRepository();
      
      // Get user's current data
      const user = await userRepo.findById(userId);
      if (!user) {
        return this.baseScore;
      }

      const totalGames = user.totalGames || 0;
      const silentGames = user.silentGames || 0;

      // If no games played, return base score
      if (totalGames === 0) {
        return this.baseScore;
      }

      // Calculate silence ratio
      const silenceRatio = silentGames / totalGames;

      // Get global average silence ratio for normalization
      const globalAverage = await this.getGlobalAverageSilenceRatio();

      // Calculate trust score based on silence ratio relative to global average
      // Lower silence ratio = higher trust score
      let trustScore: number;
      
      if (silenceRatio <= globalAverage) {
        // Better than average - score above 50
        const improvement = (globalAverage - silenceRatio) / globalAverage;
        trustScore = this.baseScore + (improvement * this.baseScore);
      } else {
        // Worse than average - score below 50
        const degradation = (silenceRatio - globalAverage) / (1 - globalAverage);
        trustScore = this.baseScore - (degradation * this.baseScore);
      }

      // Apply experience modifier (more stable with more games)
      const experienceModifier = Math.min(totalGames / 50, 1); // Max stability at 50 games
      const finalScore = (trustScore * experienceModifier) + (this.baseScore * (1 - experienceModifier));

      // Ensure score is within bounds
      const boundedScore = Math.max(this.minScore, Math.min(this.maxScore, finalScore));

      // Update user's trust score in database
      await userRepo.update(userId, { 
        trustScore: boundedScore,
        silenceRatio: silenceRatio
      });

      this.logger.debug('Trust score calculated', {
        userId,
        totalGames,
        silentGames,
        silenceRatio,
        globalAverage,
        trustScore: boundedScore
      });

      return boundedScore;
    } catch (error) {
      this.logger.error('Failed to calculate trust score', error as Error, { userId });
      return this.baseScore;
    }
  }

  /**
   * Update silence ratio after a game
   */
  async updateSilenceRatio(userId: string, wasSilent: boolean, gameMode: GameMode): Promise<void> {
    try {
      // Only update for multiplayer and party modes
      if (gameMode === 'single') {
        return;
      }

      const dbManager = getDatabaseManager();
      const userRepo = dbManager.getUserRepository();
      
      const user = await userRepo.findById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const currentTotalGames = user.totalGames || 0;
      const currentSilentGames = user.silentGames || 0;

      const newTotalGames = currentTotalGames + 1;
      const newSilentGames = wasSilent ? currentSilentGames + 1 : currentSilentGames;
      const newSilenceRatio = newSilentGames / newTotalGames;

      // Update user data
      await userRepo.update(userId, {
        totalGames: newTotalGames,
        silentGames: newSilentGames,
        silenceRatio: newSilenceRatio
      });

      // Recalculate trust score
      await this.calculateTrustScore(userId);

      this.logger.debug('Silence ratio updated', {
        userId,
        wasSilent,
        gameMode,
        newTotalGames,
        newSilentGames,
        newSilenceRatio
      });
    } catch (error) {
      this.logger.error('Failed to update silence ratio', error as Error, { userId, wasSilent, gameMode });
      throw error;
    }
  }

  /**
   * Get trust score range for matchmaking
   */
  async getTrustScoreRange(targetScore: number, tolerance: number): Promise<number[]> {
    const minScore = Math.max(this.minScore, targetScore - tolerance);
    const maxScore = Math.min(this.maxScore, targetScore + tolerance);
    
    return [minScore, maxScore];
  }

  /**
   * Get detailed behavior statistics for a player
   */
  async getPlayerBehaviorStats(userId: string): Promise<BehaviorStats> {
    try {
      const dbManager = getDatabaseManager();
      const userRepo = dbManager.getUserRepository();
      
      const user = await userRepo.findById(userId);
      if (!user) {
        return {
          totalGames: 0,
          silentGames: 0,
          silenceRatio: 0,
          trustScore: this.baseScore,
          behaviorTrend: 'stable'
        };
      }

      const totalGames = user.totalGames || 0;
      const silentGames = user.silentGames || 0;
      const silenceRatio = totalGames > 0 ? silentGames / totalGames : 0;
      const trustScore = user.trustScore || this.baseScore;

      // Calculate behavior trend based on recent games
      const behaviorTrend = await this.calculateBehaviorTrend(userId);

      return {
        totalGames,
        silentGames,
        silenceRatio,
        trustScore,
        behaviorTrend
      };
    } catch (error) {
      this.logger.error('Failed to get behavior stats', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Update trust score after a game completion
   */
  async updateAfterGame(userId: string, gameResult: EnhancedGameResult): Promise<void> {
    try {
      // Only process multiplayer and party games
      if (!gameResult.affectsStats || gameResult.gameMode === 'single') {
        return;
      }

      // Determine if player was silent based on game result
      const wasSilent = gameResult.silenceData?.player1Silent || gameResult.silenceData?.player2Silent || false;

      // Update silence ratio and recalculate trust score
      await this.updateSilenceRatio(userId, wasSilent, gameResult.gameMode);

      this.logger.info('Trust score updated after game', {
        userId,
        gameMode: gameResult.gameMode,
        wasSilent,
        affectsStats: gameResult.affectsStats
      });
    } catch (error) {
      this.logger.error('Failed to update trust score after game', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Find suitable opponents based on trust score matching
   */
  findSuitableOpponents(playerTrustScore: number, availablePlayers: Player[]): Player[] {
    // Calculate dynamic tolerance based on trust score
    const baseTolerance = 15;
    const dynamicTolerance = baseTolerance + Math.abs(playerTrustScore - 50) * 0.2;
    
    const minScore = Math.max(this.minScore, playerTrustScore - dynamicTolerance);
    const maxScore = Math.min(this.maxScore, playerTrustScore + dynamicTolerance);

    const suitableOpponents = availablePlayers.filter(player => {
      const opponentTrustScore = player.trustScore || this.baseScore;
      return opponentTrustScore >= minScore && opponentTrustScore <= maxScore;
    });

    // Sort by trust score similarity (closest first)
    return suitableOpponents.sort((a, b) => {
      const aDiff = Math.abs((a.trustScore || this.baseScore) - playerTrustScore);
      const bDiff = Math.abs((b.trustScore || this.baseScore) - playerTrustScore);
      return aDiff - bDiff;
    });
  }

  /**
   * Get global average silence ratio for normalization
   */
  private async getGlobalAverageSilenceRatio(): Promise<number> {
    try {
      const dbManager = getDatabaseManager();
      
      // Query to get average silence ratio across all users with games
      const result = await dbManager.executeRawQuery<{ avg_silence_ratio: number }>(
        `SELECT AVG(CAST(silent_games AS REAL) / CAST(total_games AS REAL)) as avg_silence_ratio 
         FROM users 
         WHERE total_games > 0`
      );

      const globalAverage = result[0]?.avg_silence_ratio || 0.3; // Default to 30% if no data
      
      this.logger.debug('Global average silence ratio calculated', { globalAverage });
      
      return globalAverage;
    } catch (error) {
      this.logger.error('Failed to calculate global average silence ratio', error as Error);
      return 0.3; // Default fallback
    }
  }

  /**
   * Calculate behavior trend based on recent games
   */
  private async calculateBehaviorTrend(userId: string): Promise<'improving' | 'stable' | 'declining'> {
    try {
      const dbManager = getDatabaseManager();
      
      // Get recent games to analyze trend
      const recentGames = await dbManager.executeRawQuery<{ 
        player1_silent: boolean, 
        player2_silent: boolean,
        created_at: string 
      }>(
        `SELECT player1_silent, player2_silent, created_at 
         FROM games 
         WHERE (JSON_EXTRACT(players, '$[0].id') = ? OR JSON_EXTRACT(players, '$[1].id') = ?)
         AND game_mode IN ('multi', 'party')
         AND affects_stats = 1
         ORDER BY created_at DESC 
         LIMIT 10`,
        [userId, userId]
      );

      if (recentGames.length < 5) {
        return 'stable'; // Not enough data for trend analysis
      }

      // Calculate silence ratio for first half vs second half of recent games
      const midPoint = Math.floor(recentGames.length / 2);
      const recentHalf = recentGames.slice(0, midPoint);
      const olderHalf = recentGames.slice(midPoint);

      const recentSilenceRatio = this.calculateSilenceRatioFromGames(recentHalf, userId);
      const olderSilenceRatio = this.calculateSilenceRatioFromGames(olderHalf, userId);

      const difference = recentSilenceRatio - olderSilenceRatio;
      const threshold = 0.1; // 10% threshold for trend detection

      if (difference < -threshold) {
        return 'improving'; // Less silence = improving behavior
      } else if (difference > threshold) {
        return 'declining'; // More silence = declining behavior
      } else {
        return 'stable';
      }
    } catch (error) {
      this.logger.error('Failed to calculate behavior trend', error as Error, { userId });
      return 'stable';
    }
  }

  /**
   * Calculate silence ratio from a set of games
   */
  private calculateSilenceRatioFromGames(games: any[], userId: string): number {
    if (games.length === 0) return 0;

    let silentCount = 0;
    
    games.forEach(game => {
      // Determine which player position the user was in and check their silence
      const wasSilent = game.player1_silent || game.player2_silent; // Simplified for now
      if (wasSilent) silentCount++;
    });

    return silentCount / games.length;
  }

  /**
   * Get trust score statistics for admin/debugging
   */
  async getTrustScoreStatistics(): Promise<{
    globalAverage: number;
    distribution: { [range: string]: number };
    totalPlayers: number;
  }> {
    try {
      const dbManager = getDatabaseManager();
      
      const globalAverage = await this.getGlobalAverageSilenceRatio();
      
      // Get trust score distribution
      const distribution = await dbManager.executeRawQuery<{ range: string, count: number }>(
        `SELECT 
          CASE 
            WHEN trust_score < 20 THEN '0-20'
            WHEN trust_score < 40 THEN '20-40'
            WHEN trust_score < 60 THEN '40-60'
            WHEN trust_score < 80 THEN '60-80'
            ELSE '80-100'
          END as range,
          COUNT(*) as count
         FROM users 
         WHERE total_games > 0
         GROUP BY range`
      );

      const totalPlayers = await dbManager.executeRawQuery<{ count: number }>(
        'SELECT COUNT(*) as count FROM users WHERE total_games > 0'
      );

      const distributionMap: { [range: string]: number } = {};
      distribution.forEach(item => {
        distributionMap[item.range] = item.count;
      });

      return {
        globalAverage,
        distribution: distributionMap,
        totalPlayers: totalPlayers[0]?.count || 0
      };
    } catch (error) {
      this.logger.error('Failed to get trust score statistics', error as Error);
      throw error;
    }
  }
}

// Singleton instance
let enhancedTrustScoreServiceInstance: EnhancedTrustScoreService | null = null;

export function getEnhancedTrustScoreService(): EnhancedTrustScoreService {
  if (!enhancedTrustScoreServiceInstance) {
    enhancedTrustScoreServiceInstance = new EnhancedTrustScoreService();
  }
  return enhancedTrustScoreServiceInstance;
}

// Reset for testing
export function resetEnhancedTrustScoreService(): void {
  enhancedTrustScoreServiceInstance = null;
}