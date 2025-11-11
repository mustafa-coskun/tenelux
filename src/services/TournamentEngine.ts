/**
 * TournamentEngine Service
 * 
 * Handles all tournament bracket logic, match progression, and elimination mechanics.
 * Supports Single Elimination, Double Elimination, and Round Robin formats.
 */

import {
  Tournament,
  TournamentBracket,
  TournamentRound,
  TournamentMatch,
  TournamentPlayer,
  TournamentFormat,
  MatchResult,
  MatchPairing,
  MatchStatus,
  RoundStatus,
  PlayerStatus,
  TournamentRanking
} from '../types/party';

export interface BracketInitializationResult {
  bracket: TournamentBracket;
  firstRoundMatches: MatchPairing[];
}

export interface MatchCompletionResult {
  winnerId: string;
  loserId: string;
  eliminatedPlayers: TournamentPlayer[];
  nextMatches: MatchPairing[];
  isRoundComplete: boolean;
  isTournamentComplete: boolean;
  updatedBracket: TournamentBracket;
}

export class TournamentEngine {
  /**
   * Initialize tournament bracket based on format and players
   */
  initializeBracket(
    players: TournamentPlayer[],
    format: TournamentFormat,
    tournamentId: string
  ): BracketInitializationResult {
    console.log('🏆 TournamentEngine: Initializing bracket', {
      playerCount: players.length,
      format,
      tournamentId
    });

    // Shuffle players for fair matchmaking
    const shuffledPlayers = this.shufflePlayers([...players]);

    let bracket: TournamentBracket;
    let firstRoundMatches: MatchPairing[];

    switch (format) {
      case TournamentFormat.SINGLE_ELIMINATION:
        ({ bracket, firstRoundMatches } = this.initializeSingleElimination(
          shuffledPlayers,
          tournamentId
        ));
        break;

      case TournamentFormat.DOUBLE_ELIMINATION:
        ({ bracket, firstRoundMatches } = this.initializeDoubleElimination(
          shuffledPlayers,
          tournamentId
        ));
        break;

      case TournamentFormat.ROUND_ROBIN:
        ({ bracket, firstRoundMatches } = this.initializeRoundRobin(
          shuffledPlayers,
          tournamentId
        ));
        break;

      default:
        throw new Error(`Unsupported tournament format: ${format}`);
    }

    console.log('🏆 TournamentEngine: Bracket initialized', {
      rounds: bracket.rounds.length,
      firstRoundMatches: firstRoundMatches.length
    });

    return { bracket, firstRoundMatches };
  }

  /**
   * Process match result and advance tournament
   */
  processMatchResult(
    matchResult: MatchResult,
    tournament: Tournament
  ): MatchCompletionResult {
    console.log('🏆 TournamentEngine: Processing match result', {
      matchId: matchResult.matchId,
      winnerId: matchResult.winnerId,
      tournamentId: tournament.id
    });

    // Find the match in the bracket
    const { match, round } = this.findMatch(matchResult.matchId, tournament.bracket);

    if (!match) {
      throw new Error(`Match ${matchResult.matchId} not found in tournament bracket`);
    }

    // Update match with result
    match.status = MatchStatus.COMPLETED;
    match.result = matchResult;
    match.endTime = matchResult.completedAt;

    // Determine loser
    const loserId = matchResult.player1Id === matchResult.winnerId
      ? matchResult.player2Id
      : matchResult.player1Id;

    // Handle elimination based on format
    const eliminatedPlayers: TournamentPlayer[] = [];
    
    switch (tournament.format) {
      case TournamentFormat.SINGLE_ELIMINATION:
        // In single elimination, loser is immediately eliminated
        const loser = tournament.players.find(p => p.id === loserId);
        if (loser && !loser.isEliminated) {
          loser.isEliminated = true;
          loser.status = PlayerStatus.ELIMINATED;
          eliminatedPlayers.push(loser);
          tournament.bracket.eliminatedPlayers.push(loser);
        }
        break;

      case TournamentFormat.DOUBLE_ELIMINATION:
        // In double elimination, check if player has already lost once
        // (Implementation would track losses per player)
        break;

      case TournamentFormat.ROUND_ROBIN:
        // In round robin, no elimination
        break;
    }

    // Check if round is complete
    const isRoundComplete = this.isRoundComplete(round);

    // Generate next matches if round is complete
    let nextMatches: MatchPairing[] = [];
    if (isRoundComplete) {
      round.status = RoundStatus.COMPLETED;
      round.endTime = new Date();

      nextMatches = this.generateNextRoundMatches(tournament);

      // Add next round to bracket if there are more matches
      if (nextMatches.length > 0) {
        const nextRoundNumber = tournament.bracket.rounds.length;
        const nextRound: TournamentRound = {
          roundNumber: nextRoundNumber,
          matches: nextMatches.map((pairing, index) => ({
            id: `match_${tournament.id}_${nextRoundNumber}_${index}`,
            tournamentId: tournament.id,
            roundNumber: nextRoundNumber,
            player1Id: pairing.player1Id,
            player2Id: pairing.player2Id,
            status: MatchStatus.SCHEDULED,
            result: undefined,
            startTime: undefined,
            endTime: undefined
          })),
          status: RoundStatus.NOT_STARTED,
          startTime: new Date(),
          endTime: undefined
        };

        tournament.bracket.rounds.push(nextRound);
      }
    }

    // Check if tournament is complete
    const isTournamentComplete = this.isTournamentComplete(tournament);

    console.log('🏆 TournamentEngine: Match result processed', {
      winnerId: matchResult.winnerId,
      loserId,
      eliminatedCount: eliminatedPlayers.length,
      isRoundComplete,
      isTournamentComplete,
      nextMatchesCount: nextMatches.length
    });

    return {
      winnerId: matchResult.winnerId,
      loserId,
      eliminatedPlayers,
      nextMatches,
      isRoundComplete,
      isTournamentComplete,
      updatedBracket: tournament.bracket
    };
  }

  /**
   * Calculate final rankings based on tournament results
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
        tournamentPoints: player.statistics.tournamentPoints
      };

      rankings.push(ranking);
    }

    // Sort by wins, then by total points, then by cooperation rate
    rankings.sort((a, b) => {
      const aWins = a.player.statistics.matchesWon;
      const bWins = b.player.statistics.matchesWon;

      if (aWins !== bWins) {
        return bWins - aWins; // More wins = higher rank
      }

      if (a.finalScore !== b.finalScore) {
        return b.finalScore - a.finalScore; // More points = higher rank
      }

      return b.cooperationPercentage - a.cooperationPercentage; // More cooperation = higher rank
    });

    // Assign ranks
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1;
    });

    return rankings;
  }

  /**
   * Handle bye (when odd number of players)
   */
  private handleBye(players: TournamentPlayer[]): { players: TournamentPlayer[]; byePlayer: TournamentPlayer | null } {
    if (players.length % 2 === 0) {
      return { players, byePlayer: null };
    }

    // Give bye to lowest ranked player (last in array after shuffle)
    const byePlayer = players[players.length - 1];
    const remainingPlayers = players.slice(0, -1);

    console.log('🏆 TournamentEngine: Bye assigned to', byePlayer.name);

    return { players: remainingPlayers, byePlayer };
  }

  /**
   * Shuffle players array for fair matchmaking
   */
  private shufflePlayers(players: TournamentPlayer[]): TournamentPlayer[] {
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Initialize Single Elimination bracket
   */
  private initializeSingleElimination(
    players: TournamentPlayer[],
    tournamentId: string
  ): BracketInitializationResult {
    const { players: matchPlayers, byePlayer } = this.handleBye(players);

    const firstRoundMatches: MatchPairing[] = [];
    const matches: TournamentMatch[] = [];

    // Create first round matches
    for (let i = 0; i < matchPlayers.length; i += 2) {
      const player1 = matchPlayers[i];
      const player2 = matchPlayers[i + 1];

      const pairing: MatchPairing = {
        player1Id: player1.id,
        player2Id: player2.id,
        roundNumber: 0
      };

      firstRoundMatches.push(pairing);

      matches.push({
        id: `match_${tournamentId}_0_${i / 2}`,
        tournamentId,
        roundNumber: 0,
        player1Id: player1.id,
        player2Id: player2.id,
        status: MatchStatus.SCHEDULED,
        result: undefined,
        startTime: undefined,
        endTime: undefined
      });
    }

    // If there's a bye player, they automatically advance
    if (byePlayer) {
      console.log('🏆 TournamentEngine: Bye player advances automatically', byePlayer.name);
      // Bye player will be added to next round when it's generated
    }

    const firstRound: TournamentRound = {
      roundNumber: 0,
      matches,
      status: RoundStatus.NOT_STARTED,
      startTime: new Date(),
      endTime: undefined
    };

    const bracket: TournamentBracket = {
      rounds: [firstRound],
      eliminatedPlayers: [],
      activeMatches: new Map(),
      nextMatchPairings: []
    };

    return { bracket, firstRoundMatches };
  }

  /**
   * Initialize Double Elimination bracket
   */
  private initializeDoubleElimination(
    players: TournamentPlayer[],
    tournamentId: string
  ): BracketInitializationResult {
    // For now, use same logic as single elimination for winners bracket
    // TODO: Implement losers bracket tracking
    return this.initializeSingleElimination(players, tournamentId);
  }

  /**
   * Initialize Round Robin bracket
   */
  private initializeRoundRobin(
    players: TournamentPlayer[],
    tournamentId: string
  ): BracketInitializationResult {
    const firstRoundMatches: MatchPairing[] = [];
    const matches: TournamentMatch[] = [];

    // In round robin, generate all possible pairings for first round
    // Each player plays every other player once
    let matchIndex = 0;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const pairing: MatchPairing = {
          player1Id: players[i].id,
          player2Id: players[j].id,
          roundNumber: 0
        };

        // Only add first round matches (limit to reasonable number)
        if (matchIndex < players.length / 2) {
          firstRoundMatches.push(pairing);

          matches.push({
            id: `match_${tournamentId}_0_${matchIndex}`,
            tournamentId,
            roundNumber: 0,
            player1Id: players[i].id,
            player2Id: players[j].id,
            status: MatchStatus.SCHEDULED,
            result: undefined,
            startTime: undefined,
            endTime: undefined
          });
        }

        matchIndex++;
      }
    }

    const firstRound: TournamentRound = {
      roundNumber: 0,
      matches,
      status: RoundStatus.NOT_STARTED,
      startTime: new Date(),
      endTime: undefined
    };

    const bracket: TournamentBracket = {
      rounds: [firstRound],
      eliminatedPlayers: [],
      activeMatches: new Map(),
      nextMatchPairings: []
    };

    return { bracket, firstRoundMatches };
  }

  /**
   * Find match in bracket
   */
  private findMatch(
    matchId: string,
    bracket: TournamentBracket
  ): { match: TournamentMatch | null; round: TournamentRound | null } {
    for (const round of bracket.rounds) {
      const match = round.matches.find(m => m.id === matchId);
      if (match) {
        return { match, round };
      }
    }
    return { match: null, round: null };
  }

  /**
   * Check if round is complete
   */
  private isRoundComplete(round: TournamentRound): boolean {
    return round.matches.every(m => m.status === MatchStatus.COMPLETED);
  }

  /**
   * Check if tournament is complete
   */
  private isTournamentComplete(tournament: Tournament): boolean {
    const activePlayers = tournament.players.filter(p => !p.isEliminated);

    // Tournament is complete when only one player remains (for elimination formats)
    if (tournament.format === TournamentFormat.SINGLE_ELIMINATION ||
        tournament.format === TournamentFormat.DOUBLE_ELIMINATION) {
      return activePlayers.length === 1;
    }

    // For round robin, tournament is complete when all rounds are played
    if (tournament.format === TournamentFormat.ROUND_ROBIN) {
      return tournament.bracket.rounds.every(r => r.status === RoundStatus.COMPLETED);
    }

    return false;
  }

  /**
   * Generate next round matches based on current round winners
   */
  private generateNextRoundMatches(tournament: Tournament): MatchPairing[] {
    const currentRound = tournament.bracket.rounds[tournament.bracket.rounds.length - 1];
    
    if (!currentRound || currentRound.status !== RoundStatus.COMPLETED) {
      return [];
    }

    // Get winners from current round
    const winners: string[] = [];
    for (const match of currentRound.matches) {
      if (match.result && match.result.winnerId) {
        winners.push(match.result.winnerId);
      }
    }

    console.log('🏆 TournamentEngine: Generating next round', {
      currentRound: currentRound.roundNumber,
      winnersCount: winners.length
    });

    // If only one winner, tournament is complete
    if (winners.length <= 1) {
      return [];
    }

    // Create pairings for next round
    const nextMatches: MatchPairing[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) {
        nextMatches.push({
          player1Id: winners[i],
          player2Id: winners[i + 1],
          roundNumber: currentRound.roundNumber + 1
        });
      }
    }

    return nextMatches;
  }
}

// Singleton instance
let tournamentEngineInstance: TournamentEngine | null = null;

export function getTournamentEngine(): TournamentEngine {
  if (!tournamentEngineInstance) {
    tournamentEngineInstance = new TournamentEngine();
  }
  return tournamentEngineInstance;
}
