import {
  Tournament,
  TournamentStatistics,
  TournamentRanking,
  TournamentPlayer,
  MatchResult,
  TournamentPlayerStats,
  HeadToHeadStats
} from '../../types/party';
import { TournamentPlayerManager } from './TournamentPlayerManager';

/**
 * Tournament Statistics Engine
 * Calculates comprehensive tournament statistics and analytics
 */
export class TournamentStatisticsEngine {
  /**
   * Calculate comprehensive tournament statistics
   */
  static calculateTournamentStatistics(tournament: Tournament): TournamentStatistics {
    const completedMatches = this.getCompletedMatches(tournament);
    const duration = this.calculateTournamentDuration(tournament);
    const playerRankings = this.calculatePlayerRankings(tournament.players);
    
    return {
      tournamentId: tournament.id,
      totalMatches: completedMatches.length,
      totalRounds: tournament.bracket.rounds.length,
      duration,
      playerRankings,
      mostCooperativePlayer: this.findMostCooperativePlayer(tournament.players),
      mostCompetitivePlayer: this.findMostCompetitivePlayer(tournament.players),
      highestScoringMatch: this.findHighestScoringMatch(completedMatches),
      tournamentMVP: this.findTournamentMVP(tournament.players),
      averageMatchDuration: this.calculateAverageMatchDuration(completedMatches),
      cooperationRate: this.calculateOverallCooperationRate(tournament.players),
      betrayalRate: this.calculateOverallBetrayalRate(tournament.players)
    };
  }

  /**
   * Get all completed matches from tournament
   */
  private static getCompletedMatches(tournament: Tournament): MatchResult[] {
    const matches: MatchResult[] = [];
    
    tournament.bracket.rounds.forEach(round => {
      round.matches.forEach(match => {
        if (match.result) {
          matches.push(match.result);
        }
      });
    });

    return matches;
  }

  /**
   * Calculate tournament duration in seconds
   */
  private static calculateTournamentDuration(tournament: Tournament): number {
    if (!tournament.endTime) {
      return Date.now() - tournament.startTime.getTime();
    }
    return tournament.endTime.getTime() - tournament.startTime.getTime();
  }

  /**
   * Calculate player rankings for tournament
   */
  private static calculatePlayerRankings(players: TournamentPlayer[]): TournamentRanking[] {
    const rankedPlayers = TournamentPlayerManager.calculateRankings(players);
    
    return rankedPlayers.map(player => ({
      rank: player.currentRank,
      player,
      finalScore: player.statistics.totalPoints,
      matchRecord: `${player.statistics.matchesWon}-${player.statistics.matchesLost}`,
      cooperationPercentage: Math.round(player.statistics.cooperationRate * 100),
      averagePointsPerMatch: player.statistics.averageMatchScore,
      tournamentPoints: player.statistics.tournamentPoints
    }));
  }

  /**
   * Find the most cooperative player
   */
  private static findMostCooperativePlayer(players: TournamentPlayer[]): TournamentPlayer | undefined {
    const playersWithMatches = players.filter(p => p.statistics.matchesPlayed > 0);
    
    if (playersWithMatches.length === 0) return undefined;

    return playersWithMatches.reduce((most, current) => {
      if (current.statistics.cooperationRate > most.statistics.cooperationRate) {
        return current;
      }
      // Tie-breaker: more matches played
      if (current.statistics.cooperationRate === most.statistics.cooperationRate &&
          current.statistics.matchesPlayed > most.statistics.matchesPlayed) {
        return current;
      }
      return most;
    });
  }

  /**
   * Find the most competitive player (highest betrayal rate)
   */
  private static findMostCompetitivePlayer(players: TournamentPlayer[]): TournamentPlayer | undefined {
    const playersWithMatches = players.filter(p => p.statistics.matchesPlayed > 0);
    
    if (playersWithMatches.length === 0) return undefined;

    return playersWithMatches.reduce((most, current) => {
      if (current.statistics.betrayalRate > most.statistics.betrayalRate) {
        return current;
      }
      // Tie-breaker: more matches played
      if (current.statistics.betrayalRate === most.statistics.betrayalRate &&
          current.statistics.matchesPlayed > most.statistics.matchesPlayed) {
        return current;
      }
      return most;
    });
  }

  /**
   * Find the highest scoring match
   */
  private static findHighestScoringMatch(matches: MatchResult[]): MatchResult | undefined {
    if (matches.length === 0) return undefined;

    return matches.reduce((highest, current) => {
      const currentTotal = current.player1Score + current.player2Score;
      const highestTotal = highest.player1Score + highest.player2Score;
      
      return currentTotal > highestTotal ? current : highest;
    });
  }

  /**
   * Find tournament MVP (Most Valuable Player)
   */
  private static findTournamentMVP(players: TournamentPlayer[]): TournamentPlayer | undefined {
    const playersWithMatches = players.filter(p => p.statistics.matchesPlayed > 0);
    
    if (playersWithMatches.length === 0) return undefined;

    return playersWithMatches.reduce((mvp, current) => {
      // MVP calculation based on multiple factors
      const mvpScore = this.calculateMVPScore(mvp);
      const currentScore = this.calculateMVPScore(current);
      
      return currentScore > mvpScore ? current : mvp;
    });
  }

  /**
   * Calculate MVP score based on multiple performance metrics
   */
  private static calculateMVPScore(player: TournamentPlayer): number {
    const stats = player.statistics;
    
    if (stats.matchesPlayed === 0) return 0;

    const winRate = stats.matchesWon / stats.matchesPlayed;
    const avgScore = stats.averageMatchScore;
    const tournamentPoints = stats.tournamentPoints;
    
    // Weighted score calculation
    return (winRate * 40) + (avgScore * 2) + (tournamentPoints * 5) + (stats.matchesPlayed * 1);
  }

  /**
   * Calculate average match duration
   */
  private static calculateAverageMatchDuration(matches: MatchResult[]): number {
    if (matches.length === 0) return 0;

    const totalDuration = matches.reduce((sum, match) => {
      return sum + (match.statistics.matchDuration || 0);
    }, 0);

    return totalDuration / matches.length;
  }

  /**
   * Calculate overall cooperation rate across all players
   */
  private static calculateOverallCooperationRate(players: TournamentPlayer[]): number {
    const playersWithMatches = players.filter(p => p.statistics.matchesPlayed > 0);
    
    if (playersWithMatches.length === 0) return 0;

    const totalCooperationRate = playersWithMatches.reduce((sum, player) => {
      return sum + player.statistics.cooperationRate;
    }, 0);

    return totalCooperationRate / playersWithMatches.length;
  }

  /**
   * Calculate overall betrayal rate across all players
   */
  private static calculateOverallBetrayalRate(players: TournamentPlayer[]): number {
    const playersWithMatches = players.filter(p => p.statistics.matchesPlayed > 0);
    
    if (playersWithMatches.length === 0) return 0;

    const totalBetrayalRate = playersWithMatches.reduce((sum, player) => {
      return sum + player.statistics.betrayalRate;
    }, 0);

    return totalBetrayalRate / playersWithMatches.length;
  }

  /**
   * Get player performance summary
   */
  static getPlayerPerformanceSummary(player: TournamentPlayer): {
    rank: number;
    winRate: number;
    averageScore: number;
    cooperationRate: number;
    betrayalRate: number;
    tournamentPoints: number;
    matchesPlayed: number;
    strongestOpponent?: string;
    weakestOpponent?: string;
  } {
    const stats = player.statistics;
    const winRate = stats.matchesPlayed > 0 ? stats.matchesWon / stats.matchesPlayed : 0;
    
    // Find strongest and weakest opponents
    let strongestOpponent: string | undefined;
    let weakestOpponent: string | undefined;
    let lowestWinRate = 1;
    let highestWinRate = 0;

    Array.from(stats.headToHeadRecord.values()).forEach((record) => {
      if (record.matchesPlayed > 0) {
        const h2hWinRate = record.wins / record.matchesPlayed;
        
        if (h2hWinRate < lowestWinRate) {
          lowestWinRate = h2hWinRate;
          strongestOpponent = record.opponentName;
        }
        
        if (h2hWinRate > highestWinRate) {
          highestWinRate = h2hWinRate;
          weakestOpponent = record.opponentName;
        }
      }
    });

    return {
      rank: player.currentRank,
      winRate: Math.round(winRate * 100),
      averageScore: Math.round(stats.averageMatchScore * 10) / 10,
      cooperationRate: Math.round(stats.cooperationRate * 100),
      betrayalRate: Math.round(stats.betrayalRate * 100),
      tournamentPoints: stats.tournamentPoints,
      matchesPlayed: stats.matchesPlayed,
      strongestOpponent,
      weakestOpponent
    };
  }

  /**
   * Generate tournament insights and highlights
   */
  static generateTournamentInsights(tournament: Tournament): {
    highlights: string[];
    insights: string[];
    records: string[];
  } {
    const stats = this.calculateTournamentStatistics(tournament);
    const highlights: string[] = [];
    const insights: string[] = [];
    const records: string[] = [];

    // Tournament highlights
    if (stats.tournamentMVP) {
      highlights.push(`🏆 Tournament MVP: ${stats.tournamentMVP.name}`);
    }

    if (stats.mostCooperativePlayer) {
      highlights.push(`🤝 Most Cooperative: ${stats.mostCooperativePlayer.name} (${Math.round(stats.mostCooperativePlayer.statistics.cooperationRate * 100)}%)`);
    }

    if (stats.mostCompetitivePlayer) {
      highlights.push(`⚔️ Most Competitive: ${stats.mostCompetitivePlayer.name} (${Math.round(stats.mostCompetitivePlayer.statistics.betrayalRate * 100)}% betrayal)`);
    }

    // Tournament insights
    insights.push(`📊 Overall cooperation rate: ${Math.round(stats.cooperationRate * 100)}%`);
    insights.push(`⚡ Average match duration: ${Math.round(stats.averageMatchDuration / 60)} minutes`);
    insights.push(`🎯 Total matches played: ${stats.totalMatches}`);

    if (stats.cooperationRate > 0.6) {
      insights.push(`🕊️ This was a highly cooperative tournament!`);
    } else if (stats.betrayalRate > 0.6) {
      insights.push(`🔥 This was an intensely competitive tournament!`);
    }

    // Tournament records
    if (stats.highestScoringMatch) {
      const totalScore = stats.highestScoringMatch.player1Score + stats.highestScoringMatch.player2Score;
      records.push(`🎯 Highest scoring match: ${totalScore} total points`);
    }

    const longestMatch = this.findLongestMatch(this.getCompletedMatches(tournament));
    if (longestMatch) {
      records.push(`⏱️ Longest match: ${Math.round(longestMatch.statistics.matchDuration / 60)} minutes`);
    }

    return { highlights, insights, records };
  }

  /**
   * Find the longest match by duration
   */
  private static findLongestMatch(matches: MatchResult[]): MatchResult | undefined {
    if (matches.length === 0) return undefined;

    return matches.reduce((longest, current) => {
      const currentDuration = current.statistics.matchDuration || 0;
      const longestDuration = longest.statistics.matchDuration || 0;
      
      return currentDuration > longestDuration ? current : longest;
    });
  }

  /**
   * Export tournament statistics to JSON
   */
  static exportTournamentData(tournament: Tournament): string {
    const stats = this.calculateTournamentStatistics(tournament);
    const insights = this.generateTournamentInsights(tournament);
    
    const exportData = {
      tournament: {
        id: tournament.id,
        format: tournament.format,
        startTime: tournament.startTime,
        endTime: tournament.endTime,
        status: tournament.status
      },
      statistics: stats,
      insights,
      players: tournament.players.map(player => ({
        ...player,
        performance: this.getPlayerPerformanceSummary(player)
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Calculate comprehensive player performance metrics across matches
   */
  static calculatePlayerPerformanceMetrics(player: TournamentPlayer): {
    overallPerformance: {
      winRate: number;
      averageScore: number;
      cooperationRate: number;
      betrayalRate: number;
      consistencyScore: number;
      improvementTrend: number;
    };
    matchByMatchAnalysis: {
      matchNumber: number;
      score: number;
      result: 'win' | 'loss';
      cooperationRate: number;
      opponentId: string;
    }[];
    strengthsAndWeaknesses: {
      strongestAspect: string;
      weakestAspect: string;
      recommendations: string[];
    };
  } {
    const stats = player.statistics;
    
    // Calculate overall performance metrics
    const winRate = stats.matchesPlayed > 0 ? stats.matchesWon / stats.matchesPlayed : 0;
    const consistencyScore = this.calculateConsistencyScore(player);
    const improvementTrend = this.calculateImprovementTrend(player);

    // Analyze match-by-match performance (simplified for now)
    const matchByMatchAnalysis = this.generateMatchAnalysis(player);

    // Determine strengths and weaknesses
    const strengthsAndWeaknesses = this.analyzePlayerStrengthsWeaknesses(player);

    return {
      overallPerformance: {
        winRate: Math.round(winRate * 100),
        averageScore: Math.round(stats.averageMatchScore * 10) / 10,
        cooperationRate: Math.round(stats.cooperationRate * 100),
        betrayalRate: Math.round(stats.betrayalRate * 100),
        consistencyScore: Math.round(consistencyScore * 100),
        improvementTrend: Math.round(improvementTrend * 100)
      },
      matchByMatchAnalysis,
      strengthsAndWeaknesses
    };
  }

  /**
   * Calculate player consistency score based on performance variance
   */
  private static calculateConsistencyScore(player: TournamentPlayer): number {
    const stats = player.statistics;
    
    if (stats.matchesPlayed < 2) return 0;

    // For now, use a simplified consistency calculation
    // In a full implementation, this would analyze score variance across matches
    const winRate = stats.matchesWon / stats.matchesPlayed;
    const cooperationConsistency = 1 - Math.abs(0.5 - stats.cooperationRate);
    
    return (winRate + cooperationConsistency) / 2;
  }

  /**
   * Calculate improvement trend over the course of the tournament
   */
  private static calculateImprovementTrend(player: TournamentPlayer): number {
    // Simplified trend calculation
    // In a full implementation, this would analyze performance over time
    const stats = player.statistics;
    
    if (stats.matchesPlayed < 3) return 0;

    // Use tournament points as a proxy for improvement
    const expectedPoints = stats.matchesPlayed * 2; // Average expected points
    const actualPoints = stats.tournamentPoints;
    
    return Math.min(1, Math.max(-1, (actualPoints - expectedPoints) / expectedPoints));
  }

  /**
   * Generate match-by-match analysis
   */
  private static generateMatchAnalysis(player: TournamentPlayer): {
    matchNumber: number;
    score: number;
    result: 'win' | 'loss';
    cooperationRate: number;
    opponentId: string;
  }[] {
    // Simplified analysis - in a full implementation, this would use actual match history
    const analysis: any[] = [];
    const stats = player.statistics;
    
    // Generate representative data based on head-to-head records
    let matchNumber = 1;
    stats.headToHeadRecord.forEach((record, opponentId) => {
      for (let i = 0; i < record.matchesPlayed; i++) {
        analysis.push({
          matchNumber: matchNumber++,
          score: Math.round(record.totalPointsScored / record.matchesPlayed),
          result: (i < record.wins) ? 'win' : 'loss',
          cooperationRate: Math.round(stats.cooperationRate * 100),
          opponentId
        });
      }
    });

    return analysis.slice(0, stats.matchesPlayed);
  }

  /**
   * Analyze player strengths and weaknesses
   */
  private static analyzePlayerStrengthsWeaknesses(player: TournamentPlayer): {
    strongestAspect: string;
    weakestAspect: string;
    recommendations: string[];
  } {
    const stats = player.statistics;
    const winRate = stats.matchesPlayed > 0 ? stats.matchesWon / stats.matchesPlayed : 0;
    
    const aspects = {
      'Winning Games': winRate,
      'Scoring Points': stats.averageMatchScore / 50, // Normalize to 0-1
      'Cooperation': stats.cooperationRate,
      'Strategic Play': stats.betrayalRate
    };

    const sortedAspects = Object.entries(aspects).sort((a, b) => b[1] - a[1]);
    const strongestAspect = sortedAspects[0][0];
    const weakestAspect = sortedAspects[sortedAspects.length - 1][0];

    const recommendations: string[] = [];
    
    if (winRate < 0.4) {
      recommendations.push("Focus on strategic decision-making to improve win rate");
    }
    if (stats.averageMatchScore < 20) {
      recommendations.push("Work on maximizing points per match");
    }
    if (stats.cooperationRate < 0.3) {
      recommendations.push("Consider more cooperative strategies for better long-term outcomes");
    }
    if (stats.betrayalRate > 0.8) {
      recommendations.push("Balance competitive play with strategic cooperation");
    }

    if (recommendations.length === 0) {
      recommendations.push("Maintain current strong performance across all areas");
    }

    return {
      strongestAspect,
      weakestAspect,
      recommendations
    };
  }

  /**
   * Build comprehensive head-to-head statistics and records
   */
  static buildHeadToHeadAnalysis(players: TournamentPlayer[]): Map<string, Map<string, {
    record: HeadToHeadStats;
    winRate: number;
    averageScoreDifferential: number;
    dominanceLevel: 'dominant' | 'competitive' | 'struggling';
    keyInsights: string[];
  }>> {
    const analysis = new Map();

    players.forEach(player => {
      const playerAnalysis = new Map();
      
      player.statistics.headToHeadRecord.forEach((record, opponentId) => {
        const winRate = record.matchesPlayed > 0 ? record.wins / record.matchesPlayed : 0;
        const avgScoreDiff = record.matchesPlayed > 0 
          ? (record.totalPointsScored - record.totalPointsConceded) / record.matchesPlayed 
          : 0;
        
        let dominanceLevel: 'dominant' | 'competitive' | 'struggling';
        if (winRate >= 0.7) {
          dominanceLevel = 'dominant';
        } else if (winRate >= 0.4) {
          dominanceLevel = 'competitive';
        } else {
          dominanceLevel = 'struggling';
        }

        const keyInsights: string[] = [];
        
        if (record.matchesPlayed >= 3) {
          if (winRate === 1) {
            keyInsights.push("Perfect record - never lost to this opponent");
          } else if (winRate === 0) {
            keyInsights.push("Challenging matchup - never won against this opponent");
          } else if (avgScoreDiff > 10) {
            keyInsights.push("Consistently outscores this opponent");
          } else if (avgScoreDiff < -10) {
            keyInsights.push("Struggles to match this opponent's scoring");
          }
        }

        if (record.matchesPlayed >= 2 && Math.abs(record.wins - record.losses) <= 1) {
          keyInsights.push("Very evenly matched opponents");
        }

        playerAnalysis.set(opponentId, {
          record,
          winRate: Math.round(winRate * 100),
          averageScoreDifferential: Math.round(avgScoreDiff * 10) / 10,
          dominanceLevel,
          keyInsights
        });
      });

      analysis.set(player.id, playerAnalysis);
    });

    return analysis;
  }

  /**
   * Generate tournament performance trends and patterns
   */
  static analyzeTournamentTrends(tournament: Tournament): {
    cooperationTrends: {
      overallTrend: 'increasing' | 'decreasing' | 'stable';
      roundByRoundData: { round: number; cooperationRate: number }[];
    };
    competitivenessLevel: 'low' | 'medium' | 'high';
    upsetCount: number;
    comebackStories: {
      playerId: string;
      playerName: string;
      initialRank: number;
      finalRank: number;
      improvement: number;
    }[];
    dominantPlayers: {
      playerId: string;
      playerName: string;
      dominanceScore: number;
    }[];
  } {
    const stats = this.calculateTournamentStatistics(tournament);
    
    // Analyze cooperation trends (simplified)
    const roundByRoundData = tournament.bracket.rounds.map((round, index) => ({
      round: index + 1,
      cooperationRate: Math.round(stats.cooperationRate * 100) // Simplified - would need actual round data
    }));

    const overallTrend: 'increasing' | 'decreasing' | 'stable' = 'stable'; // Simplified

    // Determine competitiveness level
    let competitivenessLevel: 'low' | 'medium' | 'high';
    if (stats.betrayalRate > 0.6) {
      competitivenessLevel = 'high';
    } else if (stats.betrayalRate > 0.3) {
      competitivenessLevel = 'medium';
    } else {
      competitivenessLevel = 'low';
    }

    // Count upsets (simplified - would need seeding data)
    const upsetCount = 0;

    // Find comeback stories
    const comebackStories = tournament.players
      .filter(player => player.statistics.matchesPlayed > 2)
      .map(player => ({
        playerId: player.id,
        playerName: player.name,
        initialRank: tournament.players.length, // Simplified
        finalRank: player.currentRank,
        improvement: tournament.players.length - player.currentRank
      }))
      .filter(story => story.improvement > 2)
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, 3);

    // Find dominant players
    const dominantPlayers = tournament.players
      .filter(player => player.statistics.matchesPlayed > 0)
      .map(player => {
        const winRate = player.statistics.matchesWon / player.statistics.matchesPlayed;
        const dominanceScore = (winRate * 50) + (player.statistics.averageMatchScore * 1) + (player.statistics.tournamentPoints * 2);
        
        return {
          playerId: player.id,
          playerName: player.name,
          dominanceScore: Math.round(dominanceScore)
        };
      })
      .sort((a, b) => b.dominanceScore - a.dominanceScore)
      .slice(0, 3);

    return {
      cooperationTrends: {
        overallTrend,
        roundByRoundData
      },
      competitivenessLevel,
      upsetCount,
      comebackStories,
      dominantPlayers
    };
  }
}

export default TournamentStatisticsEngine;