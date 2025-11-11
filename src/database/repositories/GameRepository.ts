// Game repository implementation

import { BaseRepository } from './BaseRepository';
import { IGameRepository, IDatabaseAdapter } from '../core/interfaces';
import { Game, GamePlayer, GameSettings, GameResults } from '../core/types';
import { ValidationError, NotFoundError } from '../core/errors';

export class GameRepository extends BaseRepository<Game> implements IGameRepository {
  constructor(adapter: IDatabaseAdapter) {
    super(adapter, 'games');
  }

  protected getIdField(): string {
    return 'id';
  }

  protected mapRowToEntity(row: any): Game {
    return {
      id: row.id,
      type: row.type,
      players: this.parseJsonField(row.players, []),
      status: row.status,
      settings: this.parseJsonField(row.settings, this.getDefaultSettings()),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      results: this.parseJsonField(row.results, undefined),
      lobbyCode: row.lobby_code,
      currentRound: row.current_round,
      decisions: this.parseDecisions(row.decisions),
      metadata: this.parseJsonField(row.metadata, undefined),
      gameMode: row.game_mode || 'multi',
      affectsStats: row.affects_stats !== undefined ? Boolean(row.affects_stats) : true,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  protected mapEntityToRow(entity: Partial<Game>): any {
    const row: any = {};

    if (entity.id !== undefined) row.id = entity.id;
    if (entity.type !== undefined) row.type = entity.type;
    if (entity.players !== undefined) row.players = JSON.stringify(entity.players);
    if (entity.status !== undefined) row.status = entity.status;
    if (entity.settings !== undefined) row.settings = JSON.stringify(entity.settings);
    if (entity.startedAt !== undefined) row.started_at = entity.startedAt?.toISOString();
    if (entity.completedAt !== undefined) row.completed_at = entity.completedAt?.toISOString();
    if (entity.results !== undefined) row.results = JSON.stringify(entity.results);
    if (entity.lobbyCode !== undefined) row.lobby_code = entity.lobbyCode;
    if (entity.currentRound !== undefined) row.current_round = entity.currentRound;
    if (entity.decisions !== undefined) row.decisions = this.stringifyDecisions(entity.decisions);
    if (entity.metadata !== undefined) row.metadata = JSON.stringify(entity.metadata);

    return row;
  }

  protected validateEntity(entity: Partial<Game>): void {
    if (entity.type !== undefined) {
      const validTypes = ['single', 'tournament', 'party', 'ranked'];
      if (!validTypes.includes(entity.type)) {
        throw new ValidationError('Invalid game type');
      }
    }

    if (entity.status !== undefined) {
      const validStatuses = ['waiting', 'starting', 'in_progress', 'paused', 'completed', 'cancelled', 'abandoned'];
      if (!validStatuses.includes(entity.status)) {
        throw new ValidationError('Invalid game status');
      }
    }

    if (entity.players !== undefined) {
      if (!Array.isArray(entity.players)) {
        throw new ValidationError('Players must be an array');
      }
      if (entity.players.length === 0) {
        throw new ValidationError('Game must have at least one player');
      }
      if (entity.players.length > 16) {
        throw new ValidationError('Game cannot have more than 16 players');
      }

      // Validate each player
      entity.players.forEach((player, index) => {
        if (!player.id || !player.name) {
          throw new ValidationError(`Player ${index} must have id and name`);
        }
        if (!player.status) {
          throw new ValidationError(`Player ${index} must have a status`);
        }
      });
    }

    if (entity.settings !== undefined) {
      this.validateGameSettings(entity.settings);
    }

    if (entity.currentRound !== undefined) {
      if (entity.currentRound < 0) {
        throw new ValidationError('Current round cannot be negative');
      }
    }

    if (entity.lobbyCode !== undefined && entity.lobbyCode) {
      if (entity.lobbyCode.length !== 6) {
        throw new ValidationError('Lobby code must be 6 characters');
      }
    }
  }

  // IGameRepository specific methods
  async findByPlayerId(playerId: string): Promise<Game[]> {
    if (!playerId) {
      return [];
    }

    // Use JSON_EXTRACT to search within the players JSON array
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE JSON_EXTRACT(players, '$[*].id') LIKE ?
      ORDER BY created_at DESC
    `;

    const rows = await this.adapter.query<any>(sql, [`%"${playerId}"%`]);
    return rows
      .map(row => this.mapRowToEntity(row))
      .filter(game => game.players.some(player => player.id === playerId));
  }

  async findActiveMatches(): Promise<Game[]> {
    return this.findBy({
      status: ['in_progress', 'starting'],
      orderBy: 'started_at',
      orderDirection: 'DESC'
    });
  }

  async updateGameStats(gameId: string, stats: any): Promise<void> {
    const game = await this.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found', { gameId });
    }

    const updatedMetadata = {
      ...game.metadata,
      stats
    };

    await this.update(gameId, { metadata: updatedMetadata });
  }

  async findRecentGames(playerId: string, limit: number = 20): Promise<Game[]> {
    const games = await this.findByPlayerId(playerId);
    return games
      .filter(game => game.status === 'completed')
      .slice(0, limit);
  }

  async findGamesByType(gameType: string): Promise<Game[]> {
    return this.findBy({
      type: gameType,
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
  }

  // Game management methods
  async createGame(gameData: {
    type: Game['type'];
    players: GamePlayer[];
    settings: GameSettings;
    lobbyCode?: string;
    metadata?: any;
  }): Promise<Game> {
    const game: Omit<Game, 'id' | 'createdAt' | 'updatedAt'> = {
      type: gameData.type,
      players: gameData.players,
      status: 'waiting',
      settings: gameData.settings,
      lobbyCode: gameData.lobbyCode,
      currentRound: 0,
      decisions: new Map(),
      metadata: gameData.metadata,
      gameMode: 'multi',
      affectsStats: true
    };

    return this.create(game);
  }

  async startGame(gameId: string): Promise<void> {
    const game = await this.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found', { gameId });
    }

    if (game.status !== 'waiting') {
      throw new ValidationError('Game cannot be started from current status');
    }

    await this.update(gameId, {
      status: 'in_progress',
      startedAt: new Date()
    });
  }

  async completeGame(gameId: string, results: GameResults): Promise<void> {
    const game = await this.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found', { gameId });
    }

    if (game.status !== 'in_progress') {
      throw new ValidationError('Game cannot be completed from current status');
    }

    await this.update(gameId, {
      status: 'completed',
      completedAt: new Date(),
      results
    });
  }

  async cancelGame(gameId: string, reason?: string): Promise<void> {
    const game = await this.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found', { gameId });
    }

    if (game.status === 'completed') {
      throw new ValidationError('Cannot cancel completed game');
    }

    const metadata = {
      ...game.metadata,
      cancellationReason: reason,
      cancelledAt: new Date().toISOString()
    };

    await this.update(gameId, {
      status: 'cancelled',
      metadata
    });
  }

  async updateGameRound(gameId: string, round: number, decisions?: Map<number, any>): Promise<void> {
    const updates: Partial<Game> = { currentRound: round };
    
    if (decisions) {
      updates.decisions = decisions;
    }

    await this.update(gameId, updates);
  }

  async addPlayerToGame(gameId: string, player: GamePlayer): Promise<void> {
    const game = await this.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found', { gameId });
    }

    if (game.status !== 'waiting') {
      throw new ValidationError('Cannot add player to game that has already started');
    }

    if (game.players.length >= game.settings.maxPlayers) {
      throw new ValidationError('Game is full');
    }

    if (game.players.some(p => p.id === player.id)) {
      throw new ValidationError('Player is already in the game');
    }

    const updatedPlayers = [...game.players, player];
    await this.update(gameId, { players: updatedPlayers });
  }

  async removePlayerFromGame(gameId: string, playerId: string): Promise<void> {
    const game = await this.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found', { gameId });
    }

    const updatedPlayers = game.players.filter(p => p.id !== playerId);
    
    if (updatedPlayers.length === game.players.length) {
      throw new NotFoundError('Player not found in game', { playerId });
    }

    await this.update(gameId, { players: updatedPlayers });
  }

  async updatePlayerStatus(gameId: string, playerId: string, status: GamePlayer['status']): Promise<void> {
    const game = await this.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found', { gameId });
    }

    const updatedPlayers = game.players.map(player => 
      player.id === playerId ? { ...player, status } : player
    );

    if (JSON.stringify(updatedPlayers) === JSON.stringify(game.players)) {
      throw new NotFoundError('Player not found in game', { playerId });
    }

    await this.update(gameId, { players: updatedPlayers });
  }

  async findGamesByLobbyCode(lobbyCode: string): Promise<Game[]> {
    if (!lobbyCode) {
      return [];
    }

    return this.findBy({
      lobby_code: lobbyCode,
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
  }

  async findGamesByStatus(status: Game['status'], limit: number = 100): Promise<Game[]> {
    return this.findBy({
      status,
      limit,
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
  }

  async getGameStatistics(): Promise<{
    totalGames: number;
    activeGames: number;
    completedGames: number;
    cancelledGames: number;
    averageGameDuration: number;
    gamesPerType: { [type: string]: number };
    playersPerGame: number;
  }> {
    const [
      totalGames,
      activeGames,
      completedGames,
      cancelledGames,
      durationResult,
      typeStats,
      playerStats
    ] = await Promise.all([
      this.count(),
      this.count({ status: 'in_progress' }),
      this.count({ status: 'completed' }),
      this.count({ status: 'cancelled' }),
      this.adapter.query<{ avg_duration: number }>(`
        SELECT AVG(
          (julianday(completed_at) - julianday(started_at)) * 24 * 60 * 60 * 1000
        ) as avg_duration
        FROM ${this.tableName}
        WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
      `),
      this.adapter.query<{ type: string; count: number }>(`
        SELECT type, COUNT(*) as count
        FROM ${this.tableName}
        GROUP BY type
      `),
      this.adapter.query<{ avg_players: number }>(`
        SELECT AVG(JSON_ARRAY_LENGTH(players)) as avg_players
        FROM ${this.tableName}
      `)
    ]);

    const gamesPerType = typeStats.reduce((acc, stat) => {
      acc[stat.type] = stat.count;
      return acc;
    }, {} as { [type: string]: number });

    return {
      totalGames,
      activeGames,
      completedGames,
      cancelledGames,
      averageGameDuration: durationResult[0]?.avg_duration || 0,
      gamesPerType,
      playersPerGame: playerStats[0]?.avg_players || 0
    };
  }

  // Utility methods
  private parseJsonField<T>(field: string | null, defaultValue: T): T {
    if (!field) {
      return defaultValue;
    }

    try {
      return JSON.parse(field);
    } catch {
      return defaultValue;
    }
  }

  private parseDecisions(decisionsStr: string | null): Map<number, any> {
    if (!decisionsStr) {
      return new Map();
    }

    try {
      const obj = JSON.parse(decisionsStr);
      const map = new Map();
      
      Object.entries(obj).forEach(([key, value]) => {
        map.set(parseInt(key), value);
      });
      
      return map;
    } catch {
      return new Map();
    }
  }

  private stringifyDecisions(decisions: Map<number, any>): string {
    const obj: { [key: string]: any } = {};
    
    decisions.forEach((value, key) => {
      obj[key.toString()] = value;
    });
    
    return JSON.stringify(obj);
  }

  private getDefaultSettings(): GameSettings {
    return {
      maxPlayers: 4,
      roundCount: 10,
      timePerRound: 30,
      allowSpectators: true,
      isPrivate: false,
      gameMode: 'classic'
    };
  }

  private validateGameSettings(settings: GameSettings): void {
    if (settings.maxPlayers < 2 || settings.maxPlayers > 16) {
      throw new ValidationError('Max players must be between 2 and 16');
    }

    if (settings.roundCount < 1 || settings.roundCount > 50) {
      throw new ValidationError('Round count must be between 1 and 50');
    }

    if (settings.timePerRound < 5 || settings.timePerRound > 300) {
      throw new ValidationError('Time per round must be between 5 and 300 seconds');
    }

    const validGameModes = ['classic', 'tournament', 'party', 'ranked'];
    if (!validGameModes.includes(settings.gameMode)) {
      throw new ValidationError('Invalid game mode');
    }

    if (settings.difficulty) {
      const validDifficulties = ['easy', 'medium', 'hard'];
      if (!validDifficulties.includes(settings.difficulty)) {
        throw new ValidationError('Invalid difficulty level');
      }
    }
  }
}