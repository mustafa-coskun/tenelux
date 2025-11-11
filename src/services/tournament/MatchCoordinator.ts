import {
  ActiveMatch,
  MatchPairing,
  MatchResult,
  MatchStatus,
  TournamentPlayer,
  PlayerStatus,
  Tournament,
  TournamentError,
  PartyMessage,
  PartyMessageType
} from '../../types/party';
import { GameSession, SessionConfig, GameMode, Player, GamePhase } from '../../types';
import { SessionManager } from '../SessionManager';

/**
 * Match Coordinator Service
 * Manages match creation, scheduling, and coordination within tournaments
 * Integrates with existing GameSession system for tournament matches
 */
export class MatchCoordinator {
  private activeMatches: Map<string, ActiveMatch> = new Map();
  private matchQueue: Map<string, MatchPairing[]> = new Map(); // tournamentId -> queue
  private playerMatchHistory: Map<string, Set<string>> = new Map(); // playerId -> set of opponent IDs
  private gameSessions: Map<string, GameSession> = new Map(); // matchId -> GameSession
  private sessionManagers: Map<string, SessionManager> = new Map(); // matchId -> SessionManager

  /**
   * Create an active match from a pairing
   */
  createMatch(pairing: MatchPairing, tournamentId: string, tournament: Tournament): ActiveMatch {
    const player1 = tournament.players.find(p => p.id === pairing.player1Id);
    const player2 = tournament.players.find(p => p.id === pairing.player2Id);

    if (!player1 || !player2) {
      throw new Error(TournamentError.PLAYER_NOT_IN_TOURNAMENT);
    }

    // Validate players are available
    if (player1.status === PlayerStatus.IN_MATCH || player2.status === PlayerStatus.IN_MATCH) {
      throw new Error(TournamentError.MATCH_ALREADY_IN_PROGRESS);
    }

    if (player1.isEliminated || player2.isEliminated) {
      throw new Error('Cannot create match with eliminated players');
    }

    const matchId = this.generateMatchId();
    const activeMatch: ActiveMatch = {
      id: matchId,
      tournamentId,
      roundNumber: pairing.roundNumber,
      player1,
      player2,
      status: MatchStatus.SCHEDULED,
      startTime: new Date()
    };

    // Update player statuses
    player1.status = PlayerStatus.IN_MATCH;
    player2.status = PlayerStatus.IN_MATCH;

    // Track the match
    this.activeMatches.set(matchId, activeMatch);

    // Update match history
    this.updatePlayerMatchHistory(player1.id, player2.id);

    return activeMatch;
  }

  /**
   * Start a scheduled match and create GameSession
   */
  startMatch(matchId: string, gameSessionId?: string): ActiveMatch {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    if (match.status !== MatchStatus.SCHEDULED) {
      throw new Error(TournamentError.MATCH_ALREADY_IN_PROGRESS);
    }

    // Create GameSession for the match
    const gameSession = this.createGameSessionForMatch(match);
    match.gameSessionId = gameSession.id;
    match.status = MatchStatus.IN_PROGRESS;
    match.startTime = new Date();

    // Store the game session and session manager
    this.gameSessions.set(matchId, gameSession);
    
    this.activeMatches.set(matchId, match);
    return match;
  }

  /**
   * Create a GameSession for a tournament match
   */
  private createGameSessionForMatch(match: ActiveMatch): GameSession {
    const sessionManager = new SessionManager();
    
    // Create session config for tournament match
    const sessionConfig: SessionConfig = {
      gameMode: GameMode.PARTY,
      maxRounds: 10, // Standard tournament match length
      trustPhaseRounds: 5,
      communicationTimeLimit: 60,
      allowDecisionReversal: false // Disabled in tournament play
    };

    // Create the session
    const gameSession = sessionManager.createSession(sessionConfig);
    
    // Convert tournament players to game players
    const gamePlayers: Player[] = [
      this.convertTournamentPlayerToGamePlayer(match.player1),
      this.convertTournamentPlayerToGamePlayer(match.player2)
    ];

    // Add players to session
    sessionManager.addPlayersToSession(gamePlayers);
    
    // Store session manager for this match
    this.sessionManagers.set(match.id, sessionManager);
    
    return gameSession;
  }

  /**
   * Convert TournamentPlayer to Game Player
   */
  private convertTournamentPlayerToGamePlayer(tournamentPlayer: TournamentPlayer): Player {
    return {
      id: tournamentPlayer.id,
      name: tournamentPlayer.name,
      isAI: false, // Tournament players are always human
      trustScore: 50, // Default trust score for tournament
      totalGamesPlayed: tournamentPlayer.statistics.matchesPlayed,
      createdAt: tournamentPlayer.joinedAt
    };
  }

  /**
   * Get GameSession for a match
   */
  getGameSession(matchId: string): GameSession | null {
    return this.gameSessions.get(matchId) || null;
  }

  /**
   * Get SessionManager for a match
   */
  getSessionManager(matchId: string): SessionManager | null {
    return this.sessionManagers.get(matchId) || null;
  }

  /**
   * Handle match completion and cleanup
   */
  handleMatchCompletion(matchId: string, result: MatchResult): void {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    // Update match status
    match.status = MatchStatus.COMPLETED;
    match.result = result;
    match.endTime = new Date();

    // Update player statuses
    match.player1.status = PlayerStatus.READY;
    match.player2.status = PlayerStatus.READY;

    // Update tournament player statistics
    this.updateTournamentPlayerStats(match, result);

    // Cleanup game session and session manager
    this.cleanupMatchSession(matchId);

    // Remove from active matches
    this.activeMatches.delete(matchId);
  }

  /**
   * Process game session completion and create match result
   */
  processGameSessionCompletion(matchId: string, gameSession: GameSession): MatchResult {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    // Calculate final scores from game session
    const finalScores = this.calculateFinalScores(gameSession);
    const player1Score = finalScores[match.player1.id] || 0;
    const player2Score = finalScores[match.player2.id] || 0;

    // Determine winner
    const winnerId = player1Score > player2Score ? match.player1.id : match.player2.id;
    const loserId = winnerId === match.player1.id ? match.player2.id : match.player1.id;

    // Calculate match statistics
    const statistics = this.calculateMatchStatistics(gameSession, match.player1.id, match.player2.id);

    const result: MatchResult = {
      matchId,
      player1Id: match.player1.id,
      player2Id: match.player2.id,
      winnerId,
      loserId,
      player1Score,
      player2Score,
      gameSessionId: gameSession.id,
      statistics,
      completedAt: new Date()
    };

    return result;
  }

  /**
   * Calculate final scores from game session
   */
  private calculateFinalScores(gameSession: GameSession): { [playerId: string]: number } {
    const scores: { [playerId: string]: number } = {};

    // Initialize scores
    gameSession.players.forEach(player => {
      scores[player.id] = 0;
    });

    // Sum up scores from all rounds
    gameSession.rounds.forEach(round => {
      if (round.results) {
        const [playerA, playerB] = gameSession.players;
        scores[playerA.id] += round.results.playerA;
        scores[playerB.id] += round.results.playerB;
      }
    });

    return scores;
  }

  /**
   * Calculate match statistics from game session
   */
  private calculateMatchStatistics(gameSession: GameSession, player1Id: string, player2Id: string): any {
    let player1Cooperations = 0;
    let player1Betrayals = 0;
    let player2Cooperations = 0;
    let player2Betrayals = 0;

    gameSession.rounds.forEach(round => {
      round.decisions.forEach(decision => {
        if (decision.playerId === player1Id) {
          if (decision.decision === 'stay_silent') {
            player1Cooperations++;
          } else {
            player1Betrayals++;
          }
        } else if (decision.playerId === player2Id) {
          if (decision.decision === 'stay_silent') {
            player2Cooperations++;
          } else {
            player2Betrayals++;
          }
        }
      });
    });

    const matchDuration = gameSession.endTime && gameSession.startTime 
      ? (gameSession.endTime.getTime() - gameSession.startTime.getTime()) / 1000
      : 0;

    return {
      totalRounds: gameSession.rounds.length,
      player1Cooperations,
      player1Betrayals,
      player2Cooperations,
      player2Betrayals,
      matchDuration
    };
  }

  /**
   * Update tournament player statistics after match completion
   */
  private updateTournamentPlayerStats(match: ActiveMatch, result: MatchResult): void {
    // Update player 1 stats
    match.player1.statistics.matchesPlayed++;
    if (result.winnerId === match.player1.id) {
      match.player1.statistics.matchesWon++;
    } else {
      match.player1.statistics.matchesLost++;
    }
    match.player1.statistics.totalPoints += result.player1Score;

    // Update player 2 stats
    match.player2.statistics.matchesPlayed++;
    if (result.winnerId === match.player2.id) {
      match.player2.statistics.matchesWon++;
    } else {
      match.player2.statistics.matchesLost++;
    }
    match.player2.statistics.totalPoints += result.player2Score;

    // Update cooperation/betrayal rates
    this.updateCooperationStats(match.player1, result.statistics.player1Cooperations, result.statistics.player1Betrayals);
    this.updateCooperationStats(match.player2, result.statistics.player2Cooperations, result.statistics.player2Betrayals);

    // Update head-to-head records
    this.updateHeadToHeadStats(match.player1, match.player2, result);
  }

  /**
   * Update cooperation statistics for a player
   */
  private updateCooperationStats(player: TournamentPlayer, cooperations: number, betrayals: number): void {
    const totalDecisions = cooperations + betrayals;
    if (totalDecisions > 0) {
      const totalPreviousDecisions = player.statistics.cooperationRate + player.statistics.betrayalRate;
      const newCooperationRate = (cooperations / totalDecisions) * 100;
      const newBetrayalRate = (betrayals / totalDecisions) * 100;
      
      // Update running averages
      if (totalPreviousDecisions > 0) {
        player.statistics.cooperationRate = (player.statistics.cooperationRate + newCooperationRate) / 2;
        player.statistics.betrayalRate = (player.statistics.betrayalRate + newBetrayalRate) / 2;
      } else {
        player.statistics.cooperationRate = newCooperationRate;
        player.statistics.betrayalRate = newBetrayalRate;
      }
    }
  }

  /**
   * Update head-to-head statistics between players
   */
  private updateHeadToHeadStats(player: TournamentPlayer, opponent: TournamentPlayer, result: MatchResult): void {
    // Get or create head-to-head record
    let headToHead = player.statistics.headToHeadRecord.get(opponent.id);
    if (!headToHead) {
      headToHead = {
        opponentId: opponent.id,
        opponentName: opponent.name,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        totalPointsScored: 0,
        totalPointsConceded: 0
      };
      player.statistics.headToHeadRecord.set(opponent.id, headToHead);
    }

    // Update stats
    headToHead.matchesPlayed++;
    if (result.winnerId === player.id) {
      headToHead.wins++;
    } else {
      headToHead.losses++;
    }

    // Update points
    if (player.id === result.player1Id) {
      headToHead.totalPointsScored += result.player1Score;
      headToHead.totalPointsConceded += result.player2Score;
    } else {
      headToHead.totalPointsScored += result.player2Score;
      headToHead.totalPointsConceded += result.player1Score;
    }
  }

  /**
   * Cleanup game session and session manager for completed match
   */
  private cleanupMatchSession(matchId: string): void {
    const sessionManager = this.sessionManagers.get(matchId);
    if (sessionManager) {
      sessionManager.cleanup();
      this.sessionManagers.delete(matchId);
    }
    
    this.gameSessions.delete(matchId);
  }

  /**
   * Get all active matches for a tournament
   */
  getActiveMatches(tournamentId: string): ActiveMatch[] {
    return Array.from(this.activeMatches.values()).filter(
      match => match.tournamentId === tournamentId
    );
  }

  /**
   * Get active match for a specific player
   */
  getPlayerActiveMatch(playerId: string): ActiveMatch | null {
    for (const [, match] of Array.from(this.activeMatches.entries())) {
      if (match.player1.id === playerId || match.player2.id === playerId) {
        return match;
      }
    }
    return null;
  }

  /**
   * Manage match queue for a tournament
   */
  addToMatchQueue(tournamentId: string, pairings: MatchPairing[]): void {
    const currentQueue = this.matchQueue.get(tournamentId) || [];
    const updatedQueue = [...currentQueue, ...pairings];
    this.matchQueue.set(tournamentId, updatedQueue);
  }

  /**
   * Get next matches from queue that can be started
   */
  getNextAvailableMatches(tournamentId: string, tournament: Tournament, maxConcurrent: number = 4): MatchPairing[] {
    const queue = this.matchQueue.get(tournamentId) || [];
    const currentActiveCount = this.getActiveMatches(tournamentId).length;
    const availableSlots = Math.max(0, maxConcurrent - currentActiveCount);

    if (availableSlots === 0) {
      return [];
    }

    const availableMatches: MatchPairing[] = [];
    const busyPlayers = new Set<string>();

    // Get currently busy players
    this.getActiveMatches(tournamentId).forEach(match => {
      busyPlayers.add(match.player1.id);
      busyPlayers.add(match.player2.id);
    });

    // Find matches where both players are available
    for (const pairing of queue) {
      if (availableMatches.length >= availableSlots) {
        break;
      }

      const player1 = tournament.players.find(p => p.id === pairing.player1Id);
      const player2 = tournament.players.find(p => p.id === pairing.player2Id);

      if (player1 && player2 && 
          !busyPlayers.has(player1.id) && 
          !busyPlayers.has(player2.id) &&
          !player1.isEliminated && 
          !player2.isEliminated &&
          player1.status !== PlayerStatus.IN_MATCH &&
          player2.status !== PlayerStatus.IN_MATCH) {
        
        availableMatches.push(pairing);
        busyPlayers.add(player1.id);
        busyPlayers.add(player2.id);
      }
    }

    // Remove selected matches from queue
    if (availableMatches.length > 0) {
      const remainingQueue = queue.filter(pairing => 
        !availableMatches.some(selected => 
          selected.player1Id === pairing.player1Id && 
          selected.player2Id === pairing.player2Id
        )
      );
      this.matchQueue.set(tournamentId, remainingQueue);
    }

    return availableMatches;
  }

  /**
   * Clear match queue for a tournament
   */
  clearMatchQueue(tournamentId: string): void {
    this.matchQueue.delete(tournamentId);
  }

  /**
   * Get match queue status
   */
  getMatchQueueStatus(tournamentId: string): {
    queueLength: number;
    activeMatches: number;
    waitingPairings: MatchPairing[];
  } {
    const queue = this.matchQueue.get(tournamentId) || [];
    const activeMatches = this.getActiveMatches(tournamentId);

    return {
      queueLength: queue.length,
      activeMatches: activeMatches.length,
      waitingPairings: queue
    };
  }

  /**
   * Notify players when their match is ready
   */
  notifyPlayersForMatch(match: ActiveMatch): PartyMessage[] {
    const notifications: PartyMessage[] = [];

    // Create notification for both players
    const matchReadyMessage: PartyMessage = {
      type: PartyMessageType.MATCH_READY,
      lobbyId: '', // Will be set by caller
      senderId: 'system',
      data: {
        matchId: match.id,
        opponent1: {
          id: match.player1.id,
          name: match.player1.name
        },
        opponent2: {
          id: match.player2.id,
          name: match.player2.name
        },
        roundNumber: match.roundNumber,
        estimatedStartTime: match.startTime
      },
      timestamp: new Date()
    };

    notifications.push(matchReadyMessage);
    return notifications;
  }

  /**
   * Calculate optimal match scheduling
   */
  optimizeMatchScheduling(
    pairings: MatchPairing[], 
    tournament: Tournament,
    maxConcurrentMatches: number = 4
  ): MatchPairing[][] {
    const rounds: MatchPairing[][] = [];
    const remainingPairings = [...pairings];

    while (remainingPairings.length > 0) {
      const roundMatches: MatchPairing[] = [];
      const usedPlayers = new Set<string>();

      for (let i = remainingPairings.length - 1; i >= 0; i--) {
        const pairing = remainingPairings[i];
        
        if (!usedPlayers.has(pairing.player1Id) && 
            !usedPlayers.has(pairing.player2Id) &&
            roundMatches.length < maxConcurrentMatches) {
          
          roundMatches.push(pairing);
          usedPlayers.add(pairing.player1Id);
          usedPlayers.add(pairing.player2Id);
          remainingPairings.splice(i, 1);
        }
      }

      if (roundMatches.length > 0) {
        rounds.push(roundMatches);
      } else {
        // Prevent infinite loop - add remaining matches even if not optimal
        rounds.push(remainingPairings.splice(0, maxConcurrentMatches));
      }
    }

    return rounds;
  }

  /**
   * Get player match statistics
   */
  getPlayerMatchStats(playerId: string): {
    totalMatches: number;
    uniqueOpponents: number;
    averageMatchDuration: number;
  } {
    const opponentHistory = this.playerMatchHistory.get(playerId) || new Set();
    
    // Calculate from active and completed matches
    let totalMatches = 0;
    let totalDuration = 0;

    for (const [, match] of Array.from(this.activeMatches.entries())) {
      if (match.player1.id === playerId || match.player2.id === playerId) {
        totalMatches++;
        if (match.endTime && match.startTime) {
          totalDuration += match.endTime.getTime() - match.startTime.getTime();
        }
      }
    }

    return {
      totalMatches,
      uniqueOpponents: opponentHistory.size,
      averageMatchDuration: totalMatches > 0 ? totalDuration / totalMatches : 0
    };
  }

  /**
   * Validate match pairing
   */
  validateMatchPairing(pairing: MatchPairing, tournament: Tournament): boolean {
    const player1 = tournament.players.find(p => p.id === pairing.player1Id);
    const player2 = tournament.players.find(p => p.id === pairing.player2Id);

    if (!player1 || !player2) {
      return false;
    }

    // Check if players are eliminated
    if (player1.isEliminated || player2.isEliminated) {
      return false;
    }

    // Check if players are already in a match
    if (player1.status === PlayerStatus.IN_MATCH || 
        player2.status === PlayerStatus.IN_MATCH) {
      return false;
    }

    // Check if players are the same
    if (player1.id === player2.id) {
      return false;
    }

    return true;
  }

  /**
   * Clean up completed tournament matches
   */
  cleanupTournamentMatches(tournamentId: string): void {
    // Remove all matches for the tournament and cleanup sessions
    for (const [matchId, match] of Array.from(this.activeMatches.entries())) {
      if (match.tournamentId === tournamentId) {
        this.cleanupMatchSession(matchId);
        this.activeMatches.delete(matchId);
      }
    }

    // Clear match queue
    this.matchQueue.delete(tournamentId);
  }

  /**
   * Get match by ID
   */
  getMatch(matchId: string): ActiveMatch | null {
    return this.activeMatches.get(matchId) || null;
  }

  /**
   * Update player match history
   */
  private updatePlayerMatchHistory(player1Id: string, player2Id: string): void {
    // Update player1's history
    let player1History = this.playerMatchHistory.get(player1Id);
    if (!player1History) {
      player1History = new Set();
      this.playerMatchHistory.set(player1Id, player1History);
    }
    player1History.add(player2Id);

    // Update player2's history
    let player2History = this.playerMatchHistory.get(player2Id);
    if (!player2History) {
      player2History = new Set();
      this.playerMatchHistory.set(player2Id, player2History);
    }
    player2History.add(player1Id);
  }

  /**
   * Generate unique match ID
   */
  private generateMatchId(): string {
    return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get tournament match summary
   */
  getTournamentMatchSummary(tournamentId: string): {
    totalMatches: number;
    completedMatches: number;
    activeMatches: number;
    queuedMatches: number;
  } {
    const activeMatches = this.getActiveMatches(tournamentId);
    const queuedMatches = this.matchQueue.get(tournamentId) || [];
    
    // Note: We don't track completed matches in this service
    // That would be handled by the tournament engine or statistics engine
    
    return {
      totalMatches: activeMatches.length + queuedMatches.length,
      completedMatches: 0, // Would need to be provided by caller
      activeMatches: activeMatches.length,
      queuedMatches: queuedMatches.length
    };
  }

  /**
   * Process automatic match progression for tournament
   * Creates and starts matches from queue when players are available
   */
  processMatchProgression(tournamentId: string, tournament: Tournament, maxConcurrent: number = 4): ActiveMatch[] {
    const availablePairings = this.getNextAvailableMatches(tournamentId, tournament, maxConcurrent);
    const startedMatches: ActiveMatch[] = [];

    for (const pairing of availablePairings) {
      try {
        // Create the match
        const activeMatch = this.createMatch(pairing, tournamentId, tournament);
        
        // Start the match immediately
        const startedMatch = this.startMatch(activeMatch.id);
        startedMatches.push(startedMatch);

        console.log(`🎮 Started tournament match: ${activeMatch.player1.name} vs ${activeMatch.player2.name}`);
      } catch (error) {
        console.error(`❌ Failed to start match for pairing:`, pairing, error);
      }
    }

    return startedMatches;
  }

  /**
   * Check if a match is ready to be completed based on game session
   */
  checkMatchCompletion(matchId: string): MatchResult | null {
    const match = this.activeMatches.get(matchId);
    const gameSession = this.gameSessions.get(matchId);
    
    if (!match || !gameSession || match.status !== MatchStatus.IN_PROGRESS) {
      return null;
    }

    // Check if game session is complete
    if (gameSession.endTime) {
      return this.processGameSessionCompletion(matchId, gameSession);
    }

    return null;
  }

  /**
   * Get all matches that need completion processing
   */
  getMatchesReadyForCompletion(tournamentId: string): string[] {
    const readyMatches: string[] = [];
    
    for (const [matchId, match] of Array.from(this.activeMatches.entries())) {
      if (match.tournamentId === tournamentId && match.status === MatchStatus.IN_PROGRESS) {
        const gameSession = this.gameSessions.get(matchId);
        if (gameSession && gameSession.endTime) {
          readyMatches.push(matchId);
        }
      }
    }

    return readyMatches;
  }
}

export default MatchCoordinator;