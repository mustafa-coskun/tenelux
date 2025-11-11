// Transaction management utilities

import { ITransaction, IDatabaseAdapter } from './interfaces';
import { 
  TransactionError, 
  DeadlockError, 
  TransactionTimeoutError 
} from './errors';

export interface TransactionOptions {
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  timeout?: number;
  retryOnDeadlock?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export interface TransactionContext {
  id: string;
  startTime: Date;
  adapter: IDatabaseAdapter;
  transaction: ITransaction;
  options: TransactionOptions;
  isActive: boolean;
  operations: TransactionOperation[];
}

export interface TransactionOperation {
  type: 'query' | 'execute';
  sql: string;
  params?: any[];
  timestamp: Date;
  duration?: number;
  result?: any;
  error?: Error;
}

// Enhanced transaction wrapper with additional features
export class ManagedTransaction implements ITransaction {
  private context: TransactionContext;
  private timeoutHandle?: NodeJS.Timeout;
  private isCommitted = false;
  private isRolledBack = false;

  constructor(
    adapter: IDatabaseAdapter,
    transaction: ITransaction,
    options: TransactionOptions = {}
  ) {
    this.context = {
      id: this.generateTransactionId(),
      startTime: new Date(),
      adapter,
      transaction,
      options,
      isActive: true,
      operations: []
    };

    // Set up timeout if specified
    if (options.timeout) {
      this.timeoutHandle = setTimeout(() => {
        this.handleTimeout();
      }, options.timeout);
    }
  }

  async commit(): Promise<void> {
    this.checkTransactionState();
    
    try {
      await this.context.transaction.commit();
      this.isCommitted = true;
      this.context.isActive = false;
      this.cleanup();
    } catch (error) {
      this.context.isActive = false;
      throw new TransactionError('Transaction commit failed', {
        transactionId: this.context.id,
        error: error.message,
        operations: this.context.operations.length
      });
    }
  }

  async rollback(): Promise<void> {
    this.checkTransactionState();
    
    try {
      await this.context.transaction.rollback();
      this.isRolledBack = true;
      this.context.isActive = false;
      this.cleanup();
    } catch (error) {
      this.context.isActive = false;
      throw new TransactionError('Transaction rollback failed', {
        transactionId: this.context.id,
        error: error.message,
        operations: this.context.operations.length
      });
    }
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    this.checkTransactionState();
    
    const operation: TransactionOperation = {
      type: 'query',
      sql,
      params,
      timestamp: new Date()
    };

    const startTime = Date.now();
    
    try {
      const result = await this.context.transaction.query<T>(sql, params);
      operation.duration = Date.now() - startTime;
      operation.result = result;
      this.context.operations.push(operation);
      return result;
    } catch (error) {
      operation.duration = Date.now() - startTime;
      operation.error = error;
      this.context.operations.push(operation);
      
      // Check for deadlock and retry if configured
      if (this.isDeadlockError(error) && this.context.options.retryOnDeadlock) {
        throw new DeadlockError('Transaction deadlock detected', {
          transactionId: this.context.id,
          sql,
          params
        });
      }
      
      throw error;
    }
  }

  async execute(sql: string, params?: any[]): Promise<any> {
    this.checkTransactionState();
    
    const operation: TransactionOperation = {
      type: 'execute',
      sql,
      params,
      timestamp: new Date()
    };

    const startTime = Date.now();
    
    try {
      const result = await this.context.transaction.execute(sql, params);
      operation.duration = Date.now() - startTime;
      operation.result = result;
      this.context.operations.push(operation);
      return result;
    } catch (error) {
      operation.duration = Date.now() - startTime;
      operation.error = error;
      this.context.operations.push(operation);
      
      // Check for deadlock and retry if configured
      if (this.isDeadlockError(error) && this.context.options.retryOnDeadlock) {
        throw new DeadlockError('Transaction deadlock detected', {
          transactionId: this.context.id,
          sql,
          params
        });
      }
      
      throw error;
    }
  }

  // Get transaction context information
  getContext(): Readonly<TransactionContext> {
    return { ...this.context };
  }

  // Get transaction statistics
  getStats(): {
    id: string;
    duration: number;
    operationCount: number;
    queryCount: number;
    executeCount: number;
    averageOperationTime: number;
    isActive: boolean;
  } {
    const now = Date.now();
    const duration = now - this.context.startTime.getTime();
    const queryCount = this.context.operations.filter(op => op.type === 'query').length;
    const executeCount = this.context.operations.filter(op => op.type === 'execute').length;
    const totalOperationTime = this.context.operations
      .filter(op => op.duration !== undefined)
      .reduce((sum, op) => sum + (op.duration || 0), 0);
    const averageOperationTime = this.context.operations.length > 0 
      ? totalOperationTime / this.context.operations.length 
      : 0;

    return {
      id: this.context.id,
      duration,
      operationCount: this.context.operations.length,
      queryCount,
      executeCount,
      averageOperationTime,
      isActive: this.context.isActive
    };
  }

  private checkTransactionState(): void {
    if (this.isCommitted) {
      throw new TransactionError('Transaction has already been committed');
    }
    if (this.isRolledBack) {
      throw new TransactionError('Transaction has already been rolled back');
    }
    if (!this.context.isActive) {
      throw new TransactionError('Transaction is no longer active');
    }
  }

  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleTimeout(): void {
    if (this.context.isActive) {
      this.context.isActive = false;
      // Attempt to rollback the transaction
      this.context.transaction.rollback().catch(() => {
        // Ignore rollback errors during timeout
      });
    }
  }

  private cleanup(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
  }

  private isDeadlockError(error: any): boolean {
    if (!error || typeof error.message !== 'string') {
      return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('deadlock') || 
           message.includes('lock timeout') ||
           message.includes('database is locked');
  }
}

// Transaction manager for handling complex transaction scenarios
export class TransactionManager {
  private activeTransactions = new Map<string, ManagedTransaction>();
  private transactionHistory: TransactionContext[] = [];
  private maxHistorySize = 1000;

  // Begin a new managed transaction
  async beginTransaction(
    adapter: IDatabaseAdapter, 
    options: TransactionOptions = {}
  ): Promise<ManagedTransaction> {
    const baseTransaction = await adapter.beginTransaction();
    const managedTransaction = new ManagedTransaction(adapter, baseTransaction, options);
    
    this.activeTransactions.set(managedTransaction.getContext().id, managedTransaction);
    
    return managedTransaction;
  }

  // Execute a function within a transaction with automatic retry logic
  async withTransaction<T>(
    adapter: IDatabaseAdapter,
    fn: (transaction: ManagedTransaction) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const transaction = await this.beginTransaction(adapter, options);
      
      try {
        const result = await fn(transaction);
        await transaction.commit();
        
        // Move to history
        this.moveToHistory(transaction);
        
        return result;
      } catch (error) {
        lastError = error;
        
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          // Log rollback error but don't throw
          console.error('Transaction rollback failed:', rollbackError);
        }
        
        // Move to history
        this.moveToHistory(transaction);
        
        // Check if we should retry
        if (attempt < maxRetries && this.shouldRetry(error, options)) {
          console.warn(`Transaction attempt ${attempt + 1} failed, retrying in ${retryDelay}ms:`, error.message);
          await this.delay(retryDelay);
          continue;
        }
        
        throw error;
      }
    }

    throw lastError || new TransactionError('Transaction failed after all retry attempts');
  }

  // Execute multiple operations in parallel transactions
  async withParallelTransactions<T>(
    adapter: IDatabaseAdapter,
    operations: Array<(transaction: ManagedTransaction) => Promise<T>>,
    options: TransactionOptions = {}
  ): Promise<T[]> {
    const transactions = await Promise.all(
      operations.map(() => this.beginTransaction(adapter, options))
    );

    try {
      // Execute all operations in parallel
      const results = await Promise.all(
        operations.map((operation, index) => operation(transactions[index]))
      );

      // Commit all transactions
      await Promise.all(transactions.map(tx => tx.commit()));

      // Move to history
      transactions.forEach(tx => this.moveToHistory(tx));

      return results;
    } catch (error) {
      // Rollback all transactions
      await Promise.all(
        transactions.map(tx => 
          tx.rollback().catch(rollbackError => {
            console.error('Parallel transaction rollback failed:', rollbackError);
          })
        )
      );

      // Move to history
      transactions.forEach(tx => this.moveToHistory(tx));

      throw error;
    }
  }

  // Get active transaction by ID
  getActiveTransaction(id: string): ManagedTransaction | undefined {
    return this.activeTransactions.get(id);
  }

  // Get all active transactions
  getActiveTransactions(): ManagedTransaction[] {
    return Array.from(this.activeTransactions.values());
  }

  // Get transaction statistics
  getStats(): {
    activeTransactions: number;
    totalTransactions: number;
    averageTransactionDuration: number;
    successRate: number;
    deadlockCount: number;
    timeoutCount: number;
  } {
    const totalTransactions = this.transactionHistory.length;
    const successfulTransactions = this.transactionHistory.filter(tx => 
      tx.operations.every(op => !op.error)
    ).length;
    
    const totalDuration = this.transactionHistory.reduce((sum, tx) => {
      const duration = Date.now() - tx.startTime.getTime();
      return sum + duration;
    }, 0);
    
    const averageTransactionDuration = totalTransactions > 0 
      ? totalDuration / totalTransactions 
      : 0;
    
    const successRate = totalTransactions > 0 
      ? (successfulTransactions / totalTransactions) * 100 
      : 0;
    
    const deadlockCount = this.transactionHistory.filter(tx =>
      tx.operations.some(op => op.error && this.isDeadlockError(op.error))
    ).length;
    
    const timeoutCount = this.transactionHistory.filter(tx =>
      tx.operations.some(op => op.error && this.isTimeoutError(op.error))
    ).length;

    return {
      activeTransactions: this.activeTransactions.size,
      totalTransactions,
      averageTransactionDuration,
      successRate,
      deadlockCount,
      timeoutCount
    };
  }

  // Clean up completed transactions
  cleanup(): void {
    // Remove inactive transactions from active list
    for (const [id, transaction] of this.activeTransactions.entries()) {
      if (!transaction.getContext().isActive) {
        this.activeTransactions.delete(id);
      }
    }

    // Limit history size
    if (this.transactionHistory.length > this.maxHistorySize) {
      this.transactionHistory = this.transactionHistory.slice(-this.maxHistorySize);
    }
  }

  private moveToHistory(transaction: ManagedTransaction): void {
    const context = transaction.getContext();
    this.activeTransactions.delete(context.id);
    this.transactionHistory.push(context);
  }

  private shouldRetry(error: any, options: TransactionOptions): boolean {
    if (!options.retryOnDeadlock) {
      return false;
    }

    return this.isDeadlockError(error) || this.isTimeoutError(error);
  }

  private isDeadlockError(error: any): boolean {
    if (!error || typeof error.message !== 'string') {
      return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('deadlock') || 
           message.includes('lock timeout') ||
           message.includes('database is locked');
  }

  private isTimeoutError(error: any): boolean {
    if (!error || typeof error.message !== 'string') {
      return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('timeout') || message.includes('timed out');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton transaction manager
let transactionManagerInstance: TransactionManager | null = null;

export function getTransactionManager(): TransactionManager {
  if (!transactionManagerInstance) {
    transactionManagerInstance = new TransactionManager();
  }
  return transactionManagerInstance;
}

// Reset transaction manager (for testing)
export function resetTransactionManager(): void {
  transactionManagerInstance = null;
}