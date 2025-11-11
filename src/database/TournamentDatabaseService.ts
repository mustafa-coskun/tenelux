import {
  PartyLobbyRepository,
  TournamentRepository,
  TournamentStatisticsRepository,
  TournamentHistoryRepository,
  TournamentMatchRepository,
  TournamentChatRepository
} from './repositories';

/**
 * Tournament Database Service
 * 
 * Provides a unified interface to all tournament-related database operations.
 * This service coordinates between different repositories to ensure data consistency
 * and provides transaction support for complex operations.
 */
export class TournamentDatabaseService {
  private partyLobbyRepo: PartyLobbyRepository;
  private tournamentRepo: TournamentRepository;
  private statisticsRepo: TournamentStatisticsRepository;
  private historyRepo: TournamentHistoryRepository;
  private matchRepo: TournamentMatchRepository;
  private chatRepo: TournamentChatRepository;

  constructor() {
    this.partyLobbyRepo = new PartyLobbyRepository();
    this.tournamentRepo = new TournamentRepository();
    this.statisticsRepo = new TournamentStatisticsRepository();
    this.historyRepo = new TournamentHistoryRepository();
    this.matchRepo = new TournamentMatchRepository();
    this.chatRepo = new TournamentChatRepository();
  }

  // Repository getters for direct access when needed
  get partyLobby(): PartyLobbyRepository {
    return this.partyLobbyRepo;
  }

  get tournament(): TournamentRepository {
    return this.tournamentRepo;
  }

  get statistics(): TournamentStatisticsRepository {
    return this.statisticsRepo;
  }

  get history(): TournamentHistoryRepository {
    return this.historyRepo;
  }

  get match(): TournamentMatchRepository {
    return this.matchRepo;
  }

  get chat(): TournamentChatRepository {
    return this.chatRepo;
  }

  /**
   * Initialize tournament statistics when a tournament is created
   */
  async initializeTournamentData(tournamentId: string): Promise<void> {
    await this.statisticsRepo.createTournamentStatistics(tournamentId);
  }

  /**
   * Complete tournament cleanup - archives data and cleans up active records
   */
  async completeTournament(
    tournamentId: string,
    lobbyCode: string
  ): Promise<string> {
    const tournament = await this.tournamentRepo.getTournamentById(tournamentId);
    const statistics = await this.statisticsRepo.getTournamentStatistics(tournamentId);
    const rankings = await this.statisticsRepo.getTournamentRankings(tournamentId);

    if (!statistics || rankings.length === 0) {
      throw new Error('Cannot archive tournament without statistics and rankings');
    }

    // Archive the tournament
    const historyId = await this.historyRepo.archiveTournament(
      tournament,
      statistics,
      rankings,
      lobbyCode
    );

    return historyId;
  }

  /**
   * Clean up old data based on retention policies
   */
  async performMaintenance(options: {
    deleteOldHistory?: number; // days
    cleanupOldMessages?: number; // days
  } = {}): Promise<{
    deletedHistoryRecords: number;
    deletedMessages: number;
  }> {
    const results = {
      deletedHistoryRecords: 0,
      deletedMessages: 0
    };

    if (options.deleteOldHistory) {
      results.deletedHistoryRecords = await this.historyRepo.deleteOldHistory(
        options.deleteOldHistory
      );
    }

    if (options.cleanupOldMessages) {
      results.deletedMessages = await this.chatRepo.cleanupOldMessages(
        options.cleanupOldMessages
      );
    }

    return results;
  }

  /**
   * Get comprehensive tournament analytics
   */
  async getTournamentAnalytics(): Promise<{
    totalActiveTournaments: number;
    totalCompletedTournaments: number;
    totalArchivedTournaments: number;
    formatDistribution: { format: string; count: number }[];
    recentActivity: {
      tournamentsThisWeek: number;
      tournamentsThisMonth: number;
    };
  }> {
    const [activeTournaments, completedTournaments, historyStats] = await Promise.all([
      this.tournamentRepo.getActiveTournaments(),
      this.tournamentRepo.getCompletedTournaments(1000), // Get all completed
      this.historyRepo.getTournamentHistoryStats()
    ]);

    // Calculate recent activity (simplified - would need date filtering in real implementation)
    const recentActivity = {
      tournamentsThisWeek: 0, // Would need proper date filtering
      tournamentsThisMonth: 0 // Would need proper date filtering
    };

    return {
      totalActiveTournaments: activeTournaments.length,
      totalCompletedTournaments: completedTournaments.length,
      totalArchivedTournaments: historyStats.totalArchivedTournaments,
      formatDistribution: historyStats.formatDistribution,
      recentActivity
    };
  }

  /**
   * Health check for tournament database
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    checks: {
      name: string;
      status: 'pass' | 'fail';
      message?: string;
    }[];
  }> {
    const checks = [];

    try {
      // Test basic repository operations
      await this.partyLobbyRepo.getActiveLobbies();
      checks.push({ name: 'PartyLobbyRepository', status: 'pass' as const });
    } catch (error) {
      checks.push({ 
        name: 'PartyLobbyRepository', 
        status: 'fail' as const, 
        message: (error as Error).message 
      });
    }

    try {
      await this.tournamentRepo.getActiveTournaments();
      checks.push({ name: 'TournamentRepository', status: 'pass' as const });
    } catch (error) {
      checks.push({ 
        name: 'TournamentRepository', 
        status: 'fail' as const, 
        message: (error as Error).message 
      });
    }

    try {
      await this.historyRepo.getTournamentHistoryStats();
      checks.push({ name: 'TournamentHistoryRepository', status: 'pass' as const });
    } catch (error) {
      checks.push({ 
        name: 'TournamentHistoryRepository', 
        status: 'fail' as const, 
        message: (error as Error).message 
      });
    }

    const failedChecks = checks.filter(check => check.status === 'fail');
    const status = failedChecks.length === 0 ? 'healthy' : 
                  failedChecks.length < checks.length ? 'warning' : 'error';

    return { status, checks };
  }
}

export default TournamentDatabaseService;