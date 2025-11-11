/**
 * Party Host Management Tests
 * Tests for host privilege system, player kick functionality, and lobby management
 */

import { PartyLobbyService } from '../services/PartyLobbyService';
import { 
  LobbyCreationRequest, 
  LobbyJoinRequest, 
  TournamentFormat,
  LobbyStatus,
  LobbyError
} from '../types/party';

describe('Party Host Management Functionality', () => {
  let partyLobbyService: PartyLobbyService;

  beforeEach(() => {
    partyLobbyService = new PartyLobbyService();
  });

  describe('Host Privilege System', () => {
    test('should allow host to kick players from lobby', async () => {
      // Create lobby
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host1',
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

      const lobby = await partyLobbyService.createLobby(createRequest);

      // Add a player to kick
      const joinRequest: LobbyJoinRequest = {
        playerId: 'player1',
        playerName: 'Test Player',
        lobbyCode: lobby.code
      };

      await partyLobbyService.joinLobby(joinRequest);

      // Host kicks the player
      await partyLobbyService.kickPlayer(lobby.id, 'host1', 'player1');

      const updatedLobby = await partyLobbyService.getLobby(lobby.id);
      expect(updatedLobby?.currentPlayerCount).toBe(1);
      expect(updatedLobby?.participants.find(p => p.id === 'player1')).toBeUndefined();
    });

    test('should prevent non-host from kicking players', async () => {
      // Create lobby with host
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host1',
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

      const lobby = await partyLobbyService.createLobby(createRequest);

      // Add two players
      await partyLobbyService.joinLobby({
        playerId: 'player1',
        playerName: 'Player 1',
        lobbyCode: lobby.code
      });

      await partyLobbyService.joinLobby({
        playerId: 'player2',
        playerName: 'Player 2',
        lobbyCode: lobby.code
      });

      // Non-host tries to kick another player
      await expect(
        partyLobbyService.kickPlayer(lobby.id, 'player1', 'player2')
      ).rejects.toThrow(LobbyError.HOST_PRIVILEGES_REQUIRED);
    });

    test('should allow host to transfer privileges to another player', async () => {
      // Create lobby
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host1',
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

      const lobby = await partyLobbyService.createLobby(createRequest);

      // Add a player
      await partyLobbyService.joinLobby({
        playerId: 'player1',
        playerName: 'New Host',
        lobbyCode: lobby.code
      });

      // Transfer host to player1
      const updatedLobby = await partyLobbyService.transferHost(lobby.id, 'host1', 'player1');

      expect(updatedLobby.hostPlayerId).toBe('player1');
      expect(updatedLobby.participants.find(p => p.id === 'player1')?.isHost).toBe(true);
      expect(updatedLobby.participants.find(p => p.id === 'host1')?.isHost).toBe(false);
    });
  });

  describe('Host Transfer and Lobby Closure Logic', () => {
    test('should automatically transfer host when host leaves', async () => {
      // Create lobby
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host1',
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

      const lobby = await partyLobbyService.createLobby(createRequest);

      // Add a player
      await partyLobbyService.joinLobby({
        playerId: 'player1',
        playerName: 'New Host',
        lobbyCode: lobby.code
      });

      // Host leaves
      const result = await partyLobbyService.handleHostLeaving(lobby.id, 'host1');

      expect(result.action).toBe('transferred');
      expect(result.newHost?.id).toBe('player1');
      expect(result.lobby?.hostPlayerId).toBe('player1');
    });

    test('should close lobby when host leaves and no other players remain', async () => {
      // Create lobby with only host
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host1',
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

      const lobby = await partyLobbyService.createLobby(createRequest);

      // Host leaves (no other players)
      const result = await partyLobbyService.handleHostLeaving(lobby.id, 'host1');

      expect(result.action).toBe('closed');
      
      // Lobby should no longer exist
      const closedLobby = await partyLobbyService.getLobby(lobby.id);
      expect(closedLobby).toBeNull();
    });

    test('should allow host to manually close lobby', async () => {
      // Create lobby
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host1',
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

      const lobby = await partyLobbyService.createLobby(createRequest);

      // Add some players
      await partyLobbyService.joinLobby({
        playerId: 'player1',
        playerName: 'Player 1',
        lobbyCode: lobby.code
      });

      // Host closes lobby
      await partyLobbyService.closeLobby(lobby.id, 'host1');

      // Lobby should no longer exist
      const closedLobby = await partyLobbyService.getLobby(lobby.id);
      expect(closedLobby).toBeNull();
    });
  });

  describe('Host Controls Validation', () => {
    test('should prevent host from kicking themselves', async () => {
      // Create lobby
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host1',
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

      const lobby = await partyLobbyService.createLobby(createRequest);

      // Host tries to kick themselves
      await expect(
        partyLobbyService.kickPlayer(lobby.id, 'host1', 'host1')
      ).rejects.toThrow('Cannot kick yourself');
    });

    test('should prevent host transfer to themselves', async () => {
      // Create lobby
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host1',
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

      const lobby = await partyLobbyService.createLobby(createRequest);

      // Host tries to transfer to themselves
      await expect(
        partyLobbyService.transferHost(lobby.id, 'host1', 'host1')
      ).rejects.toThrow('Cannot transfer host to yourself');
    });

    test('should update lobby status when players are kicked below minimum', async () => {
      // Create lobby
      const createRequest: LobbyCreationRequest = {
        hostPlayerId: 'host1',
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

      const lobby = await partyLobbyService.createLobby(createRequest);

      // Add players to reach ready status
      for (let i = 1; i <= 4; i++) {
        await partyLobbyService.joinLobby({
          playerId: `player${i}`,
          playerName: `Player ${i}`,
          lobbyCode: lobby.code
        });
      }

      let updatedLobby = await partyLobbyService.getLobby(lobby.id);
      expect(updatedLobby?.status).toBe(LobbyStatus.READY_TO_START);

      // Kick players below minimum
      await partyLobbyService.kickPlayer(lobby.id, 'host1', 'player1');
      await partyLobbyService.kickPlayer(lobby.id, 'host1', 'player2');

      updatedLobby = await partyLobbyService.getLobby(lobby.id);
      expect(updatedLobby?.status).toBe(LobbyStatus.WAITING_FOR_PLAYERS);
      expect(updatedLobby?.currentPlayerCount).toBe(3); // host + 2 remaining players
    });
  });
});