import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: sqlite3.Database | null = null;
  private connectionPool: sqlite3.Database[] = [];
  private readonly maxConnections = 10;
  private readonly dbPath: string;

  private constructor() {
    // Use in-memory database for tests, file database for production
    this.dbPath =
      process.env.NODE_ENV === 'test'
        ? ':memory:'
        : join(process.cwd(), 'tenebris.db');
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async initialize(): Promise<void> {
    try {
      // Create main connection
      this.db = await this.createConnection();

      // Initialize schema
      await this.initializeSchema();

      // Create connection pool
      await this.initializeConnectionPool();

      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private createConnection(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          // Enable foreign keys
          db.run('PRAGMA foreign_keys = ON', (pragmaErr) => {
            if (pragmaErr) {
              reject(pragmaErr);
            } else {
              resolve(db);
            }
          });
        }
      });
    });
  }

  private async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf8');

      return new Promise((resolve, reject) => {
        this.db!.exec(schema, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Failed to read schema file:', error);
      throw error;
    }
  }

  private async initializeConnectionPool(): Promise<void> {
    const poolPromises = [];

    for (let i = 0; i < this.maxConnections; i++) {
      poolPromises.push(this.createConnection());
    }

    try {
      this.connectionPool = await Promise.all(poolPromises);
    } catch (error) {
      console.error('Failed to initialize connection pool:', error);
      throw error;
    }
  }

  public getConnection(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  public getPooledConnection(): sqlite3.Database {
    if (this.connectionPool.length === 0) {
      throw new Error('No pooled connections available');
    }

    // Simple round-robin selection
    const connection = this.connectionPool.shift()!;
    this.connectionPool.push(connection);
    return connection;
  }

  public async run(
    sql: string,
    params: any[] = []
  ): Promise<sqlite3.RunResult> {
    const db = this.getConnection();

    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  public async get<T = any>(
    sql: string,
    params: any[] = []
  ): Promise<T | undefined> {
    const db = this.getConnection();

    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = this.getConnection();

    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  public async beginTransaction(): Promise<void> {
    await this.run('BEGIN TRANSACTION');
  }

  public async commit(): Promise<void> {
    await this.run('COMMIT');
  }

  public async rollback(): Promise<void> {
    await this.run('ROLLBACK');
  }

  public async close(): Promise<void> {
    const closePromises = [];

    // Close main connection
    if (this.db) {
      closePromises.push(
        new Promise<void>((resolve, reject) => {
          this.db!.close((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        })
      );
    }

    // Close pooled connections
    for (const connection of this.connectionPool) {
      closePromises.push(
        new Promise<void>((resolve, reject) => {
          connection.close((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        })
      );
    }

    try {
      await Promise.all(closePromises);
      this.db = null;
      this.connectionPool = [];
      console.log('Database connections closed successfully');
    } catch (error) {
      console.error('Error closing database connections:', error);
      throw error;
    }
  }

  // Health check method
  public async healthCheck(): Promise<boolean> {
    try {
      await this.get('SELECT 1 as health');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  // Method to reset database (useful for testing)
  public async reset(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const tables = [
      'player_statistics',
      'communication_messages',
      'player_decisions',
      'rounds',
      'session_players',
      'game_sessions',
      'players',
    ];

    try {
      await this.beginTransaction();

      for (const table of tables) {
        await this.run(`DELETE FROM ${table}`);
      }

      await this.commit();
      console.log('Database reset successfully');
    } catch (error) {
      await this.rollback();
      console.error('Failed to reset database:', error);
      throw error;
    }
  }
}

export default DatabaseConnection;
