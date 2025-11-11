import DatabaseConnection from './DatabaseConnection';

export abstract class BaseRepository {
  protected db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  protected generateId(): string {
    // Simple UUID v4 implementation for testing
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  protected async executeWithTransaction<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      await this.db.beginTransaction();
      const result = await operation();
      await this.db.commit();
      return result;
    } catch (error) {
      await this.db.rollback();
      throw error;
    }
  }

  protected handleDatabaseError(error: any, operation: string): never {
    console.error(`Database error during ${operation}:`, error);

    if (error.code === 'SQLITE_CONSTRAINT') {
      throw new DatabaseConstraintError(
        `Constraint violation during ${operation}`,
        error
      );
    } else if (error.code === 'SQLITE_BUSY') {
      throw new DatabaseBusyError(`Database busy during ${operation}`, error);
    } else if (error.code === 'SQLITE_LOCKED') {
      throw new DatabaseLockedError(
        `Database locked during ${operation}`,
        error
      );
    } else {
      throw new DatabaseError(`Database error during ${operation}`, error);
    }
  }

  protected convertDateFields<T extends Record<string, any>>(
    obj: T,
    dateFields: (keyof T)[]
  ): T {
    const converted = { ...obj };

    for (const field of dateFields) {
      if (converted[field] && typeof converted[field] === 'string') {
        converted[field] = new Date(converted[field] as string) as T[keyof T];
      }
    }

    return converted;
  }

  protected convertBooleanFields<T extends Record<string, any>>(
    obj: T,
    booleanFields: (keyof T)[]
  ): T {
    const converted = { ...obj };

    for (const field of booleanFields) {
      if (converted[field] !== undefined) {
        converted[field] = Boolean(converted[field]) as T[keyof T];
      }
    }

    return converted;
  }

  protected async exists(table: string, id: string): Promise<boolean> {
    try {
      const result = await this.db.get(
        `SELECT 1 FROM ${table} WHERE id = ? LIMIT 1`,
        [id]
      );
      return !!result;
    } catch (error) {
      this.handleDatabaseError(error, `checking existence in ${table}`);
    }
  }

  protected async count(
    table: string,
    whereClause?: string,
    params?: any[]
  ): Promise<number> {
    try {
      const sql = whereClause
        ? `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`
        : `SELECT COUNT(*) as count FROM ${table}`;

      const result = await this.db.get<{ count: number }>(sql, params || []);
      return result?.count || 0;
    } catch (error) {
      this.handleDatabaseError(error, `counting records in ${table}`);
    }
  }
}

// Custom error classes for better error handling
export class DatabaseError extends Error {
  public readonly originalError: any;

  constructor(message: string, originalError?: any) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

export class DatabaseConstraintError extends DatabaseError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'DatabaseConstraintError';
  }
}

export class DatabaseBusyError extends DatabaseError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'DatabaseBusyError';
  }
}

export class DatabaseLockedError extends DatabaseError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'DatabaseLockedError';
  }
}

export class RecordNotFoundError extends DatabaseError {
  constructor(table: string, id: string) {
    super(`Record not found in ${table} with id: ${id}`);
    this.name = 'RecordNotFoundError';
  }
}

export default BaseRepository;
