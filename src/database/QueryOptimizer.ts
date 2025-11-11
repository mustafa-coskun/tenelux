import DatabaseConnection from './DatabaseConnection';

/**
 * QueryOptimizer provides optimized database queries and caching mechanisms
 * to improve performance for frequently accessed data
 */
export class QueryOptimizer {
  private static instance: QueryOptimizer;
  private db: DatabaseConnection;
  private queryCache: Map<string, { data: any; timestamp: number; ttl: number }>;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.db = DatabaseConnection.getInstance();
    this.queryCache = new Map();
    
    // Clean up expired cache entries every minute
    setInterval(() => this.cleanupCache(), 60000);
  }

  public static getInstance(): QueryOptimizer {
    if (!QueryOptimizer.instance) {
      QueryOptimizer.instance = new QueryOptimizer();
    }
    return QueryOptimizer.instance;
  }

  /**
   * Execute query with caching support
   */
  public async cachedQuery<T>(
    cacheKey: string,
    query: string,
    params: any[] = [],
    ttl: number = this.DEFAULT_TTL
  ): Promise<T[]> {
    // Check cache first
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // Execute query
    const result = await this.db.all<T>(query, params);
    
    // Cache result
    this.queryCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
      ttl
    });

    return result;
  }

  /**
   * Optimized query for player statistics with proper indexing
   */
  public async getPlayerStatisticsOptimized(playerId: string): Promise<any> {
    const cacheKey = `player_stats_${playerId}`;
    
    const query = `
      SELECT 
        p.id,
        p.name,
        p.trust_score,
        p.total_games_played,
        COALESCE(AVG(ps.cooperation_percentage), 0) as avg_cooperation,
        COALESCE(AVG(ps.betrayal_percentage), 0) as avg_betrayal,
        COUNT(DISTINCT gs.id) as completed_games
      FROM players p
      LEFT JOIN session_players sp ON p.id = sp.player_id
      LEFT JOIN game_sessions gs ON sp.session_id = gs.id AND gs.end_time IS NOT NULL
      LEFT JOIN player_statistics ps ON p.id = ps.player_id
      WHERE p.id = ?
      GROUP BY p.id, p.name, p.trust_score, p.total_games_played
    `;

    return this.cachedQuery(cacheKey, query, [playerId], 2 * 60 * 1000); // 2 minute TTL
  }

  /**
   * Optimized leaderboard query with pagination
   */
  public async getLeaderboardOptimized(
    limit: number = 10,
    offset: number = 0,
    sortBy: 'trust_score' | 'cooperation' | 'games_played' = 'trust_score'
  ): Promise<any[]> {
    const cacheKey = `leaderboard_${sortBy}_${limit}_${offset}`;
    
    let orderClause = 'p.trust_score DESC';
    if (sortBy === 'cooperation') {
      orderClause = 'avg_cooperation DESC';
    } else if (sortBy === 'games_played') {
      orderClause = 'p.total_games_played DESC';
    }

    const query = `
      SELECT 
        p.id,
        p.name,
        p.trust_score,
        p.total_games_played,
        COALESCE(AVG(ps.cooperation_percentage), 0) as avg_cooperation,
        COALESCE(COUNT(DISTINCT gs.id), 0) as completed_games,
        ROW_NUMBER() OVER (ORDER BY ${orderClause}) as rank
      FROM players p
      LEFT JOIN session_players sp ON p.id = sp.player_id
      LEFT JOIN game_sessions gs ON sp.session_id = gs.id AND gs.end_time IS NOT NULL
      LEFT JOIN player_statistics ps ON p.id = ps.player_id
      WHERE p.total_games_played > 0
      GROUP BY p.id, p.name, p.trust_score, p.total_games_played
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;

    return this.cachedQuery(cacheKey, query, [limit, offset], 1 * 60 * 1000); // 1 minute TTL
  }

  /**
   * Optimized session history query with joins
   */
  public async getSessionHistoryOptimized(
    playerId: string,
    limit: number = 20
  ): Promise<any[]> {
    const cacheKey = `session_history_${playerId}_${limit}`;
    
    const query = `
      SELECT 
        gs.id,
        gs.start_time,
        gs.end_time,
        gs.winner_id,
        gs.current_phase,
        COUNT(r.id) as total_rounds,
        CASE WHEN gs.winner_id = ? THEN 1 ELSE 0 END as won,
        GROUP_CONCAT(DISTINCT other_p.name) as opponents
      FROM game_sessions gs
      JOIN session_players sp ON gs.id = sp.session_id
      JOIN session_players other_sp ON gs.id = other_sp.session_id AND other_sp.player_id != ?
      JOIN players other_p ON other_sp.player_id = other_p.id
      LEFT JOIN rounds r ON gs.id = r.session_id
      WHERE sp.player_id = ? AND gs.end_time IS NOT NULL
      GROUP BY gs.id, gs.start_time, gs.end_time, gs.winner_id, gs.current_phase
      ORDER BY gs.end_time DESC
      LIMIT ?
    `;

    return this.cachedQuery(cacheKey, query, [playerId, playerId, playerId, limit]);
  }

  /**
   * Batch insert optimization for rounds and decisions
   */
  public async batchInsertRounds(rounds: any[]): Promise<void> {
    if (rounds.length === 0) return;

    const placeholders = rounds.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const values = rounds.flatMap(round => [
      round.id,
      round.session_id,
      round.round_number,
      round.phase_type,
      round.created_at
    ]);

    const query = `
      INSERT INTO rounds (id, session_id, round_number, phase_type, created_at)
      VALUES ${placeholders}
    `;

    await this.db.run(query, values);
  }

  /**
   * Optimized concurrent user count
   */
  public async getActiveConcurrentUsers(): Promise<number> {
    const cacheKey = 'concurrent_users';
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const query = `
      SELECT COUNT(DISTINCT sp.player_id) as active_users
      FROM session_players sp
      JOIN game_sessions gs ON sp.session_id = gs.id
      WHERE gs.start_time > ? AND gs.end_time IS NULL
    `;

    const result = await this.cachedQuery<{ active_users: number }>(cacheKey, query, [fiveMinutesAgo], 30000); // 30 second TTL
    return result[0]?.active_users || 0;
  }

  /**
   * Clear cache for specific keys or patterns
   */
  public clearCache(pattern?: string): void {
    if (!pattern) {
      this.queryCache.clear();
      return;
    }

    Array.from(this.queryCache.keys()).forEach(key => {
      if (key.includes(pattern)) {
        this.queryCache.delete(key);
      }
    });
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    Array.from(this.queryCache.entries()).forEach(([key, cached]) => {
      if (now - cached.timestamp >= cached.ttl) {
        this.queryCache.delete(key);
      }
    });
  }

  /**
   * Get cache statistics for monitoring
   */
  public getCacheStats(): {
    totalEntries: number;
    hitRate: number;
    memoryUsage: number;
  } {
    return {
      totalEntries: this.queryCache.size,
      hitRate: 0, // Would need to track hits/misses for accurate calculation
      memoryUsage: JSON.stringify(Array.from(this.queryCache.entries())).length
    };
  }

  /**
   * Optimize database with ANALYZE and VACUUM
   */
  public async optimizeDatabase(): Promise<void> {
    try {
      await this.db.run('ANALYZE');
      await this.db.run('VACUUM');
      console.log('Database optimization completed');
    } catch (error) {
      console.error('Database optimization failed:', error);
      throw error;
    }
  }
}

export default QueryOptimizer;