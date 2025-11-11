/**
 * DatabaseRetryService
 * 
 * Handles database operation retries with exponential backoff,
 * offline queue management, and sync mechanisms.
 * 
 * Requirements: 7.4
 */

interface DatabaseOperation {
  id: string;
  operation: () => Promise<any>;
  operationType: 'match' | 'tournament' | 'stats';
  data: any;
  timestamp: number;
  retryCount: number;
}

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

class DatabaseRetryService {
  private offlineQueue: DatabaseOperation[] = [];
  private isOnline: boolean = true;
  private isSyncing: boolean = false;
  private readonly STORAGE_KEY = 'db_offline_queue';
  private readonly MAX_QUEUE_SIZE = 100;

  constructor() {
    this.loadOfflineQueue();
    this.setupOnlineListener();
  }

  /**
   * Execute a database operation with retry mechanism
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        console.log(`✅ Database operation succeeded on attempt ${attempt + 1}`);
        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(
          `❌ Database operation failed (attempt ${attempt + 1}/${retryConfig.maxRetries}):`,
          error
        );

        // If this is not the last attempt, wait before retrying
        if (attempt < retryConfig.maxRetries - 1) {
          const delay = this.calculateBackoffDelay(
            attempt,
            retryConfig.initialDelayMs,
            retryConfig.maxDelayMs,
            retryConfig.backoffMultiplier
          );
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }

    // All retries failed - queue for later if offline
    console.error(
      `❌ All ${retryConfig.maxRetries} retry attempts failed for database operation`
    );
    throw lastError!;
  }

  /**
   * Queue an operation for later execution when offline
   */
  queueOperation(
    operationType: 'match' | 'tournament' | 'stats',
    operation: () => Promise<any>,
    data: any
  ): void {
    // Check queue size limit
    if (this.offlineQueue.length >= this.MAX_QUEUE_SIZE) {
      console.warn('⚠️ Offline queue is full, removing oldest operation');
      this.offlineQueue.shift();
    }

    const queuedOperation: DatabaseOperation = {
      id: this.generateOperationId(),
      operation,
      operationType,
      data,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.offlineQueue.push(queuedOperation);
    this.saveOfflineQueue();

    console.log(
      `📦 Operation queued for later (${this.offlineQueue.length} in queue):`,
      operationType
    );
  }

  /**
   * Sync all queued operations
   */
  async syncOfflineOperations(): Promise<void> {
    if (this.isSyncing) {
      console.log('🔄 Sync already in progress, skipping...');
      return;
    }

    if (this.offlineQueue.length === 0) {
      console.log('✅ No operations to sync');
      return;
    }

    this.isSyncing = true;
    console.log(`🔄 Starting sync of ${this.offlineQueue.length} queued operations...`);

    const operations = [...this.offlineQueue];
    const results = {
      successful: 0,
      failed: 0,
      total: operations.length,
    };

    for (const op of operations) {
      try {
        console.log(`🔄 Syncing ${op.operationType} operation from ${new Date(op.timestamp).toLocaleString()}`);
        
        // Execute the operation with retry
        await this.executeWithRetry(op.operation, {
          maxRetries: 2, // Fewer retries during sync
        });

        // Remove from queue on success
        this.removeFromQueue(op.id);
        results.successful++;
        
        console.log(`✅ Successfully synced ${op.operationType} operation`);
      } catch (error) {
        console.error(`❌ Failed to sync ${op.operationType} operation:`, error);
        
        // Increment retry count
        op.retryCount++;
        
        // Remove if too many retries
        if (op.retryCount >= 5) {
          console.warn(`⚠️ Removing operation after ${op.retryCount} failed sync attempts`);
          this.removeFromQueue(op.id);
        }
        
        results.failed++;
      }
    }

    this.saveOfflineQueue();
    this.isSyncing = false;

    console.log(
      `🔄 Sync completed: ${results.successful} successful, ${results.failed} failed, ${this.offlineQueue.length} remaining`
    );
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    queueSize: number;
    isOnline: boolean;
    isSyncing: boolean;
    operations: Array<{ type: string; timestamp: number; retryCount: number }>;
  } {
    return {
      queueSize: this.offlineQueue.length,
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      operations: this.offlineQueue.map((op) => ({
        type: op.operationType,
        timestamp: op.timestamp,
        retryCount: op.retryCount,
      })),
    };
  }

  /**
   * Clear all queued operations
   */
  clearQueue(): void {
    this.offlineQueue = [];
    this.saveOfflineQueue();
    console.log('🗑️ Offline queue cleared');
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    multiplier: number
  ): number {
    const delay = initialDelay * Math.pow(multiplier, attempt);
    return Math.min(delay, maxDelay);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Remove operation from queue
   */
  private removeFromQueue(operationId: string): void {
    const index = this.offlineQueue.findIndex((op) => op.id === operationId);
    if (index !== -1) {
      this.offlineQueue.splice(index, 1);
    }
  }

  /**
   * Load offline queue from localStorage
   */
  private loadOfflineQueue(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Note: We can't restore the actual function references,
        // so queued operations will need to be re-created on app restart
        console.log(`📦 Loaded ${parsed.length} operations from offline queue`);
        
        // For now, just log the operations that were queued
        // In a production app, you'd need a way to serialize/deserialize operations
        if (parsed.length > 0) {
          console.warn('⚠️ Found queued operations from previous session, but cannot restore function references');
          console.warn('⚠️ Consider implementing operation serialization for production use');
        }
      }
    } catch (error) {
      console.error('❌ Failed to load offline queue:', error);
    }
  }

  /**
   * Save offline queue to localStorage
   */
  private saveOfflineQueue(): void {
    try {
      // Save metadata only (can't serialize functions)
      const metadata = this.offlineQueue.map((op) => ({
        id: op.id,
        operationType: op.operationType,
        data: op.data,
        timestamp: op.timestamp,
        retryCount: op.retryCount,
      }));
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.error('❌ Failed to save offline queue:', error);
    }
  }

  /**
   * Setup online/offline listener
   */
  private setupOnlineListener(): void {
    window.addEventListener('online', () => {
      console.log('🌐 Connection restored, syncing queued operations...');
      this.isOnline = true;
      this.syncOfflineOperations();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Connection lost, operations will be queued');
      this.isOnline = false;
    });

    // Initial online status
    this.isOnline = navigator.onLine;
  }
}

// Singleton instance
let databaseRetryServiceInstance: DatabaseRetryService | null = null;

export function getDatabaseRetryService(): DatabaseRetryService {
  if (!databaseRetryServiceInstance) {
    databaseRetryServiceInstance = new DatabaseRetryService();
  }
  return databaseRetryServiceInstance;
}

export { DatabaseRetryService };
