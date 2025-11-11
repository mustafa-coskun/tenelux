// Network and WebSocket types for multiplayer functionality

import {
  Player,
  GameSession,
  PlayerDecision,
  CommunicationMessage,
  Decision,
} from './index';

export interface WebSocketConnection {
  id: string;
  playerId?: string;
  socket: any; // WebSocket instance
  isAlive: boolean;
  lastPing: Date;
}

export interface NetworkMessage {
  type: NetworkMessageType;
  payload: any;
  timestamp: Date;
  sessionId?: string;
  playerId?: string;
}

export enum NetworkMessageType {
  // Connection management
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  HEARTBEAT = 'heartbeat',
  PONG = 'pong',

  // Matchmaking
  JOIN_QUEUE = 'join_queue',
  LEAVE_QUEUE = 'leave_queue',
  MATCH_FOUND = 'match_found',
  MATCHMAKING_REQUEST = 'matchmaking_request',
  MATCHMAKING_CANCEL = 'matchmaking_cancel',

  // Game session
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  PHASE_CHANGE = 'phase_change',

  // Player actions
  PLAYER_DECISION = 'player_decision',
  DECISION_REVERSAL = 'decision_reversal',
  COMMUNICATION_MESSAGE = 'communication_message',

  // Game state
  GAME_STATE_UPDATE = 'game_state_update',
  ROUND_RESULT = 'round_result',
  WAITING_FOR_OPPONENT = 'waiting_for_opponent',

  // Party Mode
  PARTY_MESSAGE = 'party_message',
  HOST_ACTION = 'host_action',
  TOURNAMENT_UPDATE = 'tournament_update',
  MATCH_READY = 'match_ready',

  // Error handling
  ERROR = 'error',
  RECONNECT = 'reconnect',
}

export interface MatchmakingQueue {
  playerId: string;
  player: Player;
  joinTime: Date;
  preferences?: MatchmakingPreferences;
}

export interface MatchmakingPreferences {
  trustScoreRange?: {
    min: number;
    max: number;
  };
  maxWaitTime?: number;
}

export interface GameMatch {
  id: string;
  players: Player[];
  session?: GameSession;
  createdAt: Date;
}

export interface NetworkGameState {
  session: GameSession;
  currentPlayerTurn?: string;
  waitingForDecisions: string[];
  communicationMessages: CommunicationMessage[];
  phaseTimeRemaining: number;
}

// Message payload interfaces
export interface JoinQueuePayload {
  player: Player;
  preferences?: MatchmakingPreferences;
}

export interface MatchFoundPayload {
  matchId: string;
  opponent: Player;
  sessionConfig: any;
}

export interface PlayerDecisionPayload {
  sessionId: string;
  decision: Decision;
  roundNumber: number;
}

export interface CommunicationMessagePayload {
  sessionId: string;
  message: string;
}

export interface GameStateUpdatePayload {
  gameState: NetworkGameState;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: any;
}

// Server interfaces
export interface WebSocketServer {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  broadcast(message: NetworkMessage, excludeConnectionId?: string): void;
  sendToPlayer(playerId: string, message: NetworkMessage): boolean;
  getActiveConnections(): WebSocketConnection[];
  handleConnection(connection: WebSocketConnection): void;
  handleDisconnection(connectionId: string): void;
}

export interface MatchmakingService {
  addToQueue(player: Player, preferences?: MatchmakingPreferences): void;
  removeFromQueue(playerId: string): void;
  findMatch(playerId: string): GameMatch | null;
  getQueueStatus(): MatchmakingQueue[];
  processQueue(): void;
}

export interface NetworkGameManager {
  createNetworkSession(match: GameMatch): GameSession;
  handlePlayerDecision(
    sessionId: string,
    playerId: string,
    decision: Decision
  ): void;
  handleCommunicationMessage(
    sessionId: string,
    playerId: string,
    message: string
  ): void;
  handlePlayerDisconnection(sessionId: string, playerId: string): void;
  handlePlayerReconnection(sessionId: string, playerId: string): void;
  synchronizeGameState(sessionId: string): NetworkGameState;
}
