// SQLite database adapter implementation

import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
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
  MigrationError 
} from '../core/errors';

// SQLite-specific transaction implementation
class SQLiteTransaction extends BaseTransaction {
  constructor(private db: sqlite3.Database) {
    super();
  }

  async commit(): Promise<void> {
    this.checkTransactionState();
    
    return new Promise((resolve, reject) => {
      this.db.run('COMMIT', (err) => {
        if (err) {
          reject(new TransactionError('Failed to commit transaction', { error: err.message }));
        } else {
          this.isCommitted = true;
          resolve();
        }
      });
    });
  }

  async rollback(): Promise<void> {
    this.checkTransactionState();
    
    return new Promise((resolve, reject) => {
      this.db.run('ROLLBACK', (err) => {
        if (err) {
          reject(new TransactionError('Failed to rollback transaction', { error: err.message }));
        } else {
          this.isRolledBack = true;
          resolve();
        }
      });
    });
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    this.checkTransactionState();
    
    return new Promise((resolve, reject) => {
      this.db.all(sql, params || [], (err, rows) => {
        if (err) {
          reject(new QueryError('Transaction query failed', { sql, params, error: err.message }));
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    this.checkTransactionState();
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, params || [], function(err) {
        if (err) {
          reject(new QueryError('Transaction execute failed', { sql, params, error: err.message }));
        } else {
          resolve({
            affectedRows: this.changes,
            insertId: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }
}

// SQLite adapter implementation
export class SQLiteAdapter extends BaseAdapter {
  private db?: sqlite3.Database;
  private dbPath?: string;
  private connectionStartTime?: number;

  async connect(config: DatabaseConfig): Promise<void> {
    try {
      this.config = config;
      this.dbPath = config.database;

      // Ensure directory exists for file-based databases
      if (this.dbPath !== ':memory:') {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      // Create database connection
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          throw new ConnectionError('Failed to connect to SQLite database', { 
            path: this.dbPath, 
            error: err.message 
          });
        }
      });

      // Configure SQLite for better performance
      await this.configureSQLite();

      this.connected = true;
      this.connectionStartTime = Date.now();
      
      // Start health checks
      this.startHealthChecks();

      console.log(`✅ Connected to SQLite database: ${this.dbPath}`);
    } catch (error) {
      this.connected = false;
      throw error instanceof ConnectionError ? error : 
        new ConnectionError('SQLite connection failed', { error: error.message });
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) {
            reject(new ConnectionError('Failed to close SQLite database', { error: err.message }));
          } else {
            this.cleanup();
            console.log('✅ SQLite database connection closed');
            resolve();
          }
        });
      });
    }
    
    await this.cleanup();
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.connected || !this.db) {
      throw new ConnectionError('Database not connected');
    }

    this.validateSql(sql);
    const sanitizedParams = this.sanitizeParams(params);

    return new Promise((resolve, reject) => {
      this.db!.all(sql, sanitizedParams, (err, rows) => {
        if (err) {
          reject(new QueryError('SQLite query failed', { 
            sql, 
            params: sanitizedParams, 
            error: err.message 
          }));
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.connected || !this.db) {
      throw new ConnectionError('Database not connected');
    }

    this.validateSql(sql);
    const sanitizedParams = this.sanitizeParams(params);

    return new Promise((resolve, reject) => {
      this.db!.run(sql, sanitizedParams, function(err) {
        if (err) {
          reject(new QueryError('SQLite execute failed', { 
            sql, 
            params: sanitizedParams, 
            error: err.message 
          }));
        } else {
          resolve({
            affectedRows: this.changes,
            insertId: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  async beginTransaction(): Promise<SQLiteTransaction> {
    if (!this.connected || !this.db) {
      throw new ConnectionError('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(new TransactionError('Failed to begin transaction', { error: err.message }));
        } else {
          resolve(new SQLiteTransaction(this.db!));
        }
      });
    });
  }

  async migrate(migrations: Migration[]): Promise<void> {
    if (!this.connected || !this.db) {
      throw new ConnectionError('Database not connected');
    }

    this.validateMigrations(migrations);

    try {
      // Create migrations table if it doesn't exist
      await this.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          version TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
              'INSERT INTO migrations (version, name) VALUES (?, ?)',
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

  // SQLite-specific configuration
  private async configureSQLite(): Promise<void> {
    if (!this.db) return;

    const pragmas = [
      'PRAGMA journal_mode = WAL',
      'PRAGMA synchronous = NORMAL',
      'PRAGMA cache_size = -64000', // 64MB cache
      'PRAGMA temp_store = MEMORY',
      'PRAGMA mmap_size = 268435456', // 256MB mmap
      'PRAGMA foreign_keys = ON'
    ];

    for (const pragma of pragmas) {
      await new Promise<void>((resolve, reject) => {
        this.db!.run(pragma, (err) => {
          if (err) {
            console.warn(`Failed to set pragma: ${pragma}`, err.message);
          }
          resolve();
        });
      });
    }
  }

  // Get connection pool info (SQLite doesn't have real pooling)
  protected getActiveConnections(): number {
    return this.connected ? 1 : 0;
  }

  protected getTotalConnections(): number {
    return this.connected ? 1 : 0;
  }

  protected getUptime(): number {
    return this.connectionStartTime ? Date.now() - this.connectionStartTime : 0;
  }

  // SQLite-specific utility methods
  async vacuum(): Promise<void> {
    if (!this.connected || !this.db) {
      throw new ConnectionError('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.run('VACUUM', (err) => {
        if (err) {
          reject(new QueryError('VACUUM failed', { error: err.message }));
        } else {
          resolve();
        }
      });
    });
  }

  async analyze(): Promise<void> {
    if (!this.connected || !this.db) {
      throw new ConnectionError('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.run('ANALYZE', (err) => {
        if (err) {
          reject(new QueryError('ANALYZE failed', { error: err.message }));
        } else {
          resolve();
        }
      });
    });
  }

  async getTableInfo(tableName: string): Promise<any[]> {
    return this.query(`PRAGMA table_info(${tableName})`);
  }

  async getIndexList(tableName: string): Promise<any[]> {
    return this.query(`PRAGMA index_list(${tableName})`);
  }

  async getDatabaseSize(): Promise<number> {
    if (this.dbPath === ':memory:') {
      return 0;
    }

    try {
      const stats = fs.statSync(this.dbPath!);
      return stats.size;
    } catch {
      return 0;
    }
  }

  // Get SQLite-specific statistics
  async getStatistics(): Promise<{
    pageCount: number;
    pageSize: number;
    freePages: number;
    cacheSize: number;
    journalMode: string;
    synchronous: string;
  }> {
    const [
      pageCount,
      pageSize,
      freePages,
      cacheSize,
      journalMode,
      synchronous
    ] = await Promise.all([
      this.query<{ page_count: number }>('PRAGMA page_count').then(r => r[0]?.page_count || 0),
      this.query<{ page_size: number }>('PRAGMA page_size').then(r => r[0]?.page_size || 0),
      this.query<{ freelist_count: number }>('PRAGMA freelist_count').then(r => r[0]?.freelist_count || 0),
      this.query<{ cache_size: number }>('PRAGMA cache_size').then(r => r[0]?.cache_size || 0),
      this.query<{ journal_mode: string }>('PRAGMA journal_mode').then(r => r[0]?.journal_mode || ''),
      this.query<{ synchronous: string }>('PRAGMA synchronous').then(r => r[0]?.synchronous || '')
    ]);

    return {
      pageCount,
      pageSize,
      freePages,
      cacheSize,
      journalMode,
      synchronous
    };
  }
}