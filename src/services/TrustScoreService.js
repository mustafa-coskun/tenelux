// Trust Score calculation and management service

class TrustScoreService {
  constructor() {
    this.baseScore = 50; // Starting trust score
    this.maxScore = 100;
    this.minScore = 0;
  }

  /**
   * Calculate trust score based on cooperation rate
   * @param {Object} stats - Player statistics
   * @returns {number} Trust score (0-100)
   */
  calculateTrustScore(stats) {
    if (!stats || stats.totalGames === 0) {
      return this.baseScore;
    }

    // Calculate cooperation rate (silent/cooperate choices)
    const cooperationRate = stats.cooperations / (stats.cooperations + stats.betrayals);
    
    // Convert to percentage and apply curve
    let trustScore = cooperationRate * 100;
    
    // Apply experience modifier (more games = more stable score)
    const experienceModifier = Math.min(stats.totalGames / 50, 1); // Max modifier at 50 games
    trustScore = (trustScore * experienceModifier) + (this.baseScore * (1 - experienceModifier));
    
    // Ensure score is within bounds
    return Math.max(this.minScore, Math.min(this.maxScore, Math.round(trustScore)));
  }

  /**
   * Calculate matchmaking range based on trust score
   * @param {number} trustScore - Player's trust score
   * @returns {Object} Range for matchmaking
   */
  getMatchmakingRange(trustScore) {
    const range = 15; // Base range
    const expandedRange = Math.max(10, range - (Math.abs(trustScore - 50) / 10));
    
    return {
      min: Math.max(this.minScore, trustScore - expandedRange),
      max: Math.min(this.maxScore, trustScore + expandedRange)
    };
  }

  /**
   * Update player statistics after a game
   * @param {Object} currentStats - Current player stats
   * @param {Object} gameResult - Game result data
   * @returns {Object} Updated statistics
   */
  updatePlayerStats(currentStats, gameResult) {
    const stats = { ...currentStats };
    
    // Only update for multiplayer and party modes
    if (gameResult.gameMode === 'single_player') {
      return stats;
    }

    // Update basic counters
    stats.totalGames = (stats.totalGames || 0) + 1;
    
    if (gameResult.won) {
      stats.wins = (stats.wins || 0) + 1;
    } else {
      stats.losses = (stats.losses || 0) + 1;
    }

    // Update cooperation/betrayal counts
    stats.cooperations = (stats.cooperations || 0) + gameResult.cooperations;
    stats.betrayals = (stats.betrayals || 0) + gameResult.betrayals;
    
    // Update total score
    stats.totalScore = (stats.totalScore || 0) + gameResult.score;
    
    // Calculate derived statistics
    stats.winRate = (stats.wins / stats.totalGames) * 100;
    stats.cooperationRate = (stats.cooperations / (stats.cooperations + stats.betrayals)) * 100;
    stats.betrayalRate = (stats.betrayals / (stats.cooperations + stats.betrayals)) * 100;
    stats.averageScore = stats.totalScore / stats.totalGames;
    
    // Update trust score
    stats.trustScore = this.calculateTrustScore(stats);
    
    // Update mode-specific stats
    if (gameResult.gameMode === 'multiplayer') {
      stats.multiplayerStats = this.updateModeStats(stats.multiplayerStats || {}, gameResult);
    } else if (gameResult.gameMode === 'party') {
      stats.partyStats = this.updateModeStats(stats.partyStats || {}, gameResult);
    }
    
    return stats;
  }

  /**
   * Update mode-specific statistics
   * @param {Object} modeStats - Current mode stats
   * @param {Object} gameResult - Game result data
   * @returns {Object} Updated mode statistics
   */
  updateModeStats(modeStats, gameResult) {
    const stats = { ...modeStats };
    
    stats.totalGames = (stats.totalGames || 0) + 1;
    stats.wins = (stats.wins || 0) + (gameResult.won ? 1 : 0);
    stats.losses = (stats.losses || 0) + (gameResult.won ? 0 : 1);
    stats.cooperations = (stats.cooperations || 0) + gameResult.cooperations;
    stats.betrayals = (stats.betrayals || 0) + gameResult.betrayals;
    stats.totalScore = (stats.totalScore || 0) + gameResult.score;
    
    // Calculate derived stats
    stats.winRate = (stats.wins / stats.totalGames) * 100;
    stats.cooperationRate = (stats.cooperations / (stats.cooperations + stats.betrayals)) * 100;
    stats.averageScore = stats.totalScore / stats.totalGames;
    
    return stats;
  }

  /**
   * Get leaderboard data separated by mode
   * @param {Array} players - Array of player data
   * @param {string} mode - 'overall', 'multiplayer', or 'party'
   * @returns {Array} Sorted leaderboard
   */
  getLeaderboard(players, mode = 'overall') {
    return players
      .filter(player => {
        if (mode === 'overall') return player.stats && player.stats.totalGames > 0;
        if (mode === 'multiplayer') return player.stats && player.stats.multiplayerStats && player.stats.multiplayerStats.totalGames > 0;
        if (mode === 'party') return player.stats && player.stats.partyStats && player.stats.partyStats.totalGames > 0;
        return false;
      })
      .map(player => {
        const stats = mode === 'overall' ? player.stats : player.stats[`${mode}Stats`];
        return {
          ...player,
          displayStats: stats,
          sortScore: this.calculateLeaderboardScore(stats)
        };
      })
      .sort((a, b) => b.sortScore - a.sortScore);
  }

  /**
   * Calculate composite score for leaderboard ranking
   * @param {Object} stats - Player statistics
   * @returns {number} Composite score for ranking
   */
  calculateLeaderboardScore(stats) {
    if (!stats || stats.totalGames === 0) return 0;
    
    // Weighted combination of different factors
    const scoreWeight = 0.4;
    const winRateWeight = 0.3;
    const trustScoreWeight = 0.2;
    const experienceWeight = 0.1;
    
    const normalizedScore = Math.min(stats.averageScore / 100, 1); // Normalize to 0-1
    const normalizedWinRate = stats.winRate / 100;
    const normalizedTrustScore = (stats.trustScore || this.baseScore) / 100;
    const normalizedExperience = Math.min(stats.totalGames / 100, 1); // Cap at 100 games
    
    return (
      normalizedScore * scoreWeight +
      normalizedWinRate * winRateWeight +
      normalizedTrustScore * trustScoreWeight +
      normalizedExperience * experienceWeight
    ) * 1000; // Scale up for easier sorting
  }

  /**
   * Find suitable opponents based on trust score
   * @param {number} playerTrustScore - Player's trust score
   * @param {Array} availablePlayers - Available players for matching
   * @returns {Array} Suitable opponents
   */
  findSuitableOpponents(playerTrustScore, availablePlayers) {
    const range = this.getMatchmakingRange(playerTrustScore);
    
    return availablePlayers.filter(player => {
      const opponentTrustScore = player.stats?.trustScore || this.baseScore;
      return opponentTrustScore >= range.min && opponentTrustScore <= range.max;
    });
  }
}

// Singleton instance
let trustScoreServiceInstance = null;

function getTrustScoreService() {
  if (!trustScoreServiceInstance) {
    trustScoreServiceInstance = new TrustScoreService();
  }
  return trustScoreServiceInstance;
}

module.exports = {
  TrustScoreService,
  getTrustScoreService
};