import { getEnvironmentService } from '../config/environment';

/**
 * Base WebSocket client with common connection management functionality
 * Provides heartbeat, reconnection, and error handling for derived clients
 */
export abstract class BaseWebSocketClient {
  protected ws: WebSocket | null = null;
  protected playerId: string | null = null;
  protected sessionToken: string | null = null;
  protected reconnectAttempts = 0;
  protected maxReconnectAttempts = 10;
  protected reconnectDelay = 2000;
  protected heartbeatInterval: NodeJS.Timeout | null = null;

  // Common event handlers
  protected onConnectedHandler: (() => void) | null = null;
  protected onDisconnectedHandler: (() => void) | null = null;
  protected onErrorHandler: ((error: string) => void) | null = null;

  constructor() {
    console.log(`🔌 ${this.getClientName()} created`);
  }

  /**
   * Abstract method to get client name for logging
   */
  protected abstract getClientName(): string;

  /**
   * Abstract method to handle incoming messages
   * Each derived class implements its own message handling logic
   */
  protected abstract handleMessage(message: any): void;

  /**
   * Set player ID
   */
  public setPlayerId(playerId: string): void {
    this.playerId = playerId;
    console.log(`🎮 ${this.getClientName()} - Player ID set:`, playerId);
  }

  /**
   * Get player ID
   */
  public getPlayerId(): string | null {
    return this.playerId;
  }

  /**
   * Set session token
   */
  public setSessionToken(token: string | null): void {
    this.sessionToken = token;
    console.log(`🔑 ${this.getClientName()} - Session token set:`, token ? 'YES' : 'NO');

    // If already connected, register with new token
    if (this.isConnected() && token) {
      console.log(`🔑 ${this.getClientName()} - Registering with new session token`);
      this.send({
        type: 'REGISTER',
        playerId: this.playerId,
        sessionToken: this.sessionToken,
      });
    }
  }

  /**
   * Get session token from localStorage
   */
  public getSessionTokenFromStorage(): string | null {
    try {
      const sessionData = localStorage.getItem('tenebris_server_session');
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        return parsed.sessionToken;
      }
      return null;
    } catch (error) {
      console.error(`❌ ${this.getClientName()} - Error parsing session data:`, error);
      return null;
    }
  }

  /**
   * Initialize with stored session token
   */
  public initializeWithStoredSession(): string | null {
    const token = this.getSessionTokenFromStorage();
    this.setSessionToken(token);
    return token;
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): void {
    // Initialize session token from storage if not set
    if (!this.sessionToken) {
      this.initializeWithStoredSession();
    }

    // Reset reconnection attempts when manually connecting
    this.reconnectAttempts = 0;
    this.connectInternal();
  }

  /**
   * Internal connection logic
   */
  protected connectInternal(): void {
    try {
      const envService = getEnvironmentService();
      const wsUrl = envService.getWebSocketUrl();

      console.log(`🔌 ${this.getClientName()} - Connecting to WebSocket:`, wsUrl);
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log(`✅ ${this.getClientName()} - WebSocket connected`);
        this.reconnectAttempts = 0;

        // Register with server if we have a session token
        console.log(`🔑 ${this.getClientName()} - Sending REGISTER with sessionToken:`, this.sessionToken ? 'YES' : 'NO');
        if (this.sessionToken) {
          this.send({
            type: 'REGISTER',
            playerId: this.playerId,
            sessionToken: this.sessionToken,
          });
        } else {
          console.log(`⚠️ ${this.getClientName()} - No session token, waiting for guest session...`);
        }

        // Start heartbeat
        this.startHeartbeat();

        // Call connected handler
        if (this.onConnectedHandler) {
          this.onConnectedHandler();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error(`❌ ${this.getClientName()} - Error parsing message:`, error);
        }
      };

      this.ws.onclose = () => {
        console.log(`🔌 ${this.getClientName()} - WebSocket disconnected`);
        this.stopHeartbeat();

        if (this.onDisconnectedHandler) {
          this.onDisconnectedHandler();
        }

        this.ws = null;
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error(`❌ ${this.getClientName()} - WebSocket error:`, error);
        if (this.onErrorHandler) {
          this.onErrorHandler('Connection error');
        }
      };
    } catch (error) {
      console.error(`❌ ${this.getClientName()} - Failed to create WebSocket:`, error);
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  protected attemptReconnect(): void {
    // Don't reconnect if we're already trying to connect
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `🔄 ${this.getClientName()} - Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      setTimeout(() => {
        // Only reconnect if we don't have an active connection
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
          this.connectInternal();
        }
      }, this.reconnectDelay * this.reconnectAttempts); // Exponential backoff
    } else {
      console.error(`❌ ${this.getClientName()} - Max reconnection attempts reached`);
      if (this.onErrorHandler) {
        this.onErrorHandler('Connection failed after multiple attempts');
      }
    }
  }

  /**
   * Send message to server
   */
  public send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn(`⚠️ ${this.getClientName()} - WebSocket not connected, cannot send:`, message);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  protected startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'PING' });
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  protected stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from server
   */
  public disconnect(): void {
    this.stopHeartbeat();
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log(`🔌 ${this.getClientName()} - Disconnected`);
  }

  /**
   * Intentional disconnect (prevents reconnection)
   */
  public intentionalDisconnect(): void {
    console.log(`🔌 ${this.getClientName()} - Intentional disconnect`);
    sessionStorage.setItem('tenebris_intentional_leave', 'true');

    if (this.isConnected()) {
      this.send({
        type: 'INTENTIONAL_DISCONNECT',
        playerId: this.playerId,
        timestamp: Date.now(),
      });
    }

    this.disconnect();
  }

  /**
   * Event handler setters
   */
  public onConnected(handler: () => void): void {
    this.onConnectedHandler = handler;
  }

  public onDisconnected(handler: () => void): void {
    this.onDisconnectedHandler = handler;
  }

  public onError(handler: (error: string) => void): void {
    this.onErrorHandler = handler;
  }
}
