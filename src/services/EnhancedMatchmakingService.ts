// Enhanced Matchmaking Service - Trust score based matching with optimization

import { 
  Player, 
  GameMode, 
  MatchPreferences, 
  MatchResult 
} from '../database/core/types';
import { getLogger } from './LoggingService';
import { getDatabaseManager } from '../database/DatabaseManager';
import { getEnhancedTrustScoreService } from './EnhancedTrustScoreService';
import { getMatchmakingPoolManager } from './MatchmakingPoolManager';
import { getMatchmakingTimeoutManager } from './MatchmakingTimeoutManager';
import { getMatchQualityScorer } from './MatchQualityScorer';

export interface IEnhancedMatchmakingService {
  findMatch(userId: string, preferences: MatchPreferences): Promise<MatchResult | null>;
  calculateMatchScore(player1: Player, player2: Player): number;
  getMatchmakingPool(trustScoreRange: number[], skillRange: number[]): Promise<Player[]>;
  addToMatchmakingPool(player: Player): Promise<void>;
  removeFromMatchmakingPool(playerId: string): Promise<void>;
  getQueueStats(): Promise<MatchmakingStats>;
}

export interface MatchmakingStats {
  totalPlayersInQueue: number;
  averageWaitTime: number;
  matchesFoundLastHour: number;
  averageMatchQuality: number;
  trustScoreDistribution: { [range: string]: number };
  poolStats?: {
    totalAvailablePlayers: number;
    onlinePercentage: number;
    averageTrustScore: number;
    averageSkillLevel: number;
  };
  timeoutStats?: {
    activeSessions: number;
    totalRetries: number;
    averageSessionTime: number;
    timeoutRate: number;
  };
}

interface MatchmakingPoolEntry {
  player: Player;
  joinedAt: Date;
  preferences: MatchPreferences;
  searchAttempts: number;
  lastSearchAt?: Date;
}

export class EnhancedMatchmakingService implements IEnhancedMatchmakingService {
  private readonly logger = getLogger();
  private readonly trustScoreService = getEnhancedTrustScoreService();
  private readonly poolManager = getMatchmakingPoolManager();
  private readonly timeoutManager = getMatchmakingTimeoutManager();
  private readonly qualityScorer = getMatchQualityScorer();
  private readonly matchmakingPool = new Map<string, MatchmakingPoolEntry>();
  private readonly recentMatches = new Map<string, Date>();
  
  // Configuration constants
  private readonly BASE_TRUST_TOLERANCE = 15;
  private readonly MAX_TRUST_TOLERANCE = 40;
  private readonly SKILL_TOLERANCE_BASE = 200;
  private readonly MAX_WAIT_TIME_DEFAULT = 300000; // 5 minutes
  private readonly SEARCH_EXPANSION_RATE = 1.5;
  private readonly MIN_MATCH_QUALITY = 60;
  private readonly RETRY_DELAY = 10000; // 10 seconds between retries

  constructor() {
    this.logger.info('Enhanced Matchmaking Service initialized');
    this.startPeriodicMatching();
  }

  /**
   * Find a match for a player based on trust score and skill level
   * Implements Requirements 3.1, 3.2, 3.4
   */
  async findMatch(userId: string, preferences: MatchPreferences): Promise<MatchResult | null> {
    try {
      this.logger.debug('Finding match for player', { userId, preferences });

      // Start timeout management session
      this.timeoutManager.startSession(
        userId, 
        preferences.maxWaitTime, 
        preferences
      );

      // Get player data
      const player = await this.getPlayerData(userId);
      if (!player) {
        throw new Error(`Player not found: ${userId}`);
      }

      // Add to matchmaking pool if not already present
      await this.addToMatchmakingPool(player);

      // Get current pool entry
      const poolEntry = this.matchmakingPool.get(userId);
      if (!poolEntry) {
        throw new Error('Failed to add player to matchmaking pool');
      }

      // Check if session has expired or exceeded retries
      if (this.timeoutManager.isSessionExpired(userId) || 
          this.timeoutManager.hasExceededMaxRetries(userId)) {
        this.timeoutManager.stopSession(userId);
        await this.removeFromMatchmakingPool(userId);
        return null;
      }

      // Record match attempt
      this.timeoutManager.recordAttempt(userId, 'SEARCH_ATTEMPT');

      // Calculate dynamic search ranges based on wait time and attempts
      const trustTolerance = this.calculateDynamicTrustTolerance(poolEntry);
      const skillTolerance = this.calculateDynamicSkillTolerance(poolEntry);

      // Get trust score range
      const trustScoreRange = await this.trustScoreService.getTrustScoreRange(
        player.trustScore, 
        trustTolerance
      );

      // Get skill range (using rank points as skill indicator)
      const skillRange = [
        Math.max(0, player.skillLevel - skillTolerance),
        player.skillLevel + skillTolerance
      ];

      // Use optimized pool manager for efficient queries
      const availableOpponents = await this.poolManager.getOptimizedPlayerPool({
        trustScoreRange: [trustScoreRange[0], trustScoreRange[1]],
        skillLevelRange: [skillRange[0], skillRange[1]],
        gameMode: preferences.gameMode,
        maxResults: 20,
        excludePlayerIds: [userId]
      });

      if (availableOpponents.length === 0) {
        // No suitable opponents found, update search attempts
        poolEntry.searchAttempts++;
        poolEntry.lastSearchAt = new Date();
        
        this.logger.debug('No suitable opponents found', {
          userId,
          trustScoreRange,
          skillRange,
          searchAttempts: poolEntry.searchAttempts
        });

        return null;
      }

      // Find best match using enhanced quality scoring
      const bestMatch = await this.findBestMatchWithQualityScoring(player, availableOpponents);
      
      if (!bestMatch) {
        poolEntry.searchAttempts++;
        poolEntry.lastSearchAt = new Date();
        return null;
      }

      // Check if match quality meets minimum threshold
      if (bestMatch.qualityScore < this.MIN_MATCH_QUALITY) {
        poolEntry.searchAttempts++;
        poolEntry.lastSearchAt = new Date();
        
        this.logger.debug('Match quality too low', {
          userId,
          opponentId: bestMatch.opponent.id,
          qualityScore: bestMatch.qualityScore,
          minQuality: this.MIN_MATCH_QUALITY
        });

        return null;
      }

      // Calculate estimated wait time
      const estimatedWaitTime = this.calculateEstimatedWaitTime(poolEntry);

      // Stop timeout session (successful match)
      this.timeoutManager.stopSession(userId);

      // Remove both players from pool
      await this.removeFromMatchmakingPool(userId);
      await this.removeFromMatchmakingPool(bestMatch.opponent.id);

      // Record successful match for statistics
      this.recordMatch(userId, bestMatch.opponent.id);
      this.poolManager.recordSuccessfulMatch(userId, Date.now() - poolEntry.joinedAt.getTime());

      const matchResult: MatchResult = {
        opponent: bestMatch.opponent,
        matchScore: bestMatch.qualityScore,
        estimatedWaitTime
      };

      this.logger.info('Match found successfully', {
        userId,
        opponentId: bestMatch.opponent.id,
        qualityScore: bestMatch.qualityScore,
        qualityRating: bestMatch.qualityRating,
        trustScoreDiff: Math.abs(player.trustScore - bestMatch.opponent.trustScore),
        skillLevelDiff: Math.abs(player.skillLevel - bestMatch.opponent.skillLevel)
      });

      return matchResult;
    } catch (error) {
      this.logger.error('Failed to find match', error as Error, { userId });
      
      // Stop timeout session on error
      this.timeoutManager.stopSession(userId);
      
      throw error;
    }
  }

  /**
   * Calculate match quality score between two players
   * Implements Requirements 3.3, 3.5
   */
  calculateMatchScore(player1: Player, player2: Player): number {
    // Use the enhanced quality scorer for more accurate scoring
    const qualityMetrics = this.qualityScorer.calculateMatchQuality(player1, player2);
    return qualityMetrics.overallScore;
  }

  /**
   * Find best match using enhanced quality scoring
   */
  private async findBestMatchWithQualityScoring(
    player: Player, 
    opponents: Player[]
  ): Promise<{ opponent: Player; qualityScore: number; qualityRating: string } | null> {
    if (opponents.length === 0) {
      return null;
    }

    // Calculate quality scores for all opponents
    const scoredOpponents = opponents.map(opponent => {
      const qualityMetrics = this.qualityScorer.calculateMatchQuality(player, opponent);
      return {
        opponent,
        qualityScore: qualityMetrics.overallScore,
        qualityRating: qualityMetrics.qualityRating,
        metrics: qualityMetrics
      };
    });

    // Sort by quality score (highest first)
    scoredOpponents.sort((a, b) => b.qualityScore - a.qualityScore);

    // Return the best match
    const bestMatch = scoredOpponents[0];
    
    this.logger.debug('Best match found with quality scoring', {
      playerId: player.id,
      opponentId: bestMatch.opponent.id,
      qualityScore: bestMatch.qualityScore,
      qualityRating: bestMatch.qualityRating,
      trustScoreDiff: Math.abs(player.trustScore - bestMatch.opponent.trustScore),
      skillLevelDiff: Math.abs(player.skillLevel - bestMatch.opponent.skillLevel)
    });

    return bestMatch;
  }

  /**
   * Get available players in matchmaking pool within specified ranges
   * Implements Requirements 3.3, 3.5
   */
  async getMatchmakingPool(trustScoreRange: number[], skillRange: number[]): Promise<Player[]> {
    try {
      // Use the optimized pool manager for better performance
      return await this.poolManager.getOptimizedPlayerPool({
        trustScoreRange: [trustScoreRange[0], trustScoreRange[1]],
        skillLevelRange: [skillRange[0], skillRange[1]],
        gameMode: 'multi',
        maxResults: 50
      });
    } catch (error) {
      this.logger.error('Failed to get matchmaking pool', error as Error);
      return [];
    }
  }

  /**
   * Add player to matchmaking pool
   */
  async addToMatchmakingPool(player: Player): Promise<void> {
    const entry: MatchmakingPoolEntry = {
      player,
      joinedAt: new Date(),
      preferences: {
        gameMode: 'multi',
        maxWaitTime: this.MAX_WAIT_TIME_DEFAULT,
        trustScoreTolerance: this.BASE_TRUST_TOLERANCE,
        skillLevelTolerance: this.SKILL_TOLERANCE_BASE
      },
      searchAttempts: 0
    };

    this.matchmakingPool.set(player.id, entry);
    
    this.logger.debug('Player added to matchmaking pool', {
      playerId: player.id,
      trustScore: player.trustScore,
      skillLevel: player.skillLevel
    });
  }

  /**
   * Remove player from matchmaking pool
   */
  async removeFromMatchmakingPool(playerId: string): Promise<void> {
    const removed = this.matchmakingPool.delete(playerId);
    
    if (removed) {
      this.logger.debug('Player removed from matchmaking pool', { playerId });
    }
  }

  /**
   * Get matchmaking statistics
   */
  async getQueueStats(): Promise<MatchmakingStats> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);

      // Calculate average wait time
      const waitTimes = Array.from(this.matchmakingPool.values()).map(entry => 
        now.getTime() - entry.joinedAt.getTime()
      );
      const averageWaitTime = waitTimes.length > 0 
        ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length / 1000
        : 0;

      // Count recent matches
      const matchesFoundLastHour = Array.from(this.recentMatches.values())
        .filter(matchTime => matchTime > oneHourAgo).length;

      // Get pool statistics for average match quality
      const poolStats = await this.poolManager.getPoolStats();
      const averageMatchQuality = 75; // Would be calculated from actual match history

      // Get trust score distribution from pool manager
      const trustScoreDistribution = poolStats.distributionByTrustScore;

      // Get timeout manager stats
      const timeoutStats = this.timeoutManager.getManagerStats();

      return {
        totalPlayersInQueue: this.matchmakingPool.size,
        averageWaitTime: Math.round(averageWaitTime),
        matchesFoundLastHour,
        averageMatchQuality,
        trustScoreDistribution,
        // Additional optimization metrics
        poolStats: {
          totalAvailablePlayers: poolStats.totalPlayers,
          onlinePercentage: poolStats.onlinePercentage,
          averageTrustScore: poolStats.averageTrustScore,
          averageSkillLevel: poolStats.averageSkillLevel
        },
        timeoutStats: {
          activeSessions: timeoutStats.activeSessions,
          totalRetries: timeoutStats.totalRetries,
          averageSessionTime: timeoutStats.averageSessionTime,
          timeoutRate: timeoutStats.timeoutRate
        }
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats', error as Error);
      throw error;
    }
  }

  /**
   * Find the best opponent using trust score similarity
   * Implements Requirements 3.1, 3.2, 3.4
   */
  private findBestOpponent(player: Player, opponents: Player[]): Player | null {
    if (opponents.length === 0) {
      return null;
    }

    // Use trust score service to find suitable opponents
    const suitableOpponents = this.trustScoreService.findSuitableOpponents(
      player.trustScore, 
      opponents
    );

    if (suitableOpponents.length === 0) {
      // Fallback to skill-based matching if no trust score matches
      return this.findSkillBasedMatch(player, opponents);
    }

    // Return the best trust score match
    return suitableOpponents[0];
  }

  /**
   * Fallback matching based on skill level when trust scores are unavailable
   * Implements Requirement 3.4
   */
  private findSkillBasedMatch(player: Player, opponents: Player[]): Player | null {
    if (opponents.length === 0) {
      return null;
    }

    // Sort by skill level similarity
    const sortedOpponents = opponents.sort((a, b) => {
      const aDiff = Math.abs(a.skillLevel - player.skillLevel);
      const bDiff = Math.abs(b.skillLevel - player.skillLevel);
      return aDiff - bDiff;
    });

    return sortedOpponents[0];
  }

  /**
   * Calculate dynamic trust tolerance based on wait time and search attempts
   */
  private calculateDynamicTrustTolerance(poolEntry: MatchmakingPoolEntry): number {
    const waitTime = new Date().getTime() - poolEntry.joinedAt.getTime();
    const waitMinutes = waitTime / 60000;
    
    // Expand tolerance based on wait time and search attempts
    let tolerance = this.BASE_TRUST_TOLERANCE;
    tolerance += Math.min(waitMinutes * 2, 20); // Max 20 points from wait time
    tolerance += poolEntry.searchAttempts * 3; // 3 points per failed attempt
    
    return Math.min(tolerance, this.MAX_TRUST_TOLERANCE);
  }

  /**
   * Calculate dynamic skill tolerance based on wait time and search attempts
   */
  private calculateDynamicSkillTolerance(poolEntry: MatchmakingPoolEntry): number {
    const waitTime = new Date().getTime() - poolEntry.joinedAt.getTime();
    const waitMinutes = waitTime / 60000;
    
    // Expand tolerance based on wait time and search attempts
    let tolerance = this.SKILL_TOLERANCE_BASE;
    tolerance += Math.min(waitMinutes * 50, 300); // Max 300 points from wait time
    tolerance += poolEntry.searchAttempts * 100; // 100 points per failed attempt
    
    return tolerance;
  }

  /**
   * Calculate estimated wait time based on queue position and historical data
   */
  private calculateEstimatedWaitTime(poolEntry: MatchmakingPoolEntry): number {
    const currentWaitTime = new Date().getTime() - poolEntry.joinedAt.getTime();
    const queueSize = this.matchmakingPool.size;
    
    // Simple estimation based on queue size and current wait time
    const baseEstimate = Math.max(30000, queueSize * 15000); // 15 seconds per player in queue
    const adjustedEstimate = Math.max(baseEstimate - currentWaitTime, 10000); // At least 10 seconds
    
    return Math.round(adjustedEstimate / 1000); // Return in seconds
  }

  /**
   * Get player data from database
   */
  private async getPlayerData(userId: string): Promise<Player | null> {
    try {
      const dbManager = getDatabaseManager();
      const userRepo = dbManager.getUserRepository();
      
      const user = await userRepo.findById(userId);
      if (!user) {
        return null;
      }

      // Get skill level from multiplayer stats
      const multiStats = await dbManager.executeRawQuery<{ rank_points: number }>(
        'SELECT rank_points FROM user_multi_stats WHERE user_id = ?',
        [userId]
      );

      const skillLevel = multiStats[0]?.rank_points || 1000;

      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        trustScore: user.trustScore,
        skillLevel,
        totalGames: user.totalGames,
        isOnline: this.isPlayerOnline(user.lastActive)
      };
    } catch (error) {
      this.logger.error('Failed to get player data', error as Error, { userId });
      return null;
    }
  }

  /**
   * Check if player is currently online
   */
  private isPlayerOnline(lastActive: Date): boolean {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastActive > fiveMinutesAgo;
  }

  /**
   * Record a successful match for statistics
   */
  private recordMatch(player1Id: string, player2Id: string): void {
    const matchKey = `${player1Id}-${player2Id}`;
    this.recentMatches.set(matchKey, new Date());
    
    // Clean up old matches (keep only last hour)
    const oneHourAgo = new Date(Date.now() - 3600000);
    for (const [key, matchTime] of this.recentMatches.entries()) {
      if (matchTime < oneHourAgo) {
        this.recentMatches.delete(key);
      }
    }
  }

  /**
   * Get trust score distribution for statistics
   */
  private async getTrustScoreDistribution(): Promise<{ [range: string]: number }> {
    try {
      const dbManager = getDatabaseManager();
      
      const results = await dbManager.executeRawQuery<{ range: string, count: number }>(
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
         WHERE total_games > 0 AND status = 'active'
         GROUP BY range`
      );

      const distribution: { [range: string]: number } = {};
      results.forEach(row => {
        distribution[row.range] = row.count;
      });

      return distribution;
    } catch (error) {
      this.logger.error('Failed to get trust score distribution', error as Error);
      return {};
    }
  }

  /**
   * Start periodic matching process
   */
  private startPeriodicMatching(): void {
    setInterval(async () => {
      try {
        await this.processMatchmakingQueue();
      } catch (error) {
        this.logger.error('Error in periodic matching', error as Error);
      }
    }, this.RETRY_DELAY);
  }

  /**
   * Process the matchmaking queue periodically
   */
  private async processMatchmakingQueue(): Promise<void> {
    const now = new Date();
    
    for (const [playerId, entry] of this.matchmakingPool.entries()) {
      // Skip if recently searched
      if (entry.lastSearchAt && (now.getTime() - entry.lastSearchAt.getTime()) < this.RETRY_DELAY) {
        continue;
      }

      // Try to find a match
      try {
        await this.findMatch(playerId, entry.preferences);
      } catch (error) {
        this.logger.debug('Failed to find match in periodic processing', { playerId, error });
      }
    }
  }
}

// Singleton instance
let enhancedMatchmakingServiceInstance: EnhancedMatchmakingService | null = null;

export function getEnhancedMatchmakingService(): EnhancedMatchmakingService {
  if (!enhancedMatchmakingServiceInstance) {
    enhancedMatchmakingServiceInstance = new EnhancedMatchmakingService();
  }
  return enhancedMatchmakingServiceInstance;
}

// Reset for testing
export function resetEnhancedMatchmakingService(): void {
  enhancedMatchmakingServiceInstance = null;
}