import {
  NetworkMessage,
  NetworkMessageType,
  JoinQueuePayload,
  PlayerDecisionPayload,
  CommunicationMessagePayload,
  ErrorPayload,
} from '../types/network';
import { ConnectionManager } from './ConnectionManager';
import {
  SecurityValidationService,
  ValidationResult,
} from './SecurityValidationService';
import {
  NetworkSecurityService,
  AuthenticationToken,
} from './NetworkSecurityService';
import { Decision, PlayerDecision } from '../types';

export class NetworkMessageHandler {
  private connectionManager: ConnectionManager;
  private messageHandlers: Map<
    NetworkMessageType,
    (connectionId: string, message: NetworkMessage) => void
  >;
  private securityValidator: SecurityValidationService;
  private networkSecurity: NetworkSecurityService;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
    this.messageHandlers = new Map();
    this.securityValidator = new SecurityValidationService();
    this.networkSecurity = new NetworkSecurityService();
    this.setupMessageHandlers();

    // Start cleanup interval for rate limiting
    setInterval(() => {
      this.securityValidator.cleanupRateLimitEntries();
    }, 300000); // Clean up every 5 minutes
  }

  handleMessage(connectionId: string, message: NetworkMessage): void {
    try {
      // First, validate the message for security issues
      const messageValidation = this.securityValidator.validateNetworkMessage(
        message,
        connectionId
      );
      if (!messageValidation.isValid) {
        console.warn(
          `Security validation failed for connection ${connectionId}:`,
          messageValidation
        );
        this.sendError(
          connectionId,
          messageValidation.errorCode!,
          messageValidation.errorMessage!
        );
        return;
      }

      // Validate authentication token for protected operations
      if (this.requiresAuthentication(message.type)) {
        const authValidation = this.validateAuthentication(
          connectionId,
          message
        );
        if (!authValidation.isValid) {
          console.warn(
            `Authentication failed for connection ${connectionId}:`,
            authValidation
          );
          this.sendError(
            connectionId,
            authValidation.errorCode!,
            authValidation.errorMessage!
          );
          return;
        }
      }

      // Update connection activity
      this.connectionManager.updateConnectionActivity(connectionId);

      // Get the appropriate handler
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(connectionId, message);
      } else {
        console.warn(`No handler found for message type: ${message.type}`);
        this.sendError(
          connectionId,
          'UNKNOWN_MESSAGE_TYPE',
          `Unknown message type: ${message.type}`
        );
      }
    } catch (error) {
      console.error(
        `Error handling message from connection ${connectionId}:`,
        error
      );
      this.sendError(
        connectionId,
        'MESSAGE_PROCESSING_ERROR',
        'Failed to process message'
      );
    }
  }

  private setupMessageHandlers(): void {
    this.messageHandlers.set(
      NetworkMessageType.HEARTBEAT,
      this.handleHeartbeat.bind(this)
    );
    this.messageHandlers.set(
      NetworkMessageType.JOIN_QUEUE,
      this.handleJoinQueue.bind(this)
    );
    this.messageHandlers.set(
      NetworkMessageType.LEAVE_QUEUE,
      this.handleLeaveQueue.bind(this)
    );
    this.messageHandlers.set(
      NetworkMessageType.PLAYER_DECISION,
      this.handlePlayerDecision.bind(this)
    );
    this.messageHandlers.set(
      NetworkMessageType.COMMUNICATION_MESSAGE,
      this.handleCommunicationMessage.bind(this)
    );
    this.messageHandlers.set(
      NetworkMessageType.DECISION_REVERSAL,
      this.handleDecisionReversal.bind(this)
    );
    this.messageHandlers.set(
      NetworkMessageType.RECONNECT,
      this.handleReconnect.bind(this)
    );
  }

  private handleHeartbeat(connectionId: string, message: NetworkMessage): void {
    // Respond with pong
    this.sendMessage(connectionId, {
      type: NetworkMessageType.PONG,
      payload: { timestamp: new Date() },
      timestamp: new Date(),
    });
  }

  private handleJoinQueue(connectionId: string, message: NetworkMessage): void {
    const payload = message.payload as JoinQueuePayload;

    if (!payload.player) {
      this.sendError(
        connectionId,
        'INVALID_PAYLOAD',
        'Player information required'
      );
      return;
    }

    // Associate player with connection
    const success = this.connectionManager.associatePlayerWithConnection(
      payload.player.id,
      connectionId
    );

    if (!success) {
      this.sendError(
        connectionId,
        'CONNECTION_ERROR',
        'Failed to associate player with connection'
      );
      return;
    }

    // TODO: Forward to matchmaking service
    console.log(`Player ${payload.player.id} joined matchmaking queue`);

    // Send confirmation
    this.sendMessage(connectionId, {
      type: NetworkMessageType.JOIN_QUEUE,
      payload: { status: 'queued', position: 1 }, // TODO: Get actual position
      timestamp: new Date(),
    });
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

    // TODO: Forward to matchmaking service
    console.log(`Player ${connection.playerId} left matchmaking queue`);

    // Send confirmation
    this.sendMessage(connectionId, {
      type: NetworkMessageType.LEAVE_QUEUE,
      payload: { status: 'removed' },
      timestamp: new Date(),
    });
  }

  private handlePlayerDecision(
    connectionId: string,
    message: NetworkMessage
  ): void {
    const payload = message.payload as PlayerDecisionPayload;
    const connection = this.connectionManager.getConnection(connectionId);

    if (!connection?.playerId) {
      this.sendError(
        connectionId,
        'NO_PLAYER_ASSOCIATED',
        'No player associated with connection'
      );
      return;
    }

    if (
      !payload.sessionId ||
      !payload.decision ||
      payload.roundNumber === undefined
    ) {
      this.sendError(
        connectionId,
        'INVALID_PAYLOAD',
        'Session ID, decision, and round number required'
      );
      return;
    }

    // Validate decision value
    if (!Object.values(Decision).includes(payload.decision)) {
      this.sendError(
        connectionId,
        'INVALID_DECISION',
        `Invalid decision value: ${payload.decision}`
      );
      return;
    }

    // Create PlayerDecision object for validation
    const playerDecision: PlayerDecision = {
      playerId: connection.playerId,
      decision: payload.decision,
      timestamp: message.timestamp,
      canReverse: false, // Will be determined by game logic
    };

    // TODO: Get actual session and player context for full validation
    // For now, we'll do basic validation
    const basicValidation = this.validateBasicPlayerDecision(playerDecision);
    if (!basicValidation.isValid) {
      this.sendError(
        connectionId,
        basicValidation.errorCode!,
        basicValidation.errorMessage!
      );
      return;
    }

    // TODO: Forward to game manager with validated decision
    console.log(
      `Player ${connection.playerId} made validated decision: ${payload.decision} for round ${payload.roundNumber}`
    );

    // Send confirmation
    this.sendMessage(connectionId, {
      type: NetworkMessageType.PLAYER_DECISION,
      payload: { status: 'received', roundNumber: payload.roundNumber },
      timestamp: new Date(),
    });
  }

  private validateBasicPlayerDecision(
    decision: PlayerDecision
  ): ValidationResult {
    // Basic validation without full session context
    if (!decision.playerId || typeof decision.playerId !== 'string') {
      return {
        isValid: false,
        errorCode: 'INVALID_PLAYER_ID',
        errorMessage: 'Valid player ID is required',
      };
    }

    if (!Object.values(Decision).includes(decision.decision)) {
      return {
        isValid: false,
        errorCode: 'INVALID_DECISION_VALUE',
        errorMessage: `Invalid decision value: ${decision.decision}`,
      };
    }

    if (!decision.timestamp || !(decision.timestamp instanceof Date)) {
      return {
        isValid: false,
        errorCode: 'INVALID_TIMESTAMP',
        errorMessage: 'Valid timestamp is required',
      };
    }

    return { isValid: true };
  }

  private handleCommunicationMessage(
    connectionId: string,
    message: NetworkMessage
  ): void {
    const payload = message.payload as CommunicationMessagePayload;
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

    // TODO: Forward to communication manager
    console.log(
      `Player ${connection.playerId} sent communication: ${payload.message}`
    );

    // Send confirmation
    this.sendMessage(connectionId, {
      type: NetworkMessageType.COMMUNICATION_MESSAGE,
      payload: { status: 'sent' },
      timestamp: new Date(),
    });
  }

  private handleDecisionReversal(
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

    // TODO: Forward to game manager
    console.log(`Player ${connection.playerId} requested decision reversal`);

    // Send confirmation
    this.sendMessage(connectionId, {
      type: NetworkMessageType.DECISION_REVERSAL,
      payload: { status: 'processed' },
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

    // Associate player with new connection
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

    // TODO: Get current game state and send to player
    console.log(`Player ${playerId} reconnected`);

    // Send reconnection confirmation
    this.sendMessage(connectionId, {
      type: NetworkMessageType.RECONNECT,
      payload: {
        status: 'reconnected',
        playerId: playerId,
        // TODO: Include current game state
      },
      timestamp: new Date(),
    });
  }

  private sendMessage(connectionId: string, message: NetworkMessage): boolean {
    return this.connectionManager.sendToConnection(connectionId, message);
  }

  private sendError(connectionId: string, code: string, message: string): void {
    const errorMessage: NetworkMessage = {
      type: NetworkMessageType.ERROR,
      payload: {
        code,
        message,
      } as ErrorPayload,
      timestamp: new Date(),
    };

    this.sendMessage(connectionId, errorMessage);
  }

  // Method to register external handlers for specific message types
  registerHandler(
    messageType: NetworkMessageType,
    handler: (connectionId: string, message: NetworkMessage) => void
  ): void {
    this.messageHandlers.set(messageType, handler);
  }

  // Method to get connection manager (for external services)
  getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  // Method to get security validator (for external services)
  getSecurityValidator(): SecurityValidationService {
    return this.securityValidator;
  }

  // Method to get network security service (for external services)
  getNetworkSecurity(): NetworkSecurityService {
    return this.networkSecurity;
  }

  /**
   * Check if a message type requires authentication
   */
  private requiresAuthentication(messageType: NetworkMessageType): boolean {
    const protectedOperations = [
      NetworkMessageType.PLAYER_DECISION,
      NetworkMessageType.COMMUNICATION_MESSAGE,
      NetworkMessageType.DECISION_REVERSAL,
      NetworkMessageType.JOIN_QUEUE,
      NetworkMessageType.LEAVE_QUEUE,
    ];

    return protectedOperations.includes(messageType);
  }

  /**
   * Validate authentication for protected operations
   */
  private validateAuthentication(
    connectionId: string,
    message: NetworkMessage
  ): ValidationResult {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection?.playerId) {
      return {
        isValid: false,
        errorCode: 'NO_PLAYER_ASSOCIATED',
        errorMessage: 'No authenticated player associated with connection',
      };
    }

    // For now, we'll use a simple validation based on connection state
    // In a full implementation, you'd validate actual auth tokens from the message
    if (!message.playerId || message.playerId !== connection.playerId) {
      return {
        isValid: false,
        errorCode: 'PLAYER_ID_MISMATCH',
        errorMessage:
          'Message player ID does not match authenticated connection',
      };
    }

    // Validate connection consistency to prevent session hijacking
    const consistencyValidation =
      this.networkSecurity.validateConnectionConsistency(
        connection,
        message.playerId
      );
    if (!consistencyValidation.isValid) {
      return {
        isValid: false,
        errorCode: consistencyValidation.errorCode!,
        errorMessage: consistencyValidation.errorMessage!,
      };
    }

    return { isValid: true };
  }
}
