import { BaseRepository, RecordNotFoundError } from '../BaseRepository';
import {
  Tournament,
  TournamentStatus,
  TournamentFormat,
  TournamentPlayer,
  TournamentPlayerStats,
  TournamentStatistics,
  TournamentRanking
} from '../../types/party';

export class TournamentRepository extends BaseRepository {
  async createTournament(tournament: Omit<Tournament, 'id'>): Promise<Tournament> {
    try {
      const id = this.generateId();
      const tournamentData = {
        id,
        ...tournament,
        start_time: tournament.startTime?.toISOString(),
        end_time: tournament.endTime?.toISOString(),
        created_at: new Date().toISOString()
      };

      await this.db.run(
        `INSERT INTO tournaments (
          id, lobby_id, format, current_round, total_rounds, 
          status, start_time, end_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tournamentData.id,
          tournamentData.lobbyId,
          tournamentData.format,
          tournamentData.currentRound,
          tournamentData.totalRounds,
          tournamentData.status,
          tournamentData.start_time,
          tournamentData.end_time,
          tournamentData.created_at
        ]
      );

      return this.getTournamentById(id);
    } catch (error) {
      this.handleDatabaseError(error, 'creating tournament');
    }
  }

  async getTournamentById(id: string): Promise<Tournament> {
    try {
      const result = await this.db.get(
        `SELECT * FROM tournaments WHERE id = ?`,
        [id]
      );

      if (!result) {
        throw new RecordNotFoundError('tournaments', id);
      }

      return this.convertTournamentFromDb(result);
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        throw error;
      }
      this.handleDatabaseError(error, 'getting tournament by id');
    }
  }

  async getTournamentByLobbyId(lobbyId: string): Promise<Tournament | null> {
    try {
      const result = await this.db.get(
        `SELECT * FROM tournaments WHERE lobby_id = ?`,
        [lobbyId]
      );

      return result ? this.convertTournamentFromDb(result) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament by lobby id');
    }
  }

  async updateTournamentStatus(id: string, status: TournamentStatus): Promise<void> {
    try {
      const updateData: any = { status };
      
      if (status === TournamentStatus.IN_PROGRESS && !await this.getTournamentStartTime(id)) {
        updateData.start_time = new Date().toISOString();
      } else if (status === TournamentStatus.COMPLETED) {
        updateData.end_time = new Date().toISOString();
      }

      const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updateData);

      await this.db.run(
        `UPDATE tournaments SET ${setClause} WHERE id = ?`,
        [...values, id]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'updating tournament status');
    }
  }

  async updateCurrentRound(id: string, roundNumber: number): Promise<void> {
    try {
      await this.db.run(
        `UPDATE tournaments SET current_round = ? WHERE id = ?`,
        [roundNumber, id]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'updating tournament current round');
    }
  }

  async addTournamentPlayer(tournamentId: string, player: TournamentPlayer): Promise<void> {
    try {
      await this.db.run(
        `INSERT INTO tournament_players (
          tournament_id, player_id, is_eliminated, current_rank, 
          tournament_points, joined_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tournamentId,
          player.id,
          player.isEliminated ? 1 : 0,
          player.currentRank,
          player.statistics.tournamentPoints,
          player.joinedAt.toISOString()
        ]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'adding tournament player');
    }
  }

  async getTournamentPlayers(tournamentId: string): Promise<TournamentPlayer[]> {
    try {
      const results = await this.db.all(
        `SELECT tp.*, p.name, p.is_ai 
         FROM tournament_players tp
         JOIN players p ON tp.player_id = p.id
         WHERE tp.tournament_id = ?
         ORDER BY tp.current_rank ASC, tp.joined_at ASC`,
        [tournamentId]
      );

      const players: TournamentPlayer[] = [];
      
      for (const row of results) {
        const stats = await this.getTournamentPlayerStats(tournamentId, row.player_id);
        
        players.push({
          id: row.player_id,
          name: row.name,
          isHost: false, // Will be set by lobby service
          isEliminated: Boolean(row.is_eliminated),
          currentRank: row.current_rank,
          statistics: stats,
          status: 'waiting' as any, // Will be updated by tournament engine
          joinedAt: new Date(row.joined_at)
        });
      }

      return players;
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament players');
    }
  }

  async eliminatePlayer(tournamentId: string, playerId: string): Promise<void> {
    try {
      await this.db.run(
        `UPDATE tournament_players 
         SET is_eliminated = 1, eliminated_at = ? 
         WHERE tournament_id = ? AND player_id = ?`,
        [new Date().toISOString(), tournamentId, playerId]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'eliminating tournament player');
    }
  }

  async updatePlayerRank(tournamentId: string, playerId: string, rank: number): Promise<void> {
    try {
      await this.db.run(
        `UPDATE tournament_players 
         SET current_rank = ? 
         WHERE tournament_id = ? AND player_id = ?`,
        [rank, tournamentId, playerId]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'updating player rank');
    }
  }

  async getTournamentPlayerStats(tournamentId: string, playerId: string): Promise<TournamentPlayerStats> {
    try {
      const result = await this.db.get(
        `SELECT * FROM tournament_player_statistics 
         WHERE tournament_id = ? AND player_id = ?`,
        [tournamentId, playerId]
      );

      if (!result) {
        // Return default stats if none exist yet
        return {
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          totalPoints: 0,
          cooperationRate: 0,
          betrayalRate: 0,
          averageMatchScore: 0,
          headToHeadRecord: new Map(),
          tournamentPoints: 0
        };
      }

      return {
        matchesPlayed: result.matches_played,
        matchesWon: result.matches_won,
        matchesLost: result.matches_lost,
        totalPoints: result.total_points,
        cooperationRate: result.cooperation_rate,
        betrayalRate: result.betrayal_rate,
        averageMatchScore: result.average_match_score,
        headToHeadRecord: new Map(), // Will be populated separately
        tournamentPoints: result.tournament_points
      };
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament player stats');
    }
  }

  async getActiveTournaments(): Promise<Tournament[]> {
    try {
      const results = await this.db.all(
        `SELECT * FROM tournaments 
         WHERE status IN ('not_started', 'in_progress')
         ORDER BY start_time DESC`
      );

      return results.map(result => this.convertTournamentFromDb(result));
    } catch (error) {
      this.handleDatabaseError(error, 'getting active tournaments');
    }
  }

  async getCompletedTournaments(limit: number = 50): Promise<Tournament[]> {
    try {
      const results = await this.db.all(
        `SELECT * FROM tournaments 
         WHERE status = 'completed'
         ORDER BY end_time DESC
         LIMIT ?`,
        [limit]
      );

      return results.map(result => this.convertTournamentFromDb(result));
    } catch (error) {
      this.handleDatabaseError(error, 'getting completed tournaments');
    }
  }

  async deleteTournament(id: string): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        // Delete related records first (cascade should handle this, but being explicit)
        await this.db.run(`DELETE FROM tournament_chat_messages WHERE tournament_id = ?`, [id]);
        await this.db.run(`DELETE FROM tournament_rankings WHERE tournament_id = ?`, [id]);
        await this.db.run(`DELETE FROM tournament_statistics WHERE tournament_id = ?`, [id]);
        await this.db.run(`DELETE FROM tournament_head_to_head WHERE tournament_id = ?`, [id]);
        await this.db.run(`DELETE FROM tournament_player_statistics WHERE tournament_id = ?`, [id]);
        await this.db.run(`DELETE FROM tournament_match_results WHERE match_id IN (SELECT id FROM tournament_matches WHERE tournament_id = ?)`, [id]);
        await this.db.run(`DELETE FROM tournament_matches WHERE tournament_id = ?`, [id]);
        await this.db.run(`DELETE FROM tournament_rounds WHERE tournament_id = ?`, [id]);
        await this.db.run(`DELETE FROM tournament_players WHERE tournament_id = ?`, [id]);
        await this.db.run(`DELETE FROM tournaments WHERE id = ?`, [id]);
      });
    } catch (error) {
      this.handleDatabaseError(error, 'deleting tournament');
    }
  }

  private async getTournamentStartTime(id: string): Promise<Date | null> {
    try {
      const result = await this.db.get(
        `SELECT start_time FROM tournaments WHERE id = ?`,
        [id]
      );
      return result?.start_time ? new Date(result.start_time) : null;
    } catch (error) {
      return null;
    }
  }

  private convertTournamentFromDb(row: any): Tournament {
    return this.convertDateFields(
      this.convertBooleanFields(
        {
          id: row.id,
          lobbyId: row.lobby_id,
          format: row.format as TournamentFormat,
          players: [], // Will be populated separately
          bracket: { rounds: [], eliminatedPlayers: [], activeMatches: new Map(), nextMatchPairings: [] },
          currentRound: row.current_round,
          totalRounds: row.total_rounds,
          status: row.status as TournamentStatus,
          startTime: row.start_time,
          endTime: row.end_time
        },
        []
      ),
      ['startTime', 'endTime']
    );
  }
}

export default TournamentRepository;