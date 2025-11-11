// Database manager implementation

import { 
  IDatabaseManager, 
  IRepository, 
  ITransaction, 
  DatabaseHealth, 
  RepositoryType 
} from './core/interfaces';
import { IDatabaseAdapter, getAdapterFactory } from './adapters/IDatabaseAdapter';
import { getConnectionManager, ConnectionPool } from './core/ConnectionManager';
import { getTransactionManager, ManagedTransaction } from './core/TransactionManager';
import { UserRepository } from './repositories/UserRepository';
import { SessionRepository } from './repositories/SessionRepository';
import { GameRepository } from './repositories/GameRepository';
import { DatabaseConfig, getValidatedConfig } from '../config';
import { getLogger } from '../services/LoggingService';
import { 
  ConnectionError, 
  ConfigurationError, 
  MigrationError 
} from './core/errors';
import { performanceCollector, PerformanceTimer } from '../utils/performance';
import { MigrationRunner, migrations } from './migrations';

export class DatabaseManager implements IDatabaseManager {
  private adapter?: IDatabaseAdapter;
  private connectionPool?: ConnectionPool;
  private repositories = new Map<RepositoryType, IRepository<any>>();
  private _isInitialized = false;
  private config?: DatabaseConfig;
  private logger = getLogger();

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing database manager...');
      
      // Get and validate configuration
      const envConfig = getValidatedConfig();
      this.config = envConfig.database;
      
      // Create adapter
      const factory = getAdapterFactory();
      this.adapter = factory.createAdapter(this.config.type);
      
      // Connect to database
      await this.adapter.connect(this.config);
      
      // Run migrations
      await this.runMigrations();
      
      // Set up connection pool if needed
      if (this.config.poolSize && this.config.poolSize > 1) {
        const connectionManager = getConnectionManager();
        this.connectionPool = connectionManager.getPool('default', this.config, {
          minConnections: Math.max(1, Math.floor(this.config.poolSize / 4)),
          maxConnections: this.config.poolSize,
          acquireTimeoutMs: this.config.timeout || 30000,
          validateOnBorrow: true
        });
      }
      
      // Initialize repositories
      this.initializeRepositories();
      
      // Run health check
      const health = await this.healthCheck();
      if (!health.isConnected) {
        throw new ConnectionError('Database health check failed after initialization');
      }
      
      this._isInitialized = true;
      this.logger.info('Database manager initialized successfully', {
        type: this.config.type,
        poolSize: this.config.poolSize,
        healthCheck: health
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize database manager', error as Error);
      throw error instanceof Error ? error : 
        new ConfigurationError('Database initialization failed', { error });
    }
  }

  getRepository<T>(repositoryType: RepositoryType): IRepository<T> {
    if (!this.isInitialized) {
      throw new ConfigurationError('Database manager not initialized');
    }

    const repository = this.repositories.get(repositoryType);
    if (!repository) {
      throw new ConfigurationError(`Repository not found: ${repositoryType}`);
    }

    return repository as IRepository<T>;
  }

  async beginTransaction(): Promise<ITransaction> {
    if (!this.isInitialized || !this.adapter) {
      throw new ConfigurationError('Database manager not initialized');
    }

    const transactionManager = getTransactionManager();
    return transactionManager.beginTransaction(this.adapter, {
      timeout: this.config?.timeout,
      retryOnDeadlock: true,
      maxRetries: 3
    });
  }

  async healthCheck(): Promise<DatabaseHealth> {
    if (!this.adapter) {
      return {
        isConnected: false,
        responseTime: 0,
        activeConnections: 0,
        totalConnections: 0,
        uptime: 0,
        lastError: 'Database adapter not initialized'
      };
    }

    try {
      const health = await this.adapter.healthCheck();
      
      // Add connection pool information if available
      if (this.connectionPool) {
        const poolStatus = this.connectionPool.getStatus();
        health.activeConnections = poolStatus.activeConnections;
        health.totalConnections = poolStatus.totalConnections;
      }
      
      return health;
    } catch (error) {
      this.logger.error('Database health check failed', error as Error);
      return {
        isConnected: false,
        responseTime: 0,
        activeConnections: 0,
        totalConnections: 0,
        uptime: 0,
        lastError: (error as Error).message
      };
    }
  }

  async close(): Promise<void> {
    try {
      this.logger.info('Closing database manager...');
      
      // Clear repositories
      this.repositories.clear();
      
      // Close connection pool
      if (this.connectionPool) {
        await this.connectionPool.destroy();
        this.connectionPool = undefined;
      }
      
      // Disconnect adapter
      if (this.adapter) {
        await this.adapter.disconnect();
        this.adapter = undefined;
      }
      
      this._isInitialized = false;
      this.config = undefined;
      
      this.logger.info('Database manager closed successfully');
    } catch (error) {
      this.logger.error('Error closing database manager', error as Error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this._isInitialized;
  }

  // Migration methods
  async runMigrations(): Promise<void> {
    if (!this.adapter) {
      throw new ConfigurationError('Database adapter not available');
    }

    try {
      this.logger.info('Starting database migrations...');
      const migrationRunner = new MigrationRunner(this.adapter);
      await migrationRunner.runPendingMigrations();
      this.logger.info('Database migrations completed successfully');
    } catch (error) {
      this.logger.error('Database migration failed', error as Error);
      throw new MigrationError('Migration process failed', { error: (error as Error).message });
    }
  }

  async getMigrationStatus(): Promise<any> {
    if (!this.adapter) {
      throw new ConfigurationError('Database adapter not available');
    }

    const migrationRunner = new MigrationRunner(this.adapter);
    return migrationRunner.getMigrationStatus();
  }

  async rollbackMigration(version: string): Promise<void> {
    if (!this.adapter) {
      throw new ConfigurationError('Database adapter not available');
    }

    const migrationRunner = new MigrationRunner(this.adapter);
    await migrationRunner.rollbackMigration(version);
  }

  async executeRawQuery<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this._isInitialized || !this.adapter) {
      throw new ConfigurationError('Database manager not initialized');
    }

    return this.adapter.query<T>(sql, params);
  }

  async executeRawCommand(sql: string, params?: any[]): Promise<any> {
    if (!this._isInitialized || !this.adapter) {
      throw new ConfigurationError('Database manager not initialized');
    }

    return this.adapter.execute(sql, params);
  }

  getConfiguration(): DatabaseConfig | undefined {
    return this.config;
  }

  getAdapter(): IDatabaseAdapter | undefined {
    return this.adapter;
  }

  async getStatistics(): Promise<{
    database: DatabaseHealth;
    repositories: { [key: string]: any };
    connectionPool?: any;
    transactions?: any;
  }> {
    const stats: any = {
      database: await this.healthCheck(),
      repositories: {}
    };

    // Get repository statistics if available
    for (const [type, repository] of this.repositories.entries()) {
      if (typeof (repository as any).getStats === 'function') {
        stats.repositories[type] = await (repository as any).getStats();
      }
    }

    // Get connection pool statistics
    if (this.connectionPool) {
      stats.connectionPool = this.connectionPool.getStats();
    }

    // Get transaction statistics
    const transactionManager = getTransactionManager();
    stats.transactions = transactionManager.getStats();

    return stats;
  }

  // Transaction utilities
  async withTransaction<T>(
    fn: (transaction: ITransaction) => Promise<T>
  ): Promise<T> {
    const transactionManager = getTransactionManager();
    return transactionManager.withTransaction(this.adapter!, fn, {
      timeout: this.config?.timeout,
      retryOnDeadlock: true,
      maxRetries: 3
    });
  }

  async withParallelTransactions<T>(
    operations: Array<(transaction: ITransaction) => Promise<T>>
  ): Promise<T[]> {
    const transactionManager = getTransactionManager();
    return transactionManager.withParallelTransactions(this.adapter!, operations, {
      timeout: this.config?.timeout,
      retryOnDeadlock: true,
      maxRetries: 3
    });
  }

  // Repository factory methods
  getUserRepository(): UserRepository {
    return this.getRepository<any>(RepositoryType.USER) as UserRepository;
  }

  getSessionRepository(): SessionRepository {
    return this.getRepository<any>(RepositoryType.SESSION) as SessionRepository;
  }

  getGameRepository(): GameRepository {
    return this.getRepository<any>(RepositoryType.GAME) as GameRepository;
  }

  // Maintenance operations
  async vacuum(): Promise<void> {
    if (!this.isInitialized || !this.adapter) {
      throw new ConfigurationError('Database manager not initialized');
    }

    // SQLite specific operation
    if (this.config?.type === 'sqlite' && typeof (this.adapter as any).vacuum === 'function') {
      this.logger.info('Running database vacuum...');
      await (this.adapter as any).vacuum();
      this.logger.info('Database vacuum completed');
    }
  }

  async analyze(): Promise<void> {
    if (!this.isInitialized || !this.adapter) {
      throw new ConfigurationError('Database manager not initialized');
    }

    // SQLite specific operation
    if (this.config?.type === 'sqlite' && typeof (this.adapter as any).analyze === 'function') {
      this.logger.info('Running database analyze...');
      await (this.adapter as any).analyze();
      this.logger.info('Database analyze completed');
    }
  }

  async cleanup(): Promise<{
    expiredSessions: number;
    inactiveGames: number;
    oldLogs: number;
  }> {
    if (!this._isInitialized) {
      throw new ConfigurationError('Database manager not initialized');
    }

    this.logger.info('Starting database cleanup...');
    
    const results = {
      expiredSessions: 0,
      inactiveGames: 0,
      oldLogs: 0
    };

    try {
      // Clean up expired sessions
      const sessionRepo = this.getSessionRepository();
      results.expiredSessions = await sessionRepo.cleanupExpired();
      results.expiredSessions += await sessionRepo.cleanupInactiveSessions(24);

      // Clean up old completed/cancelled games (older than 30 days)
      const gameRepo = this.getGameRepository();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      results.inactiveGames = await gameRepo.deleteMany({
        status: ['completed', 'cancelled'],
        updated_at: {
          operator: '<',
          value: thirtyDaysAgo.toISOString()
        }
      });

      this.logger.info('Database cleanup completed', results);
    } catch (error) {
      this.logger.error('Database cleanup failed', error as Error);
      throw error;
    }

    return results;
  }

  async optimize(): Promise<{
    vacuum: boolean;
    analyze: boolean;
    reindex: boolean;
    duration: number;
  }> {
    if (!this._isInitialized) {
      throw new ConfigurationError('Database manager not initialized');
    }

    const timer = new PerformanceTimer('DATABASE_OPTIMIZATION');
    const results = {
      vacuum: false,
      analyze: false,
      reindex: false,
      duration: 0
    };

    try {
      this.logger.info('Starting database optimization...');

      // Run vacuum
      timer.checkpoint('vacuum_start');
      await this.vacuum();
      results.vacuum = true;
      timer.checkpoint('vacuum_end');

      // Run analyze
      timer.checkpoint('analyze_start');
      await this.analyze();
      results.analyze = true;
      timer.checkpoint('analyze_end');

      // Reindex if supported
      if (this.config?.type === 'sqlite' && typeof (this.adapter as any).reindex === 'function') {
        timer.checkpoint('reindex_start');
        await (this.adapter as any).reindex();
        results.reindex = true;
        timer.checkpoint('reindex_end');
      }

      results.duration = timer.end({ success: true });
      this.logger.info('Database optimization completed', results);

    } catch (error) {
      results.duration = timer.end({ success: false, error: (error as Error).message });
      this.logger.error('Database optimization failed', error as Error);
      throw error;
    }

    return results;
  }

  // Performance monitoring wrapper for queries
  async executeWithMonitoring<T>(
    operation: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const timer = new PerformanceTimer(`DB_${operation}`);
    
    try {
      const result = await queryFn();
      const duration = timer.end({ success: true });
      
      // Record performance metrics
      performanceCollector.recordDatabaseQuery(duration);
      
      // Log slow queries
      if (duration > 1000) {
        this.logger.warn('Slow database query detected', {
          operation,
          duration,
          threshold: 1000
        });
      }
      
      return result;
    } catch (error) {
      const duration = timer.end({ success: false, error: (error as Error).message });
      performanceCollector.recordDatabaseQuery(duration);
      
      this.logger.error('Database query failed', error as Error, {
        operation,
        duration
      });
      
      throw error;
    }
  }

  // Private methods
  private initializeRepositories(): void {
    if (!this.adapter) {
      throw new ConfigurationError('Database adapter not available');
    }

    // Initialize repositories
    this.repositories.set(RepositoryType.USER, new UserRepository(this.adapter));
    this.repositories.set(RepositoryType.SESSION, new SessionRepository(this.adapter));
    this.repositories.set(RepositoryType.GAME, new GameRepository(this.adapter));

    this.logger.debug('Repositories initialized', {
      count: this.repositories.size,
      types: Array.from(this.repositories.keys())
    });
  }
}

// Singleton instance
let databaseManagerInstance: DatabaseManager | null = null;

export function getDatabaseManager(): DatabaseManager {
  if (!databaseManagerInstance) {
    databaseManagerInstance = new DatabaseManager();
  }
  return databaseManagerInstance;
}

// Initialize database manager
export async function initializeDatabaseManager(): Promise<DatabaseManager> {
  const manager = getDatabaseManager();
  
  if (!manager.isInitialized()) {
    await manager.initialize();
  }
  
  return manager;
}

// Reset database manager (for testing)
export async function resetDatabaseManager(): Promise<void> {
  if (databaseManagerInstance) {
    await databaseManagerInstance.close();
    databaseManagerInstance = null;
  }
}

// Graceful shutdown
export async function shutdownDatabaseManager(): Promise<void> {
  if (databaseManagerInstance) {
    await databaseManagerInstance.close();
  }
}