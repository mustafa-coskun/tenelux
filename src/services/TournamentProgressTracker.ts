/**
 * TournamentProgressTracker Service
 * 
 * Tracks tournament progress, handles match completion, round transitions,
 * and calculates final rankings.
 */

import {
  Tournament,
  TournamentBracket,
  TournamentRound,
  TournamentMatch,
  TournamentPlayer,
  TournamentRanking,
  MatchResult,
  MatchStatus,
  RoundStatus,
  TournamentStatus,
  PlayerStatus
} from '../types/party';

export interface TournamentProgress {
  tournamentId: string;
  currentRound: number;
  totalRounds: number;
  completedMatches: string[];
  activeMatches: string[];
  pendingMatches: string[];
  eliminatedPlayers: string[];
  activePlayers: string[];
  isComplete: boolean;
  winner?: TournamentPlayer;
}

export interface RoundTransitionResult {
  success: boolean;
  nextRound: number;
  nextMatches: TournamentMatch[];
  message: string;
}

export class TournamentProgressTracker {
  /**
   * Get current tournament progress
   */
  getTournamentProgress(tournament: Tournament): TournamentProgress {
    const completedMatches: string[] = [];
    const activeMatches: string[] = [];
    const pendingMatches: string[] = [];

    // Analyze all matches across all rounds
    for (const round of tournament.bracket.rounds) {
      for (const match of round.matches) {
        if (match.status === MatchStatus.COMPLETED) {
          completedMatches.push(match.id);
        } else if (match.status === MatchStatus.IN_PROGRESS) {
          activeMatches.push(match.id);
        } else if (match.status === MatchStatus.SCHEDULED) {
          pendingMatches.push(match.id);
        }
      }
    }

    const eliminatedPlayers = tournament.bracket.eliminatedPlayers.map(p => p.id);
    const activePlayers = tournament.players
      .filter(p => !p.isEliminated)
      .map(p => p.id);

    const isComplete = tournament.status === TournamentStatus.COMPLETED ||
      activePlayers.length === 1;

    const winner = isComplete && activePlayers.length === 1
      ? tournament.players.find(p => p.id === activePlayers[0])
      : undefined;

    return {
      tournamentId: tournament.id,
      currentRound: tournament.currentRound,
      totalRounds: tournament.totalRounds,
      completedMatches,
      activeMatches,
      pendingMatches,
      eliminatedPlayers,
      activePlayers,
      isComplete,
      winner
    };
  }

  /**
   * Handle match completion and update tournament state
   */
  handleMatchCompletion(
    matchResult: MatchResult,
    tournament: Tournament
  ): boolean {
    console.log('📊 TournamentProgressTracker: Handling match completion', {
      matchId: matchResult.matchId,
      winnerId: matchResult.winnerId
    });

    // Find the match in the bracket
    let targetMatch: TournamentMatch | null = null;
    let targetRound: TournamentRound | null = null;

    for (const round of tournament.bracket.rounds) {
      const match = round.matches.find(m => m.id === matchResult.matchId);
      if (match) {
        targetMatch = match;
        targetRound = round;
        break;
      }
    }

    if (!targetMatch || !targetRound) {
      console.error('❌ Match not found in tournament bracket:', matchResult.matchId);
      return false;
    }

    // Update match status
    targetMatch.status = MatchStatus.COMPLETED;
    targetMatch.result = matchResult;
    targetMatch.endTime = matchResult.completedAt;

    // Update player statistics
    this.updatePlayerStatistics(matchResult, tournament);

    // Check if round is complete
    if (this.isRoundComplete(targetRound)) {
      targetRound.status = RoundStatus.COMPLETED;
      targetRound.endTime = new Date();
      
      console.log('📊 Round completed:', targetRound.roundNumber);
    }

    return true;
  }

  /**
   * Transition to next round
   */
  transitionToNextRound(tournament: Tournament): RoundTransitionResult {
    const currentRound = tournament.bracket.rounds[tournament.currentRound];

    if (!currentRound) {
      return {
        success: false,
        nextRound: tournament.currentRound,
        nextMatches: [],
        message: 'Current round not found'
      };
    }

    if (!this.isRoundComplete(currentRound)) {
      return {
        success: false,
        nextRound: tournament.currentRound,
        nextMatches: [],
        message: 'Current round is not complete'
      };
    }

    // Get winners from current round
    const winners = this.getRoundWinners(currentRound, tournament);

    console.log('📊 Round winners:', winners.map(w => w.name));

    // Check if tournament is complete
    if (winners.length === 1) {
      tournament.status = TournamentStatus.COMPLETED;
      tournament.endTime = new Date();

      return {
        success: true,
        nextRound: tournament.currentRound,
        nextMatches: [],
        message: `Tournament complete! Winner: ${winners[0].name}`
      };
    }

    // Create next round matches
    const nextRoundNumber = tournament.currentRound + 1;
    const nextMatches: TournamentMatch[] = [];

    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) {
        const match: TournamentMatch = {
          id: `match_${tournament.id}_${nextRoundNumber}_${Math.floor(i / 2)}`,
          tournamentId: tournament.id,
          roundNumber: nextRoundNumber,
          player1Id: winners[i].id,
          player2Id: winners[i + 1].id,
          status: MatchStatus.SCHEDULED,
          result: undefined,
          startTime: undefined,
          endTime: undefined
        };
        nextMatches.push(match);
      }
    }

    // Add next round to bracket
    const nextRound: TournamentRound = {
      roundNumber: nextRoundNumber,
      matches: nextMatches,
      status: RoundStatus.NOT_STARTED,
      startTime: new Date(),
      endTime: undefined
    };

    tournament.bracket.rounds.push(nextRound);
    tournament.currentRound = nextRoundNumber;

    return {
      success: true,
      nextRound: nextRoundNumber,
      nextMatches,
      message: `Round ${nextRoundNumber} started with ${nextMatches.length} matches`
    };
  }

  /**
   * Calculate final rankings
   */
  calculateFinalRankings(tournament: Tournament): TournamentRanking[] {
    const rankings: TournamentRanking[] = [];

    for (const player of tournament.players) {
      const matchesPlayed = player.statistics.matchesPlayed;
      const matchesWon = player.statistics.matchesWon;
      const matchesLost = player.statistics.matchesLost;

      const ranking: TournamentRanking = {
        rank: 0, // Will be set after sorting
        player,
        finalScore: player.statistics.totalPoints,
        matchRecord: `${matchesWon}-${matchesLost}`,
        cooperationPercentage: player.statistics.cooperationRate,
        averagePointsPerMatch: matchesPlayed > 0
          ? player.statistics.totalPoints / matchesPlayed
          : 0,
        tournamentPoints: this.calculateTournamentPoints(player, tournament)
      };

      rankings.push(ranking);
    }

    // Sort rankings
    rankings.sort((a, b) => {
      // First by wins
      const aWins = a.player.statistics.matchesWon;
      const bWins = b.player.statistics.matchesWon;
      if (aWins !== bWins) {
        return bWins - aWins;
      }

      // Then by total points
      if (a.finalScore !== b.finalScore) {
        return b.finalScore - a.finalScore;
      }

      // Then by cooperation rate
      return b.cooperationPercentage - a.cooperationPercentage;
    });

    // Assign ranks
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1;
      ranking.player.currentRank = index + 1;
    });

    return rankings;
  }

  /**
   * Check if round is complete
   */
  private isRoundComplete(round: TournamentRound): boolean {
    return round.matches.every(m => m.status === MatchStatus.COMPLETED);
  }

  /**
   * Get winners from a completed round
   */
  private getRoundWinners(
    round: TournamentRound,
    tournament: Tournament
  ): TournamentPlayer[] {
    const winners: TournamentPlayer[] = [];

    for (const match of round.matches) {
      if (match.result && match.result.winnerId) {
        const winner = tournament.players.find(p => p.id === match.result!.winnerId);
        if (winner) {
          winners.push(winner);
        }
      }
    }

    return winners;
  }

  /**
   * Update player statistics based on match result
   */
  private updatePlayerStatistics(
    matchResult: MatchResult,
    tournament: Tournament
  ): void {
    const player1 = tournament.players.find(p => p.id === matchResult.player1Id);
    const player2 = tournament.players.find(p => p.id === matchResult.player2Id);

    if (!player1 || !player2) {
      console.error('❌ Players not found for match result');
      return;
    }

    // Update matches played
    player1.statistics.matchesPlayed++;
    player2.statistics.matchesPlayed++;

    // Update wins/losses
    if (matchResult.winnerId === player1.id) {
      player1.statistics.matchesWon++;
      player2.statistics.matchesLost++;
    } else if (matchResult.winnerId === player2.id) {
      player2.statistics.matchesWon++;
      player1.statistics.matchesLost++;
    }

    // Update total points
    player1.statistics.totalPoints += matchResult.player1Score;
    player2.statistics.totalPoints += matchResult.player2Score;

    // Update cooperation/betrayal rates from match statistics
    if (matchResult.statistics) {
      const p1TotalDecisions = matchResult.statistics.player1Cooperations + 
                               matchResult.statistics.player1Betrayals;
      const p2TotalDecisions = matchResult.statistics.player2Cooperations + 
                               matchResult.statistics.player2Betrayals;

      if (p1TotalDecisions > 0) {
        const p1CoopRate = (matchResult.statistics.player1Cooperations / p1TotalDecisions) * 100;
        player1.statistics.cooperationRate = 
          (player1.statistics.cooperationRate * (player1.statistics.matchesPlayed - 1) + p1CoopRate) / 
          player1.statistics.matchesPlayed;
        player1.statistics.betrayalRate = 100 - player1.statistics.cooperationRate;
      }

      if (p2TotalDecisions > 0) {
        const p2CoopRate = (matchResult.statistics.player2Cooperations / p2TotalDecisions) * 100;
        player2.statistics.cooperationRate = 
          (player2.statistics.cooperationRate * (player2.statistics.matchesPlayed - 1) + p2CoopRate) / 
          player2.statistics.matchesPlayed;
        player2.statistics.betrayalRate = 100 - player2.statistics.cooperationRate;
      }
    }

    // Update average match score
    player1.statistics.averageMatchScore = 
      player1.statistics.totalPoints / player1.statistics.matchesPlayed;
    player2.statistics.averageMatchScore = 
      player2.statistics.totalPoints / player2.statistics.matchesPlayed;
  }

  /**
   * Calculate tournament points based on placement
   */
  private calculateTournamentPoints(
    player: TournamentPlayer,
    tournament: Tournament
  ): number {
    // Points based on wins
    const winPoints = player.statistics.matchesWon * 10;

    // Bonus points for not being eliminated
    const survivalBonus = player.isEliminated ? 0 : 50;

    // Bonus points for cooperation
    const cooperationBonus = Math.floor(player.statistics.cooperationRate / 10);

    return winPoints + survivalBonus + cooperationBonus;
  }
}

// Singleton instance
let progressTrackerInstance: TournamentProgressTracker | null = null;

export function getTournamentProgressTracker(): TournamentProgressTracker {
  if (!progressTrackerInstance) {
    progressTrackerInstance = new TournamentProgressTracker();
  }
  return progressTrackerInstance;
}
