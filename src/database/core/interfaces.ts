// Core database interfaces

import { DatabaseConfig } from '../../config/database';

// Query criteria for filtering
export interface QueryCriteria {
  [key: string]: any;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

// Query result interface
export interface QueryResult {
  affectedRows: number;
  insertId?: string | number;
  lastInsertRowid?: string | number;
  changes?: number;
}

// Transaction interface
export interface ITransaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<QueryResult>;
}

// Database health status
export interface DatabaseHealth {
  isConnected: boolean;
  responseTime: number;
  activeConnections: number;
  totalConnections: number;
  lastError?: string;
  uptime: number;
}

// Migration interface
export interface Migration {
  version: string;
  name: string;
  up: (adapter: IDatabaseAdapter) => Promise<void>;
  down: (adapter: IDatabaseAdapter) => Promise<void>;
}

// Database adapter interface
export interface IDatabaseAdapter {
  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<QueryResult>;
  beginTransaction(): Promise<ITransaction>;
  migrate(migrations: Migration[]): Promise<void>;
  healthCheck(): Promise<DatabaseHealth>;
  isConnected(): boolean;
}

// Repository interface
export interface IRepository<T> {
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  findById(id: string): Promise<T | null>;
  findBy(criteria: QueryCriteria): Promise<T[]>;
  findOne(criteria: QueryCriteria): Promise<T | null>;
  update(id: string, updates: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  count(criteria?: QueryCriteria): Promise<number>;
  exists(id: string): Promise<boolean>;
}

// Repository type enum
export enum RepositoryType {
  USER = 'user',
  SESSION = 'session',
  GAME = 'game',
  TOURNAMENT = 'tournament'
}

// Database manager interface
export interface IDatabaseManager {
  initialize(): Promise<void>;
  getRepository<T>(repositoryType: RepositoryType): IRepository<T>;
  beginTransaction(): Promise<ITransaction>;
  healthCheck(): Promise<DatabaseHealth>;
  close(): Promise<void>;
  isInitialized(): boolean;
}

// Specific repository interfaces
export interface IUserRepository extends IRepository<any> {
  findByUsername(username: string): Promise<any | null>;
  findByEmail(email: string): Promise<any | null>;
  updateLastActive(userId: string): Promise<void>;
  findActiveUsers(limit?: number): Promise<any[]>;
  updateStats(userId: string, stats: any): Promise<void>;
}

export interface ISessionRepository extends IRepository<any> {
  findByToken(token: string): Promise<any | null>;
  cleanupExpired(): Promise<number>;
  findByUserId(userId: string): Promise<any[]>;
  invalidateUserSessions(userId: string): Promise<number>;
  extendSession(sessionId: string, expiresAt: Date): Promise<void>;
}

export interface IGameRepository extends IRepository<any> {
  findByPlayerId(playerId: string): Promise<any[]>;
  findActiveMatches(): Promise<any[]>;
  updateGameStats(gameId: string, stats: any): Promise<void>;
  findRecentGames(playerId: string, limit?: number): Promise<any[]>;
  findGamesByType(gameType: string): Promise<any[]>;
}