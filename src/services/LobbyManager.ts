import { v4 as uuidv4 } from 'uuid';
import {
  NetworkMessage,
  NetworkMessageType,
  GameMatch,
} from '../types/network';
import { Player } from '../types';
import { ConnectionManager } from './ConnectionManager';
import { MatchmakingService } from './MatchmakingService';

export interface LobbyPlayer {
  player: Player;
  status: LobbyPlayerStatus;
  joinTime: Date;
  lastActivity: Date;
}

export enum LobbyPlayerStatus {
  IDLE = 'idle',
  IN_QUEUE = 'in_queue',
  MATCHED = 'matched',
  IN_GAME = 'in_game',
}

export interface LobbyStats {
  totalPlayers: number;
  playersInQueue: number;
  playersInGame: number;
  activeMatches: number;
}

export class LobbyManager {
  private players: Map<string, LobbyPlayer> = new Map();
  private connectionManager: ConnectionManager;
  private matchmakingService: MatchmakingService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute
  private readonly PLAYER_TIMEOUT = 300000; // 5 minutes

  constructor(
    connectionManager: ConnectionManager,
    matchmakingService: MatchmakingService
  ) {
    this.connectionManager = connectionManager;
    this.matchmakingService = matchmakingService;
    this.startCleanup();
  }

  addPlayer(player: Player): void {
    const lobbyPlayer: LobbyPlayer = {
      player,
      status: LobbyPlayerStatus.IDLE,
      joinTime: new Date(),
      lastActivity: new Date(),
    };

    this.players.set(player.id, lobbyPlayer);
    console.log(`Player ${player.name} joined lobby`);

    // Send lobby welcome message
    this.sendLobbyUpdate(player.id);
  }

  removePlayer(playerId: string): void {
    const lobbyPlayer = this.players.get(playerId);
    if (!lobbyPlayer) {
      return;
    }

    // Remove from matchmaking queue if present
    if (lobbyPlayer.status === LobbyPlayerStatus.IN_QUEUE) {
      this.matchmakingService.removeFromQueue(playerId);
    }

    this.players.delete(playerId);
    console.log(`Player ${playerId} left lobby`);
  }

  updatePlayerActivity(playerId: string): void {
    const lobbyPlayer = this.players.get(playerId);
    if (lobbyPlayer) {
      lobbyPlayer.lastActivity = new Date();
    }
  }

  joinMatchmaking(playerId: string, preferences?: any): boolean {
    const lobbyPlayer = this.players.get(playerId);
    if (!lobbyPlayer) {
      return false;
    }

    if (lobbyPlayer.status !== LobbyPlayerStatus.IDLE) {
      // Send error - player already in queue or game
      this.connectionManager.sendToPlayer(playerId, {
        type: NetworkMessageType.ERROR,
        payload: {
          code: 'INVALID_STATE',
          message: 'Cannot join queue - player not in idle state',
        },
        timestamp: new Date(),
      });
      return false;
    }

    // Update player status
    lobbyPlayer.status = LobbyPlayerStatus.IN_QUEUE;
    lobbyPlayer.lastActivity = new Date();

    // Add to matchmaking queue
    this.matchmakingService.addToQueue(lobbyPlayer.player, preferences);

    console.log(`Player ${lobbyPlayer.player.name} joined matchmaking queue`);
    return true;
  }

  leaveMatchmaking(playerId: string): boolean {
    const lobbyPlayer = this.players.get(playerId);
    if (!lobbyPlayer) {
      return false;
    }

    if (lobbyPlayer.status !== LobbyPlayerStatus.IN_QUEUE) {
      return false;
    }

    // Update player status
    lobbyPlayer.status = LobbyPlayerStatus.IDLE;
    lobbyPlayer.lastActivity = new Date();

    // Remove from matchmaking queue
    this.matchmakingService.removeFromQueue(playerId);

    // Send lobby update
    this.sendLobbyUpdate(playerId);

    console.log(`Player ${lobbyPlayer.player.name} left matchmaking queue`);
    return true;
  }

  handleMatchFound(match: GameMatch): void {
    // Update player statuses
    match.players.forEach((player) => {
      const lobbyPlayer = this.players.get(player.id);
      if (lobbyPlayer) {
        lobbyPlayer.status = LobbyPlayerStatus.MATCHED;
        lobbyPlayer.lastActivity = new Date();
      }
    });

    console.log(
      `Match found for players: ${match.players.map((p) => p.name).join(', ')}`
    );
  }

  handleGameStart(playerId: string): void {
    const lobbyPlayer = this.players.get(playerId);
    if (lobbyPlayer) {
      lobbyPlayer.status = LobbyPlayerStatus.IN_GAME;
      lobbyPlayer.lastActivity = new Date();
    }
  }

  handleGameEnd(playerId: string): void {
    const lobbyPlayer = this.players.get(playerId);
    if (lobbyPlayer) {
      lobbyPlayer.status = LobbyPlayerStatus.IDLE;
      lobbyPlayer.lastActivity = new Date();

      // Send lobby update
      this.sendLobbyUpdate(playerId);
    }
  }

  getPlayer(playerId: string): LobbyPlayer | undefined {
    return this.players.get(playerId);
  }

  getAllPlayers(): LobbyPlayer[] {
    return Array.from(this.players.values());
  }

  getPlayersByStatus(status: LobbyPlayerStatus): LobbyPlayer[] {
    return Array.from(this.players.values()).filter(
      (player) => player.status === status
    );
  }

  getLobbyStats(): LobbyStats {
    const players = Array.from(this.players.values());

    return {
      totalPlayers: players.length,
      playersInQueue: players.filter(
        (p) => p.status === LobbyPlayerStatus.IN_QUEUE
      ).length,
      playersInGame: players.filter(
        (p) => p.status === LobbyPlayerStatus.IN_GAME
      ).length,
      activeMatches: this.matchmakingService.getActiveMatches().length,
    };
  }

  broadcastLobbyStats(): void {
    const stats = this.getLobbyStats();
    const matchmakingStats = this.matchmakingService.getQueueStats();

    const message: NetworkMessage = {
      type: NetworkMessageType.GAME_STATE_UPDATE,
      payload: {
        lobbyStats: stats,
        matchmakingStats,
      },
      timestamp: new Date(),
    };

    // Broadcast to all connected players
    this.players.forEach((lobbyPlayer) => {
      if (this.connectionManager.isPlayerConnected(lobbyPlayer.player.id)) {
        this.connectionManager.sendToPlayer(lobbyPlayer.player.id, message);
      }
    });
  }

  private sendLobbyUpdate(playerId: string): void {
    const lobbyPlayer = this.players.get(playerId);
    if (!lobbyPlayer) {
      return;
    }

    const stats = this.getLobbyStats();
    const playerStatus = lobbyPlayer.status;

    this.connectionManager.sendToPlayer(playerId, {
      type: NetworkMessageType.GAME_STATE_UPDATE,
      payload: {
        playerStatus,
        lobbyStats: stats,
        availableActions: this.getAvailableActions(playerStatus),
      },
      timestamp: new Date(),
    });
  }

  private getAvailableActions(status: LobbyPlayerStatus): string[] {
    switch (status) {
      case LobbyPlayerStatus.IDLE:
        return ['join_queue', 'view_stats', 'view_profile'];
      case LobbyPlayerStatus.IN_QUEUE:
        return ['leave_queue', 'view_queue_status'];
      case LobbyPlayerStatus.MATCHED:
        return ['accept_match', 'decline_match'];
      case LobbyPlayerStatus.IN_GAME:
        return ['view_game_state'];
      default:
        return [];
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactivePlayers();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanupInactivePlayers(): void {
    const now = new Date();
    const playersToRemove: string[] = [];

    this.players.forEach((lobbyPlayer, playerId) => {
      const timeSinceActivity =
        now.getTime() - lobbyPlayer.lastActivity.getTime();

      // Check if player is still connected
      const isConnected = this.connectionManager.isPlayerConnected(playerId);

      if (!isConnected || timeSinceActivity > this.PLAYER_TIMEOUT) {
        playersToRemove.push(playerId);
      }
    });

    playersToRemove.forEach((playerId) => {
      console.log(`Removing inactive player from lobby: ${playerId}`);
      this.removePlayer(playerId);
    });

    if (playersToRemove.length > 0) {
      console.log(
        `Cleaned up ${playersToRemove.length} inactive players from lobby`
      );
    }
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.players.clear();
    console.log('Lobby manager stopped');
  }
}
