import { Player } from '../types';
import { BaseWebSocketClient } from './BaseWebSocketClient';

export interface GameMessage {
  type: string;
  [key: string]: any;
}

export interface MatchFoundData {
  matchId: string;
  opponent: Player;
  isPlayer1: boolean;
}

export interface QueueStatusData {
  position: number;
  queueSize: number;
}

/**
 * WebSocket client for Multiplayer Mode
 * Extends BaseWebSocketClient for common connection management
 * Handles only multiplayer-specific events to avoid conflicts with party mode
 */
export class WebSocketGameClient extends BaseWebSocketClient {
  // Multiplayer-specific event handlers only
  private onMatchFoundHandler: ((data: MatchFoundData) => void) | null = null;
  private onQueueStatusHandler: ((data: QueueStatusData) => void) | null = null;
  private onOpponentDecisionHandler: ((decision: string, round: number) => void) | null = null;
  private onOpponentMessageHandler: ((message: string, timestamp: number) => void) | null = null;
  private onOpponentDisconnectedHandler: (() => void) | null = null;
  private onRoundResultHandler: ((result: any) => void) | null = null;
  private onNewRoundHandler: ((round: number, timerDuration?: number) => void) | null = null;
  private onShowStatisticsHandler: ((data: any) => void) | null = null;
  private onGameOverHandler: ((data: any) => void) | null = null;
  private onRematchRequestedHandler: (() => void) | null = null;
  private onRematchAcceptedHandler: (() => void) | null = null;
  private onRematchDeclinedHandler: (() => void) | null = null;
  private onReversalResponseReceivedHandler: (() => void) | null = null;
  private onReversalRejectedHandler: ((message: string) => void) | null = null;
  private onReversalSelectionPhaseHandler: ((message: string) => void) | null = null;
  private onDecisionChangedHandler: ((data: any) => void) | null = null;
  private onFinalScoresUpdateHandler: ((data: any) => void) | null = null;
  private onWaitingForOtherPlayerHandler: ((data: any) => void) | null = null;

  constructor() {
    super();
  }

  /**
   * Get client name for logging
   */
  protected getClientName(): string {
    return 'MultiplayerClient';
  }

  /**
   * Handle incoming messages - multiplayer mode specific only
   */
  protected handleMessage(message: GameMessage): void {
    console.log('📨 Multiplayer Client - Received message:', message.type);

    switch (message.type) {
      case 'REGISTERED':
        this.playerId = message.playerId;
        console.log('✅ Multiplayer Client - Registered, Player ID:', this.playerId);
        break;

      case 'PONG':
        console.log('🏓 Multiplayer Client - PONG received');
        break;

      case 'MATCH_FOUND':
        if (this.onMatchFoundHandler) {
          this.onMatchFoundHandler({
            matchId: message.matchId,
            opponent: message.opponent,
            isPlayer1: message.isPlayer1,
          });
        }
        break;

      case 'QUEUE_STATUS':
        if (this.onQueueStatusHandler) {
          this.onQueueStatusHandler({
            position: message.position,
            queueSize: message.queueSize,
          });
        }
        break;

      case 'LEFT_QUEUE':
        console.log('✅ Multiplayer Client - Successfully left queue');
        break;

      case 'OPPONENT_DECISION':
        if (this.onOpponentDecisionHandler) {
          this.onOpponentDecisionHandler(message.decision, message.round);
        }
        break;

      case 'OPPONENT_MESSAGE':
        if (this.onOpponentMessageHandler) {
          this.onOpponentMessageHandler(message.message, message.timestamp);
        }
        break;

      case 'OPPONENT_DISCONNECTED':
        if (this.onOpponentDisconnectedHandler) {
          this.onOpponentDisconnectedHandler();
        }
        break;

      case 'ROUND_RESULT':
        if (this.onRoundResultHandler) {
          this.onRoundResultHandler(message);
        }
        break;

      case 'NEW_ROUND':
        if (this.onNewRoundHandler) {
          this.onNewRoundHandler(message.round, message.timerDuration);
        }
        break;

      case 'SHOW_STATISTICS':
        if (this.onShowStatisticsHandler) {
          this.onShowStatisticsHandler(message);
        }
        break;

      case 'REMATCH_REQUESTED':
        if (this.onRematchRequestedHandler) {
          this.onRematchRequestedHandler();
        }
        break;

      case 'REMATCH_ACCEPTED':
        if (this.onRematchAcceptedHandler) {
          this.onRematchAcceptedHandler();
        }
        break;

      case 'REMATCH_DECLINED':
        if (this.onRematchDeclinedHandler) {
          this.onRematchDeclinedHandler();
        }
        break;

      case 'REMATCH_NOT_AVAILABLE':
        console.log('🔄 Multiplayer Client - Rematch not available:', message.message);
        if (this.onRematchDeclinedHandler) {
          this.onRematchDeclinedHandler();
        }
        break;

      case 'REVERSAL_RESPONSE_RECEIVED':
        if (this.onReversalResponseReceivedHandler) {
          this.onReversalResponseReceivedHandler();
        }
        break;

      case 'REVERSAL_REJECTED':
        if (this.onReversalRejectedHandler) {
          this.onReversalRejectedHandler(message.message);
        }
        break;

      case 'REVERSAL_SELECTION_PHASE':
        if (this.onReversalSelectionPhaseHandler) {
          this.onReversalSelectionPhaseHandler(message.message);
        }
        break;

      case 'REVERSAL_ERROR':
        console.log('❌ Multiplayer Client - Reversal error:', message.message);
        if (this.onReversalRejectedHandler) {
          this.onReversalRejectedHandler(message.message);
        }
        break;

      case 'REVERSAL_APPROVED':
        console.log('🔁 Multiplayer Client - Reversal approved, both players accepted');
        if (this.onReversalSelectionPhaseHandler) {
          // Trigger round selection phase
          this.onReversalSelectionPhaseHandler('Both players accepted. Select a round to change.');
        }
        break;

      case 'DECISION_CHANGED':
        console.log('✅ Multiplayer Client - Decision changed successfully:', message);
        if (this.onDecisionChangedHandler) {
          this.onDecisionChangedHandler(message);
        }
        break;

      case 'DECISION_CHANGE_ERROR':
        console.log('❌ Multiplayer Client - Decision change error:', message.message);
        if (this.onErrorHandler) {
          this.onErrorHandler(message.message);
        }
        break;

      case 'FINAL_SCORES_UPDATE':
        if (this.onFinalScoresUpdateHandler) {
          this.onFinalScoresUpdateHandler(message);
        }
        break;

      case 'WAITING_FOR_OTHER_PLAYER':
        if (this.onWaitingForOtherPlayerHandler) {
          this.onWaitingForOtherPlayerHandler(message);
        }
        break;

      case 'GAME_OVER':
        console.log('🏁 Multiplayer Client - Game over received:', message);
        if (this.onGameOverHandler) {
          this.onGameOverHandler(message);
        }
        break;

      case 'ERROR':
        console.error('❌ Multiplayer Client - Server error:', message.message);
        if (this.onErrorHandler) {
          this.onErrorHandler(message.message);
        }
        break;

      // Tournament-specific messages (handled by PartyWebSocketClient, but can arrive here during reconnection)
      case 'TOURNAMENT_MATCH_RECONNECTED':
        console.log('🔄 Tournament match reconnected (handled by PartyClient)');
        break;

      case 'TOURNAMENT_OPPONENT_RECONNECTED':
        console.log('🔄 Tournament opponent reconnected (handled by PartyClient)');
        break;

      default:
        console.warn('⚠️ Multiplayer Client - Unknown message type:', message.type);
    }
  }

  /**
   * Multiplayer-specific methods
   */
  joinQueue(player: Player): void {
    this.send({
      type: 'JOIN_QUEUE',
      player: player,
    });
  }

  leaveQueue(): void {
    this.send({
      type: 'LEAVE_QUEUE',
    });
  }

  sendGameDecision(matchId: string, decision: string, round: number): void {
    console.log('📝 Multiplayer Client - Sending game decision:', {
      matchId: matchId,
      decision: decision,
      round: round,
      playerId: this.playerId,
      sessionToken: this.sessionToken ? 'YES' : 'NO'
    });

    this.send({
      type: 'GAME_DECISION',
      matchId: matchId,
      decision: decision,
      round: round,
    });
  }

  sendGameMessage(matchId: string, message: string): void {
    this.send({
      type: 'GAME_MESSAGE',
      matchId: matchId,
      message: message,
      timestamp: Date.now(),
    });
  }

  sendDecisionReversalResponse(matchId: string, accept: boolean): void {
    console.log('📤 Multiplayer Client - Sending decision reversal response:', {
      matchId: matchId,
      accept: accept,
      timestamp: new Date().toISOString()
    });

    this.send({
      type: 'DECISION_REVERSAL_RESPONSE',
      matchId: matchId,
      accept: accept,
    });
  }

  sendDecisionChangeRequest(matchId: string, roundNumber: number, newDecision: string): void {
    console.log('📤 Multiplayer Client - Sending decision change request:', {
      matchId: matchId,
      roundNumber: roundNumber,
      newDecision: newDecision
    });

    this.send({
      type: 'DECISION_CHANGE_REQUEST',
      matchId: matchId,
      roundNumber: roundNumber,
      newDecision: newDecision,
    });
  }

  sendDecisionChangesComplete(matchId: string): void {
    console.log('📤 Multiplayer Client - Sending decision changes complete:', {
      matchId: matchId
    });

    this.send({
      type: 'DECISION_CHANGES_COMPLETE',
      matchId: matchId,
    });
  }

  sendRematchRequest(matchId: string): void {
    this.send({
      type: 'REMATCH_REQUEST',
      matchId: matchId,
    });
  }

  sendRematchAccept(matchId: string): void {
    this.send({
      type: 'REMATCH_ACCEPT',
      matchId: matchId,
    });
  }

  sendRematchDecline(matchId: string): void {
    this.send({
      type: 'REMATCH_DECLINE',
      matchId: matchId,
    });
  }

  sendCommunicationMessage(message: string): void {
    console.log('💬 Multiplayer Client - Sending communication message:', message);
    this.send({
      type: 'COMMUNICATION_MESSAGE',
      message: message,
      timestamp: Date.now()
    });
  }

  /**
   * Multiplayer-specific event handler setters
   */
  onMatchFound(handler: (data: MatchFoundData) => void): void {
    this.onMatchFoundHandler = handler;
  }

  onQueueStatus(handler: (data: QueueStatusData) => void): void {
    this.onQueueStatusHandler = handler;
  }

  onOpponentDecision(handler: (decision: string, round: number) => void): void {
    this.onOpponentDecisionHandler = handler;
  }

  onOpponentMessage(handler: (message: string, timestamp: number) => void): void {
    this.onOpponentMessageHandler = handler;
  }

  onOpponentDisconnected(handler: () => void): void {
    this.onOpponentDisconnectedHandler = handler;
  }

  onRoundResult(handler: (result: any) => void): void {
    this.onRoundResultHandler = handler;
  }

  onNewRound(handler: (round: number, timerDuration?: number) => void): void {
    this.onNewRoundHandler = handler;
  }

  onShowStatistics(handler: (data: any) => void): void {
    this.onShowStatisticsHandler = handler;
  }

  onGameOver(handler: (data: any) => void): void {
    this.onGameOverHandler = handler;
  }

  onRematchRequested(handler: () => void): void {
    this.onRematchRequestedHandler = handler;
  }

  onRematchAccepted(handler: () => void): void {
    this.onRematchAcceptedHandler = handler;
  }

  onRematchDeclined(handler: () => void): void {
    this.onRematchDeclinedHandler = handler;
  }

  onReversalResponseReceived(handler: () => void): void {
    this.onReversalResponseReceivedHandler = handler;
  }

  onReversalRejected(handler: (message: string) => void): void {
    this.onReversalRejectedHandler = handler;
  }

  onReversalSelectionPhase(handler: (message: string) => void): void {
    this.onReversalSelectionPhaseHandler = handler;
  }

  onDecisionChanged(handler: (data: any) => void): void {
    this.onDecisionChangedHandler = handler;
  }

  onFinalScoresUpdate(handler: (data: any) => void): void {
    this.onFinalScoresUpdateHandler = handler;
  }

  onWaitingForOtherPlayer(handler: (data: any) => void): void {
    this.onWaitingForOtherPlayerHandler = handler;
  }
}
