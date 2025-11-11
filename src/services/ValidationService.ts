import { User, GameSession } from './UserService';
import { StoredSession } from './StateManager';
import { PartyLobby, Tournament, LobbyStatus, TournamentStatus } from '../types/party';
import { getErrorHandler, ErrorType, ErrorSeverity, ValidationRule } from './ErrorHandler';

export interface ValidationContext {
  userId?: string;
  sessionId?: string;
  operation?: string;
  timestamp?: Date;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  canRecover: boolean;
  suggestedAction?: 'retry' | 'clear' | 'fallback' | 'none';
}

class ValidationService {
  private errorHandler: any;
  private readonly SESSION_VERSION = '1.0.0';
  private readonly MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_AGE = 2 * 60 * 60 * 1000; // 2 hours

  constructor(errorHandler: any) {
    this.errorHandler = errorHandler;
  }

  // Validate user data
  async validateUser(user: any, context?: ValidationContext): Promise<ValidationResult> {
    const rules: ValidationRule<any>[] = [
      {
        name: 'user_exists',
        validate: (data) => !!data,
        errorMessage: 'User data is null or undefined',
        severity: ErrorSeverity.CRITICAL
      },
      {
        name: 'user_has_id',
        validate: (data) => !!data?.id && typeof data.id === 'string',
        errorMessage: 'User must have a valid ID',
        severity: ErrorSeverity.CRITICAL
      },
      {
        name: 'user_has_name',
        validate: (data) => !!data?.name && typeof data.name === 'string' && data.name.trim().length > 0,
        errorMessage: 'User must have a valid name',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'user_created_date',
        validate: (data) => {
          if (!data?.createdAt) return false;
          const date = new Date(data.createdAt);
          return !isNaN(date.getTime()) && date <= new Date();
        },
        errorMessage: 'User must have a valid creation date',
        severity: ErrorSeverity.MEDIUM
      },
      {
        name: 'user_last_active',
        validate: (data) => {
          if (!data?.lastActive) return false;
          const date = new Date(data.lastActive);
          return !isNaN(date.getTime()) && date <= new Date();
        },
        errorMessage: 'User must have a valid last active date',
        severity: ErrorSeverity.MEDIUM
      },
      {
        name: 'user_id_format',
        validate: (data) => {
          if (!data?.id) return false;
          return /^user_\d+_[a-z0-9]+$/.test(data.id);
        },
        errorMessage: 'User ID format is invalid',
        severity: ErrorSeverity.LOW
      }
    ];

    const validation = await this.errorHandler.validateWithTimeout(user, rules);
    
    return {
      isValid: validation.isValid,
      errors: validation.errors.map((e: any) => e.message),
      warnings: [],
      canRecover: validation.isValid || validation.errors.every((e: any) => e.severity !== ErrorSeverity.CRITICAL),
      suggestedAction: validation.isValid ? 'none' : 'clear'
    };
  }

  // Validate game session data
  async validateGameSession(session: any, context?: ValidationContext): Promise<ValidationResult> {
    const rules: ValidationRule<any>[] = [
      {
        name: 'session_exists',
        validate: (data) => !!data,
        errorMessage: 'Game session data is null or undefined',
        severity: ErrorSeverity.CRITICAL
      },
      {
        name: 'session_has_user_id',
        validate: (data) => !!data?.userId && typeof data.userId === 'string',
        errorMessage: 'Game session must have a valid user ID',
        severity: ErrorSeverity.CRITICAL
      },
      {
        name: 'session_has_state',
        validate: (data) => {
          const validStates = ['menu', 'lobby', 'tournament', 'spectator'];
          return validStates.includes(data?.currentState);
        },
        errorMessage: 'Game session must have a valid current state',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'session_last_updated',
        validate: (data) => {
          if (!data?.lastUpdated) return false;
          const date = new Date(data.lastUpdated);
          return !isNaN(date.getTime()) && date <= new Date();
        },
        errorMessage: 'Game session must have a valid last updated date',
        severity: ErrorSeverity.MEDIUM
      },
      {
        name: 'session_not_too_old',
        validate: (data) => {
          if (!data?.lastUpdated) return false;
          const age = Date.now() - new Date(data.lastUpdated).getTime();
          return age <= this.MAX_SESSION_AGE;
        },
        errorMessage: 'Game session is too old (expired)',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'lobby_consistency',
        validate: (data) => {
          if (data?.currentState === 'lobby') {
            return !!data.lobbyId && typeof data.lobbyId === 'string';
          }
          return true;
        },
        errorMessage: 'Lobby session must have a valid lobby ID',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'tournament_consistency',
        validate: (data) => {
          if (data?.currentState === 'tournament') {
            return !!data.tournamentId && typeof data.tournamentId === 'string';
          }
          return true;
        },
        errorMessage: 'Tournament session must have a valid tournament ID',
        severity: ErrorSeverity.HIGH
      }
    ];

    const validation = await this.errorHandler.validateWithTimeout(session, rules);
    
    return {
      isValid: validation.isValid,
      errors: validation.errors.map((e: any) => e.message),
      warnings: [],
      canRecover: validation.isValid || validation.errors.every((e: any) => e.severity !== ErrorSeverity.CRITICAL),
      suggestedAction: validation.isValid ? 'none' : this.getSuggestedAction(validation.errors)
    };
  }

  // Validate stored session data
  async validateStoredSession(storedSession: any, context?: ValidationContext): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let canRecover = true;

    try {
      // Basic structure validation
      if (!storedSession) {
        errors.push('Stored session is null or undefined');
        return { isValid: false, errors, warnings, canRecover: false, suggestedAction: 'clear' };
      }

      // Version validation
      if (!storedSession.version) {
        warnings.push('Session version is missing');
      } else if (storedSession.version !== this.SESSION_VERSION) {
        warnings.push(`Session version mismatch: expected ${this.SESSION_VERSION}, got ${storedSession.version}`);
      }

      // Timestamp validation
      if (!storedSession.timestamp || typeof storedSession.timestamp !== 'number') {
        errors.push('Session timestamp is invalid');
        canRecover = false;
      } else {
        const age = Date.now() - storedSession.timestamp;
        if (age > this.MAX_SESSION_AGE) {
          errors.push('Session has expired');
          canRecover = false;
        } else if (age > this.MAX_SESSION_AGE * 0.8) {
          warnings.push('Session is nearing expiration');
        }
      }

      // Validate user data
      const userValidation = await this.validateUser(storedSession.user, context);
      if (!userValidation.isValid) {
        errors.push(...userValidation.errors);
        if (!userValidation.canRecover) canRecover = false;
      }
      warnings.push(...userValidation.warnings);

      // Validate game session data
      const sessionValidation = await this.validateGameSession(storedSession.gameSession, context);
      if (!sessionValidation.isValid) {
        errors.push(...sessionValidation.errors);
        if (!sessionValidation.canRecover) canRecover = false;
      }
      warnings.push(...sessionValidation.warnings);

      // Validate consistency between user and session
      if (storedSession.user?.id && storedSession.gameSession?.userId) {
        if (storedSession.user.id !== storedSession.gameSession.userId) {
          errors.push('User ID mismatch between user and session data');
          canRecover = false;
        }
      }

      // Validate specific game state data
      if (storedSession.gameSession?.currentState === 'lobby') {
        const lobbyValidation = await this.validateLobbyData(storedSession.lobbyData, context);
        if (!lobbyValidation.isValid) {
          errors.push(...lobbyValidation.errors);
          if (!lobbyValidation.canRecover) canRecover = false;
        }
        warnings.push(...lobbyValidation.warnings);
      }

      if (storedSession.gameSession?.currentState === 'tournament') {
        const tournamentValidation = await this.validateTournamentData(storedSession.tournamentData, context);
        if (!tournamentValidation.isValid) {
          errors.push(...tournamentValidation.errors);
          if (!tournamentValidation.canRecover) canRecover = false;
        }
        warnings.push(...tournamentValidation.warnings);
      }

    } catch (error) {
      errors.push(`Validation process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      canRecover = false;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canRecover,
      suggestedAction: errors.length === 0 ? 'none' : (canRecover ? 'retry' : 'clear')
    };
  }

  // Validate lobby data
  async validateLobbyData(lobbyData: any, context?: ValidationContext): Promise<ValidationResult> {
    const rules: ValidationRule<any>[] = [
      {
        name: 'lobby_exists',
        validate: (data) => !!data,
        errorMessage: 'Lobby data is required for lobby session',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'lobby_has_id',
        validate: (data) => !!data?.id && typeof data.id === 'string',
        errorMessage: 'Lobby must have a valid ID',
        severity: ErrorSeverity.CRITICAL
      },
      {
        name: 'lobby_has_code',
        validate: (data) => !!data?.code && typeof data.code === 'string',
        errorMessage: 'Lobby must have a valid code',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'lobby_has_participants',
        validate: (data) => Array.isArray(data?.participants),
        errorMessage: 'Lobby must have a participants array',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'lobby_has_host',
        validate: (data) => {
          if (!data?.participants || !Array.isArray(data.participants)) return false;
          return data.participants.some((p: any) => p.isHost === true);
        },
        errorMessage: 'Lobby must have a host player',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'lobby_valid_status',
        validate: (data) => {
          const validStatuses = Object.values(LobbyStatus);
          return validStatuses.includes(data?.status);
        },
        errorMessage: 'Lobby must have a valid status',
        severity: ErrorSeverity.MEDIUM
      },
      {
        name: 'lobby_participant_structure',
        validate: (data) => {
          if (!Array.isArray(data?.participants)) return false;
          return data.participants.every((p: any) => 
            p.id && typeof p.id === 'string' &&
            p.name && typeof p.name === 'string' &&
            typeof p.isHost === 'boolean'
          );
        },
        errorMessage: 'All lobby participants must have valid structure',
        severity: ErrorSeverity.MEDIUM
      },
      {
        name: 'lobby_user_in_participants',
        validate: (data) => {
          if (!Array.isArray(data?.participants) || !context?.userId) return true; // Skip if no context
          return data.participants.some((p: any) => p.id === context.userId);
        },
        errorMessage: 'Current user must be in lobby participants',
        severity: ErrorSeverity.HIGH
      }
    ];

    const validation = await this.errorHandler.validateWithTimeout(lobbyData, rules);
    
    return {
      isValid: validation.isValid,
      errors: validation.errors.map((e: any) => e.message),
      warnings: [],
      canRecover: validation.isValid || validation.errors.every((e: any) => e.severity !== ErrorSeverity.CRITICAL),
      suggestedAction: validation.isValid ? 'none' : 'fallback'
    };
  }

  // Validate tournament data
  async validateTournamentData(tournamentData: any, context?: ValidationContext): Promise<ValidationResult> {
    const rules: ValidationRule<any>[] = [
      {
        name: 'tournament_exists',
        validate: (data) => !!data,
        errorMessage: 'Tournament data is required for tournament session',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'tournament_has_id',
        validate: (data) => !!data?.id && typeof data.id === 'string',
        errorMessage: 'Tournament must have a valid ID',
        severity: ErrorSeverity.CRITICAL
      },
      {
        name: 'tournament_has_players',
        validate: (data) => Array.isArray(data?.players),
        errorMessage: 'Tournament must have a players array',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'tournament_has_format',
        validate: (data) => !!data?.format && typeof data.format === 'string',
        errorMessage: 'Tournament must have a valid format',
        severity: ErrorSeverity.HIGH
      },
      {
        name: 'tournament_valid_status',
        validate: (data) => {
          const validStatuses = Object.values(TournamentStatus);
          return validStatuses.includes(data?.status);
        },
        errorMessage: 'Tournament must have a valid status',
        severity: ErrorSeverity.MEDIUM
      },
      {
        name: 'tournament_valid_rounds',
        validate: (data) => {
          return typeof data?.currentRound === 'number' && 
                 typeof data?.totalRounds === 'number' &&
                 data.currentRound >= 0 && 
                 data.currentRound <= data.totalRounds;
        },
        errorMessage: 'Tournament must have valid round information',
        severity: ErrorSeverity.MEDIUM
      },
      {
        name: 'tournament_player_structure',
        validate: (data) => {
          if (!Array.isArray(data?.players)) return false;
          return data.players.every((p: any) => 
            p.id && typeof p.id === 'string' &&
            p.name && typeof p.name === 'string'
          );
        },
        errorMessage: 'All tournament players must have valid structure',
        severity: ErrorSeverity.MEDIUM
      },
      {
        name: 'tournament_user_in_players',
        validate: (data) => {
          if (!Array.isArray(data?.players) || !context?.userId) return true; // Skip if no context
          // User can be in players or eliminated players
          const inPlayers = data.players.some((p: any) => p.id === context.userId);
          const inEliminated = data.bracket?.eliminatedPlayers?.some((p: any) => p.id === context.userId);
          return inPlayers || inEliminated;
        },
        errorMessage: 'Current user must be in tournament players or eliminated players',
        severity: ErrorSeverity.HIGH
      }
    ];

    const validation = await this.errorHandler.validateWithTimeout(tournamentData, rules);
    
    return {
      isValid: validation.isValid,
      errors: validation.errors.map((e: any) => e.message),
      warnings: [],
      canRecover: validation.isValid || validation.errors.every((e: any) => e.severity !== ErrorSeverity.CRITICAL),
      suggestedAction: validation.isValid ? 'none' : 'fallback'
    };
  }

  // Validate recovery data from server
  async validateRecoveryData(recoveryData: any, context?: ValidationContext): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let canRecover = true;

    try {
      if (!recoveryData) {
        errors.push('Recovery data is null or undefined');
        return { isValid: false, errors, warnings, canRecover: false, suggestedAction: 'fallback' };
      }

      // Validate user data if present
      if (recoveryData.user) {
        const userValidation = await this.validateUser(recoveryData.user, context);
        if (!userValidation.isValid) {
          errors.push(...userValidation.errors.map(e => `User: ${e}`));
          if (!userValidation.canRecover) canRecover = false;
        }
        warnings.push(...userValidation.warnings.map(w => `User: ${w}`));
      }

      // Validate session data if present
      if (recoveryData.gameSession) {
        const sessionValidation = await this.validateGameSession(recoveryData.gameSession, context);
        if (!sessionValidation.isValid) {
          errors.push(...sessionValidation.errors.map(e => `Session: ${e}`));
          if (!sessionValidation.canRecover) canRecover = false;
        }
        warnings.push(...sessionValidation.warnings.map(w => `Session: ${w}`));
      }

      // Validate lobby state if present
      if (recoveryData.lobbyState) {
        const lobbyValidation = await this.validateLobbyData(recoveryData.lobbyState, context);
        if (!lobbyValidation.isValid) {
          errors.push(...lobbyValidation.errors.map(e => `Lobby: ${e}`));
          if (!lobbyValidation.canRecover) canRecover = false;
        }
        warnings.push(...lobbyValidation.warnings.map(w => `Lobby: ${w}`));
      }

      // Validate tournament state if present
      if (recoveryData.tournamentState) {
        const tournamentValidation = await this.validateTournamentData(recoveryData.tournamentState, context);
        if (!tournamentValidation.isValid) {
          errors.push(...tournamentValidation.errors.map(e => `Tournament: ${e}`));
          if (!tournamentValidation.canRecover) canRecover = false;
        }
        warnings.push(...tournamentValidation.warnings.map(w => `Tournament: ${w}`));
      }

      // Validate consistency
      if (recoveryData.user && recoveryData.gameSession) {
        if (recoveryData.user.id !== recoveryData.gameSession.userId) {
          errors.push('User ID mismatch in recovery data');
          canRecover = false;
        }
      }

    } catch (error) {
      errors.push(`Recovery data validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      canRecover = false;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canRecover,
      suggestedAction: errors.length === 0 ? 'none' : (canRecover ? 'retry' : 'fallback')
    };
  }

  // Sanitize and repair data where possible
  sanitizeStoredSession(storedSession: any): any {
    if (!storedSession) return null;

    try {
      const sanitized = { ...storedSession };

      // Fix version if missing
      if (!sanitized.version) {
        sanitized.version = this.SESSION_VERSION;
      }

      // Fix timestamp if missing
      if (!sanitized.timestamp) {
        sanitized.timestamp = Date.now();
      }

      // Sanitize user data
      if (sanitized.user) {
        sanitized.user = this.sanitizeUser(sanitized.user);
      }

      // Sanitize game session
      if (sanitized.gameSession) {
        sanitized.gameSession = this.sanitizeGameSession(sanitized.gameSession);
      }

      // Sanitize lobby data
      if (sanitized.lobbyData) {
        sanitized.lobbyData = this.sanitizeLobbyData(sanitized.lobbyData);
      }

      // Sanitize tournament data
      if (sanitized.tournamentData) {
        sanitized.tournamentData = this.sanitizeTournamentData(sanitized.tournamentData);
      }

      return sanitized;
    } catch (error) {
      console.error('🚨 Failed to sanitize stored session:', error);
      return null;
    }
  }

  // Private sanitization methods

  private sanitizeUser(user: any): any {
    if (!user) return null;

    const sanitized = { ...user };

    // Ensure dates are Date objects
    if (sanitized.createdAt && typeof sanitized.createdAt === 'string') {
      sanitized.createdAt = new Date(sanitized.createdAt);
    }
    if (sanitized.lastActive && typeof sanitized.lastActive === 'string') {
      sanitized.lastActive = new Date(sanitized.lastActive);
    }

    // Ensure name is trimmed
    if (sanitized.name && typeof sanitized.name === 'string') {
      sanitized.name = sanitized.name.trim();
    }

    return sanitized;
  }

  private sanitizeGameSession(session: any): any {
    if (!session) return null;

    const sanitized = { ...session };

    // Ensure lastUpdated is a Date object
    if (sanitized.lastUpdated && typeof sanitized.lastUpdated === 'string') {
      sanitized.lastUpdated = new Date(sanitized.lastUpdated);
    }

    // Validate and fix current state
    const validStates = ['menu', 'lobby', 'tournament', 'spectator'];
    if (!validStates.includes(sanitized.currentState)) {
      sanitized.currentState = 'menu';
    }

    return sanitized;
  }

  private sanitizeLobbyData(lobbyData: any): any {
    if (!lobbyData) return null;

    const sanitized = { ...lobbyData };

    // Ensure participants is an array
    if (!Array.isArray(sanitized.participants)) {
      sanitized.participants = [];
    }

    // Clean up participants
    sanitized.participants = sanitized.participants.filter((p: any) => 
      p && p.id && p.name && typeof p.isHost === 'boolean'
    );

    // Ensure there's a host
    if (!sanitized.participants.some((p: any) => p.isHost)) {
      if (sanitized.participants.length > 0) {
        sanitized.participants[0].isHost = true;
        sanitized.hostPlayerId = sanitized.participants[0].id;
      }
    }

    // Update player count
    sanitized.currentPlayerCount = sanitized.participants.length;

    return sanitized;
  }

  private sanitizeTournamentData(tournamentData: any): any {
    if (!tournamentData) return null;

    const sanitized = { ...tournamentData };

    // Ensure players is an array
    if (!Array.isArray(sanitized.players)) {
      sanitized.players = [];
    }

    // Clean up players
    sanitized.players = sanitized.players.filter((p: any) => 
      p && p.id && p.name
    );

    // Ensure valid round numbers
    if (typeof sanitized.currentRound !== 'number' || sanitized.currentRound < 0) {
      sanitized.currentRound = 0;
    }
    if (typeof sanitized.totalRounds !== 'number' || sanitized.totalRounds < 1) {
      sanitized.totalRounds = Math.max(1, sanitized.currentRound + 1);
    }

    return sanitized;
  }

  private getSuggestedAction(errors: any[]): 'retry' | 'clear' | 'fallback' | 'none' {
    const hasCritical = errors.some(e => e.severity === ErrorSeverity.CRITICAL);
    const hasHigh = errors.some(e => e.severity === ErrorSeverity.HIGH);

    if (hasCritical) return 'clear';
    if (hasHigh) return 'fallback';
    return 'retry';
  }
}

// Singleton instance
let validationServiceInstance: ValidationService | null = null;

export function getValidationService(): ValidationService {
  if (!validationServiceInstance) {
    const { getErrorHandler } = require('./ErrorHandler');
    validationServiceInstance = new ValidationService(getErrorHandler());
  }
  return validationServiceInstance;
}

export default ValidationService;