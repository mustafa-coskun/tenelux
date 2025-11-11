import { BaseRepository, RecordNotFoundError } from '../BaseRepository';
import {
  TournamentStatistics,
  TournamentRanking,
  TournamentPlayerStats,
  HeadToHeadStats,
  MatchResult,
  MatchStatistics
} from '../../types/party';

export class TournamentStatisticsRepository extends BaseRepository {
  async createTournamentStatistics(tournamentId: string): Promise<void> {
    try {
      await this.db.run(
        `INSERT INTO tournament_statistics (
          tournament_id, total_matches, total_rounds, duration,
          average_match_duration, cooperation_rate, betrayal_rate,
          created_at, updated_at
        ) VALUES (?, 0, 0, 0, 0.0, 0.0, 0.0, ?, ?)`,
        [tournamentId, new Date().toISOString(), new Date().toISOString()]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'creating tournament statistics');
    }
  }

  async updateTournamentStatistics(tournamentId: string, stats: Partial<TournamentStatistics>): Promise<void> {
    try {
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (stats.totalMatches !== undefined) {
        updateFields.push('total_matches = ?');
        updateValues.push(stats.totalMatches);
      }
      if (stats.totalRounds !== undefined) {
        updateFields.push('total_rounds = ?');
        updateValues.push(stats.totalRounds);
      }
      if (stats.duration !== undefined) {
        updateFields.push('duration = ?');
        updateValues.push(stats.duration);
      }
      if (stats.averageMatchDuration !== undefined) {
        updateFields.push('average_match_duration = ?');
        updateValues.push(stats.averageMatchDuration);
      }
      if (stats.cooperationRate !== undefined) {
        updateFields.push('cooperation_rate = ?');
        updateValues.push(stats.cooperationRate);
      }
      if (stats.betrayalRate !== undefined) {
        updateFields.push('betrayal_rate = ?');
        updateValues.push(stats.betrayalRate);
      }
      if (stats.mostCooperativePlayer) {
        updateFields.push('most_cooperative_player_id = ?');
        updateValues.push(stats.mostCooperativePlayer.id);
      }
      if (stats.mostCompetitivePlayer) {
        updateFields.push('most_competitive_player_id = ?');
        updateValues.push(stats.mostCompetitivePlayer.id);
      }
      if (stats.tournamentMVP) {
        updateFields.push('tournament_mvp_id = ?');
        updateValues.push(stats.tournamentMVP.id);
      }

      if (updateFields.length > 0) {
        updateFields.push('updated_at = ?');
        updateValues.push(new Date().toISOString());

        await this.db.run(
          `UPDATE tournament_statistics SET ${updateFields.join(', ')} WHERE tournament_id = ?`,
          [...updateValues, tournamentId]
        );
      }
    } catch (error) {
      this.handleDatabaseError(error, 'updating tournament statistics');
    }
  }

  async getTournamentStatistics(tournamentId: string): Promise<TournamentStatistics | null> {
    try {
      const result = await this.db.get(
        `SELECT ts.*, 
                mcp.name as most_cooperative_name,
                mcomp.name as most_competitive_name,
                mvp.name as mvp_name
         FROM tournament_statistics ts
         LEFT JOIN players mcp ON ts.most_cooperative_player_id = mcp.id
         LEFT JOIN players mcomp ON ts.most_competitive_player_id = mcomp.id
         LEFT JOIN players mvp ON ts.tournament_mvp_id = mvp.id
         WHERE ts.tournament_id = ?`,
        [tournamentId]
      );

      if (!result) {
        return null;
      }

      const rankings = await this.getTournamentRankings(tournamentId);

      return {
        tournamentId: result.tournament_id,
        totalMatches: result.total_matches,
        totalRounds: result.total_rounds,
        duration: result.duration,
        playerRankings: rankings,
        mostCooperativePlayer: result.most_cooperative_player_id ? {
          id: result.most_cooperative_player_id,
          name: result.most_cooperative_name,
          isHost: false,
          isEliminated: false,
          currentRank: 0,
          statistics: {} as TournamentPlayerStats,
          status: 'waiting' as any,
          joinedAt: new Date()
        } : undefined,
        mostCompetitivePlayer: result.most_competitive_player_id ? {
          id: result.most_competitive_player_id,
          name: result.most_competitive_name,
          isHost: false,
          isEliminated: false,
          currentRank: 0,
          statistics: {} as TournamentPlayerStats,
          status: 'waiting' as any,
          joinedAt: new Date()
        } : undefined,
        tournamentMVP: result.tournament_mvp_id ? {
          id: result.tournament_mvp_id,
          name: result.mvp_name,
          isHost: false,
          isEliminated: false,
          currentRank: 0,
          statistics: {} as TournamentPlayerStats,
          status: 'waiting' as any,
          joinedAt: new Date()
        } : undefined,
        averageMatchDuration: result.average_match_duration,
        cooperationRate: result.cooperation_rate,
        betrayalRate: result.betrayal_rate
      };
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament statistics');
    }
  }

  async createOrUpdatePlayerStatistics(
    tournamentId: string, 
    playerId: string, 
    stats: TournamentPlayerStats
  ): Promise<void> {
    try {
      await this.db.run(
        `INSERT OR REPLACE INTO tournament_player_statistics (
          id, tournament_id, player_id, matches_played, matches_won, matches_lost,
          total_points, cooperation_rate, betrayal_rate, average_match_score,
          tournament_points, final_rank, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `${tournamentId}-${playerId}`,
          tournamentId,
          playerId,
          stats.matchesPlayed,
          stats.matchesWon,
          stats.matchesLost,
          stats.totalPoints,
          stats.cooperationRate,
          stats.betrayalRate,
          stats.averageMatchScore,
          stats.tournamentPoints,
          null, // final_rank will be set when tournament completes
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'creating/updating player statistics');
    }
  }

  async getPlayerStatistics(tournamentId: string, playerId: string): Promise<TournamentPlayerStats | null> {
    try {
      const result = await this.db.get(
        `SELECT * FROM tournament_player_statistics 
         WHERE tournament_id = ? AND player_id = ?`,
        [tournamentId, playerId]
      );

      if (!result) {
        return null;
      }

      const headToHeadRecord = await this.getHeadToHeadRecord(tournamentId, playerId);

      return {
        matchesPlayed: result.matches_played,
        matchesWon: result.matches_won,
        matchesLost: result.matches_lost,
        totalPoints: result.total_points,
        cooperationRate: result.cooperation_rate,
        betrayalRate: result.betrayal_rate,
        averageMatchScore: result.average_match_score,
        headToHeadRecord,
        tournamentPoints: result.tournament_points
      };
    } catch (error) {
      this.handleDatabaseError(error, 'getting player statistics');
    }
  }

  async updateHeadToHeadRecord(
    tournamentId: string,
    player1Id: string,
    player2Id: string,
    matchResult: MatchResult
  ): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        // Update player1 vs player2 record
        await this.db.run(
          `INSERT OR REPLACE INTO tournament_head_to_head (
            id, tournament_id, player1_id, player2_id, matches_played,
            player1_wins, player2_wins, player1_total_points, player2_total_points,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, 
            COALESCE((SELECT matches_played FROM tournament_head_to_head WHERE tournament_id = ? AND player1_id = ? AND player2_id = ?), 0) + 1,
            COALESCE((SELECT player1_wins FROM tournament_head_to_head WHERE tournament_id = ? AND player1_id = ? AND player2_id = ?), 0) + ?,
            COALESCE((SELECT player2_wins FROM tournament_head_to_head WHERE tournament_id = ? AND player1_id = ? AND player2_id = ?), 0) + ?,
            COALESCE((SELECT player1_total_points FROM tournament_head_to_head WHERE tournament_id = ? AND player1_id = ? AND player2_id = ?), 0) + ?,
            COALESCE((SELECT player2_total_points FROM tournament_head_to_head WHERE tournament_id = ? AND player1_id = ? AND player2_id = ?), 0) + ?,
            ?, ?
          )`,
          [
            `${tournamentId}-${player1Id}-${player2Id}`,
            tournamentId, player1Id, player2Id,
            tournamentId, player1Id, player2Id, // matches_played lookup
            tournamentId, player1Id, player2Id, matchResult.winnerId === player1Id ? 1 : 0, // player1_wins
            tournamentId, player1Id, player2Id, matchResult.winnerId === player2Id ? 1 : 0, // player2_wins
            tournamentId, player1Id, player2Id, matchResult.player1Score, // player1_total_points
            tournamentId, player1Id, player2Id, matchResult.player2Score, // player2_total_points
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      });
    } catch (error) {
      this.handleDatabaseError(error, 'updating head-to-head record');
    }
  }

  async getHeadToHeadRecord(tournamentId: string, playerId: string): Promise<Map<string, HeadToHeadStats>> {
    try {
      const results = await this.db.all(
        `SELECT h2h.*, p.name as opponent_name
         FROM tournament_head_to_head h2h
         JOIN players p ON (
           CASE 
             WHEN h2h.player1_id = ? THEN h2h.player2_id = p.id
             ELSE h2h.player1_id = p.id
           END
         )
         WHERE h2h.tournament_id = ? AND (h2h.player1_id = ? OR h2h.player2_id = ?)`,
        [playerId, tournamentId, playerId, playerId]
      );

      const headToHeadMap = new Map<string, HeadToHeadStats>();

      for (const row of results) {
        const isPlayer1 = row.player1_id === playerId;
        const opponentId = isPlayer1 ? row.player2_id : row.player1_id;
        
        headToHeadMap.set(opponentId, {
          opponentId,
          opponentName: row.opponent_name,
          matchesPlayed: row.matches_played,
          wins: isPlayer1 ? row.player1_wins : row.player2_wins,
          losses: isPlayer1 ? row.player2_wins : row.player1_wins,
          totalPointsScored: isPlayer1 ? row.player1_total_points : row.player2_total_points,
          totalPointsConceded: isPlayer1 ? row.player2_total_points : row.player1_total_points
        });
      }

      return headToHeadMap;
    } catch (error) {
      this.handleDatabaseError(error, 'getting head-to-head record');
    }
  }

  async createTournamentRankings(tournamentId: string, rankings: TournamentRanking[]): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        // Clear existing rankings
        await this.db.run(
          `DELETE FROM tournament_rankings WHERE tournament_id = ?`,
          [tournamentId]
        );

        // Insert new rankings
        for (const ranking of rankings) {
          await this.db.run(
            `INSERT INTO tournament_rankings (
              id, tournament_id, player_id, rank, final_score, match_record,
              cooperation_percentage, average_points_per_match, tournament_points,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `${tournamentId}-${ranking.player.id}`,
              tournamentId,
              ranking.player.id,
              ranking.rank,
              ranking.finalScore,
              ranking.matchRecord,
              ranking.cooperationPercentage,
              ranking.averagePointsPerMatch,
              ranking.tournamentPoints,
              new Date().toISOString()
            ]
          );

          // Update final rank in player statistics
          await this.db.run(
            `UPDATE tournament_player_statistics 
             SET final_rank = ? 
             WHERE tournament_id = ? AND player_id = ?`,
            [ranking.rank, tournamentId, ranking.player.id]
          );
        }
      });
    } catch (error) {
      this.handleDatabaseError(error, 'creating tournament rankings');
    }
  }

  async getTournamentRankings(tournamentId: string): Promise<TournamentRanking[]> {
    try {
      const results = await this.db.all(
        `SELECT tr.*, p.name, p.is_ai
         FROM tournament_rankings tr
         JOIN players p ON tr.player_id = p.id
         WHERE tr.tournament_id = ?
         ORDER BY tr.rank ASC`,
        [tournamentId]
      );

      return results.map(row => ({
        rank: row.rank,
        player: {
          id: row.player_id,
          name: row.name,
          isHost: false,
          isEliminated: false,
          currentRank: row.rank,
          statistics: {} as TournamentPlayerStats,
          status: 'waiting' as any,
          joinedAt: new Date()
        },
        finalScore: row.final_score,
        matchRecord: row.match_record,
        cooperationPercentage: row.cooperation_percentage,
        averagePointsPerMatch: row.average_points_per_match,
        tournamentPoints: row.tournament_points
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament rankings');
    }
  }

  async getPlayerTournamentHistory(playerId: string, limit: number = 20): Promise<TournamentRanking[]> {
    try {
      const results = await this.db.all(
        `SELECT tr.*, t.format, t.start_time, t.end_time
         FROM tournament_rankings tr
         JOIN tournaments t ON tr.tournament_id = t.id
         WHERE tr.player_id = ? AND t.status = 'completed'
         ORDER BY t.end_time DESC
         LIMIT ?`,
        [playerId, limit]
      );

      return results.map(row => ({
        rank: row.rank,
        player: {
          id: row.player_id,
          name: '',
          isHost: false,
          isEliminated: false,
          currentRank: row.rank,
          statistics: {} as TournamentPlayerStats,
          status: 'waiting' as any,
          joinedAt: new Date()
        },
        finalScore: row.final_score,
        matchRecord: row.match_record,
        cooperationPercentage: row.cooperation_percentage,
        averagePointsPerMatch: row.average_points_per_match,
        tournamentPoints: row.tournament_points
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getting player tournament history');
    }
  }

  async deleteTournamentStatistics(tournamentId: string): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        await this.db.run(`DELETE FROM tournament_rankings WHERE tournament_id = ?`, [tournamentId]);
        await this.db.run(`DELETE FROM tournament_head_to_head WHERE tournament_id = ?`, [tournamentId]);
        await this.db.run(`DELETE FROM tournament_player_statistics WHERE tournament_id = ?`, [tournamentId]);
        await this.db.run(`DELETE FROM tournament_statistics WHERE tournament_id = ?`, [tournamentId]);
      });
    } catch (error) {
      this.handleDatabaseError(error, 'deleting tournament statistics');
    }
  }
}

export default TournamentStatisticsRepository;