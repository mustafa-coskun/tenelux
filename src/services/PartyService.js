// Party Service - Core party management functionality
// Implements Requirements 6.1, 6.2, 6.3, 6.4, 6.5

const crypto = require('crypto');

// Generate UUID v4 using crypto module
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

class PartyService {
  constructor(dbManager) {
    this.dbManager = dbManager;
    this.activeParties = new Map(); // In-memory cache for active parties
    this.partyCodeToId = new Map(); // Quick lookup for party codes
    this.playerToParty = new Map(); // Track which party each player is in
  }

  /**
   * Create a new party with host controls
   * Requirement 6.1: Party creation with host controls
   */
  async createParty(hostUserId, settings) {
    const adapter = this.dbManager.getAdapter();
    
    // Validate host user exists
    const hostUser = await adapter.findOne('users', { id: hostUserId });
    if (!hostUser) {
      throw new Error('Host user not found');
    }

    // Check if host is already in a party
    if (this.playerToParty.has(hostUserId)) {
      throw new Error('Host is already in a party');
    }

    // Generate unique party ID and code
    const partyId = uuidv4();
    const partyCode = this.generatePartyCode();
    
    // Validate settings
    const validatedSettings = this.validatePartySettings(settings);

    try {
      // Create party lobby in database
      await adapter.create('party_lobbies', {
        id: partyId,
        code: partyCode,
        host_player_id: hostUserId,
        max_players: validatedSettings.maxPlayers,
        current_player_count: 1,
        status: 'waiting_for_players',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // Create party settings
      await adapter.create('party_lobby_settings', {
        lobby_id: partyId,
        round_count: validatedSettings.roundCount,
        tournament_format: validatedSettings.tournamentFormat,
        allow_spectators: validatedSettings.allowSpectators ? 1 : 0,
        chat_enabled: validatedSettings.chatEnabled ? 1 : 0,
        auto_start_when_full: validatedSettings.autoStartWhenFull ? 1 : 0
      });

      // Add host as first participant
      await adapter.create('party_lobby_participants', {
        lobby_id: partyId,
        player_id: hostUserId,
        is_host: 1,
        status: 'ready',
        joined_at: new Date().toISOString()
      });

      // Create party object for in-memory cache
      const party = {
        id: partyId,
        code: partyCode,
        hostPlayerId: hostUserId,
        settings: validatedSettings,
        participants: [{
          id: hostUserId,
          name: hostUser.display_name || hostUser.username,
          avatar: hostUser.avatar || '👤',
          isHost: true,
          status: 'ready',
          joinedAt: new Date()
        }],
        status: 'waiting_for_players',
        maxPlayers: validatedSettings.maxPlayers,
        currentPlayerCount: 1,
        createdAt: new Date()
      };

      // Cache the party
      this.activeParties.set(partyId, party);
      this.partyCodeToId.set(partyCode, partyId);
      this.playerToParty.set(hostUserId, partyId);

      return party;
    } catch (error) {
      // Cleanup on error
      await this.cleanupFailedPartyCreation(partyId, partyCode, hostUserId);
      throw new Error(`Failed to create party: ${error.message}`);
    }
  }

  /**
   * Join an existing party
   * Requirement 6.2: Party joining logic with validation
   */
  async joinParty(userId, partyCode) {
    const adapter = this.dbManager.getAdapter();
    
    // Validate user exists
    const user = await adapter.findOne('users', { id: userId });
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user is already in a party
    if (this.playerToParty.has(userId)) {
      throw new Error('User is already in a party');
    }

    // Find party by code
    const partyId = this.partyCodeToId.get(partyCode.toUpperCase());
    if (!partyId) {
      // Try to load from database if not in cache
      const partyLobby = await adapter.findOne('party_lobbies', { code: partyCode.toUpperCase() });
      if (!partyLobby) {
        throw new Error('Party not found');
      }
      await this.loadPartyFromDatabase(partyLobby.id);
    }

    const party = this.activeParties.get(partyId || this.partyCodeToId.get(partyCode.toUpperCase()));
    if (!party) {
      throw new Error('Party not found');
    }

    // Validate party capacity
    if (party.currentPlayerCount >= party.maxPlayers) {
      throw new Error('Party is full');
    }

    // Check party status
    if (party.status === 'tournament_in_progress') {
      throw new Error('Tournament already in progress');
    }

    if (party.status === 'lobby_closed') {
      throw new Error('Party is closed');
    }

    // Check if user is already in this party
    const existingParticipant = party.participants.find(p => p.id === userId);
    if (existingParticipant) {
      throw new Error('User is already in this party');
    }

    try {
      // Add participant to database
      await adapter.create('party_lobby_participants', {
        lobby_id: party.id,
        player_id: userId,
        is_host: 0,
        status: 'waiting',
        joined_at: new Date().toISOString()
      });

      // Update party player count
      await adapter.update('party_lobbies', { id: party.id }, {
        current_player_count: party.currentPlayerCount + 1,
        updated_at: new Date().toISOString()
      });

      // Add participant to in-memory party
      const newParticipant = {
        id: userId,
        name: user.display_name || user.username,
        avatar: user.avatar || '👤',
        isHost: false,
        status: 'waiting',
        joinedAt: new Date()
      };

      party.participants.push(newParticipant);
      party.currentPlayerCount++;

      // Update party status if ready to start
      if (party.currentPlayerCount >= 4) {
        party.status = 'ready_to_start';
        await adapter.update('party_lobbies', { id: party.id }, {
          status: 'ready_to_start',
          updated_at: new Date().toISOString()
        });
      }

      // Track player in party
      this.playerToParty.set(userId, party.id);

      return party;
    } catch (error) {
      throw new Error(`Failed to join party: ${error.message}`);
    }
  }

  /**
   * Leave a party
   * Requirement 6.2: Party leaving logic with host transfer
   */
  async leaveParty(userId) {
    const partyId = this.playerToParty.get(userId);
    if (!partyId) {
      throw new Error('User is not in a party');
    }

    const party = this.activeParties.get(partyId);
    if (!party) {
      throw new Error('Party not found');
    }

    const adapter = this.dbManager.getAdapter();
    const isHost = party.hostPlayerId === userId;

    try {
      // Remove participant from database
      await adapter.delete('party_lobby_participants', {
        lobby_id: partyId,
        player_id: userId
      });

      // Remove from in-memory party
      const participantIndex = party.participants.findIndex(p => p.id === userId);
      if (participantIndex !== -1) {
        party.participants.splice(participantIndex, 1);
        party.currentPlayerCount--;
      }

      // Remove player tracking
      this.playerToParty.delete(userId);

      // Handle host leaving
      if (isHost) {
        if (party.participants.length > 0) {
          // Transfer host to next participant
          const newHost = party.participants[0];
          newHost.isHost = true;
          party.hostPlayerId = newHost.id;

          // Update database
          await adapter.update('party_lobbies', { id: partyId }, {
            host_player_id: newHost.id,
            current_player_count: party.currentPlayerCount,
            updated_at: new Date().toISOString()
          });

          await adapter.update('party_lobby_participants', 
            { lobby_id: partyId, player_id: newHost.id }, 
            { is_host: 1 }
          );

          return { action: 'host_transferred', newHost, party };
        } else {
          // Close party if no participants left
          await this.closeParty(partyId, userId);
          return { action: 'party_closed' };
        }
      } else {
        // Update party count in database
        await adapter.update('party_lobbies', { id: partyId }, {
          current_player_count: party.currentPlayerCount,
          updated_at: new Date().toISOString()
        });

        // Update party status if needed
        if (party.currentPlayerCount < 4) {
          party.status = 'waiting_for_players';
          await adapter.update('party_lobbies', { id: partyId }, {
            status: 'waiting_for_players',
            updated_at: new Date().toISOString()
          });
        }

        return { action: 'left_party', party };
      }
    } catch (error) {
      throw new Error(`Failed to leave party: ${error.message}`);
    }
  }

  /**
   * Start party game/tournament
   * Requirement 6.3: Party game starting and synchronization
   */
  async startPartyGame(partyId, hostUserId) {
    const party = this.activeParties.get(partyId);
    if (!party) {
      throw new Error('Party not found');
    }

    if (party.hostPlayerId !== hostUserId) {
      throw new Error('Only the host can start the party game');
    }

    if (party.currentPlayerCount < 4) {
      throw new Error('Need at least 4 players to start');
    }

    if (party.status === 'tournament_in_progress') {
      throw new Error('Tournament already in progress');
    }

    const adapter = this.dbManager.getAdapter();

    try {
      // Create tournament
      const tournamentId = uuidv4();
      await adapter.create('tournaments', {
        id: tournamentId,
        lobby_id: partyId,
        format: party.settings.tournamentFormat,
        current_round: 0,
        total_rounds: this.calculateTotalRounds(party.participants.length, party.settings.tournamentFormat),
        status: 'not_started',
        created_at: new Date().toISOString()
      });

      // Add tournament players
      for (const participant of party.participants) {
        await adapter.create('tournament_players', {
          tournament_id: tournamentId,
          player_id: participant.id,
          is_eliminated: 0,
          current_rank: 0,
          tournament_points: 0,
          joined_at: new Date().toISOString()
        });

        // Create initial statistics
        await adapter.create('tournament_player_statistics', {
          id: uuidv4(),
          tournament_id: tournamentId,
          player_id: participant.id,
          matches_played: 0,
          matches_won: 0,
          matches_lost: 0,
          total_points: 0,
          cooperation_rate: 0.0,
          betrayal_rate: 0.0,
          average_match_score: 0.0,
          tournament_points: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      // Update party status
      party.status = 'tournament_in_progress';
      await adapter.update('party_lobbies', { id: partyId }, {
        status: 'tournament_in_progress',
        updated_at: new Date().toISOString()
      });

      // Update participant statuses
      for (const participant of party.participants) {
        participant.status = 'ready';
        await adapter.update('party_lobby_participants', 
          { lobby_id: partyId, player_id: participant.id }, 
          { status: 'ready' }
        );
      }

      // Generate first round matches
      const firstRoundMatches = await this.generateFirstRoundMatches(tournamentId, party.participants, party.settings.tournamentFormat);

      return {
        tournamentId,
        party,
        matches: firstRoundMatches,
        format: party.settings.tournamentFormat,
        totalRounds: this.calculateTotalRounds(party.participants.length, party.settings.tournamentFormat)
      };
    } catch (error) {
      throw new Error(`Failed to start party game: ${error.message}`);
    }
  }

  /**
   * Send chat message in party
   * Requirement 6.5: Party communication tools
   */
  async sendChatMessage(partyId, senderId, message, messageType = 'player_message') {
    const party = this.activeParties.get(partyId);
    if (!party) {
      throw new Error('Party not found');
    }

    // Check if sender is in party
    const sender = party.participants.find(p => p.id === senderId);
    if (!sender && senderId !== 'system') {
      throw new Error('Sender not in party');
    }

    // Check if chat is enabled
    if (!party.settings.chatEnabled && messageType === 'player_message') {
      throw new Error('Chat is disabled in this party');
    }

    // Validate message
    if (!message || message.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }

    if (message.length > 500) {
      throw new Error('Message too long (max 500 characters)');
    }

    const adapter = this.dbManager.getAdapter();

    try {
      // Get tournament ID if exists
      const tournament = await adapter.findOne('tournaments', { lobby_id: partyId });
      const tournamentId = tournament ? tournament.id : null;

      // Create chat message
      const messageId = uuidv4();
      await adapter.create('tournament_chat_messages', {
        id: messageId,
        lobby_id: partyId,
        tournament_id: tournamentId,
        sender_id: senderId,
        message: message.trim(),
        message_type: messageType,
        timestamp: new Date().toISOString()
      });

      const chatMessage = {
        id: messageId,
        lobbyId: partyId,
        tournamentId: tournamentId,
        senderId: senderId,
        senderName: sender ? sender.name : 'System',
        senderAvatar: sender ? sender.avatar : '🤖',
        message: message.trim(),
        messageType: messageType,
        timestamp: new Date()
      };

      return chatMessage;
    } catch (error) {
      throw new Error(`Failed to send chat message: ${error.message}`);
    }
  }

  /**
   * Update player status in party
   * Requirement 6.5: Party member status tracking
   */
  async updatePlayerStatus(partyId, playerId, newStatus) {
    const party = this.activeParties.get(partyId);
    if (!party) {
      throw new Error('Party not found');
    }

    const participant = party.participants.find(p => p.id === playerId);
    if (!participant) {
      throw new Error('Player not in party');
    }

    // Validate status
    const validStatuses = ['waiting', 'ready', 'in_match', 'eliminated', 'spectating', 'disconnected'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error('Invalid player status');
    }

    const adapter = this.dbManager.getAdapter();

    try {
      // Update in database
      await adapter.update('party_lobby_participants', 
        { lobby_id: partyId, player_id: playerId }, 
        { status: newStatus }
      );

      // Update in memory
      participant.status = newStatus;

      // Send system message about status change
      if (newStatus === 'ready') {
        await this.sendChatMessage(partyId, 'system', `${participant.name} is ready!`, 'system_message');
      } else if (newStatus === 'disconnected') {
        await this.sendChatMessage(partyId, 'system', `${participant.name} has disconnected`, 'system_message');
      }

      return participant;
    } catch (error) {
      throw new Error(`Failed to update player status: ${error.message}`);
    }
  }

  /**
   * Get party information
   */
  async getParty(partyId) {
    let party = this.activeParties.get(partyId);
    
    if (!party) {
      // Try to load from database
      party = await this.loadPartyFromDatabase(partyId);
    }

    return party;
  }

  /**
   * Get party by code
   */
  async getPartyByCode(partyCode) {
    const partyId = this.partyCodeToId.get(partyCode.toUpperCase());
    
    if (partyId) {
      return await this.getParty(partyId);
    }

    // Try to load from database
    const adapter = this.dbManager.getAdapter();
    const partyLobby = await adapter.findOne('party_lobbies', { code: partyCode.toUpperCase() });
    
    if (partyLobby) {
      return await this.loadPartyFromDatabase(partyLobby.id);
    }

    return null;
  }

  /**
   * Get user's current party
   */
  async getUserParty(userId) {
    const partyId = this.playerToParty.get(userId);
    if (!partyId) {
      return null;
    }

    return await this.getParty(partyId);
  }

  /**
   * Check if user is in a party
   */
  isUserInParty(userId) {
    return this.playerToParty.has(userId);
  }

  /**
   * Generate unique 6-character party code
   */
  generatePartyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.partyCodeToId.has(code));
    
    return code;
  }

  /**
   * Validate party settings
   */
  validatePartySettings(settings) {
    const validated = {
      maxPlayers: 8,
      roundCount: 10,
      tournamentFormat: 'single_elimination',
      allowSpectators: true,
      chatEnabled: true,
      autoStartWhenFull: false,
      ...settings
    };

    // Validate max players (4-16)
    if (validated.maxPlayers < 4 || validated.maxPlayers > 16) {
      throw new Error('Max players must be between 4 and 16');
    }

    // Validate round count (5-20)
    if (validated.roundCount < 5 || validated.roundCount > 20) {
      throw new Error('Round count must be between 5 and 20');
    }

    // Validate tournament format
    const validFormats = ['single_elimination', 'double_elimination', 'round_robin'];
    if (!validFormats.includes(validated.tournamentFormat)) {
      throw new Error('Invalid tournament format');
    }

    return validated;
  }

  /**
   * Calculate total rounds needed for tournament format
   */
  calculateTotalRounds(playerCount, format) {
    switch (format) {
      case 'single_elimination':
        return Math.ceil(Math.log2(playerCount));
      case 'double_elimination':
        return Math.ceil(Math.log2(playerCount)) * 2;
      case 'round_robin':
        return playerCount - 1;
      default:
        return Math.ceil(Math.log2(playerCount));
    }
  }

  /**
   * Generate first round matches
   */
  async generateFirstRoundMatches(tournamentId, participants, format) {
    const adapter = this.dbManager.getAdapter();
    const matches = [];

    try {
      // Create first tournament round
      const roundId = uuidv4();
      await adapter.create('tournament_rounds', {
        id: roundId,
        tournament_id: tournamentId,
        round_number: 1,
        status: 'not_started',
        created_at: new Date().toISOString()
      });

      // Generate match pairings based on format
      const pairings = this.generateMatchPairings(participants, format);

      for (let i = 0; i < pairings.length; i++) {
        const pairing = pairings[i];
        const matchId = uuidv4();

        await adapter.create('tournament_matches', {
          id: matchId,
          tournament_id: tournamentId,
          round_id: roundId,
          round_number: 1,
          player1_id: pairing.player1.id,
          player2_id: pairing.player2.id,
          status: 'scheduled',
          bracket_position: i + 1,
          created_at: new Date().toISOString()
        });

        matches.push({
          id: matchId,
          player1: pairing.player1,
          player2: pairing.player2,
          roundNumber: 1,
          bracketPosition: i + 1
        });
      }

      // Update tournament status
      await adapter.update('tournaments', { id: tournamentId }, {
        status: 'in_progress',
        current_round: 1,
        start_time: new Date().toISOString()
      });

      return matches;
    } catch (error) {
      throw new Error(`Failed to generate first round matches: ${error.message}`);
    }
  }

  /**
   * Generate match pairings
   */
  generateMatchPairings(participants, format) {
    const pairings = [];
    const shuffledParticipants = [...participants].sort(() => Math.random() - 0.5);

    if (format === 'round_robin') {
      // For round robin, we'll generate all possible pairings
      // For now, just generate first round pairings
      for (let i = 0; i < shuffledParticipants.length; i += 2) {
        if (i + 1 < shuffledParticipants.length) {
          pairings.push({
            player1: shuffledParticipants[i],
            player2: shuffledParticipants[i + 1]
          });
        }
      }
    } else {
      // Single/Double elimination - pair players sequentially
      for (let i = 0; i < shuffledParticipants.length; i += 2) {
        if (i + 1 < shuffledParticipants.length) {
          pairings.push({
            player1: shuffledParticipants[i],
            player2: shuffledParticipants[i + 1]
          });
        }
      }
    }

    return pairings;
  }

  /**
   * Load party from database into memory
   */
  async loadPartyFromDatabase(partyId) {
    const adapter = this.dbManager.getAdapter();

    try {
      // Get party lobby
      const partyLobby = await adapter.findOne('party_lobbies', { id: partyId });
      if (!partyLobby) {
        return null;
      }

      // Get party settings
      const partySettings = await adapter.findOne('party_lobby_settings', { lobby_id: partyId });
      if (!partySettings) {
        return null;
      }

      // Get participants
      const participants = await adapter.findMany('party_lobby_participants', { lobby_id: partyId });
      
      // Get user details for participants
      const participantDetails = [];
      for (const participant of participants) {
        const user = await adapter.findOne('users', { id: participant.player_id });
        if (user) {
          participantDetails.push({
            id: user.id,
            name: user.display_name || user.username,
            avatar: user.avatar || '👤',
            isHost: participant.is_host === 1,
            status: participant.status,
            joinedAt: new Date(participant.joined_at)
          });

          // Track player in party
          this.playerToParty.set(user.id, partyId);
        }
      }

      // Create party object
      const party = {
        id: partyLobby.id,
        code: partyLobby.code,
        hostPlayerId: partyLobby.host_player_id,
        settings: {
          maxPlayers: partyLobby.max_players,
          roundCount: partySettings.round_count,
          tournamentFormat: partySettings.tournament_format,
          allowSpectators: partySettings.allow_spectators === 1,
          chatEnabled: partySettings.chat_enabled === 1,
          autoStartWhenFull: partySettings.auto_start_when_full === 1
        },
        participants: participantDetails,
        status: partyLobby.status,
        maxPlayers: partyLobby.max_players,
        currentPlayerCount: partyLobby.current_player_count,
        createdAt: new Date(partyLobby.created_at)
      };

      // Cache the party
      this.activeParties.set(partyId, party);
      this.partyCodeToId.set(party.code, partyId);

      return party;
    } catch (error) {
      throw new Error(`Failed to load party from database: ${error.message}`);
    }
  }

  /**
   * Close party (host only)
   */
  async closeParty(partyId, hostUserId) {
    const party = this.activeParties.get(partyId);
    if (!party) {
      throw new Error('Party not found');
    }

    if (party.hostPlayerId !== hostUserId) {
      throw new Error('Only the host can close the party');
    }

    const adapter = this.dbManager.getAdapter();

    try {
      // Update party status in database
      await adapter.update('party_lobbies', { id: partyId }, {
        status: 'lobby_closed',
        updated_at: new Date().toISOString()
      });

      // Remove all participants from tracking
      for (const participant of party.participants) {
        this.playerToParty.delete(participant.id);
      }

      // Remove from caches
      this.activeParties.delete(partyId);
      this.partyCodeToId.delete(party.code);

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to close party: ${error.message}`);
    }
  }

  /**
   * Cleanup failed party creation
   */
  async cleanupFailedPartyCreation(partyId, partyCode, hostUserId) {
    const adapter = this.dbManager.getAdapter();
    
    try {
      await adapter.delete('party_lobby_participants', { lobby_id: partyId });
      await adapter.delete('party_lobby_settings', { lobby_id: partyId });
      await adapter.delete('party_lobbies', { id: partyId });
      
      this.activeParties.delete(partyId);
      this.partyCodeToId.delete(partyCode);
      this.playerToParty.delete(hostUserId);
    } catch (error) {
      // Log error but don't throw - this is cleanup
      console.error('Failed to cleanup party creation:', error);
    }
  }

  /**
   * Cleanup expired parties
   */
  async cleanupExpiredParties() {
    const adapter = this.dbManager.getAdapter();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours
    const cutoffTime = new Date(Date.now() - maxAge).toISOString();

    try {
      // Find expired parties
      const expiredParties = await adapter.findMany('party_lobbies', {
        created_at: { operator: '<', value: cutoffTime },
        status: { operator: 'IN', value: ['waiting_for_players', 'ready_to_start', 'lobby_closed'] }
      });

      for (const party of expiredParties) {
        // Remove from memory caches
        this.activeParties.delete(party.id);
        this.partyCodeToId.delete(party.code);

        // Remove player tracking
        const participants = await adapter.findMany('party_lobby_participants', { lobby_id: party.id });
        for (const participant of participants) {
          this.playerToParty.delete(participant.player_id);
        }

        // Delete from database
        await adapter.delete('party_lobby_participants', { lobby_id: party.id });
        await adapter.delete('party_lobby_settings', { lobby_id: party.id });
        await adapter.delete('party_lobbies', { id: party.id });
      }

      return expiredParties.length;
    } catch (error) {
      console.error('Failed to cleanup expired parties:', error);
      return 0;
    }
  }
}

module.exports = {
  PartyService
};