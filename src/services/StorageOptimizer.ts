import { StoredSession } from './StateManager';

export interface CompressionResult {
  data: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface StorageMetrics {
  totalSize: number;
  itemCount: number;
  oldestItem?: Date;
  newestItem?: Date;
  averageSize: number;
}

/**
 * Storage optimization service for efficient session data management
 * Implements compression, cleanup, and performance monitoring
 */
class StorageOptimizer {
  private readonly STORAGE_PREFIX = 'tenebris_';
  private readonly MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
  private readonly CLEANUP_THRESHOLD = 0.8; // Clean when 80% full
  private readonly MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours
  private readonly COMPRESSION_THRESHOLD = 1024; // Compress items > 1KB

  /**
   * Efficiently serialize session data with optional compression
   */
  serializeSession(session: StoredSession): string {
    try {
      // Create optimized session object
      const optimizedSession = this.optimizeSessionData(session);
      
      // Convert to JSON
      const jsonString = JSON.stringify(optimizedSession);
      
      // Compress if size exceeds threshold
      if (jsonString.length > this.COMPRESSION_THRESHOLD) {
        return this.compressData(jsonString);
      }
      
      return jsonString;
    } catch (error) {
      console.error('Failed to serialize session:', error);
      throw new Error('Session serialization failed');
    }
  }

  /**
   * Deserialize session data with decompression support
   */
  deserializeSession(data: string): StoredSession {
    try {
      // Check if data is compressed
      const decompressed = this.isCompressed(data) ? this.decompressData(data) : data;
      
      // Parse JSON
      const parsed = JSON.parse(decompressed);
      
      // Restore optimized data
      return this.restoreSessionData(parsed);
    } catch (error) {
      console.error('Failed to deserialize session:', error);
      throw new Error('Session deserialization failed');
    }
  }

  /**
   * Optimize session data by removing redundant information
   */
  private optimizeSessionData(session: StoredSession): any {
    const optimized: any = {
      u: { // user
        i: session.user.id,
        un: session.user.username,
        dn: session.user.displayName,
        c: session.user.createdAt.getTime(),
        l: session.user.lastActive.getTime(),
        a: session.user.avatar,
        g: session.user.isGuest,
        st: session.user.stats,
        f: session.user.friends,
        fr: session.user.friendRequests,
        ach: session.user.achievements,
        pref: session.user.preferences
      },
      s: { // session
        u: session.gameSession.userId,
        st: session.gameSession.currentState,
        l: session.gameSession.lastUpdated.getTime()
      },
      t: session.timestamp,
      v: session.version
    };

    // Add optional fields only if they exist
    if (session.user.email) optimized.u.e = session.user.email;
    if (session.gameSession.lobbyId) optimized.s.li = session.gameSession.lobbyId;
    if (session.gameSession.tournamentId) optimized.s.ti = session.gameSession.tournamentId;
    if (session.gameSession.playerData) optimized.s.pd = session.gameSession.playerData;

    // Optimize lobby data
    if (session.lobbyData) {
      optimized.ld = this.optimizeLobbyData(session.lobbyData);
    }

    // Optimize tournament data
    if (session.tournamentData) {
      optimized.td = this.optimizeTournamentData(session.tournamentData);
    }

    return optimized;
  }

  /**
   * Restore session data from optimized format
   */
  private restoreSessionData(optimized: any): StoredSession {
    const session: StoredSession = {
      user: {
        id: optimized.u.i,
        username: optimized.u.un || optimized.u.n, // Backward compatibility
        displayName: optimized.u.dn || optimized.u.n, // Backward compatibility
        createdAt: new Date(optimized.u.c),
        lastActive: new Date(optimized.u.l),
        avatar: optimized.u.a || '😊',
        isGuest: optimized.u.g || false,
        stats: optimized.u.st || {
          totalGames: 0,
          wins: 0,
          losses: 0,
          cooperations: 0,
          betrayals: 0,
          totalScore: 0,
          winRate: 0,
          trustScore: 50,
          betrayalRate: 0,
          averageScore: 0,
          longestWinStreak: 0,
          currentWinStreak: 0,
          gamesThisWeek: 0,
          gamesThisMonth: 0
        },
        friends: optimized.u.f || [],
        friendRequests: optimized.u.fr || { sent: [], received: [] },
        achievements: optimized.u.ach || [],
        preferences: optimized.u.pref || {
          matchmakingRegion: 'global',
          trustScoreMatching: true,
          allowFriendRequests: true
        }
      },
      gameSession: {
        userId: optimized.s.u,
        currentState: optimized.s.st,
        lastUpdated: new Date(optimized.s.l),
        lobbyId: optimized.s.li,
        tournamentId: optimized.s.ti,
        playerData: optimized.s.pd
      },
      timestamp: optimized.t,
      version: optimized.v
    };

    // Restore lobby data if present
    if (optimized.ld) {
      session.lobbyData = this.restoreLobbyData(optimized.ld);
    }

    // Restore tournament data if present
    if (optimized.td) {
      session.tournamentData = this.restoreTournamentData(optimized.td);
    }

    return session;
  }

  /**
   * Simple compression using run-length encoding for repeated patterns
   */
  private compressData(data: string): string {
    try {
      // Simple compression: encode repeated characters
      let compressed = '';
      let count = 1;
      
      for (let i = 0; i < data.length; i++) {
        if (i < data.length - 1 && data[i] === data[i + 1]) {
          count++;
        } else {
          if (count > 3) {
            compressed += `~${count}${data[i]}`;
          } else {
            compressed += data[i].repeat(count);
          }
          count = 1;
        }
      }
      
      // Add compression marker
      return `COMP:${compressed}`;
    } catch (error) {
      console.warn('Compression failed, using original data:', error);
      return data;
    }
  }

  /**
   * Decompress data
   */
  private decompressData(data: string): string {
    try {
      if (!this.isCompressed(data)) return data;
      
      const compressed = data.substring(5); // Remove 'COMP:' prefix
      let decompressed = '';
      
      for (let i = 0; i < compressed.length; i++) {
        if (compressed[i] === '~') {
          // Find the count and character
          let countStr = '';
          let j = i + 1;
          while (j < compressed.length && /\d/.test(compressed[j])) {
            countStr += compressed[j];
            j++;
          }
          const count = parseInt(countStr);
          const char = compressed[j];
          decompressed += char.repeat(count);
          i = j;
        } else {
          decompressed += compressed[i];
        }
      }
      
      return decompressed;
    } catch (error) {
      console.error('Decompression failed:', error);
      throw new Error('Data decompression failed');
    }
  }

  /**
   * Check if data is compressed
   */
  private isCompressed(data: string): boolean {
    return data.startsWith('COMP:');
  }

  /**
   * Optimize lobby data structure
   */
  private optimizeLobbyData(lobby: any): any {
    return {
      i: lobby.id,
      c: lobby.code,
      n: lobby.name,
      s: lobby.status,
      h: lobby.hostPlayerId,
      pc: lobby.currentPlayerCount,
      mp: lobby.maxPlayers,
      p: lobby.participants?.map((p: any) => ({
        i: p.id,
        n: p.name,
        h: p.isHost,
        r: p.isReady || false
      })) || [],
      cr: lobby.createdAt ? new Date(lobby.createdAt).getTime() : Date.now()
    };
  }

  /**
   * Restore lobby data from optimized format
   */
  private restoreLobbyData(optimized: any): any {
    return {
      id: optimized.i,
      code: optimized.c,
      name: optimized.n,
      status: optimized.s,
      hostPlayerId: optimized.h,
      currentPlayerCount: optimized.pc,
      maxPlayers: optimized.mp,
      participants: optimized.p?.map((p: any) => ({
        id: p.i,
        name: p.n,
        isHost: p.h,
        isReady: p.r
      })) || [],
      createdAt: new Date(optimized.cr)
    };
  }

  /**
   * Optimize tournament data structure
   */
  private optimizeTournamentData(tournament: any): any {
    const optimized: any = {
      i: tournament.id,
      n: tournament.name,
      s: tournament.status,
      f: tournament.format,
      cr: tournament.currentRound,
      tr: tournament.totalRounds,
      p: tournament.players?.map((p: any) => ({
        i: p.id,
        n: p.name,
        s: p.status || 'ready'
      })) || []
    };

    // Only include bracket if it exists and has data
    if (tournament.bracket && Object.keys(tournament.bracket).length > 0) {
      optimized.b = this.optimizeBracketData(tournament.bracket);
    }

    return optimized;
  }

  /**
   * Restore tournament data from optimized format
   */
  private restoreTournamentData(optimized: any): any {
    const tournament: any = {
      id: optimized.i,
      name: optimized.n,
      status: optimized.s,
      format: optimized.f,
      currentRound: optimized.cr,
      totalRounds: optimized.tr,
      players: optimized.p?.map((p: any) => ({
        id: p.i,
        name: p.n,
        status: p.s
      })) || []
    };

    // Restore bracket if present
    if (optimized.b) {
      tournament.bracket = this.restoreBracketData(optimized.b);
    }

    return tournament;
  }

  /**
   * Optimize bracket data (simplified version)
   */
  private optimizeBracketData(bracket: any): any {
    const optimized: any = {};

    if (bracket.eliminatedPlayers) {
      optimized.ep = bracket.eliminatedPlayers.map((p: any) => ({
        i: p.id,
        n: p.name
      }));
    }

    if (bracket.rounds) {
      optimized.r = bracket.rounds.map((round: any) => ({
        s: round.status,
        m: round.matches?.length || 0
      }));
    }

    return optimized;
  }

  /**
   * Restore bracket data from optimized format
   */
  private restoreBracketData(optimized: any): any {
    const bracket: any = {};

    if (optimized.ep) {
      bracket.eliminatedPlayers = optimized.ep.map((p: any) => ({
        id: p.i,
        name: p.n
      }));
    }

    if (optimized.r) {
      bracket.rounds = optimized.r.map((r: any) => ({
        status: r.s,
        matches: new Array(r.m).fill(null) // Placeholder for matches
      }));
    }

    return bracket;
  }

  /**
   * Clean up old session data to free storage space
   */
  cleanupOldSessions(): { cleaned: number; freedBytes: number } {
    let cleaned = 0;
    let freedBytes = 0;

    try {
      const keys = Object.keys(localStorage);
      const tenebrisKeys = keys.filter(key => key.startsWith(this.STORAGE_PREFIX));
      
      for (const key of tenebrisKeys) {
        try {
          const data = localStorage.getItem(key);
          if (!data) continue;

          const size = new Blob([data]).size;
          
          // Check if item is old
          if (this.isItemExpired(data)) {
            localStorage.removeItem(key);
            cleaned++;
            freedBytes += size;
            console.log(`🧹 Cleaned expired item: ${key} (${size} bytes)`);
          }
        } catch (error) {
          // If we can't parse the item, it's probably corrupted - remove it
          localStorage.removeItem(key);
          cleaned++;
          console.log(`🧹 Cleaned corrupted item: ${key}`);
        }
      }

      console.log(`🧹 Cleanup complete: ${cleaned} items, ${freedBytes} bytes freed`);
      return { cleaned, freedBytes };
    } catch (error) {
      console.error('Cleanup failed:', error);
      return { cleaned: 0, freedBytes: 0 };
    }
  }

  /**
   * Check if a stored item has expired
   */
  private isItemExpired(data: string): boolean {
    try {
      // Try to parse as session data
      const parsed = JSON.parse(this.isCompressed(data) ? this.decompressData(data) : data);
      
      if (parsed.timestamp) {
        const age = Date.now() - parsed.timestamp;
        return age > this.MAX_SESSION_AGE;
      }
      
      // If no timestamp, consider it old
      return true;
    } catch (error) {
      // If we can't parse it, consider it expired
      return true;
    }
  }

  /**
   * Get storage usage metrics
   */
  getStorageMetrics(): StorageMetrics {
    let totalSize = 0;
    let itemCount = 0;
    let oldestItem: Date | undefined;
    let newestItem: Date | undefined;

    try {
      const keys = Object.keys(localStorage);
      const tenebrisKeys = keys.filter(key => key.startsWith(this.STORAGE_PREFIX));
      
      for (const key of tenebrisKeys) {
        const data = localStorage.getItem(key);
        if (!data) continue;

        const size = new Blob([data]).size;
        totalSize += size;
        itemCount++;

        // Try to get timestamp
        try {
          const parsed = JSON.parse(this.isCompressed(data) ? this.decompressData(data) : data);
          if (parsed.timestamp) {
            const itemDate = new Date(parsed.timestamp);
            if (!oldestItem || itemDate < oldestItem) oldestItem = itemDate;
            if (!newestItem || itemDate > newestItem) newestItem = itemDate;
          }
        } catch (error) {
          // Ignore parsing errors for metrics
        }
      }

      return {
        totalSize,
        itemCount,
        oldestItem,
        newestItem,
        averageSize: itemCount > 0 ? totalSize / itemCount : 0
      };
    } catch (error) {
      console.error('Failed to get storage metrics:', error);
      return {
        totalSize: 0,
        itemCount: 0,
        averageSize: 0
      };
    }
  }

  /**
   * Check if storage cleanup is needed
   */
  shouldCleanup(): boolean {
    const metrics = this.getStorageMetrics();
    return metrics.totalSize > (this.MAX_STORAGE_SIZE * this.CLEANUP_THRESHOLD);
  }

  /**
   * Perform automatic cleanup if needed
   */
  autoCleanup(): boolean {
    if (this.shouldCleanup()) {
      const result = this.cleanupOldSessions();
      console.log(`🔄 Auto-cleanup performed: ${result.cleaned} items removed`);
      return true;
    }
    return false;
  }

  /**
   * Get compression statistics for a data string
   */
  getCompressionStats(data: string): CompressionResult {
    const originalSize = new Blob([data]).size;
    const compressed = this.compressData(data);
    const compressedSize = new Blob([compressed]).size;
    
    return {
      data: compressed,
      originalSize,
      compressedSize,
      compressionRatio: originalSize > 0 ? compressedSize / originalSize : 1
    };
  }
}

// Singleton instance
let storageOptimizerInstance: StorageOptimizer | null = null;

export function getStorageOptimizer(): StorageOptimizer {
  if (!storageOptimizerInstance) {
    storageOptimizerInstance = new StorageOptimizer();
  }
  return storageOptimizerInstance;
}

export default StorageOptimizer;