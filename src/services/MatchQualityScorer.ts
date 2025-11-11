// Match Quality Scoring System - Evaluates and scores match quality

import { Player } from '../database/core/types';
import { getLogger } from './LoggingService';

export interface MatchQualityMetrics {
  trustScoreCompatibility: number;
  skillLevelCompatibility: number;
  experienceCompatibility: number;
  availabilityScore: number;
  overallScore: number;
  qualityRating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  recommendations?: string[];
}

export interface QualityWeights {
  trustScore: number;
  skillLevel: number;
  experience: number;
  availability: number;
}

export interface MatchAnalysis {
  player1: Player;
  player2: Player;
  metrics: MatchQualityMetrics;
  estimatedGameDuration: number;
  balanceScore: number;
  competitivenessScore: number;
}

export class MatchQualityScorer {
  private readonly logger = getLogger();
  
  // Default quality weights (must sum to 1.0)
  private readonly defaultWeights: QualityWeights = {
    trustScore: 0.35,    // 35% - Most important for fair play
    skillLevel: 0.30,    // 30% - Important for competitive balance
    experience: 0.20,    // 20% - Helps with game flow
    availability: 0.15   // 15% - Ensures players are ready
  };

  // Quality thresholds
  private readonly qualityThresholds = {
    excellent: 85,
    good: 70,
    fair: 55,
    poor: 0
  };

  constructor() {
    this.logger.info('Match Quality Scorer initialized');
  }

  /**
   * Calculate comprehensive match quality score
   * Implements Requirements 3.3, 3.5
   */
  calculateMatchQuality(
    player1: Player, 
    player2: Player, 
    customWeights?: Partial<QualityWeights>
  ): MatchQualityMetrics {
    const weights = { ...this.defaultWeights, ...customWeights };
    
    // Calculate individual compatibility scores
    const trustScoreCompatibility = this.calculateTrustScoreCompatibility(player1, player2);
    const skillLevelCompatibility = this.calculateSkillLevelCompatibility(player1, player2);
    const experienceCompatibility = this.calculateExperienceCompatibility(player1, player2);
    const availabilityScore = this.calculateAvailabilityScore(player1, player2);

    // Calculate weighted overall score
    const overallScore = Math.round(
      (trustScoreCompatibility * weights.trustScore) +
      (skillLevelCompatibility * weights.skillLevel) +
      (experienceCompatibility * weights.experience) +
      (availabilityScore * weights.availability)
    );

    // Determine quality rating
    const qualityRating = this.determineQualityRating(overallScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      player1, 
      player2, 
      {
        trustScoreCompatibility,
        skillLevelCompatibility,
        experienceCompatibility,
        availabilityScore,
        overallScore,
        qualityRating
      }
    );

    const metrics: MatchQualityMetrics = {
      trustScoreCompatibility,
      skillLevelCompatibility,
      experienceCompatibility,
      availabilityScore,
      overallScore,
      qualityRating,
      recommendations
    };

    this.logger.debug('Match quality calculated', {
      player1Id: player1.id,
      player2Id: player2.id,
      overallScore,
      qualityRating
    });

    return metrics;
  }

  /**
   * Perform detailed match analysis
   */
  analyzeMatch(player1: Player, player2: Player): MatchAnalysis {
    const metrics = this.calculateMatchQuality(player1, player2);
    const estimatedGameDuration = this.estimateGameDuration(player1, player2);
    const balanceScore = this.calculateBalanceScore(player1, player2);
    const competitivenessScore = this.calculateCompetitivenessScore(player1, player2);

    return {
      player1,
      player2,
      metrics,
      estimatedGameDuration,
      balanceScore,
      competitivenessScore
    };
  }

  /**
   * Calculate trust score compatibility (0-100)
   */
  private calculateTrustScoreCompatibility(player1: Player, player2: Player): number {
    const trustScoreDiff = Math.abs(player1.trustScore - player2.trustScore);
    
    // Perfect match (0 difference) = 100 points
    // 10 point difference = 80 points
    // 20 point difference = 60 points
    // 30+ point difference = 40 points or less
    
    if (trustScoreDiff === 0) return 100;
    if (trustScoreDiff <= 5) return 95;
    if (trustScoreDiff <= 10) return 85;
    if (trustScoreDiff <= 15) return 75;
    if (trustScoreDiff <= 20) return 65;
    if (trustScoreDiff <= 25) return 55;
    if (trustScoreDiff <= 30) return 45;
    
    // Exponential decay for larger differences
    return Math.max(20, 45 - (trustScoreDiff - 30) * 2);
  }

  /**
   * Calculate skill level compatibility (0-100)
   */
  private calculateSkillLevelCompatibility(player1: Player, player2: Player): number {
    const skillDiff = Math.abs(player1.skillLevel - player2.skillLevel);
    
    // Skill differences are typically larger numbers (rank points)
    // 0-50 difference = excellent (90-100)
    // 50-100 difference = good (80-90)
    // 100-200 difference = fair (60-80)
    // 200+ difference = poor (20-60)
    
    if (skillDiff <= 25) return 100;
    if (skillDiff <= 50) return 95;
    if (skillDiff <= 75) return 85;
    if (skillDiff <= 100) return 80;
    if (skillDiff <= 150) return 70;
    if (skillDiff <= 200) return 60;
    if (skillDiff <= 300) return 45;
    if (skillDiff <= 400) return 35;
    
    // Very large skill gaps
    return Math.max(15, 35 - Math.floor((skillDiff - 400) / 100) * 5);
  }

  /**
   * Calculate experience compatibility (0-100)
   */
  private calculateExperienceCompatibility(player1: Player, player2: Player): number {
    const player1Games = player1.totalGames || 0;
    const player2Games = player2.totalGames || 0;
    
    // Handle new players specially
    if (player1Games === 0 && player2Games === 0) return 100; // Both new
    if (player1Games === 0 || player2Games === 0) {
      const experiencedGames = Math.max(player1Games, player2Games);
      if (experiencedGames <= 5) return 85; // New vs slightly experienced
      if (experiencedGames <= 20) return 70; // New vs moderately experienced
      return 50; // New vs very experienced
    }
    
    // Both players have experience
    const experienceDiff = Math.abs(player1Games - player2Games);
    const avgExperience = (player1Games + player2Games) / 2;
    
    // Calculate relative difference as percentage
    const relativeExperienceDiff = experienceDiff / avgExperience;
    
    if (relativeExperienceDiff <= 0.2) return 100; // Within 20%
    if (relativeExperienceDiff <= 0.4) return 85;  // Within 40%
    if (relativeExperienceDiff <= 0.6) return 70;  // Within 60%
    if (relativeExperienceDiff <= 0.8) return 60;  // Within 80%
    if (relativeExperienceDiff <= 1.0) return 50;  // Within 100%
    
    // Large experience gaps
    return Math.max(25, 50 - Math.floor(relativeExperienceDiff * 20));
  }

  /**
   * Calculate availability score (0-100)
   */
  private calculateAvailabilityScore(player1: Player, player2: Player): number {
    let score = 50; // Base score
    
    // Both online = +40 points
    if (player1.isOnline && player2.isOnline) {
      score += 40;
    } else if (player1.isOnline || player2.isOnline) {
      // One online = +20 points
      score += 20;
    }
    
    // Additional factors could include:
    // - Time zone compatibility
    // - Recent activity patterns
    // - Connection quality
    // For now, we'll add a small random factor to simulate these
    
    const availabilityBonus = Math.random() * 10; // 0-10 bonus
    score += availabilityBonus;
    
    return Math.min(100, Math.round(score));
  }

  /**
   * Determine quality rating based on overall score
   */
  private determineQualityRating(score: number): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' {
    if (score >= this.qualityThresholds.excellent) return 'EXCELLENT';
    if (score >= this.qualityThresholds.good) return 'GOOD';
    if (score >= this.qualityThresholds.fair) return 'FAIR';
    return 'POOR';
  }

  /**
   * Generate recommendations for improving match quality
   */
  private generateRecommendations(
    player1: Player, 
    player2: Player, 
    metrics: Omit<MatchQualityMetrics, 'recommendations'>
  ): string[] {
    const recommendations: string[] = [];
    
    // Trust score recommendations
    if (metrics.trustScoreCompatibility < 70) {
      const trustDiff = Math.abs(player1.trustScore - player2.trustScore);
      recommendations.push(`Trust score difference is ${trustDiff} points - consider expanding search range`);
    }
    
    // Skill level recommendations
    if (metrics.skillLevelCompatibility < 70) {
      const skillDiff = Math.abs(player1.skillLevel - player2.skillLevel);
      recommendations.push(`Skill level difference is ${skillDiff} points - match may be unbalanced`);
    }
    
    // Experience recommendations
    if (metrics.experienceCompatibility < 60) {
      const exp1 = player1.totalGames || 0;
      const exp2 = player2.totalGames || 0;
      recommendations.push(`Experience gap detected (${exp1} vs ${exp2} games) - consider tutorial or practice mode`);
    }
    
    // Availability recommendations
    if (metrics.availabilityScore < 70) {
      if (!player1.isOnline || !player2.isOnline) {
        recommendations.push('One or both players may not be immediately available');
      }
    }
    
    // Overall quality recommendations
    if (metrics.overallScore < this.qualityThresholds.fair) {
      recommendations.push('Consider waiting for better matches or adjusting search criteria');
    } else if (metrics.overallScore >= this.qualityThresholds.excellent) {
      recommendations.push('Excellent match quality - proceed immediately');
    }
    
    return recommendations;
  }

  /**
   * Estimate game duration based on player characteristics
   */
  private estimateGameDuration(player1: Player, player2: Player): number {
    // Base duration in seconds
    let baseDuration = 600; // 10 minutes
    
    // Adjust based on experience
    const avgExperience = ((player1.totalGames || 0) + (player2.totalGames || 0)) / 2;
    if (avgExperience < 5) {
      baseDuration *= 1.3; // New players take longer
    } else if (avgExperience > 50) {
      baseDuration *= 0.9; // Experienced players are faster
    }
    
    // Adjust based on skill difference
    const skillDiff = Math.abs(player1.skillLevel - player2.skillLevel);
    if (skillDiff > 300) {
      baseDuration *= 0.8; // Unbalanced matches end faster
    }
    
    // Adjust based on trust scores
    const avgTrustScore = (player1.trustScore + player2.trustScore) / 2;
    if (avgTrustScore > 80) {
      baseDuration *= 1.1; // High trust players may communicate more
    }
    
    return Math.round(baseDuration);
  }

  /**
   * Calculate balance score (how evenly matched the players are)
   */
  private calculateBalanceScore(player1: Player, player2: Player): number {
    const skillBalance = this.calculateSkillLevelCompatibility(player1, player2);
    const experienceBalance = this.calculateExperienceCompatibility(player1, player2);
    
    // Weight skill more heavily for balance
    return Math.round(skillBalance * 0.7 + experienceBalance * 0.3);
  }

  /**
   * Calculate competitiveness score (how engaging the match will be)
   */
  private calculateCompetitivenessScore(player1: Player, player2: Player): number {
    let score = 50; // Base score
    
    // Similar skill levels increase competitiveness
    const skillCompatibility = this.calculateSkillLevelCompatibility(player1, player2);
    score += (skillCompatibility - 50) * 0.6;
    
    // Similar experience levels increase competitiveness
    const experienceCompatibility = this.calculateExperienceCompatibility(player1, player2);
    score += (experienceCompatibility - 50) * 0.4;
    
    // High trust scores increase competitiveness (fair play)
    const avgTrustScore = (player1.trustScore + player2.trustScore) / 2;
    if (avgTrustScore > 70) {
      score += 10;
    } else if (avgTrustScore < 40) {
      score -= 10;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Get quality distribution statistics
   */
  getQualityStatistics(matches: MatchAnalysis[]): {
    averageQuality: number;
    qualityDistribution: { [key: string]: number };
    averageBalance: number;
    averageCompetitiveness: number;
  } {
    if (matches.length === 0) {
      return {
        averageQuality: 0,
        qualityDistribution: {},
        averageBalance: 0,
        averageCompetitiveness: 0
      };
    }

    const averageQuality = matches.reduce((sum, match) => sum + match.metrics.overallScore, 0) / matches.length;
    const averageBalance = matches.reduce((sum, match) => sum + match.balanceScore, 0) / matches.length;
    const averageCompetitiveness = matches.reduce((sum, match) => sum + match.competitivenessScore, 0) / matches.length;

    // Calculate quality distribution
    const qualityDistribution: { [key: string]: number } = {
      EXCELLENT: 0,
      GOOD: 0,
      FAIR: 0,
      POOR: 0
    };

    matches.forEach(match => {
      qualityDistribution[match.metrics.qualityRating]++;
    });

    return {
      averageQuality: Math.round(averageQuality * 100) / 100,
      qualityDistribution,
      averageBalance: Math.round(averageBalance * 100) / 100,
      averageCompetitiveness: Math.round(averageCompetitiveness * 100) / 100
    };
  }
}

// Singleton instance
let matchQualityScorerInstance: MatchQualityScorer | null = null;

export function getMatchQualityScorer(): MatchQualityScorer {
  if (!matchQualityScorerInstance) {
    matchQualityScorerInstance = new MatchQualityScorer();
  }
  return matchQualityScorerInstance;
}

// Reset for testing
export function resetMatchQualityScorer(): void {
  matchQualityScorerInstance = null;
}