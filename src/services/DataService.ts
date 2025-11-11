import {
  PlayerRepository,
  GameSessionRepository,
  RoundRepository,
  StatisticsRepository,
} from '../database/repositories';
import {
  Player,
  GameSession,
  Round,
  PlayerStatistics,
  SessionConfig,
} from '../types';
import DatabaseInitializer from '../database/DatabaseInitializer';

/**
 * DataService provides a high-level interface for data operations
 * Integrates with the existing game services and database repositories
 */
export class DataService {
  private playerRepo: PlayerRepository;
  private sessionRepo: GameSessionRepository;
  private roundRepo: RoundRepository;
  private statsRepo: StatisticsRepository;
  private initialized = false;

  constructor() {
    this.playerRepo = new PlayerRepository();
    this.sessionRepo = new GameSessionRepository();
    this.roundRepo = new RoundRepository();
    this.statsRepo = new StatisticsRepository();
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      await DatabaseInitializer.initialize();
      this.initialized = true;
    }
  }

  // Player operations
  async createPlayer(name: string, isAI: boolean = false): Promise<Player> {
    await this.ensureInitialized();
    return this.playerRepo.create({
      name,
      isAI,
      trustScore: 0.5, // Default trust score
      totalGamesPlayed: 0,
    });
  }

  async getPlayer(id: string): Promise<Player | null> {
    await this.ensureInitialized();
    return this.playerRepo.findById(id);
  }

  async getPlayerByName(name: string): Promise<Player | null> {
    await this.ensureInitialized();
    return this.playerRepo.findByName(name);
  }

  async updatePlayerTrustScore(
    playerId: string,
    newScore: number
  ): Promise<void> {
    await this.ensureInitialized();
    await this.playerRepo.updateTrustScore(playerId, newScore);
  }

  async incrementPlayerGamesPlayed(playerId: string): Promise<void> {
    await this.ensureInitialized();
    await this.playerRepo.incrementGamesPlayed(playerId);
  }

  // Session operations
  async createGameSession(
    config: SessionConfig,
    players: Player[]
  ): Promise<GameSession> {
    await this.ensureInitialized();
    return this.sessionRepo.create(config, players);
  }

  async getGameSession(id: string): Promise<GameSession | null> {
    await this.ensureInitialized();
    const session = await this.sessionRepo.findById(id);
    if (session) {
      // Load rounds for the session
      session.rounds = await this.roundRepo.findBySessionId(id);
    }
    return session;
  }

  async updateSessionPhase(sessionId: string, phase: any): Promise<void> {
    await this.ensureInitialized();
    await this.sessionRepo.updatePhase(sessionId, phase);
  }

  async endGameSession(sessionId: string, winnerId?: string): Promise<void> {
    await this.ensureInitialized();
    await this.sessionRepo.endSession(sessionId, winnerId);
  }

  // Statistics operations
  async savePlayerStatistics(
    playerId: string,
    sessionId: string,
    stats: PlayerStatistics
  ): Promise<void> {
    await this.ensureInitialized();
    await this.statsRepo.create(playerId, sessionId, stats);
  }

  async getPlayerStatistics(playerId: string): Promise<PlayerStatistics> {
    await this.ensureInitialized();
    return this.statsRepo.getAggregatedStats(playerId);
  }

  async getSessionStatistics(sessionId: string): Promise<PlayerStatistics[]> {
    await this.ensureInitialized();
    return this.statsRepo.findBySessionId(sessionId);
  }

  // Utility methods
  async getTopPlayersByTrustScore(limit: number = 10): Promise<Player[]> {
    await this.ensureInitialized();
    return this.playerRepo.findTopByTrustScore(limit);
  }

  async getTopPlayersByCooperation(
    limit: number = 10
  ): Promise<Array<{ playerId: string; cooperationPercentage: number }>> {
    await this.ensureInitialized();
    return this.statsRepo.getTopPlayersByCooperation(limit);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async shutdown(): Promise<void> {
    if (this.initialized) {
      await DatabaseInitializer.shutdown();
      this.initialized = false;
    }
  }
}

// Singleton instance for easy access
let dataServiceInstance: DataService | null = null;

export function getDataService(): DataService {
  if (!dataServiceInstance) {
    dataServiceInstance = new DataService();
  }
  return dataServiceInstance;
}

export default DataService;
