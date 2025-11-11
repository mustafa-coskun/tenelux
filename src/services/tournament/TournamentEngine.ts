import {
  Tournament,
  TournamentStatus,
  TournamentPlayer,
  TournamentBracket,
  TournamentFormat,
  MatchResult,
  TournamentUpdate,
  TournamentUpdateType,
  TournamentRanking,
  PartyLobby,
  LobbyStatus,
  TournamentCreationRequest,
  TournamentError,
  ActiveMatch,
  MatchPairing,
  MatchStatus,
  PlayerStatus,
  RoundStatus
} from '../../types/party';
import { BracketGeneratorFactory } from './BracketGenerator';
import { TournamentStatisticsEngine } from './TournamentStatisticsEngine';
import { getTournamentSecurityService } from '../TournamentSecurityService';
import { tournamentPerformanceOptimizer } from '../TournamentPerformanceOptimizer';
import { tournamentCacheService } from '../TournamentCacheService';

/**
 * Core Tournament Engine
 * Manages tournament lifecycle, state tracking, and coordination
 */
export class TournamentEngine {
  private tournaments: Map<string, Tournament> = new Map();
  
  // Performance optimization helpers
  private adaptCachedBracket(template: any, players: TournamentPlayer[]): TournamentBracket {
    // Adapt cached bracket template to new players
    const bracket = { ...template };
    
    // Update player IDs in matches
    bracket.rounds.forEach((round: any) => {
      round.matches.forEach((match: any, index: number) => {
        if (index * 2 < players.length) {
          match.player1Id = players[index * 2].id;
        }
        if (index * 2 + 1 < players.length) {
          match.player2Id = players[index * 2 + 1].id;
        }
      });
    });
    
    return bracket;
  }
  
  private createBracketTemplate(bracket: TournamentBracket): any {
    // Create a template from bracket structure (without specific player IDs)
    return {
      rounds: bracket.rounds.map(round => ({
        roundNumber: round.roundNumber,
        matches: round.matches.map((match, index) => ({
          roundNumber: match.roundNumber,
          bracketPosition: index,
          status: 'template'
        })),
        status: round.status
      }))
    };
  }
  private statisticsEngine: TournamentStatisticsEngine;
  private securityService = getTournamentSecurityService();

  constructor() {
    this.statisticsEngine = new TournamentStatisticsEngine();
  }

  /**
   * Create a new tournament from a party lobby
   */
  async createTournament(lobby: PartyLobby): Promise<Tournament> {
    if (lobby.status !== LobbyStatus.READY_TO_START) {
      throw new Error(TournamentError.TOURNAMENT_NOT_FOUND);
    }

    if (lobby.participants.length < 4) {
      throw new Error('Insufficient players for tournament');
    }

    const tournamentId = this.generateTournamentId();
    
    // Initialize tournament players with proper statistics
    const tournamentPlayers = lobby.participants.map(participant => ({
      ...participant,
      statistics: {
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        totalPoints: 0,
        cooperationRate: 0,
        betrayalRate: 0,
        averageMatchScore: 0,
        headToHeadRecord: new Map(),
        tournamentPoints: 0
      },
      status: PlayerStatus.WAITING,
      isEliminated: false,
      currentRank: 0
    }));

    // Generate bracket using the appropriate generator
    const bracketGenerator = BracketGeneratorFactory.create(lobby.settings.tournamentFormat);
    const bracket = bracketGenerator.generateBracket(tournamentPlayers);

    // Calculate total rounds based on format and player count
    const totalRounds = this.calculateTotalRounds(
      lobby.settings.tournamentFormat, 
      tournamentPlayers.length
    );

    const tournament: Tournament = {
      id: tournamentId,
      lobbyId: lobby.id,
      format: lobby.settings.tournamentFormat,
      players: tournamentPlayers,
      bracket,
      currentRound: 0,
      totalRounds,
      status: TournamentStatus.NOT_STARTED,
      startTime: new Date()
    };

    // Validate tournament integrity before storing
    const integrityValidation = this.securityService.validateTournamentIntegrity(tournament);
    if (!integrityValidation.isValid) {
      throw new Error(`Tournament integrity validation failed: ${integrityValidation.errorMessage}`);
    }

    this.tournaments.set(tournamentId, tournament);
    return tournament;
  }

  /**
   * Start a tournament and begin the first round
   */
  async startTournament(tournamentId: string): Promise<TournamentUpdate> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error(TournamentError.TOURNAMENT_NOT_FOUND);
    }

    if (tournament.status !== TournamentStatus.NOT_STARTED) {
      throw new Error('Tournament already started or completed');
    }

    // Update tournament status
    tournament.status = TournamentStatus.IN_PROGRESS;
    tournament.currentRound = 1;

    // Start first round
    const firstRound = tournament.bracket.rounds[0];
    if (firstRound) {
      firstRound.status = RoundStatus.IN_PROGRESS;
      firstRound.startTime = new Date();
    }

    // Update player statuses
    tournament.players.forEach(player => {
      player.status = PlayerStatus.READY;
    });

    this.tournaments.set(tournamentId, tournament);

    return {
      type: TournamentUpdateType.TOURNAMENT_COMPLETED,
      tournamentId,
      data: { tournament, nextMatches: tournament.bracket.nextMatchPairings },
      timestamp: new Date()
    };
  }

  /**
   * Process a match result and advance the tournament
   */
  async processMatchResult(tournamentId: string, result: MatchResult, activeMatch: ActiveMatch): Promise<TournamentUpdate> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error(TournamentError.TOURNAMENT_NOT_FOUND);
    }

    if (tournament.status !== TournamentStatus.IN_PROGRESS) {
      throw new Error(TournamentError.TOURNAMENT_COMPLETED);
    }

    // Validate match result security and anti-cheat measures
    const securityValidation = this.securityService.validateMatchResult(result, tournament, activeMatch);
    if (!securityValidation.isValid) {
      throw new Error(`Match result security validation failed: ${securityValidation.errorMessage}`);
    }

    // Get the appropriate bracket generator
    const bracketGenerator = BracketGeneratorFactory.create(tournament.format);
    
    // Process the match result through the bracket
    const bracketUpdate = bracketGenerator.processMatchResult(result, tournament.bracket);
    
    // Update tournament bracket
    tournament.bracket = bracketUpdate.updatedBracket;

    // Update player statistics
    await this.updatePlayerStatistics(tournament, result);

    // Update eliminated players
    bracketUpdate.eliminatedPlayers.forEach(eliminatedPlayer => {
      const player = tournament.players.find(p => p.id === eliminatedPlayer.id);
      if (player) {
        player.isEliminated = true;
        player.status = PlayerStatus.ELIMINATED;
      }
    });

    // Check if round is complete and advance
    const roundAdvanced = this.checkAndAdvanceRound(tournament);
    
    // Check if tournament is complete
    if (bracketUpdate.isComplete) {
      tournament.status = TournamentStatus.COMPLETED;
      tournament.endTime = new Date();
      
      // Calculate final rankings
      const finalRankings = await this.calculateFinalRankings(tournament);
      
      return {
        type: TournamentUpdateType.TOURNAMENT_COMPLETED,
        tournamentId,
        data: { 
          tournament, 
          finalRankings,
          statistics: TournamentStatisticsEngine.calculateTournamentStatistics(tournament)
        },
        timestamp: new Date()
      };
    }

    // Update next match pairings
    tournament.bracket.nextMatchPairings = bracketUpdate.nextMatches;

    this.tournaments.set(tournamentId, tournament);

    const updateType = roundAdvanced 
      ? TournamentUpdateType.ROUND_ADVANCED 
      : TournamentUpdateType.MATCH_RESULT;

    return {
      type: updateType,
      tournamentId,
      data: { 
        tournament, 
        matchResult: result,
        nextMatches: bracketUpdate.nextMatches,
        eliminatedPlayers: bracketUpdate.eliminatedPlayers
      },
      timestamp: new Date()
    };
  }

  /**
   * Get current tournament status
   */
  getTournamentStatus(tournamentId: string): Tournament | null {
    return this.tournaments.get(tournamentId) || null;
  }

  /**
   * Get next matches that should be played
   */
  getNextMatches(tournamentId: string): MatchPairing[] {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return [];
    }

    const bracketGenerator = BracketGeneratorFactory.create(tournament.format);
    return bracketGenerator.getNextMatches(tournament.bracket);
  }

  /**
   * Create an active match from a pairing
   */
  createActiveMatch(tournamentId: string, pairing: MatchPairing): ActiveMatch {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error(TournamentError.TOURNAMENT_NOT_FOUND);
    }

    const player1 = tournament.players.find(p => p.id === pairing.player1Id);
    const player2 = tournament.players.find(p => p.id === pairing.player2Id);

    if (!player1 || !player2) {
      throw new Error(TournamentError.PLAYER_NOT_IN_TOURNAMENT);
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

    // Add to active matches
    tournament.bracket.activeMatches.set(matchId, activeMatch);
    
    // Update player statuses
    player1.status = PlayerStatus.IN_MATCH;
    player2.status = PlayerStatus.IN_MATCH;

    this.tournaments.set(tournamentId, tournament);
    return activeMatch;
  }

  /**
   * Update tournament tracking when match starts
   */
  onMatchStarted(tournamentId: string, matchId: string, gameSessionId: string): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return;

    const activeMatch = tournament.bracket.activeMatches.get(matchId);
    if (activeMatch) {
      activeMatch.status = MatchStatus.IN_PROGRESS;
      activeMatch.gameSessionId = gameSessionId;
      activeMatch.startTime = new Date();
    }

    this.tournaments.set(tournamentId, tournament);
  }

  /**
   * Calculate final tournament rankings
   */
  private async calculateFinalRankings(tournament: Tournament): Promise<TournamentRanking[]> {
    const statistics = TournamentStatisticsEngine.calculateTournamentStatistics(tournament);
    return statistics.playerRankings;
  }

  /**
   * Update player statistics after a match
   */
  private async updatePlayerStatistics(tournament: Tournament, result: MatchResult): Promise<void> {
    const player1 = tournament.players.find(p => p.id === result.player1Id);
    const player2 = tournament.players.find(p => p.id === result.player2Id);

    if (!player1 || !player2) return;

    // Update match counts
    player1.statistics.matchesPlayed++;
    player2.statistics.matchesPlayed++;

    // Update win/loss records
    if (result.winnerId === player1.id) {
      player1.statistics.matchesWon++;
      player2.statistics.matchesLost++;
    } else {
      player2.statistics.matchesWon++;
      player1.statistics.matchesLost++;
    }

    // Update points
    player1.statistics.totalPoints += result.player1Score;
    player2.statistics.totalPoints += result.player2Score;

    // Update cooperation/betrayal rates
    if (result.statistics) {
      const p1TotalActions = result.statistics.player1Cooperations + result.statistics.player1Betrayals;
      const p2TotalActions = result.statistics.player2Cooperations + result.statistics.player2Betrayals;

      if (p1TotalActions > 0) {
        player1.statistics.cooperationRate = 
          (player1.statistics.cooperationRate * (player1.statistics.matchesPlayed - 1) + 
           (result.statistics.player1Cooperations / p1TotalActions)) / player1.statistics.matchesPlayed;
        
        player1.statistics.betrayalRate = 1 - player1.statistics.cooperationRate;
      }

      if (p2TotalActions > 0) {
        player2.statistics.cooperationRate = 
          (player2.statistics.cooperationRate * (player2.statistics.matchesPlayed - 1) + 
           (result.statistics.player2Cooperations / p2TotalActions)) / player2.statistics.matchesPlayed;
        
        player2.statistics.betrayalRate = 1 - player2.statistics.cooperationRate;
      }
    }

    // Update average match scores
    player1.statistics.averageMatchScore = player1.statistics.totalPoints / player1.statistics.matchesPlayed;
    player2.statistics.averageMatchScore = player2.statistics.totalPoints / player2.statistics.matchesPlayed;

    // Update head-to-head records
    this.updateHeadToHeadStats(player1, player2, result);
    this.updateHeadToHeadStats(player2, player1, result);
  }

  /**
   * Update head-to-head statistics between two players
   */
  private updateHeadToHeadStats(player: TournamentPlayer, opponent: TournamentPlayer, result: MatchResult): void {
    let h2hStats = player.statistics.headToHeadRecord.get(opponent.id);
    
    if (!h2hStats) {
      h2hStats = {
        opponentId: opponent.id,
        opponentName: opponent.name,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        totalPointsScored: 0,
        totalPointsConceded: 0
      };
    }

    h2hStats.matchesPlayed++;
    
    if (result.winnerId === player.id) {
      h2hStats.wins++;
    } else {
      h2hStats.losses++;
    }

    // Update points scored/conceded
    if (player.id === result.player1Id) {
      h2hStats.totalPointsScored += result.player1Score;
      h2hStats.totalPointsConceded += result.player2Score;
    } else {
      h2hStats.totalPointsScored += result.player2Score;
      h2hStats.totalPointsConceded += result.player1Score;
    }

    player.statistics.headToHeadRecord.set(opponent.id, h2hStats);
  }

  /**
   * Check if current round is complete and advance to next round
   */
  private checkAndAdvanceRound(tournament: Tournament): boolean {
    const currentRound = tournament.bracket.rounds.find(r => r.roundNumber === tournament.currentRound);
    
    if (!currentRound) return false;

    // Check if all matches in current round are complete
    const allMatchesComplete = currentRound.matches.every(m => m.status === MatchStatus.COMPLETED);
    
    if (allMatchesComplete && currentRound.status !== RoundStatus.COMPLETED) {
      currentRound.status = RoundStatus.COMPLETED;
      currentRound.endTime = new Date();
      
      // Advance to next round if it exists
      const nextRound = tournament.bracket.rounds.find(r => r.roundNumber === tournament.currentRound + 1);
      if (nextRound) {
        tournament.currentRound++;
        nextRound.status = RoundStatus.IN_PROGRESS;
        nextRound.startTime = new Date();
        
        // Update player statuses for next round
        tournament.players.forEach(player => {
          if (!player.isEliminated) {
            player.status = PlayerStatus.READY;
          }
        });
        
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate total rounds needed for tournament format
   */
  private calculateTotalRounds(format: TournamentFormat, playerCount: number): number {
    switch (format) {
      case TournamentFormat.SINGLE_ELIMINATION:
        return Math.ceil(Math.log2(playerCount));
      
      case TournamentFormat.DOUBLE_ELIMINATION:
        // Double elimination needs more rounds for losers bracket
        return Math.ceil(Math.log2(playerCount)) * 2 - 1;
      
      case TournamentFormat.ROUND_ROBIN:
        // Round robin: each player plays everyone else
        const totalMatches = (playerCount * (playerCount - 1)) / 2;
        const maxConcurrentMatches = Math.floor(playerCount / 2);
        return Math.ceil(totalMatches / maxConcurrentMatches);
      
      default:
        return Math.ceil(Math.log2(playerCount));
    }
  }

  /**
   * Generate unique tournament ID
   */
  private generateTournamentId(): string {
    return `tournament_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique match ID
   */
  private generateMatchId(): string {
    return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all active tournaments
   */
  getActiveTournaments(): Tournament[] {
    return Array.from(this.tournaments.values()).filter(t => 
      t.status === TournamentStatus.IN_PROGRESS
    );
  }

  /**
   * Remove completed tournament from memory (for cleanup)
   */
  cleanupTournament(tournamentId: string): void {
    const tournament = this.tournaments.get(tournamentId);
    if (tournament && tournament.status === TournamentStatus.COMPLETED) {
      this.tournaments.delete(tournamentId);
    }
  }
}

export default TournamentEngine;