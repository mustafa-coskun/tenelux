/**
 * MatchRecordingService
 * 
 * Handles recording of multiplayer and tournament matches to the database.
 * Includes player statistics updates and retry mechanisms.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.5
 */

import { GameSession, Round, Decision } from '../types';
import { MatchResult, TournamentMatch } from '../types/party';
import { getDatabaseRetryService } from './DatabaseRetryService';

interface MultiplayerMatchData {
  matchId: string;
  player1Id: string;
  player2Id: string;
  player1Score: number;
  player2Score: number;
  winnerId: string;
  rounds: Round[];
  gameMode: 'multiplayer' | 'tournament';
  gameDuration: number;
  timestamp: Date;
}

interface TournamentMatchData extends MultiplayerMatchData {
  tournamentId: string;
  roundNumber: number;
  isEliminationMatch: boolean;
  bracketPosition?: string;
  gameMode: 'tournament';
}

interface PlayerStatsUpdate {
  userId: string;
  totalGames: number;
  wins: number;
  losses: number;
  cooperations: number;
  betrayals: number;
  totalScore: number;
  trustScore: number;
}

class MatchRecordingService {
  private retryService = getDatabaseRetryService();
  private readonly API_BASE_URL = '/api';

  /**
   * Save a multiplayer match result
   * Requirements: 7.1, 7.5
   */
  async saveMultiplayerMatch(matchData: MultiplayerMatchData): Promise<void> {
    console.log('💾 Saving multiplayer match:', matchData.matchId);

    try {
      // Execute with retry mechanism
      await this.retryService.executeWithRetry(async () => {
        // Save match to database
        const response = await fetch(`${this.API_BASE_URL}/matches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            match_id: matchData.matchId,
            player1_id: matchData.player1Id,
            player2_id: matchData.player2Id,
            player1_score: matchData.player1Score,
            player2_score: matchData.player2Score,
            winner_id: matchData.winnerId,
            game_mode: 'multiplayer',
            rounds_played: matchData.rounds.length,
            game_duration: matchData.gameDuration,
            created_at: matchData.timestamp.toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to save match: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ Multiplayer match saved successfully:', result);

        // Update player statistics
        await this.updatePlayerStatistics(matchData);
      });
    } catch (error) {
      console.error('❌ Failed to save multiplayer match after retries:', error);
      
      // Queue for later if all retries failed
      this.retryService.queueOperation(
        'match',
        () => this.saveMultiplayerMatch(matchData),
        matchData
      );
      
      throw error;
    }
  }

  /**
   * Save a tournament match result
   * Requirements: 7.2, 7.5
   */
  async saveTournamentMatch(matchData: TournamentMatchData): Promise<void> {
    console.log('💾 Saving tournament match:', matchData.matchId);

    try {
      await this.retryService.executeWithRetry(async () => {
        // Save match with tournament context
        const response = await fetch(`${this.API_BASE_URL}/matches/tournament`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            match_id: matchData.matchId,
            tournament_id: matchData.tournamentId,
            round_number: matchData.roundNumber,
            player1_id: matchData.player1Id,
            player2_id: matchData.player2Id,
            player1_score: matchData.player1Score,
            player2_score: matchData.player2Score,
            winner_id: matchData.winnerId,
            game_mode: 'tournament',
            rounds_played: matchData.rounds.length,
            game_duration: matchData.gameDuration,
            is_elimination_match: matchData.isEliminationMatch,
            bracket_position: matchData.bracketPosition,
            created_at: matchData.timestamp.toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to save tournament match: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ Tournament match saved successfully:', result);

        // Update player statistics
        await this.updatePlayerStatistics(matchData);
      });
    } catch (error) {
      console.error('❌ Failed to save tournament match after retries:', error);
      
      // Queue for later
      this.retryService.queueOperation(
        'match',
        () => this.saveTournamentMatch(matchData),
        matchData
      );
      
      throw error;
    }
  }

  /**
   * Save tournament final results
   * Requirements: 7.3, 7.5
   */
  async saveTournamentResult(tournamentData: {
    tournamentId: string;
    winnerId: string;
    finalRankings: Array<{
      playerId: string;
      rank: number;
      finalScore: number;
      matchesWon: number;
      matchesLost: number;
    }>;
    statistics: {
      totalMatches: number;
      totalRounds: number;
      duration: number;
      cooperationRate: number;
      betrayalRate: number;
    };
    completedAt: Date;
  }): Promise<void> {
    console.log('💾 Saving tournament result:', tournamentData.tournamentId);

    try {
      await this.retryService.executeWithRetry(async () => {
        const response = await fetch(`${this.API_BASE_URL}/tournaments/results`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tournament_id: tournamentData.tournamentId,
            winner_id: tournamentData.winnerId,
            final_rankings: tournamentData.finalRankings,
            statistics: tournamentData.statistics,
            completed_at: tournamentData.completedAt.toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to save tournament result: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ Tournament result saved successfully:', result);

        // Update tournament statistics for all players
        await this.updateTournamentStatistics(tournamentData);
      });
    } catch (error) {
      console.error('❌ Failed to save tournament result after retries:', error);
      
      // Queue for later
      this.retryService.queueOperation(
        'tournament',
        () => this.saveTournamentResult(tournamentData),
        tournamentData
      );
      
      throw error;
    }
  }

  /**
   * Update player statistics after a match
   * Requirements: 7.1, 7.5
   */
  private async updatePlayerStatistics(
    matchData: MultiplayerMatchData | TournamentMatchData
  ): Promise<void> {
    console.log('📊 Updating player statistics...');

    // Calculate statistics for both players
    const player1Stats = this.calculatePlayerStats(
      matchData.player1Id,
      matchData.rounds,
      matchData.player1Score,
      matchData.winnerId === matchData.player1Id
    );

    const player2Stats = this.calculatePlayerStats(
      matchData.player2Id,
      matchData.rounds,
      matchData.player2Score,
      matchData.winnerId === matchData.player2Id
    );

    // Update both players
    await Promise.all([
      this.updatePlayerStats(player1Stats),
      this.updatePlayerStats(player2Stats),
    ]);

    console.log('✅ Player statistics updated');
  }

  /**
   * Calculate statistics for a player from match rounds
   */
  private calculatePlayerStats(
    playerId: string,
    rounds: Round[],
    totalScore: number,
    isWinner: boolean
  ): PlayerStatsUpdate {
    let cooperations = 0;
    let betrayals = 0;

    // Count cooperations and betrayals
    rounds.forEach((round) => {
      const playerDecision = round.decisions.find((d) => d.playerId === playerId);
      if (playerDecision) {
        if (playerDecision.decision === Decision.STAY_SILENT) {
          cooperations++;
        } else {
          betrayals++;
        }
      }
    });

    // Calculate trust score based on cooperation rate
    const cooperationRate = rounds.length > 0 ? cooperations / rounds.length : 0;
    const trustScore = Math.round(50 + cooperationRate * 50);

    return {
      userId: playerId,
      totalGames: 1,
      wins: isWinner ? 1 : 0,
      losses: isWinner ? 0 : 1,
      cooperations,
      betrayals,
      totalScore,
      trustScore,
    };
  }

  /**
   * Update player stats in database
   */
  private async updatePlayerStats(stats: PlayerStatsUpdate): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/users/${stats.userId}/stats`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          total_games_increment: stats.totalGames,
          wins_increment: stats.wins,
          losses_increment: stats.losses,
          cooperations_increment: stats.cooperations,
          betrayals_increment: stats.betrayals,
          total_score_increment: stats.totalScore,
          trust_score: stats.trustScore,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update player stats: ${response.statusText}`);
      }

      console.log(`✅ Stats updated for player ${stats.userId}`);
    } catch (error) {
      console.error(`❌ Failed to update stats for player ${stats.userId}:`, error);
      throw error;
    }
  }

  /**
   * Update tournament statistics for all players
   */
  private async updateTournamentStatistics(tournamentData: {
    tournamentId: string;
    finalRankings: Array<{
      playerId: string;
      rank: number;
      finalScore: number;
      matchesWon: number;
      matchesLost: number;
    }>;
  }): Promise<void> {
    console.log('📊 Updating tournament statistics for all players...');

    const updates = tournamentData.finalRankings.map((ranking) =>
      this.updateTournamentPlayerStats(ranking)
    );

    await Promise.all(updates);

    console.log('✅ Tournament statistics updated for all players');
  }

  /**
   * Update tournament-specific stats for a player
   */
  private async updateTournamentPlayerStats(ranking: {
    playerId: string;
    rank: number;
    finalScore: number;
    matchesWon: number;
    matchesLost: number;
  }): Promise<void> {
    try {
      const response = await fetch(
        `${this.API_BASE_URL}/users/${ranking.playerId}/tournament-stats`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tournaments_played_increment: 1,
            best_rank: ranking.rank,
            tournament_wins_increment: ranking.rank === 1 ? 1 : 0,
            tournament_matches_won_increment: ranking.matchesWon,
            tournament_matches_lost_increment: ranking.matchesLost,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update tournament stats: ${response.statusText}`);
      }

      console.log(`✅ Tournament stats updated for player ${ranking.playerId}`);
    } catch (error) {
      console.error(
        `❌ Failed to update tournament stats for player ${ranking.playerId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create match data from game session
   */
  createMatchDataFromSession(
    session: GameSession,
    matchId: string,
    winnerId: string
  ): MultiplayerMatchData {
    const player1 = session.players[0];
    const player2 = session.players[1];

    // Calculate scores
    let player1Score = 0;
    let player2Score = 0;

    session.rounds.forEach((round) => {
      player1Score += round.results.playerA;
      player2Score += round.results.playerB;
    });

    const gameDuration = session.endTime
      ? Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 1000)
      : 0;

    return {
      matchId,
      player1Id: player1.id,
      player2Id: player2.id,
      player1Score,
      player2Score,
      winnerId,
      rounds: session.rounds,
      gameMode: 'multiplayer',
      gameDuration,
      timestamp: session.endTime || new Date(),
    };
  }

  /**
   * Create tournament match data from game session
   */
  createTournamentMatchDataFromSession(
    session: GameSession,
    matchId: string,
    tournamentId: string,
    roundNumber: number,
    winnerId: string,
    isEliminationMatch: boolean = true,
    bracketPosition?: string
  ): TournamentMatchData {
    const baseData = this.createMatchDataFromSession(session, matchId, winnerId);

    return {
      ...baseData,
      tournamentId,
      roundNumber,
      isEliminationMatch,
      bracketPosition,
      gameMode: 'tournament',
    };
  }
}

// Singleton instance
let matchRecordingServiceInstance: MatchRecordingService | null = null;

export function getMatchRecordingService(): MatchRecordingService {
  if (!matchRecordingServiceInstance) {
    matchRecordingServiceInstance = new MatchRecordingService();
  }
  return matchRecordingServiceInstance;
}

export { MatchRecordingService };
export type { MultiplayerMatchData, TournamentMatchData, PlayerStatsUpdate };
