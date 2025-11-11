import {
  NetworkMessage,
  NetworkMessageType,
  WebSocketConnection,
} from '../types/network';
import {
  PartyMessage,
  PartyMessageType,
  TournamentUpdate,
  TournamentUpdateType,
  HostAction,
  HostActionType,
  ChatMessage,
  ChatMessageType,
  LobbyError,
  TournamentError,
} from '../types/party';
import { WebSocketServer } from './WebSocketServer';
import { ConnectionManager } from './ConnectionManager';
import { NetworkMessageHandler } from './NetworkMessageHandler';
import { getTournamentMessageSecurityService } from './TournamentMessageSecurityService';

/**
 * Extended WebSocket server for Party Mode functionality
 * Handles party-specific message types and tournament coordination
 */
export class PartyWebSocketServer {
  private webSocketServer: WebSocketServer;
  private connectionManager: ConnectionManager;
  private messageHandler: NetworkMessageHandler;
  private messageSecurityService = getTournamentMessageSecurityService();
  private partyMessageHandlers: Map<
    PartyMessageType,
    (connectionId: string, message: PartyMessage) => void
  >;
  private lobbyConnections: Map<string, Set<string>>; // lobbyId -> connectionIds
  private tournamentConnections: Map<string, Set<string>>; // tournamentId -> connectionIds
  private blockedConnections: Set<string> = new Set(); // Temporarily blocked connections

  constructor(webSocketServer: WebSocketServer) {
    this.webSocketServer = webSocketServer;
    this.connectionManager = webSocketServer.getConnectionManager();
    this.messageHandler = webSocketServer.getMessageHandler();
    this.partyMessageHandlers = new Map();
    this.lobbyConnections = new Map();
    this.tournamentConnections = new Map();

    this.setupPartyMessageHandlers();
    this.registerPartyMessageTypes();
  }

  /**
   * Setup handlers for party-specific message types
   */
  private setupPartyMessageHandlers(): void {
    // Lobby management handlers
    this.partyMessageHandlers.set(
      PartyMessageType.PLAYER_JOINED,
      this.handlePlayerJoined.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.PLAYER_LEFT,
      this.handlePlayerLeft.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.SETTINGS_UPDATED,
      this.handleSettingsUpdated.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.HOST_CHANGED,
      this.handleHostChanged.bind(this)
    );

    // Tournament flow handlers
    this.partyMessageHandlers.set(
      PartyMessageType.TOURNAMENT_STARTED,
      this.handleTournamentStarted.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.TOURNAMENT_COMPLETED,
      this.handleTournamentCompleted.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.ROUND_STARTED,
      this.handleRoundStarted.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.ROUND_COMPLETED,
      this.handleRoundCompleted.bind(this)
    );

    // Match management handlers
    this.partyMessageHandlers.set(
      PartyMessageType.MATCH_READY,
      this.handleMatchReady.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.MATCH_STARTED,
      this.handleMatchStarted.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.MATCH_COMPLETED,
      this.handleMatchCompleted.bind(this)
    );

    // Communication handlers
    this.partyMessageHandlers.set(
      PartyMessageType.CHAT_MESSAGE,
      this.handleChatMessage.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.SYSTEM_MESSAGE,
      this.handleSystemMessage.bind(this)
    );

    // Update handlers
    this.partyMessageHandlers.set(
      PartyMessageType.BRACKET_UPDATE,
      this.handleBracketUpdate.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.PLAYER_STATUS_UPDATE,
      this.handlePlayerStatusUpdate.bind(this)
    );
    this.partyMessageHandlers.set(
      PartyMessageType.STATISTICS_UPDATE,
      this.handleStatisticsUpdate.bind(this)
    );
  }

  /**
   * Register party message types with the main message handler
   */
  private registerPartyMessageTypes(): void {
    // Register a generic party message handler that routes to specific handlers
    this.messageHandler.registerHandler(
      NetworkMessageType.PARTY_MESSAGE as any, // Cast to avoid type issues
      this.handlePartyMessage.bind(this)
    );

    // Register host action handler
    this.messageHandler.registerHandler(
      NetworkMessageType.HOST_ACTION as any,
      this.handleHostAction.bind(this)
    );

    // Register tournament update handler
    this.messageHandler.registerHandler(
      NetworkMessageType.TOURNAMENT_UPDATE as any,
      this.handleTournamentUpdateMessage.bind(this)
    );
  }

  /**
   * Handle incoming party messages and route to appropriate handlers
   */
  private handlePartyMessage(connectionId: string, message: NetworkMessage): void {
    try {
      // Check if connection is blocked
      if (this.blockedConnections.has(connectionId)) {
        this.sendPartyError(connectionId, 'CONNECTION_BLOCKED', 'Connection temporarily blocked due to security violations');
        return;
      }

      const partyMessage = message.payload as PartyMessage;
      const connection = this.connectionManager.getConnection(connectionId);
      const senderId = connection?.playerId || 'unknown';

      // Validate message security
      const securityValidation = this.messageSecurityService.validatePartyMessage(
        partyMessage,
        senderId,
        connectionId
      );

      if (!securityValidation.isValid) {
        if (securityValidation.shouldBlock) {
          this.blockedConnections.add(connectionId);
          // Auto-unblock after 5 minutes
          setTimeout(() => {
            this.blockedConnections.delete(connectionId);
          }, 5 * 60 * 1000);
        }

        if (securityValidation.shouldLog) {
          console.warn(`Security violation from connection ${connectionId}:`, {
            error: securityValidation.errorMessage,
            riskLevel: securityValidation.riskLevel,
            senderId
          });
        }

        this.sendPartyError(connectionId, securityValidation.errorCode || 'SECURITY_VIOLATION', securityValidation.errorMessage || 'Message failed security validation');
        return;
      }

      if (!partyMessage.type || !partyMessage.lobbyId) {
        this.sendPartyError(connectionId, 'INVALID_PARTY_MESSAGE', 'Party message must have type and lobbyId');
        return;
      }

      const handler = this.partyMessageHandlers.get(partyMessage.type);
      if (handler) {
        handler(connectionId, partyMessage);
      } else {
        console.warn(`No handler found for party message type: ${partyMessage.type}`);
        this.sendPartyError(connectionId, 'UNKNOWN_PARTY_MESSAGE_TYPE', `Unknown party message type: ${partyMessage.type}`);
      }
    } catch (error) {
      console.error(`Error handling party message from connection ${connectionId}:`, error);
      this.sendPartyError(connectionId, 'PARTY_MESSAGE_PROCESSING_ERROR', 'Failed to process party message');
    }
  }

  /**
   * Handle host actions
   */
  private handleHostAction(connectionId: string, message: NetworkMessage): void {
    try {
      // Check if connection is blocked
      if (this.blockedConnections.has(connectionId)) {
        this.sendPartyError(connectionId, 'CONNECTION_BLOCKED', 'Connection temporarily blocked due to security violations');
        return;
      }

      const hostAction = message.payload as HostAction;

      if (!hostAction.type || !hostAction.lobbyId || !hostAction.hostId) {
        this.sendPartyError(connectionId, 'INVALID_HOST_ACTION', 'Host action must have type, lobbyId, and hostId');
        return;
      }

      // Verify the connection belongs to the host
      const connection = this.connectionManager.getConnection(connectionId);
      if (!connection?.playerId || connection.playerId !== hostAction.hostId) {
        this.sendPartyError(connectionId, LobbyError.HOST_PRIVILEGES_REQUIRED, 'Host privileges required for this action');
        return;
      }

      // Validate host action security
      const securityValidation = this.messageSecurityService.validateHostAction(
        hostAction,
        connection.playerId,
        true // isActualHost - already verified above
      );

      if (!securityValidation.isValid) {
        if (securityValidation.shouldBlock) {
          this.blockedConnections.add(connectionId);
          setTimeout(() => {
            this.blockedConnections.delete(connectionId);
          }, 5 * 60 * 1000);
        }

        if (securityValidation.shouldLog) {
          console.warn(`Host action security violation from connection ${connectionId}:`, {
            error: securityValidation.errorMessage,
            riskLevel: securityValidation.riskLevel,
            action: hostAction.type
          });
        }

        this.sendPartyError(connectionId, securityValidation.errorCode || 'SECURITY_VIOLATION', securityValidation.errorMessage || 'Host action failed security validation');
        return;
      }

      // Process the host action based on type
      switch (hostAction.type) {
        case HostActionType.KICK_PLAYER:
          this.processKickPlayer(hostAction);
          break;
        case HostActionType.UPDATE_SETTINGS:
          this.processUpdateSettings(hostAction);
          break;
        case HostActionType.START_TOURNAMENT:
          this.processStartTournament(hostAction);
          break;
        case HostActionType.CANCEL_TOURNAMENT:
          this.processCancelTournament(hostAction);
          break;
        case HostActionType.TRANSFER_HOST:
          this.processTransferHost(hostAction);
          break;
        case HostActionType.CLOSE_LOBBY:
          this.processCloseLobby(hostAction);
          break;
        default:
          this.sendPartyError(connectionId, 'UNKNOWN_HOST_ACTION', `Unknown host action type: ${hostAction.type}`);
      }
    } catch (error) {
      console.error(`Error handling host action from connection ${connectionId}:`, error);
      this.sendPartyError(connectionId, 'HOST_ACTION_PROCESSING_ERROR', 'Failed to process host action');
    }
  }

  /**
   * Handle tournament update messages
   */
  private handleTournamentUpdateMessage(connectionId: string, message: NetworkMessage): void {
    try {
      const tournamentUpdate = message.payload as TournamentUpdate;

      if (!tournamentUpdate.type || !tournamentUpdate.tournamentId) {
        this.sendPartyError(connectionId, 'INVALID_TOURNAMENT_UPDATE', 'Tournament update must have type and tournamentId');
        return;
      }

      // Broadcast tournament update to all tournament participants
      this.broadcastToTournament(tournamentUpdate.tournamentId, {
        type: NetworkMessageType.TOURNAMENT_UPDATE as any,
        payload: tournamentUpdate,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`Error handling tournament update from connection ${connectionId}:`, error);
      this.sendPartyError(connectionId, 'TOURNAMENT_UPDATE_PROCESSING_ERROR', 'Failed to process tournament update');
    }
  }

  // Lobby Management Handlers
  private handlePlayerJoined(connectionId: string, message: PartyMessage): void {
    this.addConnectionToLobby(connectionId, message.lobbyId);
    this.broadcastToLobby(message.lobbyId, message, connectionId);
  }

  private handlePlayerLeft(connectionId: string, message: PartyMessage): void {
    this.removeConnectionFromLobby(connectionId, message.lobbyId);
    this.broadcastToLobby(message.lobbyId, message);
  }

  private handleSettingsUpdated(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  private handleHostChanged(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  // Tournament Flow Handlers
  private handleTournamentStarted(connectionId: string, message: PartyMessage): void {
    // Move all lobby connections to tournament tracking
    const lobbyConnections = this.lobbyConnections.get(message.lobbyId);
    if (lobbyConnections && message.data?.tournamentId) {
      this.tournamentConnections.set(message.data.tournamentId, new Set(lobbyConnections));
    }
    this.broadcastToLobby(message.lobbyId, message);
  }

  private handleTournamentCompleted(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
    // Clean up tournament connections
    if (message.data?.tournamentId) {
      this.tournamentConnections.delete(message.data.tournamentId);
    }
  }

  private handleRoundStarted(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  private handleRoundCompleted(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  // Match Management Handlers
  private handleMatchReady(connectionId: string, message: PartyMessage): void {
    // Send match ready notification to specific players
    if (message.data?.playerIds) {
      message.data.playerIds.forEach((playerId: string) => {
        this.sendToPlayer(playerId, {
          type: NetworkMessageType.MATCH_READY as any,
          payload: message,
          timestamp: new Date(),
        });
      });
    }
  }

  private handleMatchStarted(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  private handleMatchCompleted(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  // Communication Handlers
  private handleChatMessage(connectionId: string, message: PartyMessage): void {
    // Validate chat message
    const chatMessage = message.data as ChatMessage;
    if (!chatMessage || !chatMessage.message || !chatMessage.senderId) {
      this.sendPartyError(connectionId, 'INVALID_CHAT_MESSAGE', 'Chat message must have message content and sender ID');
      return;
    }

    // Get connection info for security validation
    const connection = this.connectionManager.getConnection(connectionId);
    const senderId = connection?.playerId || 'unknown';

    // Validate chat message security
    const securityValidation = this.messageSecurityService.validateChatMessage(chatMessage, senderId);

    if (!securityValidation.isValid) {
      if (securityValidation.shouldBlock) {
        this.blockedConnections.add(connectionId);
        setTimeout(() => {
          this.blockedConnections.delete(connectionId);
        }, 5 * 60 * 1000);
      }

      if (securityValidation.shouldLog) {
        console.warn(`Chat message security violation from connection ${connectionId}:`, {
          error: securityValidation.errorMessage,
          riskLevel: securityValidation.riskLevel,
          senderId
        });
      }

      this.sendPartyError(connectionId, securityValidation.errorCode || 'CHAT_SECURITY_VIOLATION', securityValidation.errorMessage || 'Chat message failed security validation');
      return;
    }

    // Broadcast chat message to all lobby participants
    this.broadcastToLobby(message.lobbyId, message);
  }

  private handleSystemMessage(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  // Update Handlers
  private handleBracketUpdate(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  private handlePlayerStatusUpdate(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  private handleStatisticsUpdate(connectionId: string, message: PartyMessage): void {
    this.broadcastToLobby(message.lobbyId, message);
  }

  // Host Action Processors
  private processKickPlayer(action: HostAction): void {
    if (!action.targetPlayerId) {
      return;
    }

    // Find and disconnect the target player
    const targetConnection = this.connectionManager.getConnectionByPlayerId(action.targetPlayerId);
    if (targetConnection) {
      this.removeConnectionFromLobby(targetConnection.id, action.lobbyId);

      // Notify the kicked player
      this.sendToConnection(targetConnection.id, {
        type: NetworkMessageType.PARTY_MESSAGE as any,
        payload: {
          type: PartyMessageType.PLAYER_KICKED,
          lobbyId: action.lobbyId,
          data: { reason: 'Kicked by host' },
          timestamp: new Date(),
        },
        timestamp: new Date(),
      });

      // Notify other lobby members
      this.broadcastToLobby(action.lobbyId, {
        type: PartyMessageType.PLAYER_LEFT,
        lobbyId: action.lobbyId,
        data: {
          playerId: action.targetPlayerId,
          reason: 'kicked'
        },
        timestamp: new Date(),
      });
    }
  }

  private processUpdateSettings(action: HostAction): void {
    // Broadcast settings update to all lobby members
    this.broadcastToLobby(action.lobbyId, {
      type: PartyMessageType.SETTINGS_UPDATED,
      lobbyId: action.lobbyId,
      senderId: action.hostId,
      data: action.data,
      timestamp: new Date(),
    });
  }

  private processStartTournament(action: HostAction): void {
    // Broadcast tournament start to all lobby members
    this.broadcastToLobby(action.lobbyId, {
      type: PartyMessageType.TOURNAMENT_STARTED,
      lobbyId: action.lobbyId,
      senderId: action.hostId,
      data: action.data,
      timestamp: new Date(),
    });
  }

  private processCancelTournament(action: HostAction): void {
    // Broadcast tournament cancellation to all lobby members
    this.broadcastToLobby(action.lobbyId, {
      type: PartyMessageType.TOURNAMENT_COMPLETED,
      lobbyId: action.lobbyId,
      senderId: action.hostId,
      data: { cancelled: true, ...action.data },
      timestamp: new Date(),
    });
  }

  private processTransferHost(action: HostAction): void {
    if (!action.targetPlayerId) {
      return;
    }

    // Broadcast host change to all lobby members
    this.broadcastToLobby(action.lobbyId, {
      type: PartyMessageType.HOST_CHANGED,
      lobbyId: action.lobbyId,
      senderId: action.hostId,
      data: {
        newHostId: action.targetPlayerId,
        previousHostId: action.hostId
      },
      timestamp: new Date(),
    });
  }

  private processCloseLobby(action: HostAction): void {
    // Notify all lobby members that lobby is closing
    this.broadcastToLobby(action.lobbyId, {
      type: PartyMessageType.SYSTEM_MESSAGE,
      lobbyId: action.lobbyId,
      senderId: action.hostId,
      data: {
        message: 'Lobby has been closed by the host',
        type: 'lobby_closed'
      },
      timestamp: new Date(),
    });

    // Remove all connections from lobby
    const connections = this.lobbyConnections.get(action.lobbyId);
    if (connections) {
      connections.forEach(connectionId => {
        this.removeConnectionFromLobby(connectionId, action.lobbyId);
      });
    }
  }

  // Public API Methods

  /**
   * Add a connection to a lobby for message broadcasting
   */
  addConnectionToLobby(connectionId: string, lobbyId: string): void {
    if (!this.lobbyConnections.has(lobbyId)) {
      this.lobbyConnections.set(lobbyId, new Set());
    }
    this.lobbyConnections.get(lobbyId)!.add(connectionId);
  }

  /**
   * Remove a connection from a lobby
   */
  removeConnectionFromLobby(connectionId: string, lobbyId: string): void {
    const connections = this.lobbyConnections.get(lobbyId);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.lobbyConnections.delete(lobbyId);
      }
    }
  }

  /**
   * Broadcast a message to all connections in a lobby
   */
  broadcastToLobby(lobbyId: string, message: PartyMessage, excludeConnectionId?: string): void {
    const connections = this.lobbyConnections.get(lobbyId);
    if (!connections) {
      return;
    }

    const networkMessage: NetworkMessage = {
      type: NetworkMessageType.PARTY_MESSAGE as any,
      payload: message,
      timestamp: new Date(),
    };

    connections.forEach(connectionId => {
      if (connectionId !== excludeConnectionId) {
        this.sendToConnection(connectionId, networkMessage);
      }
    });
  }

  /**
   * Broadcast a message to all connections in a tournament
   */
  broadcastToTournament(tournamentId: string, message: NetworkMessage, excludeConnectionId?: string): void {
    const connections = this.tournamentConnections.get(tournamentId);
    if (!connections) {
      return;
    }

    connections.forEach(connectionId => {
      if (connectionId !== excludeConnectionId) {
        this.sendToConnection(connectionId, message);
      }
    });
  }

  /**
   * Send a message to a specific player
   */
  sendToPlayer(playerId: string, message: NetworkMessage): boolean {
    return this.webSocketServer.sendToPlayer(playerId, message);
  }

  /**
   * Send a message to a specific connection
   */
  sendToConnection(connectionId: string, message: NetworkMessage): boolean {
    return this.connectionManager.sendToConnection(connectionId, message);
  }

  /**
   * Send a party-specific error message
   */
  private sendPartyError(connectionId: string, code: string, message: string): void {
    this.sendToConnection(connectionId, {
      type: NetworkMessageType.ERROR,
      payload: { code, message },
      timestamp: new Date(),
    });
  }

  /**
   * Get all connections in a lobby
   */
  getLobbyConnections(lobbyId: string): string[] {
    const connections = this.lobbyConnections.get(lobbyId);
    return connections ? Array.from(connections) : [];
  }

  /**
   * Get all connections in a tournament
   */
  getTournamentConnections(tournamentId: string): string[] {
    const connections = this.tournamentConnections.get(tournamentId);
    return connections ? Array.from(connections) : [];
  }

  /**
   * Clean up connections when a player disconnects
   */
  handlePlayerDisconnection(playerId: string): void {
    // Remove player from all lobbies and tournaments
    const connectionId = this.connectionManager.getConnectionByPlayerId(playerId)?.id;
    if (!connectionId) {
      return;
    }

    // Remove from all lobbies
    this.lobbyConnections.forEach((connections, lobbyId) => {
      if (connections.has(connectionId)) {
        this.removeConnectionFromLobby(connectionId, lobbyId);

        // Notify other lobby members
        this.broadcastToLobby(lobbyId, {
          type: PartyMessageType.PLAYER_LEFT,
          lobbyId: lobbyId,
          data: {
            playerId: playerId,
            reason: 'disconnected'
          },
          timestamp: new Date(),
        });
      }
    });

    // Remove from all tournaments
    this.tournamentConnections.forEach((connections) => {
      connections.delete(connectionId);
    });
  }
}