import { TournamentEngine } from '../services/tournament/TournamentEngine';
import { MatchCoordinator } from '../services/tournament/MatchCoordinator';
import {
  PartyLobby,
  LobbyStatus,
  TournamentFormat,
  TournamentPlayer,
  PlayerStatus,
  TournamentStatus,
  MatchResult,
  MatchStatus
} from '../types/party';

describe('Tournament Engine Core', () => {
  let tournamentEngine: TournamentEngine;
  let matchCoordinator: MatchCoordinator;

  beforeEach(() => {
    tournamentEngine = new TournamentEngine();
    matchCoordinator = new MatchCoordinator();
  });

  const createMockLobby = (playerCount: number = 4, format: TournamentFormat = TournamentFormat.SINGLE_ELIMINATION): PartyLobby => {
    const players: TournamentPlayer[] = [];
    
    for (let i = 1; i <= playerCount; i++) {
      players.push({
        id: `player_${i}`,
        name: `Player ${i}`,
        isHost: i === 1,
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
        status: PlayerStatus.WAITING,
        joinedAt: new Date()
      });
    }

    return {
      id: 'lobby_1',
      code: 'ABC123',
      hostPlayerId: 'player_1',
      participants: players,
      settings: {
        maxPlayers: playerCount,
        roundCount: 10,
        tournamentFormat: format,
        allowSpectators: true,
        chatEnabled: true,
        autoStartWhenFull: false
      },
      status: LobbyStatus.READY_TO_START,
      createdAt: new Date(),
      maxPlayers: playerCount,
      currentPlayerCount: playerCount
    };
  };

  const createMockMatchResult = (
    matchId: string,
    player1Id: string,
    player2Id: string,
    winnerId: string
  ): MatchResult => {
    const loserId = winnerId === player1Id ? player2Id : player1Id;
    
    return {
      matchId,
      player1Id,
      player2Id,
      winnerId,
      loserId,
      player1Score: winnerId === player1Id ? 100 : 50,
      player2Score: winnerId === player2Id ? 100 : 50,
      gameSessionId: 'session_1',
      statistics: {
        totalRounds: 10,
        player1Cooperations: 5,
        player1Betrayals: 5,
        player2Cooperations: 6,
        player2Betrayals: 4,
        matchDuration: 300
      },
      completedAt: new Date()
    };
  };

  describe('Tournament Creation', () => {
    test('should create tournament from lobby', async () => {
      const lobby = createMockLobby(4);
      const tournament = await tournamentEngine.createTournament(lobby);

      expect(tournament).toBeDefined();
      expect(tournament.id).toBeDefined();
      expect(tournament.lobbyId).toBe(lobby.id);
      expect(tournament.format).toBe(TournamentFormat.SINGLE_ELIMINATION);
      expect(tournament.players).toHaveLength(4);
      expect(tournament.status).toBe(TournamentStatus.NOT_STARTED);
      expect(tournament.currentRound).toBe(0);
    });

    test('should generate correct bracket structure', async () => {
      const lobby = createMockLobby(4);
      const tournament = await tournamentEngine.createTournament(lobby);

      expect(tournament.bracket).toBeDefined();
      expect(tournament.bracket.rounds).toBeDefined();
      expect(tournament.bracket.rounds.length).toBeGreaterThan(0);
      expect(tournament.bracket.nextMatchPairings).toBeDefined();
    });

    test('should throw error for insufficient players', async () => {
      const lobby = createMockLobby(2); // Less than minimum 4 players
      
      await expect(tournamentEngine.createTournament(lobby)).rejects.toThrow();
    });
  });

  describe('Tournament Flow', () => {
    test('should start tournament correctly', async () => {
      const lobby = createMockLobby(4);
      const tournament = await tournamentEngine.createTournament(lobby);
      
      const update = await tournamentEngine.startTournament(tournament.id);
      const updatedTournament = tournamentEngine.getTournamentStatus(tournament.id);

      expect(updatedTournament?.status).toBe(TournamentStatus.IN_PROGRESS);
      expect(updatedTournament?.currentRound).toBe(1);
      expect(update.type).toBeDefined();
    });

    test('should get next matches', async () => {
      const lobby = createMockLobby(4);
      const tournament = await tournamentEngine.createTournament(lobby);
      await tournamentEngine.startTournament(tournament.id);

      const nextMatches = tournamentEngine.getNextMatches(tournament.id);
      
      expect(nextMatches).toBeDefined();
      expect(Array.isArray(nextMatches)).toBe(true);
    });

    test('should process match results', async () => {
      const lobby = createMockLobby(4);
      const tournament = await tournamentEngine.createTournament(lobby);
      await tournamentEngine.startTournament(tournament.id);

      const nextMatches = tournamentEngine.getNextMatches(tournament.id);
      if (nextMatches.length > 0) {
        const pairing = nextMatches[0];
        const activeMatch = tournamentEngine.createActiveMatch(tournament.id, pairing);
        
        const matchResult = createMockMatchResult(
          activeMatch.id,
          pairing.player1Id,
          pairing.player2Id,
          pairing.player1Id
        );

        const update = await tournamentEngine.processMatchResult(tournament.id, matchResult);
        
        expect(update).toBeDefined();
        expect(update.tournamentId).toBe(tournament.id);
      }
    });
  });

  describe('Match Coordination', () => {
    test('should create active match from pairing', async () => {
      const lobby = createMockLobby(4);
      const tournament = await tournamentEngine.createTournament(lobby);
      await tournamentEngine.startTournament(tournament.id);

      const nextMatches = tournamentEngine.getNextMatches(tournament.id);
      if (nextMatches.length > 0) {
        const pairing = nextMatches[0];
        const activeMatch = matchCoordinator.createMatch(pairing, tournament.id, tournament);

        expect(activeMatch).toBeDefined();
        expect(activeMatch.id).toBeDefined();
        expect(activeMatch.tournamentId).toBe(tournament.id);
        expect(activeMatch.status).toBe(MatchStatus.SCHEDULED);
      }
    });

    test('should manage match queue', async () => {
      const lobby = createMockLobby(6);
      const tournament = await tournamentEngine.createTournament(lobby);
      await tournamentEngine.startTournament(tournament.id);

      const nextMatches = tournamentEngine.getNextMatches(tournament.id);
      matchCoordinator.addToMatchQueue(tournament.id, nextMatches);

      const queueStatus = matchCoordinator.getMatchQueueStatus(tournament.id);
      expect(queueStatus.queueLength).toBeGreaterThanOrEqual(0);
      expect(queueStatus).toHaveProperty('activeMatches');
      expect(queueStatus).toHaveProperty('waitingPairings');
    });

    test('should get available matches from queue', async () => {
      const lobby = createMockLobby(6);
      const tournament = await tournamentEngine.createTournament(lobby);
      await tournamentEngine.startTournament(tournament.id);

      const nextMatches = tournamentEngine.getNextMatches(tournament.id);
      matchCoordinator.addToMatchQueue(tournament.id, nextMatches);

      const availableMatches = matchCoordinator.getNextAvailableMatches(tournament.id, tournament, 2);
      expect(availableMatches.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Tournament Formats', () => {
    test('should handle single elimination format', async () => {
      const lobby = createMockLobby(4, TournamentFormat.SINGLE_ELIMINATION);
      const tournament = await tournamentEngine.createTournament(lobby);

      expect(tournament.format).toBe(TournamentFormat.SINGLE_ELIMINATION);
      expect(tournament.totalRounds).toBe(2); // log2(4) = 2 rounds
    });

    test('should handle round robin format', async () => {
      const lobby = createMockLobby(4, TournamentFormat.ROUND_ROBIN);
      const tournament = await tournamentEngine.createTournament(lobby);

      expect(tournament.format).toBe(TournamentFormat.ROUND_ROBIN);
      expect(tournament.totalRounds).toBeGreaterThan(0);
    });

    test('should handle double elimination format', async () => {
      const lobby = createMockLobby(4, TournamentFormat.DOUBLE_ELIMINATION);
      const tournament = await tournamentEngine.createTournament(lobby);

      expect(tournament.format).toBe(TournamentFormat.DOUBLE_ELIMINATION);
      expect(tournament.totalRounds).toBeGreaterThan(2); // More rounds than single elimination
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid tournament ID', () => {
      const tournament = tournamentEngine.getTournamentStatus('invalid_id');
      expect(tournament).toBeNull();
    });

    test('should handle match creation with invalid players', async () => {
      const lobby = createMockLobby(4);
      const tournament = await tournamentEngine.createTournament(lobby);

      const invalidPairing = {
        player1Id: 'invalid_player',
        player2Id: 'another_invalid_player',
        roundNumber: 1,
        bracketPosition: 0
      };

      expect(() => {
        matchCoordinator.createMatch(invalidPairing, tournament.id, tournament);
      }).toThrow();
    });

    test('should validate match pairings', async () => {
      const lobby = createMockLobby(4);
      const tournament = await tournamentEngine.createTournament(lobby);

      const validPairing = {
        player1Id: tournament.players[0].id,
        player2Id: tournament.players[1].id,
        roundNumber: 1,
        bracketPosition: 0
      };

      const invalidPairing = {
        player1Id: 'invalid_player',
        player2Id: 'another_invalid_player',
        roundNumber: 1,
        bracketPosition: 0
      };

      expect(matchCoordinator.validateMatchPairing(validPairing, tournament)).toBe(true);
      expect(matchCoordinator.validateMatchPairing(invalidPairing, tournament)).toBe(false);
    });
  });
});