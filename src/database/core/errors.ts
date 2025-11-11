// Database error hierarchy

// Base database error class
export abstract class DatabaseError extends Error {
  abstract readonly code: string;
  abstract readonly isRetryable: boolean;
  public readonly timestamp: Date;
  public readonly context?: any;

  constructor(message: string, context?: any) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      isRetryable: this.isRetryable,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

// Connection related errors
export class ConnectionError extends DatabaseError {
  readonly code = 'DB_CONNECTION_ERROR';
  readonly isRetryable = true;

  constructor(message: string = 'Database connection failed', context?: any) {
    super(message, context);
  }
}

export class ConnectionTimeoutError extends DatabaseError {
  readonly code = 'DB_CONNECTION_TIMEOUT';
  readonly isRetryable = true;

  constructor(message: string = 'Database connection timeout', context?: any) {
    super(message, context);
  }
}

export class ConnectionPoolExhaustedError extends DatabaseError {
  readonly code = 'DB_POOL_EXHAUSTED';
  readonly isRetryable = true;

  constructor(message: string = 'Database connection pool exhausted', context?: any) {
    super(message, context);
  }
}

// Query related errors
export class QueryError extends DatabaseError {
  readonly code = 'DB_QUERY_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Database query failed', context?: any) {
    super(message, context);
  }
}

export class QueryTimeoutError extends DatabaseError {
  readonly code = 'DB_QUERY_TIMEOUT';
  readonly isRetryable = true;

  constructor(message: string = 'Database query timeout', context?: any) {
    super(message, context);
  }
}

export class QuerySyntaxError extends DatabaseError {
  readonly code = 'DB_QUERY_SYNTAX_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Database query syntax error', context?: any) {
    super(message, context);
  }
}

// Transaction related errors
export class TransactionError extends DatabaseError {
  readonly code = 'DB_TRANSACTION_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Database transaction failed', context?: any) {
    super(message, context);
  }
}

export class TransactionTimeoutError extends DatabaseError {
  readonly code = 'DB_TRANSACTION_TIMEOUT';
  readonly isRetryable = true;

  constructor(message: string = 'Database transaction timeout', context?: any) {
    super(message, context);
  }
}

export class DeadlockError extends DatabaseError {
  readonly code = 'DB_DEADLOCK_ERROR';
  readonly isRetryable = true;

  constructor(message: string = 'Database deadlock detected', context?: any) {
    super(message, context);
  }
}

// Validation related errors
export class ValidationError extends DatabaseError {
  readonly code = 'DB_VALIDATION_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Data validation failed', context?: any) {
    super(message, context);
  }
}

export class ConstraintViolationError extends DatabaseError {
  readonly code = 'DB_CONSTRAINT_VIOLATION';
  readonly isRetryable = false;

  constructor(message: string = 'Database constraint violation', context?: any) {
    super(message, context);
  }
}

export class UniqueConstraintError extends DatabaseError {
  readonly code = 'DB_UNIQUE_CONSTRAINT_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Unique constraint violation', context?: any) {
    super(message, context);
  }
}

export class ForeignKeyConstraintError extends DatabaseError {
  readonly code = 'DB_FOREIGN_KEY_CONSTRAINT_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Foreign key constraint violation', context?: any) {
    super(message, context);
  }
}

// Security related errors
export class SecurityError extends DatabaseError {
  readonly code = 'DB_SECURITY_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Database security violation', context?: any) {
    super(message, context);
  }
}

export class UnauthorizedError extends DatabaseError {
  readonly code = 'DB_UNAUTHORIZED_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Unauthorized database access', context?: any) {
    super(message, context);
  }
}

export class SqlInjectionError extends DatabaseError {
  readonly code = 'DB_SQL_INJECTION_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Potential SQL injection detected', context?: any) {
    super(message, context);
  }
}

// Resource related errors
export class NotFoundError extends DatabaseError {
  readonly code = 'DB_NOT_FOUND_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Resource not found', context?: any) {
    super(message, context);
  }
}

export class DuplicateError extends DatabaseError {
  readonly code = 'DB_DUPLICATE_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Duplicate resource', context?: any) {
    super(message, context);
  }
}

// Configuration related errors
export class ConfigurationError extends DatabaseError {
  readonly code = 'DB_CONFIGURATION_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Database configuration error', context?: any) {
    super(message, context);
  }
}

export class MigrationError extends DatabaseError {
  readonly code = 'DB_MIGRATION_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Database migration failed', context?: any) {
    super(message, context);
  }
}

// Performance related errors
export class PerformanceError extends DatabaseError {
  readonly code = 'DB_PERFORMANCE_ERROR';
  readonly isRetryable = true;

  constructor(message: string = 'Database performance issue', context?: any) {
    super(message, context);
  }
}

export class SlowQueryError extends DatabaseError {
  readonly code = 'DB_SLOW_QUERY_ERROR';
  readonly isRetryable = false;

  constructor(message: string = 'Slow query detected', context?: any) {
    super(message, context);
  }
}

// Utility functions for error handling
export function isDatabaseError(error: any): error is DatabaseError {
  return error instanceof DatabaseError;
}

export function isRetryableError(error: any): boolean {
  return isDatabaseError(error) && error.isRetryable;
}

export function getErrorCode(error: any): string {
  if (isDatabaseError(error)) {
    return error.code;
  }
  return 'UNKNOWN_ERROR';
}

export function createDatabaseError(code: string, message: string, context?: any): DatabaseError {
  switch (code) {
    case 'DB_CONNECTION_ERROR':
      return new ConnectionError(message, context);
    case 'DB_CONNECTION_TIMEOUT':
      return new ConnectionTimeoutError(message, context);
    case 'DB_POOL_EXHAUSTED':
      return new ConnectionPoolExhaustedError(message, context);
    case 'DB_QUERY_ERROR':
      return new QueryError(message, context);
    case 'DB_QUERY_TIMEOUT':
      return new QueryTimeoutError(message, context);
    case 'DB_QUERY_SYNTAX_ERROR':
      return new QuerySyntaxError(message, context);
    case 'DB_TRANSACTION_ERROR':
      return new TransactionError(message, context);
    case 'DB_TRANSACTION_TIMEOUT':
      return new TransactionTimeoutError(message, context);
    case 'DB_DEADLOCK_ERROR':
      return new DeadlockError(message, context);
    case 'DB_VALIDATION_ERROR':
      return new ValidationError(message, context);
    case 'DB_CONSTRAINT_VIOLATION':
      return new ConstraintViolationError(message, context);
    case 'DB_UNIQUE_CONSTRAINT_ERROR':
      return new UniqueConstraintError(message, context);
    case 'DB_FOREIGN_KEY_CONSTRAINT_ERROR':
      return new ForeignKeyConstraintError(message, context);
    case 'DB_SECURITY_ERROR':
      return new SecurityError(message, context);
    case 'DB_UNAUTHORIZED_ERROR':
      return new UnauthorizedError(message, context);
    case 'DB_SQL_INJECTION_ERROR':
      return new SqlInjectionError(message, context);
    case 'DB_NOT_FOUND_ERROR':
      return new NotFoundError(message, context);
    case 'DB_DUPLICATE_ERROR':
      return new DuplicateError(message, context);
    case 'DB_CONFIGURATION_ERROR':
      return new ConfigurationError(message, context);
    case 'DB_MIGRATION_ERROR':
      return new MigrationError(message, context);
    case 'DB_PERFORMANCE_ERROR':
      return new PerformanceError(message, context);
    case 'DB_SLOW_QUERY_ERROR':
      return new SlowQueryError(message, context);
    default:
      return new QueryError(message, context);
  }
}