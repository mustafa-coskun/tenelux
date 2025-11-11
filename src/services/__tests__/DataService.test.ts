import { DataService, getDataService } from '../DataService';
import { GameMode, AIStrategy } from '../../types';

describe('DataService', () => {
  let dataService: DataService;

  beforeAll(async () => {
    dataService = new DataService();
    await dataService.initialize();
  });

  afterAll(async () => {
    await dataService.shutdown();
  });

  beforeEach(async () => {
    // Reset database before each test
    const db = (dataService as any).playerRepo.db;
    await db.reset();
  });

  describe('Player Operations', () => {
    it('should create and retrieve players', async () => {
      const player = await dataService.createPlayer('Test Player', false);
      expect(player.id).toBeDefined();
      expect(player.name).toBe('Test Player');
      expect(player.isAI).toBe(false);

      const retrievedPlayer = await dataService.getPlayer(player.id);
      expect(retrievedPlayer).toEqual(player);
    });

    it('should find players by name', async () => {
      const player = await dataService.createPlayer('Unique Name', false);
      const foundPlayer = await dataService.getPlayerByName('Unique Name');
      expect(foundPlayer?.id).toBe(player.id);
    });

    it('should update trust scores', async () => {
      const player = await dataService.createPlayer('Test Player', false);
      await dataService.updatePlayerTrustScore(player.id, 0.8);

      const updatedPlayer = await dataService.getPlayer(player.id);
      expect(updatedPlayer?.trustScore).toBe(0.8);
    });
  });

  describe('Session Operations', () => {
    it('should create and retrieve game sessions', async () => {
      const player1 = await dataService.createPlayer('Player 1', false);
      const player2 = await dataService.createPlayer('Player 2', true);

      const sessionConfig = {
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
        aiStrategy: AIStrategy.ADAPTIVE,
      };

      const session = await dataService.createGameSession(sessionConfig, [
        player1,
        player2,
      ]);
      expect(session.id).toBeDefined();
      expect(session.players).toHaveLength(2);

      const retrievedSession = await dataService.getGameSession(session.id);
      expect(retrievedSession?.id).toBe(session.id);
    });
  });

  describe('Statistics Operations', () => {
    it('should save and retrieve player statistics', async () => {
      const player = await dataService.createPlayer('Test Player', false);
      const sessionConfig = {
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
      };

      const session = await dataService.createGameSession(sessionConfig, [
        player,
      ]);

      const stats = {
        cooperationPercentage: 75,
        betrayalPercentage: 25,
        totalPoints: 20,
        gamesWon: 1,
        gamesLost: 0,
        averageTrustScore: 0.8,
      };

      await dataService.savePlayerStatistics(player.id, session.id, stats);

      const retrievedStats = await dataService.getPlayerStatistics(player.id);
      expect(retrievedStats.cooperationPercentage).toBe(75);
      expect(retrievedStats.totalPoints).toBe(20);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getDataService();
      const instance2 = getDataService();
      expect(instance1).toBe(instance2);
    });
  });
});
