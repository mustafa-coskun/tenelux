import { BaseRepository, RecordNotFoundError } from '../BaseRepository';
import {
  PartyLobby,
  PartySettings,
  LobbyStatus,
  TournamentFormat,
  TournamentPlayer,
  PlayerStatus
} from '../../types/party';

export class PartyLobbyRepository extends BaseRepository {
  async createLobby(lobby: Omit<PartyLobby, 'id'>): Promise<PartyLobby> {
    try {
      const id = this.generateId();
      const lobbyData = {
        id,
        ...lobby,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await this.executeWithTransaction(async () => {
        // Insert lobby
        await this.db.run(
          `INSERT INTO party_lobbies (
            id, code, host_player_id, max_players, current_player_count, 
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            lobbyData.id,
            lobbyData.code,
            lobbyData.hostPlayerId,
            lobbyData.maxPlayers,
            lobbyData.currentPlayerCount,
            lobbyData.status,
            lobbyData.created_at,
            lobbyData.updated_at
          ]
        );

        // Insert lobby settings
        await this.db.run(
          `INSERT INTO party_lobby_settings (
            lobby_id, round_count, tournament_format, allow_spectators, 
            chat_enabled, auto_start_when_full
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            lobbyData.id,
            lobby.settings.roundCount,
            lobby.settings.tournamentFormat,
            lobby.settings.allowSpectators ? 1 : 0,
            lobby.settings.chatEnabled ? 1 : 0,
            lobby.settings.autoStartWhenFull ? 1 : 0
          ]
        );
      });

      return this.getLobbyById(id);
    } catch (error) {
      this.handleDatabaseError(error, 'creating party lobby');
    }
  }

  async getLobbyById(id: string): Promise<PartyLobby> {
    try {
      const lobbyResult = await this.db.get(
        `SELECT * FROM party_lobbies WHERE id = ?`,
        [id]
      );

      if (!lobbyResult) {
        throw new RecordNotFoundError('party_lobbies', id);
      }

      const settingsResult = await this.db.get(
        `SELECT * FROM party_lobby_settings WHERE lobby_id = ?`,
        [id]
      );

      const participants = await this.getLobbyParticipants(id);

      return this.convertLobbyFromDb(lobbyResult, settingsResult, participants);
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        throw error;
      }
      this.handleDatabaseError(error, 'getting lobby by id');
    }
  }

  async getLobbyByCode(code: string): Promise<PartyLobby | null> {
    try {
      const lobbyResult = await this.db.get(
        `SELECT * FROM party_lobbies WHERE code = ?`,
        [code]
      );

      if (!lobbyResult) {
        return null;
      }

      const settingsResult = await this.db.get(
        `SELECT * FROM party_lobby_settings WHERE lobby_id = ?`,
        [lobbyResult.id]
      );

      const participants = await this.getLobbyParticipants(lobbyResult.id);

      return this.convertLobbyFromDb(lobbyResult, settingsResult, participants);
    } catch (error) {
      this.handleDatabaseError(error, 'getting lobby by code');
    }
  }

  async updateLobbyStatus(id: string, status: LobbyStatus): Promise<void> {
    try {
      await this.db.run(
        `UPDATE party_lobbies 
         SET status = ?, updated_at = ? 
         WHERE id = ?`,
        [status, new Date().toISOString(), id]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'updating lobby status');
    }
  }

  async updateLobbySettings(id: string, settings: Partial<PartySettings>): Promise<void> {
    try {
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (settings.roundCount !== undefined) {
        updateFields.push('round_count = ?');
        updateValues.push(settings.roundCount);
      }
      if (settings.tournamentFormat !== undefined) {
        updateFields.push('tournament_format = ?');
        updateValues.push(settings.tournamentFormat);
      }
      if (settings.allowSpectators !== undefined) {
        updateFields.push('allow_spectators = ?');
        updateValues.push(settings.allowSpectators ? 1 : 0);
      }
      if (settings.chatEnabled !== undefined) {
        updateFields.push('chat_enabled = ?');
        updateValues.push(settings.chatEnabled ? 1 : 0);
      }
      if (settings.autoStartWhenFull !== undefined) {
        updateFields.push('auto_start_when_full = ?');
        updateValues.push(settings.autoStartWhenFull ? 1 : 0);
      }

      if (updateFields.length > 0) {
        await this.executeWithTransaction(async () => {
          await this.db.run(
            `UPDATE party_lobby_settings SET ${updateFields.join(', ')} WHERE lobby_id = ?`,
            [...updateValues, id]
          );

          await this.db.run(
            `UPDATE party_lobbies SET updated_at = ? WHERE id = ?`,
            [new Date().toISOString(), id]
          );
        });
      }
    } catch (error) {
      this.handleDatabaseError(error, 'updating lobby settings');
    }
  }

  async addParticipant(lobbyId: string, player: TournamentPlayer): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        // Add participant
        await this.db.run(
          `INSERT INTO party_lobby_participants (
            lobby_id, player_id, is_host, status, joined_at
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            lobbyId,
            player.id,
            player.isHost ? 1 : 0,
            player.status,
            player.joinedAt.toISOString()
          ]
        );

        // Update participant count
        await this.db.run(
          `UPDATE party_lobbies 
           SET current_player_count = current_player_count + 1, updated_at = ?
           WHERE id = ?`,
          [new Date().toISOString(), lobbyId]
        );
      });
    } catch (error) {
      this.handleDatabaseError(error, 'adding lobby participant');
    }
  }

  async removeParticipant(lobbyId: string, playerId: string): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        // Remove participant
        await this.db.run(
          `DELETE FROM party_lobby_participants 
           WHERE lobby_id = ? AND player_id = ?`,
          [lobbyId, playerId]
        );

        // Update participant count
        await this.db.run(
          `UPDATE party_lobbies 
           SET current_player_count = current_player_count - 1, updated_at = ?
           WHERE id = ?`,
          [new Date().toISOString(), lobbyId]
        );
      });
    } catch (error) {
      this.handleDatabaseError(error, 'removing lobby participant');
    }
  }

  async updateParticipantStatus(lobbyId: string, playerId: string, status: PlayerStatus): Promise<void> {
    try {
      await this.db.run(
        `UPDATE party_lobby_participants 
         SET status = ? 
         WHERE lobby_id = ? AND player_id = ?`,
        [status, lobbyId, playerId]
      );
    } catch (error) {
      this.handleDatabaseError(error, 'updating participant status');
    }
  }

  async transferHost(lobbyId: string, newHostId: string): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        // Remove host status from all participants
        await this.db.run(
          `UPDATE party_lobby_participants 
           SET is_host = 0 
           WHERE lobby_id = ?`,
          [lobbyId]
        );

        // Set new host
        await this.db.run(
          `UPDATE party_lobby_participants 
           SET is_host = 1 
           WHERE lobby_id = ? AND player_id = ?`,
          [lobbyId, newHostId]
        );

        // Update lobby host
        await this.db.run(
          `UPDATE party_lobbies 
           SET host_player_id = ?, updated_at = ? 
           WHERE id = ?`,
          [newHostId, new Date().toISOString(), lobbyId]
        );
      });
    } catch (error) {
      this.handleDatabaseError(error, 'transferring lobby host');
    }
  }

  async getLobbyParticipants(lobbyId: string): Promise<TournamentPlayer[]> {
    try {
      const results = await this.db.all(
        `SELECT plp.*, p.name, p.is_ai 
         FROM party_lobby_participants plp
         JOIN players p ON plp.player_id = p.id
         WHERE plp.lobby_id = ?
         ORDER BY plp.joined_at ASC`,
        [lobbyId]
      );

      return results.map(row => ({
        id: row.player_id,
        name: row.name,
        isHost: Boolean(row.is_host),
        isEliminated: false,
        currentRank: 0,
        statistics: {
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          totalPoints: 0,
          cooperationRate: 0,
          betrayalRate: 0,
          averageMatchScore: 0,
          headToHeadRecord: new Map(),
          tournamentPoints: 0
        },
        status: row.status as PlayerStatus,
        joinedAt: new Date(row.joined_at)
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getting lobby participants');
    }
  }

  async getActiveLobbies(): Promise<PartyLobby[]> {
    try {
      const results = await this.db.all(
        `SELECT * FROM party_lobbies 
         WHERE status IN ('waiting_for_players', 'ready_to_start', 'tournament_in_progress')
         ORDER BY created_at DESC`
      );

      const lobbies: PartyLobby[] = [];
      
      for (const row of results) {
        const settingsResult = await this.db.get(
          `SELECT * FROM party_lobby_settings WHERE lobby_id = ?`,
          [row.id]
        );
        const participants = await this.getLobbyParticipants(row.id);
        
        lobbies.push(this.convertLobbyFromDb(row, settingsResult, participants));
      }

      return lobbies;
    } catch (error) {
      this.handleDatabaseError(error, 'getting active lobbies');
    }
  }

  async deleteLobby(id: string): Promise<void> {
    try {
      await this.executeWithTransaction(async () => {
        // Delete related records first
        await this.db.run(`DELETE FROM tournament_chat_messages WHERE lobby_id = ?`, [id]);
        await this.db.run(`DELETE FROM party_lobby_participants WHERE lobby_id = ?`, [id]);
        await this.db.run(`DELETE FROM party_lobby_settings WHERE lobby_id = ?`, [id]);
        await this.db.run(`DELETE FROM party_lobbies WHERE id = ?`, [id]);
      });
    } catch (error) {
      this.handleDatabaseError(error, 'deleting lobby');
    }
  }

  async isCodeUnique(code: string): Promise<boolean> {
    try {
      const result = await this.db.get(
        `SELECT 1 FROM party_lobbies WHERE code = ? LIMIT 1`,
        [code]
      );
      return !result;
    } catch (error) {
      this.handleDatabaseError(error, 'checking code uniqueness');
    }
  }

  async generateUniqueCode(): Promise<string> {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      if (await this.isCodeUnique(code)) {
        return code;
      }

      attempts++;
    }

    throw new Error('Unable to generate unique lobby code after maximum attempts');
  }

  private convertLobbyFromDb(
    lobbyRow: any, 
    settingsRow: any, 
    participants: TournamentPlayer[]
  ): PartyLobby {
    return this.convertDateFields(
      {
        id: lobbyRow.id,
        code: lobbyRow.code,
        hostPlayerId: lobbyRow.host_player_id,
        participants,
        settings: {
          maxPlayers: lobbyRow.max_players,
          roundCount: settingsRow.round_count,
          tournamentFormat: settingsRow.tournament_format as TournamentFormat,
          allowSpectators: Boolean(settingsRow.allow_spectators),
          chatEnabled: Boolean(settingsRow.chat_enabled),
          autoStartWhenFull: Boolean(settingsRow.auto_start_when_full)
        },
        status: lobbyRow.status as LobbyStatus,
        createdAt: lobbyRow.created_at,
        maxPlayers: lobbyRow.max_players,
        currentPlayerCount: lobbyRow.current_player_count
      },
      ['createdAt']
    );
  }
}

export default PartyLobbyRepository;