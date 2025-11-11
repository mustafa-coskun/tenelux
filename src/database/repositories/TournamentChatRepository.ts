import { BaseRepository } from '../BaseRepository';
import { ChatMessage, ChatMessageType } from '../../types/party';

export class TournamentChatRepository extends BaseRepository {
    async createChatMessage(
        message: Omit<ChatMessage, 'id'>,
        tournamentId?: string
    ): Promise<ChatMessage> {
        try {
            const messageId = this.generateId();

            await this.db.run(
                `INSERT INTO tournament_chat_messages (
          id, lobby_id, tournament_id, sender_id, message, message_type, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    messageId,
                    message.lobbyId,
                    tournamentId || null,
                    message.senderId,
                    message.message,
                    message.type,
                    message.timestamp.toISOString()
                ]
            );

            return {
                id: messageId,
                ...message
            };
        } catch (error) {
            this.handleDatabaseError(error, 'creating chat message');
        }
    }

    async getLobbyMessages(
        lobbyId: string,
        limit: number = 100,
        offset: number = 0
    ): Promise<ChatMessage[]> {
        try {
            const results = await this.db.all(
                `SELECT tcm.*, p.name as sender_name
         FROM tournament_chat_messages tcm
         JOIN players p ON tcm.sender_id = p.id
         WHERE tcm.lobby_id = ?
         ORDER BY tcm.timestamp DESC
         LIMIT ? OFFSET ?`,
                [lobbyId, limit, offset]
            );

            return results.map(row => this.convertDateFields(
                {
                    id: row.id,
                    lobbyId: row.lobby_id,
                    tournamentId: row.tournament_id,
                    senderId: row.sender_id,
                    senderName: row.sender_name,
                    message: row.message,
                    type: row.message_type as ChatMessageType,
                    timestamp: row.timestamp
                },
                ['timestamp']
            )).reverse(); // Reverse to get chronological order
        } catch (error) {
            this.handleDatabaseError(error, 'getting lobby messages');
        }
    }

    async getTournamentMessages(
        tournamentId: string,
        limit: number = 100,
        offset: number = 0
    ): Promise<ChatMessage[]> {
        try {
            const results = await this.db.all(
                `SELECT tcm.*, p.name as sender_name
         FROM tournament_chat_messages tcm
         JOIN players p ON tcm.sender_id = p.id
         WHERE tcm.tournament_id = ?
         ORDER BY tcm.timestamp DESC
         LIMIT ? OFFSET ?`,
                [tournamentId, limit, offset]
            );

            return results.map(row => this.convertDateFields(
                {
                    id: row.id,
                    lobbyId: row.lobby_id,
                    tournamentId: row.tournament_id,
                    senderId: row.sender_id,
                    senderName: row.sender_name,
                    message: row.message,
                    type: row.message_type as ChatMessageType,
                    timestamp: row.timestamp
                },
                ['timestamp']
            )).reverse(); // Reverse to get chronological order
        } catch (error) {
            this.handleDatabaseError(error, 'getting tournament messages');
        }
    }

    async getRecentMessages(
        lobbyId: string,
        since: Date,
        limit: number = 50
    ): Promise<ChatMessage[]> {
        try {
            const results = await this.db.all(
                `SELECT tcm.*, p.name as sender_name
         FROM tournament_chat_messages tcm
         JOIN players p ON tcm.sender_id = p.id
         WHERE tcm.lobby_id = ? AND tcm.timestamp > ?
         ORDER BY tcm.timestamp ASC
         LIMIT ?`,
                [lobbyId, since.toISOString(), limit]
            );

            return results.map(row => this.convertDateFields(
                {
                    id: row.id,
                    lobbyId: row.lobby_id,
                    tournamentId: row.tournament_id,
                    senderId: row.sender_id,
                    senderName: row.sender_name,
                    message: row.message,
                    type: row.message_type as ChatMessageType,
                    timestamp: row.timestamp
                },
                ['timestamp']
            ));
        } catch (error) {
            this.handleDatabaseError(error, 'getting recent messages');
        }
    }

    async createSystemMessage(
        lobbyId: string,
        message: string,
        tournamentId?: string
    ): Promise<ChatMessage> {
        try {
            const systemMessage: Omit<ChatMessage, 'id'> = {
                lobbyId,
                senderId: 'system',
                senderName: 'System',
                message,
                type: ChatMessageType.SYSTEM_MESSAGE,
                timestamp: new Date()
            };

            return this.createChatMessage(systemMessage, tournamentId);
        } catch (error) {
            this.handleDatabaseError(error, 'creating system message');
        }
    }

    async createTournamentUpdateMessage(
        lobbyId: string,
        tournamentId: string,
        message: string
    ): Promise<ChatMessage> {
        try {
            const updateMessage: Omit<ChatMessage, 'id'> = {
                lobbyId,
                senderId: 'system',
                senderName: 'Tournament',
                message,
                type: ChatMessageType.TOURNAMENT_UPDATE,
                timestamp: new Date()
            };

            return this.createChatMessage(updateMessage, tournamentId);
        } catch (error) {
            this.handleDatabaseError(error, 'creating tournament update message');
        }
    }

    async deleteMessage(messageId: string): Promise<void> {
        try {
            await this.db.run(
                `DELETE FROM tournament_chat_messages WHERE id = ?`,
                [messageId]
            );
        } catch (error) {
            this.handleDatabaseError(error, 'deleting chat message');
        }
    }

    async deleteMessagesForLobby(lobbyId: string): Promise<void> {
        try {
            await this.db.run(
                `DELETE FROM tournament_chat_messages WHERE lobby_id = ?`,
                [lobbyId]
            );
        } catch (error) {
            this.handleDatabaseError(error, 'deleting messages for lobby');
        }
    }

    async deleteMessagesForTournament(tournamentId: string): Promise<void> {
        try {
            await this.db.run(
                `DELETE FROM tournament_chat_messages WHERE tournament_id = ?`,
                [tournamentId]
            );
        } catch (error) {
            this.handleDatabaseError(error, 'deleting messages for tournament');
        }
    }

    async getMessageCount(lobbyId: string, tournamentId?: string): Promise<number> {
        try {
            let sql = `SELECT COUNT(*) as count FROM tournament_chat_messages WHERE lobby_id = ?`;
            const params: any[] = [lobbyId];

            if (tournamentId) {
                sql += ` AND tournament_id = ?`;
                params.push(tournamentId);
            }

            const result = await this.db.get<{ count: number }>(sql, params);
            return result?.count || 0;
        } catch (error) {
            this.handleDatabaseError(error, 'getting message count');
        }
    }

    async getPlayerMessageCount(lobbyId: string, playerId: string): Promise<number> {
        try {
            const result = await this.db.get<{ count: number }>(
                `SELECT COUNT(*) as count FROM tournament_chat_messages 
         WHERE lobby_id = ? AND sender_id = ? AND message_type = 'player_message'`,
                [lobbyId, playerId]
            );
            return result?.count || 0;
        } catch (error) {
            this.handleDatabaseError(error, 'getting player message count');
        }
    }

    async cleanupOldMessages(daysOld: number = 30): Promise<number> {
        try {
            const result = await this.db.run(
                `DELETE FROM tournament_chat_messages 
         WHERE timestamp < datetime('now', '-${daysOld} days')`
            );

            return result.changes || 0;
        } catch (error) {
            this.handleDatabaseError(error, 'cleaning up old messages');
        }
    }

    async searchMessages(
        lobbyId: string,
        searchTerm: string,
        limit: number = 50
    ): Promise<ChatMessage[]> {
        try {
            const results = await this.db.all(
                `SELECT tcm.*, p.name as sender_name
         FROM tournament_chat_messages tcm
         JOIN players p ON tcm.sender_id = p.id
         WHERE tcm.lobby_id = ? AND tcm.message LIKE ?
         ORDER BY tcm.timestamp DESC
         LIMIT ?`,
                [lobbyId, `%${searchTerm}%`, limit]
            );

            return results.map(row => this.convertDateFields(
                {
                    id: row.id,
                    lobbyId: row.lobby_id,
                    tournamentId: row.tournament_id,
                    senderId: row.sender_id,
                    senderName: row.sender_name,
                    message: row.message,
                    type: row.message_type as ChatMessageType,
                    timestamp: row.timestamp
                },
                ['timestamp']
            ));
        } catch (error) {
            this.handleDatabaseError(error, 'searching messages');
        }
    }
}

export default TournamentChatRepository;