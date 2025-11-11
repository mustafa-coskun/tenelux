// Connection management and pooling utilities

import { DatabaseConfig } from '../../config/database';
import { IDatabaseAdapter } from '../adapters/IDatabaseAdapter';
import { getAdapterFactory } from '../adapters/IDatabaseAdapter';
import { 
  ConnectionError, 
  ConnectionTimeoutError, 
  ConnectionPoolExhaustedError,
  ConfigurationError 
} from './errors';

export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  reapIntervalMs: number;
  createTimeoutMs: number;
  destroyTimeoutMs: number;
  createRetryIntervalMs: number;
  validateOnBorrow: boolean;
  validateOnReturn: boolean;
}

export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  pendingAcquires: number;
  pendingCreates: number;
  acquiredConnections: number;
  releasedConnections: number;
  createdConnections: number;
  destroyedConnections: number;
  failedAcquires: number;
  timedOutAcquires: number;
}

export interface PooledConnection {
  adapter: IDatabaseAdapter;
  id: string;
  createdAt: Date;
  lastUsed: Date;
  isActive: boolean;
  useCount: number;
}

// Connection pool implementation
export class ConnectionPool {
  private connections = new Map<string, PooledConnection>();
  private availableConnections: string[] = [];
  private pendingAcquires: Array<{
    resolve: (connection: PooledConnection) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private stats: ConnectionPoolStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    pendingAcquires: 0,
    pendingCreates: 0,
    acquiredConnections: 0,
    releasedConnections: 0,
    createdConnections: 0,
    destroyedConnections: 0,
    failedAcquires: 0,
    timedOutAcquires: 0
  };

  private reapInterval?: NodeJS.Timeout;
  private isDestroyed = false;

  constructor(
    private dbConfig: DatabaseConfig,
    private poolConfig: ConnectionPoolConfig
  ) {
    this.startReaper();
  }

  // Acquire a connection from the pool
  async acquire(): Promise<PooledConnection> {
    if (this.isDestroyed) {
      throw new ConnectionError('Connection pool has been destroyed');
    }

    // Check if we have available connections
    if (this.availableConnections.length > 0) {
      const connectionId = this.availableConnections.shift()!;
      const connection = this.connections.get(connectionId)!;
      
      connection.isActive = true;
      connection.lastUsed = new Date();
      connection.useCount++;
      
      this.stats.activeConnections++;
      this.stats.idleConnections--;
      this.stats.acquiredConnections++;
      
      // Validate connection if required
      if (this.poolConfig.validateOnBorrow) {
        try {
          await this.validateConnection(connection);
        } catch (error) {
          // Connection is invalid, destroy it and try again
          await this.destroyConnection(connectionId);
          return this.acquire();
        }
      }
      
      return connection;
    }

    // No available connections, try to create a new one
    if (this.stats.totalConnections < this.poolConfig.maxConnections) {
      try {
        return await this.createConnection();
      } catch (error) {
        this.stats.failedAcquires++;
        throw error;
      }
    }

    // Pool is full, wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from pending queue
        const index = this.pendingAcquires.findIndex(p => p.resolve === resolve);
        if (index !== -1) {
          this.pendingAcquires.splice(index, 1);
          this.stats.pendingAcquires--;
        }
        
        this.stats.timedOutAcquires++;
        reject(new ConnectionTimeoutError(
          `Connection acquire timeout after ${this.poolConfig.acquireTimeoutMs}ms`
        ));
      }, this.poolConfig.acquireTimeoutMs);

      this.pendingAcquires.push({
        resolve: (connection) => {
          clearTimeout(timeout);
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: Date.now()
      });
      
      this.stats.pendingAcquires++;
    });
  }

  // Release a connection back to the pool
  async release(connection: PooledConnection): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    const connectionId = connection.id;
    const pooledConnection = this.connections.get(connectionId);
    
    if (!pooledConnection) {
      // Connection not in pool, ignore
      return;
    }

    // Validate connection if required
    if (this.poolConfig.validateOnReturn) {
      try {
        await this.validateConnection(connection);
      } catch (error) {
        // Connection is invalid, destroy it
        await this.destroyConnection(connectionId);
        return;
      }
    }

    pooledConnection.isActive = false;
    pooledConnection.lastUsed = new Date();
    
    this.stats.activeConnections--;
    this.stats.idleConnections++;
    this.stats.releasedConnections++;

    // Check if there are pending acquires
    if (this.pendingAcquires.length > 0) {
      const pending = this.pendingAcquires.shift()!;
      this.stats.pendingAcquires--;
      
      pooledConnection.isActive = true;
      pooledConnection.useCount++;
      
      this.stats.activeConnections++;
      this.stats.idleConnections--;
      this.stats.acquiredConnections++;
      
      pending.resolve(pooledConnection);
    } else {
      // Add back to available connections
      this.availableConnections.push(connectionId);
    }
  }

  // Create a new connection
  private async createConnection(): Promise<PooledConnection> {
    this.stats.pendingCreates++;
    
    try {
      const adapter = getAdapterFactory().createAdapter(this.dbConfig.type);
      await adapter.connect(this.dbConfig);
      
      const connection: PooledConnection = {
        adapter,
        id: this.generateConnectionId(),
        createdAt: new Date(),
        lastUsed: new Date(),
        isActive: true,
        useCount: 1
      };
      
      this.connections.set(connection.id, connection);
      this.stats.totalConnections++;
      this.stats.activeConnections++;
      this.stats.createdConnections++;
      this.stats.acquiredConnections++;
      
      return connection;
    } catch (error) {
      this.stats.failedAcquires++;
      throw new ConnectionError('Failed to create database connection', { error: error.message });
    } finally {
      this.stats.pendingCreates--;
    }
  }

  // Destroy a connection
  private async destroyConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      await connection.adapter.disconnect();
    } catch (error) {
      // Ignore disconnect errors during destruction
    }

    this.connections.delete(connectionId);
    
    if (connection.isActive) {
      this.stats.activeConnections--;
    } else {
      this.stats.idleConnections--;
      // Remove from available connections
      const index = this.availableConnections.indexOf(connectionId);
      if (index !== -1) {
        this.availableConnections.splice(index, 1);
      }
    }
    
    this.stats.totalConnections--;
    this.stats.destroyedConnections++;
  }

  // Validate a connection
  private async validateConnection(connection: PooledConnection): Promise<void> {
    try {
      const health = await connection.adapter.healthCheck();
      if (!health.isConnected) {
        throw new Error('Connection health check failed');
      }
    } catch (error) {
      throw new ConnectionError('Connection validation failed', { error: error.message });
    }
  }

  // Generate unique connection ID
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Start the connection reaper
  private startReaper(): void {
    this.reapInterval = setInterval(() => {
      this.reapIdleConnections();
    }, this.poolConfig.reapIntervalMs);
  }

  // Reap idle connections
  private reapIdleConnections(): void {
    const now = Date.now();
    const connectionsToDestroy: string[] = [];

    // Find idle connections that have exceeded the idle timeout
    for (const [connectionId, connection] of this.connections.entries()) {
      if (!connection.isActive) {
        const idleTime = now - connection.lastUsed.getTime();
        if (idleTime > this.poolConfig.idleTimeoutMs) {
          connectionsToDestroy.push(connectionId);
        }
      }
    }

    // Ensure we maintain minimum connections
    const connectionsAfterReap = this.stats.totalConnections - connectionsToDestroy.length;
    const toKeep = Math.max(0, this.poolConfig.minConnections - connectionsAfterReap);
    
    if (toKeep > 0) {
      connectionsToDestroy.splice(-toKeep);
    }

    // Destroy idle connections
    connectionsToDestroy.forEach(connectionId => {
      this.destroyConnection(connectionId).catch(error => {
        console.error('Error destroying idle connection:', error);
      });
    });
  }

  // Get pool statistics
  getStats(): ConnectionPoolStats {
    return { ...this.stats };
  }

  // Get pool status
  getStatus(): {
    isHealthy: boolean;
    totalConnections: number;
    availableConnections: number;
    activeConnections: number;
    pendingAcquires: number;
  } {
    return {
      isHealthy: !this.isDestroyed && this.stats.totalConnections > 0,
      totalConnections: this.stats.totalConnections,
      availableConnections: this.availableConnections.length,
      activeConnections: this.stats.activeConnections,
      pendingAcquires: this.stats.pendingAcquires
    };
  }

  // Destroy the pool
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    // Stop the reaper
    if (this.reapInterval) {
      clearInterval(this.reapInterval);
    }

    // Reject all pending acquires
    this.pendingAcquires.forEach(pending => {
      pending.reject(new ConnectionError('Connection pool is being destroyed'));
    });
    this.pendingAcquires.length = 0;

    // Destroy all connections
    const destroyPromises = Array.from(this.connections.keys()).map(connectionId =>
      this.destroyConnection(connectionId)
    );

    await Promise.all(destroyPromises);
  }
}

// Connection manager for managing multiple pools
export class ConnectionManager {
  private pools = new Map<string, ConnectionPool>();
  private defaultPoolConfig: ConnectionPoolConfig = {
    minConnections: 2,
    maxConnections: 10,
    acquireTimeoutMs: 30000,
    idleTimeoutMs: 300000, // 5 minutes
    reapIntervalMs: 60000, // 1 minute
    createTimeoutMs: 30000,
    destroyTimeoutMs: 5000,
    createRetryIntervalMs: 1000,
    validateOnBorrow: true,
    validateOnReturn: false
  };

  // Create or get a connection pool
  getPool(name: string, dbConfig: DatabaseConfig, poolConfig?: Partial<ConnectionPoolConfig>): ConnectionPool {
    let pool = this.pools.get(name);
    
    if (!pool) {
      const finalPoolConfig = { ...this.defaultPoolConfig, ...poolConfig };
      pool = new ConnectionPool(dbConfig, finalPoolConfig);
      this.pools.set(name, pool);
    }
    
    return pool;
  }

  // Remove a pool
  async removePool(name: string): Promise<void> {
    const pool = this.pools.get(name);
    if (pool) {
      await pool.destroy();
      this.pools.delete(name);
    }
  }

  // Get all pool statistics
  getAllStats(): { [poolName: string]: ConnectionPoolStats } {
    const stats: { [poolName: string]: ConnectionPoolStats } = {};
    
    for (const [name, pool] of this.pools.entries()) {
      stats[name] = pool.getStats();
    }
    
    return stats;
  }

  // Get all pool statuses
  getAllStatuses(): { [poolName: string]: any } {
    const statuses: { [poolName: string]: any } = {};
    
    for (const [name, pool] of this.pools.entries()) {
      statuses[name] = pool.getStatus();
    }
    
    return statuses;
  }

  // Destroy all pools
  async destroy(): Promise<void> {
    const destroyPromises = Array.from(this.pools.values()).map(pool => pool.destroy());
    await Promise.all(destroyPromises);
    this.pools.clear();
  }
}

// Singleton connection manager
let connectionManagerInstance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new ConnectionManager();
  }
  return connectionManagerInstance;
}

// Reset connection manager (for testing)
export function resetConnectionManager(): void {
  if (connectionManagerInstance) {
    connectionManagerInstance.destroy().catch(console.error);
    connectionManagerInstance = null;
  }
}