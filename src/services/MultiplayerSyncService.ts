import {
  NetworkMessage,
  NetworkMessageType,
  NetworkGameState,
} from '../types/network';
import { Player, GameSession, Decision } from '../types';
import { WebSocketServer } from './WebSocketServer';
import { ConnectionManager } from './ConnectionManager';
import { NetworkMessageHandler } from './NetworkMessageHandler';
import { MatchmakingService } from './MatchmakingService';
import { LobbyManager } from './LobbyManager';
import { NetworkGameManager } from './NetworkGameManager';
import { GameEngine } from './GameEngine';

export interface MultiplayerSyncConfig {
  port: number;
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
  connectionTimeout?: number;
}

export class MultiplayerSyncService {
  private webSocketServer: WebSocketServer;
  private connectionManager: ConnectionManager;
  private messageHandler: NetworkMessageHandler;
  private matchmakingService: MatchmakingService;
  private lobbyManager: LobbyManager;
  private networkGameManager: NetworkGameManager;
  private gameEngine: GameEngine;
  private isRunning = false;

  constructor(config: MultiplayerSyncConfig) {
    // Initialize core components
    this.webSocketServer = new WebSocketServer();
    this.connectionManager = this.webSocketServer.getConnectionManager();
    this.messageHandler = this.webSocketServer.getMessageHandler();
    this.gameEngine = new GameEngine();

    // Initialize multiplayer services
    this.matchmakingService = new MatchmakingService(this.connectionManager);
    this.lobbyManager = new LobbyManager(
      this.connectionManager,
      this.matchmakingService
    );
    this.networkGameManager = new NetworkGameManager(
      this.connectionManager,
      this.gameEngine
    );

    // Setup message handlers
    this.setupMessageHandlers();
  }

  async start(port: number): Promise<void> {
    if (this.isRunning) {
      throw new Error('Multiplayer sync service is already running');
    }

    try {
      await this.webSocketServer.start(port);
      this.isRunning = true;
      console.log(`Multiplayer sync service started on port ${port}`);
    } catch (error) {
      console.error('Failed to start multiplayer sync service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.webSocketServer.stop();
      this.matchmakingService.stop();
      this.lobbyManager.stop();
      this.isRunning = false;
      console.log('Multiplayer sync service stopped');
    } catch (error) {
      console.error('Error stopping multiplayer sync service:', error);
      throw error;
    }
  }

  private setupMessageHandlers(): void {
    // Override default handlers with our custom logic
    this.messageHandler.registerHandler(
      NetworkMessageType.JOIN_QUEUE,
      this.handleJoinQueue.bind(this)
    );

    this.messageHandler.registerHandler(
      NetworkMessageType.LEAVE_QUEUE,
      this.handleLeaveQueue.bind(this)
    );

    this.messageHandler.registerHandler(
      NetworkMessageType.PLAYER_DECISION,
      this.handlePlayerDecision.bind(this)
    );

    this.messageHandler.registerHandler(
      NetworkMessageType.COMMUNICATION_MESSAGE,
      this.handleCommunicationMessage.bind(this)
    );

    this.messageHandler.registerHandler(
      NetworkMessageType.DECISION_REVERSAL,
      this.handleDecisionReversal.bind(this)
    );

    this.messageHandler.registerHandler(
      NetworkMessageType.RECONNECT,
      this.handleReconnect.bind(this)
    );

    // Setup matchmaking callbacks
    this.setupMatchmakingCallbacks();
  }

  private setupMatchmakingCallbacks(): void {
    // Override matchmaking service to handle match creation
    const originalFindMatch = this.matchmakingService.findMatch.bind(
      this.matchmakingService
    );
    this.matchmakingService.findMatch = (playerId: string) => {
      const match = originalFindMatch(playerId);
      if (match) {
        // Create network game session
        const session = this.networkGameManager.createNetworkSession(match);

        // Update lobby
        this.lobbyManager.handleMatchFound(match);

        // Start game for both players
        match.players.forEach((player) => {
          this.lobbyManager.handleGameStart(player.id);
        });
      }
      return match;
    };
  }

  private handleJoinQueue(connectionId: string, message: NetworkMessage): void {
    const payload = message.payload;
    const player = payload.player as Player;

    if (!player) {
      this.sendError(
        connectionId,
        'INVALID_PAYLOAD',
        'Player information required'
      );
      return;
    }

    // Add player to lobby
    this.lobbyManager.addPlayer(player);

    // Join matchmaking queue
    const success = this.lobbyManager.joinMatchmaking(
      player.id,
      payload.preferences
    );

    if (!success) {
      this.sendError(
        connectionId,
        'QUEUE_JOIN_FAILED',
        'Failed to join matchmaking queue'
      );
      return;
    }

    // Associate player with connection
    this.connectionManager.associatePlayerWithConnection(
      player.id,
      connectionId
    );

    console.log(`Player ${player.name} joined matchmaking queue`);
  }

  private handleLeaveQueue(
    connectionId: string,
    message: NetworkMessage
  ): void {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection?.playerId) {
      this.sendError(
        connectionId,
        'NO_PLAYER_ASSOCIATED',
        'No player associated with connection'
      );
      return;
    }

    const success = this.lobbyManager.leaveMatchmaking(connection.playerId);

    if (!success) {
      this.sendError(
        connectionId,
        'QUEUE_LEAVE_FAILED',
        'Failed to leave matchmaking queue'
      );
      return;
    }

    console.log(`Player ${connection.playerId} left matchmaking queue`);
  }

  private handlePlayerDecision(
    connectionId: string,
    message: NetworkMessage
  ): void {
    const payload = message.payload;
    const connection = this.connectionManager.getConnection(connectionId);

    if (!connection?.playerId) {
      this.sendError(
        connectionId,
        'NO_PLAYER_ASSOCIATED',
        'No player associated with connection'
      );
      return;
    }

    if (!payload.sessionId || !payload.decision) {
      this.sendError(
        connectionId,
        'INVALID_PAYLOAD',
        'Session ID and decision required'
      );
      return;
    }

    // Forward to network game manager
    this.networkGameManager.handlePlayerDecision(
      payload.sessionId,
      connection.playerId,
      payload.decision
    );
  }

  private handleCommunicationMessage(
    connectionId: string,
    message: NetworkMessage
  ): void {
    const payload = message.payload;
    const connection = this.connectionManager.getConnection(connectionId);

    if (!connection?.playerId) {
      this.sendError(
        connectionId,
        'NO_PLAYER_ASSOCIATED',
        'No player associated with connection'
      );
      return;
    }

    if (!payload.sessionId || !payload.message) {
      this.sendError(
        connectionId,
        'INVALID_PAYLOAD',
        'Session ID and message required'
      );
      return;
    }

    // Forward to network game manager
    this.networkGameManager.handleCommunicationMessage(
      payload.sessionId,
      connection.playerId,
      payload.message
    );
  }

  private handleDecisionReversal(
    connectionId: string,
    message: NetworkMessage
  ): void {
    const payload = message.payload;
    const connection = this.connectionManager.getConnection(connectionId);

    if (!connection?.playerId) {
      this.sendError(
        connectionId,
        'NO_PLAYER_ASSOCIATED',
        'No player associated with connection'
      );
      return;
    }

    // TODO: Implement decision reversal logic
    console.log(`Decision reversal requested by player ${connection.playerId}`);

    this.connectionManager.sendToConnection(connectionId, {
      type: NetworkMessageType.DECISION_REVERSAL,
      payload: { status: 'not_implemented' },
      timestamp: new Date(),
    });
  }

  private handleReconnect(connectionId: string, message: NetworkMessage): void {
    const playerId = message.playerId;

    if (!playerId) {
      this.sendError(
        connectionId,
        'INVALID_PAYLOAD',
        'Player ID required for reconnection'
      );
      return;
    }

    // Associate player with connection
    const success = this.connectionManager.associatePlayerWithConnection(
      playerId,
      connectionId
    );

    if (!success) {
      this.sendError(
        connectionId,
        'RECONNECTION_FAILED',
        'Failed to reconnect player'
      );
      return;
    }

    // Update lobby activity
    this.lobbyManager.updatePlayerActivity(playerId);

    // Find active game session for player
    const activeSessions = this.networkGameManager.getAllActiveSessions();
    const playerSession = activeSessions.find((session) =>
      session.session.players.some((p) => p.id === playerId)
    );

    if (playerSession) {
      // Handle game reconnection
      this.networkGameManager.handlePlayerReconnection(
        playerSession.session.id,
        playerId
      );
    } else {
      // Send lobby state
      const lobbyPlayer = this.lobbyManager.getPlayer(playerId);
      if (lobbyPlayer) {
        this.connectionManager.sendToConnection(connectionId, {
          type: NetworkMessageType.RECONNECT,
          payload: {
            status: 'reconnected',
            playerStatus: lobbyPlayer.status,
            lobbyStats: this.lobbyManager.getLobbyStats(),
          },
          timestamp: new Date(),
        });
      }
    }

    console.log(`Player ${playerId} reconnected`);
  }

  private sendError(connectionId: string, code: string, message: string): void {
    this.connectionManager.sendToConnection(connectionId, {
      type: NetworkMessageType.ERROR,
      payload: { code, message },
      timestamp: new Date(),
    });
  }

  // Public methods for monitoring and management
  getServiceStats(): {
    isRunning: boolean;
    connections: number;
    activeConnections: number;
    playersInLobby: number;
    playersInQueue: number;
    activeGames: number;
    activeMatches: number;
  } {
    const connectionStats = this.connectionManager.getConnectionStats();
    const lobbyStats = this.lobbyManager.getLobbyStats();
    const gameStats = this.networkGameManager.getSessionStats();
    const matchmakingStats = this.matchmakingService.getQueueStats();

    return {
      isRunning: this.isRunning,
      connections: connectionStats.totalConnections,
      activeConnections: connectionStats.activeConnections,
      playersInLobby: lobbyStats.totalPlayers,
      playersInQueue: lobbyStats.playersInQueue,
      activeGames: gameStats.activeSessions,
      activeMatches: matchmakingStats.activeMatches,
    };
  }

  broadcastServerMessage(message: string): void {
    this.connectionManager.broadcastToAll({
      type: NetworkMessageType.GAME_STATE_UPDATE,
      payload: {
        serverMessage: message,
        timestamp: new Date(),
      },
      timestamp: new Date(),
    });
  }

  // Getters for external access
  getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  getMatchmakingService(): MatchmakingService {
    return this.matchmakingService;
  }

  getLobbyManager(): LobbyManager {
    return this.lobbyManager;
  }

  getNetworkGameManager(): NetworkGameManager {
    return this.networkGameManager;
  }

  isServiceRunning(): boolean {
    return this.isRunning;
  }
}
