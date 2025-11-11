import {
  Tournament,
  TournamentBracket,
  TournamentMatch,
  TournamentPlayer,
  TournamentRound,
  RoundStatus
} from '../types/party';

interface PerformanceMetrics {
  renderTime: number;
  updateFrequency: number;
  memoryUsage: number;
  networkLatency: number;
}

interface OptimizationConfig {
  enableVirtualization: boolean;
  batchUpdates: boolean;
  cacheResults: boolean;
  throttleUpdates: boolean;
  maxUpdateFrequency: number;
  enableLazyLoading: boolean;
}

export class TournamentPerformanceOptimizer {
  private static instance: TournamentPerformanceOptimizer;
  private config: OptimizationConfig;
  private updateQueue: Map<string, any> = new Map();
  private updateTimer: NodeJS.Timeout | null = null;
  private cache: Map<string, any> = new Map();
  private metrics: PerformanceMetrics = {
    renderTime: 0,
    updateFrequency: 0,
    memoryUsage: 0,
    networkLatency: 0
  };

  private constructor() {
    this.config = {
      enableVirtualization: true,
      batchUpdates: true,
      cacheResults: true,
      throttleUpdates: true,
      maxUpdateFrequency: 60, // 60 FPS max
      enableLazyLoading: true
    };
  }

  public static getInstance(): TournamentPerformanceOptimizer {
    if (!TournamentPerformanceOptimizer.instance) {
      TournamentPerformanceOptimizer.instance = new TournamentPerformanceOptimizer();
    }
    return TournamentPerformanceOptimizer.instance;
  }

  // Optimized bracket data structure for efficient rendering
  public optimizeBracketData(tournament: Tournament): OptimizedBracketData {
    const cacheKey = `bracket_${tournament.id}_${tournament.bracket.rounds.length}`;
    
    if (this.config.cacheResults && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startTime = performance.now();

    const optimizedData: OptimizedBracketData = {
      visibleRounds: this.getVisibleRounds(tournament.bracket),
      matchLookup: this.createMatchLookup(tournament.bracket),
      playerLookup: this.createPlayerLookup(tournament.players),
      connectionMap: this.createConnectionMap(tournament.bracket),
      renderOrder: this.calculateRenderOrder(tournament.bracket),
      virtualizedData: this.createVirtualizedData(tournament.bracket)
    };

    const endTime = performance.now();
    this.metrics.renderTime = endTime - startTime;

    if (this.config.cacheResults) {
      this.cache.set(cacheKey, optimizedData);
    }

    return optimizedData;
  }

  // Efficient real-time update batching
  public scheduleUpdate(updateType: string, data: any): void {
    if (!this.config.batchUpdates) {
      this.processUpdate(updateType, data);
      return;
    }

    this.updateQueue.set(updateType, data);

    if (this.config.throttleUpdates) {
      if (this.updateTimer) {
        clearTimeout(this.updateTimer);
      }

      const throttleDelay = 1000 / this.config.maxUpdateFrequency;
      this.updateTimer = setTimeout(() => {
        this.processBatchedUpdates();
      }, throttleDelay);
    } else {
      this.processBatchedUpdates();
    }
  }

  private processBatchedUpdates(): void {
    const updates = Array.from(this.updateQueue.entries());
    this.updateQueue.clear();

    // Process updates in priority order
    const priorityOrder = ['match-result', 'player-status', 'bracket-update', 'ui-update'];
    
    priorityOrder.forEach(priority => {
      const update = updates.find(([type]) => type === priority);
      if (update) {
        this.processUpdate(update[0], update[1]);
      }
    });

    // Process remaining updates
    updates.forEach(([type, data]) => {
      if (!priorityOrder.includes(type)) {
        this.processUpdate(type, data);
      }
    });
  }

  private processUpdate(updateType: string, data: any): void {
    switch (updateType) {
      case 'match-result':
        this.invalidateMatchCache(data.matchId);
        break;
      case 'player-status':
        this.invalidatePlayerCache(data.playerId);
        break;
      case 'bracket-update':
        this.invalidateBracketCache(data.tournamentId);
        break;
      default:
        break;
    }
  }

  // Efficient data caching with smart invalidation
  public getCachedData<T>(key: string, generator: () => T): T {
    if (!this.config.cacheResults) {
      return generator();
    }

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const data = generator();
    this.cache.set(key, data);
    return data;
  }

  public invalidateCache(pattern?: string): void {
    if (pattern) {
      const keysToDelete = Array.from(this.cache.keys()).filter(key => 
        key.includes(pattern)
      );
      keysToDelete.forEach(key => this.cache.delete(key));
    } else {
      this.cache.clear();
    }
  }

  private invalidateMatchCache(matchId: string): void {
    this.invalidateCache(`match_${matchId}`);
  }

  private invalidatePlayerCache(playerId: string): void {
    this.invalidateCache(`player_${playerId}`);
  }

  private invalidateBracketCache(tournamentId: string): void {
    this.invalidateCache(`bracket_${tournamentId}`);
  }

  // Optimized bracket rendering helpers
  private getVisibleRounds(bracket: TournamentBracket): TournamentRound[] {
    if (!this.config.enableLazyLoading) {
      return bracket.rounds;
    }

    // Only return rounds that are active or recently completed
    return bracket.rounds.filter(round => 
      round.status === RoundStatus.IN_PROGRESS || 
      round.status === RoundStatus.COMPLETED ||
      round.roundNumber <= this.getCurrentRound(bracket) + 1
    );
  }

  private getCurrentRound(bracket: TournamentBracket): number {
    const activeRound = bracket.rounds.find(r => r.status === RoundStatus.IN_PROGRESS);
    return activeRound?.roundNumber || 1;
  }

  private createMatchLookup(bracket: TournamentBracket): Map<string, TournamentMatch> {
    const lookup = new Map<string, TournamentMatch>();
    
    bracket.rounds.forEach(round => {
      round.matches.forEach(match => {
        lookup.set(match.id, match);
      });
    });

    return lookup;
  }

  private createPlayerLookup(players: TournamentPlayer[]): Map<string, TournamentPlayer> {
    const lookup = new Map<string, TournamentPlayer>();
    
    players.forEach(player => {
      lookup.set(player.id, player);
    });

    return lookup;
  }

  private createConnectionMap(bracket: TournamentBracket): Map<string, string[]> {
    const connections = new Map<string, string[]>();
    
    // Create connections between matches for bracket visualization
    bracket.rounds.forEach((round, roundIndex) => {
      if (roundIndex < bracket.rounds.length - 1) {
        const nextRound = bracket.rounds[roundIndex + 1];
        
        round.matches.forEach((match, matchIndex) => {
          const nextMatchIndex = Math.floor(matchIndex / 2);
          if (nextRound.matches[nextMatchIndex]) {
            const connectionKey = `${match.id}_to_${nextRound.matches[nextMatchIndex].id}`;
            connections.set(match.id, [nextRound.matches[nextMatchIndex].id]);
          }
        });
      }
    });

    return connections;
  }

  private calculateRenderOrder(bracket: TournamentBracket): string[] {
    const renderOrder: string[] = [];
    
    // Render matches in optimal order for smooth animations
    bracket.rounds.forEach(round => {
      round.matches.forEach(match => {
        renderOrder.push(match.id);
      });
    });

    return renderOrder;
  }

  private createVirtualizedData(bracket: TournamentBracket): VirtualizedBracketData {
    if (!this.config.enableVirtualization) {
      return {
        visibleItems: bracket.rounds.flatMap(r => r.matches),
        totalItems: bracket.rounds.reduce((sum, r) => sum + r.matches.length, 0),
        startIndex: 0,
        endIndex: bracket.rounds.reduce((sum, r) => sum + r.matches.length, 0)
      };
    }

    // Calculate visible items based on viewport
    const viewportHeight = window.innerHeight;
    const itemHeight = 120; // Estimated match item height
    const visibleCount = Math.ceil(viewportHeight / itemHeight) + 2; // Buffer

    const allMatches = bracket.rounds.flatMap(r => r.matches);
    const startIndex = 0; // Would be calculated based on scroll position
    const endIndex = Math.min(startIndex + visibleCount, allMatches.length);

    return {
      visibleItems: allMatches.slice(startIndex, endIndex),
      totalItems: allMatches.length,
      startIndex,
      endIndex
    };
  }

  // Performance monitoring
  public measurePerformance<T>(operation: string, fn: () => T): T {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    const result = fn();

    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();

    console.log(`Performance [${operation}]:`, {
      duration: `${(endTime - startTime).toFixed(2)}ms`,
      memoryDelta: `${(endMemory - startMemory).toFixed(2)}MB`
    });

    return result;
  }

  private getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024;
    }
    return 0;
  }

  // Network optimization for real-time updates
  public optimizeNetworkUpdates(updates: any[]): OptimizedNetworkUpdate[] {
    // Deduplicate updates
    const deduped = this.deduplicateUpdates(updates);
    
    // Compress update data
    const compressed = this.compressUpdates(deduped);
    
    // Batch by priority
    const batched = this.batchUpdatesByPriority(compressed);
    
    return batched;
  }

  private deduplicateUpdates(updates: any[]): any[] {
    const seen = new Set<string>();
    return updates.filter(update => {
      const key = `${update.type}_${update.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private compressUpdates(updates: any[]): any[] {
    // Simple compression - remove unnecessary fields
    return updates.map(update => ({
      type: update.type,
      id: update.id,
      data: this.compressUpdateData(update.data)
    }));
  }

  private compressUpdateData(data: any): any {
    // Remove null/undefined values and compress common patterns
    const compressed: any = {};
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (value !== null && value !== undefined) {
        compressed[key] = value;
      }
    });

    return compressed;
  }

  private batchUpdatesByPriority(updates: any[]): OptimizedNetworkUpdate[] {
    const batches: Map<number, any[]> = new Map();
    
    updates.forEach(update => {
      const priority = this.getUpdatePriority(update.type);
      if (!batches.has(priority)) {
        batches.set(priority, []);
      }
      batches.get(priority)!.push(update);
    });

    return Array.from(batches.entries())
      .sort(([a], [b]) => b - a) // Higher priority first
      .map(([priority, updates]) => ({
        priority,
        updates,
        timestamp: Date.now()
      }));
  }

  private getUpdatePriority(updateType: string): number {
    const priorities: Record<string, number> = {
      'match-result': 10,
      'player-elimination': 9,
      'round-complete': 8,
      'player-status': 7,
      'bracket-update': 6,
      'chat-message': 5,
      'ui-update': 1
    };

    return priorities[updateType] || 1;
  }

  // Configuration management
  public updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Clear cache if caching was disabled
    if (!this.config.cacheResults) {
      this.cache.clear();
    }
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public getConfig(): OptimizationConfig {
    return { ...this.config };
  }

  // Memory management
  public cleanup(): void {
    this.cache.clear();
    this.updateQueue.clear();
    
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
  }
}

// Type definitions for optimized data structures
interface OptimizedBracketData {
  visibleRounds: TournamentRound[];
  matchLookup: Map<string, TournamentMatch>;
  playerLookup: Map<string, TournamentPlayer>;
  connectionMap: Map<string, string[]>;
  renderOrder: string[];
  virtualizedData: VirtualizedBracketData;
}

interface VirtualizedBracketData {
  visibleItems: TournamentMatch[];
  totalItems: number;
  startIndex: number;
  endIndex: number;
}

interface OptimizedNetworkUpdate {
  priority: number;
  updates: any[];
  timestamp: number;
}

// Export singleton instance
export const tournamentPerformanceOptimizer = TournamentPerformanceOptimizer.getInstance();

// Utility functions for performance optimization
export const withPerformanceTracking = <T>(operation: string, fn: () => T): T => {
  return tournamentPerformanceOptimizer.measurePerformance(operation, fn);
};

export const optimizeBracketRendering = (tournament: Tournament) => {
  return tournamentPerformanceOptimizer.optimizeBracketData(tournament);
};

export const scheduleOptimizedUpdate = (type: string, data: any) => {
  tournamentPerformanceOptimizer.scheduleUpdate(type, data);
};

export default TournamentPerformanceOptimizer;