import { PlayerManager } from '../PlayerManager';
import { TrustScoreEngine } from '../TrustScoreEngine';
import {
  Player,
  SessionResult,
  GameSession,
  Decision,
  GamePhase,
  GameMode,
  PlayerCredentials,
} from '../../types';

describe('PlayerManager', () => {
  let playerManager: PlayerManager;

  beforeEach(() => {
    playerManager = new PlayerManager();
  });

  describe('createPlayer', () => {
    it('should create a new player with default trust score', () => {
      const player = playerManager.createPlayer('TestPlayer', false);

      expect(player.name).toBe('TestPlayer');
      expect(player.isAI).toBe(false);
      expect(player.trustScore).toBe(50);
      expect(player.totalGamesPlayed).toBe(0);
      expect(player.id).toBeDefined();
      expect(player.createdAt).toBeInstanceOf(Date);
    });

    it('should create an AI player', () => {
      const player = playerManager.createPlayer('AIPlayer', true);

      expect(player.name).toBe('AIPlayer');
      expect(player.isAI).toBe(true);
      expect(player.trustScore).toBe(50);
    });

    it('should throw error for duplicate player names', () => {
      playerManager.createPlayer('TestPlayer', false);

      expect(() => {
        playerManager.createPlayer('TestPlayer', false);
      }).toThrow('Player with name "TestPlayer" already exists');
    });
  });

  describe('authenticatePlayer', () => {
    it('should authenticate existing player', () => {
      const originalPlayer = playerManager.createPlayer('TestPlayer', false);
      const credentials: PlayerCredentials = { username: 'TestPlayer' };

      const authenticatedPlayer = playerManager.authenticatePlayer(credentials);

      expect(authenticatedPlayer.id).toBe(originalPlayer.id);
      expect(authenticatedPlayer.name).toBe('TestPlayer');
    });

    it('should throw error for non-existent player', () => {
      const credentials: PlayerCredentials = { username: 'NonExistent' };

      expect(() => {
        playerManager.authenticatePlayer(credentials);
      }).toThrow('Player not found');
    });
  });

  describe('getPlayer', () => {
    it('should return player by ID', () => {
      const originalPlayer = playerManager.createPlayer('TestPlayer', false);
      const retrievedPlayer = playerManager.getPlayer(originalPlayer.id);

      expect(retrievedPlayer).not.toBeNull();
      expect(retrievedPlayer!.id).toBe(originalPlayer.id);
      expect(retrievedPlayer!.name).toBe('TestPlayer');
    });

    it('should return null for non-existent player', () => {
      const retrievedPlayer = playerManager.getPlayer('non-existent-id');
      expect(retrievedPlayer).toBeNull();
    });
  });

  describe('getPlayerByName', () => {
    it('should return player by name', () => {
      const originalPlayer = playerManager.createPlayer('TestPlayer', false);
      const retrievedPlayer = playerManager.getPlayerByName('TestPlayer');

      expect(retrievedPlayer).not.toBeNull();
      expect(retrievedPlayer!.id).toBe(originalPlayer.id);
      expect(retrievedPlayer!.name).toBe('TestPlayer');
    });

    it('should return null for non-existent player name', () => {
      const retrievedPlayer = playerManager.getPlayerByName('NonExistent');
      expect(retrievedPlayer).toBeNull();
    });
  });

  describe('updateTrustScore', () => {
    it('should increase trust score for high cooperation', () => {
      const player = playerManager.createPlayer('TestPlayer', false);
      const sessionResult = createMockSessionResult(player, 0.8); // 80% cooperation

      playerManager.updateTrustScore(player.id, sessionResult);

      const updatedPlayer = playerManager.getPlayer(player.id);
      expect(updatedPlayer!.trustScore).toBeGreaterThan(50);
      expect(updatedPlayer!.totalGamesPlayed).toBe(1);
    });

    it('should decrease trust score for low cooperation', () => {
      const player = playerManager.createPlayer('TestPlayer', false);
      const sessionResult = createMockSessionResult(player, 0.2); // 20% cooperation

      playerManager.updateTrustScore(player.id, sessionResult);

      const updatedPlayer = playerManager.getPlayer(player.id);
      expect(updatedPlayer!.trustScore).toBeLessThan(50);
      expect(updatedPlayer!.totalGamesPlayed).toBe(1);
    });

    it('should award trustworthy title for high cooperation with few confessions', () => {
      const player = playerManager.createPlayer('TestPlayer', false);
      const sessionResult = createMockSessionResultWithSpecificDecisions(
        player,
        [
          Decision.STAY_SILENT,
          Decision.STAY_SILENT,
          Decision.CONFESS,
          Decision.STAY_SILENT,
          Decision.STAY_SILENT,
        ]
      );

      playerManager.updateTrustScore(player.id, sessionResult);

      const titles = playerManager.getTrustworthyTitles(player.id);
      expect(titles.length).toBe(1);
      expect(titles[0].sessionId).toBe(sessionResult.session.id);
    });

    it('should not award trustworthy title for too many confessions', () => {
      const player = playerManager.createPlayer('TestPlayer', false);
      const sessionResult = createMockSessionResultWithSpecificDecisions(
        player,
        [
          Decision.CONFESS,
          Decision.CONFESS,
          Decision.CONFESS,
          Decision.STAY_SILENT,
          Decision.STAY_SILENT,
        ]
      );

      playerManager.updateTrustScore(player.id, sessionResult);

      const titles = playerManager.getTrustworthyTitles(player.id);
      expect(titles.length).toBe(0);
    });
  });

  describe('getPlayerStats', () => {
    it('should return basic player statistics', () => {
      const player = playerManager.createPlayer('TestPlayer', false);
      const stats = playerManager.getPlayerStats(player.id);

      expect(stats.cooperationPercentage).toBe(0);
      expect(stats.betrayalPercentage).toBe(100); // 100% because avgCooperationRate is 0
      expect(stats.averageTrustScore).toBe(50);
    });
  });

  describe('getTrustScoreHistory', () => {
    it('should return trust score history', () => {
      const player = playerManager.createPlayer('TestPlayer', false);
      const history = playerManager.getTrustScoreHistory(player.id);

      expect(history.length).toBe(1);
      expect(history[0].score).toBe(50);
      expect(history[0].sessionId).toBe('initial');
    });

    it('should update history after session', () => {
      const player = playerManager.createPlayer('TestPlayer', false);
      const sessionResult = createMockSessionResult(player, 0.8);

      playerManager.updateTrustScore(player.id, sessionResult);

      const history = playerManager.getTrustScoreHistory(player.id);
      expect(history.length).toBe(2);
      expect(history[1].sessionId).toBe(sessionResult.session.id);
      expect(history[1].cooperationRate).toBe(0.8);
    });
  });

  describe('getTrustCategory', () => {
    it('should return correct trust category', () => {
      const player = playerManager.createPlayer('TestPlayer', false);
      const category = playerManager.getTrustCategory(player.id);

      expect(category).toBe('Neutral'); // 50 score should be neutral
    });
  });

  describe('getAllPlayers', () => {
    it('should return all players', () => {
      playerManager.createPlayer('Player1', false);
      playerManager.createPlayer('Player2', true);

      const allPlayers = playerManager.getAllPlayers();
      expect(allPlayers.length).toBe(2);
      expect(allPlayers.some((p) => p.name === 'Player1')).toBe(true);
      expect(allPlayers.some((p) => p.name === 'Player2')).toBe(true);
    });
  });

  // Helper functions
  function createMockSessionResult(
    player: Player,
    cooperationRate: number
  ): SessionResult {
    const totalRounds = 5;
    const cooperativeRounds = Math.floor(totalRounds * cooperationRate);
    const rounds = [];

    for (let i = 0; i < totalRounds; i++) {
      const decision =
        i < cooperativeRounds ? Decision.STAY_SILENT : Decision.CONFESS;
      rounds.push({
        roundNumber: i + 1,
        decisions: [
          {
            playerId: player.id,
            decision,
            timestamp: new Date(),
            canReverse: false,
          },
        ],
        results: { playerA: 3, playerB: 3 },
        timestamp: new Date(),
        phaseType: GamePhase.TRUST_PHASE,
      });
    }

    const session: GameSession = {
      id: `session_${Date.now()}`,
      players: [player],
      rounds,
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig: {
        maxRounds: 5,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: false,
        gameMode: GameMode.SINGLE_PLAYER,
      },
    };

    return {
      session,
      finalScores: { [player.id]: 15 },
      winner: player,
      statistics: {
        cooperationPercentage: cooperationRate * 100,
        betrayalPercentage: (1 - cooperationRate) * 100,
        totalPoints: 15,
        gamesWon: 1,
        gamesLost: 0,
        averageTrustScore: 50,
      },
    };
  }

  function createMockSessionResultWithSpecificDecisions(
    player: Player,
    decisions: Decision[]
  ): SessionResult {
    const rounds = decisions.map((decision, index) => ({
      roundNumber: index + 1,
      decisions: [
        {
          playerId: player.id,
          decision,
          timestamp: new Date(),
          canReverse: false,
        },
      ],
      results: { playerA: 3, playerB: 3 },
      timestamp: new Date(),
      phaseType: GamePhase.TRUST_PHASE,
    }));

    const cooperationRate =
      decisions.filter((d) => d === Decision.STAY_SILENT).length /
      decisions.length;

    const session: GameSession = {
      id: `session_${Date.now()}`,
      players: [player],
      rounds,
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig: {
        maxRounds: decisions.length,
        trustPhaseRounds: decisions.length,
        communicationTimeLimit: 60,
        allowDecisionReversal: false,
        gameMode: GameMode.SINGLE_PLAYER,
      },
    };

    return {
      session,
      finalScores: { [player.id]: 15 },
      winner: player,
      statistics: {
        cooperationPercentage: cooperationRate * 100,
        betrayalPercentage: (1 - cooperationRate) * 100,
        totalPoints: 15,
        gamesWon: 1,
        gamesLost: 0,
        averageTrustScore: 50,
      },
    };
  }
});
