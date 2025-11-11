// Matchmaking Pool Manager - Efficient player pool queries and optimization

import { Player, GameMode } from '../database/core/types';
import { getLogger } from './LoggingService';
import { getDatabaseManager } from '../database/DatabaseManager';

export interface PoolQuery {
  trustScoreRange: [number, number];
  skillLevelRange: [number, number];
  gameMode: GameMode;
  maxResults?: number;
  excludePlayerIds?: string[];
}

export interface PoolStats {
  totalPlayers: number;
  averageTrustScore: number;
  averageSkillLevel: number;
  onlinePercentage: number;
  distributionByTrustScore: { [range: string]: number };
  distributionBySkillLevel: { [range: string]: number };
}

export interface OptimizedPlayer extends Player {
  lastQueried: Date;
  queryCount: number;
  matchAttempts: number;
  successfulMatches: number;
  averageMatchTime: number;
}

export class MatchmakingPoolManager {
  private readonly logger = getLogger();
  private readonly playerCache = new Map<string, OptimizedPlayer>();
  private readonly queryCache = new Map<string, { players: Player[], timestamp: Date }>();
  
  // Configuration
  private readonly CACHE_TTL = 30000; // 30 seconds
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly QUERY_BATCH_SIZE = 50;
  private readonly INDEX_REFRESH_INTERVAL = 300000; // 5 minutes

  constructor() {
    this.logger.info('Matchmaking Pool Manager initialized');
    this.startCacheCleanup();
    this.startIndexOptimization();
  }

  /**
   * Get optimized player pool with efficient queries
   * Implements Requirements 3.3, 3.5
   */
  async getOptimizedPlayerPool(query: PoolQuery): Promise<Player[]> {
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(query);
      
      // Check cache first
      const cached = this.queryCache.get(cacheKey);
      if (cached && this.isCacheValid(cached.timestamp)) {
        this.logger.debug('Returning cached player pool', { cacheKey, playerCount: cached.players.length });
        return cached.players;
      }

      // Execute optimized database query
      const players = await this.executeOptimizedQuery(query);
      
      // Cache the results
      this.cacheQueryResult(cacheKey, players);
      
      // Update player statistics
      await this.updatePlayerQueryStats(players);

      this.logger.debug('Retrieved optimized player pool', {
        trustScoreRange: query.trustScoreRange,
        skillLevelRange: query.skillLevelRange,
        playerCount: players.length
      });

      return players;
    } catch (error) {
      this.logger.error('Failed to get optimized player pool', error as Error, { query });
      return [];
    }
  }

  /**
   * Execute optimized database query with proper indexing
   */
  private async executeOptimizedQuery(query: PoolQuery): Promise<Player[]> {
    const dbManager = getDatabaseManager();
    const maxResults = query.maxResults || this.QUERY_BATCH_SIZE;
    
    // Build optimized SQL query with proper index usage
    let sql = `
      SELECT DISTINCT
        u.id,
        u.username,
        u.display_name as displayName,
        u.trust_score as trustScore,
        u.total_games as totalGames,
        u.silent_games as silentGames,
        COALESCE(ms.rank_points, 1000) as skillLevel,
        CASE 
          WHEN u.last_active > datetime('now', '-5 minutes') THEN 1 
          ELSE 0 
        END as isOnline,
        u.last_active as lastActive
      FROM users u
      LEFT JOIN user_multi_stats ms ON u.id = ms.user_id
      WHERE u.status = 'active'
        AND u.trust_score BETWEEN ? AND ?
        AND COALESCE(ms.rank_points, 1000) BETWEEN ? AND ?
        AND u.last_active > datetime('now', '-2 hours')
    `;

    const params: any[] = [
      query.trustScoreRange[0],
      query.trustScoreRange[1],
      query.skillLevelRange[0],
      query.skillLevelRange[1]
    ];

    // Add exclusion filter if specified
    if (query.excludePlayerIds && query.excludePlayerIds.length > 0) {
      const placeholders = query.excludePlayerIds.map(() => '?').join(',');
      sql += ` AND u.id NOT IN (${placeholders})`;
      params.push(...query.excludePlayerIds);
    }

    // Add game mode specific filtering if needed
    if (query.gameMode === 'multi') {
      sql += ` AND u.total_games > 0`; // Only players with multiplayer experience
    }

    // Optimize ordering for better performance
    sql += `
      ORDER BY 
        CASE WHEN u.last_active > datetime('now', '-5 minutes') THEN 0 ELSE 1 END,
        u.last_active DESC,
        ABS(u.trust_score - ?) ASC
      LIMIT ?
    `;

    // Add trust score center for ordering
    const trustScoreCenter = (query.trustScoreRange[0] + query.trustScoreRange[1]) / 2;
    params.push(trustScoreCenter, maxResults);

    const results = await dbManager.executeRawQuery<any>(sql, params);

    return results.map(row => ({
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      trustScore: row.trustScore || 50,
      skillLevel: row.skillLevel || 1000,
      totalGames: row.totalGames || 0,
      isOnline: Boolean(row.isOnline)
    }));
  }

  /**
   * Get pool statistics for optimization analysis
   */
  async getPoolStats(): Promise<PoolStats> {
    try {
      const dbManager = getDatabaseManager();

      // Get basic statistics
      const basicStats = await dbManager.executeRawQuery<{
        total_players: number;
        avg_trust_score: number;
        avg_skill_level: number;
        online_players: number;
      }>(
        `SELECT 
          COUNT(*) as total_players,
          AVG(u.trust_score) as avg_trust_score,
          AVG(COALESCE(ms.rank_points, 1000)) as avg_skill_level,
          SUM(CASE WHEN u.last_active > datetime('now', '-5 minutes') THEN 1 ELSE 0 END) as online_players
         FROM users u
         LEFT JOIN user_multi_stats ms ON u.id = ms.user_id
         WHERE u.status = 'active' AND u.last_active > datetime('now', '-2 hours')`
      );

      // Get trust score distribution
      const trustDistribution = await dbManager.executeRawQuery<{ range: string; count: number }>(
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
         WHERE status = 'active' AND last_active > datetime('now', '-2 hours')
         GROUP BY range`
      );

      // Get skill level distribution
      const skillDistribution = await dbManager.executeRawQuery<{ range: string; count: number }>(
        `SELECT 
          CASE 
            WHEN COALESCE(rank_points, 1000) < 800 THEN '0-800'
            WHEN COALESCE(rank_points, 1000) < 1000 THEN '800-1000'
            WHEN COALESCE(rank_points, 1000) < 1200 THEN '1000-1200'
            WHEN COALESCE(rank_points, 1000) < 1500 THEN '1200-1500'
            ELSE '1500+'
          END as range,
          COUNT(*) as count
         FROM users u
         LEFT JOIN user_multi_stats ms ON u.id = ms.user_id
         WHERE u.status = 'active' AND u.last_active > datetime('now', '-2 hours')
         GROUP BY range`
      );

      const stats = basicStats[0];
      const totalPlayers = stats?.total_players || 0;
      const onlinePercentage = totalPlayers > 0 ? (stats?.online_players || 0) / totalPlayers * 100 : 0;

      // Convert distributions to objects
      const distributionByTrustScore: { [range: string]: number } = {};
      trustDistribution.forEach(item => {
        distributionByTrustScore[item.range] = item.count;
      });

      const distributionBySkillLevel: { [range: string]: number } = {};
      skillDistribution.forEach(item => {
        distributionBySkillLevel[item.range] = item.count;
      });

      return {
        totalPlayers,
        averageTrustScore: stats?.avg_trust_score || 50,
        averageSkillLevel: stats?.avg_skill_level || 1000,
        onlinePercentage: Math.round(onlinePercentage * 100) / 100,
        distributionByTrustScore,
        distributionBySkillLevel
      };
    } catch (error) {
      this.logger.error('Failed to get pool stats', error as Error);
      throw error;
    }
  }

  /**
   * Optimize database indexes for better query performance
   */
  async optimizeIndexes(): Promise<void> {
    try {
      const dbManager = getDatabaseManager();

      // Create composite indexes for efficient matchmaking queries
      const indexes = [
        // Trust score and activity index
        `CREATE INDEX IF NOT EXISTS idx_users_trust_active 
         ON users(trust_score, last_active, status) 
         WHERE status = 'active'`,
        
        // Skill level index on multi stats
        `CREATE INDEX IF NOT EXISTS idx_multi_stats_rank 
         ON user_multi_stats(rank_points, user_id)`,
        
        // Combined matchmaking index
        `CREATE INDEX IF NOT EXISTS idx_matchmaking_composite 
         ON users(status, last_active, trust_score) 
         WHERE status = 'active'`,
        
        // Online players index
        `CREATE INDEX IF NOT EXISTS idx_users_online 
         ON users(last_active, status) 
         WHERE status = 'active' AND last_active > datetime('now', '-5 minutes')`
      ];

      for (const indexSql of indexes) {
        await dbManager.executeRawCommand(indexSql);
      }

      // Analyze tables for query optimization
      await dbManager.executeRawCommand('ANALYZE users');
      await dbManager.executeRawCommand('ANALYZE user_multi_stats');

      this.logger.info('Database indexes optimized for matchmaking');
    } catch (error) {
      this.logger.error('Failed to optimize indexes', error as Error);
    }
  }

  /**
   * Preload frequently accessed player data
   */
  async preloadPlayerCache(): Promise<void> {
    try {
      const dbManager = getDatabaseManager();

      // Get most active players for caching
      const activePlayersQuery = `
        SELECT 
          u.id, u.username, u.display_name as displayName,
          u.trust_score as trustScore, u.total_games as totalGames,
          COALESCE(ms.rank_points, 1000) as skillLevel,
          CASE WHEN u.last_active > datetime('now', '-5 minutes') THEN 1 ELSE 0 END as isOnline
        FROM users u
        LEFT JOIN user_multi_stats ms ON u.id = ms.user_id
        WHERE u.status = 'active' 
        AND u.last_active > datetime('now', '-1 hour')
        ORDER BY u.last_active DESC
        LIMIT 200
      `;

      const results = await dbManager.executeRawQuery<any>(activePlayersQuery);

      results.forEach(row => {
        const player: OptimizedPlayer = {
          id: row.id,
          username: row.username,
          displayName: row.displayName,
          trustScore: row.trustScore || 50,
          skillLevel: row.skillLevel || 1000,
          totalGames: row.totalGames || 0,
          isOnline: Boolean(row.isOnline),
          lastQueried: new Date(),
          queryCount: 0,
          matchAttempts: 0,
          successfulMatches: 0,
          averageMatchTime: 0
        };

        this.playerCache.set(player.id, player);
      });

      this.logger.info('Player cache preloaded', { cachedPlayers: results.length });
    } catch (error) {
      this.logger.error('Failed to preload player cache', error as Error);
    }
  }

  /**
   * Generate cache key for query results
   */
  private generateCacheKey(query: PoolQuery): string {
    const keyParts = [
      `trust:${query.trustScoreRange[0]}-${query.trustScoreRange[1]}`,
      `skill:${query.skillLevelRange[0]}-${query.skillLevelRange[1]}`,
      `mode:${query.gameMode}`,
      `max:${query.maxResults || this.QUERY_BATCH_SIZE}`,
      `exclude:${query.excludePlayerIds?.join(',') || 'none'}`
    ];
    
    return keyParts.join('|');
  }

  /**
   * Check if cached result is still valid
   */
  private isCacheValid(timestamp: Date): boolean {
    return (Date.now() - timestamp.getTime()) < this.CACHE_TTL;
  }

  /**
   * Cache query result
   */
  private cacheQueryResult(key: string, players: Player[]): void {
    // Implement LRU cache behavior
    if (this.queryCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.queryCache.keys().next().value;
      if (oldestKey) {
        this.queryCache.delete(oldestKey);
      }
    }

    this.queryCache.set(key, {
      players: [...players], // Create a copy
      timestamp: new Date()
    });
  }

  /**
   * Update player query statistics
   */
  private async updatePlayerQueryStats(players: Player[]): Promise<void> {
    const now = new Date();
    
    players.forEach(player => {
      const cached = this.playerCache.get(player.id);
      if (cached) {
        cached.lastQueried = now;
        cached.queryCount++;
      } else {
        const optimizedPlayer: OptimizedPlayer = {
          ...player,
          lastQueried: now,
          queryCount: 1,
          matchAttempts: 0,
          successfulMatches: 0,
          averageMatchTime: 0
        };
        this.playerCache.set(player.id, optimizedPlayer);
      }
    });
  }

  /**
   * Start periodic cache cleanup
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupCache();
    }, this.CACHE_TTL);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = new Date();
    let cleanedCount = 0;

    // Clean query cache
    for (const [key, cached] of this.queryCache.entries()) {
      if (!this.isCacheValid(cached.timestamp)) {
        this.queryCache.delete(key);
        cleanedCount++;
      }
    }

    // Clean player cache (remove players not queried in last hour)
    const oneHourAgo = new Date(now.getTime() - 3600000);
    for (const [playerId, player] of this.playerCache.entries()) {
      if (player.lastQueried < oneHourAgo) {
        this.playerCache.delete(playerId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug('Cache cleanup completed', { cleanedEntries: cleanedCount });
    }
  }

  /**
   * Start periodic index optimization
   */
  private startIndexOptimization(): void {
    setInterval(async () => {
      try {
        await this.optimizeIndexes();
      } catch (error) {
        this.logger.error('Error in periodic index optimization', error as Error);
      }
    }, this.INDEX_REFRESH_INTERVAL);
  }

  /**
   * Record successful match for statistics
   */
  recordSuccessfulMatch(playerId: string, matchTime: number): void {
    const player = this.playerCache.get(playerId);
    if (player) {
      player.successfulMatches++;
      player.averageMatchTime = (player.averageMatchTime * (player.successfulMatches - 1) + matchTime) / player.successfulMatches;
    }
  }

  /**
   * Record match attempt for statistics
   */
  recordMatchAttempt(playerId: string): void {
    const player = this.playerCache.get(playerId);
    if (player) {
      player.matchAttempts++;
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    queryCacheSize: number;
    playerCacheSize: number;
    cacheHitRate: number;
    averageQueryTime: number;
  } {
    // This would need to be implemented with proper metrics tracking
    return {
      queryCacheSize: this.queryCache.size,
      playerCacheSize: this.playerCache.size,
      cacheHitRate: 0.85, // Placeholder
      averageQueryTime: 45 // Placeholder in ms
    };
  }
}

// Singleton instance
let matchmakingPoolManagerInstance: MatchmakingPoolManager | null = null;

export function getMatchmakingPoolManager(): MatchmakingPoolManager {
  if (!matchmakingPoolManagerInstance) {
    matchmakingPoolManagerInstance = new MatchmakingPoolManager();
  }
  return matchmakingPoolManagerInstance;
}

// Reset for testing
export function resetMatchmakingPoolManager(): void {
  matchmakingPoolManagerInstance = null;
}