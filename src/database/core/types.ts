// Core database types and models

// Base entity interface
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// User related types
export interface UserPreferences {
  matchmakingRegion: string;
  trustScoreMatching: boolean;
  allowFriendRequests: boolean;
  language?: string;
  theme?: string;
  notifications?: {
    email: boolean;
    push: boolean;
    gameInvites: boolean;
    friendRequests: boolean;
  };
}

export interface UserStats {
  totalGames: number;
  wins: number;
  losses: number;
  cooperations: number;
  betrayals: number;
  totalScore: number;
  winRate: number;
  trustScore: number;
  betrayalRate: number;
  averageScore: number;
  longestWinStreak: number;
  currentWinStreak: number;
  gamesThisWeek: number;
  gamesThisMonth: number;
  rank?: number;
  experience?: number;
  level?: number;
}

// Enhanced Game System Types

// Trust Score related types
export interface TrustScoreData {
  trustScore: number;
  totalGames: number;
  silentGames: number;
  silenceRatio: number;
  behaviorTrend: 'improving' | 'stable' | 'declining';
  lastUpdated: Date;
}

export interface BehaviorStats {
  totalGames: number;
  silentGames: number;
  silenceRatio: number;
  trustScore: number;
  behaviorTrend: 'improving' | 'stable' | 'declining';
}

// Game Mode Statistics
export type GameMode = 'single' | 'multi' | 'party';

export interface SinglePlayerStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  totalScore: number;
  highestScore: number;
  averageScore: number;
  totalPlaytime: number;
}

export interface MultiPlayerStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  cooperations: number;
  betrayals: number;
  totalScore: number;
  highestScore: number;
  winRate: number;
  betrayalRate: number;
  averageScore: number;
  longestWinStreak: number;
  currentWinStreak: number;
  totalPlaytime: number;
  rankPoints: number;
}

export interface PartyStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  cooperations: number;
  betrayals: number;
  totalScore: number;
  highestScore: number;
  winRate: number;
  betrayalRate: number;
  averageScore: number;
  partiesHosted: number;
  partiesJoined: number;
  totalPlaytime: number;
}

export interface SeparateStats {
  singlePlayer: SinglePlayerStats;
  multiplayer: MultiPlayerStats;
  party: PartyStats;
}

// Friend System Types
export interface Friendship extends BaseEntity {
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted' | 'blocked' | 'rejected';
}

export interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  isOnline: boolean;
  lastSeen: Date;
  trustScore: number;
  canInviteToParty: boolean;
  friendshipStatus: 'pending' | 'accepted' | 'blocked';
}

// Party System Types
export interface PartySettings {
  name: string;
  maxPlayers: number;
  gameType: string;
  isPrivate: boolean;
  gameSettings?: any;
}

export interface PartyMember {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  status: 'invited' | 'joined' | 'ready' | 'left';
  joinedAt: Date;
  isHost: boolean;
}

export interface Party extends BaseEntity {
  hostId: string;
  name: string;
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  isPrivate: boolean;
  inviteCode?: string;
  gameSettings: any;
  members: PartyMember[];
}

// Post-Game Modification Types
export interface ModificationRequest {
  type: 'score_change' | 'result_change' | 'no_change';
  details: string;
  newScore?: number;
  newResult?: 'win' | 'loss' | 'draw';
}

export interface GameModification extends BaseEntity {
  gameId: string;
  player1Id: string;
  player2Id: string;
  player1Request?: string;
  player2Request?: string;
  player1NewScore?: number;
  player2NewScore?: number;
  player1NewResult?: string;
  player2NewResult?: string;
  finalDecision?: string;
  applied: boolean;
}

export interface ModificationResult {
  applied: boolean;
  finalResult: GameResults;
  reason: string;
}

export interface PostGameStats {
  gameId: string;
  player1Stats: any;
  player2Stats: any;
  gameResults: GameResults;
  modificationStatus?: 'none' | 'pending' | 'applied' | 'rejected';
}

// Matchmaking Types
export interface MatchPreferences {
  gameMode: GameMode;
  maxWaitTime: number;
  trustScoreTolerance: number;
  skillLevelTolerance: number;
}

export interface Player {
  id: string;
  username: string;
  displayName: string;
  trustScore: number;
  skillLevel: number;
  isOnline: boolean;
  currentGameId?: string;
  totalGames?: number;
}

export interface MatchResult {
  opponent: Player;
  matchScore: number;
  estimatedWaitTime: number;
}

export interface User extends BaseEntity {
  username: string;
  displayName: string;
  passwordHash?: string;
  email?: string;
  isGuest: boolean;
  avatar: string;
  status: 'active' | 'inactive' | 'banned' | 'suspended';
  lastActive: Date;
  emailVerified: boolean;
  loginAttempts: number;
  lockedUntil?: Date;
  preferences: UserPreferences;
  stats: UserStats;
  friends: string[];
  achievements: string[];
  // Enhanced Game System fields
  trustScore: number;
  totalGames: number;
  silentGames: number;
  silenceRatio: number;
}

// Enhanced User with separate statistics
export interface EnhancedUser extends User {
  singlePlayerStats: SinglePlayerStats;
  multiplayerStats: MultiPlayerStats;
  partyStats: PartyStats;
  friendsList: Friend[];
  currentParty?: string;
  trustScoreData: TrustScoreData;
}

// Session related types
export interface Session extends BaseEntity {
  userId: number;
  token: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  lastUsed: Date;
  deviceInfo?: {
    type: 'desktop' | 'mobile' | 'tablet';
    os?: string;
    browser?: string;
  };
}

// Game related types
export interface GamePlayer {
  id: string;
  name: string;
  avatar?: string;
  isHost?: boolean;
  status: 'waiting' | 'ready' | 'playing' | 'disconnected' | 'eliminated';
  joinedAt: Date;
  score?: number;
  decisions?: any[];
}

export interface GameSettings {
  maxPlayers: number;
  roundCount: number;
  timePerRound: number;
  allowSpectators: boolean;
  isPrivate: boolean;
  gameMode: 'classic' | 'tournament' | 'party' | 'ranked';
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface GameResults {
  winner?: string;
  finalScores: { [playerId: string]: number };
  totalRounds: number;
  duration: number;
  statistics: {
    totalCooperations: number;
    totalBetrayals: number;
    averageScore: number;
    playerStats: { [playerId: string]: any };
  };
}

export interface Game extends BaseEntity {
  type: 'single' | 'tournament' | 'party' | 'ranked';
  players: GamePlayer[];
  status: 'waiting' | 'starting' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'abandoned';
  settings: GameSettings;
  startedAt?: Date;
  completedAt?: Date;
  results?: GameResults;
  lobbyCode?: string;
  currentRound?: number;
  decisions?: Map<number, any>;
  metadata?: {
    version: string;
    region?: string;
    serverInstance?: string;
  };
  // Enhanced Game System fields
  gameMode: GameMode;
  affectsStats: boolean;
  player1Silent?: boolean;
  player2Silent?: boolean;
}

// Enhanced Game Result with trust score tracking
export interface EnhancedGameResult extends GameResults {
  gameMode: GameMode;
  affectsStats: boolean;
  silenceData: {
    player1Silent: boolean;
    player2Silent: boolean;
  };
  trustScoreChanges?: {
    [playerId: string]: number;
  };
  modifications?: GameModification;
}

// Tournament related types
export interface TournamentBracket {
  rounds: TournamentRound[];
  format: 'single_elimination' | 'double_elimination' | 'round_robin';
  currentRound: number;
  totalRounds: number;
}

export interface TournamentRound {
  roundNumber: number;
  matches: TournamentMatch[];
  status: 'pending' | 'in_progress' | 'completed';
  startTime?: Date;
  endTime?: Date;
}

export interface TournamentMatch {
  id: string;
  players: string[];
  winner?: string;
  scores?: { [playerId: string]: number };
  status: 'pending' | 'in_progress' | 'completed';
  gameId?: string;
}

export interface Tournament extends BaseEntity {
  name: string;
  description?: string;
  organizerId: string;
  players: string[];
  maxPlayers: number;
  status: 'registration' | 'starting' | 'in_progress' | 'completed' | 'cancelled';
  bracket: TournamentBracket;
  settings: GameSettings;
  startTime?: Date;
  endTime?: Date;
  prizes?: {
    first?: string;
    second?: string;
    third?: string;
  };
  rules?: string[];
}

// Audit and logging types
export interface AuditLog extends BaseEntity {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

// Connection and performance types
export interface ConnectionInfo {
  id: string;
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  connectedAt: Date;
  lastActivity: Date;
  status: 'connected' | 'disconnected' | 'idle';
  gameId?: string;
  lobbyId?: string;
}

export interface PerformanceMetrics {
  timestamp: Date;
  metric: string;
  value: number;
  unit: string;
  tags?: { [key: string]: string };
}

// Error and validation types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface DatabaseMetrics {
  activeConnections: number;
  totalQueries: number;
  averageQueryTime: number;
  slowQueries: number;
  errorRate: number;
  uptime: number;
  memoryUsage: number;
  diskUsage?: number;
}