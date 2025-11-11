import {
  WebSocketConnection,
  NetworkMessage,
  NetworkMessageType,
} from '../types/network';
import { Player } from '../types';

export class ConnectionManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private playerConnections: Map<string, string> = new Map(); // playerId -> connectionId

  addConnection(connection: WebSocketConnection): void {
    this.connections.set(connection.id, connection);
    console.log(`Connection added: ${connection.id}`);
  }

  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      // Remove player mapping if exists
      if (connection.playerId) {
        this.playerConnections.delete(connection.playerId);
      }

      this.connections.delete(connectionId);
      console.log(`Connection removed: ${connectionId}`);
    }
  }

  associatePlayerWithConnection(
    playerId: string,
    connectionId: string
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    // Remove any existing association for this player
    const existingConnectionId = this.playerConnections.get(playerId);
    if (existingConnectionId && existingConnectionId !== connectionId) {
      const existingConnection = this.connections.get(existingConnectionId);
      if (existingConnection) {
        existingConnection.playerId = undefined;
      }
    }

    connection.playerId = playerId;
    this.playerConnections.set(playerId, connectionId);

    console.log(
      `Player ${playerId} associated with connection ${connectionId}`
    );
    return true;
  }

  getConnectionByPlayer(playerId: string): WebSocketConnection | undefined {
    const connectionId = this.playerConnections.get(playerId);
    if (!connectionId) {
      return undefined;
    }
    return this.connections.get(connectionId);
  }

  getConnectionByPlayerId(playerId: string): WebSocketConnection | undefined {
    return this.getConnectionByPlayer(playerId);
  }

  getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  getAllConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  getActiveConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(
      (connection) => connection.socket.readyState === 1 // WebSocket.OPEN
    );
  }

  getPlayerConnections(): Map<string, string> {
    return new Map(this.playerConnections);
  }

  isPlayerConnected(playerId: string): boolean {
    const connection = this.getConnectionByPlayer(playerId);
    return connection !== undefined && connection.socket.readyState === 1;
  }

  sendToConnection(connectionId: string, message: NetworkMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.socket.readyState !== 1) {
      return false;
    }

    try {
      connection.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(
        `Failed to send message to connection ${connectionId}:`,
        error
      );
      return false;
    }
  }

  sendToPlayer(playerId: string, message: NetworkMessage): boolean {
    const connection = this.getConnectionByPlayer(playerId);
    if (!connection) {
      return false;
    }
    return this.sendToConnection(connection.id, message);
  }

  broadcastToAll(message: NetworkMessage, excludeConnectionId?: string): void {
    const messageString = JSON.stringify(message);

    this.connections.forEach((connection, connectionId) => {
      if (
        connectionId !== excludeConnectionId &&
        connection.socket.readyState === 1
      ) {
        try {
          connection.socket.send(messageString);
        } catch (error) {
          console.error(
            `Failed to broadcast to connection ${connectionId}:`,
            error
          );
        }
      }
    });
  }

  broadcastToPlayers(playerIds: string[], message: NetworkMessage): void {
    const messageString = JSON.stringify(message);

    playerIds.forEach((playerId) => {
      const connection = this.getConnectionByPlayer(playerId);
      if (connection && connection.socket.readyState === 1) {
        try {
          connection.socket.send(messageString);
        } catch (error) {
          console.error(`Failed to broadcast to player ${playerId}:`, error);
        }
      }
    });
  }

  updateConnectionActivity(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isAlive = true;
      connection.lastPing = new Date();
    }
  }

  getInactiveConnections(timeoutMs: number): WebSocketConnection[] {
    const now = new Date();
    return Array.from(this.connections.values()).filter((connection) => {
      const timeSinceLastPing = now.getTime() - connection.lastPing.getTime();
      return timeSinceLastPing > timeoutMs;
    });
  }

  cleanupInactiveConnections(timeoutMs: number): string[] {
    const inactiveConnections = this.getInactiveConnections(timeoutMs);
    const removedConnectionIds: string[] = [];

    inactiveConnections.forEach((connection) => {
      this.removeConnection(connection.id);
      removedConnectionIds.push(connection.id);
    });

    return removedConnectionIds;
  }

  getConnectionStats(): {
    totalConnections: number;
    activeConnections: number;
    playerConnections: number;
  } {
    const activeConnections = this.getActiveConnections();

    return {
      totalConnections: this.connections.size,
      activeConnections: activeConnections.length,
      playerConnections: this.playerConnections.size,
    };
  }
}
