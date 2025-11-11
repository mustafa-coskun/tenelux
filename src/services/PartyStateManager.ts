/**
 * PartyStateManager - Centralized state management for Party Mode
 * 
 * Manages state transitions between lobby, tournament, match, and spectator modes
 * with validation, error recovery, and state persistence.
 */

import {
  PartyLobby,
  Tournament,
  TournamentMatch,
  TournamentPlayer,
  ActiveMatch,
  ChatMessage,
  LobbyStatus,
  TournamentStatus,
  PlayerStatus
} from '../types/party';

/**
 * Game phase states for Party Mode
 */
export enum PartyGamePhase {
  MENU = 'menu',
  LOBBY = 'lobby',
  TOURNAMENT = 'tournament',
  MATCH = 'match',
  SPECTATOR = 'spectator'
}

/**
 * State transition record for debugging and recovery
 */
export interface StateTransition {
  from: PartyGamePhase;
  to: PartyGamePhase;
  timestamp: Date;
  trigger: 'user_action' | 'server_event' | 'error_recovery' | 'system';
  metadata?: any;
}

/**
 * Complete party game state
 */
export interface PartyGameState {
  phase: PartyGamePhase;
  lobby: PartyLobby | null;
  tournament: Tournament | null;
  currentMatch: ActiveMatch | null;
  spectatorMode: SpectatorState | null;
  stateHistory: StateTransition[];
  lastValidState: PartyGamePhase;
  errorCount: number;
}

/**
 * Spectator mode state
 */
export interface SpectatorState {
  tournament: Tournament;
  spectatorPlayer: TournamentPlayer;
  watchingMatchId: string | null;
  activeMatches: ActiveMatch[];
  messages: ChatMessage[];
}

/**
 * State validation result
 */
export interface StateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * State recovery result
 */
export interface StateRecoveryResult {
  success: boolean;
  recoveredPhase: PartyGamePhase;
  message: string;
}

/**
 * Valid state transitions map
 */
const VALID_TRANSITIONS: Map<PartyGamePhase, PartyGamePhase[]> = new Map([
  [PartyGamePhase.MENU, [PartyGamePhase.LOBBY]],
  [PartyGamePhase.LOBBY, [PartyGamePhase.MENU, PartyGamePhase.TOURNAMENT]],
  [PartyGamePhase.TOURNAMENT, [PartyGamePhase.MENU, PartyGamePhase.MATCH, PartyGamePhase.SPECTATOR]],
  [PartyGamePhase.MATCH, [PartyGamePhase.TOURNAMENT, PartyGamePhase.SPECTATOR]],
  [PartyGamePhase.SPECTATOR, [PartyGamePhase.MENU, PartyGamePhase.TOURNAMENT]]
]);

/**
 * PartyStateManager - Centralized state management service
 */
export class PartyStateManager {
  private state: PartyGameState;
  private stateChangeListeners: Array<(state: PartyGameState) => void> = [];
  private maxHistorySize: number = 50;
  private maxErrorCount: number = 5;
  private storageKey: string = 'party_game_state';

  constructor() {
    this.state = this.createInitialState();
    this.loadPersistedState();
  }

  /**
   * Create initial state
   */
  private createInitialState(): PartyGameState {
    return {
      phase: PartyGamePhase.MENU,
      lobby: null,
      tournament: null,
      currentMatch: null,
      spectatorMode: null,
      stateHistory: [],
      lastValidState: PartyGamePhase.MENU,
      errorCount: 0
    };
  }

  /**
   * Get current state
   */
  public getCurrentState(): Readonly<PartyGameState> {
    return { ...this.state };
  }

  /**
   * Get current phase
   */
  public getCurrentPhase(): PartyGamePhase {
    return this.state.phase;
  }

  /**
   * Get current lobby
   */
  public getCurrentLobby(): PartyLobby | null {
    return this.state.lobby;
  }

  /**
   * Get current tournament
   */
  public getCurrentTournament(): Tournament | null {
    return this.state.tournament;
  }

  /**
   * Get current match
   */
  public getCurrentMatch(): ActiveMatch | null {
    return this.state.currentMatch;
  }

  /**
   * Get spectator state
   */
  public getSpectatorState(): SpectatorState | null {
    return this.state.spectatorMode;
  }

  /**
   * Transition to menu
   */
  public transitionToMenu(trigger: StateTransition['trigger'] = 'user_action'): boolean {
    return this.performTransition(PartyGamePhase.MENU, trigger, {
      clearLobby: true,
      clearTournament: true,
      clearMatch: true,
      clearSpectator: true
    });
  }

  /**
   * Transition to lobby
   */
  public transitionToLobby(
    lobby: PartyLobby,
    trigger: StateTransition['trigger'] = 'user_action'
  ): boolean {
    // If already in lobby phase, just update the lobby data
    if (this.state.phase === PartyGamePhase.LOBBY) {
      return this.updateLobby(lobby);
    }

    if (!this.validateStateTransition(this.state.phase, PartyGamePhase.LOBBY)) {
      console.error('Invalid transition to lobby from', this.state.phase);
      return false;
    }

    // Validate lobby data
    const validation = this.validateLobbyData(lobby);
    if (!validation.isValid) {
      console.error('Invalid lobby data:', validation.errors);
      return false;
    }

    return this.performTransition(PartyGamePhase.LOBBY, trigger, {
      lobby,
      clearTournament: true,
      clearMatch: true,
      clearSpectator: true
    });
  }

  /**
   * Transition to tournament
   */
  public transitionToTournament(
    tournament: Tournament,
    trigger: StateTransition['trigger'] = 'server_event'
  ): boolean {
    if (!this.validateStateTransition(this.state.phase, PartyGamePhase.TOURNAMENT)) {
      console.error('Invalid transition to tournament from', this.state.phase);
      return false;
    }

    // Validate tournament data
    const validation = this.validateTournamentData(tournament);
    if (!validation.isValid) {
      console.error('Invalid tournament data:', validation.errors);
      return false;
    }

    return this.performTransition(PartyGamePhase.TOURNAMENT, trigger, {
      tournament,
      clearMatch: true,
      clearSpectator: true
    });
  }

  /**
   * Transition to match
   */
  public transitionToMatch(
    match: ActiveMatch,
    trigger: StateTransition['trigger'] = 'server_event'
  ): boolean {
    if (!this.validateStateTransition(this.state.phase, PartyGamePhase.MATCH)) {
      console.error('Invalid transition to match from', this.state.phase);
      return false;
    }

    // Validate match data
    const validation = this.validateMatchData(match);
    if (!validation.isValid) {
      console.error('Invalid match data:', validation.errors);
      return false;
    }

    // Ensure we have tournament context
    if (!this.state.tournament) {
      console.error('Cannot transition to match without tournament context');
      return false;
    }

    return this.performTransition(PartyGamePhase.MATCH, trigger, {
      currentMatch: match,
      clearSpectator: true
    });
  }

  /**
   * Transition to spectator mode
   */
  public transitionToSpectator(
    spectatorState: SpectatorState,
    trigger: StateTransition['trigger'] = 'server_event'
  ): boolean {
    if (!this.validateStateTransition(this.state.phase, PartyGamePhase.SPECTATOR)) {
      console.error('Invalid transition to spectator from', this.state.phase);
      return false;
    }

    return this.performTransition(PartyGamePhase.SPECTATOR, trigger, {
      spectatorMode: spectatorState,
      clearMatch: true
    });
  }

  /**
   * Update lobby data without changing phase
   */
  public updateLobby(lobby: PartyLobby): boolean {
    if (this.state.phase !== PartyGamePhase.LOBBY && this.state.phase !== PartyGamePhase.TOURNAMENT) {
      console.warn('Cannot update lobby in phase:', this.state.phase);
      return false;
    }

    const validation = this.validateLobbyData(lobby);
    if (!validation.isValid) {
      console.error('Invalid lobby data:', validation.errors);
      return false;
    }

    this.state.lobby = lobby;
    this.persistState();
    this.notifyListeners();
    return true;
  }

  /**
   * Update tournament data without changing phase
   */
  public updateTournament(tournament: Tournament): boolean {
    if (this.state.phase !== PartyGamePhase.TOURNAMENT && this.state.phase !== PartyGamePhase.MATCH) {
      console.warn('Cannot update tournament in phase:', this.state.phase);
      return false;
    }

    const validation = this.validateTournamentData(tournament);
    if (!validation.isValid) {
      console.error('Invalid tournament data:', validation.errors);
      return false;
    }

    this.state.tournament = tournament;
    this.persistState();
    this.notifyListeners();
    return true;
  }

  /**
   * Update match data without changing phase
   */
  public updateMatch(match: ActiveMatch): boolean {
    if (this.state.phase !== PartyGamePhase.MATCH) {
      console.warn('Cannot update match in phase:', this.state.phase);
      return false;
    }

    const validation = this.validateMatchData(match);
    if (!validation.isValid) {
      console.error('Invalid match data:', validation.errors);
      return false;
    }

    this.state.currentMatch = match;
    this.persistState();
    this.notifyListeners();
    return true;
  }

  /**
   * Clear match (return to tournament view)
   */
  public clearMatch(): boolean {
    if (this.state.phase === PartyGamePhase.MATCH) {
      return this.performTransition(PartyGamePhase.TOURNAMENT, 'system', {
        clearMatch: true
      });
    }

    this.state.currentMatch = null;
    this.persistState();
    this.notifyListeners();
    return true;
  }

  /**
   * Validate state transition
   */
  public validateStateTransition(from: PartyGamePhase, to: PartyGamePhase): boolean {
    const validTransitions = VALID_TRANSITIONS.get(from);
    if (!validTransitions) {
      return false;
    }

    return validTransitions.includes(to);
  }

  /**
   * Perform state transition
   */
  private performTransition(
    newPhase: PartyGamePhase,
    trigger: StateTransition['trigger'],
    updates: {
      lobby?: PartyLobby;
      tournament?: Tournament;
      currentMatch?: ActiveMatch;
      spectatorMode?: SpectatorState;
      clearLobby?: boolean;
      clearTournament?: boolean;
      clearMatch?: boolean;
      clearSpectator?: boolean;
    }
  ): boolean {
    const oldPhase = this.state.phase;

    // Record transition
    const transition: StateTransition = {
      from: oldPhase,
      to: newPhase,
      timestamp: new Date(),
      trigger,
      metadata: updates
    };

    // Update state
    this.state.phase = newPhase;
    this.state.lastValidState = newPhase;
    this.state.errorCount = 0;

    // Apply updates
    if (updates.lobby !== undefined) {
      this.state.lobby = updates.lobby;
    }
    if (updates.tournament !== undefined) {
      this.state.tournament = updates.tournament;
    }
    if (updates.currentMatch !== undefined) {
      this.state.currentMatch = updates.currentMatch;
    }
    if (updates.spectatorMode !== undefined) {
      this.state.spectatorMode = updates.spectatorMode;
    }

    // Clear data if requested
    if (updates.clearLobby) {
      this.state.lobby = null;
    }
    if (updates.clearTournament) {
      this.state.tournament = null;
    }
    if (updates.clearMatch) {
      this.state.currentMatch = null;
    }
    if (updates.clearSpectator) {
      this.state.spectatorMode = null;
    }

    // Add to history
    this.addToHistory(transition);

    // Persist and notify
    this.persistState();
    this.notifyListeners();

    console.log(`✅ State transition: ${oldPhase} → ${newPhase} (${trigger})`);
    return true;
  }

  /**
   * Validate lobby data
   */
  private validateLobbyData(lobby: PartyLobby): StateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!lobby.id) {
      errors.push('Lobby ID is required');
    }
    if (!lobby.code) {
      errors.push('Lobby code is required');
    }
    if (!lobby.hostPlayerId) {
      errors.push('Host player ID is required');
    }
    if (!lobby.participants || lobby.participants.length === 0) {
      errors.push('Lobby must have at least one participant');
    }
    if (!lobby.settings) {
      errors.push('Lobby settings are required');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate tournament data
   */
  private validateTournamentData(tournament: Tournament): StateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!tournament.id) {
      errors.push('Tournament ID is required');
    }
    if (!tournament.lobbyId) {
      errors.push('Lobby ID is required');
    }
    if (!tournament.players || tournament.players.length < 4) {
      errors.push('Tournament must have at least 4 players');
    }
    if (!tournament.bracket) {
      errors.push('Tournament bracket is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate match data
   */
  private validateMatchData(match: ActiveMatch): StateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!match.id) {
      errors.push('Match ID is required');
    }
    if (!match.tournamentId) {
      errors.push('Tournament ID is required');
    }
    if (!match.player1 || !match.player2) {
      errors.push('Both players are required');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Recover from invalid state
   */
  public recoverFromInvalidState(): StateRecoveryResult {
    console.warn('⚠️ Attempting to recover from invalid state');

    this.state.errorCount++;

    // If too many errors, force reset to menu
    if (this.state.errorCount >= this.maxErrorCount) {
      console.error('❌ Too many errors, forcing reset to menu');
      this.resetToMenu();
      return {
        success: true,
        recoveredPhase: PartyGamePhase.MENU,
        message: 'Too many errors occurred. Returned to menu.'
      };
    }

    // Try to recover to last valid state
    const lastValid = this.state.lastValidState;

    switch (lastValid) {
      case PartyGamePhase.LOBBY:
        if (this.state.lobby) {
          this.state.phase = PartyGamePhase.LOBBY;
          this.persistState();
          this.notifyListeners();
          return {
            success: true,
            recoveredPhase: PartyGamePhase.LOBBY,
            message: 'Recovered to lobby state'
          };
        }
        break;

      case PartyGamePhase.TOURNAMENT:
        if (this.state.tournament) {
          this.state.phase = PartyGamePhase.TOURNAMENT;
          this.state.currentMatch = null;
          this.persistState();
          this.notifyListeners();
          return {
            success: true,
            recoveredPhase: PartyGamePhase.TOURNAMENT,
            message: 'Recovered to tournament state'
          };
        }
        break;

      case PartyGamePhase.SPECTATOR:
        if (this.state.spectatorMode) {
          this.state.phase = PartyGamePhase.SPECTATOR;
          this.persistState();
          this.notifyListeners();
          return {
            success: true,
            recoveredPhase: PartyGamePhase.SPECTATOR,
            message: 'Recovered to spectator state'
          };
        }
        break;
    }

    // Fallback to menu
    this.resetToMenu();
    return {
      success: true,
      recoveredPhase: PartyGamePhase.MENU,
      message: 'Could not recover previous state. Returned to menu.'
    };
  }

  /**
   * Reset to menu state
   */
  private resetToMenu(): void {
    this.state = this.createInitialState();
    this.persistState();
    this.notifyListeners();
  }

  /**
   * Add transition to history
   */
  private addToHistory(transition: StateTransition): void {
    this.state.stateHistory.push(transition);

    // Limit history size
    if (this.state.stateHistory.length > this.maxHistorySize) {
      this.state.stateHistory = this.state.stateHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get state history
   */
  public getStateHistory(): StateTransition[] {
    return [...this.state.stateHistory];
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(listener: (state: PartyGameState) => void): () => void {
    this.stateChangeListeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.stateChangeListeners.indexOf(listener);
      if (index > -1) {
        this.stateChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const currentState = this.getCurrentState();
    this.stateChangeListeners.forEach(listener => {
      try {
        listener(currentState);
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    });
  }

  /**
   * Persist state to localStorage
   */
  private persistState(): void {
    try {
      const serializedState = {
        phase: this.state.phase,
        lobby: this.state.lobby,
        tournament: this.state.tournament,
        currentMatch: this.state.currentMatch,
        spectatorMode: this.state.spectatorMode,
        lastValidState: this.state.lastValidState,
        errorCount: this.state.errorCount,
        timestamp: new Date().toISOString()
      };

      localStorage.setItem(this.storageKey, JSON.stringify(serializedState));
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  /**
   * Load persisted state from localStorage
   */
  private loadPersistedState(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);

      // Check if state is recent (within last hour)
      const timestamp = new Date(parsed.timestamp);
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      if (timestamp < hourAgo) {
        console.log('Stored state is too old, ignoring');
        this.clearPersistedState();
        return;
      }

      // Restore state
      this.state.phase = parsed.phase || PartyGamePhase.MENU;
      this.state.lobby = parsed.lobby || null;
      this.state.tournament = parsed.tournament || null;
      this.state.currentMatch = parsed.currentMatch || null;
      this.state.spectatorMode = parsed.spectatorMode || null;
      this.state.lastValidState = parsed.lastValidState || PartyGamePhase.MENU;
      this.state.errorCount = parsed.errorCount || 0;

      console.log('✅ Loaded persisted state:', this.state.phase);
    } catch (error) {
      console.error('Failed to load persisted state:', error);
      this.clearPersistedState();
    }
  }

  /**
   * Clear persisted state
   */
  public clearPersistedState(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('Failed to clear persisted state:', error);
    }
  }

  /**
   * Clear all state and reset
   */
  public clearAll(): void {
    this.state = this.createInitialState();
    this.clearPersistedState();
    this.notifyListeners();
  }

  /**
   * Get debug information
   */
  public getDebugInfo(): any {
    return {
      currentPhase: this.state.phase,
      lastValidState: this.state.lastValidState,
      errorCount: this.state.errorCount,
      hasLobby: !!this.state.lobby,
      hasTournament: !!this.state.tournament,
      hasMatch: !!this.state.currentMatch,
      hasSpectator: !!this.state.spectatorMode,
      historySize: this.state.stateHistory.length,
      recentTransitions: this.state.stateHistory.slice(-5)
    };
  }
}

// Singleton instance
let instance: PartyStateManager | null = null;

/**
 * Get PartyStateManager singleton instance
 */
export function getPartyStateManager(): PartyStateManager {
  if (!instance) {
    instance = new PartyStateManager();
  }
  return instance;
}

/**
 * Reset PartyStateManager singleton (for testing)
 */
export function resetPartyStateManager(): void {
  if (instance) {
    instance.clearAll();
  }
  instance = null;
}
