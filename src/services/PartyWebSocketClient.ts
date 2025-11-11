import { Player } from '../types';
import { BaseWebSocketClient } from './BaseWebSocketClient';

export interface PartyMessage {
  type: string;
  [key: string]: any;
}

/**
 * Dedicated WebSocket client for Party Mode
 * Extends BaseWebSocketClient for common connection management
 * Handles only party-specific events to avoid conflicts with multiplayer
 */
export class PartyWebSocketClient extends BaseWebSocketClient {
  // Party-specific event handlers only
  
  // Lobby handlers
  private onLobbyCreatedHandler: ((lobbyData: any) => void) | null = null;
  private onLobbyJoinedHandler: ((lobbyData: any) => void) | null = null;
  private onLobbyUpdatedHandler: ((lobbyData: any) => void) | null = null;
  private onLobbyErrorHandler: ((error: string) => void) | null = null;
  private onLobbyClosedHandler: ((message: string) => void) | null = null;
  private onHostTransferredHandler: ((data: any) => void) | null = null;
  private onKickedFromLobbyHandler: ((message: string) => void) | null = null;
  
  // Tournament handlers
  private onTournamentStartedHandler: ((tournament: any) => void) | null = null;
  private onTournamentMatchReadyHandler: ((data: any) => void) | null = null;
  private onTournamentRoundStartedHandler: ((data: any) => void) | null = null;
  private onTournamentMatchCompletedHandler: ((data: any) => void) | null = null;
  private onTournamentCompletedHandler: ((data: any) => void) | null = null;
  private onTournamentTiebreakerStartHandler: ((data: any) => void) | null = null;
  private onTournamentMatchReconnectedHandler: ((data: any) => void) | null = null;
  private onTournamentOpponentForfeitedHandler: ((data: any) => void) | null = null;
  private onTournamentForfeitConfirmedHandler: ((data: any) => void) | null = null;
  private onTournamentPlayerDisconnectedHandler: ((data: any) => void) | null = null;
  
  // Guest session handlers
  private onGuestSessionCreatedHandler: ((data: any) => void) | null = null;
  private onGuestSessionInvalidHandler: ((data: any) => void) | null = null;
  
  // Game handlers (for tournament matches)
  private onRoundResultHandler: ((result: any) => void) | null = null;
  private onNewRoundHandler: ((round: number, timerDuration?: number) => void) | null = null;
  private onOpponentDecisionHandler: ((decision: string, round: number) => void) | null = null;
  private onOpponentMessageHandler: ((message: string, timestamp: number) => void) | null = null;
  private onGameOverHandler: ((data: any) => void) | null = null;
  private onShowStatisticsHandler: ((data: any) => void) | null = null;

  constructor() {
    super();
  }

  /**
   * Get client name for logging
   */
  protected getClientName(): string {
    return 'PartyClient';
  }

  /**
   * Handle incoming messages - party mode specific only
   */
  protected handleMessage(message: PartyMessage): void {
    console.log('🎉 Party Client - Received message:', message.type);

    switch (message.type) {
      case 'REGISTERED':
        this.playerId = message.playerId;
        console.log('✅ Party Client - Registered, Player ID:', this.playerId);
        break;

      case 'PONG':
        console.log('🏓 Party Client - PONG received');
        break;

      case 'PARTY_LOBBY_CREATED':
      case 'LOBBY_CREATED':
        console.log('🎉 Party Client - Lobby created:', message.lobby);
        if (this.onLobbyCreatedHandler) {
          this.onLobbyCreatedHandler(message.lobby);
        }
        break;

      case 'PARTY_LOBBY_JOINED':
      case 'LOBBY_JOINED':
        console.log('🎉 Party Client - Lobby joined:', message.lobby);
        if (this.onLobbyJoinedHandler) {
          this.onLobbyJoinedHandler(message.lobby);
        }
        break;

      case 'PARTY_LOBBY_UPDATED':
      case 'LOBBY_UPDATED':
        console.log('🎉 Party Client - Lobby updated:', message.lobby);
        if (this.onLobbyUpdatedHandler) {
          this.onLobbyUpdatedHandler(message.lobby);
        }
        break;

      case 'PARTY_ERROR':
      case 'PARTY_LOBBY_ERROR':
        console.error('🎉 Party Client - Lobby error:', message.message || message.error);
        if (this.onLobbyErrorHandler) {
          this.onLobbyErrorHandler(message.message || message.error);
        }
        break;

      case 'LOBBY_CLOSED':
        console.log('🗑️ Party Client - Lobby closed:', message.message);
        if (this.onLobbyClosedHandler) {
          this.onLobbyClosedHandler(message.message);
        }
        break;

      case 'HOST_TRANSFERRED':
        console.log('👑 Party Client - Host transferred:', message);
        if (this.onHostTransferredHandler) {
          this.onHostTransferredHandler(message);
        }
        break;

      case 'KICKED_FROM_LOBBY':
        console.log('👢 Party Client - Kicked from lobby:', message.message);
        if (this.onKickedFromLobbyHandler) {
          this.onKickedFromLobbyHandler(message.message);
        }
        break;

      case 'PLAYER_KICKED':
        console.log('👢 Party Client - Player was kicked:', message);
        // Update lobby to reflect the kicked player is gone
        if (this.onLobbyUpdatedHandler && message.lobby) {
          this.onLobbyUpdatedHandler(message.lobby);
        }
        break;

      case 'PLAYER_LEFT':
      case 'PLAYER_LEFT_LOBBY':
        console.log('👋 Party Client - Player left:', message);
        if (this.onLobbyUpdatedHandler && message.lobby) {
          this.onLobbyUpdatedHandler(message.lobby);
        }
        break;

      case 'TOURNAMENT_STARTED':
        console.log('🏆 Party Client - Tournament started:', message.tournament);
        if (this.onTournamentStartedHandler) {
          this.onTournamentStartedHandler(message.tournament);
        }
        break;

      case 'TOURNAMENT_MATCH_READY':
        console.log('🎯 Party Client - Tournament match ready:', message);
        if (this.onTournamentMatchReadyHandler) {
          this.onTournamentMatchReadyHandler(message);
        }
        break;

      case 'TOURNAMENT_ROUND_STARTED':
        console.log('🎯 Party Client - Tournament round started:', message);
        if (this.onTournamentRoundStartedHandler) {
          this.onTournamentRoundStartedHandler(message);
        }
        break;

      case 'TOURNAMENT_MATCH_COMPLETED':
        console.log('✅ Party Client - Tournament match completed:', message);
        if (this.onTournamentMatchCompletedHandler) {
          this.onTournamentMatchCompletedHandler(message);
        }
        break;

      case 'TOURNAMENT_COMPLETED':
        console.log('🏆 Party Client - Tournament completed:', message);
        if (this.onTournamentCompletedHandler) {
          this.onTournamentCompletedHandler(message);
        }
        break;

      case 'TOURNAMENT_TIEBREAKER_START':
        console.log('🤝 Party Client - Tiebreaker starting:', message);
        if (this.onTournamentTiebreakerStartHandler) {
          this.onTournamentTiebreakerStartHandler(message);
        }
        break;

      case 'TOURNAMENT_MATCH_RECONNECTED':
        console.log('🔄 Party Client - Match reconnected:', message);
        if (this.onTournamentMatchReconnectedHandler) {
          this.onTournamentMatchReconnectedHandler(message);
        }
        break;

      case 'TOURNAMENT_OPPONENT_FORFEITED':
        console.log('🏳️ Party Client - Opponent forfeited:', message);
        if (this.onTournamentOpponentForfeitedHandler) {
          this.onTournamentOpponentForfeitedHandler(message);
        }
        break;

      case 'TOURNAMENT_FORFEIT_CONFIRMED':
        console.log('🏳️ Party Client - Forfeit confirmed:', message);
        if (this.onTournamentForfeitConfirmedHandler) {
          this.onTournamentForfeitConfirmedHandler(message);
        }
        break;

      case 'TOURNAMENT_PLAYER_DISCONNECTED':
        console.log('🔌 Party Client - Player disconnected:', message);
        if (this.onTournamentPlayerDisconnectedHandler) {
          this.onTournamentPlayerDisconnectedHandler(message);
        }
        break;

      case 'GUEST_SESSION_CREATED':
        console.log('👤 Party Client - Guest session created:', message);
        if (this.onGuestSessionCreatedHandler) {
          this.onGuestSessionCreatedHandler(message);
        }
        break;

      case 'GUEST_SESSION_INVALID':
        console.log('❌ Party Client - Guest session invalid:', message);
        this.reconnectAttempts = this.maxReconnectAttempts;
        if (this.onGuestSessionInvalidHandler) {
          this.onGuestSessionInvalidHandler(message);
        }
        break;

      case 'ERROR':
        console.error('❌ Party Client - Server error:', message.message);
        if (this.onErrorHandler) {
          this.onErrorHandler(message.message);
        }
        break;

      // Game messages (for tournament matches)
      case 'ROUND_RESULT':
        console.log('🎮 Party Client - Round result:', message);
        if (this.onRoundResultHandler) {
          this.onRoundResultHandler(message);
        }
        break;

      case 'NEW_ROUND':
        console.log('🎮 Party Client - New round:', message.round);
        if (this.onNewRoundHandler) {
          this.onNewRoundHandler(message.round, message.timerDuration);
        }
        break;

      case 'SHOW_STATISTICS':
        console.log('📊 Party Client - Show statistics:', message);
        // This message is sent after game ends in tournament matches
        // Statistics are already shown by the game component
        // Just log it for now
        break;

      case 'OPPONENT_DECISION':
        console.log('🎮 Party Client - Opponent decision');
        if (this.onOpponentDecisionHandler) {
          this.onOpponentDecisionHandler(message.decision, message.round);
        }
        break;

      case 'OPPONENT_MESSAGE':
        console.log('💬 Party Client - Opponent message');
        if (this.onOpponentMessageHandler) {
          this.onOpponentMessageHandler(message.message, message.timestamp);
        }
        break;

      case 'GAME_OVER':
        console.log('🏁 Party Client - Game over');
        if (this.onGameOverHandler) {
          this.onGameOverHandler(message);
        }
        break;

      case 'SHOW_STATISTICS':
        console.log('📊 Party Client - Show statistics');
        if (this.onShowStatisticsHandler) {
          this.onShowStatisticsHandler(message);
        }
        break;

      default:
        console.warn('⚠️ Party Client - Unknown message type:', message.type);
    }
  }

  /**
   * Party lobby methods
   */
  createLobby(player: Player, settings: any) {
    console.log('🎉 Party Client - Creating lobby');
    this.send({
      type: 'CREATE_PARTY_LOBBY',
      player,
      settings,
    });
  }

  joinLobby(player: Player, lobbyCode: string) {
    console.log('🎉 Party Client - Joining lobby:', lobbyCode);
    this.send({
      type: 'JOIN_PARTY_LOBBY',
      player,
      lobbyCode,
    });
  }

  leaveLobby(lobbyCode: string) {
    console.log('🎉 Party Client - Leaving lobby:', lobbyCode);
    this.send({
      type: 'LEAVE_PARTY_LOBBY',
      lobbyCode,
    });
  }

  startTournament(lobbyId: string) {
    console.log('🎉 Party Client - Starting tournament:', lobbyId);
    this.send({
      type: 'START_TOURNAMENT',
      lobbyId,
    });
  }

  kickPlayer(targetPlayerId: string) {
    console.log('🎉 Party Client - Kicking player:', targetPlayerId);
    this.send({
      type: 'KICK_PLAYER',
      targetPlayerId,
    });
  }

  createGuestSession(displayName?: string) {
    console.log('🎉 Party Client - Creating guest session');
    this.send({
      type: 'CREATE_GUEST_SESSION',
      displayName,
    });
  }

  explicitLeaveLobby(lobbyId: string) {
    console.log('🎉 Party Client - Explicit leave lobby:', lobbyId);
    sessionStorage.setItem('tenebris_intentional_leave', 'true');
    this.send({
      type: 'EXPLICIT_LEAVE_LOBBY',
      lobbyId,
      playerId: this.playerId,
      timestamp: Date.now(),
    });
  }

  explicitLeaveTournament(tournamentId: string) {
    console.log('🎉 Party Client - Explicit leave tournament:', tournamentId);
    sessionStorage.setItem('tenebris_intentional_leave', 'true');
    this.send({
      type: 'EXPLICIT_LEAVE_TOURNAMENT',
      tournamentId,
      playerId: this.playerId,
      timestamp: Date.now(),
    });
  }

  /**
   * Party-specific event handler setters
   */
  onLobbyCreated(handler: (lobbyData: any) => void) {
    this.onLobbyCreatedHandler = handler;
  }

  onLobbyJoined(handler: (lobbyData: any) => void) {
    this.onLobbyJoinedHandler = handler;
  }

  onLobbyUpdated(handler: (lobbyData: any) => void) {
    this.onLobbyUpdatedHandler = handler;
  }

  onLobbyError(handler: (error: string) => void) {
    this.onLobbyErrorHandler = handler;
  }

  onTournamentStarted(handler: (tournament: any) => void) {
    this.onTournamentStartedHandler = handler;
  }

  setOnLobbyClosed(handler: (message: string) => void) {
    this.onLobbyClosedHandler = handler;
  }

  setOnHostTransferred(handler: (data: any) => void) {
    this.onHostTransferredHandler = handler;
  }

  setOnKickedFromLobby(handler: (message: string) => void) {
    this.onKickedFromLobbyHandler = handler;
  }

  setOnTournamentMatchReady(handler: (data: any) => void) {
    this.onTournamentMatchReadyHandler = handler;
  }

  setOnTournamentRoundStarted(handler: (data: any) => void) {
    this.onTournamentRoundStartedHandler = handler;
  }

  setOnTournamentMatchCompleted(handler: (data: any) => void) {
    this.onTournamentMatchCompletedHandler = handler;
  }

  setOnTournamentCompleted(handler: (data: any) => void) {
    this.onTournamentCompletedHandler = handler;
  }

  setOnTournamentTiebreakerStart(handler: (data: any) => void) {
    this.onTournamentTiebreakerStartHandler = handler;
  }

  setOnTournamentMatchReconnected(handler: (data: any) => void) {
    this.onTournamentMatchReconnectedHandler = handler;
  }

  setOnTournamentOpponentForfeited(handler: (data: any) => void) {
    this.onTournamentOpponentForfeitedHandler = handler;
  }

  setOnTournamentForfeitConfirmed(handler: (data: any) => void) {
    this.onTournamentForfeitConfirmedHandler = handler;
  }

  setOnTournamentPlayerDisconnected(handler: (data: any) => void) {
    this.onTournamentPlayerDisconnectedHandler = handler;
  }

  setOnGuestSessionCreated(handler: (data: any) => void) {
    this.onGuestSessionCreatedHandler = handler;
  }

  setOnGuestSessionInvalid(handler: (data: any) => void) {
    this.onGuestSessionInvalidHandler = handler;
  }

  // Game event handler setters (for tournament matches)
  onRoundResult(handler: (result: any) => void) {
    this.onRoundResultHandler = handler;
  }

  onNewRound(handler: (round: number, timerDuration?: number) => void) {
    this.onNewRoundHandler = handler;
  }

  onOpponentDecision(handler: (decision: string, round: number) => void) {
    this.onOpponentDecisionHandler = handler;
  }

  onOpponentMessage(handler: (message: string, timestamp: number) => void) {
    this.onOpponentMessageHandler = handler;
  }

  onGameOver(handler: (data: any) => void) {
    this.onGameOverHandler = handler;
  }

  onShowStatistics(handler: (data: any) => void) {
    this.onShowStatisticsHandler = handler;
  }

  // Game action methods (for tournament matches)
  sendGameDecision(matchId: string, decision: string, round: number) {
    this.send({
      type: 'GAME_DECISION',
      matchId,
      decision,
      round,
    });
  }

  sendGameMessage(matchId: string, message: string) {
    this.send({
      type: 'GAME_MESSAGE',
      matchId,
      message,
      timestamp: Date.now(),
    });
  }
}
