import { BaseRepository, RecordNotFoundError } from '../BaseRepository';
import { Player, PlayerStatistics } from '../../types';

interface PlayerRow {
  id: string;
  name: string;
  is_ai: number;
  trust_score: number;
  total_games_played: number;
  created_at: string;
}

export class PlayerRepository extends BaseRepository {
  async create(player: Omit<Player, 'id' | 'createdAt'>): Promise<Player> {
    try {
      const id = this.generateId();
      const createdAt = new Date();

      await this.db.run(
        `INSERT INTO players (id, name, is_ai, trust_score, total_games_played, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          player.name,
          player.isAI ? 1 : 0,
          player.trustScore,
          player.totalGamesPlayed,
          createdAt.toISOString(),
        ]
      );

      return {
        id,
        name: player.name,
        isAI: player.isAI,
        trustScore: player.trustScore,
        totalGamesPlayed: player.totalGamesPlayed,
        createdAt,
      };
    } catch (error) {
      this.handleDatabaseError(error, 'creating player');
    }
  }

  async findById(id: string): Promise<Player | null> {
    try {
      const row = await this.db.get<PlayerRow>(
        'SELECT * FROM players WHERE id = ?',
        [id]
      );

      if (!row) {
        return null;
      }

      return this.mapRowToPlayer(row);
    } catch (error) {
      this.handleDatabaseError(error, 'finding player by id');
    }
  }

  async findByName(name: string): Promise<Player | null> {
    try {
      const row = await this.db.get<PlayerRow>(
        'SELECT * FROM players WHERE name = ?',
        [name]
      );

      if (!row) {
        return null;
      }

      return this.mapRowToPlayer(row);
    } catch (error) {
      this.handleDatabaseError(error, 'finding player by name');
    }
  }

  async update(
    id: string,
    updates: Partial<Omit<Player, 'id' | 'createdAt'>>
  ): Promise<Player> {
    try {
      const exists = await this.exists('players', id);
      if (!exists) {
        throw new RecordNotFoundError('players', id);
      }

      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (updates.name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(updates.name);
      }
      if (updates.isAI !== undefined) {
        updateFields.push('is_ai = ?');
        updateValues.push(updates.isAI ? 1 : 0);
      }
      if (updates.trustScore !== undefined) {
        updateFields.push('trust_score = ?');
        updateValues.push(updates.trustScore);
      }
      if (updates.totalGamesPlayed !== undefined) {
        updateFields.push('total_games_played = ?');
        updateValues.push(updates.totalGamesPlayed);
      }

      if (updateFields.length === 0) {
        // No updates to perform, return current player
        return (await this.findById(id))!;
      }

      updateValues.push(id);

      await this.db.run(
        `UPDATE players SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      return (await this.findById(id))!;
    } catch (error) {
      this.handleDatabaseError(error, 'updating player');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.run('DELETE FROM players WHERE id = ?', [
        id,
      ]);

      return result.changes > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'deleting player');
    }
  }

  async findAll(limit?: number, offset?: number): Promise<Player[]> {
    try {
      let sql = 'SELECT * FROM players ORDER BY created_at DESC';
      const params: any[] = [];

      if (limit !== undefined) {
        sql += ' LIMIT ?';
        params.push(limit);

        if (offset !== undefined) {
          sql += ' OFFSET ?';
          params.push(offset);
        }
      }

      const rows = await this.db.all<PlayerRow>(sql, params);
      return rows.map((row) => this.mapRowToPlayer(row));
    } catch (error) {
      this.handleDatabaseError(error, 'finding all players');
    }
  }

  async findTopByTrustScore(limit: number = 10): Promise<Player[]> {
    try {
      const rows = await this.db.all<PlayerRow>(
        'SELECT * FROM players ORDER BY trust_score DESC LIMIT ?',
        [limit]
      );

      return rows.map((row) => this.mapRowToPlayer(row));
    } catch (error) {
      this.handleDatabaseError(error, 'finding top players by trust score');
    }
  }

  async updateTrustScore(id: string, newTrustScore: number): Promise<void> {
    try {
      const exists = await this.exists('players', id);
      if (!exists) {
        throw new RecordNotFoundError('players', id);
      }

      await this.db.run('UPDATE players SET trust_score = ? WHERE id = ?', [
        newTrustScore,
        id,
      ]);
    } catch (error) {
      this.handleDatabaseError(error, 'updating trust score');
    }
  }

  async incrementGamesPlayed(id: string): Promise<void> {
    try {
      const exists = await this.exists('players', id);
      if (!exists) {
        throw new RecordNotFoundError('players', id);
      }

      await this.db.run(
        'UPDATE players SET total_games_played = total_games_played + 1 WHERE id = ?',
        [id]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'incrementing games played');
    }
  }

  private mapRowToPlayer(row: PlayerRow): Player {
    return {
      id: row.id,
      name: row.name,
      isAI: Boolean(row.is_ai),
      trustScore: row.trust_score,
      totalGamesPlayed: row.total_games_played,
      createdAt: new Date(row.created_at),
    };
  }
}

export default PlayerRepository;
