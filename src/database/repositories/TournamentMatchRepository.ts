import { BaseRepository, RecordNotFoundError } from '../BaseRepository';
import {
  TournamentMatch,
  TournamentRound,
  MatchResult,
  MatchStatus,
  RoundStatus,
  ActiveMatch
} from '../../types/party';

export class TournamentMatchRepository extends BaseRepository {
  async createTournamentRound(
    tournamentId: string,
    roundNumber: number
  ): Promise<TournamentRound> {
    try {
      const roundId = this.generateId();
      
      await this.db.run(
        `INSERT INTO tournament_rounds (
          id, tournament_id, round_number, status, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          roundId,
          tournamentId,
          roundNumber,
          RoundStatus.NOT_STARTED,
          new Date().toISOString()
        ]
      );

      return this.getTournamentRoundById(roundId);
    } catch (error) {
      this.handleDatabaseError(error, 'creating tournament round');
    }
  }

  async getTournamentRoundById(roundId: string): Promise<TournamentRound> {
    try {
      const result = await this.db.get(
        `SELECT * FROM tournament_rounds WHERE id = ?`,
        [roundId]
      );

      if (!result) {
        throw new RecordNotFoundError('tournament_rounds', roundId);
      }

      const matches = await this.getRoundMatches(roundId);

      return this.convertDateFields(
        {
          roundNumber: result.round_number,
          matches,
          status: result.status as RoundStatus,
          startTime: result.start_time,
          endTime: result.end_time
        },
        ['startTime', 'endTime']
      );
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        throw error;
      }
      this.handleDatabaseError(error, 'getting tournament round by id');
    }
  }

  async getTournamentRounds(tournamentId: string): Promise<TournamentRound[]> {
    try {
      const results = await this.db.all(
        `SELECT * FROM tournament_rounds 
         WHERE tournament_id = ? 
         ORDER BY round_number ASC`,
        [tournamentId]
      );

      const rounds: TournamentRound[] = [];
      
      for (const row of results) {
        const matches = await this.getRoundMatches(row.id);
        
        rounds.push(this.convertDateFields(
          {
            roundNumber: row.round_number,
            matches,
            status: row.status as RoundStatus,
            startTime: row.start_time,
            endTime: row.end_time
          },
          ['startTime', 'endTime']
        ));
      }

      return rounds;
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament rounds');
    }
  }

  async updateRoundStatus(roundId: string, status: RoundStatus): Promise<void> {
    try {
      const updateData: any = { status };
      
      if (status === RoundStatus.IN_PROGRESS) {
        updateData.start_time = new Date().toISOString();
      } else if (status === RoundStatus.COMPLETED) {
        updateData.end_time = new Date().toISOString();
      }

      const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updateData);

      await this.db.run(
        `UPDATE tournament_rounds SET ${setClause} WHERE id = ?`,
        [...values, roundId]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'updating round status');
    }
  }

  async createTournamentMatch(
    match: Omit<TournamentMatch, 'id'>,
    gameSessionId?: string,
    bracketPosition?: number
  ): Promise<TournamentMatch> {
    try {
      const matchId = this.generateId();
      
      await this.db.run(
        `INSERT INTO tournament_matches (
          id, tournament_id, round_id, round_number, player1_id, player2_id,
          game_session_id, status, bracket_position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          matchId,
          match.tournamentId,
          match.roundNumber, // Using roundNumber as round_id for now
          match.roundNumber,
          match.player1Id,
          match.player2Id,
          gameSessionId || null,
          match.status,
          bracketPosition || null,
          new Date().toISOString()
        ]
      );

      return this.getTournamentMatchById(matchId);
    } catch (error) {
      this.handleDatabaseError(error, 'creating tournament match');
    }
  }

  async getTournamentMatchById(matchId: string): Promise<TournamentMatch> {
    try {
      const result = await this.db.get(
        `SELECT * FROM tournament_matches WHERE id = ?`,
        [matchId]
      );

      if (!result) {
        throw new RecordNotFoundError('tournament_matches', matchId);
      }

      return this.convertMatchFromDb(result);
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        throw error;
      }
      this.handleDatabaseError(error, 'getting tournament match by id');
    }
  }

  async getRoundMatches(roundId: string): Promise<TournamentMatch[]> {
    try {
      const results = await this.db.all(
        `SELECT * FROM tournament_matches 
         WHERE round_id = ? 
         ORDER BY bracket_position ASC, created_at ASC`,
        [roundId]
      );

      return results.map(result => this.convertMatchFromDb(result));
    } catch (error) {
      this.handleDatabaseError(error, 'getting round matches');
    }
  }

  async getTournamentMatches(tournamentId: string): Promise<TournamentMatch[]> {
    try {
      const results = await this.db.all(
        `SELECT * FROM tournament_matches 
         WHERE tournament_id = ? 
         ORDER BY round_number ASC, bracket_position ASC, created_at ASC`,
        [tournamentId]
      );

      return results.map(result => this.convertMatchFromDb(result));
    } catch (error) {
      this.handleDatabaseError(error, 'getting tournament matches');
    }
  }

  async getActiveMatches(tournamentId: string): Promise<TournamentMatch[]> {
    try {
      const results = await this.db.all(
        `SELECT * FROM tournament_matches 
         WHERE tournament_id = ? AND status IN ('scheduled', 'in_progress')
         ORDER BY round_number ASC, bracket_position ASC`,
        [tournamentId]
      );

      return results.map(result => this.convertMatchFromDb(result));
    } catch (error) {
      this.handleDatabaseError(error, 'getting active matches');
    }
  }

  async updateMatchStatus(matchId: string, status: MatchStatus, gameSessionId?: string): Promise<void> {
    try {
      const updateData: any = { status };
      
      if (status === MatchStatus.IN_PROGRESS) {
        updateData.start_time = new Date().toISOString();
        if (gameSessionId) {
          updateData.game_session_id = gameSessionId;
        }
      } else if (status === MatchStatus.COMPLETED) {
        updateData.end_time = new Date().toISOString();
      }

      const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updateData);

      await this.db.run(
        `UPDATE tournament_matches SET ${setClause} WHERE id = ?`,
        [...values, matchId]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'updating match status');
    }
  }

  async createMatchResult(result: MatchResult): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        // Insert match result
        await this.db.run(
          `INSERT INTO tournament_match_results (
            match_id, player1_id, player2_id, winner_id, loser_id,
            player1_score, player2_score, game_session_id, total_rounds,
            player1_cooperations, player1_betrayals, player2_cooperations, player2_betrayals,
            match_duration, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            result.matchId,
            result.player1Id,
            result.player2Id,
            result.winnerId,
            result.loserId,
            result.player1Score,
            result.player2Score,
            result.gameSessionId,
            result.statistics.totalRounds,
            result.statistics.player1Cooperations,
            result.statistics.player1Betrayals,
            result.statistics.player2Cooperations,
            result.statistics.player2Betrayals,
            result.statistics.matchDuration,
            result.completedAt.toISOString()
          ]
        );

        // Update match status to completed
        await this.updateMatchStatus(result.matchId, MatchStatus.COMPLETED);
      });
    } catch (error) {
      this.handleDatabaseError(error, 'creating match result');
    }
  }

  async getMatchResult(matchId: string): Promise<MatchResult | null> {
    try {
      const result = await this.db.get(
        `SELECT * FROM tournament_match_results WHERE match_id = ?`,
        [matchId]
      );

      if (!result) {
        return null;
      }

      return this.convertDateFields(
        {
          matchId: result.match_id,
          player1Id: result.player1_id,
          player2Id: result.player2_id,
          winnerId: result.winner_id,
          loserId: result.loser_id,
          player1Score: result.player1_score,
          player2Score: result.player2_score,
          gameSessionId: result.game_session_id,
          statistics: {
            totalRounds: result.total_rounds,
            player1Cooperations: result.player1_cooperations,
            player1Betrayals: result.player1_betrayals,
            player2Cooperations: result.player2_cooperations,
            player2Betrayals: result.player2_betrayals,
            matchDuration: result.match_duration
          },
          completedAt: result.completed_at
        },
        ['completedAt']
      );
    } catch (error) {
      this.handleDatabaseError(error, 'getting match result');
    }
  }

  async getPlayerMatches(tournamentId: string, playerId: string): Promise<TournamentMatch[]> {
    try {
      const results = await this.db.all(
        `SELECT * FROM tournament_matches 
         WHERE tournament_id = ? AND (player1_id = ? OR player2_id = ?)
         ORDER BY round_number ASC, created_at ASC`,
        [tournamentId, playerId, playerId]
      );

      return results.map(result => this.convertMatchFromDb(result));
    } catch (error) {
      this.handleDatabaseError(error, 'getting player matches');
    }
  }

  async getPlayerMatchResults(tournamentId: string, playerId: string): Promise<MatchResult[]> {
    try {
      const results = await this.db.all(
        `SELECT tmr.* FROM tournament_match_results tmr
         JOIN tournament_matches tm ON tmr.match_id = tm.id
         WHERE tm.tournament_id = ? AND (tmr.player1_id = ? OR tmr.player2_id = ?)
         ORDER BY tmr.completed_at ASC`,
        [tournamentId, playerId, playerId]
      );

      return results.map(result => this.convertDateFields(
        {
          matchId: result.match_id,
          player1Id: result.player1_id,
          player2Id: result.player2_id,
          winnerId: result.winner_id,
          loserId: result.loser_id,
          player1Score: result.player1_score,
          player2Score: result.player2_score,
          gameSessionId: result.game_session_id,
          statistics: {
            totalRounds: result.total_rounds,
            player1Cooperations: result.player1_cooperations,
            player1Betrayals: result.player1_betrayals,
            player2Cooperations: result.player2_cooperations,
            player2Betrayals: result.player2_betrayals,
            matchDuration: result.match_duration
          },
          completedAt: result.completed_at
        },
        ['completedAt']
      ));
    } catch (error) {
      this.handleDatabaseError(error, 'getting player match results');
    }
  }

  async deleteMatchesForTournament(tournamentId: string): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        // Delete match results first
        await this.db.run(
          `DELETE FROM tournament_match_results 
           WHERE match_id IN (SELECT id FROM tournament_matches WHERE tournament_id = ?)`,
          [tournamentId]
        );

        // Delete matches
        await this.db.run(
          `DELETE FROM tournament_matches WHERE tournament_id = ?`,
          [tournamentId]
        );

        // Delete rounds
        await this.db.run(
          `DELETE FROM tournament_rounds WHERE tournament_id = ?`,
          [tournamentId]
        );
      });
    } catch (error) {
      this.handleDatabaseError(error, 'deleting matches for tournament');
    }
  }

  private convertMatchFromDb(row: any): TournamentMatch {
    const match: TournamentMatch = this.convertDateFields(
      {
        id: row.id,
        tournamentId: row.tournament_id,
        roundNumber: row.round_number,
        player1Id: row.player1_id,
        player2Id: row.player2_id,
        status: row.status as MatchStatus,
        startTime: row.start_time,
        endTime: row.end_time,
        result: undefined // Will be loaded separately if needed
      },
      ['startTime', 'endTime']
    );

    return match;
  }
}

export default TournamentMatchRepository;