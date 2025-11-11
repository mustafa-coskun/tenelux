// Database adapter interface

import { DatabaseConfig } from '../../config/database';
import {
  IDatabaseAdapter,
  ITransaction,
  QueryResult,
  DatabaseHealth,
  Migration
} from '../core/interfaces';

// Re-export the interface for convenience
export type { IDatabaseAdapter, ITransaction, QueryResult, DatabaseHealth, Migration };

// Base transaction implementation
export abstract class BaseTransaction implements ITransaction {
  protected isCommitted = false;
  protected isRolledBack = false;

  abstract commit(): Promise<void>;
  abstract rollback(): Promise<void>;
  abstract query<T>(sql: string, params?: any[]): Promise<T[]>;
  abstract execute(sql: string, params?: any[]): Promise<QueryResult>;

  protected checkTransactionState(): void {
    if (this.isCommitted) {
      throw new Error('Transaction has already been committed');
    }
    if (this.isRolledBack) {
      throw new Error('Transaction has already been rolled back');
    }
  }
}

// Base adapter implementation with common functionality
export abstract class BaseAdapter implements IDatabaseAdapter {
  protected connected = false;
  protected config?: DatabaseConfig;
  protected connectionPool?: any;
  protected healthCheckInterval?: NodeJS.Timeout;

  abstract connect(config: DatabaseConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract query<T>(sql: string, params?: any[]): Promise<T[]>;
  abstract execute(sql: string, params?: any[]): Promise<QueryResult>;
  abstract beginTransaction(): Promise<ITransaction>;
  abstract migrate(migrations: Migration[]): Promise<void>;

  // Common health check implementation
  async healthCheck(): Promise<DatabaseHealth> {
    const startTime = Date.now();

    try {
      // Simple health check query
      await this.query('SELECT 1 as health_check');

      const responseTime = Date.now() - startTime;

      return {
        isConnected: this.connected,
        responseTime,
        activeConnections: this.getActiveConnections(),
        totalConnections: this.getTotalConnections(),
        uptime: this.getUptime()
      };
    } catch (error) {
      return {
        isConnected: false,
        responseTime: Date.now() - startTime,
        activeConnections: 0,
        totalConnections: 0,
        uptime: 0,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Abstract methods for connection pool info
  protected abstract getActiveConnections(): number;
  protected abstract getTotalConnections(): number;
  protected abstract getUptime(): number;

  // Common parameter sanitization
  protected sanitizeParams(params?: any[]): any[] {
    if (!params) return [];

    return params.map(param => {
      if (param === null || param === undefined) {
        return null;
      }
      if (typeof param === 'string') {
        // Remove null bytes and limit length
        return param.replace(/\0/g, '').substring(0, 65535);
      }
      if (typeof param === 'number') {
        // Ensure it's a valid number
        return isNaN(param) ? null : param;
      }
      if (typeof param === 'boolean') {
        return param;
      }
      if (param instanceof Date) {
        return param.toISOString();
      }
      if (typeof param === 'object') {
        // Convert objects to JSON strings
        try {
          return JSON.stringify(param);
        } catch {
          return null;
        }
      }
      return param;
    });
  }

  // Common SQL validation
  protected validateSql(sql: string): void {
    if (!sql || typeof sql !== 'string') {
      throw new Error('SQL query must be a non-empty string');
    }

    // Basic SQL injection prevention
    const dangerousPatterns = [
      /;\s*(DROP|DELETE|TRUNCATE|ALTER)\s+/i,
      /UNION\s+SELECT/i,
      /--\s*$/m,
      /\/\*[\s\S]*\*\//
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        throw new Error(`Potentially dangerous SQL pattern detected: ${pattern.source}`);
      }
    }
  }

  // Common migration validation
  protected validateMigrations(migrations: Migration[]): void {
    if (!Array.isArray(migrations)) {
      throw new Error('Migrations must be an array');
    }

    const versions = new Set<string>();
    for (const migration of migrations) {
      if (!migration.version || !migration.name || !migration.up || !migration.down) {
        throw new Error('Invalid migration: missing required fields');
      }

      if (versions.has(migration.version)) {
        throw new Error(`Duplicate migration version: ${migration.version}`);
      }

      versions.add(migration.version);
    }
  }

  // Start periodic health checks
  protected startHealthChecks(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.healthCheck();
        if (!health.isConnected) {
          console.warn('Database health check failed:', health);
        }
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, intervalMs);
  }

  // Stop health checks
  protected stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  // Common cleanup method
  protected async cleanup(): Promise<void> {
    this.stopHealthChecks();
    this.connected = false;
    this.config = undefined;
  }
}

// Adapter factory interface
export interface AdapterFactory {
  createAdapter(type: string): IDatabaseAdapter;
  getSupportedTypes(): string[];
}

// Default adapter factory implementation
export class DefaultAdapterFactory implements AdapterFactory {
  private adapters = new Map<string, () => IDatabaseAdapter>();

  constructor() {
    // Register default adapters
    this.registerAdapter('sqlite', () => {
      const { SQLiteAdapter } = require('./SQLiteAdapter');
      return new SQLiteAdapter();
    });

    this.registerAdapter('postgresql', () => {
      const { PostgreSQLAdapter } = require('./PostgreSQLAdapter');
      return new PostgreSQLAdapter();
    });

    this.registerAdapter('mongodb', () => {
      const { MongoDBAdapter } = require('./MongoDBAdapter');
      return new MongoDBAdapter();
    });
  }

  registerAdapter(type: string, factory: () => IDatabaseAdapter): void {
    this.adapters.set(type.toLowerCase(), factory);
  }

  createAdapter(type: string): IDatabaseAdapter {
    const factory = this.adapters.get(type.toLowerCase());
    if (!factory) {
      throw new Error(`Unsupported database type: ${type}`);
    }
    return factory();
  }

  getSupportedTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}

// Singleton factory instance
let factoryInstance: AdapterFactory | null = null;

export function getAdapterFactory(): AdapterFactory {
  if (!factoryInstance) {
    factoryInstance = new DefaultAdapterFactory();
  }
  return factoryInstance;
}

// Reset factory (for testing)
export function resetAdapterFactory(): void {
  factoryInstance = null;
}