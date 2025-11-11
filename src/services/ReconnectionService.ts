import { WebSocketGameClient } from './WebSocketGameClient';
import { getSyncService } from './SyncService';
import { getUserService } from './UserService';
import { getStateManager } from './StateManager';
import { getNotificationService } from './NotificationService';

export interface ReconnectionConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterRange: number; // Add randomness to prevent thundering herd
}

export interface ReconnectionState {
  isReconnecting: boolean;
  attemptCount: number;
  nextAttemptIn: number;
  lastError?: string;
  connectionLost: Date | null;
}

export interface RecoveryResult {
  success: boolean;
  recoveredState?: any;
  error?: string;
  fallbackToMenu?: boolean;
}

class ReconnectionService {
  private wsClient: WebSocketGameClient | null = null;
  private syncService = getSyncService();
  private userService = getUserService();
  private stateManager = getStateManager();
  private notificationService = getNotificationService();
  
  private config: ReconnectionConfig = {
    maxAttempts: 10,
    initialDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
    jitterRange: 0.3 // ±30% randomness
  };

  private state: ReconnectionState = {
    isReconnecting: false,
    attemptCount: 0,
    nextAttemptIn: 0,
    connectionLost: null
  };

  private reconnectTimer: NodeJS.Timeout | null = null;
  private recoveryCallbacks: Array<(result: RecoveryResult) => void> = [];
  private connectionStateCallbacks: Array<(state: ReconnectionState) => void> = [];
  private currentNotificationId: string | null = null;
  private currentLoadingId: string | null = null;

  // Initialize with WebSocket client
  initialize(wsClient: WebSocketGameClient): void {
    this.wsClient = wsClient;
    this.setupConnectionHandlers();
    console.log('🔄 ReconnectionService initialized');
  }

  // Configure reconnection behavior
  configure(config: Partial<ReconnectionConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('🔄 ReconnectionService configured:', this.config);
  }

  // Get current reconnection state
  getState(): ReconnectionState {
    return { ...this.state };
  }

  // Subscribe to recovery results
  onRecovery(callback: (result: RecoveryResult) => void): () => void {
    this.recoveryCallbacks.push(callback);
    return () => {
      const index = this.recoveryCallbacks.indexOf(callback);
      if (index > -1) {
        this.recoveryCallbacks.splice(index, 1);
      }
    };
  }

  // Subscribe to connection state changes
  onConnectionStateChange(callback: (state: ReconnectionState) => void): () => void {
    this.connectionStateCallbacks.push(callback);
    return () => {
      const index = this.connectionStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.connectionStateCallbacks.splice(index, 1);
      }
    };
  }

  // Force immediate reconnection attempt
  forceReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.state.attemptCount = 0;
    this.attemptReconnection();
  }

  // Stop all reconnection attempts
  stopReconnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.updateState({
      isReconnecting: false,
      attemptCount: 0,
      nextAttemptIn: 0
    });

    console.log('🔄 Reconnection stopped');
  }

  // Check if we should attempt recovery
  shouldAttemptRecovery(): boolean {
    const currentUser = this.userService.getCurrentUser();
    const currentSession = this.userService.getCurrentSession();
    
    return !!(currentUser && currentSession && currentSession.currentState !== 'menu');
  }

  // Private methods

  private setupConnectionHandlers(): void {
    if (!this.wsClient) return;

    // Handle successful connection
    this.wsClient.onConnected(() => {
      console.log('🔄 Connection established, attempting session recovery');
      
      // Clear connection-related notifications
      if (this.currentNotificationId) {
        this.notificationService.remove(this.currentNotificationId);
        this.currentNotificationId = null;
      }
      
      // Show reconnected notification
      this.notificationService.showReconnected();
      
      // Reset reconnection state
      this.updateState({
        isReconnecting: false,
        attemptCount: 0,
        nextAttemptIn: 0,
        connectionLost: null
      });

      // Attempt session recovery if needed
      if (this.shouldAttemptRecovery()) {
        this.attemptSessionRecovery();
      } else {
        // No recovery needed, just notify success
        this.notifyRecoveryCallbacks({
          success: true,
          recoveredState: null
        });
      }
    });

    // Handle disconnection
    this.wsClient.onDisconnected(() => {
      console.log('🔄 Connection lost, starting reconnection process');
      
      this.updateState({
        connectionLost: new Date()
      });

      // Show connection lost notification
      this.currentNotificationId = this.notificationService.showConnectionLost();

      // Start reconnection process
      this.startReconnectionProcess();
    });

    // Handle connection errors
    this.wsClient.onError((error) => {
      console.error('🔄 Connection error:', error);
      
      this.updateState({
        lastError: error
      });

      // If we're not already reconnecting, start the process
      if (!this.state.isReconnecting) {
        this.startReconnectionProcess();
      }
    });
  }

  private startReconnectionProcess(): void {
    if (this.state.isReconnecting) {
      console.log('🔄 Reconnection already in progress');
      return;
    }

    this.updateState({
      isReconnecting: true,
      attemptCount: 0
    });

    // Start first reconnection attempt
    this.attemptReconnection();
  }

  private attemptReconnection(): void {
    if (!this.wsClient) {
      console.error('🔄 No WebSocket client available for reconnection');
      return;
    }

    if (this.state.attemptCount >= this.config.maxAttempts) {
      console.error('🔄 Max reconnection attempts reached');
      
      this.updateState({
        isReconnecting: false,
        lastError: 'Max reconnection attempts reached'
      });

      // Notify failure
      this.notifyRecoveryCallbacks({
        success: false,
        error: 'Connection failed after multiple attempts',
        fallbackToMenu: true
      });

      return;
    }

    this.state.attemptCount++;
    console.log(`🔄 Reconnection attempt ${this.state.attemptCount}/${this.config.maxAttempts}`);

    // Update notification to show reconnection attempt
    if (this.currentNotificationId) {
      this.notificationService.remove(this.currentNotificationId);
    }
    this.currentNotificationId = this.notificationService.showReconnecting(
      this.state.attemptCount, 
      this.config.maxAttempts
    );

    // Calculate delay with exponential backoff and jitter
    const baseDelay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, this.state.attemptCount - 1),
      this.config.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = baseDelay * this.config.jitterRange * (Math.random() * 2 - 1);
    const delay = Math.max(0, baseDelay + jitter);

    this.updateState({
      nextAttemptIn: delay
    });

    console.log(`🔄 Next reconnection attempt in ${Math.round(delay)}ms`);

    // Schedule reconnection attempt
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      
      try {
        // Attempt to reconnect
        this.wsClient!.connect();
        
        // Set a timeout for this connection attempt
        const connectionTimeout = setTimeout(() => {
          if (this.state.isReconnecting) {
            console.log('🔄 Connection attempt timed out');
            this.attemptReconnection(); // Try again
          }
        }, 10000); // 10 second timeout per attempt

        // Clear timeout if connection succeeds
        const originalOnConnectedHandler = (this.wsClient as any).onConnectedHandler;
        this.wsClient!.onConnected(() => {
          clearTimeout(connectionTimeout);
          if (originalOnConnectedHandler) {
            originalOnConnectedHandler();
          }
        });

      } catch (error) {
        console.error('🔄 Reconnection attempt failed:', error);
        this.updateState({
          lastError: error instanceof Error ? error.message : 'Connection failed'
        });
        
        // Schedule next attempt
        this.attemptReconnection();
      }
    }, delay);
  }

  private async attemptSessionRecovery(): Promise<void> {
    // Show loading indicator
    this.currentLoadingId = this.notificationService.showSessionRecoveryLoading();
    
    try {
      console.log('🔄 Attempting session recovery...');
      
      // Use SyncService to request state synchronization
      const recoveredState = await this.syncService.requestStateSync();
      
      console.log('🔄 Session recovery successful:', recoveredState);
      
      // Validate recovered state
      const validationResult = this.validateRecoveredState(recoveredState);
      
      if (validationResult.isValid) {
        // Apply recovered state
        await this.applyRecoveredState(recoveredState);
        
        // Hide loading and show success
        if (this.currentLoadingId) {
          this.notificationService.hideLoading(this.currentLoadingId);
          this.currentLoadingId = null;
        }
        
        this.notificationService.showSessionRecoverySuccess(
          recoveredState.gameSession?.currentState
        );
        
        this.notifyRecoveryCallbacks({
          success: true,
          recoveredState: recoveredState
        });
      } else {
        console.warn('🔄 Recovered state validation failed:', validationResult.errors);
        
        // Hide loading
        if (this.currentLoadingId) {
          this.notificationService.hideLoading(this.currentLoadingId);
          this.currentLoadingId = null;
        }
        
        // Attempt fallback recovery
        const fallbackResult = await this.attemptFallbackRecovery();
        
        this.notificationService.showSessionRecoveryFailed(
          'Oturum verileri doğrulanamadı',
          [{
            label: 'Ana Menü',
            action: () => window.location.reload(),
            style: 'primary'
          }]
        );
        
        this.notifyRecoveryCallbacks({
          success: fallbackResult.success || false,
          error: fallbackResult.error || 'Session recovery validation failed',
          recoveredState: fallbackResult.recoveredState,
          fallbackToMenu: fallbackResult.fallbackToMenu
        });
      }
      
    } catch (error) {
      console.error('🔄 Session recovery failed:', error);
      
      // Hide loading
      if (this.currentLoadingId) {
        this.notificationService.hideLoading(this.currentLoadingId);
        this.currentLoadingId = null;
      }
      
      // Attempt fallback recovery
      const fallbackResult = await this.attemptFallbackRecovery();
      
      this.notificationService.showSessionRecoveryFailed(
        error instanceof Error ? error.message : 'Bilinmeyen hata oluştu',
        [{
          label: 'Yeniden Dene',
          action: () => this.forceReconnect(),
          style: 'primary'
        }, {
          label: 'Ana Menü',
          action: () => window.location.reload(),
          style: 'secondary'
        }]
      );
      
      this.notifyRecoveryCallbacks({
        success: fallbackResult.success || false,
        error: error instanceof Error ? error.message : 'Session recovery failed',
        recoveredState: fallbackResult.recoveredState,
        fallbackToMenu: fallbackResult.fallbackToMenu
      });
    }
  }

  private validateRecoveredState(recoveredState: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!recoveredState) {
      errors.push('No recovered state data');
      return { isValid: false, errors };
    }

    // Validate user data
    if (!recoveredState.user || !recoveredState.user.id) {
      errors.push('Invalid user data in recovered state');
    }

    // Validate session data
    if (!recoveredState.gameSession || !recoveredState.gameSession.userId) {
      errors.push('Invalid game session data in recovered state');
    }

    // Check state consistency
    if (recoveredState.user && recoveredState.gameSession) {
      if (recoveredState.user.id !== recoveredState.gameSession.userId) {
        errors.push('User ID mismatch in recovered state');
      }
    }

    // Validate specific game states
    if (recoveredState.gameSession?.currentState === 'lobby') {
      if (!recoveredState.lobbyState || !recoveredState.lobbyState.id) {
        errors.push('Lobby state missing for lobby session');
      }
    }

    if (recoveredState.gameSession?.currentState === 'tournament') {
      if (!recoveredState.tournamentState || !recoveredState.tournamentState.id) {
        errors.push('Tournament state missing for tournament session');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async applyRecoveredState(recoveredState: any): Promise<void> {
    try {
      // Update user service
      if (recoveredState.user) {
        this.userService.updateUser(recoveredState.user);
      }

      // Update session
      if (recoveredState.gameSession) {
        this.userService.updateSession(recoveredState.gameSession);
      }

      // Save to state manager
      if (recoveredState.user && recoveredState.gameSession) {
        this.stateManager.saveState(recoveredState.user, recoveredState.gameSession, {
          lobbyData: recoveredState.lobbyState,
          tournamentData: recoveredState.tournamentState
        });
      }

      console.log('🔄 Recovered state applied successfully');
      
    } catch (error) {
      console.error('🔄 Failed to apply recovered state:', error);
      throw error;
    }
  }

  private async attemptFallbackRecovery(): Promise<Partial<RecoveryResult>> {
    try {
      console.log('🔄 Attempting fallback recovery from local storage...');
      
      // Try to recover from local storage
      const storedSession = await this.stateManager.loadState();
      
      if (storedSession) {
        const validation = this.stateManager.isStateValid(storedSession);
        
        if (validation.canRecover) {
          // Apply local state
          this.userService.updateUser(storedSession.user);
          this.userService.updateSession(storedSession.gameSession);
          
          console.log('🔄 Fallback recovery from local storage successful');
          
          return {
            success: true,
            recoveredState: storedSession
          };
        } else {
          console.warn('🔄 Local storage state cannot be recovered:', validation.errors);
        }
      }
      
      // If local recovery fails, clear state and fallback to menu
      console.log('🔄 No recoverable state found, falling back to menu');
      
      this.stateManager.clearState();
      this.userService.clearSession();
      
      return {
        success: false,
        error: 'No recoverable session found',
        fallbackToMenu: true
      };
      
    } catch (error) {
      console.error('🔄 Fallback recovery failed:', error);
      
      return {
        success: false,
        error: 'Fallback recovery failed',
        fallbackToMenu: true
      };
    }
  }

  private updateState(updates: Partial<ReconnectionState>): void {
    this.state = { ...this.state, ...updates };
    
    // Notify state change callbacks
    this.connectionStateCallbacks.forEach(callback => {
      try {
        callback(this.getState());
      } catch (error) {
        console.error('🔄 Error in connection state callback:', error);
      }
    });
  }

  private notifyRecoveryCallbacks(result: RecoveryResult): void {
    this.recoveryCallbacks.forEach(callback => {
      try {
        callback(result);
      } catch (error) {
        console.error('🔄 Error in recovery callback:', error);
      }
    });
  }

  // Cleanup
  destroy(): void {
    this.stopReconnection();
    this.recoveryCallbacks = [];
    this.connectionStateCallbacks = [];
    this.wsClient = null;
    console.log('🔄 ReconnectionService destroyed');
  }
}

// Singleton instance
let reconnectionServiceInstance: ReconnectionService | null = null;

export function getReconnectionService(): ReconnectionService {
  if (!reconnectionServiceInstance) {
    reconnectionServiceInstance = new ReconnectionService();
  }
  return reconnectionServiceInstance;
}

export default ReconnectionService;