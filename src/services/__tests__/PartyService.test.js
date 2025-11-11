// Unit tests for PartyService
// Tests Requirements: 1.1, 2.1, 5.1, 6.1

const { PartyService } = require('../PartyService');

describe('PartyService', () => {
  let partyService;
  let mockDbManager;
  let mockAdapter;

  beforeEach(() => {
    mockAdapter = {
      findOne: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };

    mockDbManager = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter)
    };

    partyService = new PartyService(mockDbManager);
  });

  describe('createParty', () => {
    const mockHost = {
      id: 'host1',
      username: 'hostPlayer',
      display_name: 'Host Player',
      avatar: '👑'
    };

    const mockSettings = {
      maxPlayers: 8,
      roundCount: 10,
      tournamentFormat: 'single_elimination',
      allowSpectators: true,
      chatEnabled: true,
      autoStartWhenFull: false
    };

    beforeEach(() => {
      mockAdapter.findOne.mockResolvedValue(mockHost);
    });

    it('should create party successfully', async () => {
      const party = await partyService.createParty('host1', mockSettings);
      
      expect(party).toMatchObject({
        hostPlayerId: 'host1',
        status: 'waiting_for_players',
        maxPlayers: 8,
        currentPlayerCount: 1
      });
      
      expect(party.participants).toHaveLength(1);
      expect(party.participants[0]).toMatchObject({
        id: 'host1',
        name: 'Host Player',
        isHost: true,
        status: 'ready'
      });
      
      expect(mockAdapter.create).toHaveBeenCalledTimes(3); // party_lobbies, party_lobby_settings, party_lobby_participants
    });

    it('should throw error when host not found', async () => {
      mockAdapter.findOne.mockResolvedValue(null);
      
      await expect(
        partyService.createParty('host1', mockSettings)
      ).rejects.toThrow('Host user not found');
    });

    it('should throw error when host already in party', async () => {
      partyService.playerToParty.set('host1', 'existing-party');
      
      await expect(
        partyService.createParty('host1', mockSettings)
      ).rejects.toThrow('Host is already in a party');
    });

    it('should validate party settings', async () => {
      const invalidSettings = { ...mockSettings, maxPlayers: 2 };
      
      await expect(
        partyService.createParty('host1', invalidSettings)
      ).rejects.toThrow('Max players must be between 4 and 16');
    });

    it('should generate unique party code', async () => {
      const party1 = await partyService.createParty('host1', mockSettings);
      
      // Reset for second party
      partyService.playerToParty.clear();
      partyService.activeParties.clear();
      partyService.partyCodeToId.clear();
      
      const party2 = await partyService.createParty('host2', mockSettings);
      
      expect(party1.code).not.toBe(party2.code);
      expect(party1.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(party2.code).toMatch(/^[A-Z0-9]{6}$/);
    });
  });

  describe('joinParty', () => {
    const mockUser = {
      id: 'user1',
      username: 'player1',
      display_name: 'Player One',
      avatar: '🎮'
    };

    const mockParty = {
      id: 'party1',
      code: 'ABC123',
      hostPlayerId: 'host1',
      participants: [
        { id: 'host1', name: 'Host', isHost: true, status: 'ready' }
      ],
      status: 'waiting_for_players',
      maxPlayers: 8,
      currentPlayerCount: 1
    };

    beforeEach(() => {
      mockAdapter.findOne.mockResolvedValue(mockUser);
      partyService.activeParties.set('party1', mockParty);
      partyService.partyCodeToId.set('ABC123', 'party1');
    });

    it('should join party successfully', async () => {
      const updatedParty = await partyService.joinParty('user1', 'ABC123');
      
      expect(updatedParty.currentPlayerCount).toBe(2);
      expect(updatedParty.participants).toHaveLength(2);
      expect(updatedParty.participants[1]).toMatchObject({
        id: 'user1',
        name: 'Player One',
        isHost: false,
        status: 'waiting'
      });
      
      expect(mockAdapter.create).toHaveBeenCalledWith('party_lobby_participants', expect.objectContaining({
        lobby_id: 'party1',
        player_id: 'user1',
        is_host: 0,
        status: 'waiting'
      }));
    });

    it('should throw error when user not found', async () => {
      mockAdapter.findOne.mockResolvedValue(null);
      
      await expect(
        partyService.joinParty('user1', 'ABC123')
      ).rejects.toThrow('User not found');
    });

    it('should throw error when user already in party', async () => {
      partyService.playerToParty.set('user1', 'other-party');
      
      await expect(
        partyService.joinParty('user1', 'ABC123')
      ).rejects.toThrow('User is already in a party');
    });

    it('should throw error when party is full', async () => {
      mockParty.currentPlayerCount = 8;
      mockParty.maxPlayers = 8;
      
      await expect(
        partyService.joinParty('user1', 'ABC123')
      ).rejects.toThrow('Party is full');
    });

    it('should throw error when party not found', async () => {
      // Mock user exists but party doesn't
      mockAdapter.findOne
        .mockResolvedValueOnce(mockUser) // User exists
        .mockResolvedValueOnce(null); // Party not found in database
      
      await expect(
        partyService.joinParty('user1', 'INVALID')
      ).rejects.toThrow('Party not found');
    });

    it('should update party status when ready to start', async () => {
      // Create a fresh party for this test
      const testParty = {
        id: 'party2',
        code: 'DEF456',
        hostPlayerId: 'host1',
        participants: [
          { id: 'host1', name: 'Host', isHost: true, status: 'ready' },
          { id: 'user2', name: 'Player Two', isHost: false, status: 'waiting' },
          { id: 'user3', name: 'Player Three', isHost: false, status: 'waiting' }
        ],
        status: 'waiting_for_players',
        maxPlayers: 8,
        currentPlayerCount: 3
      };
      
      partyService.activeParties.set('party2', testParty);
      partyService.partyCodeToId.set('DEF456', 'party2');
      
      const updatedParty = await partyService.joinParty('user1', 'DEF456');
      
      expect(updatedParty.status).toBe('ready_to_start');
      expect(mockAdapter.update).toHaveBeenCalledWith(
        'party_lobbies',
        { id: 'party2' },
        expect.objectContaining({ status: 'ready_to_start' })
      );
    });
  });

  describe('leaveParty', () => {
    const mockParty = {
      id: 'party1',
      code: 'ABC123',
      hostPlayerId: 'host1',
      participants: [
        { id: 'host1', name: 'Host', isHost: true, status: 'ready' },
        { id: 'user1', name: 'Player One', isHost: false, status: 'waiting' }
      ],
      status: 'waiting_for_players',
      maxPlayers: 8,
      currentPlayerCount: 2
    };

    beforeEach(() => {
      partyService.activeParties.set('party1', mockParty);
      partyService.playerToParty.set('host1', 'party1');
      partyService.playerToParty.set('user1', 'party1');
    });

    it('should leave party as regular player', async () => {
      const result = await partyService.leaveParty('user1');
      
      expect(result.action).toBe('left_party');
      expect(result.party.currentPlayerCount).toBe(1);
      expect(result.party.participants).toHaveLength(1);
      expect(partyService.playerToParty.has('user1')).toBe(false);
      
      expect(mockAdapter.delete).toHaveBeenCalledWith('party_lobby_participants', {
        lobby_id: 'party1',
        player_id: 'user1'
      });
    });

    it('should transfer host when host leaves', async () => {
      // Ensure there are participants to transfer host to
      mockParty.participants = [
        { id: 'host1', name: 'Host', isHost: true, status: 'ready' },
        { id: 'user1', name: 'Player One', isHost: false, status: 'waiting' }
      ];
      mockParty.currentPlayerCount = 2;
      
      const result = await partyService.leaveParty('host1');
      
      expect(result.action).toBe('host_transferred');
      expect(result.newHost.id).toBe('user1');
      expect(result.party.hostPlayerId).toBe('user1');
      expect(result.party.participants[0].isHost).toBe(true);
      
      expect(mockAdapter.update).toHaveBeenCalledWith(
        'party_lobby_participants',
        { lobby_id: 'party1', player_id: 'user1' },
        { is_host: 1 }
      );
    });

    it('should close party when last player leaves', async () => {
      // Set up party with only host
      const singlePlayerParty = {
        id: 'party3',
        code: 'GHI789',
        hostPlayerId: 'host1',
        participants: [
          { id: 'host1', name: 'Host', isHost: true, status: 'ready' }
        ],
        status: 'waiting_for_players',
        maxPlayers: 8,
        currentPlayerCount: 1
      };
      
      partyService.activeParties.set('party3', singlePlayerParty);
      partyService.playerToParty.set('host1', 'party3');
      
      const result = await partyService.leaveParty('host1');
      
      expect(result.action).toBe('party_closed');
      expect(partyService.activeParties.has('party3')).toBe(false);
    });

    it('should throw error when user not in party', async () => {
      await expect(
        partyService.leaveParty('unknown-user')
      ).rejects.toThrow('User is not in a party');
    });
  });

  describe('startPartyGame', () => {
    const mockParty = {
      id: 'party1',
      code: 'ABC123',
      hostPlayerId: 'host1',
      participants: [
        { id: 'host1', name: 'Host', isHost: true, status: 'ready' },
        { id: 'user1', name: 'Player One', isHost: false, status: 'ready' },
        { id: 'user2', name: 'Player Two', isHost: false, status: 'ready' },
        { id: 'user3', name: 'Player Three', isHost: false, status: 'ready' }
      ],
      status: 'ready_to_start',
      maxPlayers: 8,
      currentPlayerCount: 4,
      settings: {
        tournamentFormat: 'single_elimination'
      }
    };

    beforeEach(() => {
      partyService.activeParties.set('party1', mockParty);
    });

    it('should start party game successfully', async () => {
      const result = await partyService.startPartyGame('party1', 'host1');
      
      expect(result.tournamentId).toBeDefined();
      expect(result.party.status).toBe('tournament_in_progress');
      expect(result.matches).toBeDefined();
      expect(result.format).toBe('single_elimination');
      
      expect(mockAdapter.create).toHaveBeenCalledWith('tournaments', expect.objectContaining({
        lobby_id: 'party1',
        format: 'single_elimination',
        status: 'not_started'
      }));
    });

    it('should throw error when non-host tries to start', async () => {
      await expect(
        partyService.startPartyGame('party1', 'user1')
      ).rejects.toThrow('Only the host can start the party game');
    });

    it('should throw error when not enough players', async () => {
      mockParty.currentPlayerCount = 3;
      mockParty.participants = mockParty.participants.slice(0, 3);
      
      await expect(
        partyService.startPartyGame('party1', 'host1')
      ).rejects.toThrow('Need at least 4 players to start');
    });

    it('should throw error when tournament already in progress', async () => {
      // Ensure party has enough players first
      mockParty.currentPlayerCount = 4;
      mockParty.status = 'tournament_in_progress';
      
      await expect(
        partyService.startPartyGame('party1', 'host1')
      ).rejects.toThrow('Tournament already in progress');
    });
  });

  describe('sendChatMessage', () => {
    const mockParty = {
      id: 'party1',
      participants: [
        { id: 'user1', name: 'Player One', avatar: '🎮' }
      ],
      settings: { chatEnabled: true }
    };

    beforeEach(() => {
      partyService.activeParties.set('party1', mockParty);
      mockAdapter.findOne.mockResolvedValue({ id: 'tournament1' });
    });

    it('should send chat message successfully', async () => {
      const message = await partyService.sendChatMessage('party1', 'user1', 'Hello everyone!');
      
      expect(message).toMatchObject({
        lobbyId: 'party1',
        senderId: 'user1',
        senderName: 'Player One',
        message: 'Hello everyone!',
        messageType: 'player_message'
      });
      
      expect(mockAdapter.create).toHaveBeenCalledWith('tournament_chat_messages', expect.objectContaining({
        lobby_id: 'party1',
        sender_id: 'user1',
        message: 'Hello everyone!',
        message_type: 'player_message'
      }));
    });

    it('should send system message', async () => {
      const message = await partyService.sendChatMessage('party1', 'system', 'Game starting!', 'system_message');
      
      expect(message.senderName).toBe('System');
      expect(message.senderAvatar).toBe('🤖');
      expect(message.messageType).toBe('system_message');
    });

    it('should throw error when party not found', async () => {
      await expect(
        partyService.sendChatMessage('invalid-party', 'user1', 'Hello')
      ).rejects.toThrow('Party not found');
    });

    it('should throw error when sender not in party', async () => {
      await expect(
        partyService.sendChatMessage('party1', 'unknown-user', 'Hello')
      ).rejects.toThrow('Sender not in party');
    });

    it('should throw error when chat disabled', async () => {
      mockParty.settings.chatEnabled = false;
      
      await expect(
        partyService.sendChatMessage('party1', 'user1', 'Hello')
      ).rejects.toThrow('Chat is disabled in this party');
    });

    it('should throw error for empty message', async () => {
      // Ensure chat is enabled for this test
      mockParty.settings.chatEnabled = true;
      
      await expect(
        partyService.sendChatMessage('party1', 'user1', '')
      ).rejects.toThrow('Message cannot be empty');
    });

    it('should throw error for message too long', async () => {
      // Ensure chat is enabled for this test
      mockParty.settings.chatEnabled = true;
      const longMessage = 'a'.repeat(501);
      
      await expect(
        partyService.sendChatMessage('party1', 'user1', longMessage)
      ).rejects.toThrow('Message too long (max 500 characters)');
    });
  });

  describe('updatePlayerStatus', () => {
    const mockParty = {
      id: 'party1',
      participants: [
        { id: 'user1', name: 'Player One', status: 'waiting' }
      ],
      settings: { chatEnabled: true }
    };

    beforeEach(() => {
      partyService.activeParties.set('party1', mockParty);
    });

    it('should update player status successfully', async () => {
      const participant = await partyService.updatePlayerStatus('party1', 'user1', 'ready');
      
      expect(participant.status).toBe('ready');
      expect(mockAdapter.update).toHaveBeenCalledWith(
        'party_lobby_participants',
        { lobby_id: 'party1', player_id: 'user1' },
        { status: 'ready' }
      );
    });

    it('should throw error for invalid status', async () => {
      await expect(
        partyService.updatePlayerStatus('party1', 'user1', 'invalid-status')
      ).rejects.toThrow('Invalid player status');
    });

    it('should throw error when player not in party', async () => {
      await expect(
        partyService.updatePlayerStatus('party1', 'unknown-user', 'ready')
      ).rejects.toThrow('Player not in party');
    });
  });

  describe('utility methods', () => {
    it('should validate party settings correctly', () => {
      const validSettings = {
        maxPlayers: 8,
        roundCount: 10,
        tournamentFormat: 'single_elimination'
      };
      
      const validated = partyService.validatePartySettings(validSettings);
      expect(validated.maxPlayers).toBe(8);
      expect(validated.chatEnabled).toBe(true); // default value
      
      // Test invalid settings
      expect(() => {
        partyService.validatePartySettings({ maxPlayers: 2 });
      }).toThrow('Max players must be between 4 and 16');
      
      expect(() => {
        partyService.validatePartySettings({ roundCount: 25 });
      }).toThrow('Round count must be between 5 and 20');
    });

    it('should calculate total rounds correctly', () => {
      expect(partyService.calculateTotalRounds(8, 'single_elimination')).toBe(3);
      expect(partyService.calculateTotalRounds(8, 'double_elimination')).toBe(6);
      expect(partyService.calculateTotalRounds(8, 'round_robin')).toBe(7);
    });

    it('should generate match pairings', () => {
      const participants = [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
        { id: 'p3', name: 'Player 3' },
        { id: 'p4', name: 'Player 4' }
      ];
      
      const pairings = partyService.generateMatchPairings(participants, 'single_elimination');
      
      expect(pairings).toHaveLength(2);
      expect(pairings[0]).toHaveProperty('player1');
      expect(pairings[0]).toHaveProperty('player2');
    });

    it('should check user party membership', () => {
      partyService.playerToParty.set('user1', 'party1');
      
      expect(partyService.isUserInParty('user1')).toBe(true);
      expect(partyService.isUserInParty('user2')).toBe(false);
    });
  });
});