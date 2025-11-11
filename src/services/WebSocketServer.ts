import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  WebSocketConnection,
  NetworkMessage,
  NetworkMessageType,
  WebSocketServer as IWebSocketServer,
} from '../types/network';
import { ConnectionManager } from './ConnectionManager';
import { NetworkMessageHandler } from './NetworkMessageHandler';
import { NetworkSecurityService } from './NetworkSecurityService';

export class WebSocketServer implements IWebSocketServer {
  private server: WebSocket.Server | null = null;
  private connectionManager: ConnectionManager;
  private messageHandler: NetworkMessageHandler;
  private networkSecurity: NetworkSecurityService;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 60000; // 60 seconds

  constructor() {
    this.connectionManager = new ConnectionManager();
    this.networkSecurity = new NetworkSecurityService();
    this.messageHandler = new NetworkMessageHandler(this.connectionManager);
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocket.Server({ port });

        this.server.on('connection', (socket: WebSocket) => {
          this.handleNewConnection(socket);
        });

        this.server.on('error', (error) => {
          console.error('WebSocket server error:', error);
          reject(error);
        });

        this.server.on('listening', () => {
          console.log(`WebSocket server started on port ${port}`);
          this.startHeartbeat();
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Close all connections
      this.connectionManager.getAllConnections().forEach((connection) => {
        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.close();
        }
      });

      if (this.server) {
        this.server.close(() => {
          console.log('WebSocket server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  broadcast(message: NetworkMessage, excludeConnectionId?: string): void {
    this.connectionManager.broadcastToAll(message, excludeConnectionId);
  }

  sendToPlayer(playerId: string, message: NetworkMessage): boolean {
    return this.connectionManager.sendToPlayer(playerId, message);
  }

  getActiveConnections(): WebSocketConnection[] {
    return this.connectionManager.getActiveConnections();
  }

  handleConnection(connection: WebSocketConnection): void {
    this.connectionManager.addConnection(connection);
  }

  handleDisconnection(connectionId: string): void {
    const connection = this.connectionManager.getConnection(connectionId);
    if (connection) {
      console.log(
        `Connection disconnected: ${connectionId}, Player: ${connection.playerId || 'Unknown'}`
      );

      // Notify other services about player disconnection
      if (connection.playerId) {
        this.broadcast(
          {
            type: NetworkMessageType.DISCONNECT,
            payload: { playerId: connection.playerId },
            timestamp: new Date(),
          },
          connectionId
        );
      }

      this.connectionManager.removeConnection(connectionId);
    }
  }

  private handleNewConnection(socket: WebSocket): void {
    const connectionId = uuidv4();

    // Get client IP for security validation
    const clientIP = this.getClientIP(socket);

    // Validate IP rate limiting
    const ipValidation = this.networkSecurity.validateIPRateLimit(clientIP);
    if (!ipValidation.isValid) {
      console.warn(
        `Connection rejected from ${clientIP}: ${ipValidation.errorMessage}`
      );
      socket.close(1008, ipValidation.errorMessage);
      return;
    }

    const connection: WebSocketConnection = {
      id: connectionId,
      socket,
      isAlive: true,
      lastPing: new Date(),
    };

    this.handleConnection(connection);

    socket.on('message', (data: WebSocket.Data) => {
      this.handleMessage(connectionId, data, clientIP);
    });

    socket.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    socket.on('error', (error) => {
      console.error(`WebSocket error for connection ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
    });

    socket.on('pong', () => {
      const conn = this.connectionManager.getConnection(connectionId);
      if (conn) {
        conn.isAlive = true;
        conn.lastPing = new Date();
      }
    });

    // Send connection confirmation
    this.sendMessage(connectionId, {
      type: NetworkMessageType.CONNECT,
      payload: { connectionId },
      timestamp: new Date(),
    });
  }

  private handleMessage(
    connectionId: string,
    data: WebSocket.Data,
    clientIP: string
  ): void {
    try {
      // Validate IP rate limiting for each message
      const ipValidation = this.networkSecurity.validateIPRateLimit(clientIP);
      if (!ipValidation.isValid) {
        console.warn(
          `Message rejected from ${clientIP}: ${ipValidation.errorMessage}`
        );
        if (ipValidation.shouldBlock) {
          this.handleDisconnection(connectionId);
          return;
        }
        this.sendError(
          connectionId,
          ipValidation.errorCode!,
          ipValidation.errorMessage!
        );
        return;
      }

      const rawMessage = JSON.parse(data.toString());

      // Validate message security (size, content)
      const messageValidation = this.networkSecurity.validateMessageSecurity(
        rawMessage,
        connectionId
      );
      if (!messageValidation.isValid) {
        console.warn(
          `Insecure message from connection ${connectionId}: ${messageValidation.errorMessage}`
        );
        if (messageValidation.shouldBlock) {
          this.handleDisconnection(connectionId);
          return;
        }
        this.sendError(
          connectionId,
          messageValidation.errorCode!,
          messageValidation.errorMessage!
        );
        return;
      }

      // For now, we'll handle unencrypted messages but log a warning
      // In production, all messages should be encrypted
      let message: NetworkMessage;
      if (rawMessage.encryptedData) {
        // Handle encrypted message
        try {
          message = this.networkSecurity.decryptMessage(rawMessage);
        } catch (error) {
          console.error(
            `Failed to decrypt message from connection ${connectionId}:`,
            error
          );
          this.sendError(
            connectionId,
            'DECRYPTION_FAILED',
            'Failed to decrypt message'
          );
          return;
        }
      } else {
        // Handle unencrypted message (for backward compatibility)
        message = rawMessage as NetworkMessage;
        console.warn(
          `Received unencrypted message from connection ${connectionId} - consider upgrading client`
        );
      }

      this.messageHandler.handleMessage(connectionId, message);
    } catch (error) {
      console.error(
        `Failed to parse message from connection ${connectionId}:`,
        error
      );
      this.sendError(
        connectionId,
        'INVALID_MESSAGE',
        'Failed to parse message'
      );
    }
  }

  private sendMessage(connectionId: string, message: NetworkMessage): boolean {
    return this.connectionManager.sendToConnection(connectionId, message);
  }

  private sendError(connectionId: string, code: string, message: string): void {
    this.sendMessage(connectionId, {
      type: NetworkMessageType.ERROR,
      payload: { code, message },
      timestamp: new Date(),
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.performHeartbeatCheck();
    }, this.HEARTBEAT_INTERVAL);
  }

  private performHeartbeatCheck(): void {
    const activeConnections = this.connectionManager.getActiveConnections();
    const connectionsToRemove: string[] = [];

    activeConnections.forEach((connection) => {
      const timeSinceLastPing =
        new Date().getTime() - connection.lastPing.getTime();

      if (timeSinceLastPing > this.CONNECTION_TIMEOUT) {
        // Connection timed out
        connectionsToRemove.push(connection.id);
      } else if (connection.socket.readyState === WebSocket.OPEN) {
        // Check if connection is still alive from previous ping
        if (!connection.isAlive) {
          // Connection didn't respond to previous ping
          connectionsToRemove.push(connection.id);
        } else {
          // Send ping
          try {
            connection.socket.ping();
            connection.isAlive = false; // Will be set to true when pong is received
          } catch (error) {
            console.error(`Failed to ping connection ${connection.id}:`, error);
            connectionsToRemove.push(connection.id);
          }
        }
      } else {
        // Connection is not open
        connectionsToRemove.push(connection.id);
      }
    });

    // Remove dead connections
    connectionsToRemove.forEach((connectionId) => {
      this.handleDisconnection(connectionId);
    });
  }

  // Getter methods for external access
  getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  getMessageHandler(): NetworkMessageHandler {
    return this.messageHandler;
  }

  getNetworkSecurity(): NetworkSecurityService {
    return this.networkSecurity;
  }

  // Helper method to get client IP
  private getClientIP(socket: any): string {
    try {
      // Try to get real IP from headers (if behind proxy)
      const forwarded = socket.upgradeReq?.headers['x-forwarded-for'];
      if (forwarded && typeof forwarded === 'string') {
        const ip = forwarded.split(',')[0].trim();
        if (ip && ip !== 'unknown') {
          return ip;
        }
      }

      const realIP = socket.upgradeReq?.headers['x-real-ip'];
      if (realIP && typeof realIP === 'string' && realIP !== 'unknown') {
        return realIP;
      }

      // Fallback to socket remote address
      const remoteAddress =
        socket.upgradeReq?.connection?.remoteAddress ||
        socket._socket?.remoteAddress;

      if (
        remoteAddress &&
        remoteAddress !== '::1' &&
        remoteAddress !== '127.0.0.1'
      ) {
        return remoteAddress;
      }

      return 'localhost';
    } catch (error) {
      console.warn('Failed to get client IP:', error);
      return 'unknown';
    }
  }
}
