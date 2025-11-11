import { WebSocketGameClient } from './WebSocketGameClient';
import { getUserService } from './UserService';
import { getStateManager } from './StateManager';
import { getPerformanceMonitor } from './PerformanceMonitor';

export interface StateUpdate {
  type: 'lobby_update' | 'tournament_update' | 'player_update' | 'session_update';
  data: any;
  timestamp: Date;
  userId?: string;
  source: 'client' | 'server';
}

export interface SyncSubscription {
  id: string;
  callback: (update: StateUpdate) => void;
  filter?: (update: StateUpdate) => boolean;
}

export interface ConflictResolution {
  strategy: 'server_wins' | 'client_wins' | 'merge' | 'latest_timestamp';
  resolver?: (localState: any, serverState: any) => any;
}

class SyncService {
  private subscriptions: Map<string, SyncSubscription> = new Map();
  private wsClient: WebSocketGameClient | null = null;
  private userService = getUserService();
  private stateManager = getStateManager();
  private performanceMonitor = getPerformanceMonitor();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private pendingUpdates: StateUpdate[] = [];

  constructor() {
    this.setupHeartbeat();
  }

  // Initialize sync service with WebSocket client
  initialize(wsClient: WebSocketGameClient): void {
    this.wsClient = wsClient;
    this.setupWebSocketHandlers();
    console.log('🔄 SyncService initialized with WebSocket client');
  }

  // Subscribe to state updates
  subscribeToUpdates(callback: (update: StateUpdate) => void, filter?: (update: StateUpdate) => boolean): string {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const subscription: SyncSubscription = {
      id: subscriptionId,
      callback,
      filter
    };

    this.subscriptions.set(subscriptionId, subscription);
    console.log(`🔄 New subscription created: ${subscriptionId}`);

    return subscriptionId;
  }

  // Unsubscribe from updates
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
    console.log(`🔄 Subscription removed: ${subscriptionId}`);
  }

  // Broadcast state change to all subscribers
  broadcastStateChange(change: Omit<StateUpdate, 'timestamp' | 'source'>): void {
    const update: StateUpdate = {
      ...change,
      timestamp: new Date(),
      source: 'client'
    };

    // Store update for potential retry
    this.pendingUpdates.push(update);

    // Notify local subscribers
    this.notifySubscribers(update);

    // Send to server if connected
    if (this.isConnected && this.wsClient) {
      this.sendUpdateToServer(update);
    } else {
      console.warn('🔄 Cannot broadcast to server - not connected. Update queued.');
    }
  }

  // Request full state synchronization from server
  async requestStateSync(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.wsClient) {
        reject(new Error('Not connected to server'));
        return;
      }

      const currentUser = this.userService.getCurrentUser();
      if (!currentUser) {
        reject(new Error('No current user'));
        return;
      }

      const currentSession = this.userService.getCurrentSession();
      const clientSessionData = currentSession ? {
        ...currentSession,
        lastUpdated: currentSession.lastUpdated.toISOString()
      } : null;

      // Send session recovery request using the public send method
      this.wsClient.send({
        type: 'REQUEST_SESSION_RECOVERY',
        userId: currentUser.id,
        clientSessionData: clientSessionData
      });

      // Store the promise handlers for the message handler to use
      (this.wsClient as any)._syncServiceResolve = resolve;
      (this.wsClient as any)._syncServiceReject = reject;

      // Set timeout for request
      setTimeout(() => {
        if ((this.wsClient as any)._syncServiceReject) {
          (this.wsClient as any)._syncServiceReject(new Error('Session recovery request timed out'));
          delete (this.wsClient as any)._syncServiceResolve;
          delete (this.wsClient as any)._syncServiceReject;
        }
      }, 10000); // 10 second timeout
    });
  }

  // Handle conflicts between local and server state
  handleConflict(localState: any, serverState: any, resolution: ConflictResolution = { strategy: 'server_wins' }): any {
    console.log('🔄 Handling state conflict:', { localState, serverState, resolution });

    switch (resolution.strategy) {
      case 'server_wins':
        console.log('🔄 Conflict resolution: Server state wins');
        return serverState;

      case 'client_wins':
        console.log('🔄 Conflict resolution: Client state wins');
        return localState;

      case 'latest_timestamp':
        const localTime = localState?.lastUpdated ? new Date(localState.lastUpdated).getTime() : 0;
        const serverTime = serverState?.lastSeen ? new Date(serverState.lastSeen).getTime() : 0;

        if (serverTime >= localTime) {
          console.log('🔄 Conflict resolution: Server state is newer');
          return serverState;
        } else {
          console.log('🔄 Conflict resolution: Client state is newer');
          return localState;
        }

      case 'merge':
        if (resolution.resolver) {
          console.log('🔄 Conflict resolution: Using custom resolver');
          return resolution.resolver(localState, serverState);
        } else {
          console.log('🔄 Conflict resolution: Default merge (server wins for conflicts)');
          return {
            ...localState,
            ...serverState,
            // Preserve client-side user preferences if they exist
            userPreferences: localState?.userPreferences || serverState?.userPreferences
          };
        }

      default:
        console.warn('🔄 Unknown conflict resolution strategy, defaulting to server wins');
        return serverState;
    }
  }

  // Get connection status
  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  // Get pending updates count
  getPendingUpdatesCount(): number {
    return this.pendingUpdates.length;
  }

  // Force reconnection
  forceReconnect(): void {
    if (this.wsClient) {
      console.log('🔄 Forcing reconnection...');
      this.wsClient.disconnect();
      this.wsClient.connect();
    }
  }

  // Clear all subscriptions
  clearAllSubscriptions(): void {
    this.subscriptions.clear();
    console.log('🔄 All subscriptions cleared');
  }

  // Private methods

  private setupSyncMessageHandler(): void {
    if (!this.wsClient) return;

    // Extend the WebSocket client's message handling to intercept sync messages
    const originalHandleMessage = (this.wsClient as any).handleMessage;

    (this.wsClient as any).handleMessage = (message: any) => {
      // First, handle sync-specific messages
      this.handleSyncMessage(message);

      // Then call the original handler
      if (originalHandleMessage) {
        originalHandleMessage.call(this.wsClient, message);
      }
    };
  }

  private handleSyncMessage(data: any): void {
    switch (data.type) {
      case 'SESSION_RECOVERY_RESPONSE':
        // Handle session recovery response for requestStateSync
        const resolve = (this.wsClient as any)._syncServiceResolve;
        const reject = (this.wsClient as any)._syncServiceReject;

        if (resolve && reject) {
          if (data.success) {
            this.handleSessionRecovery(data.recoveryData);
            resolve(data.recoveryData);
          } else {
            reject(new Error(data.message || 'Session recovery failed'));
          }

          // Clean up promise handlers
          delete (this.wsClient as any)._syncServiceResolve;
          delete (this.wsClient as any)._syncServiceReject;
        }
        break;

      case 'STATE_SYNC_UPDATE':
        this.handleServerUpdate({
          type: data.updateType || 'session_update',
          data: data.data,
          timestamp: new Date(data.timestamp || Date.now()),
          userId: data.userId,
          source: 'server'
        });
        break;

      case 'PARTY_LOBBY_UPDATED':
        this.handleServerUpdate({
          type: 'lobby_update',
          data: data.lobby,
          timestamp: new Date(),
          source: 'server'
        });
        break;

      case 'TOURNAMENT_UPDATE':
        this.handleServerUpdate({
          type: 'tournament_update',
          data: data.data,
          timestamp: new Date(),
          source: 'server'
        });
        break;

      case 'SESSION_UPDATE_RESPONSE':
      case 'SESSION_CLEAR_RESPONSE':
        // These are responses to our sync operations, we can log them
        console.log(`🔄 Sync operation response: ${data.type}`, data.success ? 'success' : 'failed');
        break;
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.wsClient) return;

    // Handle connection events
    this.wsClient.onConnected(() => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000; // Reset delay
      console.log('🔄 SyncService connected to server');

      // Send any pending updates
      this.sendPendingUpdates();

      // Notify subscribers about connection
      this.notifySubscribers({
        type: 'session_update',
        data: { connected: true },
        timestamp: new Date(),
        source: 'client'
      });
    });

    this.wsClient.onDisconnected(() => {
      this.isConnected = false;
      console.log('🔄 SyncService disconnected from server');

      // Notify subscribers about disconnection
      this.notifySubscribers({
        type: 'session_update',
        data: { connected: false },
        timestamp: new Date(),
        source: 'client'
      });

      // Attempt reconnection
      this.attemptReconnection();
    });

    this.wsClient.onError((error) => {
      console.error('🔄 SyncService WebSocket error:', error);
      this.isConnected = false;
    });

    // Note: Lobby updates and other state synchronization should be handled
    // by the appropriate client (PartyWebSocketClient for party mode,
    // WebSocketGameClient for multiplayer mode)
    // SyncService provides a general synchronization framework but delegates
    // actual WebSocket event handling to the specific clients

    // Set up custom message handler for sync-specific messages
    // We'll extend the existing message handling by adding our own handler
    this.setupSyncMessageHandler();
  }

  private setupHeartbeat(): void {
    // Send periodic heartbeat to maintain connection
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.wsClient) {
        this.wsClient.send({ type: 'PING' });
      }
    }, 30000); // Every 30 seconds
  }

  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('🔄 Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (this.wsClient && !this.isConnected) {
        this.wsClient.connect();
      }
    }, delay);
  }

  private sendUpdateToServer(update: StateUpdate): void {
    if (!this.wsClient || !this.isConnected) return;

    const currentUser = this.userService.getCurrentUser();
    if (!currentUser) return;

    // Use the public send method
    this.wsClient.send({
      type: 'UPDATE_SESSION_STATE',
      userId: currentUser.id,
      stateUpdate: {
        type: update.type,
        data: update.data,
        timestamp: update.timestamp.toISOString()
      }
    });
  }

  private sendPendingUpdates(): void {
    if (this.pendingUpdates.length === 0) return;

    console.log(`🔄 Sending ${this.pendingUpdates.length} pending updates`);

    const updates = [...this.pendingUpdates];
    this.pendingUpdates = [];

    updates.forEach(update => {
      this.sendUpdateToServer(update);
    });
  }

  private handleServerUpdate(update: StateUpdate): void {
    console.log('🔄 Received server update:', update.type);

    // Remove any matching pending updates (they've been processed by server)
    this.pendingUpdates = this.pendingUpdates.filter(pending =>
      !(pending.type === update.type && pending.timestamp.getTime() <= update.timestamp.getTime())
    );

    // Notify subscribers
    this.notifySubscribers(update);

    // Update local state if needed
    this.updateLocalState(update);
  }

  private handleSessionRecovery(recoveryData: any): void {
    console.log('🔄 Handling session recovery:', recoveryData);

    // Update local state with recovered data
    if (recoveryData.user) {
      this.userService.updateUser(recoveryData.user);
    }

    if (recoveryData.gameSession) {
      this.userService.updateSession(recoveryData.gameSession);
    }

    // Save recovered state
    if (recoveryData.user && recoveryData.gameSession) {
      this.stateManager.saveState(recoveryData.user, recoveryData.gameSession, {
        lobbyData: recoveryData.lobbyState,
        tournamentData: recoveryData.tournamentState
      });
    }

    // Notify subscribers about recovery
    this.notifySubscribers({
      type: 'session_update',
      data: { recovered: true, recoveryData },
      timestamp: new Date(),
      source: 'server'
    });
  }

  private updateLocalState(update: StateUpdate): void {
    const currentUser = this.userService.getCurrentUser();
    const currentSession = this.userService.getCurrentSession();

    if (!currentUser || !currentSession) return;

    // Update session based on update type
    switch (update.type) {
      case 'lobby_update':
        if (update.data && update.data.id === currentSession.lobbyId) {
          this.stateManager.saveState(currentUser, currentSession, {
            lobbyData: update.data
          });
        }
        break;

      case 'tournament_update':
        if (update.data && update.data.id === currentSession.tournamentId) {
          this.stateManager.saveState(currentUser, currentSession, {
            tournamentData: update.data
          });
        }
        break;

      case 'session_update':
        if (update.data.sessionData) {
          const updatedSession = this.userService.updateSession(update.data.sessionData);
          if (updatedSession) {
            this.stateManager.saveState(currentUser, updatedSession);
          }
        }
        break;
    }
  }

  private notifySubscribers(update: StateUpdate): void {
    this.subscriptions.forEach(subscription => {
      try {
        // Apply filter if provided
        if (subscription.filter && !subscription.filter(update)) {
          return;
        }

        // Call subscriber callback
        subscription.callback(update);
      } catch (error) {
        console.error(`🔄 Error in subscription callback ${subscription.id}:`, error);
      }
    });
  }

  // Cleanup
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.clearAllSubscriptions();
    this.pendingUpdates = [];
    this.isConnected = false;
    console.log('🔄 SyncService destroyed');
  }
}

// Singleton instance
let syncServiceInstance: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}

export default SyncService;