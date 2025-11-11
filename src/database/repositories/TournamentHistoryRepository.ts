import { BaseRepository } from '../BaseRepository';
import {
  Tournament,
  TournamentStatistics,
  TournamentRanking,
  TournamentPlayer
} from '../../types/party';

export interface TournamentHistoryRecord {
  id: string;
  originalTournamentId: string;
  lobbyCode: string;
  format: string;
  totalPlayers: number;
  totalMatches: number;
  totalRounds: number;
  duration: number;
  winnerId: string;
  winnerName: string;
  startTime: Date;
  endTime: Date;
  cooperationRate: number;
  betrayalRate: number;
  archivedAt: Date;
}

export interface TournamentHistoryPlayerRecord {
  id: string;
  historyId: string;
  playerId: string;
  playerName: string;
  finalRank: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  totalPoints: number;
  cooperationRate: number;
  betrayalRate: number;
  tournamentPoints: number;
}

export class TournamentHistoryRepository extends BaseRepository {
  async archiveTournament(
    tournament: Tournament,
    statistics: TournamentStatistics,
    rankings: TournamentRanking[],
    lobbyCode: string
  ): Promise<string> {
    try {
      const historyId = this.generateId();
      const winner = rankings.find(r => r.rank === 1);

      if (!winner) {
        throw new Error('No winner found in tournament rankings');
      }

      await this.executeWithTransaction(async () => {
        // Archive main tournament record
        await this.db.run(
          `INSERT INTO tournament_history (
            id, original_tournament_id, lobby_code, format, total_players,
            total_matches, total_rounds, duration, winner_id, winner_name,
            start_time, end_time, cooperation_rate, betrayal_rate, archived_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            historyId,
            tournament.id,
            lobbyCode,
            tournament.format,
            tournament.players.length,
            statistics.totalMatches,
            statistics.totalRounds,
            statistics.duration,
            winner.player.id,
            winner.player.name,
            tournament.startTime?.toISOString(),
            tournament.endTime?.toISOString(),
            statistics.cooperationRate,
            statistics.betrayalRate,
            new Date().toISOString()
          ]
        );

        // Archive player records
        for (const ranking of rankings) {
          await this.db.run(
            `INSERT INTO tournament_history_players (
              id, history_id, player_id, player_name, final_rank,
              matches_played, matches_won, matches_lost, total_points,
              cooperation_rate, betrayal_rate, tournament_points
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `${historyId}-${ranking.player.id}`,
              historyId,
              ranking.player.id,
              ranking.player.name,
              ranking.rank,
              ranking.player.statistics.matchesPlayed,
              ranking.player.statistics.matchesWon,
              ranking.player.statistics.matchesLost,
              ranking.finalScore,
              ranking.cooperationPercentage,
              100 - ranking.cooperationPercentage, // betrayal rate
              ranking.tournamentPoints
            ]
          );
        }
      });

      return historyId;
    } catch (error) {
      this.handleDatabaseError(error, 'archiving tournament');
    }
  }

  async getTournamentHistory(
    limit: number = 50,
    offset: number = 0,
    format?: string
  ): Promise<TournamentHistoryRecord[]> {
    try {
      let sql = `
        SELECT * FROM tournament_history 
        WHERE 1=1
      `;
      const params: any[] = [];

      if (format) {
        sql += ` AND format = ?`;
        params.push(format);
      }

      sql += ` ORDER BY archived_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const results = await this.db.all(sql, params);

      return results.map(row => this.convertDateFields(
        {
          id: row.id,
          originalTournamentId: row.original_tournament_id,
          lobbyCode: row.lobby_code,
          format: row.format,
          totalPlayers: row.total_players,
          totalMatches: row.total_matches,
          totalRounds: row.total_rounds,
          duration: row.duration,
          winnerId: row.winner_id,
          winnerName: row.winner_name,
          startTime: row.start_time,
          endTime: row.end_time,
          cooperationRate: row.cooperation_rate,
          betrayalRate: row.betrayal_rate,
          archivedAt: row.archived_at
        },
        ['startTime', 'endTime', 'archivedAt']
      ));
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament history');
    }
  }

  async getTournamentHistoryById(historyId: string): Promise<TournamentHistoryRecord | null> {
    try {
      const result = await this.db.get(
        `SELECT * FROM tournament_history WHERE id = ?`,
        [historyId]
      );

      if (!result) {
        return null;
      }

      return this.convertDateFields(
        {
          id: result.id,
          originalTournamentId: result.original_tournament_id,
          lobbyCode: result.lobby_code,
          format: result.format,
          totalPlayers: result.total_players,
          totalMatches: result.total_matches,
          totalRounds: result.total_rounds,
          duration: result.duration,
          winnerId: result.winner_id,
          winnerName: result.winner_name,
          startTime: result.start_time,
          endTime: result.end_time,
          cooperationRate: result.cooperation_rate,
          betrayalRate: result.betrayal_rate,
          archivedAt: result.archived_at
        },
        ['startTime', 'endTime', 'archivedAt']
      );
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament history by id');
    }
  }

  async getTournamentHistoryPlayers(historyId: string): Promise<TournamentHistoryPlayerRecord[]> {
    try {
      const results = await this.db.all(
        `SELECT * FROM tournament_history_players 
         WHERE history_id = ? 
         ORDER BY final_rank ASC`,
        [historyId]
      );

      return results.map(row => ({
        id: row.id,
        historyId: row.history_id,
        playerId: row.player_id,
        playerName: row.player_name,
        finalRank: row.final_rank,
        matchesPlayed: row.matches_played,
        matchesWon: row.matches_won,
        matchesLost: row.matches_lost,
        totalPoints: row.total_points,
        cooperationRate: row.cooperation_rate,
        betrayalRate: row.betrayal_rate,
        tournamentPoints: row.tournament_points
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament history players');
    }
  }

  async getPlayerTournamentHistory(
    playerId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    history: TournamentHistoryRecord;
    playerRecord: TournamentHistoryPlayerRecord;
  }[]> {
    try {
      const results = await this.db.all(
        `SELECT th.*, thp.*,
                th.id as history_id,
                thp.id as player_record_id
         FROM tournament_history th
         JOIN tournament_history_players thp ON th.id = thp.history_id
         WHERE thp.player_id = ?
         ORDER BY th.archived_at DESC
         LIMIT ? OFFSET ?`,
        [playerId, limit, offset]
      );

      return results.map(row => ({
        history: this.convertDateFields(
          {
            id: row.history_id,
            originalTournamentId: row.original_tournament_id,
            lobbyCode: row.lobby_code,
            format: row.format,
            totalPlayers: row.total_players,
            totalMatches: row.total_matches,
            totalRounds: row.total_rounds,
            duration: row.duration,
            winnerId: row.winner_id,
            winnerName: row.winner_name,
            startTime: row.start_time,
            endTime: row.end_time,
            cooperationRate: row.cooperation_rate,
            betrayalRate: row.betrayal_rate,
            archivedAt: row.archived_at
          },
          ['startTime', 'endTime', 'archivedAt']
        ),
        playerRecord: {
          id: row.player_record_id,
          historyId: row.history_id,
          playerId: row.player_id,
          playerName: row.player_name,
          finalRank: row.final_rank,
          matchesPlayed: row.matches_played,
          matchesWon: row.matches_won,
          matchesLost: row.matches_lost,
          totalPoints: row.total_points,
          cooperationRate: row.cooperation_rate,
          betrayalRate: row.betrayal_rate,
          tournamentPoints: row.tournament_points
        }
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getting player tournament history');
    }
  }

  async getPlayerTournamentStats(playerId: string): Promise<{
    totalTournaments: number;
    wins: number;
    averageRank: number;
    totalTournamentPoints: number;
    averageCooperationRate: number;
    bestRank: number;
    worstRank: number;
  }> {
    try {
      const result = await this.db.get(
        `SELECT 
           COUNT(*) as total_tournaments,
           SUM(CASE WHEN final_rank = 1 THEN 1 ELSE 0 END) as wins,
           AVG(final_rank) as average_rank,
           SUM(tournament_points) as total_tournament_points,
           AVG(cooperation_rate) as average_cooperation_rate,
           MIN(final_rank) as best_rank,
           MAX(final_rank) as worst_rank
         FROM tournament_history_players 
         WHERE player_id = ?`,
        [playerId]
      );

      return {
        totalTournaments: result?.total_tournaments || 0,
        wins: result?.wins || 0,
        averageRank: result?.average_rank || 0,
        totalTournamentPoints: result?.total_tournament_points || 0,
        averageCooperationRate: result?.average_cooperation_rate || 0,
        bestRank: result?.best_rank || 0,
        worstRank: result?.worst_rank || 0
      };
    } catch (error) {
      this.handleDatabaseError(error, 'getting player tournament stats');
    }
  }

  async getTournamentLeaderboard(
    format?: string,
    timeframe?: 'week' | 'month' | 'year' | 'all',
    limit: number = 50
  ): Promise<{
    playerId: string;
    playerName: string;
    totalTournaments: number;
    wins: number;
    winRate: number;
    averageRank: number;
    totalPoints: number;
    averageCooperationRate: number;
  }[]> {
    try {
      let sql = `
        SELECT 
          thp.player_id,
          thp.player_name,
          COUNT(*) as total_tournaments,
          SUM(CASE WHEN thp.final_rank = 1 THEN 1 ELSE 0 END) as wins,
          (SUM(CASE WHEN thp.final_rank = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as win_rate,
          AVG(thp.final_rank) as average_rank,
          SUM(thp.tournament_points) as total_points,
          AVG(thp.cooperation_rate) as average_cooperation_rate
        FROM tournament_history_players thp
        JOIN tournament_history th ON thp.history_id = th.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (format) {
        sql += ` AND th.format = ?`;
        params.push(format);
      }

      if (timeframe && timeframe !== 'all') {
        const timeframeDays = {
          week: 7,
          month: 30,
          year: 365
        };
        sql += ` AND th.archived_at >= datetime('now', '-${timeframeDays[timeframe]} days')`;
      }

      sql += `
        GROUP BY thp.player_id, thp.player_name
        HAVING total_tournaments >= 3
        ORDER BY total_points DESC, win_rate DESC, average_rank ASC
        LIMIT ?
      `;
      params.push(limit);

      const results = await this.db.all(sql, params);

      return results.map(row => ({
        playerId: row.player_id,
        playerName: row.player_name,
        totalTournaments: row.total_tournaments,
        wins: row.wins,
        winRate: row.win_rate,
        averageRank: row.average_rank,
        totalPoints: row.total_points,
        averageCooperationRate: row.average_cooperation_rate
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament leaderboard');
    }
  }

  async deleteOldHistory(daysOld: number = 365): Promise<number> {
    try {
      const result = await this.executeWithTransaction(async () => {
        // Get count of records to be deleted
        const countResult = await this.db.get(
          `SELECT COUNT(*) as count FROM tournament_history 
           WHERE archived_at < datetime('now', '-${daysOld} days')`
        );

        // Delete old history records (cascade will handle related records)
        await this.db.run(
          `DELETE FROM tournament_history 
           WHERE archived_at < datetime('now', '-${daysOld} days')`
        );

        return countResult?.count || 0;
      });

      return result;
    } catch (error) {
      this.handleDatabaseError(error, 'deleting old tournament history');
    }
  }

  async getTournamentHistoryStats(): Promise<{
    totalArchivedTournaments: number;
    totalArchivedPlayers: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
    formatDistribution: { format: string; count: number }[];
  }> {
    try {
      const totalResult = await this.db.get(
        `SELECT COUNT(*) as total_tournaments FROM tournament_history`
      );

      const playersResult = await this.db.get(
        `SELECT COUNT(DISTINCT player_id) as total_players FROM tournament_history_players`
      );

      const datesResult = await this.db.get(
        `SELECT MIN(archived_at) as oldest, MAX(archived_at) as newest FROM tournament_history`
      );

      const formatResults = await this.db.all(
        `SELECT format, COUNT(*) as count FROM tournament_history GROUP BY format ORDER BY count DESC`
      );

      return {
        totalArchivedTournaments: totalResult?.total_tournaments || 0,
        totalArchivedPlayers: playersResult?.total_players || 0,
        oldestRecord: datesResult?.oldest ? new Date(datesResult.oldest) : null,
        newestRecord: datesResult?.newest ? new Date(datesResult.newest) : null,
        formatDistribution: formatResults.map(row => ({
          format: row.format,
          count: row.count
        }))
      };
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament history stats');
    }
  }
}

export default TournamentHistoryRepository;