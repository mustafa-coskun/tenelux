import {
  Tournament,
  TournamentPlayer,
  TournamentRanking,
  TournamentStatistics,
  MatchResult
} from '../../types/party';
import { TournamentStatisticsEngine } from './TournamentStatisticsEngine';
import { TournamentPlayerManager } from './TournamentPlayerManager';

/**
 * Tournament Leaderboard Service
 * Manages real-time ranking calculations and leaderboard updates
 */
export class TournamentLeaderboardService {
  private static leaderboardCache = new Map<string, TournamentRanking[]>();
  private static lastUpdateTime = new Map<string, number>();

  /**
   * Get current tournament leaderboard with real-time rankings
   */
  static getCurrentLeaderboard(tournament: Tournament): TournamentRanking[] {
    const cacheKey = tournament.id;
    const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
    const now = Date.now();

    // Use cache if updated within last 5 seconds
    if (now - lastUpdate < 5000 && this.leaderboardCache.has(cacheKey)) {
      return this.leaderboardCache.get(cacheKey)!;
    }

    const rankings = this.calculateRealTimeRankings(tournament);
    this.leaderboardCache.set(cacheKey, rankings);
    this.lastUpdateTime.set(cacheKey, now);

    return rankings;
  }

  /**
   * Calculate real-time rankings based on current tournament state
   */
  private static calculateRealTimeRankings(tournament: Tournament): TournamentRanking[] {
    // Update player rankings first
    const rankedPlayers = TournamentPlayerManager.calculateRankings(tournament.players);
    
    return rankedPlayers.map(player => ({
      rank: player.currentRank,
      player,
      finalScore: player.statistics.totalPoints,
      matchRecord: `${player.statistics.matchesWon}-${player.statistics.matchesLost}`,
      cooperationPercentage: Math.round(player.statistics.cooperationRate * 100),
      averagePointsPerMatch: Math.round(player.statistics.averageMatchScore * 10) / 10,
      tournamentPoints: player.statistics.tournamentPoints
    }));
  }

  /**
   * Update leaderboard after match completion
   */
  static updateLeaderboardAfterMatch(
    tournament: Tournament,
    matchResult: MatchResult
  ): {
    updatedRankings: TournamentRanking[];
    rankingChanges: {
      playerId: string;
      playerName: string;
      oldRank: number;
      newRank: number;
      change: number;
    }[];
  } {
    const oldRankings = this.getCurrentLeaderboard(tournament);
    const oldRankMap = new Map(oldRankings.map(r => [r.player.id, r.rank]));

    // Clear cache to force recalculation
    this.leaderboardCache.delete(tournament.id);
    
    const newRankings = this.getCurrentLeaderboard(tournament);
    const rankingChanges: any[] = [];

    newRankings.forEach(ranking => {
      const oldRank = oldRankMap.get(ranking.player.id) || ranking.rank;
      const newRank = ranking.rank;
      const change = oldRank - newRank; // Positive means moved up

      if (change !== 0) {
        rankingChanges.push({
          playerId: ranking.player.id,
          playerName: ranking.player.name,
          oldRank,
          newRank,
          change
        });
      }
    });

    return {
      updatedRankings: newRankings,
      rankingChanges
    };
  }

  /**
   * Get leaderboard with additional context and insights
   */
  static getEnhancedLeaderboard(tournament: Tournament): {
    rankings: TournamentRanking[];
    insights: {
      tightRaces: { rank: number; players: string[]; pointDifference: number }[];
      breakawayLeaders: { playerId: string; playerName: string; leadMargin: number }[];
      risingStars: { playerId: string; playerName: string; momentum: number }[];
    };
    projections: {
      playerId: string;
      playerName: string;
      projectedFinalRank: number;
      confidence: number;
    }[];
  } {
    const rankings = this.getCurrentLeaderboard(tournament);
    
    // Analyze tight races (players within 5 tournament points)
    const tightRaces: any[] = [];
    for (let i = 0; i < rankings.length - 1; i++) {
      const current = rankings[i];
      const next = rankings[i + 1];
      const pointDiff = current.tournamentPoints - next.tournamentPoints;
      
      if (pointDiff <= 5) {
        const existingRace = tightRaces.find(race => 
          race.rank === current.rank || race.rank === next.rank
        );
        
        if (existingRace) {
          if (!existingRace.players.includes(next.player.name)) {
            existingRace.players.push(next.player.name);
          }
          existingRace.pointDifference = Math.min(existingRace.pointDifference, pointDiff);
        } else {
          tightRaces.push({
            rank: current.rank,
            players: [current.player.name, next.player.name],
            pointDifference: pointDiff
          });
        }
      }
    }

    // Find breakaway leaders (significant lead over next player)
    const breakawayLeaders: any[] = [];
    if (rankings.length > 1) {
      const leader = rankings[0];
      const secondPlace = rankings[1];
      const leadMargin = leader.tournamentPoints - secondPlace.tournamentPoints;
      
      if (leadMargin >= 10) {
        breakawayLeaders.push({
          playerId: leader.player.id,
          playerName: leader.player.name,
          leadMargin
        });
      }
    }

    // Calculate rising stars (players with strong recent performance)
    const risingStars = this.calculateRisingStars(tournament, rankings);

    // Project final rankings
    const projections = this.projectFinalRankings(tournament, rankings);

    return {
      rankings,
      insights: {
        tightRaces,
        breakawayLeaders,
        risingStars
      },
      projections
    };
  }

  /**
   * Calculate players with strong momentum
   */
  private static calculateRisingStars(
    tournament: Tournament,
    rankings: TournamentRanking[]
  ): { playerId: string; playerName: string; momentum: number }[] {
    return rankings
      .filter(ranking => ranking.player.statistics.matchesPlayed >= 2)
      .map(ranking => {
        const player = ranking.player;
        const stats = player.statistics;
        
        // Calculate momentum based on recent performance indicators
        const winRate = stats.matchesWon / stats.matchesPlayed;
        const avgScore = stats.averageMatchScore;
        const tournamentPointsPerMatch = stats.tournamentPoints / stats.matchesPlayed;
        
        // Weighted momentum score
        const momentum = (winRate * 40) + (avgScore * 1.5) + (tournamentPointsPerMatch * 10);
        
        return {
          playerId: player.id,
          playerName: player.name,
          momentum: Math.round(momentum)
        };
      })
      .filter(star => star.momentum > 50) // Only include high-momentum players
      .sort((a, b) => b.momentum - a.momentum)
      .slice(0, 3);
  }

  /**
   * Project final tournament rankings
   */
  private static projectFinalRankings(
    tournament: Tournament,
    currentRankings: TournamentRanking[]
  ): { playerId: string; playerName: string; projectedFinalRank: number; confidence: number }[] {
    return currentRankings.map(ranking => {
      const player = ranking.player;
      const stats = player.statistics;
      
      // Simple projection based on current performance
      let projectedRank = ranking.rank;
      let confidence = 50; // Base confidence
      
      if (stats.matchesPlayed >= 3) {
        const winRate = stats.matchesWon / stats.matchesPlayed;
        const avgPointsPerMatch = stats.tournamentPoints / stats.matchesPlayed;
        
        // Adjust projection based on performance trends
        if (winRate > 0.7 && avgPointsPerMatch > 3) {
          projectedRank = Math.max(1, projectedRank - 1);
          confidence = 75;
        } else if (winRate < 0.3 && avgPointsPerMatch < 2) {
          projectedRank = Math.min(tournament.players.length, projectedRank + 1);
          confidence = 70;
        } else {
          confidence = 60;
        }
      }
      
      return {
        playerId: player.id,
        playerName: player.name,
        projectedFinalRank: projectedRank,
        confidence
      };
    });
  }

  /**
   * Get leaderboard changes over time
   */
  static getLeaderboardHistory(tournamentId: string): {
    timestamp: Date;
    rankings: { playerId: string; rank: number; points: number }[];
  }[] {
    // In a full implementation, this would retrieve historical data
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Generate leaderboard summary for display
   */
  static generateLeaderboardSummary(tournament: Tournament): {
    totalPlayers: number;
    matchesCompleted: number;
    currentLeader: {
      name: string;
      points: number;
      record: string;
    } | null;
    closestRace: {
      positions: string;
      pointDifference: number;
    } | null;
    averageScore: number;
  } {
    const rankings = this.getCurrentLeaderboard(tournament);
    const stats = TournamentStatisticsEngine.calculateTournamentStatistics(tournament);
    
    const currentLeader = rankings.length > 0 ? {
      name: rankings[0].player.name,
      points: rankings[0].tournamentPoints,
      record: rankings[0].matchRecord
    } : null;

    // Find closest race
    let closestRace: any = null;
    for (let i = 0; i < rankings.length - 1; i++) {
      const pointDiff = rankings[i].tournamentPoints - rankings[i + 1].tournamentPoints;
      if (pointDiff <= 3 && (!closestRace || pointDiff < closestRace.pointDifference)) {
        closestRace = {
          positions: `${rankings[i].rank}-${rankings[i + 1].rank}`,
          pointDifference: pointDiff
        };
      }
    }

    const totalMatchesCompleted = tournament.players.reduce(
      (sum, player) => sum + player.statistics.matchesPlayed, 0
    ) / 2; // Divide by 2 since each match involves 2 players

    const averageScore = tournament.players.length > 0
      ? tournament.players.reduce((sum, player) => sum + player.statistics.averageMatchScore, 0) / tournament.players.length
      : 0;

    return {
      totalPlayers: tournament.players.length,
      matchesCompleted: totalMatchesCompleted,
      currentLeader,
      closestRace,
      averageScore: Math.round(averageScore * 10) / 10
    };
  }

  /**
   * Clear leaderboard cache for tournament
   */
  static clearCache(tournamentId: string): void {
    this.leaderboardCache.delete(tournamentId);
    this.lastUpdateTime.delete(tournamentId);
  }

  /**
   * Get player's current position and nearby competitors
   */
  static getPlayerPosition(tournament: Tournament, playerId: string): {
    currentRank: number;
    totalPlayers: number;
    pointsToNext: number | null;
    pointsFromPrevious: number | null;
    nearbyCompetitors: {
      rank: number;
      name: string;
      points: number;
      pointDifference: number;
    }[];
  } | null {
    const rankings = this.getCurrentLeaderboard(tournament);
    const playerRanking = rankings.find(r => r.player.id === playerId);
    
    if (!playerRanking) return null;

    const currentRank = playerRanking.rank;
    const playerPoints = playerRanking.tournamentPoints;
    
    // Find points to next rank (higher position)
    const nextRanking = rankings.find(r => r.rank === currentRank - 1);
    const pointsToNext = nextRanking ? nextRanking.tournamentPoints - playerPoints : null;
    
    // Find points from previous rank (lower position)
    const previousRanking = rankings.find(r => r.rank === currentRank + 1);
    const pointsFromPrevious = previousRanking ? playerPoints - previousRanking.tournamentPoints : null;

    // Get nearby competitors (±2 ranks)
    const nearbyCompetitors = rankings
      .filter(r => Math.abs(r.rank - currentRank) <= 2 && r.player.id !== playerId)
      .map(r => ({
        rank: r.rank,
        name: r.player.name,
        points: r.tournamentPoints,
        pointDifference: r.tournamentPoints - playerPoints
      }))
      .sort((a, b) => a.rank - b.rank);

    return {
      currentRank,
      totalPlayers: tournament.players.length,
      pointsToNext,
      pointsFromPrevious,
      nearbyCompetitors
    };
  }
}

export default TournamentLeaderboardService;