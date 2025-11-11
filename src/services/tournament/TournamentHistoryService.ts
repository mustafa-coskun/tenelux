import {
  Tournament,
  TournamentStatistics,
  TournamentPlayer,
  TournamentFormat,
  TournamentStatus,
  MatchResult
} from '../../types/party';
import { TournamentStatisticsEngine } from './TournamentStatisticsEngine';

/**
 * Tournament History and Analytics Service
 * Manages tournament history storage, retrieval, and analytics
 */

export interface TournamentHistoryEntry {
  tournament: Tournament;
  statistics: TournamentStatistics;
  completedAt: Date;
  participants: string[]; // Player names
  winner: string;
  format: TournamentFormat;
  duration: number;
  totalMatches: number;
}

export interface PlayerTournamentHistory {
  playerId: string;
  playerName: string;
  tournaments: {
    tournamentId: string;
    format: TournamentFormat;
    finalRank: number;
    totalPlayers: number;
    tournamentPoints: number;
    matchRecord: string;
    cooperationRate: number;
    completedAt: Date;
  }[];
  overallStats: {
    tournamentsPlayed: number;
    tournamentsWon: number;
    averageRank: number;
    bestRank: number;
    totalTournamentPoints: number;
    averageCooperationRate: number;
    favoriteFormat: TournamentFormat;
    winRate: number;
  };
}

export interface TournamentAnalytics {
  totalTournaments: number;
  totalPlayers: number;
  averageTournamentDuration: number;
  mostPopularFormat: TournamentFormat;
  formatDistribution: { format: TournamentFormat; count: number; percentage: number }[];
  playerRetentionRate: number;
  averageCooperationRate: number;
  competitivenessIndex: number;
  topPerformers: {
    playerId: string;
    playerName: string;
    tournamentsWon: number;
    averageRank: number;
    winRate: number;
  }[];
  recentTrends: {
    period: string;
    tournamentsCount: number;
    averageParticipants: number;
    cooperationTrend: 'increasing' | 'decreasing' | 'stable';
  }[];
}

export class TournamentHistoryService {
  private static tournamentHistory: Map<string, TournamentHistoryEntry> = new Map();
  private static playerHistory: Map<string, PlayerTournamentHistory> = new Map();

  /**
   * Store completed tournament in history
   */
  static storeTournamentHistory(tournament: Tournament): void {
    if (tournament.status !== TournamentStatus.COMPLETED) {
      throw new Error('Can only store completed tournaments');
    }

    const statistics = TournamentStatisticsEngine.calculateTournamentStatistics(tournament);
    const winner = tournament.players.find(p => p.currentRank === 1)?.name || 'Unknown';
    
    const historyEntry: TournamentHistoryEntry = {
      tournament,
      statistics,
      completedAt: tournament.endTime || new Date(),
      participants: tournament.players.map(p => p.name),
      winner,
      format: tournament.format,
      duration: statistics.duration,
      totalMatches: statistics.totalMatches
    };

    this.tournamentHistory.set(tournament.id, historyEntry);
    
    // Update player histories
    tournament.players.forEach(player => {
      this.updatePlayerHistory(player, tournament, statistics);
    });
  }

  /**
   * Update individual player's tournament history
   */
  private static updatePlayerHistory(
    player: TournamentPlayer,
    tournament: Tournament,
    statistics: TournamentStatistics
  ): void {
    let playerHistory = this.playerHistory.get(player.id);
    
    if (!playerHistory) {
      playerHistory = {
        playerId: player.id,
        playerName: player.name,
        tournaments: [],
        overallStats: {
          tournamentsPlayed: 0,
          tournamentsWon: 0,
          averageRank: 0,
          bestRank: tournament.players.length,
          totalTournamentPoints: 0,
          averageCooperationRate: 0,
          favoriteFormat: tournament.format,
          winRate: 0
        }
      };
    }

    // Add tournament entry
    playerHistory.tournaments.push({
      tournamentId: tournament.id,
      format: tournament.format,
      finalRank: player.currentRank,
      totalPlayers: tournament.players.length,
      tournamentPoints: player.statistics.tournamentPoints,
      matchRecord: `${player.statistics.matchesWon}-${player.statistics.matchesLost}`,
      cooperationRate: player.statistics.cooperationRate,
      completedAt: tournament.endTime || new Date()
    });

    // Update overall stats
    this.recalculatePlayerOverallStats(playerHistory);
    
    this.playerHistory.set(player.id, playerHistory);
  }

  /**
   * Recalculate player's overall statistics
   */
  private static recalculatePlayerOverallStats(playerHistory: PlayerTournamentHistory): void {
    const tournaments = playerHistory.tournaments;
    const stats = playerHistory.overallStats;

    stats.tournamentsPlayed = tournaments.length;
    stats.tournamentsWon = tournaments.filter(t => t.finalRank === 1).length;
    stats.averageRank = tournaments.reduce((sum, t) => sum + t.finalRank, 0) / tournaments.length;
    stats.bestRank = Math.min(...tournaments.map(t => t.finalRank));
    stats.totalTournamentPoints = tournaments.reduce((sum, t) => sum + t.tournamentPoints, 0);
    stats.averageCooperationRate = tournaments.reduce((sum, t) => sum + t.cooperationRate, 0) / tournaments.length;
    stats.winRate = stats.tournamentsWon / stats.tournamentsPlayed;

    // Calculate favorite format
    const formatCounts = new Map<TournamentFormat, number>();
    tournaments.forEach(t => {
      formatCounts.set(t.format, (formatCounts.get(t.format) || 0) + 1);
    });
    
    let maxCount = 0;
    formatCounts.forEach((count, format) => {
      if (count > maxCount) {
        maxCount = count;
        stats.favoriteFormat = format;
      }
    });
  }

  /**
   * Get tournament history by ID
   */
  static getTournamentHistory(tournamentId: string): TournamentHistoryEntry | null {
    return this.tournamentHistory.get(tournamentId) || null;
  }

  /**
   * Get player's tournament history
   */
  static getPlayerHistory(playerId: string): PlayerTournamentHistory | null {
    return this.playerHistory.get(playerId) || null;
  }

  /**
   * Get all tournament history entries
   */
  static getAllTournamentHistory(): TournamentHistoryEntry[] {
    return Array.from(this.tournamentHistory.values())
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }

  /**
   * Get recent tournament history (last N tournaments)
   */
  static getRecentTournamentHistory(limit: number = 10): TournamentHistoryEntry[] {
    return this.getAllTournamentHistory().slice(0, limit);
  }

  /**
   * Get tournament history by format
   */
  static getTournamentHistoryByFormat(format: TournamentFormat): TournamentHistoryEntry[] {
    return this.getAllTournamentHistory()
      .filter(entry => entry.format === format);
  }

  /**
   * Get tournament history for date range
   */
  static getTournamentHistoryByDateRange(startDate: Date, endDate: Date): TournamentHistoryEntry[] {
    return this.getAllTournamentHistory()
      .filter(entry => 
        entry.completedAt >= startDate && entry.completedAt <= endDate
      );
  }

  /**
   * Generate comprehensive tournament analytics
   */
  static generateTournamentAnalytics(): TournamentAnalytics {
    const allTournaments = this.getAllTournamentHistory();
    const allPlayers = Array.from(this.playerHistory.values());

    if (allTournaments.length === 0) {
      return this.getEmptyAnalytics();
    }

    // Basic statistics
    const totalTournaments = allTournaments.length;
    const totalPlayers = new Set(allTournaments.flatMap(t => t.participants)).size;
    const averageTournamentDuration = allTournaments.reduce((sum, t) => sum + t.duration, 0) / totalTournaments;

    // Format distribution
    const formatCounts = new Map<TournamentFormat, number>();
    allTournaments.forEach(t => {
      formatCounts.set(t.format, (formatCounts.get(t.format) || 0) + 1);
    });

    const formatDistribution = Array.from(formatCounts.entries()).map(([format, count]) => ({
      format,
      count,
      percentage: Math.round((count / totalTournaments) * 100)
    }));

    const mostPopularFormat = formatDistribution.reduce((max, current) => 
      current.count > max.count ? current : max
    ).format;

    // Player retention (players who played more than one tournament)
    const playersWithMultipleTournaments = allPlayers.filter(p => p.tournaments.length > 1).length;
    const playerRetentionRate = totalPlayers > 0 ? playersWithMultipleTournaments / totalPlayers : 0;

    // Cooperation and competitiveness
    const averageCooperationRate = allTournaments.reduce((sum, t) => 
      sum + t.statistics.cooperationRate, 0
    ) / totalTournaments;

    const competitivenessIndex = allTournaments.reduce((sum, t) => 
      sum + t.statistics.betrayalRate, 0
    ) / totalTournaments;

    // Top performers
    const topPerformers = allPlayers
      .filter(p => p.tournaments.length >= 3) // At least 3 tournaments
      .map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        tournamentsWon: p.overallStats.tournamentsWon,
        averageRank: Math.round(p.overallStats.averageRank * 10) / 10,
        winRate: Math.round(p.overallStats.winRate * 100)
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 10);

    // Recent trends (last 30 days, last 7 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentTournaments30d = this.getTournamentHistoryByDateRange(thirtyDaysAgo, now);
    const recentTournaments7d = this.getTournamentHistoryByDateRange(sevenDaysAgo, now);

    const recentTrends = [
      {
        period: 'Last 30 days',
        tournamentsCount: recentTournaments30d.length,
        averageParticipants: recentTournaments30d.length > 0 
          ? Math.round(recentTournaments30d.reduce((sum, t) => sum + t.participants.length, 0) / recentTournaments30d.length)
          : 0,
        cooperationTrend: this.calculateCooperationTrend(recentTournaments30d) as 'increasing' | 'decreasing' | 'stable'
      },
      {
        period: 'Last 7 days',
        tournamentsCount: recentTournaments7d.length,
        averageParticipants: recentTournaments7d.length > 0
          ? Math.round(recentTournaments7d.reduce((sum, t) => sum + t.participants.length, 0) / recentTournaments7d.length)
          : 0,
        cooperationTrend: this.calculateCooperationTrend(recentTournaments7d) as 'increasing' | 'decreasing' | 'stable'
      }
    ];

    return {
      totalTournaments,
      totalPlayers,
      averageTournamentDuration: Math.round(averageTournamentDuration / 1000), // Convert to seconds
      mostPopularFormat,
      formatDistribution,
      playerRetentionRate: Math.round(playerRetentionRate * 100),
      averageCooperationRate: Math.round(averageCooperationRate * 100),
      competitivenessIndex: Math.round(competitivenessIndex * 100),
      topPerformers,
      recentTrends
    };
  }

  /**
   * Calculate cooperation trend for a set of tournaments
   */
  private static calculateCooperationTrend(tournaments: TournamentHistoryEntry[]): string {
    if (tournaments.length < 2) return 'stable';

    const sortedTournaments = tournaments.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    const firstHalf = sortedTournaments.slice(0, Math.floor(sortedTournaments.length / 2));
    const secondHalf = sortedTournaments.slice(Math.floor(sortedTournaments.length / 2));

    const firstHalfAvg = firstHalf.reduce((sum, t) => sum + t.statistics.cooperationRate, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, t) => sum + t.statistics.cooperationRate, 0) / secondHalf.length;

    const difference = secondHalfAvg - firstHalfAvg;
    
    if (difference > 0.05) return 'increasing';
    if (difference < -0.05) return 'decreasing';
    return 'stable';
  }

  /**
   * Get empty analytics structure
   */
  private static getEmptyAnalytics(): TournamentAnalytics {
    return {
      totalTournaments: 0,
      totalPlayers: 0,
      averageTournamentDuration: 0,
      mostPopularFormat: TournamentFormat.SINGLE_ELIMINATION,
      formatDistribution: [],
      playerRetentionRate: 0,
      averageCooperationRate: 0,
      competitivenessIndex: 0,
      topPerformers: [],
      recentTrends: []
    };
  }

  /**
   * Get player performance comparison
   */
  static getPlayerPerformanceComparison(playerId1: string, playerId2: string): {
    player1: PlayerTournamentHistory | null;
    player2: PlayerTournamentHistory | null;
    comparison: {
      tournamentsPlayed: { p1: number; p2: number; winner: string };
      winRate: { p1: number; p2: number; winner: string };
      averageRank: { p1: number; p2: number; winner: string };
      cooperationRate: { p1: number; p2: number; winner: string };
      headToHead?: {
        matchesPlayed: number;
        p1Wins: number;
        p2Wins: number;
        winner: string;
      };
    };
  } | null {
    const player1History = this.getPlayerHistory(playerId1);
    const player2History = this.getPlayerHistory(playerId2);

    if (!player1History || !player2History) return null;

    const p1Stats = player1History.overallStats;
    const p2Stats = player2History.overallStats;

    // Find head-to-head matches (tournaments where both players participated)
    const commonTournaments = player1History.tournaments.filter(t1 =>
      player2History.tournaments.some(t2 => t2.tournamentId === t1.tournamentId)
    );

    let headToHead;
    if (commonTournaments.length > 0) {
      const p1Wins = commonTournaments.filter(t => {
        const p2Tournament = player2History.tournaments.find(t2 => t2.tournamentId === t.tournamentId);
        return p2Tournament && t.finalRank < p2Tournament.finalRank;
      }).length;
      
      const p2Wins = commonTournaments.length - p1Wins;
      
      headToHead = {
        matchesPlayed: commonTournaments.length,
        p1Wins,
        p2Wins,
        winner: p1Wins > p2Wins ? player1History.playerName : 
                p2Wins > p1Wins ? player2History.playerName : 'Tie'
      };
    }

    return {
      player1: player1History,
      player2: player2History,
      comparison: {
        tournamentsPlayed: {
          p1: p1Stats.tournamentsPlayed,
          p2: p2Stats.tournamentsPlayed,
          winner: p1Stats.tournamentsPlayed > p2Stats.tournamentsPlayed ? player1History.playerName : 
                  p2Stats.tournamentsPlayed > p1Stats.tournamentsPlayed ? player2History.playerName : 'Tie'
        },
        winRate: {
          p1: Math.round(p1Stats.winRate * 100),
          p2: Math.round(p2Stats.winRate * 100),
          winner: p1Stats.winRate > p2Stats.winRate ? player1History.playerName :
                  p2Stats.winRate > p1Stats.winRate ? player2History.playerName : 'Tie'
        },
        averageRank: {
          p1: Math.round(p1Stats.averageRank * 10) / 10,
          p2: Math.round(p2Stats.averageRank * 10) / 10,
          winner: p1Stats.averageRank < p2Stats.averageRank ? player1History.playerName :
                  p2Stats.averageRank < p1Stats.averageRank ? player2History.playerName : 'Tie'
        },
        cooperationRate: {
          p1: Math.round(p1Stats.averageCooperationRate * 100),
          p2: Math.round(p2Stats.averageCooperationRate * 100),
          winner: p1Stats.averageCooperationRate > p2Stats.averageCooperationRate ? player1History.playerName :
                  p2Stats.averageCooperationRate > p1Stats.averageCooperationRate ? player2History.playerName : 'Tie'
        },
        headToHead
      }
    };
  }

  /**
   * Clear all tournament history (for testing/reset)
   */
  static clearHistory(): void {
    this.tournamentHistory.clear();
    this.playerHistory.clear();
  }

  /**
   * Export tournament history to JSON
   */
  static exportHistory(): string {
    const data = {
      tournaments: Array.from(this.tournamentHistory.values()),
      players: Array.from(this.playerHistory.values()),
      analytics: this.generateTournamentAnalytics(),
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Get tournament statistics summary
   */
  static getTournamentStatisticsSummary(): {
    totalTournaments: number;
    totalMatches: number;
    totalPlayers: number;
    averageTournamentSize: number;
    mostActivePlayer: string | null;
    longestTournament: { id: string; duration: number } | null;
    shortestTournament: { id: string; duration: number } | null;
  } {
    const allTournaments = this.getAllTournamentHistory();
    const allPlayers = Array.from(this.playerHistory.values());

    if (allTournaments.length === 0) {
      return {
        totalTournaments: 0,
        totalMatches: 0,
        totalPlayers: 0,
        averageTournamentSize: 0,
        mostActivePlayer: null,
        longestTournament: null,
        shortestTournament: null
      };
    }

    const totalMatches = allTournaments.reduce((sum, t) => sum + t.totalMatches, 0);
    const totalPlayers = new Set(allTournaments.flatMap(t => t.participants)).size;
    const averageTournamentSize = allTournaments.reduce((sum, t) => sum + t.participants.length, 0) / allTournaments.length;

    const mostActivePlayer = allPlayers.length > 0 
      ? allPlayers.reduce((max, current) => 
          current.tournaments.length > max.tournaments.length ? current : max
        ).playerName
      : null;

    const longestTournament = allTournaments.reduce((max, current) => 
      current.duration > (max?.duration || 0) ? { id: current.tournament.id, duration: current.duration } : max
    , null as { id: string; duration: number } | null);

    const shortestTournament = allTournaments.reduce((min, current) => 
      current.duration < (min?.duration || Infinity) ? { id: current.tournament.id, duration: current.duration } : min
    , null as { id: string; duration: number } | null);

    return {
      totalTournaments: allTournaments.length,
      totalMatches,
      totalPlayers,
      averageTournamentSize: Math.round(averageTournamentSize * 10) / 10,
      mostActivePlayer,
      longestTournament,
      shortestTournament
    };
  }
}

export default TournamentHistoryService;