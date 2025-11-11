import DatabaseInitializer from '../DatabaseInitializer';
import {
  PlayerRepository,
  GameSessionRepository,
  RoundRepository,
  StatisticsRepository,
} from '../repositories';
import { GameMode, AIStrategy, GamePhase, Decision } from '../../types';

describe('Database Repositories', () => {
  let playerRepo: PlayerRepository;
  let sessionRepo: GameSessionRepository;
  let roundRepo: RoundRepository;
  let statsRepo: StatisticsRepository;

  beforeAll(async () => {
    await DatabaseInitializer.initialize();
    playerRepo = new PlayerRepository();
    sessionRepo = new GameSessionRepository();
    roundRepo = new RoundRepository();
    statsRepo = new StatisticsRepository();
  });

  afterAll(async () => {
    await DatabaseInitializer.shutdown();
  });

  beforeEach(async () => {
    await DatabaseInitializer.reset();
  });

  describe('PlayerRepository', () => {
    it('should create and retrieve a player', async () => {
      const playerData = {
        name: 'Test Player',
        isAI: false,
        trustScore: 0.5,
        totalGamesPlayed: 0,
      };

      const createdPlayer = await playerRepo.create(playerData);
      expect(createdPlayer.id).toBeDefined();
      expect(createdPlayer.name).toBe(playerData.name);
      expect(createdPlayer.isAI).toBe(playerData.isAI);

      const foundPlayer = await playerRepo.findById(createdPlayer.id);
      expect(foundPlayer).toEqual(createdPlayer);
    });

    it('should update player trust score', async () => {
      const player = await playerRepo.create({
        name: 'Test Player',
        isAI: false,
        trustScore: 0.5,
        totalGamesPlayed: 0,
      });

      await playerRepo.updateTrustScore(player.id, 0.8);
      const updatedPlayer = await playerRepo.findById(player.id);
      expect(updatedPlayer?.trustScore).toBe(0.8);
    });

    it('should find players by name', async () => {
      const player = await playerRepo.create({
        name: 'Unique Player',
        isAI: false,
        trustScore: 0.5,
        totalGamesPlayed: 0,
      });

      const foundPlayer = await playerRepo.findByName('Unique Player');
      expect(foundPlayer?.id).toBe(player.id);
    });
  });

  describe('GameSessionRepository', () => {
    it('should create and retrieve a game session', async () => {
      const player1 = await playerRepo.create({
        name: 'Player 1',
        isAI: false,
        trustScore: 0.5,
        totalGamesPlayed: 0,
      });

      const player2 = await playerRepo.create({
        name: 'Player 2',
        isAI: true,
        trustScore: 0.5,
        totalGamesPlayed: 0,
      });

      const sessionConfig = {
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
        aiStrategy: AIStrategy.ADAPTIVE,
      };

      const session = await sessionRepo.create(sessionConfig, [
        player1,
        player2,
      ]);
      expect(session.id).toBeDefined();
      expect(session.players).toHaveLength(2);
      expect(session.currentPhase).toBe(GamePhase.TRUST_PHASE);

      const foundSession = await sessionRepo.findById(session.id);
      expect(foundSession?.id).toBe(session.id);
    });

    it('should update session phase', async () => {
      const player = await playerRepo.create({
        name: 'Test Player',
        isAI: false,
        trustScore: 0.5,
        totalGamesPlayed: 0,
      });

      const sessionConfig = {
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
      };

      const session = await sessionRepo.create(sessionConfig, [player]);
      await sessionRepo.updatePhase(session.id, GamePhase.COMMUNICATION_PHASE);

      const updatedSession = await sessionRepo.findById(session.id);
      expect(updatedSession?.currentPhase).toBe(GamePhase.COMMUNICATION_PHASE);
    });
  });

  describe('StatisticsRepository', () => {
    it('should create and retrieve player statistics', async () => {
      const player = await playerRepo.create({
        name: 'Test Player',
        isAI: false,
        trustScore: 0.5,
        totalGamesPlayed: 0,
      });

      const sessionConfig = {
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
      };

      const session = await sessionRepo.create(sessionConfig, [player]);

      const statistics = {
        cooperationPercentage: 75,
        betrayalPercentage: 25,
        mostFearfulRound: 3,
        totalPoints: 15,
        gamesWon: 1,
        gamesLost: 0,
        averageTrustScore: 0.8,
      };

      await statsRepo.create(player.id, session.id, statistics);

      const playerStats = await statsRepo.findByPlayerId(player.id);
      expect(playerStats).toHaveLength(1);
      expect(playerStats[0].cooperationPercentage).toBe(75);
    });

    it('should get aggregated statistics', async () => {
      const player = await playerRepo.create({
        name: 'Test Player',
        isAI: false,
        trustScore: 0.5,
        totalGamesPlayed: 0,
      });

      const sessionConfig = {
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
      };

      const session1 = await sessionRepo.create(sessionConfig, [player]);
      const session2 = await sessionRepo.create(sessionConfig, [player]);

      await statsRepo.create(player.id, session1.id, {
        cooperationPercentage: 80,
        betrayalPercentage: 20,
        totalPoints: 20,
        gamesWon: 1,
        gamesLost: 0,
        averageTrustScore: 0.8,
      });

      await statsRepo.create(player.id, session2.id, {
        cooperationPercentage: 60,
        betrayalPercentage: 40,
        totalPoints: 15,
        gamesWon: 0,
        gamesLost: 1,
        averageTrustScore: 0.6,
      });

      const aggregated = await statsRepo.getAggregatedStats(player.id);
      expect(aggregated.cooperationPercentage).toBe(70); // Average of 80 and 60
      expect(aggregated.totalPoints).toBe(35); // Sum of 20 and 15
      expect(aggregated.gamesWon).toBe(1);
      expect(aggregated.gamesLost).toBe(1);
    });
  });
});
