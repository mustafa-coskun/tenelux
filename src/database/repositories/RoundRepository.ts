import { BaseRepository, RecordNotFoundError } from '../BaseRepository';
import {
  Round,
  PlayerDecision,
  PayoffResult,
  GamePhase,
  Decision,
} from '../../types';

interface RoundRow {
  id: string;
  session_id: string;
  round_number: number;
  phase_type: string;
  player_a_score: number;
  player_b_score: number;
  timestamp: string;
}

interface PlayerDecisionRow {
  id: string;
  round_id: string;
  player_id: string;
  decision: string;
  can_reverse: number;
  timestamp: string;
}

export class RoundRepository extends BaseRepository {
  async create(
    sessionId: string,
    roundNumber: number,
    phaseType: GamePhase,
    decisions: PlayerDecision[],
    payoffResult: PayoffResult
  ): Promise<Round> {
    try {
      return await this.executeWithTransaction(async () => {
        const roundId = this.generateId();
        const timestamp = new Date();

        // Insert round
        await this.db.run(
          `INSERT INTO rounds (
            id, session_id, round_number, phase_type, 
            player_a_score, player_b_score, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            roundId,
            sessionId,
            roundNumber,
            phaseType,
            payoffResult.playerA,
            payoffResult.playerB,
            timestamp.toISOString(),
          ]
        );

        // Insert player decisions
        for (const decision of decisions) {
          await this.db.run(
            `INSERT INTO player_decisions (
              id, round_id, player_id, decision, can_reverse, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              this.generateId(),
              roundId,
              decision.playerId,
              decision.decision,
              decision.canReverse ? 1 : 0,
              decision.timestamp.toISOString(),
            ]
          );
        }

        return {
          roundNumber,
          decisions,
          results: payoffResult,
          timestamp,
          phaseType,
        };
      });
    } catch (error) {
      this.handleDatabaseError(error, 'creating round');
    }
  }

  async findBySessionId(sessionId: string): Promise<Round[]> {
    try {
      const roundRows = await this.db.all<RoundRow>(
        'SELECT * FROM rounds WHERE session_id = ? ORDER BY round_number ASC',
        [sessionId]
      );

      const rounds: Round[] = [];

      for (const roundRow of roundRows) {
        const decisionRows = await this.db.all<PlayerDecisionRow>(
          'SELECT * FROM player_decisions WHERE round_id = ? ORDER BY timestamp ASC',
          [roundRow.id]
        );

        const decisions: PlayerDecision[] = decisionRows.map((row) => ({
          playerId: row.player_id,
          decision: row.decision as Decision,
          timestamp: new Date(row.timestamp),
          canReverse: Boolean(row.can_reverse),
        }));

        const round: Round = {
          roundNumber: roundRow.round_number,
          decisions,
          results: {
            playerA: roundRow.player_a_score,
            playerB: roundRow.player_b_score,
          },
          timestamp: new Date(roundRow.timestamp),
          phaseType: roundRow.phase_type as GamePhase,
        };

        rounds.push(round);
      }

      return rounds;
    } catch (error) {
      this.handleDatabaseError(error, 'finding rounds by session id');
    }
  }

  async findById(roundId: string): Promise<Round | null> {
    try {
      const roundRow = await this.db.get<RoundRow>(
        'SELECT * FROM rounds WHERE id = ?',
        [roundId]
      );

      if (!roundRow) {
        return null;
      }

      const decisionRows = await this.db.all<PlayerDecisionRow>(
        'SELECT * FROM player_decisions WHERE round_id = ? ORDER BY timestamp ASC',
        [roundId]
      );

      const decisions: PlayerDecision[] = decisionRows.map((row) => ({
        playerId: row.player_id,
        decision: row.decision as Decision,
        timestamp: new Date(row.timestamp),
        canReverse: Boolean(row.can_reverse),
      }));

      return {
        roundNumber: roundRow.round_number,
        decisions,
        results: {
          playerA: roundRow.player_a_score,
          playerB: roundRow.player_b_score,
        },
        timestamp: new Date(roundRow.timestamp),
        phaseType: roundRow.phase_type as GamePhase,
      };
    } catch (error) {
      this.handleDatabaseError(error, 'finding round by id');
    }
  }

  async updateDecision(
    roundId: string,
    playerId: string,
    newDecision: Decision
  ): Promise<void> {
    try {
      const result = await this.db.run(
        'UPDATE player_decisions SET decision = ? WHERE round_id = ? AND player_id = ?',
        [newDecision, roundId, playerId]
      );

      if (result.changes === 0) {
        throw new RecordNotFoundError(
          'player_decisions',
          `${roundId}-${playerId}`
        );
      }
    } catch (error) {
      this.handleDatabaseError(error, 'updating player decision');
    }
  }

  async getPlayerDecisionHistory(
    playerId: string,
    limit?: number
  ): Promise<PlayerDecision[]> {
    try {
      let sql = `SELECT pd.* FROM player_decisions pd
                 JOIN rounds r ON pd.round_id = r.id
                 WHERE pd.player_id = ?
                 ORDER BY r.timestamp DESC`;

      const params: any[] = [playerId];

      if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      const rows = await this.db.all<PlayerDecisionRow>(sql, params);

      return rows.map((row) => ({
        playerId: row.player_id,
        decision: row.decision as Decision,
        timestamp: new Date(row.timestamp),
        canReverse: Boolean(row.can_reverse),
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getting player decision history');
    }
  }

  async getCooperationStats(
    playerId: string
  ): Promise<{ total: number; cooperated: number }> {
    try {
      const totalResult = await this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM player_decisions WHERE player_id = ?',
        [playerId]
      );

      const cooperatedResult = await this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM player_decisions WHERE player_id = ? AND decision = ?',
        [playerId, Decision.STAY_SILENT]
      );

      return {
        total: totalResult?.count || 0,
        cooperated: cooperatedResult?.count || 0,
      };
    } catch (error) {
      this.handleDatabaseError(error, 'getting cooperation stats');
    }
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    try {
      // First delete player decisions for all rounds in the session
      await this.db.run(
        `DELETE FROM player_decisions 
         WHERE round_id IN (SELECT id FROM rounds WHERE session_id = ?)`,
        [sessionId]
      );

      // Then delete the rounds
      const result = await this.db.run(
        'DELETE FROM rounds WHERE session_id = ?',
        [sessionId]
      );

      return result.changes;
    } catch (error) {
      this.handleDatabaseError(error, 'deleting rounds by session id');
    }
  }
}

export default RoundRepository;
