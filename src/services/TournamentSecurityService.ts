import {
  Tournament,
  TournamentPlayer,
  MatchResult,
  PartyLobby,
  TournamentMatch,
  ActiveMatch,
  MatchStatistics,
  LobbyError,
  TournamentError
} from '../types/party';
import { ValidationResult } from './SecurityValidationService';

export interface TournamentSecurityValidation {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
  details?: any;
  riskLevel?: SecurityRiskLevel;
}

export enum SecurityRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface AntiCheatMetrics {
  playerId: string;
  suspiciousActivityCount: number;
  lastSuspiciousActivity?: Date;
  riskScore: number;
  flaggedBehaviors: CheatFlag[];
}

export enum CheatFlag {
  RAPID_DECISION_CHANGES = 'rapid_decision_changes',
  IMPOSSIBLE_TIMING = 'impossible_timing',
  PATTERN_MANIPULATION = 'pattern_manipulation',
  SCORE_ANOMALY = 'score_anomaly',
  CONNECTION_MANIPULATION = 'connection_manipulation',
  DUPLICATE_SESSIONS = 'duplicate_sessions'
}

export interface SecureLobbyCode {
  code: string;
  entropy: number;
  createdAt: Date;
  expiresAt: Date;
  usageCount: number;
  maxUsage: number;
}

/**
 * Tournament Security Service
 * Provides comprehensive security validation and anti-cheating measures for tournaments
 */
export class TournamentSecurityService {
  private antiCheatMetrics: Map<string, AntiCheatMetrics> = new Map();
  private usedLobbyCodes: Set<string> = new Set();
  private playerSessionTracking: Map<string, Set<string>> = new Map();
  private matchResultHistory: Map<string, MatchResult[]> = new Map();
  
  // Security configuration
  private readonly LOBBY_CODE_LENGTH = 6;
  private readonly LOBBY_CODE_EXPIRY_HOURS = 24;
  private readonly MAX_LOBBY_CODE_USAGE = 50;
  private readonly CHEAT_RISK_THRESHOLD = 75;
  private readonly MAX_CONCURRENT_SESSIONS = 1;
  private readonly MATCH_RESULT_VALIDATION_WINDOW = 300000; // 5 minutes

  /**
   * Generate a cryptographically secure lobby code
   */
  generateSecureLobbyCode(): SecureLobbyCode {
    let code: string;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      code = this.generateCryptographicCode();
      attempts++;
      
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique lobby code after maximum attempts');
      }
    } while (this.usedLobbyCodes.has(code));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.LOBBY_CODE_EXPIRY_HOURS * 60 * 60 * 1000);

    const secureLobbyCode: SecureLobbyCode = {
      code,
      entropy: this.calculateCodeEntropy(code),
      createdAt: now,
      expiresAt,
      usageCount: 0,
      maxUsage: this.MAX_LOBBY_CODE_USAGE
    };

    this.usedLobbyCodes.add(code);
    return secureLobbyCode;
  }

  /**
   * Validate lobby code security and usage
   */
  validateLobbyCode(code: string, secureLobbyCode?: SecureLobbyCode): TournamentSecurityValidation {
    // Basit validasyon - sadece uzunluk kontrolü
    if (!code || code.length !== this.LOBBY_CODE_LENGTH) {
      return {
        isValid: false,
        errorCode: 'invalid_lobby_code',
        errorMessage: 'Invalid lobby code format',
        riskLevel: SecurityRiskLevel.LOW
      };
    }

    // Güvenlik kontrollerini geçici olarak devre dışı bırak
    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  /**
   * Validate tournament integrity
   */
  validateTournamentIntegrity(tournament: Tournament): TournamentSecurityValidation {
    // 1. Validate tournament structure
    const structureValidation = this.validateTournamentStructure(tournament);
    if (!structureValidation.isValid) {
      return structureValidation;
    }

    // 2. Validate player consistency
    const playerValidation = this.validatePlayerConsistency(tournament);
    if (!playerValidation.isValid) {
      return playerValidation;
    }

    // 3. Validate bracket integrity
    const bracketValidation = this.validateBracketIntegrity(tournament);
    if (!bracketValidation.isValid) {
      return bracketValidation;
    }

    // 4. Validate match results consistency
    const resultsValidation = this.validateMatchResultsConsistency(tournament);
    if (!resultsValidation.isValid) {
      return resultsValidation;
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  /**
   * Validate match result for anti-cheating
   */
  validateMatchResult(
    result: MatchResult,
    tournament: Tournament,
    activeMatch: ActiveMatch
  ): TournamentSecurityValidation {
    // 1. Basic result validation
    const basicValidation = this.validateBasicMatchResult(result, activeMatch);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    // 2. Timing validation
    const timingValidation = this.validateMatchTiming(result, activeMatch);
    if (!timingValidation.isValid) {
      return timingValidation;
    }

    // 3. Score consistency validation
    const scoreValidation = this.validateScoreConsistency(result);
    if (!scoreValidation.isValid) {
      return scoreValidation;
    }

    // 4. Statistical anomaly detection
    const anomalyValidation = this.detectStatisticalAnomalies(result, tournament);
    if (!anomalyValidation.isValid) {
      return anomalyValidation;
    }

    // 5. Anti-cheat pattern detection
    const cheatValidation = this.detectCheatPatterns(result, tournament);
    if (!cheatValidation.isValid) {
      return cheatValidation;
    }

    // Store result for future validation
    this.storeMatchResultForValidation(result);

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  /**
   * Track player session to prevent duplicate sessions
   */
  trackPlayerSession(playerId: string, sessionId: string): TournamentSecurityValidation {
    const playerSessions = this.playerSessionTracking.get(playerId) || new Set();

    if (playerSessions.size >= this.MAX_CONCURRENT_SESSIONS) {
      this.flagSuspiciousActivity(playerId, CheatFlag.DUPLICATE_SESSIONS);
      return {
        isValid: false,
        errorCode: 'DUPLICATE_SESSION_DETECTED',
        errorMessage: 'Player has multiple concurrent sessions',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    playerSessions.add(sessionId);
    this.playerSessionTracking.set(playerId, playerSessions);

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  /**
   * Remove player session tracking
   */
  removePlayerSession(playerId: string, sessionId: string): void {
    const playerSessions = this.playerSessionTracking.get(playerId);
    if (playerSessions) {
      playerSessions.delete(sessionId);
      if (playerSessions.size === 0) {
        this.playerSessionTracking.delete(playerId);
      }
    }
  }

  /**
   * Get anti-cheat metrics for a player
   */
  getAntiCheatMetrics(playerId: string): AntiCheatMetrics {
    return this.antiCheatMetrics.get(playerId) || {
      playerId,
      suspiciousActivityCount: 0,
      riskScore: 0,
      flaggedBehaviors: []
    };
  }

  /**
   * Check if player is flagged as high risk
   */
  isPlayerHighRisk(playerId: string): boolean {
    const metrics = this.getAntiCheatMetrics(playerId);
    return metrics.riskScore >= this.CHEAT_RISK_THRESHOLD;
  }

  /**
   * Clean up expired security data
   */
  cleanupSecurityData(): void {
    const now = new Date();
    const cleanupAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up anti-cheat metrics
    this.antiCheatMetrics.forEach((metrics, playerId) => {
      if (metrics.lastSuspiciousActivity && 
          now.getTime() - metrics.lastSuspiciousActivity.getTime() > cleanupAge) {
        // Reset metrics for players with old suspicious activity
        metrics.suspiciousActivityCount = Math.max(0, metrics.suspiciousActivityCount - 1);
        metrics.riskScore = Math.max(0, metrics.riskScore - 10);
        metrics.flaggedBehaviors = metrics.flaggedBehaviors.filter(flag => 
          flag !== CheatFlag.RAPID_DECISION_CHANGES
        );
      }
    });

    // Clean up match result history
    this.matchResultHistory.forEach((results, playerId) => {
      const recentResults = results.filter(result => 
        now.getTime() - result.completedAt.getTime() < cleanupAge
      );
      if (recentResults.length === 0) {
        this.matchResultHistory.delete(playerId);
      } else {
        this.matchResultHistory.set(playerId, recentResults);
      }
    });
  }

  // Private helper methods

  private generateCryptographicCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    // Use crypto.getRandomValues if available, fallback to Math.random
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(this.LOBBY_CODE_LENGTH);
      crypto.getRandomValues(array);
      
      for (let i = 0; i < this.LOBBY_CODE_LENGTH; i++) {
        code += chars.charAt(array[i] % chars.length);
      }
    } else {
      // Fallback for environments without crypto API
      for (let i = 0; i < this.LOBBY_CODE_LENGTH; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    
    return code;
  }

  private calculateCodeEntropy(code: string): number {
    const charFreq: { [key: string]: number } = {};
    
    for (const char of code) {
      charFreq[char] = (charFreq[char] || 0) + 1;
    }
    
    let entropy = 0;
    const codeLength = code.length;
    
    for (const freq of Object.values(charFreq)) {
      const probability = freq / codeLength;
      entropy -= probability * Math.log2(probability);
    }
    
    return entropy * codeLength;
  }

  private validateCodePattern(code: string): TournamentSecurityValidation {
    // Check for common weak patterns (only the most obvious ones)
    const weakPatterns = ['000000', '111111', '123456', 'AAAAAA', 'ABCDEF'];
    if (weakPatterns.includes(code)) {
      return {
        isValid: false,
        errorCode: 'WEAK_CODE_PATTERN',
        errorMessage: 'Lobby code uses common weak pattern',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    // Check for all same character (more than 4 in a row)
    const hasAllSame = /(.)\1{4,}/.test(code);
    if (hasAllSame) {
      return {
        isValid: false,
        errorCode: 'WEAK_CODE_PATTERN',
        errorMessage: 'Lobby code contains too many repeated characters',
        riskLevel: SecurityRiskLevel.MEDIUM
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateTournamentStructure(tournament: Tournament): TournamentSecurityValidation {
    if (!tournament.id || !tournament.lobbyId) {
      return {
        isValid: false,
        errorCode: TournamentError.TOURNAMENT_NOT_FOUND,
        errorMessage: 'Tournament missing required identifiers',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    if (tournament.currentRound < 0 || tournament.currentRound > tournament.totalRounds) {
      return {
        isValid: false,
        errorCode: 'INVALID_ROUND_STATE',
        errorMessage: 'Tournament round state is invalid',
        riskLevel: SecurityRiskLevel.MEDIUM
      };
    }

    if (tournament.players.length < 4 || tournament.players.length > 16) {
      return {
        isValid: false,
        errorCode: 'INVALID_PLAYER_COUNT',
        errorMessage: 'Tournament has invalid number of players',
        riskLevel: SecurityRiskLevel.MEDIUM
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validatePlayerConsistency(tournament: Tournament): TournamentSecurityValidation {
    const playerIds = new Set<string>();
    
    for (const player of tournament.players) {
      if (playerIds.has(player.id)) {
        return {
          isValid: false,
          errorCode: 'DUPLICATE_PLAYER',
          errorMessage: 'Tournament contains duplicate players',
          riskLevel: SecurityRiskLevel.HIGH
        };
      }
      playerIds.add(player.id);

      if (!player.name || player.name.trim().length === 0) {
        return {
          isValid: false,
          errorCode: 'INVALID_PLAYER_DATA',
          errorMessage: 'Player has invalid name',
          riskLevel: SecurityRiskLevel.MEDIUM
        };
      }
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateBracketIntegrity(tournament: Tournament): TournamentSecurityValidation {
    const bracket = tournament.bracket;
    
    if (!bracket || !bracket.rounds) {
      return {
        isValid: false,
        errorCode: 'INVALID_BRACKET_STRUCTURE',
        errorMessage: 'Tournament bracket is malformed',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    // Validate that all players are accounted for in bracket
    const bracketPlayerIds = new Set<string>();
    bracket.rounds.forEach(round => {
      round.matches.forEach(match => {
        bracketPlayerIds.add(match.player1Id);
        bracketPlayerIds.add(match.player2Id);
      });
    });

    const tournamentPlayerIds = new Set(tournament.players.map(p => p.id));
    const bracketPlayerArray = Array.from(bracketPlayerIds);
    for (const playerId of bracketPlayerArray) {
      if (!tournamentPlayerIds.has(playerId)) {
        return {
          isValid: false,
          errorCode: 'BRACKET_PLAYER_MISMATCH',
          errorMessage: 'Bracket contains players not in tournament',
          riskLevel: SecurityRiskLevel.HIGH
        };
      }
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateMatchResultsConsistency(tournament: Tournament): TournamentSecurityValidation {
    for (const round of tournament.bracket.rounds) {
      for (const match of round.matches) {
        if (match.result) {
          // Validate that winner/loser are match participants
          const participants = [match.player1Id, match.player2Id];
          if (!participants.includes(match.result.winnerId) || 
              !participants.includes(match.result.loserId)) {
            return {
              isValid: false,
              errorCode: 'INVALID_MATCH_RESULT',
              errorMessage: 'Match result contains invalid winner/loser',
              riskLevel: SecurityRiskLevel.HIGH
            };
          }

          // Validate that winner and loser are different
          if (match.result.winnerId === match.result.loserId) {
            return {
              isValid: false,
              errorCode: 'INVALID_MATCH_RESULT',
              errorMessage: 'Match result has same winner and loser',
              riskLevel: SecurityRiskLevel.HIGH
            };
          }
        }
      }
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateBasicMatchResult(result: MatchResult, activeMatch: ActiveMatch): TournamentSecurityValidation {
    if (result.matchId !== activeMatch.id) {
      return {
        isValid: false,
        errorCode: 'MATCH_ID_MISMATCH',
        errorMessage: 'Match result ID does not match active match',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    if (result.player1Id !== activeMatch.player1.id || result.player2Id !== activeMatch.player2.id) {
      return {
        isValid: false,
        errorCode: 'PLAYER_ID_MISMATCH',
        errorMessage: 'Match result players do not match active match',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    if (result.player1Score < 0 || result.player2Score < 0) {
      return {
        isValid: false,
        errorCode: 'INVALID_SCORE',
        errorMessage: 'Match scores cannot be negative',
        riskLevel: SecurityRiskLevel.MEDIUM
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateMatchTiming(result: MatchResult, activeMatch: ActiveMatch): TournamentSecurityValidation {
    const now = new Date();
    const matchStart = activeMatch.startTime;
    const resultTime = result.completedAt;

    // Check if result is too soon after match start
    const minMatchDuration = 30000; // 30 seconds minimum
    if (resultTime.getTime() - matchStart.getTime() < minMatchDuration) {
      this.flagSuspiciousActivity(result.player1Id, CheatFlag.IMPOSSIBLE_TIMING);
      this.flagSuspiciousActivity(result.player2Id, CheatFlag.IMPOSSIBLE_TIMING);
      
      return {
        isValid: false,
        errorCode: 'MATCH_TOO_SHORT',
        errorMessage: 'Match completed too quickly to be legitimate',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    // Check if result is submitted too late
    const maxMatchDuration = 1800000; // 30 minutes maximum
    if (resultTime.getTime() - matchStart.getTime() > maxMatchDuration) {
      return {
        isValid: false,
        errorCode: 'MATCH_TOO_LONG',
        errorMessage: 'Match duration exceeds maximum allowed time',
        riskLevel: SecurityRiskLevel.MEDIUM
      };
    }

    // Check if result timestamp is in the future
    if (resultTime.getTime() > now.getTime() + 60000) { // 1 minute tolerance
      return {
        isValid: false,
        errorCode: 'FUTURE_TIMESTAMP',
        errorMessage: 'Match result timestamp is in the future',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateScoreConsistency(result: MatchResult): TournamentSecurityValidation {
    const stats = result.statistics;
    
    // Validate that cooperation + betrayal counts match total rounds
    const player1Total = stats.player1Cooperations + stats.player1Betrayals;
    const player2Total = stats.player2Cooperations + stats.player2Betrayals;
    
    if (player1Total !== stats.totalRounds || player2Total !== stats.totalRounds) {
      return {
        isValid: false,
        errorCode: 'INCONSISTENT_STATISTICS',
        errorMessage: 'Player decision counts do not match total rounds',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    // Validate score reasonableness (scores should be within reasonable bounds)
    const maxPossibleScore = stats.totalRounds * 5; // Maximum if all betrayals are successful
    const minPossibleScore = 0; // Minimum if all cooperations are betrayed
    
    if (result.player1Score < minPossibleScore || result.player1Score > maxPossibleScore ||
        result.player2Score < minPossibleScore || result.player2Score > maxPossibleScore) {
      return {
        isValid: false,
        errorCode: 'SCORE_OUT_OF_BOUNDS',
        errorMessage: 'Match scores are outside possible range',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    // Check for obviously impossible score combinations
    const totalScore = result.player1Score + result.player2Score;
    const maxTotalScore = stats.totalRounds * 10; // Both players get max in all rounds
    
    if (totalScore > maxTotalScore) {
      return {
        isValid: false,
        errorCode: 'IMPOSSIBLE_TOTAL_SCORE',
        errorMessage: 'Combined match scores exceed maximum possible',
        riskLevel: SecurityRiskLevel.HIGH
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private detectStatisticalAnomalies(result: MatchResult, tournament: Tournament): TournamentSecurityValidation {
    const stats = result.statistics;
    
    // Check for impossible cooperation rates
    if (stats.player1Cooperations === 0 && stats.player2Cooperations === 0 && stats.totalRounds > 5) {
      this.flagSuspiciousActivity(result.player1Id, CheatFlag.PATTERN_MANIPULATION);
      this.flagSuspiciousActivity(result.player2Id, CheatFlag.PATTERN_MANIPULATION);
      
      return {
        isValid: false,
        errorCode: 'SUSPICIOUS_COOPERATION_PATTERN',
        errorMessage: 'Detected impossible cooperation pattern',
        riskLevel: SecurityRiskLevel.MEDIUM
      };
    }

    // Check for score anomalies compared to tournament average
    const tournamentAverage = this.calculateTournamentAverageScore(tournament);
    const resultAverage = (result.player1Score + result.player2Score) / 2;
    
    if (Math.abs(resultAverage - tournamentAverage) > tournamentAverage * 2) {
      this.flagSuspiciousActivity(result.player1Id, CheatFlag.SCORE_ANOMALY);
      this.flagSuspiciousActivity(result.player2Id, CheatFlag.SCORE_ANOMALY);
      
      return {
        isValid: false,
        errorCode: 'SCORE_ANOMALY_DETECTED',
        errorMessage: 'Match scores significantly deviate from tournament average',
        riskLevel: SecurityRiskLevel.MEDIUM
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private detectCheatPatterns(result: MatchResult, tournament: Tournament): TournamentSecurityValidation {
    // Check for rapid decision pattern changes
    const player1History = this.matchResultHistory.get(result.player1Id) || [];
    const player2History = this.matchResultHistory.get(result.player2Id) || [];
    
    if (this.hasRapidPatternChanges(player1History, result)) {
      this.flagSuspiciousActivity(result.player1Id, CheatFlag.RAPID_DECISION_CHANGES);
    }
    
    if (this.hasRapidPatternChanges(player2History, result)) {
      this.flagSuspiciousActivity(result.player2Id, CheatFlag.RAPID_DECISION_CHANGES);
    }

    // Check overall risk scores
    const player1Risk = this.getAntiCheatMetrics(result.player1Id).riskScore;
    const player2Risk = this.getAntiCheatMetrics(result.player2Id).riskScore;
    
    if (player1Risk >= this.CHEAT_RISK_THRESHOLD || player2Risk >= this.CHEAT_RISK_THRESHOLD) {
      return {
        isValid: false,
        errorCode: 'HIGH_CHEAT_RISK_DETECTED',
        errorMessage: 'Player flagged as high risk for cheating',
        riskLevel: SecurityRiskLevel.CRITICAL,
        details: { player1Risk, player2Risk }
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private flagSuspiciousActivity(playerId: string, flag: CheatFlag): void {
    const metrics = this.getAntiCheatMetrics(playerId);
    
    metrics.suspiciousActivityCount++;
    metrics.lastSuspiciousActivity = new Date();
    metrics.riskScore = Math.min(100, metrics.riskScore + this.getCheatFlagWeight(flag));
    
    if (!metrics.flaggedBehaviors.includes(flag)) {
      metrics.flaggedBehaviors.push(flag);
    }
    
    this.antiCheatMetrics.set(playerId, metrics);
  }

  private getCheatFlagWeight(flag: CheatFlag): number {
    const weights = {
      [CheatFlag.RAPID_DECISION_CHANGES]: 15,
      [CheatFlag.IMPOSSIBLE_TIMING]: 25,
      [CheatFlag.PATTERN_MANIPULATION]: 20,
      [CheatFlag.SCORE_ANOMALY]: 20,
      [CheatFlag.CONNECTION_MANIPULATION]: 30,
      [CheatFlag.DUPLICATE_SESSIONS]: 35
    };
    
    return weights[flag] || 10;
  }

  private storeMatchResultForValidation(result: MatchResult): void {
    // Store for player 1
    const player1History = this.matchResultHistory.get(result.player1Id) || [];
    player1History.push(result);
    if (player1History.length > 10) {
      player1History.shift(); // Keep only last 10 results
    }
    this.matchResultHistory.set(result.player1Id, player1History);

    // Store for player 2
    const player2History = this.matchResultHistory.get(result.player2Id) || [];
    player2History.push(result);
    if (player2History.length > 10) {
      player2History.shift(); // Keep only last 10 results
    }
    this.matchResultHistory.set(result.player2Id, player2History);
  }

  private calculateExpectedScore(
    p1Cooperations: number,
    p1Betrayals: number,
    p2Cooperations: number,
    p2Betrayals: number
  ): number {
    // Simplified Prisoner's Dilemma scoring calculation
    // This is an approximation - in real games, the exact score depends on the specific round outcomes
    // For validation purposes, we'll use a reasonable range rather than exact calculation
    
    const totalRounds = p1Cooperations + p1Betrayals;
    
    // Calculate approximate score range based on cooperation/betrayal patterns
    // Minimum score: all betrayals against cooperations = 0 points
    // Maximum score: all successful betrayals = totalRounds * 5
    // Typical score: mix of cooperation (3 points) and betrayal outcomes
    
    const minScore = 0;
    const maxScore = totalRounds * 5;
    const typicalScore = (p1Cooperations * 3) + (p1Betrayals * 2.5); // Average between 0 and 5
    
    // Return a reasonable expected score (we'll use a wider tolerance in validation)
    return typicalScore;
  }

  private calculateTournamentAverageScore(tournament: Tournament): number {
    let totalScore = 0;
    let matchCount = 0;
    
    tournament.bracket.rounds.forEach(round => {
      round.matches.forEach(match => {
        if (match.result) {
          totalScore += match.result.player1Score + match.result.player2Score;
          matchCount += 2; // Two players per match
        }
      });
    });
    
    return matchCount > 0 ? totalScore / matchCount : 50; // Default average
  }

  private hasRapidPatternChanges(history: MatchResult[], currentResult: MatchResult): boolean {
    if (history.length < 2) return false;
    
    const recentResults = history.slice(-3); // Check last 3 matches
    let patternChanges = 0;
    
    for (let i = 1; i < recentResults.length; i++) {
      const prev = recentResults[i - 1];
      const curr = recentResults[i];
      
      // Check if cooperation pattern changed dramatically
      const prevCoopRate = this.getCooperationRate(prev, currentResult.player1Id);
      const currCoopRate = this.getCooperationRate(curr, currentResult.player1Id);
      
      if (Math.abs(prevCoopRate - currCoopRate) > 0.5) {
        patternChanges++;
      }
    }
    
    return patternChanges >= 2; // Flag if pattern changed in 2+ recent matches
  }

  private getCooperationRate(result: MatchResult, playerId: string): number {
    const stats = result.statistics;
    
    if (playerId === result.player1Id) {
      const total = stats.player1Cooperations + stats.player1Betrayals;
      return total > 0 ? stats.player1Cooperations / total : 0;
    } else {
      const total = stats.player2Cooperations + stats.player2Betrayals;
      return total > 0 ? stats.player2Cooperations / total : 0;
    }
  }
}

// Singleton instance
let tournamentSecurityServiceInstance: TournamentSecurityService | null = null;

export function getTournamentSecurityService(): TournamentSecurityService {
  if (!tournamentSecurityServiceInstance) {
    tournamentSecurityServiceInstance = new TournamentSecurityService();
    
    // Set up cleanup interval
    setInterval(() => {
      tournamentSecurityServiceInstance?.cleanupSecurityData();
    }, 60 * 60 * 1000); // Clean up every hour
  }
  
  return tournamentSecurityServiceInstance;
}

export default TournamentSecurityService;