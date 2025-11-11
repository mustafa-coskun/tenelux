import { BaseRepository, RecordNotFoundError } from '../BaseRepository';
import {
  GameSession,
  Player,
  SessionConfig,
  GamePhase,
  GameMode,
  AIStrategy,
} from '../../types';

interface GameSessionRow {
  id: string;
  current_phase: string;
  start_time: string;
  end_time: string | null;
  winner_id: string | null;
  max_rounds: number;
  trust_phase_rounds: number;
  communication_time_limit: number;
  allow_decision_reversal: number;
  game_mode: string;
  ai_strategy: string | null;
  created_at: string;
}

export class GameSessionRepository extends BaseRepository {
  async create(
    sessionConfig: SessionConfig,
    players: Player[]
  ): Promise<GameSession> {
    try {
      return await this.executeWithTransaction(async () => {
        const id = this.generateId();
        const startTime = new Date();

        // Insert game session
        await this.db.run(
          `INSERT INTO game_sessions (
            id, current_phase, start_time, max_rounds, trust_phase_rounds,
            communication_time_limit, allow_decision_reversal, game_mode, ai_strategy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            GamePhase.TRUST_PHASE,
            startTime.toISOString(),
            sessionConfig.maxRounds,
            sessionConfig.trustPhaseRounds,
            sessionConfig.communicationTimeLimit,
            sessionConfig.allowDecisionReversal ? 1 : 0,
            sessionConfig.gameMode,
            sessionConfig.aiStrategy || null,
          ]
        );

        // Insert session players
        for (const player of players) {
          await this.db.run(
            'INSERT INTO session_players (session_id, player_id) VALUES (?, ?)',
            [id, player.id]
          );
        }

        return {
          id,
          players,
          rounds: [],
          currentPhase: GamePhase.TRUST_PHASE,
          startTime,
          sessionConfig,
        };
      });
    } catch (error) {
      this.handleDatabaseError(error, 'creating game session');
    }
  }

  async findById(id: string): Promise<GameSession | null> {
    try {
      const sessionRow = await this.db.get<GameSessionRow>(
        'SELECT * FROM game_sessions WHERE id = ?',
        [id]
      );

      if (!sessionRow) {
        return null;
      }

      // Get session players
      const playerRows = await this.db.all<{
        id: string;
        name: string;
        is_ai: number;
        trust_score: number;
        total_games_played: number;
        created_at: string;
      }>(
        `SELECT p.* FROM players p 
         JOIN session_players sp ON p.id = sp.player_id 
         WHERE sp.session_id = ?`,
        [id]
      );

      const players: Player[] = playerRows.map((row) => ({
        id: row.id,
        name: row.name,
        isAI: Boolean(row.is_ai),
        trustScore: row.trust_score,
        totalGamesPlayed: row.total_games_played,
        createdAt: new Date(row.created_at),
      }));

      // Get rounds (will be implemented in RoundRepository)
      const rounds: any[] = []; // TODO: Load rounds from RoundRepository

      return this.mapRowToGameSession(sessionRow, players, rounds);
    } catch (error) {
      this.handleDatabaseError(error, 'finding game session by id');
    }
  }

  async updatePhase(id: string, phase: GamePhase): Promise<void> {
    try {
      const exists = await this.exists('game_sessions', id);
      if (!exists) {
        throw new RecordNotFoundError('game_sessions', id);
      }

      await this.db.run(
        'UPDATE game_sessions SET current_phase = ? WHERE id = ?',
        [phase, id]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'updating game session phase');
    }
  }

  async endSession(id: string, winnerId?: string): Promise<void> {
    try {
      const exists = await this.exists('game_sessions', id);
      if (!exists) {
        throw new RecordNotFoundError('game_sessions', id);
      }

      const endTime = new Date();

      await this.db.run(
        'UPDATE game_sessions SET end_time = ?, winner_id = ? WHERE id = ?',
        [endTime.toISOString(), winnerId || null, id]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'ending game session');
    }
  }

  async findActiveSessionsForPlayer(playerId: string): Promise<GameSession[]> {
    try {
      const sessionRows = await this.db.all<GameSessionRow>(
        `SELECT gs.* FROM game_sessions gs
         JOIN session_players sp ON gs.id = sp.session_id
         WHERE sp.player_id = ? AND gs.end_time IS NULL
         ORDER BY gs.start_time DESC`,
        [playerId]
      );

      const sessions: GameSession[] = [];
      for (const row of sessionRows) {
        const session = await this.findById(row.id);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      this.handleDatabaseError(error, 'finding active sessions for player');
    }
  }

  async findCompletedSessionsForPlayer(
    playerId: string,
    limit?: number
  ): Promise<GameSession[]> {
    try {
      let sql = `SELECT gs.* FROM game_sessions gs
                 JOIN session_players sp ON gs.id = sp.session_id
                 WHERE sp.player_id = ? AND gs.end_time IS NOT NULL
                 ORDER BY gs.end_time DESC`;

      const params: any[] = [playerId];

      if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      const sessionRows = await this.db.all<GameSessionRow>(sql, params);

      const sessions: GameSession[] = [];
      for (const row of sessionRows) {
        const session = await this.findById(row.id);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      this.handleDatabaseError(error, 'finding completed sessions for player');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.run(
        'DELETE FROM game_sessions WHERE id = ?',
        [id]
      );

      return result.changes > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'deleting game session');
    }
  }

  private mapRowToGameSession(
    row: GameSessionRow,
    players: Player[],
    rounds: any[]
  ): GameSession {
    const sessionConfig: SessionConfig = {
      maxRounds: row.max_rounds,
      trustPhaseRounds: row.trust_phase_rounds,
      communicationTimeLimit: row.communication_time_limit,
      allowDecisionReversal: Boolean(row.allow_decision_reversal),
      gameMode: row.game_mode as GameMode,
      aiStrategy: row.ai_strategy as AIStrategy | undefined,
    };

    const session = {
      id: row.id,
      players,
      rounds,
      currentPhase: row.current_phase as GamePhase,
      startTime: row.start_time,
      endTime: row.end_time,
      winner: row.winner_id
        ? players.find((p) => p.id === row.winner_id)
        : undefined,
      sessionConfig,
    };

    return {
      ...session,
      startTime: new Date(session.startTime),
      endTime: session.endTime ? new Date(session.endTime) : null,
    } as GameSession;
  }
}

export default GameSessionRepository;
