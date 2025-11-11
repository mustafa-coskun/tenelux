/**
 * Party Lobby Joining Functionality Tests
 * Tests for task 2.2: Implement lobby joining functionality
 */

import { PartyLobbyService } from '../services/PartyLobbyService';
import { 
  LobbyCreationRequest, 
  LobbyJoinRequest, 
  TournamentFormat,
  LobbyStatus 
} from '../types/party';

describe('Party Lobby Joining Functionality', () => {
  let lobbyService: PartyLobbyService;
  
  beforeEach(() => {
    lobbyService = new PartyLobbyService();
  });

  describe('Lobby Code Input Interface', () => {
    test('should validate lobby code format', () => {
      const validCodes = ['ABC123', 'XYZ789', '123ABC', 'ABCD12'];
      const invalidCodes = ['abc123', 'AB123', '', 'ABCDEFG', '12345'];
      
      validCodes.forEach(code => {
        expect(code).toMatch(/^[A-Z0-9]{6}$/);
      });
      
      invalidCodes.forEach(code => {
        expect(code).not.toMatch(/^[A-Z0-9]{6}$/);
      });
    });
  });

  describe('Lobby Discovery and Joining Logic', () => {
    test('should successfully join an existing lobby', async () => {
      // Create a lobby first
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host123',
        hostPlayerName: 'Host Player',
        settings: {
          maxPlayers: 8,
          roundCount: 10,
          tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
          allowSpectators: true,
          chatEnabled: true,
          autoStartWhenFull: false
        }
      };
      
      const lobby = await lobbyService.createLobby(createRequest);
      
      // Join the lobby
      const joinRequest: LobbyJoinRequest = {
        playerId: 'player456',
        playerName: 'Joining Player',
        lobbyCode: lobby.code
      };
      
      const joinedLobby = await lobbyService.joinLobby(joinRequest);
      
      expect(joinedLobby.id).toBe(lobby.id);
      expect(joinedLobby.currentPlayerCount).toBe(2);
      expect(joinedLobby.participants).toHaveLength(2);
      expect(joinedLobby.participants[1].id).toBe('player456');
      expect(joinedLobby.participants[1].name).toBe('Joining Player');
    });

    test('should update lobby status when minimum players reached', async () => {
      // Create a lobby
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host123',
        hostPlayerName: 'Host Player',
        settings: {
          maxPlayers: 8,
          roundCount: 10,
          tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
          allowSpectators: true,
          chatEnabled: true,
          autoStartWhenFull: false
        }
      };
      
      const lobby = await lobbyService.createLobby(createRequest);
      expect(lobby.status).toBe(LobbyStatus.WAITING_FOR_PLAYERS);
      
      // Join 3 more players to reach minimum of 4
      for (let i = 2; i <= 4; i++) {
        const joinRequest: LobbyJoinRequest = {
          playerId: `player${i}`,
          playerName: `Player ${i}`,
          lobbyCode: lobby.code
        };
        
        const updatedLobby = await lobbyService.joinLobby(joinRequest);
        
        if (i === 4) {
          expect(updatedLobby.status).toBe(LobbyStatus.READY_TO_START);
        }
      }
    });
  });

  describe('Error Handling Scenarios', () => {
    test('should throw error for invalid lobby code', async () => {
      const joinRequest: LobbyJoinRequest = {
        playerId: 'player123',
        playerName: 'Test Player',
        lobbyCode: 'INVALID'
      };
      
      await expect(lobbyService.joinLobby(joinRequest))
        .rejects.toThrow('invalid_lobby_code');
    });

    test('should throw error for non-existent lobby', async () => {
      const joinRequest: LobbyJoinRequest = {
        playerId: 'player123',
        playerName: 'Test Player',
        lobbyCode: 'ABC123'
      };
      
      await expect(lobbyService.joinLobby(joinRequest))
        .rejects.toThrow('invalid_lobby_code');
    });

    test('should throw error when lobby is full', async () => {
      // Create a lobby with max 4 players
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host123',
        hostPlayerName: 'Host Player',
        settings: {
          maxPlayers: 4,
          roundCount: 10,
          tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
          allowSpectators: true,
          chatEnabled: true,
          autoStartWhenFull: false
        }
      };
      
      const lobby = await lobbyService.createLobby(createRequest);
      
      // Fill the lobby to capacity
      for (let i = 2; i <= 4; i++) {
        const joinRequest: LobbyJoinRequest = {
          playerId: `player${i}`,
          playerName: `Player ${i}`,
          lobbyCode: lobby.code
        };
        await lobbyService.joinLobby(joinRequest);
      }
      
      // Try to join when full
      const fullJoinRequest: LobbyJoinRequest = {
        playerId: 'player5',
        playerName: 'Player 5',
        lobbyCode: lobby.code
      };
      
      await expect(lobbyService.joinLobby(fullJoinRequest))
        .rejects.toThrow('lobby_full');
    });

    test('should throw error when tournament already started', async () => {
      // Create and start a tournament
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host123',
        hostPlayerName: 'Host Player',
        settings: {
          maxPlayers: 8,
          roundCount: 10,
          tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
          allowSpectators: true,
          chatEnabled: true,
          autoStartWhenFull: false
        }
      };
      
      const lobby = await lobbyService.createLobby(createRequest);
      
      // Add minimum players and start tournament
      for (let i = 2; i <= 4; i++) {
        const joinRequest: LobbyJoinRequest = {
          playerId: `player${i}`,
          playerName: `Player ${i}`,
          lobbyCode: lobby.code
        };
        await lobbyService.joinLobby(joinRequest);
      }
      
      await lobbyService.startTournament(lobby.id, 'host123');
      
      // Try to join after tournament started
      const lateJoinRequest: LobbyJoinRequest = {
        playerId: 'lateplayer',
        playerName: 'Late Player',
        lobbyCode: lobby.code
      };
      
      await expect(lobbyService.joinLobby(lateJoinRequest))
        .rejects.toThrow('tournament_already_started');
    });

    test('should throw error when player already in lobby', async () => {
      // Create a lobby
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host123',
        hostPlayerName: 'Host Player',
        settings: {
          maxPlayers: 8,
          roundCount: 10,
          tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
          allowSpectators: true,
          chatEnabled: true,
          autoStartWhenFull: false
        }
      };
      
      const lobby = await lobbyService.createLobby(createRequest);
      
      // Join the lobby
      const joinRequest: LobbyJoinRequest = {
        playerId: 'player456',
        playerName: 'Test Player',
        lobbyCode: lobby.code
      };
      
      await lobbyService.joinLobby(joinRequest);
      
      // Try to join again with same player
      await expect(lobbyService.joinLobby(joinRequest))
        .rejects.toThrow('player_already_in_lobby');
    });
  });

  describe('Lobby Code Generation and Validation', () => {
    test('should generate unique lobby codes', async () => {
      const codes = new Set<string>();
      
      // Create multiple lobbies and check code uniqueness
      for (let i = 0; i < 10; i++) {
        const createRequest: LobbyCreationRequest = {
          hostPlayerId: `host${i}`,
          hostPlayerName: `Host ${i}`,
          settings: {
            maxPlayers: 8,
            roundCount: 10,
            tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
            allowSpectators: true,
            chatEnabled: true,
            autoStartWhenFull: false
          }
        };
        
        const lobby = await lobbyService.createLobby(createRequest);
        expect(codes.has(lobby.code)).toBe(false);
        codes.add(lobby.code);
        expect(lobby.code).toMatch(/^[A-Z0-9]{6}$/);
      }
    });
  });
});