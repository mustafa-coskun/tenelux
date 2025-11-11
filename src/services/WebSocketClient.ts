import {
  NetworkMessage,
  NetworkMessageType,
  JoinQueuePayload,
  PlayerDecisionPayload,
  CommunicationMessagePayload,
} from '../types/network';
import { Player, Decision } from '../types';
import { getEnvironmentService } from '../config/environment';

export interface WebSocketClientConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export interface WebSocketClientCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onReconnect?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (message: NetworkMessage) => void;
  onMatchFound?: (payload: any) => void;
  onGameStateUpdate?: (payload: any) => void;
  onRoundResult?: (payload: any) => void;
  onPhaseChange?: (payload: any) => void;
  onPlayerDisconnect?: (payload: any) => void;
  onPlayerReconnect?: (payload: any) => void;
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private config: Required<WebSocketClientConfig>;
  private callbacks: WebSocketClientCallbacks;
  private reconnectAttempts = 0;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private heartbeatIntervalId: NodeJS.Timeout | null = null;
  private isConnected = false;
  private isReconnecting = false;
  private currentPlayer: Player | null = null;

  // Get WebSocket URL from environment service
  private static getWebSocketUrl(): string {
    const envService = getEnvironmentService();
    return envService.getWebSocketUrl();
  }

  // Public callback properties for easier access
  public onConnect?: () => void;
  public onDisconnect?: () => void;
  public onMessage?: (message: NetworkMessage) => void;
  public onError?: (error: Event) => void;

  constructor(
    config?: WebSocketClientConfig,
    callbacks: WebSocketClientCallbacks = {}
  ) {
    this.config = {
      url: config?.url || WebSocketClient.getWebSocketUrl(),
      reconnectInterval: config?.reconnectInterval || 5000,
      maxReconnectAttempts: config?.maxReconnectAttempts || 10,
      heartbeatInterval: config?.heartbeatInterval || 30000,
    };
    this.callbacks = callbacks;
  }

  connect(urlOrPlayer?: string | Player): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }

        // Clean up existing socket if any
        if (this.socket) {
          this.socket.close();
          this.socket = null;
        }

        // Handle different parameter types
        let url = this.config.url;
        if (typeof urlOrPlayer === 'string') {
          url = urlOrPlayer;
        } else if (urlOrPlayer) {
          this.currentPlayer = urlOrPlayer;
        }

        // Create WebSocket with Cloudflare-friendly configuration
        const envService = getEnvironmentService();

        if (envService.isTunnelEnvironment()) {
          // For Cloudflare Tunnel, add specific headers and protocols
          this.socket = new WebSocket(url, ['websocket']);
        } else {
          this.socket = new WebSocket(url);
        }

        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
            this.socket.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000); // 10 second timeout

        this.socket.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('WebSocket connected');
          this.isConnected = true;
          this.isReconnecting = false;
          this.reconnectAttempts = 0;

          this.startHeartbeat();
          this.callbacks.onConnect?.();
          this.onConnect?.();
          resolve();
        };

        this.socket.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          this.isConnected = false;
          this.stopHeartbeat();

          // Only attempt reconnection if this wasn't a manual disconnect
          if (!this.isReconnecting && event.code !== 1000) {
            this.callbacks.onDisconnect?.();
            this.onDisconnect?.();
            this.attemptReconnect();
          }
        };

        this.socket.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('WebSocket error:', error);
          this.callbacks.onError?.(new Error('WebSocket connection error'));
          this.onError?.(error);
          reject(new Error('WebSocket connection error'));
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.isReconnecting = false;

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.stopHeartbeat();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.isConnected = false;
  }

  send(message: NetworkMessage): boolean {
    return this.sendMessage(message);
  }

  sendMessage(message: NetworkMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message - WebSocket not connected');
      return false;
    }

    try {
      const messageString = JSON.stringify(message);
      if (messageString.length > 65536) {
        // 64KB limit
        console.error('Message too large to send:', messageString.length);
        return false;
      }

      this.socket.send(messageString);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      // If sending fails, the connection might be broken
      if (this.socket.readyState !== WebSocket.OPEN) {
        this.isConnected = false;
        this.attemptReconnect();
      }
      return false;
    }
  }

  // Game-specific methods
  joinMatchmakingQueue(player: Player, preferences?: any): boolean {
    const payload: JoinQueuePayload = {
      player,
      preferences,
    };

    return this.sendMessage({
      type: NetworkMessageType.JOIN_QUEUE,
      payload,
      timestamp: new Date(),
      playerId: player.id,
    });
  }

  leaveMatchmakingQueue(): boolean {
    return this.sendMessage({
      type: NetworkMessageType.LEAVE_QUEUE,
      payload: {},
      timestamp: new Date(),
      playerId: this.currentPlayer?.id,
    });
  }

  sendPlayerDecision(
    sessionId: string,
    decision: Decision,
    roundNumber: number
  ): boolean {
    const payload: PlayerDecisionPayload = {
      sessionId,
      decision,
      roundNumber,
    };

    return this.sendMessage({
      type: NetworkMessageType.PLAYER_DECISION,
      payload,
      timestamp: new Date(),
      sessionId,
      playerId: this.currentPlayer?.id,
    });
  }

  sendCommunicationMessage(sessionId: string, message: string): boolean {
    const payload: CommunicationMessagePayload = {
      sessionId,
      message,
    };

    return this.sendMessage({
      type: NetworkMessageType.COMMUNICATION_MESSAGE,
      payload,
      timestamp: new Date(),
      sessionId,
      playerId: this.currentPlayer?.id,
    });
  }

  requestDecisionReversal(sessionId: string): boolean {
    return this.sendMessage({
      type: NetworkMessageType.DECISION_REVERSAL,
      payload: { sessionId },
      timestamp: new Date(),
      sessionId,
      playerId: this.currentPlayer?.id,
    });
  }

  sendReconnect(playerId: string): boolean {
    return this.sendMessage({
      type: NetworkMessageType.RECONNECT,
      payload: {},
      timestamp: new Date(),
      playerId,
    });
  }

  private handleMessage(data: string): void {
    try {
      const message: NetworkMessage = JSON.parse(data);

      // Handle specific message types
      switch (message.type) {
        case NetworkMessageType.PONG:
          // Heartbeat response - no action needed
          break;

        case NetworkMessageType.MATCH_FOUND:
          this.callbacks.onMatchFound?.(message.payload);
          break;

        case NetworkMessageType.GAME_STATE_UPDATE:
          this.callbacks.onGameStateUpdate?.(message.payload);
          break;

        case NetworkMessageType.ROUND_RESULT:
          this.callbacks.onRoundResult?.(message.payload);
          break;

        case NetworkMessageType.PHASE_CHANGE:
          this.callbacks.onPhaseChange?.(message.payload);
          break;

        case NetworkMessageType.DISCONNECT:
          this.callbacks.onPlayerDisconnect?.(message.payload);
          break;

        case NetworkMessageType.RECONNECT:
          if (message.payload.status === 'reconnected') {
            this.callbacks.onPlayerReconnect?.(message.payload);
          }
          break;

        case NetworkMessageType.ERROR:
          console.error('Server error:', message.payload);
          this.callbacks.onError?.(new Error(message.payload.message));
          break;

        default:
          console.log('Received message:', message.type, message.payload);
          break;
      }

      // Call general message callback
      this.callbacks.onMessage?.(message);
      this.onMessage?.(message);
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  reconnect(): void {
    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    console.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect(this.currentPlayer || undefined)
        .then(() => {
          console.log('Reconnected successfully');
          this.callbacks.onReconnect?.();

          // Send reconnect message if we have a player
          if (this.currentPlayer) {
            this.sendReconnect(this.currentPlayer.id);
          }
        })
        .catch((error) => {
          console.error('Reconnection failed:', error);
          this.isReconnecting = false;
          // Wait before next attempt to avoid rapid reconnection loops
          setTimeout(() => {
            if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
              this.attemptReconnect();
            }
          }, this.config.reconnectInterval);
        });
    }, this.config.reconnectInterval);
  }

  private startHeartbeat(): void {
    this.heartbeatIntervalId = setInterval(() => {
      this.sendMessage({
        type: NetworkMessageType.HEARTBEAT,
        payload: { timestamp: new Date() },
        timestamp: new Date(),
      });
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  // Getters
  isWebSocketConnected(): boolean {
    return this.isConnected && this.socket?.readyState === WebSocket.OPEN;
  }

  getConnectionState(): string {
    if (!this.socket) return 'disconnected';

    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
    }
  }

  getCurrentPlayer(): Player | null {
    return this.currentPlayer;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}
