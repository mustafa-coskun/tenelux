import { v4 as uuidv4 } from 'uuid';
import {
  MatchmakingQueue,
  MatchmakingPreferences,
  GameMatch,
  MatchmakingService as IMatchmakingService,
  NetworkMessage,
  NetworkMessageType,
  MatchFoundPayload,
} from '../types/network';
import { Player, SessionConfig, GameMode } from '../types';
import { ConnectionManager } from './ConnectionManager';

export class MatchmakingService implements IMatchmakingService {
  private queue: Map<string, MatchmakingQueue> = new Map();
  private activeMatches: Map<string, GameMatch> = new Map();
  private connectionManager: ConnectionManager;
  private matchmakingInterval: NodeJS.Timeout | null = null;
  private readonly MATCHMAKING_INTERVAL = 5000; // 5 seconds
  private readonly MAX_WAIT_TIME = 300000; // 5 minutes
  private readonly TRUST_SCORE_TOLERANCE = 50; // Trust score matching tolerance

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
    this.startMatchmaking();
  }

  addToQueue(player: Player, preferences?: MatchmakingPreferences): void {
    // Remove player from queue if already present
    this.removeFromQueue(player.id);

    const queueEntry: MatchmakingQueue = {
      playerId: player.id,
      player,
      joinTime: new Date(),
      preferences: preferences || this.getDefaultPreferences(player),
    };

    this.queue.set(player.id, queueEntry);
    console.log(
      `Player ${player.name} (${player.id}) added to matchmaking queue`
    );

    // Notify player about queue status
    this.notifyQueueStatus(player.id);

    // Try to find immediate match
    this.processQueue();
  }

  removeFromQueue(playerId: string): void {
    const removed = this.queue.delete(playerId);
    if (removed) {
      console.log(`Player ${playerId} removed from matchmaking queue`);

      // Notify player about removal
      this.connectionManager.sendToPlayer(playerId, {
        type: NetworkMessageType.LEAVE_QUEUE,
        payload: { status: 'removed' },
        timestamp: new Date(),
      });
    }
  }

  findMatch(playerId: string): GameMatch | null {
    const playerEntry = this.queue.get(playerId);
    if (!playerEntry) {
      return null;
    }

    // Find suitable opponent
    const opponent = this.findSuitableOpponent(playerEntry);
    if (!opponent) {
      return null;
    }

    // Create match
    const match = this.createMatch(playerEntry.player, opponent.player);

    // Remove both players from queue
    this.removeFromQueue(playerEntry.playerId);
    this.removeFromQueue(opponent.playerId);

    // Store active match
    this.activeMatches.set(match.id, match);

    // Notify both players
    this.notifyMatchFound(match);

    console.log(
      `Match created: ${match.id} between ${playerEntry.player.name} and ${opponent.player.name}`
    );
    return match;
  }

  getQueueStatus(): MatchmakingQueue[] {
    return Array.from(this.queue.values());
  }

  processQueue(): void {
    const queueEntries = Array.from(this.queue.values());

    // Remove expired entries
    this.removeExpiredEntries();

    // Try to match players
    for (const entry of queueEntries) {
      if (this.queue.has(entry.playerId)) {
        // Check if still in queue
        const match = this.findMatch(entry.playerId);
        if (match) {
          break; // Process one match at a time
        }
      }
    }
  }

  private findSuitableOpponent(
    playerEntry: MatchmakingQueue
  ): MatchmakingQueue | null {
    const candidates = Array.from(this.queue.values()).filter(
      (entry) => entry.playerId !== playerEntry.playerId
    );

    if (candidates.length === 0) {
      return null;
    }

    // Sort candidates by compatibility score
    const scoredCandidates = candidates.map((candidate) => ({
      candidate,
      score: this.calculateCompatibilityScore(playerEntry, candidate),
    }));

    scoredCandidates.sort((a, b) => b.score - a.score);

    // Return best match if score is acceptable
    const bestMatch = scoredCandidates[0];
    if (bestMatch.score > 0) {
      return bestMatch.candidate;
    }

    return null;
  }

  private calculateCompatibilityScore(
    player1: MatchmakingQueue,
    player2: MatchmakingQueue
  ): number {
    let score = 100; // Base score

    // Trust score compatibility
    const trustScoreDiff = Math.abs(
      player1.player.trustScore - player2.player.trustScore
    );
    const trustScoreTolerance = Math.max(
      player1.preferences?.trustScoreRange?.max || this.TRUST_SCORE_TOLERANCE,
      player2.preferences?.trustScoreRange?.max || this.TRUST_SCORE_TOLERANCE
    );

    if (trustScoreDiff > trustScoreTolerance) {
      score -= (trustScoreDiff - trustScoreTolerance) * 2;
    }

    // Wait time bonus (longer waiting players get priority)
    const waitTime1 = new Date().getTime() - player1.joinTime.getTime();
    const waitTime2 = new Date().getTime() - player2.joinTime.getTime();
    const avgWaitTime = (waitTime1 + waitTime2) / 2;
    score += Math.min(avgWaitTime / 1000, 50); // Max 50 bonus points for wait time

    // Experience level compatibility (based on games played)
    const experienceDiff = Math.abs(
      player1.player.totalGamesPlayed - player2.player.totalGamesPlayed
    );
    if (experienceDiff > 10) {
      score -= experienceDiff * 0.5;
    }

    return Math.max(score, 0);
  }

  private createMatch(player1: Player, player2: Player): GameMatch {
    const match: GameMatch = {
      id: uuidv4(),
      players: [player1, player2],
      createdAt: new Date(),
    };

    return match;
  }

  private notifyMatchFound(match: GameMatch): void {
    const [player1, player2] = match.players;

    const sessionConfig: SessionConfig = {
      maxRounds: 10,
      trustPhaseRounds: 5,
      communicationTimeLimit: 60,
      allowDecisionReversal: true,
      gameMode: GameMode.MULTIPLAYER,
    };

    // Notify player 1
    const payload1: MatchFoundPayload = {
      matchId: match.id,
      opponent: player2,
      sessionConfig,
    };

    this.connectionManager.sendToPlayer(player1.id, {
      type: NetworkMessageType.MATCH_FOUND,
      payload: payload1,
      timestamp: new Date(),
    });

    // Notify player 2
    const payload2: MatchFoundPayload = {
      matchId: match.id,
      opponent: player1,
      sessionConfig,
    };

    this.connectionManager.sendToPlayer(player2.id, {
      type: NetworkMessageType.MATCH_FOUND,
      payload: payload2,
      timestamp: new Date(),
    });
  }

  private notifyQueueStatus(playerId: string): void {
    const position = this.getQueuePosition(playerId);
    const estimatedWaitTime = this.estimateWaitTime(playerId);

    this.connectionManager.sendToPlayer(playerId, {
      type: NetworkMessageType.JOIN_QUEUE,
      payload: {
        status: 'queued',
        position,
        estimatedWaitTime,
        queueSize: this.queue.size,
      },
      timestamp: new Date(),
    });
  }

  private getQueuePosition(playerId: string): number {
    const entries = Array.from(this.queue.values()).sort(
      (a, b) => a.joinTime.getTime() - b.joinTime.getTime()
    );

    return entries.findIndex((entry) => entry.playerId === playerId) + 1;
  }

  private estimateWaitTime(playerId: string): number {
    const queueSize = this.queue.size;
    const position = this.getQueuePosition(playerId);

    // Simple estimation: assume 30 seconds per position ahead
    return Math.max((position - 1) * 30, 0);
  }

  private removeExpiredEntries(): void {
    const now = new Date();
    const expiredEntries: string[] = [];

    this.queue.forEach((entry, playerId) => {
      const waitTime = now.getTime() - entry.joinTime.getTime();
      const maxWaitTime = entry.preferences?.maxWaitTime || this.MAX_WAIT_TIME;

      if (waitTime > maxWaitTime) {
        expiredEntries.push(playerId);
      }
    });

    expiredEntries.forEach((playerId) => {
      this.removeFromQueue(playerId);

      // Notify player about timeout
      this.connectionManager.sendToPlayer(playerId, {
        type: NetworkMessageType.ERROR,
        payload: {
          code: 'QUEUE_TIMEOUT',
          message: 'Matchmaking timeout - please try again',
        },
        timestamp: new Date(),
      });
    });

    if (expiredEntries.length > 0) {
      console.log(`Removed ${expiredEntries.length} expired queue entries`);
    }
  }

  private getDefaultPreferences(player: Player): MatchmakingPreferences {
    return {
      trustScoreRange: {
        min: Math.max(0, player.trustScore - this.TRUST_SCORE_TOLERANCE),
        max: Math.min(100, player.trustScore + this.TRUST_SCORE_TOLERANCE),
      },
      maxWaitTime: this.MAX_WAIT_TIME,
    };
  }

  private startMatchmaking(): void {
    this.matchmakingInterval = setInterval(() => {
      this.processQueue();
    }, this.MATCHMAKING_INTERVAL);
  }

  // Public methods for external management
  getActiveMatches(): GameMatch[] {
    return Array.from(this.activeMatches.values());
  }

  getMatch(matchId: string): GameMatch | undefined {
    return this.activeMatches.get(matchId);
  }

  removeMatch(matchId: string): void {
    this.activeMatches.delete(matchId);
  }

  getQueueStats(): {
    queueSize: number;
    averageWaitTime: number;
    activeMatches: number;
  } {
    const now = new Date();
    const waitTimes = Array.from(this.queue.values()).map(
      (entry) => now.getTime() - entry.joinTime.getTime()
    );

    const averageWaitTime =
      waitTimes.length > 0
        ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length
        : 0;

    return {
      queueSize: this.queue.size,
      averageWaitTime: Math.round(averageWaitTime / 1000), // Convert to seconds
      activeMatches: this.activeMatches.size,
    };
  }

  stop(): void {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      this.matchmakingInterval = null;
    }

    // Clear all queues and matches
    this.queue.clear();
    this.activeMatches.clear();

    console.log('Matchmaking service stopped');
  }
}
