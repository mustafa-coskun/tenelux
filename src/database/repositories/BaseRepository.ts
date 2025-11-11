// Base repository implementation

import { IDatabaseAdapter, IRepository, QueryCriteria, QueryResult } from '../core/interfaces';
import { 
  NotFoundError, 
  ValidationError, 
  QueryError,
  DuplicateError 
} from '../core/errors';
import { getLogger } from '../../services/LoggingService';
import { PerformanceTimer, performanceCollector } from '../../utils/performance';

export abstract class BaseRepository<T> implements IRepository<T> {
  protected logger = getLogger();

  constructor(
    protected adapter: IDatabaseAdapter,
    protected tableName: string
  ) {}

  // Abstract methods that must be implemented by concrete repositories
  protected abstract mapRowToEntity(row: any): T;
  protected abstract mapEntityToRow(entity: Partial<T>): any;
  protected abstract getIdField(): string;
  protected abstract validateEntity(entity: Partial<T>): void;

  async create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    try {
      this.validateEntity(entity as Partial<T>);
      
      const row = this.mapEntityToRow(entity as Partial<T>);
      const now = new Date().toISOString();
      
      // Add timestamps
      row.created_at = now;
      row.updated_at = now;
      
      // Don't set ID for AUTOINCREMENT fields - let database handle it
      // Remove ID field from row to let SQLite auto-generate it
      delete row[this.getIdField()];

      console.log('BaseRepository.create - row after delete:', row);
      console.log('BaseRepository.create - tableName:', this.tableName);

      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(', ');
      const values = Object.values(row);

      const sql = `
        INSERT INTO ${this.tableName} (${columns.join(', ')})
        VALUES (${placeholders})
      `;

      const result = await this.adapter.execute(sql, values);
      
      // Get the created entity using the auto-generated ID
      const createdId = result.lastInsertRowid || result.insertId;
      if (!createdId) {
        throw new QueryError('Failed to get auto-generated ID');
      }
      
      const createdEntity = await this.findById(createdId.toString());
      if (!createdEntity) {
        throw new QueryError('Failed to retrieve created entity');
      }

      this.logger.debug(`Created entity in ${this.tableName}`, { 
        id: row[this.getIdField()],
        affectedRows: result.affectedRows 
      });

      return createdEntity;
    } catch (error) {
      if (this.isDuplicateError(error)) {
        throw new DuplicateError(`Entity already exists in ${this.tableName}`, { error: error.message });
      }
      
      this.logger.error(`Failed to create entity in ${this.tableName}`, error);
      throw error;
    }
  }

  async findById(id: string): Promise<T | null> {
    try {
      const sql = `SELECT * FROM ${this.tableName} WHERE ${this.getIdField()} = ?`;
      const rows = await this.adapter.query<any>(sql, [id]);
      
      if (rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(rows[0]);
    } catch (error) {
      this.logger.error(`Failed to find entity by ID in ${this.tableName}`, error, { id });
      throw error;
    }
  }

  async findBy(criteria: QueryCriteria): Promise<T[]> {
    try {
      const { whereClause, params, orderClause, limitClause } = this.buildQuery(criteria);
      
      const sql = `
        SELECT * FROM ${this.tableName}
        ${whereClause}
        ${orderClause}
        ${limitClause}
      `.trim();

      const rows = await this.adapter.query<any>(sql, params);
      return rows.map(row => this.mapRowToEntity(row));
    } catch (error) {
      this.logger.error(`Failed to find entities in ${this.tableName}`, error, { criteria });
      throw error;
    }
  }

  async findOne(criteria: QueryCriteria): Promise<T | null> {
    const results = await this.findBy({ ...criteria, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    try {
      // Check if entity exists
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError(`Entity not found in ${this.tableName}`, { id });
      }

      this.validateEntity(updates);
      
      const row = this.mapEntityToRow(updates);
      
      // Add updated timestamp
      row.updated_at = new Date().toISOString();
      
      // Remove undefined values and id field
      const cleanRow = Object.entries(row)
        .filter(([key, value]) => value !== undefined && key !== this.getIdField())
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

      if (Object.keys(cleanRow).length === 0) {
        // No updates to make
        return existing;
      }

      const setClause = Object.keys(cleanRow).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(cleanRow), id];

      const sql = `
        UPDATE ${this.tableName}
        SET ${setClause}
        WHERE ${this.getIdField()} = ?
      `;

      const result = await this.adapter.execute(sql, values);
      
      if (result.affectedRows === 0) {
        throw new NotFoundError(`Entity not found in ${this.tableName}`, { id });
      }

      // Get the updated entity
      const updatedEntity = await this.findById(id);
      if (!updatedEntity) {
        throw new QueryError('Failed to retrieve updated entity');
      }

      this.logger.debug(`Updated entity in ${this.tableName}`, { 
        id, 
        affectedRows: result.affectedRows,
        updatedFields: Object.keys(cleanRow)
      });

      return updatedEntity;
    } catch (error) {
      this.logger.error(`Failed to update entity in ${this.tableName}`, error, { id, updates });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const sql = `DELETE FROM ${this.tableName} WHERE ${this.getIdField()} = ?`;
      const result = await this.adapter.execute(sql, [id]);
      
      const deleted = result.affectedRows > 0;
      
      if (deleted) {
        this.logger.debug(`Deleted entity from ${this.tableName}`, { id });
      }

      return deleted;
    } catch (error) {
      this.logger.error(`Failed to delete entity from ${this.tableName}`, error, { id });
      throw error;
    }
  }

  async count(criteria?: QueryCriteria): Promise<number> {
    try {
      const { whereClause, params } = this.buildQuery(criteria || {});
      
      const sql = `
        SELECT COUNT(*) as count FROM ${this.tableName}
        ${whereClause}
      `.trim();

      const rows = await this.adapter.query<{ count: number }>(sql, params);
      return rows[0]?.count || 0;
    } catch (error) {
      this.logger.error(`Failed to count entities in ${this.tableName}`, error, { criteria });
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const sql = `SELECT 1 FROM ${this.tableName} WHERE ${this.getIdField()} = ? LIMIT 1`;
      const rows = await this.adapter.query<any>(sql, [id]);
      return rows.length > 0;
    } catch (error) {
      this.logger.error(`Failed to check entity existence in ${this.tableName}`, error, { id });
      throw error;
    }
  }

  // Utility methods
  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected buildQuery(criteria: QueryCriteria): {
    whereClause: string;
    params: any[];
    orderClause: string;
    limitClause: string;
  } {
    const conditions: string[] = [];
    const params: any[] = [];

    // Build WHERE clause
    Object.entries(criteria).forEach(([key, value]) => {
      if (key === 'limit' || key === 'offset' || key === 'orderBy' || key === 'orderDirection') {
        return; // Skip special keys
      }

      if (value === null || value === undefined) {
        conditions.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        params.push(...value);
      } else if (typeof value === 'object' && value.operator) {
        // Support for complex conditions like { operator: 'LIKE', value: '%test%' }
        conditions.push(`${key} ${value.operator} ?`);
        params.push(value.value);
      } else {
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    });

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build ORDER BY clause
    let orderClause = '';
    if (criteria.orderBy) {
      const direction = criteria.orderDirection || 'ASC';
      orderClause = `ORDER BY ${criteria.orderBy} ${direction}`;
    }

    // Build LIMIT clause
    let limitClause = '';
    if (criteria.limit) {
      limitClause = `LIMIT ${criteria.limit}`;
      if (criteria.offset) {
        limitClause += ` OFFSET ${criteria.offset}`;
      }
    }

    return { whereClause, params, orderClause, limitClause };
  }

  protected isDuplicateError(error: any): boolean {
    if (!error || typeof error.message !== 'string') {
      return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('unique constraint') ||
           message.includes('duplicate') ||
           message.includes('already exists');
  }

  // Batch operations
  async createMany(entities: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T[]> {
    const results: T[] = [];
    
    for (const entity of entities) {
      const created = await this.create(entity);
      results.push(created);
    }
    
    return results;
  }

  async updateMany(criteria: QueryCriteria, updates: Partial<T>): Promise<number> {
    try {
      this.validateEntity(updates);
      
      const row = this.mapEntityToRow(updates);
      row.updated_at = new Date().toISOString();
      
      // Remove undefined values and id field
      const cleanRow = Object.entries(row)
        .filter(([key, value]) => value !== undefined && key !== this.getIdField())
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

      if (Object.keys(cleanRow).length === 0) {
        return 0;
      }

      const { whereClause, params: whereParams } = this.buildQuery(criteria);
      const setClause = Object.keys(cleanRow).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(cleanRow), ...whereParams];

      const sql = `
        UPDATE ${this.tableName}
        SET ${setClause}
        ${whereClause}
      `;

      const result = await this.adapter.execute(sql, values);
      
      this.logger.debug(`Updated multiple entities in ${this.tableName}`, { 
        affectedRows: result.affectedRows,
        criteria,
        updatedFields: Object.keys(cleanRow)
      });

      return result.affectedRows;
    } catch (error) {
      this.logger.error(`Failed to update multiple entities in ${this.tableName}`, error, { criteria, updates });
      throw error;
    }
  }

  async deleteMany(criteria: QueryCriteria): Promise<number> {
    try {
      const { whereClause, params } = this.buildQuery(criteria);
      
      const sql = `
        DELETE FROM ${this.tableName}
        ${whereClause}
      `;

      const result = await this.adapter.execute(sql, params);
      
      this.logger.debug(`Deleted multiple entities from ${this.tableName}`, { 
        affectedRows: result.affectedRows,
        criteria
      });

      return result.affectedRows;
    } catch (error) {
      this.logger.error(`Failed to delete multiple entities from ${this.tableName}`, error, { criteria });
      throw error;
    }
  }

  // Pagination helper
  async paginate(criteria: QueryCriteria, page: number, pageSize: number): Promise<{
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    const paginatedCriteria = {
      ...criteria,
      limit: pageSize,
      offset
    };

    const [data, total] = await Promise.all([
      this.findBy(paginatedCriteria),
      this.count(criteria)
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages
    };
  }

  // Performance monitoring wrapper
  protected async executeWithMonitoring<R>(
    operation: string,
    queryFn: () => Promise<R>
  ): Promise<R> {
    const timer = new PerformanceTimer(`${this.tableName.toUpperCase()}_${operation}`);
    
    try {
      const result = await queryFn();
      const duration = timer.end({ success: true });
      
      // Record performance metrics
      performanceCollector.recordDatabaseQuery(duration);
      
      // Log slow queries
      if (duration > 500) { // 500ms threshold for repository operations
        this.logger.warn('Slow repository operation detected', {
          table: this.tableName,
          operation,
          duration,
          threshold: 500
        });
      }
      
      return result;
    } catch (error) {
      const duration = timer.end({ success: false, error: error.message });
      performanceCollector.recordDatabaseQuery(duration);
      
      this.logger.error('Repository operation failed', error, {
        table: this.tableName,
        operation,
        duration
      });
      
      throw error;
    }
  }

  // Statistics for monitoring
  async getStats(): Promise<{
    tableName: string;
    totalRecords: number;
    recentActivity: {
      lastHour: number;
      lastDay: number;
    };
  }> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [total, lastHour, lastDay] = await Promise.all([
        this.count({}),
        this.count({
          created_at: {
            operator: '>',
            value: oneHourAgo.toISOString()
          }
        }),
        this.count({
          created_at: {
            operator: '>',
            value: oneDayAgo.toISOString()
          }
        })
      ]);

      return {
        tableName: this.tableName,
        totalRecords: total,
        recentActivity: {
          lastHour,
          lastDay
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get stats for ${this.tableName}`, error);
      return {
        tableName: this.tableName,
        totalRecords: 0,
        recentActivity: {
          lastHour: 0,
          lastDay: 0
        }
      };
    }
  }
}