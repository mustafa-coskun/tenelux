import { BaseRepository, RecordNotFoundError } from '../BaseRepository';
import { PlayerStatistics } from '../../types';

interface PlayerStatisticsRow {
  id: string;
  player_id: string;
  session_id: string;
  cooperation_percentage: number;
  betrayal_percentage: number;
  most_fearful_round: number | null;
  total_points: number;
  games_won: number;
  games_lost: number;
  average_trust_score: number;
  created_at: string;
}

export class StatisticsRepository extends BaseRepository {
  async create(
    playerId: string,
    sessionId: string,
    statistics: PlayerStatistics
  ): Promise<void> {
    try {
      const id = this.generateId();
      const createdAt = new Date();

      await this.db.run(
        `INSERT INTO player_statistics (
          id, player_id, session_id, cooperation_percentage, betrayal_percentage,
          most_fearful_round, total_points, games_won, games_lost, 
          average_trust_score, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          playerId,
          sessionId,
          statistics.cooperationPercentage,
          statistics.betrayalPercentage,
          statistics.mostFearfulRound || null,
          statistics.totalPoints,
          statistics.gamesWon,
          statistics.gamesLost,
          statistics.averageTrustScore,
          createdAt.toISOString(),
        ]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'creating player statistics');
    }
  }

  async findByPlayerId(
    playerId: string,
    limit?: number
  ): Promise<PlayerStatistics[]> {
    try {
      let sql = `SELECT * FROM player_statistics 
                 WHERE player_id = ? 
                 ORDER BY created_at DESC`;

      const params: any[] = [playerId];

      if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      const rows = await this.db.all<PlayerStatisticsRow>(sql, params);
      return rows.map((row) => this.mapRowToStatistics(row));
    } catch (error) {
      this.handleDatabaseError(error, 'finding statistics by player id');
    }
  }

  async findBySessionId(sessionId: string): Promise<PlayerStatistics[]> {
    try {
      const rows = await this.db.all<PlayerStatisticsRow>(
        'SELECT * FROM player_statistics WHERE session_id = ?',
        [sessionId]
      );

      return rows.map((row) => this.mapRowToStatistics(row));
    } catch (error) {
      this.handleDatabaseError(error, 'finding statistics by session id');
    }
  }

  async getAggregatedStats(playerId: string): Promise<PlayerStatistics> {
    try {
      const result = await this.db.get<{
        avg_cooperation: number;
        avg_betrayal: number;
        total_points: number;
        total_games_won: number;
        total_games_lost: number;
        avg_trust_score: number;
        game_count: number;
      }>(
        `SELECT 
          AVG(cooperation_percentage) as avg_cooperation,
          AVG(betrayal_percentage) as avg_betrayal,
          SUM(total_points) as total_points,
          SUM(games_won) as total_games_won,
          SUM(games_lost) as total_games_lost,
          AVG(average_trust_score) as avg_trust_score,
          COUNT(*) as game_count
         FROM player_statistics 
         WHERE player_id = ?`,
        [playerId]
      );

      if (!result || result.game_count === 0) {
        return {
          cooperationPercentage: 0,
          betrayalPercentage: 0,
          totalPoints: 0,
          gamesWon: 0,
          gamesLost: 0,
          averageTrustScore: 0,
        };
      }

      // Get most fearful round across all sessions
      const fearfulRoundResult = await this.db.get<{
        most_fearful_round: number;
      }>(
        `SELECT most_fearful_round 
         FROM player_statistics 
         WHERE player_id = ? AND most_fearful_round IS NOT NULL
         ORDER BY created_at DESC 
         LIMIT 1`,
        [playerId]
      );

      return {
        cooperationPercentage: result.avg_cooperation || 0,
        betrayalPercentage: result.avg_betrayal || 0,
        mostFearfulRound: fearfulRoundResult?.most_fearful_round,
        totalPoints: result.total_points || 0,
        gamesWon: result.total_games_won || 0,
        gamesLost: result.total_games_lost || 0,
        averageTrustScore: result.avg_trust_score || 0,
      };
    } catch (error) {
      this.handleDatabaseError(error, 'getting aggregated statistics');
    }
  }

  async getTopPlayersByCooperation(
    limit: number = 10
  ): Promise<Array<{ playerId: string; cooperationPercentage: number }>> {
    try {
      const rows = await this.db.all<{
        player_id: string;
        avg_cooperation: number;
      }>(
        `SELECT player_id, AVG(cooperation_percentage) as avg_cooperation
         FROM player_statistics
         GROUP BY player_id
         ORDER BY avg_cooperation DESC
         LIMIT ?`,
        [limit]
      );

      return rows.map((row) => ({
        playerId: row.player_id,
        cooperationPercentage: row.avg_cooperation,
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getting top players by cooperation');
    }
  }

  async getTopPlayersByPoints(
    limit: number = 10
  ): Promise<Array<{ playerId: string; totalPoints: number }>> {
    try {
      const rows = await this.db.all<{
        player_id: string;
        total_points: number;
      }>(
        `SELECT player_id, SUM(total_points) as total_points
         FROM player_statistics
         GROUP BY player_id
         ORDER BY total_points DESC
         LIMIT ?`,
        [limit]
      );

      return rows.map((row) => ({
        playerId: row.player_id,
        totalPoints: row.total_points,
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getting top players by points');
    }
  }

  async deleteByPlayerId(playerId: string): Promise<number> {
    try {
      const result = await this.db.run(
        'DELETE FROM player_statistics WHERE player_id = ?',
        [playerId]
      );

      return result.changes;
    } catch (error) {
      this.handleDatabaseError(error, 'deleting statistics by player id');
    }
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    try {
      const result = await this.db.run(
        'DELETE FROM player_statistics WHERE session_id = ?',
        [sessionId]
      );

      return result.changes;
    } catch (error) {
      this.handleDatabaseError(error, 'deleting statistics by session id');
    }
  }

  private mapRowToStatistics(row: PlayerStatisticsRow): PlayerStatistics {
    return {
      cooperationPercentage: row.cooperation_percentage,
      betrayalPercentage: row.betrayal_percentage,
      mostFearfulRound: row.most_fearful_round || undefined,
      totalPoints: row.total_points,
      gamesWon: row.games_won,
      gamesLost: row.games_lost,
      averageTrustScore: row.average_trust_score,
    };
  }
}

export default StatisticsRepository;
