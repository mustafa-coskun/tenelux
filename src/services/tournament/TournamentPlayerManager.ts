import {
  TournamentPlayer,
  TournamentPlayerStats,
  HeadToHeadStats,
  PlayerStatus,
  MatchResult,
  MatchStatistics
} from '../../types/party';

/**
 * Tournament Player Manager
 * Handles player statistics, rankings, and performance tracking
 */
export class TournamentPlayerManager {
  /**
   * Create a new tournament player from basic player info
   */
  static createTournamentPlayer(
    id: string,
    name: string,
    isHost: boolean = false,
    avatar?: string
  ): TournamentPlayer {
    return {
      id,
      name,
      avatar,
      isHost,
      isEliminated: false,
      currentRank: 0,
      statistics: this.createEmptyStats(),
      status: PlayerStatus.WAITING,
      joinedAt: new Date()
    };
  }

  /**
   * Create empty statistics for a new player
   */
  private static createEmptyStats(): TournamentPlayerStats {
    return {
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      totalPoints: 0,
      cooperationRate: 0,
      betrayalRate: 0,
      averageMatchScore: 0,
      headToHeadRecord: new Map(),
      tournamentPoints: 0
    };
  }

  /**
   * Update player statistics after a match
   */
  static updatePlayerStats(
    player: TournamentPlayer,
    matchResult: MatchResult,
    opponentId: string,
    opponentName: string
  ): TournamentPlayer {
    const updatedPlayer = { ...player };
    const stats = { ...updatedPlayer.statistics };
    
    // Determine if this player won or lost
    const isWinner = matchResult.winnerId === player.id;
    const playerScore = matchResult.player1Id === player.id 
      ? matchResult.player1Score 
      : matchResult.player2Score;
    const opponentScore = matchResult.player1Id === player.id 
      ? matchResult.player2Score 
      : matchResult.player1Score;

    // Update basic match statistics
    stats.matchesPlayed++;
    if (isWinner) {
      stats.matchesWon++;
    } else {
      stats.matchesLost++;
    }

    // Update points and averages
    stats.totalPoints += playerScore;
    stats.averageMatchScore = stats.totalPoints / stats.matchesPlayed;

    // Update cooperation/betrayal rates
    this.updateCooperationStats(stats, matchResult, player.id);

    // Update head-to-head record
    this.updateHeadToHeadRecord(stats, opponentId, opponentName, isWinner, playerScore, opponentScore);

    // Calculate tournament points based on performance
    stats.tournamentPoints += this.calculateMatchPoints(isWinner, playerScore, opponentScore);

    updatedPlayer.statistics = stats;
    return updatedPlayer;
  }

  /**
   * Update cooperation and betrayal statistics
   */
  private static updateCooperationStats(
    stats: TournamentPlayerStats,
    matchResult: MatchResult,
    playerId: string
  ): void {
    const matchStats = matchResult.statistics;
    const isPlayer1 = matchResult.player1Id === playerId;
    
    const cooperations = isPlayer1 ? matchStats.player1Cooperations : matchStats.player2Cooperations;
    const betrayals = isPlayer1 ? matchStats.player1Betrayals : matchStats.player2Betrayals;
    const totalDecisions = cooperations + betrayals;

    if (totalDecisions > 0) {
      // Calculate weighted average with previous matches
      const totalPreviousDecisions = (stats.cooperationRate + stats.betrayalRate) * (stats.matchesPlayed - 1);
      const totalDecisionsNow = totalPreviousDecisions + totalDecisions;
      
      if (totalDecisionsNow > 0) {
        const totalCooperations = (stats.cooperationRate * (stats.matchesPlayed - 1)) + (cooperations / totalDecisions);
        const totalBetrayals = (stats.betrayalRate * (stats.matchesPlayed - 1)) + (betrayals / totalDecisions);
        
        stats.cooperationRate = totalCooperations / stats.matchesPlayed;
        stats.betrayalRate = totalBetrayals / stats.matchesPlayed;
      }
    }
  }

  /**
   * Update head-to-head record against specific opponent
   */
  private static updateHeadToHeadRecord(
    stats: TournamentPlayerStats,
    opponentId: string,
    opponentName: string,
    isWinner: boolean,
    playerScore: number,
    opponentScore: number
  ): void {
    let headToHead = stats.headToHeadRecord.get(opponentId);
    
    if (!headToHead) {
      headToHead = {
        opponentId,
        opponentName,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        totalPointsScored: 0,
        totalPointsConceded: 0
      };
    }

    headToHead.matchesPlayed++;
    headToHead.totalPointsScored += playerScore;
    headToHead.totalPointsConceded += opponentScore;

    if (isWinner) {
      headToHead.wins++;
    } else {
      headToHead.losses++;
    }

    stats.headToHeadRecord.set(opponentId, headToHead);
  }

  /**
   * Calculate tournament points for a match result
   */
  private static calculateMatchPoints(isWinner: boolean, playerScore: number, opponentScore: number): number {
    let points = 0;
    
    // Base points for winning/losing
    points += isWinner ? 3 : 1;
    
    // Bonus points for score differential
    const scoreDiff = Math.abs(playerScore - opponentScore);
    if (scoreDiff >= 10) {
      points += isWinner ? 2 : 0;
    } else if (scoreDiff >= 5) {
      points += isWinner ? 1 : 0;
    }
    
    // Bonus for high individual score
    if (playerScore >= 30) {
      points += 1;
    }

    return points;
  }

  /**
   * Calculate current tournament rankings
   */
  static calculateRankings(players: TournamentPlayer[]): TournamentPlayer[] {
    const rankedPlayers = [...players].sort((a, b) => {
      // Primary sort: Tournament points
      if (a.statistics.tournamentPoints !== b.statistics.tournamentPoints) {
        return b.statistics.tournamentPoints - a.statistics.tournamentPoints;
      }
      
      // Secondary sort: Win percentage
      const aWinRate = a.statistics.matchesPlayed > 0 
        ? a.statistics.matchesWon / a.statistics.matchesPlayed 
        : 0;
      const bWinRate = b.statistics.matchesPlayed > 0 
        ? b.statistics.matchesWon / b.statistics.matchesPlayed 
        : 0;
      
      if (aWinRate !== bWinRate) {
        return bWinRate - aWinRate;
      }
      
      // Tertiary sort: Average match score
      if (a.statistics.averageMatchScore !== b.statistics.averageMatchScore) {
        return b.statistics.averageMatchScore - a.statistics.averageMatchScore;
      }
      
      // Final sort: Total points
      return b.statistics.totalPoints - a.statistics.totalPoints;
    });

    // Update rank positions
    rankedPlayers.forEach((player, index) => {
      player.currentRank = index + 1;
    });

    return rankedPlayers;
  }

  /**
   * Get player's head-to-head record against specific opponent
   */
  static getHeadToHeadRecord(player: TournamentPlayer, opponentId: string): HeadToHeadStats | null {
    return player.statistics.headToHeadRecord.get(opponentId) || null;
  }

  /**
   * Get player's win rate
   */
  static getWinRate(player: TournamentPlayer): number {
    if (player.statistics.matchesPlayed === 0) return 0;
    return player.statistics.matchesWon / player.statistics.matchesPlayed;
  }

  /**
   * Get player's cooperation rate
   */
  static getCooperationRate(player: TournamentPlayer): number {
    return player.statistics.cooperationRate;
  }

  /**
   * Check if player is eliminated
   */
  static isEliminated(player: TournamentPlayer): boolean {
    return player.isEliminated || player.status === PlayerStatus.ELIMINATED;
  }

  /**
   * Eliminate player from tournament
   */
  static eliminatePlayer(player: TournamentPlayer): TournamentPlayer {
    return {
      ...player,
      isEliminated: true,
      status: PlayerStatus.ELIMINATED
    };
  }

  /**
   * Set player status
   */
  static setPlayerStatus(player: TournamentPlayer, status: PlayerStatus): TournamentPlayer {
    return {
      ...player,
      status
    };
  }

  /**
   * Get player summary for display
   */
  static getPlayerSummary(player: TournamentPlayer): {
    name: string;
    rank: number;
    record: string;
    points: number;
    winRate: number;
    cooperationRate: number;
    status: PlayerStatus;
  } {
    const winRate = this.getWinRate(player);
    const record = `${player.statistics.matchesWon}-${player.statistics.matchesLost}`;
    
    return {
      name: player.name,
      rank: player.currentRank,
      record,
      points: player.statistics.tournamentPoints,
      winRate: Math.round(winRate * 100),
      cooperationRate: Math.round(player.statistics.cooperationRate * 100),
      status: player.status
    };
  }

  /**
   * Reset player statistics (for new tournament)
   */
  static resetPlayerStats(player: TournamentPlayer): TournamentPlayer {
    return {
      ...player,
      isEliminated: false,
      currentRank: 0,
      statistics: this.createEmptyStats(),
      status: PlayerStatus.WAITING
    };
  }

  /**
   * Clone player for tournament use
   */
  static clonePlayer(player: TournamentPlayer): TournamentPlayer {
    return {
      ...player,
      statistics: {
        ...player.statistics,
        headToHeadRecord: new Map(player.statistics.headToHeadRecord)
      }
    };
  }
}

export default TournamentPlayerManager;