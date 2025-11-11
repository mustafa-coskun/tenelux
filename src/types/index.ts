// Core game types and interfaces for Tenelux

export enum Decision {
  CONFESS = 'confess',
  STAY_SILENT = 'stay_silent',
}

export enum GamePhase {
  TRUST_PHASE = 'trust_phase',
  COMMUNICATION_PHASE = 'communication_phase',
  DECISION_REVERSAL_PHASE = 'decision_reversal_phase',
}

export enum AIStrategy {
  LOYAL = 'loyal',
  ADAPTIVE = 'adaptive',
  FEARFUL = 'fearful',
  MANIPULATIVE = 'manipulative',
  RANDOM = 'random',
  GRUDGE = 'grudge',
}

export enum GameMode {
  SINGLE_PLAYER = 'single_player',
  MULTIPLAYER = 'multiplayer',
  PARTY = 'party',
}

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  trustScore: number;
  totalGamesPlayed: number;
  createdAt: Date;
}

export interface PlayerDecision {
  playerId: string;
  decision: Decision;
  timestamp: Date;
  canReverse: boolean;
  isReversed?: boolean;
  finalDecision?: Decision;
  score?: number; // Player's score for this round
}

export interface PayoffResult {
  playerA: number;
  playerB: number;
}

export interface Round {
  roundNumber: number;
  decisions: PlayerDecision[];
  results: PayoffResult;
  timestamp: Date;
  phaseType: GamePhase;
}

export interface SessionConfig {
  maxRounds: number;
  trustPhaseRounds: number;
  communicationTimeLimit: number;
  allowDecisionReversal: boolean;
  gameMode: GameMode;
  aiStrategy?: AIStrategy;
}

export interface GameSession {
  id: string;
  players: Player[];
  rounds: Round[];
  currentPhase: GamePhase;
  startTime: Date;
  endTime?: Date;
  winner?: Player;
  sessionConfig: SessionConfig;
  tournamentContext?: TournamentContext;
}

export interface TournamentContext {
  tournamentId: string;
  matchId: string;
  roundNumber: number;
  isEliminationMatch: boolean;
  spectators?: string[]; // Player IDs of spectators
}

export interface RoundResult {
  round: Round;
  gameEnded: boolean;
  winner?: Player;
}

export interface SessionResult {
  session: GameSession;
  finalScores: { [playerId: string]: number };
  winner: Player;
  statistics: PlayerStatistics;
}

export interface PlayerStatistics {
  cooperationPercentage: number;
  betrayalPercentage: number;
  mostFearfulRound?: number;
  totalPoints: number;
  opponentTotalPoints?: number;
  gameEndReason?: string;
  gamesWon: number;
  gamesLost: number;
  averageTrustScore: number;
}

export interface PayoffMatrix {
  [key: string]: PayoffResult;
}

export interface CommunicationMessage {
  id: string;
  playerId: string;
  message: string;
  timestamp: Date;
}

export enum PredefinedMessage {
  TRUST = 'Trust',
  FEAR = 'Fear',
  RISK = 'Risk',
}

export interface PlayerCredentials {
  username: string;
  password?: string;
}

// Interface definitions for core game services
export interface GameEngine {
  startSession(players: Player[], mode: GameMode): GameSession;
  processRound(decisions: PlayerDecision[]): RoundResult;
  calculatePayoffs(playerA: Decision, playerB: Decision): PayoffResult;
  endSession(session: GameSession): SessionResult;
}

export interface SessionManager {
  createSession(config: SessionConfig): GameSession;
  getCurrentPhase(): GamePhase;
  advancePhase(): void;
  handlePhaseTimeout(): void;
  validateDecisions(decisions: PlayerDecision[]): boolean;
  sendCommunicationMessage(
    playerId: string,
    message: PredefinedMessage
  ): CommunicationMessage;
  getCommunicationMessages(): CommunicationMessage[];
  getCommunicationTimeRemaining(): number;
  isCommunicationPhaseActive(): boolean;
  getPredefinedMessages(): PredefinedMessage[];
}

export interface AIStrategyEngine {
  executeStrategy(strategy: AIStrategy, history: Round[]): Decision;
  getAvailableStrategies(): AIStrategy[];
}

export interface PlayerManager {
  createPlayer(name: string, isAI: boolean): Player;
  updateTrustScore(playerId: string, sessionResult: SessionResult): void;
  getPlayerStats(playerId: string): PlayerStatistics;
  authenticatePlayer(credentials: PlayerCredentials): Player;
}

export interface StatisticsEngine {
  calculateSessionStats(session: GameSession): PlayerStatistics;
  generateReport(playerId: string): PlayerStatistics;
  updateHistoricalStats(playerId: string, sessionResult: SessionResult): void;
}

// UI Component Props interfaces
export interface GameBoardProps {
  session: GameSession;
  currentPlayer: Player;
  onDecision: (decision: Decision) => void;
  onCommunication: (message: string) => void;
  messages?: Array<{ playerId: string; message: string; timestamp: Date }>;
  timerSync?: { round: number; duration: number } | null;
}

export interface CommunicationPanelProps {
  messages: CommunicationMessage[];
  timeRemaining: number;
  onSendMessage: (message: string) => void;
  predefinedMessages: string[];
}

export interface StatisticsPanelProps {
  statistics: PlayerStatistics;
  session: GameSession;
  onClose?: () => void;
  isMultiplayer?: boolean;
  updatedDecisions?: any; // Updated decisions after reversal
  actualPlayerId?: string; // Actual WebSocket player ID
}

export interface PlayerProfileProps {
  player: Player;
  statistics: PlayerStatistics;
}
// Network and multiplayer types
export * from './network';
