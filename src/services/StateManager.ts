import { GameSession, User } from './UserService';
import { PartyLobby, Tournament, LobbyStatus, TournamentStatus } from '../types/party';
import { getErrorHandler, ErrorType } from './ErrorHandler';
import { getValidationService } from './ValidationService';
import { getStorageOptimizer } from './StorageOptimizer';
import { getPerformanceMonitor } from './PerformanceMonitor';

export interface StoredSession {
  user: User;
  gameSession: GameSession;
  lobbyData?: PartyLobby;
  tournamentData?: Tournament;
  timestamp: number;
  version: string;
}

export interface StateValidationResult {
  isValid: boolean;
  errors: string[];
  canRecover: boolean;
}

class StateManager {
  private readonly STORAGE_KEYS = {
    FULL_SESSION: 'tenebris_full_session',
    LOBBY_CACHE: 'tenebris_lobby_cache',
    TOURNAMENT_CACHE: 'tenebris_tournament_cache'
  };
  
  private readonly SESSION_VERSION = '1.0.0';
  private readonly MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours
  private errorHandler = getErrorHandler();
  private validationService = getValidationService();
  private storageOptimizer = getStorageOptimizer();
  private performanceMonitor = getPerformanceMonitor();

  // Save complete game state with optimization
  saveState(user: User, session: GameSession, additionalData?: any): void {
    try {
      // Perform auto-cleanup before saving if needed
      this.storageOptimizer.autoCleanup();

      const storedSession: StoredSession = {
        user,
        gameSession: session,
        timestamp: Date.now(),
        version: this.SESSION_VERSION,
        ...additionalData
      };

      // Use optimized serialization
      const serializedData = this.storageOptimizer.serializeSession(storedSession);
      
      // Save to localStorage
      localStorage.setItem(this.STORAGE_KEYS.FULL_SESSION, serializedData);
      
      console.log('🎮 State saved with optimization:', {
        userId: user.id,
        state: session.currentState,
        size: new Blob([serializedData]).size
      });
    } catch (error) {
      this.errorHandler.createError(
        ErrorType.STORAGE_ERROR,
        'Exception occurred while saving optimized state',
        { error },
        { userId: user.id, operation: 'saveState' }
      );
    }
  }

  // Load complete game state with optimization
  async loadState(): Promise<StoredSession | null> {
    try {
      const serializedData = localStorage.getItem(this.STORAGE_KEYS.FULL_SESSION);
      if (!serializedData) return null;

      // Use optimized deserialization
      const stored = this.storageOptimizer.deserializeSession(serializedData);

      // Validate the loaded session
      const validation = await this.validationService.validateStoredSession(stored, {
        userId: stored.user?.id,
        operation: 'loadState'
      });

      if (!validation.isValid) {
        console.warn('🎮 Loaded session validation failed:', validation.errors);
        
        if (!validation.canRecover) {
          this.errorHandler.createError(
            ErrorType.SESSION_CORRUPTED,
            'Loaded session data is corrupted and cannot be recovered',
            { errors: validation.errors, session: stored },
            { userId: stored.user?.id, operation: 'loadState' }
          );
          this.clearState();
          return null;
        }

        // Try to sanitize the session
        const sanitized = this.validationService.sanitizeStoredSession(stored);
        if (sanitized) {
          console.log('🎮 Session sanitized and recovered');
          // Re-save the sanitized session
          this.errorHandler.safeLocalStorageSet(this.STORAGE_KEYS.FULL_SESSION, sanitized);
          console.log('🎮 State loaded and sanitized:', sanitized);
          return sanitized;
        } else {
          this.errorHandler.createError(
            ErrorType.SESSION_CORRUPTED,
            'Failed to sanitize corrupted session data',
            { errors: validation.errors },
            { userId: stored.user?.id, operation: 'loadState' }
          );
          this.clearState();
          return null;
        }
      }

      console.log('🎮 State loaded:', stored);
      return stored;
    } catch (error) {
      this.errorHandler.createError(
        ErrorType.STORAGE_ERROR,
        'Exception occurred while loading state',
        { error },
        { operation: 'loadState' }
      );
      this.clearState();
      return null;
    }
  }

  // Clear all session data
  clearState(): void {
    localStorage.removeItem(this.STORAGE_KEYS.FULL_SESSION);
    localStorage.removeItem(this.STORAGE_KEYS.LOBBY_CACHE);
    localStorage.removeItem(this.STORAGE_KEYS.TOURNAMENT_CACHE);
    console.log('🎮 State cleared');
  }

  // Clear only lobby-related session data (for explicit leave)
  async clearLobbyState(): Promise<void> {
    const session = await this.loadState();
    if (session) {
      // Update session to menu state but keep user data
      session.gameSession.currentState = 'menu';
      session.gameSession.lobbyId = undefined;
      session.gameSession.playerData = undefined;
      session.gameSession.lastUpdated = new Date();
      session.timestamp = Date.now();
      
      // Remove lobby-specific data
      delete session.lobbyData;
      
      // Save updated session
      localStorage.setItem(this.STORAGE_KEYS.FULL_SESSION, JSON.stringify(session));
    }
    
    // Clear lobby cache
    localStorage.removeItem(this.STORAGE_KEYS.LOBBY_CACHE);
    console.log('🎮 Lobby state cleared, user session preserved');
  }

  // Clear only tournament-related session data (for explicit leave)
  async clearTournamentState(): Promise<void> {
    const session = await this.loadState();
    if (session) {
      // Update session to menu state but keep user data
      session.gameSession.currentState = 'menu';
      session.gameSession.tournamentId = undefined;
      session.gameSession.lobbyId = undefined;
      session.gameSession.playerData = undefined;
      session.gameSession.lastUpdated = new Date();
      session.timestamp = Date.now();
      
      // Remove tournament-specific data
      delete session.tournamentData;
      delete session.lobbyData; // Tournament might have lobby data too
      
      // Save updated session
      localStorage.setItem(this.STORAGE_KEYS.FULL_SESSION, JSON.stringify(session));
    }
    
    // Clear tournament cache
    localStorage.removeItem(this.STORAGE_KEYS.TOURNAMENT_CACHE);
    console.log('🎮 Tournament state cleared, user session preserved');
  }

  // Complete logout - clear everything
  clearAllData(): void {
    // Clear all localStorage keys
    localStorage.removeItem(this.STORAGE_KEYS.FULL_SESSION);
    localStorage.removeItem(this.STORAGE_KEYS.LOBBY_CACHE);
    localStorage.removeItem(this.STORAGE_KEYS.TOURNAMENT_CACHE);
    
    // Clear legacy keys if they exist
    localStorage.removeItem('tenebris_user');
    localStorage.removeItem('tenebris_session');
    localStorage.removeItem('currentLobby');
    
    // Clear sessionStorage flags
    sessionStorage.removeItem('tenebris_intentional_leave');
    
    console.log('🎮 All session data cleared for logout');
  }

  // Validate session data
  isStateValid(session: StoredSession): StateValidationResult {
    const errors: string[] = [];
    let canRecover = true;

    // Check session age
    const age = Date.now() - session.timestamp;
    if (age > this.MAX_SESSION_AGE) {
      errors.push('Session expired');
      canRecover = false;
    }

    // Check version compatibility
    if (session.version !== this.SESSION_VERSION) {
      errors.push('Version mismatch');
      // Version mismatch might still be recoverable
    }

    // Check required fields
    if (!session.user || !session.user.id) {
      errors.push('Invalid user data');
      canRecover = false;
    }

    if (!session.gameSession || !session.gameSession.userId) {
      errors.push('Invalid game session data');
      canRecover = false;
    }

    // Check state consistency
    if (session.user.id !== session.gameSession.userId) {
      errors.push('User ID mismatch');
      canRecover = false;
    }

    // Validate specific game states
    if (session.gameSession.currentState === 'lobby') {
      if (!session.gameSession.lobbyId || !session.lobbyData) {
        errors.push('Lobby state incomplete');
        canRecover = false;
      } else {
        // Additional lobby validation
        if (!session.lobbyData.id || !session.lobbyData.code || !session.lobbyData.participants) {
          errors.push('Lobby data structure invalid');
          canRecover = false;
        } else {
          // Check if user is still in participants
          const userInLobby = session.lobbyData.participants.find((p: any) => p.id === session.user.id);
          if (!userInLobby) {
            errors.push('User no longer in lobby participants');
            // This might still be recoverable if we can rejoin
          }
        }
      }
    }

    if (session.gameSession.currentState === 'tournament') {
      if (!session.gameSession.tournamentId || !session.tournamentData) {
        errors.push('Tournament state incomplete');
        canRecover = false;
      } else {
        // Additional tournament validation
        if (!session.tournamentData.id || !session.tournamentData.players || !session.tournamentData.format) {
          errors.push('Tournament data structure invalid');
          canRecover = false;
        } else {
          // Check if user is in tournament or eliminated (both are recoverable)
          const userInTournament = session.tournamentData.players.find((p: any) => p.id === session.user.id);
          const userEliminated = session.tournamentData.bracket?.eliminatedPlayers?.find((p: any) => p.id === session.user.id);
          
          if (!userInTournament && !userEliminated) {
            errors.push('User not found in tournament');
            canRecover = false;
          }
        }
      }
    }

    if (session.gameSession.currentState === 'spectator') {
      // Spectator mode needs either tournament or lobby context
      if (!session.tournamentData && !session.lobbyData) {
        errors.push('No tournament or lobby data available for spectator mode');
        canRecover = false;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      canRecover
    };
  }

  // Attempt to recover from stored state with performance tracking
  async recoverFromState(session: StoredSession): Promise<{
    success: boolean;
    recoveredState?: any;
    error?: string;
  }> {
    const context = {
      userId: session.user?.id,
      sessionId: session.gameSession?.userId,
      operation: 'recoverFromState'
    };

    // Start performance tracking
    const trackingId = this.performanceMonitor.startSessionRecovery(
      session.user?.id || 'unknown',
      session.gameSession?.currentState || 'menu'
    );

    try {
      // Use timeout for the entire recovery operation
      const result = await this.errorHandler.withTimeout(
        this.performRecovery(session, context),
        10000 // 10 second timeout
      );

      // Complete performance tracking
      this.performanceMonitor.completeSessionRecovery(
        trackingId,
        result.success,
        result.error,
        JSON.stringify(session).length
      );

      return result;
    } catch (error) {
      const sessionError = this.errorHandler.createError(
        ErrorType.RECOVERY_TIMEOUT,
        'Session recovery operation timed out',
        { error, session },
        context
      );
      
      // Complete performance tracking with error
      this.performanceMonitor.completeSessionRecovery(
        trackingId,
        false,
        'timeout'
      );
      
      return {
        success: false,
        error: sessionError.message
      };
    }
  }

  private async performRecovery(session: StoredSession, context: any): Promise<{
    success: boolean;
    recoveredState?: any;
    error?: string;
  }> {
    // Validate session before recovery
    const validation = await this.validationService.validateStoredSession(session, context);
    
    if (!validation.canRecover) {
      this.errorHandler.createError(
        ErrorType.SESSION_CORRUPTED,
        'Session cannot be recovered due to validation errors',
        { errors: validation.errors },
        context
      );
      
      return {
        success: false,
        error: `Cannot recover: ${validation.errors.join(', ')}`
      };
    }

    // Prepare recovery data based on game state
    let recoveredState: any = {
      user: session.user,
      gameSession: session.gameSession
    };

    try {
      switch (session.gameSession.currentState) {
        case 'lobby':
          const lobbyRecovery = await this.recoverLobbyState(session);
          if (lobbyRecovery.success) {
            recoveredState = { ...recoveredState, ...lobbyRecovery.data };
          } else {
            return lobbyRecovery;
          }
          break;

        case 'tournament':
          const tournamentRecovery = await this.recoverTournamentState(session);
          if (tournamentRecovery.success) {
            recoveredState = { ...recoveredState, ...tournamentRecovery.data };
          } else {
            return tournamentRecovery;
          }
          break;

        case 'spectator':
          const spectatorRecovery = await this.recoverSpectatorState(session);
          if (spectatorRecovery.success) {
            recoveredState = { ...recoveredState, ...spectatorRecovery.data };
          } else {
            return spectatorRecovery;
          }
          break;

        default:
          recoveredState.gameState = 'menu';
      }

      console.log('🎮 State recovery successful:', recoveredState);
      return {
        success: true,
        recoveredState
      };

    } catch (error) {
      this.errorHandler.createError(
        ErrorType.UNKNOWN_ERROR,
        'Unexpected error during state recovery',
        { error },
        context
      );
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Save lobby-specific data
  saveLobbyData(lobbyData: PartyLobby): void {
    try {
      localStorage.setItem(this.STORAGE_KEYS.LOBBY_CACHE, JSON.stringify({
        data: lobbyData,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Failed to save lobby data:', error);
    }
  }

  // Load lobby-specific data
  loadLobbyData(): PartyLobby | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.LOBBY_CACHE);
      if (!stored) return null;

      const cached = JSON.parse(stored);
      
      // Check if cache is not too old (1 hour)
      const age = Date.now() - cached.timestamp;
      if (age > 60 * 60 * 1000) {
        localStorage.removeItem(this.STORAGE_KEYS.LOBBY_CACHE);
        return null;
      }

      return cached.data;
    } catch (error) {
      console.error('Failed to load lobby data:', error);
      localStorage.removeItem(this.STORAGE_KEYS.LOBBY_CACHE);
      return null;
    }
  }

  // Save tournament-specific data
  saveTournamentData(tournamentData: Tournament): void {
    try {
      localStorage.setItem(this.STORAGE_KEYS.TOURNAMENT_CACHE, JSON.stringify({
        data: tournamentData,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Failed to save tournament data:', error);
    }
  }

  // Load tournament-specific data
  loadTournamentData(): Tournament | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.TOURNAMENT_CACHE);
      if (!stored) return null;

      const cached = JSON.parse(stored);
      
      // Check if cache is not too old (2 hours)
      const age = Date.now() - cached.timestamp;
      if (age > 2 * 60 * 60 * 1000) {
        localStorage.removeItem(this.STORAGE_KEYS.TOURNAMENT_CACHE);
        return null;
      }

      return cached.data;
    } catch (error) {
      console.error('Failed to load tournament data:', error);
      localStorage.removeItem(this.STORAGE_KEYS.TOURNAMENT_CACHE);
      return null;
    }
  }

  // Handle recovery failure with appropriate fallback
  handleRecoveryFailure(error: string, session: StoredSession): {
    fallbackState: string;
    userMessage: string;
    shouldClearSession: boolean;
  } {
    console.warn('🎮 Recovery failed:', error);

    // Determine appropriate fallback based on error type
    if (error.includes('expired')) {
      return {
        fallbackState: 'menu',
        userMessage: 'Oturum süresi dolmuş. Ana menüye yönlendiriliyorsunuz.',
        shouldClearSession: true
      };
    }

    if (error.includes('no longer in lobby') || error.includes('not found in tournament')) {
      return {
        fallbackState: 'menu',
        userMessage: 'Oyun oturumunuz sonlandırılmış. Ana menüye yönlendiriliyorsunuz.',
        shouldClearSession: true
      };
    }

    if (error.includes('corrupted') || error.includes('invalid')) {
      return {
        fallbackState: 'menu',
        userMessage: 'Oturum verileri bozulmuş. Yeni bir oyun başlatılıyor.',
        shouldClearSession: true
      };
    }

    if (error.includes('network') || error.includes('connection')) {
      return {
        fallbackState: 'menu',
        userMessage: 'Bağlantı sorunu nedeniyle oturum geri yüklenemedi.',
        shouldClearSession: false
      };
    }

    // Default fallback
    return {
      fallbackState: 'menu',
      userMessage: 'Oturum geri yüklenemedi. Ana menüden yeni bir oyun başlatabilirsiniz.',
      shouldClearSession: true
    };
  }

  // Get detailed session recovery information
  async getRecoveryInfo(): Promise<{
    hasRecoverableSession: boolean;
    sessionType?: string;
    sessionAge?: number;
    canRecover?: boolean;
    issues?: string[];
  }> {
    const session = await this.loadState();
    if (!session) {
      return { hasRecoverableSession: false };
    }

    const validation = this.isStateValid(session);
    const sessionAge = Date.now() - session.timestamp;

    return {
      hasRecoverableSession: true,
      sessionType: session.gameSession.currentState,
      sessionAge: sessionAge,
      canRecover: validation.canRecover,
      issues: validation.errors
    };
  }

  // Get session statistics
  async getSessionStats(): Promise<{
    hasSession: boolean;
    sessionAge?: number;
    currentState?: string;
    version?: string;
  }> {
    const session = await this.loadState();
    if (!session) {
      return { hasSession: false };
    }

    return {
      hasSession: true,
      sessionAge: Date.now() - session.timestamp,
      currentState: session.gameSession.currentState,
      version: session.version
    };
  }

  // Recover lobby state with participant validation
  private async recoverLobbyState(session: StoredSession): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      if (!session.lobbyData || !session.gameSession.lobbyId) {
        return {
          success: false,
          error: 'Missing lobby data for recovery'
        };
      }

      const lobbyData = session.lobbyData;
      
      // Validate lobby data structure
      if (!lobbyData.id || !lobbyData.code || !lobbyData.participants) {
        return {
          success: false,
          error: 'Invalid lobby data structure'
        };
      }

      // Check if current user is still a participant
      const currentUserInLobby = lobbyData.participants.find(
        (p: any) => p.id === session.user.id
      );

      if (!currentUserInLobby) {
        return {
          success: false,
          error: 'User no longer in lobby participants'
        };
      }

      // Validate participant data integrity
      const validParticipants = lobbyData.participants.filter((p: any) => 
        p.id && p.name && typeof p.isHost === 'boolean'
      );

      if (validParticipants.length !== lobbyData.participants.length) {
        console.warn('🎮 Some participants have invalid data, cleaning up');
        lobbyData.participants = validParticipants;
        lobbyData.currentPlayerCount = validParticipants.length;
      }

      // Check lobby status validity
      const validStatuses = [LobbyStatus.WAITING_FOR_PLAYERS, LobbyStatus.READY_TO_START, LobbyStatus.TOURNAMENT_IN_PROGRESS];
      if (!validStatuses.includes(lobbyData.status)) {
        console.warn('🎮 Invalid lobby status, resetting to waiting');
        lobbyData.status = LobbyStatus.WAITING_FOR_PLAYERS;
      }

      // Validate host exists and is in participants
      const hostExists = lobbyData.participants.find((p: any) => p.id === lobbyData.hostPlayerId);
      if (!hostExists) {
        console.warn('🎮 Host not found in participants, assigning new host');
        const newHost = lobbyData.participants[0];
        if (newHost) {
          newHost.isHost = true;
          lobbyData.hostPlayerId = newHost.id;
          // Clear old host flags
          lobbyData.participants.forEach((p: any) => {
            if (p.id !== newHost.id) p.isHost = false;
          });
        }
      }

      console.log('🎮 Lobby state recovery successful:', lobbyData.code);
      return {
        success: true,
        data: {
          lobbyData: lobbyData,
          gameState: 'lobby'
        }
      };

    } catch (error) {
      console.error('Lobby state recovery failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Lobby recovery error'
      };
    }
  }

  // Recover tournament state with phase detection
  private async recoverTournamentState(session: StoredSession): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      if (!session.tournamentData || !session.gameSession.tournamentId) {
        return {
          success: false,
          error: 'Missing tournament data for recovery'
        };
      }

      const tournamentData = session.tournamentData;
      
      // Validate tournament data structure
      if (!tournamentData.id || !tournamentData.players || !tournamentData.format) {
        return {
          success: false,
          error: 'Invalid tournament data structure'
        };
      }

      // Check if current user is still a tournament participant
      const currentUserInTournament = tournamentData.players.find(
        (p: any) => p.id === session.user.id
      );

      if (!currentUserInTournament) {
        // User might have been eliminated - check if they should be in spectator mode
        if (tournamentData.bracket && tournamentData.bracket.eliminatedPlayers) {
          const eliminatedPlayer = tournamentData.bracket.eliminatedPlayers.find(
            (p: any) => p.id === session.user.id
          );
          
          if (eliminatedPlayer) {
            console.log('🎮 User was eliminated, switching to spectator mode');
            return {
              success: true,
              data: {
                tournamentData: tournamentData,
                gameState: 'spectator',
                spectatorPlayer: eliminatedPlayer
              }
            };
          }
        }

        return {
          success: false,
          error: 'User not found in tournament participants or eliminated players'
        };
      }

      // Detect current tournament phase
      const currentPhase = this.detectTournamentPhase(tournamentData);
      
      // Validate tournament status
      const validStatuses = [TournamentStatus.NOT_STARTED, TournamentStatus.IN_PROGRESS, TournamentStatus.COMPLETED];
      if (!validStatuses.includes(tournamentData.status)) {
        console.warn('🎮 Invalid tournament status, setting to in_progress');
        tournamentData.status = TournamentStatus.IN_PROGRESS;
      }

      // Ensure current round is valid
      if (tournamentData.currentRound < 0 || tournamentData.currentRound > tournamentData.totalRounds) {
        console.warn('🎮 Invalid current round, resetting to 0');
        tournamentData.currentRound = 0;
      }

      // Validate player statuses
      tournamentData.players.forEach((player: any) => {
        if (!player.status || !['waiting', 'ready', 'in_match', 'eliminated', 'spectating'].includes(player.status)) {
          player.status = 'ready';
        }
      });

      console.log('🎮 Tournament state recovery successful:', {
        tournamentId: tournamentData.id,
        phase: currentPhase,
        round: tournamentData.currentRound
      });

      return {
        success: true,
        data: {
          tournamentData: tournamentData,
          gameState: 'tournament',
          currentPhase: currentPhase
        }
      };

    } catch (error) {
      console.error('Tournament state recovery failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tournament recovery error'
      };
    }
  }

  // Recover spectator mode functionality
  private async recoverSpectatorState(session: StoredSession): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      // For spectator mode, we need either tournament data or lobby data to spectate
      let spectatorContext: any = null;
      let spectatorType: 'tournament' | 'lobby' = 'tournament';

      if (session.tournamentData) {
        spectatorContext = session.tournamentData;
        spectatorType = 'tournament';
      } else if (session.lobbyData) {
        spectatorContext = session.lobbyData;
        spectatorType = 'lobby';
      } else {
        return {
          success: false,
          error: 'No tournament or lobby data available for spectator mode'
        };
      }

      // Validate spectator context
      if (!spectatorContext.id) {
        return {
          success: false,
          error: 'Invalid spectator context data'
        };
      }

      // Find the user's spectator profile
      let spectatorPlayer: any = null;

      if (spectatorType === 'tournament') {
        // Look for user in eliminated players or regular players
        if (spectatorContext.bracket && spectatorContext.bracket.eliminatedPlayers) {
          spectatorPlayer = spectatorContext.bracket.eliminatedPlayers.find(
            (p: any) => p.id === session.user.id
          );
        }
        
        if (!spectatorPlayer) {
          spectatorPlayer = spectatorContext.players.find(
            (p: any) => p.id === session.user.id
          );
        }
      } else {
        // For lobby spectating, create a spectator profile
        spectatorPlayer = {
          id: session.user.id,
          name: session.user.displayName,
          isHost: false,
          isEliminated: false,
          status: 'spectating'
        };
      }

      if (!spectatorPlayer) {
        return {
          success: false,
          error: 'Could not create or find spectator player profile'
        };
      }

      // Ensure spectator player has correct status
      spectatorPlayer.status = 'spectating';

      // Get active matches for spectating (if tournament)
      let activeMatches: any[] = [];
      if (spectatorType === 'tournament' && spectatorContext.bracket && spectatorContext.bracket.activeMatches) {
        // Handle both Map and plain object cases (after JSON serialization/deserialization)
        if (spectatorContext.bracket.activeMatches instanceof Map) {
          activeMatches = Array.from(spectatorContext.bracket.activeMatches.values());
        } else if (typeof spectatorContext.bracket.activeMatches === 'object') {
          activeMatches = Object.values(spectatorContext.bracket.activeMatches);
        }
      }

      console.log('🎮 Spectator state recovery successful:', {
        contextId: spectatorContext.id,
        type: spectatorType,
        activeMatches: activeMatches.length
      });

      return {
        success: true,
        data: {
          gameState: 'spectator',
          spectatorType: spectatorType,
          spectatorContext: spectatorContext,
          spectatorPlayer: spectatorPlayer,
          activeMatches: activeMatches,
          tournamentData: spectatorType === 'tournament' ? spectatorContext : null,
          lobbyData: spectatorType === 'lobby' ? spectatorContext : null
        }
      };

    } catch (error) {
      console.error('Spectator state recovery failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Spectator recovery error'
      };
    }
  }

  // Detect current tournament phase based on tournament data
  private detectTournamentPhase(tournamentData: Tournament): string {
    try {
      if (!tournamentData.bracket) {
        return 'pre_tournament';
      }

      const { bracket, status, currentRound, totalRounds } = tournamentData;

      // Check if tournament is completed
      if (status === TournamentStatus.COMPLETED || currentRound >= totalRounds) {
        return 'completed';
      }

      // Check if tournament hasn't started
      if (status === TournamentStatus.NOT_STARTED || currentRound < 0) {
        return 'pre_tournament';
      }

      // Check for active matches
      if (bracket.activeMatches && bracket.activeMatches.size > 0) {
        return 'matches_in_progress';
      }

      // Check if we're between rounds
      if (bracket.rounds && bracket.rounds.length > currentRound) {
        const currentRoundData = bracket.rounds[currentRound];
        if (currentRoundData && currentRoundData.status === 'completed') {
          return 'between_rounds';
        }
      }

      // Default to round preparation
      return 'round_preparation';

    } catch (error) {
      console.error('Error detecting tournament phase:', error);
      return 'unknown';
    }
  }

  // Migrate old session data if needed
  migrateOldSessions(): boolean {
    try {
      // Check for old localStorage keys and migrate if needed
      const oldLobbyData = localStorage.getItem('currentLobby');
      if (oldLobbyData) {
        console.log('🎮 Migrating old lobby data');
        const lobbyData = JSON.parse(oldLobbyData);
        this.saveLobbyData(lobbyData);
        localStorage.removeItem('currentLobby');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to migrate old sessions:', error);
      return false;
    }
  }
}

// Singleton instance
let stateManagerInstance: StateManager | null = null;

export function getStateManager(): StateManager {
  if (!stateManagerInstance) {
    stateManagerInstance = new StateManager();
  }
  return stateManagerInstance;
}

export default StateManager;