import { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

/**
 * ApiOptimizationService provides middleware and utilities for optimizing API responses
 */
export class ApiOptimizationService {
  private static instance: ApiOptimizationService;
  private responseCache: Map<string, { data: any; timestamp: number; etag: string }>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.responseCache = new Map();
    
    // Clean up expired cache entries every minute
    setInterval(() => this.cleanupCache(), 60000);
  }

  public static getInstance(): ApiOptimizationService {
    if (!ApiOptimizationService.instance) {
      ApiOptimizationService.instance = new ApiOptimizationService();
    }
    return ApiOptimizationService.instance;
  }

  /**
   * Compression middleware for reducing response size
   */
  public getCompressionMiddleware() {
    return compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6, // Balanced compression level
      threshold: 1024, // Only compress responses larger than 1KB
    });
  }

  /**
   * Rate limiting middleware to prevent abuse
   */
  public getRateLimitMiddleware() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      // Skip rate limiting for certain endpoints
      skip: (req) => {
        const skipPaths = ['/health', '/ping'];
        return skipPaths.includes(req.path);
      }
    });
  }

  /**
   * WebSocket rate limiting for game messages
   */
  public createWebSocketRateLimit() {
    const clientLimits = new Map<string, { count: number; resetTime: number }>();
    const WINDOW_MS = 60000; // 1 minute
    const MAX_MESSAGES = 60; // 60 messages per minute

    return (clientId: string): boolean => {
      const now = Date.now();
      const clientLimit = clientLimits.get(clientId);

      if (!clientLimit || now > clientLimit.resetTime) {
        clientLimits.set(clientId, { count: 1, resetTime: now + WINDOW_MS });
        return true;
      }

      if (clientLimit.count >= MAX_MESSAGES) {
        return false;
      }

      clientLimit.count++;
      return true;
    };
  }

  /**
   * Response caching middleware with ETag support
   */
  public getCacheMiddleware(ttl: number = this.CACHE_TTL) {
    return (req: Request, res: Response, next: NextFunction) => {
      const cacheKey = this.generateCacheKey(req);
      const cached = this.responseCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < ttl) {
        // Check ETag
        if (req.headers['if-none-match'] === cached.etag) {
          return res.status(304).end();
        }

        res.set('ETag', cached.etag);
        res.set('Cache-Control', `max-age=${Math.floor(ttl / 1000)}`);
        return res.json(cached.data);
      }

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = (data: any) => {
        const etag = this.generateETag(data);
        
        this.responseCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          etag
        });

        res.set('ETag', etag);
        res.set('Cache-Control', `max-age=${Math.floor(ttl / 1000)}`);
        return originalJson(data);
      };

      next();
    };
  }

  /**
   * Response optimization middleware
   */
  public getOptimizationMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Set security headers
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
      });

      // Remove unnecessary headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');

      // Add performance timing header
      const startTime = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        res.set('X-Response-Time', `${duration}ms`);
      });

      next();
    };
  }

  /**
   * JSON response optimization
   */
  public optimizeJsonResponse(data: any): any {
    // Remove null values and empty objects/arrays to reduce payload size
    return this.removeEmptyValues(data);
  }

  /**
   * Batch API response handler
   */
  public createBatchHandler<T>(
    batchSize: number = 10,
    processor: (items: T[]) => Promise<any[]>
  ) {
    return async (items: T[]): Promise<any[]> => {
      const results: any[] = [];
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await processor(batch);
        results.push(...batchResults);
      }
      
      return results;
    };
  }

  /**
   * Pagination helper for large datasets
   */
  public paginate<T>(
    data: T[],
    page: number = 1,
    limit: number = 20
  ): {
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  } {
    const offset = (page - 1) * limit;
    const paginatedData = data.slice(offset, offset + limit);
    const totalPages = Math.ceil(data.length / limit);

    return {
      data: paginatedData,
      pagination: {
        page,
        limit,
        total: data.length,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Generate cache key from request
   */
  private generateCacheKey(req: Request): string {
    const { method, url, query, body } = req;
    const key = `${method}:${url}:${JSON.stringify(query)}:${JSON.stringify(body)}`;
    return Buffer.from(key).toString('base64');
  }

  /**
   * Generate ETag from data
   */
  private generateETag(data: any): string {
    const content = JSON.stringify(data);
    return `"${Buffer.from(content).toString('base64').slice(0, 16)}"`;
  }

  /**
   * Remove empty values from object to reduce payload size
   */
  private removeEmptyValues(obj: any): any {
    if (Array.isArray(obj)) {
      return obj
        .map(item => this.removeEmptyValues(item))
        .filter(item => item !== null && item !== undefined);
    }

    if (obj !== null && typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = this.removeEmptyValues(value);
        
        if (cleanedValue !== null && 
            cleanedValue !== undefined && 
            cleanedValue !== '' &&
            !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
            !(typeof cleanedValue === 'object' && Object.keys(cleanedValue).length === 0)) {
          cleaned[key] = cleanedValue;
        }
      }
      return cleaned;
    }

    return obj;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    Array.from(this.responseCache.entries()).forEach(([key, cached]) => {
      if (now - cached.timestamp >= this.CACHE_TTL) {
        this.responseCache.delete(key);
      }
    });
  }

  /**
   * Clear all cached responses
   */
  public clearCache(): void {
    this.responseCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    entries: number;
    memoryUsage: number;
  } {
    return {
      entries: this.responseCache.size,
      memoryUsage: JSON.stringify(Array.from(this.responseCache.entries())).length
    };
  }
}

export default ApiOptimizationService;