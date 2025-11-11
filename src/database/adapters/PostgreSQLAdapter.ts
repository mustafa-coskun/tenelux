// PostgreSQL database adapter implementation (future implementation)

import { DatabaseConfig } from '../../config/database';
import { 
  BaseAdapter, 
  BaseTransaction, 
  QueryResult, 
  Migration 
} from './IDatabaseAdapter';
import { 
  ConnectionError, 
  QueryError, 
  TransactionError, 
  MigrationError,
  ConfigurationError 
} from '../core/errors';

// PostgreSQL-specific transaction implementation
class PostgreSQLTransaction extends BaseTransaction {
  constructor(private client: any) {
    super();
  }

  async commit(): Promise<void> {
    this.checkTransactionState();
    
    try {
      await this.client.query('COMMIT');
      this.isCommitted = true;
    } catch (error) {
      throw new TransactionError('Failed to commit transaction', { error: error.message });
    }
  }

  async rollback(): Promise<void> {
    this.checkTransactionState();
    
    try {
      await this.client.query('ROLLBACK');
      this.isRolledBack = true;
    } catch (error) {
      throw new TransactionError('Failed to rollback transaction', { error: error.message });
    }
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    this.checkTransactionState();
    
    try {
      const result = await this.client.query(sql, params);
      return result.rows;
    } catch (error) {
      throw new QueryError('Transaction query failed', { sql, params, error: error.message });
    }
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    this.checkTransactionState();
    
    try {
      const result = await this.client.query(sql, params);
      return {
        affectedRows: result.rowCount || 0,
        insertId: result.rows[0]?.id,
        changes: result.rowCount || 0
      };
    } catch (error) {
      throw new QueryError('Transaction execute failed', { sql, params, error: error.message });
    }
  }
}

// PostgreSQL adapter implementation
export class PostgreSQLAdapter extends BaseAdapter {
  private pool?: any;
  private connectionStartTime?: number;

  async connect(config: DatabaseConfig): Promise<void> {
    try {
      // Check if pg module is available
      let pg: any;
      try {
        pg = require('pg');
      } catch (error) {
        throw new ConfigurationError(
          'PostgreSQL adapter requires "pg" package. Install with: npm install pg @types/pg'
        );
      }

      this.config = config;

      // Create connection pool
      this.pool = new pg.Pool({
        host: config.host,
        port: config.port || 5432,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl,
        max: config.poolSize || 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: config.timeout || 30000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.connected = true;
      this.connectionStartTime = Date.now();
      
      // Start health checks
      this.startHealthChecks();

      console.log(`✅ Connected to PostgreSQL database: ${config.host}:${config.port}/${config.database}`);
    } catch (error) {
      this.connected = false;
      throw error instanceof ConnectionError ? error : 
        new ConnectionError('PostgreSQL connection failed', { error: error.message });
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        await this.cleanup();
        console.log('✅ PostgreSQL database connection closed');
      } catch (error) {
        throw new ConnectionError('Failed to close PostgreSQL database', { error: error.message });
      }
    } else {
      await this.cleanup();
    }
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.connected || !this.pool) {
      throw new ConnectionError('Database not connected');
    }

    this.validateSql(sql);
    const sanitizedParams = this.sanitizeParams(params);

    try {
      const result = await this.pool.query(sql, sanitizedParams);
      return result.rows;
    } catch (error) {
      throw new QueryError('PostgreSQL query failed', { 
        sql, 
        params: sanitizedParams, 
        error: error.message 
      });
    }
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.connected || !this.pool) {
      throw new ConnectionError('Database not connected');
    }

    this.validateSql(sql);
    const sanitizedParams = this.sanitizeParams(params);

    try {
      const result = await this.pool.query(sql, sanitizedParams);
      return {
        affectedRows: result.rowCount || 0,
        insertId: result.rows[0]?.id,
        changes: result.rowCount || 0
      };
    } catch (error) {
      throw new QueryError('PostgreSQL execute failed', { 
        sql, 
        params: sanitizedParams, 
        error: error.message 
      });
    }
  }

  async beginTransaction(): Promise<PostgreSQLTransaction> {
    if (!this.connected || !this.pool) {
      throw new ConnectionError('Database not connected');
    }

    try {
      const client = await this.pool.connect();
      await client.query('BEGIN');
      return new PostgreSQLTransaction(client);
    } catch (error) {
      throw new TransactionError('Failed to begin transaction', { error: error.message });
    }
  }

  async migrate(migrations: Migration[]): Promise<void> {
    if (!this.connected || !this.pool) {
      throw new ConnectionError('Database not connected');
    }

    this.validateMigrations(migrations);

    try {
      // Create migrations table if it doesn't exist
      await this.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          version VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Get applied migrations
      const appliedMigrations = await this.query<{ version: string }>(`
        SELECT version FROM migrations ORDER BY version
      `);

      const appliedVersions = new Set(appliedMigrations.map(m => m.version));

      // Sort migrations by version
      const sortedMigrations = migrations.sort((a, b) => a.version.localeCompare(b.version));

      // Apply pending migrations
      for (const migration of sortedMigrations) {
        if (!appliedVersions.has(migration.version)) {
          console.log(`Applying migration: ${migration.version} - ${migration.name}`);
          
          const transaction = await this.beginTransaction();
          
          try {
            // Run migration
            await migration.up(this);
            
            // Record migration
            await transaction.execute(
              'INSERT INTO migrations (version, name) VALUES ($1, $2)',
              [migration.version, migration.name]
            );
            
            await transaction.commit();
            console.log(`✅ Migration applied: ${migration.version}`);
          } catch (error) {
            await transaction.rollback();
            throw new MigrationError(
              `Migration failed: ${migration.version}`, 
              { migration: migration.name, error: error.message }
            );
          }
        }
      }

      console.log('✅ All migrations applied successfully');
    } catch (error) {
      throw error instanceof MigrationError ? error :
        new MigrationError('Migration process failed', { error: error.message });
    }
  }

  // Get connection pool info
  protected getActiveConnections(): number {
    return this.pool ? this.pool.totalCount : 0;
  }

  protected getTotalConnections(): number {
    return this.pool ? this.pool.totalCount : 0;
  }

  protected getUptime(): number {
    return this.connectionStartTime ? Date.now() - this.connectionStartTime : 0;
  }

  // PostgreSQL-specific utility methods
  async getTableInfo(tableName: string): Promise<any[]> {
    return this.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
  }

  async getIndexList(tableName: string): Promise<any[]> {
    return this.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = $1
    `, [tableName]);
  }

  async getDatabaseSize(): Promise<number> {
    const result = await this.query<{ size: number }>(`
      SELECT pg_database_size(current_database()) as size
    `);
    return result[0]?.size || 0;
  }

  // Get PostgreSQL-specific statistics
  async getStatistics(): Promise<{
    version: string;
    activeConnections: number;
    maxConnections: number;
    databaseSize: number;
    cacheHitRatio: number;
  }> {
    const [
      version,
      connections,
      maxConnections,
      databaseSize,
      cacheStats
    ] = await Promise.all([
      this.query<{ version: string }>('SELECT version()').then(r => r[0]?.version || ''),
      this.query<{ count: number }>('SELECT count(*) as count FROM pg_stat_activity').then(r => r[0]?.count || 0),
      this.query<{ setting: string }>('SHOW max_connections').then(r => parseInt(r[0]?.setting || '0')),
      this.getDatabaseSize(),
      this.query<{ blks_hit: number; blks_read: number }>(`
        SELECT sum(blks_hit) as blks_hit, sum(blks_read) as blks_read
        FROM pg_stat_database
        WHERE datname = current_database()
      `).then(r => r[0] || { blks_hit: 0, blks_read: 0 })
    ]);

    const cacheHitRatio = cacheStats.blks_hit + cacheStats.blks_read > 0 
      ? (cacheStats.blks_hit / (cacheStats.blks_hit + cacheStats.blks_read)) * 100
      : 0;

    return {
      version,
      activeConnections: connections,
      maxConnections,
      databaseSize,
      cacheHitRatio
    };
  }
}