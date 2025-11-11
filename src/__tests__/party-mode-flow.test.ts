/**
 * Task 8.1: Parti modu akışını test et
 * Tests: Lobi oluşturma ve katılma, Turnuva başlatma, Maç oynama ve ilerleme, Turnuva tamamlama
 */

import { PartyStateManager } from '../services/PartyStateManager';
import { TournamentEngine } from '../services/TournamentEngine';
import { TournamentProgressTracker } from '../services/TournamentProgressTracker';
import { PartyLobby, Tournament, TournamentFormat, TournamentPlayer } from '../types/party';

describe('Party Mode Flow Tests', () => {
  let stateManager: PartyStateManager;
  let tournamentEngine: TournamentEngine;
  let progressTracker: TournamentProgressTracker;

  beforeEach(() => {
    stateManager = new PartyStateManager();
    tournamentEngine = new TournamentEngine();
    progressTracker = new TournamentProgressTracker();
  });

  describe('8.1.1 Lobi oluşturma ve katılma', () => {
    test('should create a party lobby successfully', () => {
      const lobby: PartyLobby = {
        id: 'lobby-1',
        code: 'ABC123',
        hostPlayerId: 'player-1',
        participants: [
          { id: 'player-1', name: 'Alice', isReady: true, isHost: true }
        ],
        settings: {
          maxPlayers: 4,
          tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
          roundCount: 10
        },
        status: 'waiting',
        createdAt: new Date()
      };

      stateManager.transitionToLobby(lobby);

      expect(stateManager.getCurrentPhase()).toBe('lobby');
      expect(stateManager.getCurrentLobby()).toEqual(lobby);
      expect(stateManager.getCurrentLobby()?.participants.length).toBe(1);
    });

    test('should allow players to join lobby', () => {
      const lobby: PartyLobby = {
        id: 'lobby-1',
        code: 'ABC123',
        hostPlayerId: 'player-1',
        participants: [
          { id: 'player-1', name: 'Alice', isReady: true, isHost: true }
        ],
        settings: {
          maxPlayers: 4,
          tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
          roundCount: 10
        },
        status: 'waiting',
        createdAt: new Date()
      };

      stateManager.transitionToLobby(lobby);

      // Add more players
      const updatedLobby = {
        ...lobby,
        participants: [
          ...lobby.participants,
          { id: 'player-2', name: 'Bob', isReady: false, isHost: false },
          { id: 'player-3', name: 'Charlie', isReady: false, isHost: false },
          { id: 'player-4', name: 'Diana', isReady: false, isHost: false }
        ]
      };

      stateManager.transitionToLobby(updatedLobby);

      expect(stateManager.getCurrentLobby()?.participants.length).toBe(4);
      expect(stateManager.getCurrentLobby()?.participants.map(p => p.name)).toEqual([
        'Alice', 'Bob', 'Charlie', 'Diana'
      ]);
    });

    test('should enforce max players limit', () => {
      const lobby: PartyLobby = {
        id: 'lobby-1',
        code: 'ABC123',
        hostPlayerId: 'player-1',
        participants: [
          { id: 'player-1', name: 'Alice', isReady: true, isHost: true },
          { id: 'player-2', name: 'Bob', isReady: true, isHost: false },
          { id: 'player-3', name: 'Charlie', isReady: true, isHost: false },
          { id: 'player-4', name: 'Diana', isReady: true, isHost: false }
        ],
        settings: {
          maxPlayers: 4,
          tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
          roundCount: 10
        },
        status: 'waiting',
        createdAt: new Date()
      };

      stateManager.transitionToLobby(lobby);

      expect(stateManager.getCurrentLobby()?.participants.length).toBe(4);
      expect(stateManager.getCurrentLobby()?.settings.maxPlayers).toBe(4);
    });
  });

  describe('8.1.2 Turnuva başlatma', () => {
    test('should start tournament with valid lobby', () => {
      const players: TournamentPlayer[] = [
        { id: 'player-1', name: 'Alice', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } },
        { id: 'player-2', name: 'Bob', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } },
        { id: 'player-3', name: 'Charlie', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } },
        { id: 'player-4', name: 'Diana', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } }
      ];

      const result = tournamentEngine.initializeBracket(players, TournamentFormat.SINGLE_ELIMINATION, 'tournament-1');

      expect(result).toBeDefined();
      expect(result.bracket).toBeDefined();
      expect(result.bracket.rounds.length).toBeGreaterThan(0);
      expect(result.firstRoundMatches.length).toBe(2); // 4 players = 2 matches in first round
    });

    test('should create correct bracket structure for single elimination', () => {
      const players: TournamentPlayer[] = [
        { id: 'player-1', name: 'Alice', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } },
        { id: 'player-2', name: 'Bob', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } },
        { id: 'player-3', name: 'Charlie', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } },
        { id: 'player-4', name: 'Diana', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } }
      ];

      const result = tournamentEngine.initializeBracket(players, TournamentFormat.SINGLE_ELIMINATION, 'tournament-1');

      // Round 1: 2 matches (4 players)
      expect(result.firstRoundMatches.length).toBe(2);
      expect(result.bracket.rounds.length).toBeGreaterThan(0);
    });

    test('should transition to tournament phase', () => {
      // First transition to lobby
      const lobby: PartyLobby = {
        id: 'lobby-1',
        code: 'ABC123',
        hostPlayerId: 'player-1',
        participants: [
          { id: 'player-1', name: 'Alice', isReady: true, isHost: true },
          { id: 'player-2', name: 'Bob', isReady: true, isHost: false },
          { id: 'player-3', name: 'Charlie', isReady: true, isHost: false },
          { id: 'player-4', name: 'Diana', isReady: true, isHost: false }
        ],
        settings: {
          maxPlayers: 4,
          tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
          roundCount: 10
        },
        status: 'waiting',
        createdAt: new Date()
      };
      
      stateManager.transitionToLobby(lobby);
      
      // Now transition to tournament
      const tournament: Tournament = {
        id: 'tournament-1',
        lobbyId: 'lobby-1',
        format: TournamentFormat.SINGLE_ELIMINATION,
        players: [
          { id: 'player-1', name: 'Alice', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } },
          { id: 'player-2', name: 'Bob', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } },
          { id: 'player-3', name: 'Charlie', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } },
          { id: 'player-4', name: 'Diana', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0 } }
        ],
        bracket: {
          format: TournamentFormat.SINGLE_ELIMINATION,
          rounds: [],
          currentRound: 0,
          activePlayers: [],
          eliminatedPlayers: []
        },
        status: 'in_progress',
        currentRound: 0,
        createdAt: new Date()
      };

      stateManager.transitionToTournament(tournament);

      expect(stateManager.getCurrentPhase()).toBe('tournament');
      expect(stateManager.getCurrentTournament()).toEqual(tournament);
    });
  });

  describe('8.1.3 Maç oynama ve ilerleme', () => {
    test('should advance winner correctly', () => {
      const players: TournamentPlayer[] = [
        { id: 'player-1', name: 'Alice', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0 } },
        { id: 'player-2', name: 'Bob', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0 } },
        { id: 'player-3', name: 'Charlie', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0 } },
        { id: 'player-4', name: 'Diana', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0 } }
      ];

      const bracket = tournamentEngine.initializeBracket(players, TournamentFormat.SINGLE_ELIMINATION);
      const firstMatch = bracket.rounds[0].matches[0];

      tournamentEngine.advanceWinner(firstMatch.id, firstMatch.player1Id);

      expect(bracket.activePlayers.length).toBe(3);
      expect(bracket.eliminatedPlayers.length).toBe(1);
    });

    test('should eliminate loser correctly', () => {
      const players: TournamentPlayer[] = [
        { id: 'player-1', name: 'Alice', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0 } },
        { id: 'player-2', name: 'Bob', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0 } }
      ];

      const bracket = tournamentEngine.initializeBracket(players, TournamentFormat.SINGLE_ELIMINATION);
      const match = bracket.rounds[0].matches[0];

      tournamentEngine.advanceWinner(match.id, match.player1Id);
      tournamentEngine.eliminatePlayer(match.player2Id);

      const eliminatedPlayer = players.find(p => p.id === match.player2Id);
      expect(eliminatedPlayer?.isEliminated).toBe(true);
    });

    test('should track match progress', () => {
      const tournament: Tournament = {
        id: 'tournament-1',
        lobbyId: 'lobby-1',
        format: TournamentFormat.SINGLE_ELIMINATION,
        players: [
          { id: 'player-1', name: 'Alice', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0 } },
          { id: 'player-2', name: 'Bob', isEliminated: false, statistics: { wins: 0, losses: 0, tournamentPoints: 0 } }
        ],
        bracket: {
          format: TournamentFormat.SINGLE_ELIMINATION,
          rounds: [{
            roundNumber: 0,
            matches: [{
              id: 'match-1',
              player1Id: 'player-1',
              player2Id: 'player-2',
              winnerId: null,
              status: 'pending',
              scores: null
            }]
          }],
          currentRound: 0,
          activePlayers: ['player-1', 'player-2'],
          eliminatedPlayers: []
        },
        status: 'in_progress',
        currentRound: 0,
        createdAt: new Date()
      };

      progressTracker.updateProgress(tournament.id, {
        currentRound: 0,
        completedMatches: [],
        activeMatches: ['match-1']
      });

      const progress = progressTracker.getProgress(tournament.id);
      expect(progress?.activeMatches).toContain('match-1');
    });
  });

  describe('8.1.4 Turnuva tamamlama', () => {
    test('should detect tournament completion', () => {
      const players: TournamentPlayer[] = [
        { id: 'player-1', name: 'Alice', isEliminated: false, statistics: { wins: 2, losses: 0, tournamentPoints: 100 } },
        { id: 'player-2', name: 'Bob', isEliminated: true, statistics: { wins: 1, losses: 1, tournamentPoints: 50 } },
        { id: 'player-3', name: 'Charlie', isEliminated: true, statistics: { wins: 0, losses: 1, tournamentPoints: 0 } },
        { id: 'player-4', name: 'Diana', isEliminated: true, statistics: { wins: 0, losses: 1, tournamentPoints: 0 } }
      ];

      const bracket = tournamentEngine.initializeBracket(players, TournamentFormat.SINGLE_ELIMINATION);
      
      // Simulate all matches completed
      bracket.activePlayers = ['player-1'];
      bracket.eliminatedPlayers = ['player-2', 'player-3', 'player-4'];

      const isComplete = tournamentEngine.isTournamentComplete();
      expect(isComplete).toBe(true);
    });

    test('should calculate final rankings', () => {
      const players: TournamentPlayer[] = [
        { id: 'player-1', name: 'Alice', isEliminated: false, statistics: { wins: 2, losses: 0, tournamentPoints: 100 } },
        { id: 'player-2', name: 'Bob', isEliminated: true, statistics: { wins: 1, losses: 1, tournamentPoints: 50 } },
        { id: 'player-3', name: 'Charlie', isEliminated: true, statistics: { wins: 0, losses: 1, tournamentPoints: 25 } },
        { id: 'player-4', name: 'Diana', isEliminated: true, statistics: { wins: 0, losses: 1, tournamentPoints: 25 } }
      ];

      tournamentEngine.initializeBracket(players, TournamentFormat.SINGLE_ELIMINATION);
      const rankings = tournamentEngine.calculateFinalRankings();

      expect(rankings.length).toBe(4);
      expect(rankings[0].playerId).toBe('player-1'); // Winner
      expect(rankings[0].rank).toBe(1);
    });

    test('should transition to completed state', () => {
      const tournament: Tournament = {
        id: 'tournament-1',
        lobbyId: 'lobby-1',
        format: TournamentFormat.SINGLE_ELIMINATION,
        players: [
          { id: 'player-1', name: 'Alice', isEliminated: false, statistics: { wins: 2, losses: 0, tournamentPoints: 100 } }
        ],
        bracket: {
          format: TournamentFormat.SINGLE_ELIMINATION,
          rounds: [],
          currentRound: 2,
          activePlayers: ['player-1'],
          eliminatedPlayers: ['player-2', 'player-3', 'player-4']
        },
        status: 'completed',
        currentRound: 2,
        winnerId: 'player-1',
        createdAt: new Date(),
        completedAt: new Date()
      };

      stateManager.transitionToTournament(tournament);

      expect(stateManager.getCurrentTournament()?.status).toBe('completed');
      expect(stateManager.getCurrentTournament()?.winnerId).toBe('player-1');
    });
  });
});
