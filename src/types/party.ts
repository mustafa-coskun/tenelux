/**
 * Party Mode Type Definitions
 * Comprehensive type system for tournament-style multiplayer gameplay
 */

// Core Party Lobby Types
export interface PartyLobby {
  id: string;
  code: string; // 6-character join code
  hostPlayerId: string;
  participants: TournamentPlayer[];
  settings: PartySettings;
  status: LobbyStatus;
  createdAt: Date;
  maxPlayers: number;
  currentPlayerCount: number;
}

export interface PartySettings {
  maxPlayers: number; // 4-16
  roundCount: number; // 5-20
  tournamentFormat: TournamentFormat;
  allowSpectators: boolean;
  chatEnabled: boolean;
  autoStartWhenFull: boolean;
}

export enum TournamentFormat {
  SINGLE_ELIMINATION = 'single_elimination',
  DOUBLE_ELIMINATION = 'double_elimination',
  ROUND_ROBIN = 'round_robin'
}

export enum LobbyStatus {
  WAITING_FOR_PLAYERS = 'waiting_for_players',
  READY_TO_START = 'ready_to_start',
  TOURNAMENT_IN_PROGRESS = 'tournament_in_progress',
  TOURNAMENT_COMPLETED = 'tournament_completed',
  LOBBY_CLOSED = 'lobby_closed'
}

// Tournament Core Types
export interface Tournament {
  id: string;
  lobbyId: string;
  format: TournamentFormat;
  players: TournamentPlayer[];
  bracket: TournamentBracket;
  currentRound: number;
  totalRounds: number;
  status: TournamentStatus;
  startTime: Date;
  endTime?: Date;
}

export enum TournamentStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface TournamentBracket {
  rounds: TournamentRound[];
  eliminatedPlayers: TournamentPlayer[];
  activeMatches: Map<string, ActiveMatch>;
  nextMatchPairings: MatchPairing[];
}

export interface TournamentRound {
  roundNumber: number;
  matches: TournamentMatch[];
  status: RoundStatus;
  startTime: Date;
  endTime?: Date;
}

export enum RoundStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed'
}

// Match and Player Types
export interface TournamentMatch {
  id: string;
  tournamentId: string;
  roundNumber: number;
  player1Id: string;
  player2Id: string;
  status: MatchStatus;
  result?: MatchResult;
  startTime?: Date;
  endTime?: Date;
}

export enum MatchStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface ActiveMatch {
  id: string;
  tournamentId: string;
  roundNumber: number;
  player1: TournamentPlayer;
  player2: TournamentPlayer;
  gameSessionId?: string;
  status: MatchStatus;
  result?: MatchResult;
  startTime: Date;
  endTime?: Date;
}

export interface MatchResult {
  matchId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  loserId: string;
  player1Score: number;
  player2Score: number;
  gameSessionId: string;
  statistics: MatchStatistics;
  completedAt: Date;
}

export interface MatchStatistics {
  totalRounds: number;
  player1Cooperations: number;
  player1Betrayals: number;
  player2Cooperations: number;
  player2Betrayals: number;
  matchDuration: number; // in seconds
}

export interface MatchPairing {
  player1Id: string;
  player2Id: string;
  roundNumber: number;
  bracketPosition?: number;
}

// Tournament Player Types
export interface TournamentPlayer {
  id: string;
  name: string;
  avatar?: string;
  isHost: boolean;
  isEliminated: boolean;
  currentRank: number;
  statistics: TournamentPlayerStats;
  status: PlayerStatus;
  joinedAt: Date;
}

export enum PlayerStatus {
  WAITING = 'waiting',
  READY = 'ready',
  IN_MATCH = 'in_match',
  ELIMINATED = 'eliminated',
  SPECTATING = 'spectating',
  DISCONNECTED = 'disconnected'
}

export interface TournamentPlayerStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  totalPoints: number;
  cooperationRate: number;
  betrayalRate: number;
  averageMatchScore: number;
  headToHeadRecord: Map<string, HeadToHeadStats>;
  tournamentPoints: number; // Ranking points based on placement
}

export interface HeadToHeadStats {
  opponentId: string;
  opponentName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  totalPointsScored: number;
  totalPointsConceded: number;
}

// Tournament Statistics Types
export interface TournamentStatistics {
  tournamentId: string;
  totalMatches: number;
  totalRounds: number;
  duration: number; // in seconds
  playerRankings: TournamentRanking[];
  mostCooperativePlayer?: TournamentPlayer;
  mostCompetitivePlayer?: TournamentPlayer;
  highestScoringMatch?: MatchResult;
  tournamentMVP?: TournamentPlayer;
  averageMatchDuration: number;
  cooperationRate: number;
  betrayalRate: number;
}

export interface TournamentRanking {
  rank: number;
  player: TournamentPlayer;
  finalScore: number;
  matchRecord: string; // "5-2" format
  cooperationPercentage: number;
  averagePointsPerMatch: number;
  tournamentPoints: number;
}

// Real-time Communication Types
export interface PartyMessage {
  type: PartyMessageType;
  lobbyId: string;
  senderId?: string;
  data: any;
  timestamp: Date;
}

export enum PartyMessageType {
  // Lobby Management
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',
  PLAYER_KICKED = 'player_kicked',
  SETTINGS_UPDATED = 'settings_updated',
  HOST_CHANGED = 'host_changed',
  
  // Tournament Flow
  TOURNAMENT_STARTED = 'tournament_started',
  TOURNAMENT_COMPLETED = 'tournament_completed',
  ROUND_STARTED = 'round_started',
  ROUND_COMPLETED = 'round_completed',
  
  // Match Management
  MATCH_READY = 'match_ready',
  MATCH_STARTED = 'match_started',
  MATCH_COMPLETED = 'match_completed',
  
  // Communication
  CHAT_MESSAGE = 'chat_message',
  SYSTEM_MESSAGE = 'system_message',
  
  // Updates
  BRACKET_UPDATE = 'bracket_update',
  PLAYER_STATUS_UPDATE = 'player_status_update',
  STATISTICS_UPDATE = 'statistics_update'
}

export interface TournamentUpdate {
  type: TournamentUpdateType;
  tournamentId: string;
  data: any;
  timestamp: Date;
}

export enum TournamentUpdateType {
  BRACKET_UPDATED = 'bracket_updated',
  MATCH_RESULT = 'match_result',
  PLAYER_ELIMINATED = 'player_eliminated',
  ROUND_ADVANCED = 'round_advanced',
  TOURNAMENT_COMPLETED = 'tournament_completed'
}

// Host Action Types
export interface HostAction {
  type: HostActionType;
  lobbyId: string;
  hostId: string;
  targetPlayerId?: string;
  data?: any;
}

export enum HostActionType {
  KICK_PLAYER = 'kick_player',
  UPDATE_SETTINGS = 'update_settings',
  START_TOURNAMENT = 'start_tournament',
  CANCEL_TOURNAMENT = 'cancel_tournament',
  TRANSFER_HOST = 'transfer_host',
  CLOSE_LOBBY = 'close_lobby'
}

// Chat System Types
export interface ChatMessage {
  id: string;
  lobbyId: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: Date;
  type: ChatMessageType;
}

export enum ChatMessageType {
  PLAYER_MESSAGE = 'player_message',
  SYSTEM_MESSAGE = 'system_message',
  HOST_MESSAGE = 'host_message',
  TOURNAMENT_UPDATE = 'tournament_update'
}

// Error Types
export enum LobbyError {
  LOBBY_NOT_FOUND = 'lobby_not_found',
  LOBBY_FULL = 'lobby_full',
  INVALID_LOBBY_CODE = 'invalid_lobby_code',
  TOURNAMENT_ALREADY_STARTED = 'tournament_already_started',
  INSUFFICIENT_PLAYERS = 'insufficient_players',
  HOST_PRIVILEGES_REQUIRED = 'host_privileges_required',
  PLAYER_ALREADY_IN_LOBBY = 'player_already_in_lobby',
  PLAYER_NOT_IN_LOBBY = 'player_not_in_lobby'
}

export enum TournamentError {
  TOURNAMENT_NOT_FOUND = 'tournament_not_found',
  INVALID_MATCH_PAIRING = 'invalid_match_pairing',
  PLAYER_NOT_IN_TOURNAMENT = 'player_not_in_tournament',
  MATCH_ALREADY_IN_PROGRESS = 'match_already_in_progress',
  TOURNAMENT_COMPLETED = 'tournament_completed',
  INVALID_TOURNAMENT_FORMAT = 'invalid_tournament_format',
  BRACKET_GENERATION_FAILED = 'bracket_generation_failed'
}

// Utility Types
export interface LobbyCreationRequest {
  hostPlayerId: string;
  hostPlayerName: string;
  settings: PartySettings;
}

export interface LobbyJoinRequest {
  playerId: string;
  playerName: string;
  lobbyCode: string;
}

export interface TournamentCreationRequest {
  lobbyId: string;
  format: TournamentFormat;
  players: TournamentPlayer[];
}

// Bracket Generator Interface
export interface BracketGenerator {
  generateBracket(players: TournamentPlayer[]): TournamentBracket;
  processMatchResult(result: MatchResult, bracket: TournamentBracket): BracketUpdate;
  getNextMatches(bracket: TournamentBracket): MatchPairing[];
  isComplete(bracket: TournamentBracket): boolean;
}

export interface BracketUpdate {
  updatedBracket: TournamentBracket;
  eliminatedPlayers: TournamentPlayer[];
  nextMatches: MatchPairing[];
  isComplete: boolean;
}

// Service Interfaces
export interface PartyLobbyService {
  createLobby(request: LobbyCreationRequest): Promise<PartyLobby>;
  joinLobby(request: LobbyJoinRequest): Promise<PartyLobby>;
  leaveLobby(playerId: string, lobbyId: string): Promise<void>;
  updateSettings(lobbyId: string, hostId: string, settings: Partial<PartySettings>): Promise<PartyLobby>;
  kickPlayer(lobbyId: string, hostId: string, targetPlayerId: string): Promise<void>;
  startTournament(lobbyId: string, hostId: string): Promise<Tournament>;
  closeLobby(lobbyId: string, hostId: string): Promise<void>;
}

export interface TournamentService {
  createTournament(request: TournamentCreationRequest): Promise<Tournament>;
  processMatchResult(tournamentId: string, result: MatchResult): Promise<TournamentUpdate>;
  getTournamentStatus(tournamentId: string): Promise<Tournament>;
  getPlayerStatistics(tournamentId: string, playerId: string): Promise<TournamentPlayerStats>;
  getTournamentStatistics(tournamentId: string): Promise<TournamentStatistics>;
}

// All types and enums are already exported above