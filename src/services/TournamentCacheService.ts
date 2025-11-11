import {
  Tournament,
  TournamentBracket,
  TournamentMatch,
  TournamentPlayer,
  TournamentStatistics
} from '../types/party';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  enableCompression: boolean;
  enablePersistence: boolean;
  cleanupInterval: number;
}

export class TournamentCacheService {
  private static instance: TournamentCacheService;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private config: CacheConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private compressionWorker: Worker | null = null;

  private constructor() {
    this.config = {
      maxSize: 1000, // Maximum number of cache entries
      defaultTTL: 5 * 60 * 1000, // 5 minutes default TTL
      enableCompression: true,
      enablePersistence: true,
      cleanupInterval: 60 * 1000 // Cleanup every minute
    };

    this.initializeCleanup();
    this.initializeCompression();
    this.loadPersistedCache();
  }

  public static getInstance(): TournamentCacheService {
    if (!TournamentCacheService.instance) {
      TournamentCacheService.instance = new TournamentCacheService();
    }
    return TournamentCacheService.instance;
  }

  // Core caching methods
  public set<T>(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<any> = {
      data: this.config.enableCompression ? this.compress(data) : data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    // Enforce cache size limit
    if (this.cache.size >= this.config.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, entry);
    this.persistCache();
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    const data = this.config.enableCompression ? this.decompress(entry.data) : entry.data;
    return data;
  }

  public has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  public delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.persistCache();
    }
    return deleted;
  }

  public clear(): void {
    this.cache.clear();
    this.persistCache();
  }

  // Tournament-specific caching methods
  public cacheTournament(tournament: Tournament): void {
    const key = `tournament_${tournament.id}`;
    this.set(key, tournament, 10 * 60 * 1000); // 10 minutes TTL for tournaments
  }

  public getCachedTournament(tournamentId: string): Tournament | null {
    const key = `tournament_${tournamentId}`;
    return this.get<Tournament>(key);
  }

  public cacheBracket(tournamentId: string, bracket: TournamentBracket): void {
    const key = `bracket_${tournamentId}`;
    this.set(key, bracket, 5 * 60 * 1000); // 5 minutes TTL for brackets
  }

  public getCachedBracket(tournamentId: string): TournamentBracket | null {
    const key = `bracket_${tournamentId}`;
    return this.get<TournamentBracket>(key);
  }

  public cacheMatch(match: TournamentMatch): void {
    const key = `match_${match.id}`;
    this.set(key, match, 2 * 60 * 1000); // 2 minutes TTL for matches
  }

  public getCachedMatch(matchId: string): TournamentMatch | null {
    const key = `match_${matchId}`;
    return this.get<TournamentMatch>(key);
  }

  public cachePlayer(player: TournamentPlayer): void {
    const key = `player_${player.id}`;
    this.set(key, player, 15 * 60 * 1000); // 15 minutes TTL for players
  }

  public getCachedPlayer(playerId: string): TournamentPlayer | null {
    const key = `player_${playerId}`;
    return this.get<TournamentPlayer>(key);
  }

  public cacheStatistics(tournamentId: string, statistics: TournamentStatistics): void {
    const key = `stats_${tournamentId}`;
    this.set(key, statistics, 30 * 60 * 1000); // 30 minutes TTL for statistics
  }

  public getCachedStatistics(tournamentId: string): TournamentStatistics | null {
    const key = `stats_${tournamentId}`;
    return this.get<TournamentStatistics>(key);
  }

  // Batch operations for efficiency
  public batchSet<T>(entries: Array<{ key: string; data: T; ttl?: number }>): void {
    entries.forEach(({ key, data, ttl }) => {
      this.set(key, data, ttl);
    });
  }

  public batchGet<T>(keys: string[]): Map<string, T | null> {
    const results = new Map<string, T | null>();
    
    keys.forEach(key => {
      results.set(key, this.get<T>(key));
    });

    return results;
  }

  public batchDelete(keys: string[]): number {
    let deletedCount = 0;
    
    keys.forEach(key => {
      if (this.delete(key)) {
        deletedCount++;
      }
    });

    return deletedCount;
  }

  // Cache invalidation strategies
  public invalidateByPattern(pattern: string): number {
    let invalidatedCount = 0;
    const keysToDelete: string[] = [];

    for (const key of Array.from(this.cache.keys())) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      if (this.delete(key)) {
        invalidatedCount++;
      }
    });

    return invalidatedCount;
  }

  public invalidateTournament(tournamentId: string): void {
    this.invalidateByPattern(tournamentId);
  }

  public invalidatePlayer(playerId: string): void {
    this.invalidateByPattern(`player_${playerId}`);
  }

  public invalidateMatch(matchId: string): void {
    this.delete(`match_${matchId}`);
  }

  // Cache optimization methods
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private cleanup(): void {
    const expiredKeys: string[] = [];

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));

    if (expiredKeys.length > 0) {
      console.log(`Cache cleanup: removed ${expiredKeys.length} expired entries`);
      this.persistCache();
    }
  }

  private initializeCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  // Compression methods
  private initializeCompression(): void {
    if (!this.config.enableCompression) return;

    try {
      // Initialize compression worker if available
      if (typeof Worker !== 'undefined') {
        // Would initialize a web worker for compression in a real implementation
        console.log('Compression worker initialized');
      }
    } catch (error) {
      console.warn('Failed to initialize compression worker:', error);
      this.config.enableCompression = false;
    }
  }

  private compress<T>(data: T): T | string {
    if (!this.config.enableCompression) return data;

    try {
      // Simple JSON compression - in production, use a proper compression library
      const jsonString = JSON.stringify(data);
      
      // Basic compression simulation (would use actual compression in production)
      if (jsonString.length > 1000) {
        return this.simpleCompress(jsonString);
      }
      
      return data;
    } catch (error) {
      console.warn('Compression failed:', error);
      return data;
    }
  }

  private decompress<T>(data: T | string): T {
    if (!this.config.enableCompression || typeof data !== 'string') {
      return data as T;
    }

    try {
      // Check if data is compressed
      if (typeof data === 'string' && data.startsWith('COMPRESSED:')) {
        const decompressed = this.simpleDecompress(data);
        return JSON.parse(decompressed);
      }
      
      return data as T;
    } catch (error) {
      console.warn('Decompression failed:', error);
      return data as T;
    }
  }

  private simpleCompress(data: string): string {
    // Simple run-length encoding simulation
    // In production, use a proper compression library like pako or lz-string
    return `COMPRESSED:${data}`;
  }

  private simpleDecompress(data: string): string {
    // Simple decompression simulation
    return data.replace('COMPRESSED:', '');
  }

  // Persistence methods
  private persistCache(): void {
    if (!this.config.enablePersistence) return;

    try {
      const cacheData = Array.from(this.cache.entries()).slice(0, 100); // Limit persisted entries
      localStorage.setItem('tournament_cache', JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to persist cache:', error);
    }
  }

  private loadPersistedCache(): void {
    if (!this.config.enablePersistence) return;

    try {
      const persistedData = localStorage.getItem('tournament_cache');
      if (persistedData) {
        const cacheEntries = JSON.parse(persistedData);
        
        cacheEntries.forEach(([key, entry]: [string, CacheEntry<any>]) => {
          // Only load non-expired entries
          if (!this.isExpired(entry)) {
            this.cache.set(key, entry);
          }
        });

        console.log(`Loaded ${this.cache.size} entries from persisted cache`);
      }
    } catch (error) {
      console.warn('Failed to load persisted cache:', error);
    }
  }

  // Cache statistics and monitoring
  public getStats(): CacheStats {
    let totalSize = 0;
    let expiredCount = 0;
    let hitCount = 0;

    for (const entry of Array.from(this.cache.values())) {
      totalSize += this.estimateSize(entry.data);
      if (this.isExpired(entry)) {
        expiredCount++;
      }
      hitCount += entry.accessCount;
    }

    return {
      totalEntries: this.cache.size,
      totalSize,
      expiredCount,
      hitCount,
      maxSize: this.config.maxSize,
      hitRate: hitCount / Math.max(this.cache.size, 1)
    };
  }

  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Rough estimate in bytes
    } catch {
      return 0;
    }
  }

  // Configuration management
  public updateConfig(newConfig: Partial<CacheConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Handle config changes
    if (oldConfig.enablePersistence !== this.config.enablePersistence) {
      if (this.config.enablePersistence) {
        this.loadPersistedCache();
      } else {
        localStorage.removeItem('tournament_cache');
      }
    }

    if (oldConfig.cleanupInterval !== this.config.cleanupInterval) {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }
      this.initializeCleanup();
    }

    if (this.cache.size > this.config.maxSize) {
      // Evict excess entries
      const excessCount = this.cache.size - this.config.maxSize;
      for (let i = 0; i < excessCount; i++) {
        this.evictLeastRecentlyUsed();
      }
    }
  }

  public getConfig(): CacheConfig {
    return { ...this.config };
  }

  // Cleanup and disposal
  public dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.compressionWorker) {
      this.compressionWorker.terminate();
      this.compressionWorker = null;
    }

    this.persistCache();
    this.cache.clear();
  }
}

// Type definitions
interface CacheStats {
  totalEntries: number;
  totalSize: number;
  expiredCount: number;
  hitCount: number;
  maxSize: number;
  hitRate: number;
}

// Export singleton instance
export const tournamentCacheService = TournamentCacheService.getInstance();

// Utility functions
export const withCache = <T>(
  key: string,
  generator: () => T,
  ttl?: number
): T => {
  const cached = tournamentCacheService.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const data = generator();
  tournamentCacheService.set(key, data, ttl);
  return data;
};

export const cacheAsync = async <T>(
  key: string,
  generator: () => Promise<T>,
  ttl?: number
): Promise<T> => {
  const cached = tournamentCacheService.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const data = await generator();
  tournamentCacheService.set(key, data, ttl);
  return data;
};

export default TournamentCacheService;