import { WebSocketGameClient } from './WebSocketGameClient';
import { PartyWebSocketClient } from './PartyWebSocketClient';

/**
 * Game mode types
 */
export type GameMode = 'party' | 'multiplayer' | null;

/**
 * GameClientManager
 * Manages active game mode and ensures only one client is active at a time
 * Handles proper initialization and cleanup when switching between modes
 */
export class GameClientManager {
  private static instance: GameClientManager | null = null;
  
  private partyClient: PartyWebSocketClient | null = null;
  private multiplayerClient: WebSocketGameClient | null = null;
  private activeMode: GameMode = null;

  private constructor() {
    console.log('🎮 GameClientManager initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): GameClientManager {
    if (!GameClientManager.instance) {
      GameClientManager.instance = new GameClientManager();
    }
    return GameClientManager.instance;
  }

  /**
   * Get active game mode
   */
  public getActiveMode(): GameMode {
    return this.activeMode;
  }

  /**
   * Get party client (creates if doesn't exist)
   */
  public getPartyClient(): PartyWebSocketClient {
    if (!this.partyClient) {
      this.partyClient = new PartyWebSocketClient();
    }
    return this.partyClient;
  }

  /**
   * Get multiplayer client (creates if doesn't exist)
   */
  public getMultiplayerClient(): WebSocketGameClient {
    if (!this.multiplayerClient) {
      this.multiplayerClient = new WebSocketGameClient();
    }
    return this.multiplayerClient;
  }

  /**
   * Initialize party mode
   * Cleans up multiplayer mode if active
   */
  public initializePartyMode(): PartyWebSocketClient {
    console.log('🎉 GameClientManager - Initializing party mode');

    // Cleanup multiplayer mode if active
    if (this.activeMode === 'multiplayer') {
      this.cleanupMultiplayerMode();
    }

    // Set active mode
    this.activeMode = 'party';

    // Get or create party client
    const client = this.getPartyClient();

    // Connect if not already connected
    if (!client.isConnected()) {
      client.connect();
    }

    console.log('✅ GameClientManager - Party mode initialized');
    return client;
  }

  /**
   * Initialize multiplayer mode
   * Cleans up party mode if active
   */
  public initializeMultiplayerMode(): WebSocketGameClient {
    console.log('🎮 GameClientManager - Initializing multiplayer mode');

    // Cleanup party mode if active
    if (this.activeMode === 'party') {
      this.cleanupPartyMode();
    }

    // Set active mode
    this.activeMode = 'multiplayer';

    // Get or create multiplayer client
    const client = this.getMultiplayerClient();

    // Connect if not already connected
    if (!client.isConnected()) {
      client.connect();
    }

    console.log('✅ GameClientManager - Multiplayer mode initialized');
    return client;
  }

  /**
   * Cleanup party mode
   * Disconnects and removes party client
   */
  public cleanupPartyMode(): void {
    console.log('🧹 GameClientManager - Cleaning up party mode');

    if (this.partyClient) {
      // Disconnect client
      this.partyClient.disconnect();
      this.partyClient = null;
    }

    // Clear active mode if it was party
    if (this.activeMode === 'party') {
      this.activeMode = null;
    }

    console.log('✅ GameClientManager - Party mode cleaned up');
  }

  /**
   * Cleanup multiplayer mode
   * Disconnects and removes multiplayer client
   */
  public cleanupMultiplayerMode(): void {
    console.log('🧹 GameClientManager - Cleaning up multiplayer mode');

    if (this.multiplayerClient) {
      // Disconnect client
      this.multiplayerClient.disconnect();
      this.multiplayerClient = null;
    }

    // Clear active mode if it was multiplayer
    if (this.activeMode === 'multiplayer') {
      this.activeMode = null;
    }

    console.log('✅ GameClientManager - Multiplayer mode cleaned up');
  }

  /**
   * Switch between modes
   * Handles cleanup of old mode and initialization of new mode
   */
  public switchMode(newMode: 'party' | 'multiplayer'): PartyWebSocketClient | WebSocketGameClient {
    console.log(`🔄 GameClientManager - Switching mode from ${this.activeMode} to ${newMode}`);

    if (this.activeMode === newMode) {
      console.log('⚠️ GameClientManager - Already in requested mode');
      return newMode === 'party' ? this.getPartyClient() : this.getMultiplayerClient();
    }

    // Initialize new mode (this will cleanup old mode automatically)
    if (newMode === 'party') {
      return this.initializePartyMode();
    } else {
      return this.initializeMultiplayerMode();
    }
  }

  /**
   * Cleanup all modes
   * Useful for logout or app cleanup
   */
  public cleanupAll(): void {
    console.log('🧹 GameClientManager - Cleaning up all modes');
    this.cleanupPartyMode();
    this.cleanupMultiplayerMode();
    this.activeMode = null;
    console.log('✅ GameClientManager - All modes cleaned up');
  }

  /**
   * Check if a specific mode is active
   */
  public isPartyModeActive(): boolean {
    return this.activeMode === 'party';
  }

  public isMultiplayerModeActive(): boolean {
    return this.activeMode === 'multiplayer';
  }

  /**
   * Get active client (if any)
   */
  public getActiveClient(): PartyWebSocketClient | WebSocketGameClient | null {
    if (this.activeMode === 'party') {
      return this.partyClient;
    } else if (this.activeMode === 'multiplayer') {
      return this.multiplayerClient;
    }
    return null;
  }
}

/**
 * Export singleton instance getter
 */
export const getGameClientManager = (): GameClientManager => {
  return GameClientManager.getInstance();
};
