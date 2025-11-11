import {
  PlayerManager as IPlayerManager,
  Player,
  SessionResult,
  PlayerStatistics,
  PlayerCredentials,
  Decision,
} from '../types';
import { TrustScoreEngine, TrustScoreHistoryEntry } from './TrustScoreEngine';
import { SessionIntegrityService } from './SessionIntegrityService';

interface PlayerProfile extends Player {
  passwordHash?: string;
  trustScoreHistory: TrustScoreHistoryEntry[];
  sessionHistory: string[];
  trustworthyTitles: TrustworthyTitle[];
}

interface TrustworthyTitle {
  sessionId: string;
  timestamp: Date;
  cooperationRate: number;
}

export class PlayerManager implements IPlayerManager {
  private players: Map<string, PlayerProfile> = new Map();
  private playersByName: Map<string, string> = new Map(); // name -> id mapping
  private trustScoreEngine: TrustScoreEngine = new TrustScoreEngine();
  private integrityService: SessionIntegrityService =
    new SessionIntegrityService();

  createPlayer(name: string, isAI: boolean = false): Player {
    // Check if player name already exists
    if (this.playersByName.has(name)) {
      throw new Error(`Player with name "${name}" already exists`);
    }

    const playerId = this.generatePlayerId();
    const now = new Date();

    const playerProfile: PlayerProfile = {
      id: playerId,
      name,
      isAI,
      trustScore: 50, // Start with neutral trust score
      totalGamesPlayed: 0,
      createdAt: now,
      trustScoreHistory: [
        {
          score: 50,
          timestamp: now,
          sessionId: 'initial',
          cooperationRate: 0,
          scoreChange: 0,
          reasoning: 'Initial trust score',
        },
      ],
      sessionHistory: [],
      trustworthyTitles: [],
    };

    this.players.set(playerId, playerProfile);
    this.playersByName.set(name, playerId);

    // Return the public Player interface
    return {
      id: playerProfile.id,
      name: playerProfile.name,
      isAI: playerProfile.isAI,
      trustScore: playerProfile.trustScore,
      totalGamesPlayed: playerProfile.totalGamesPlayed,
      createdAt: playerProfile.createdAt,
    };
  }

  authenticatePlayer(credentials: PlayerCredentials): Player {
    const playerId = this.playersByName.get(credentials.username);

    if (!playerId) {
      throw new Error('Player not found');
    }

    const playerProfile = this.players.get(playerId);
    if (!playerProfile) {
      throw new Error('Player profile not found');
    }

    // For now, simple authentication without password hashing
    // In a real implementation, you'd verify password hash
    if (credentials.password && playerProfile.passwordHash) {
      // Simple check - in production, use proper password hashing
      if (credentials.password !== playerProfile.passwordHash) {
        throw new Error('Invalid credentials');
      }
    }

    return {
      id: playerProfile.id,
      name: playerProfile.name,
      isAI: playerProfile.isAI,
      trustScore: playerProfile.trustScore,
      totalGamesPlayed: playerProfile.totalGamesPlayed,
      createdAt: playerProfile.createdAt,
    };
  }

  getPlayer(playerId: string): Player | null {
    const playerProfile = this.players.get(playerId);
    if (!playerProfile) {
      return null;
    }

    return {
      id: playerProfile.id,
      name: playerProfile.name,
      isAI: playerProfile.isAI,
      trustScore: playerProfile.trustScore,
      totalGamesPlayed: playerProfile.totalGamesPlayed,
      createdAt: playerProfile.createdAt,
    };
  }

  getPlayerByName(name: string): Player | null {
    const playerId = this.playersByName.get(name);
    if (!playerId) {
      return null;
    }
    return this.getPlayer(playerId);
  }

  updateTrustScore(playerId: string, sessionResult: SessionResult): void {
    const playerProfile = this.players.get(playerId);
    if (!playerProfile) {
      throw new Error('Player not found');
    }

    const oldTrustScore = playerProfile.trustScore;

    // Use TrustScoreEngine to calculate new trust score
    const calculation = this.trustScoreEngine.calculateTrustScore(
      playerProfile.trustScore,
      sessionResult,
      playerId
    );

    // Validate trust score change for anti-manipulation
    const trustScoreValidation = this.integrityService.validateTrustScoreChange(
      playerId,
      oldTrustScore,
      calculation.newScore
    );

    if (!trustScoreValidation.isValid) {
      throw new Error(
        `Trust score validation failed: ${trustScoreValidation.errorMessage} (${trustScoreValidation.errorCode})`
      );
    }

    // Update player profile
    playerProfile.trustScore = calculation.newScore;
    playerProfile.totalGamesPlayed += 1;
    playerProfile.sessionHistory.push(sessionResult.session.id);

    // Add trust score history entry
    playerProfile.trustScoreHistory.push({
      score: calculation.newScore,
      timestamp: new Date(),
      sessionId: sessionResult.session.id,
      cooperationRate: calculation.cooperationRate,
      scoreChange: calculation.scoreChange,
      reasoning: calculation.reasoning,
    });

    // Award "Most Trustworthy Player" title if qualified (Requirement 4.5)
    if (calculation.qualifiesForTrustworthyTitle) {
      playerProfile.trustworthyTitles.push({
        sessionId: sessionResult.session.id,
        timestamp: new Date(),
        cooperationRate: calculation.cooperationRate,
      });
    }
  }

  getPlayerStats(playerId: string): PlayerStatistics {
    const playerProfile = this.players.get(playerId);
    if (!playerProfile) {
      throw new Error('Player not found');
    }

    // Calculate basic statistics from trust score history
    const recentEntries = playerProfile.trustScoreHistory.slice(-10); // Last 10 games
    const avgCooperationRate =
      recentEntries.length > 1
        ? recentEntries
            .slice(1)
            .reduce((sum, entry) => sum + entry.cooperationRate, 0) /
          (recentEntries.length - 1)
        : 0;

    return {
      cooperationPercentage: avgCooperationRate * 100,
      betrayalPercentage: (1 - avgCooperationRate) * 100,
      totalPoints: 0, // Will be calculated by StatisticsEngine
      gamesWon: 0, // Will be calculated by StatisticsEngine
      gamesLost: 0, // Will be calculated by StatisticsEngine
      averageTrustScore: playerProfile.trustScore,
    };
  }

  // Check if player qualifies for "Most Trustworthy Player" title (Requirement 4.5)
  checkMostTrustworthyTitle(
    playerId: string,
    sessionResult: SessionResult
  ): boolean {
    return this.trustScoreEngine.checkTrustworthyTitle(sessionResult, playerId);
  }

  getTrustScoreHistory(playerId: string): TrustScoreHistoryEntry[] {
    const playerProfile = this.players.get(playerId);
    if (!playerProfile) {
      throw new Error('Player not found');
    }
    return [...playerProfile.trustScoreHistory];
  }

  getTrustworthyTitles(playerId: string): TrustworthyTitle[] {
    const playerProfile = this.players.get(playerId);
    if (!playerProfile) {
      throw new Error('Player not found');
    }
    return [...playerProfile.trustworthyTitles];
  }

  getTrustCategory(playerId: string): string {
    const playerProfile = this.players.get(playerId);
    if (!playerProfile) {
      throw new Error('Player not found');
    }
    return this.trustScoreEngine.getTrustCategory(playerProfile.trustScore);
  }

  getTrustTrend(playerId: string): 'improving' | 'declining' | 'stable' {
    const playerProfile = this.players.get(playerId);
    if (!playerProfile) {
      throw new Error('Player not found');
    }
    return this.trustScoreEngine.calculateTrustTrend(
      playerProfile.trustScoreHistory
    );
  }

  getAllPlayers(): Player[] {
    return Array.from(this.players.values()).map((profile) => ({
      id: profile.id,
      name: profile.name,
      isAI: profile.isAI,
      trustScore: profile.trustScore,
      totalGamesPlayed: profile.totalGamesPlayed,
      createdAt: profile.createdAt,
    }));
  }

  private generatePlayerId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
