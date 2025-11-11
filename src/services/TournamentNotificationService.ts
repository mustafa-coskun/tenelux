import {
  Tournament,
  TournamentPlayer,
  TournamentMatch,
  MatchResult,
  TournamentRound,
  TournamentStatistics,
  TournamentRanking,
  PartyMessage,
  PartyMessageType,
  TournamentUpdate,
  TournamentUpdateType,
  ChatMessage,
  ChatMessageType,
  PlayerStatus,
} from '../types/party';
import { PartyWebSocketServer } from './PartyWebSocketServer';

/**
 * Service for managing tournament notifications and real-time updates
 * Handles match ready notifications, bracket updates, and tournament completion announcements
 */
export class TournamentNotificationService {
  private partyWebSocketServer: PartyWebSocketServer;
  private notificationQueue: Map<string, NotificationQueueItem[]>; // tournamentId -> notifications
  private playerNotificationPreferences: Map<string, NotificationPreferences>; // playerId -> preferences

  constructor(partyWebSocketServer: PartyWebSocketServer) {
    this.partyWebSocketServer = partyWebSocketServer;
    this.notificationQueue = new Map();
    this.playerNotificationPreferences = new Map();
  }

  /**
   * Notify players when their match is ready to begin
   */
  notifyMatchReady(
    tournament: Tournament,
    match: TournamentMatch,
    player1: TournamentPlayer,
    player2: TournamentPlayer
  ): void {
    const notification: MatchReadyNotification = {
      type: 'match_ready',
      tournamentId: tournament.id,
      matchId: match.id,
      roundNumber: match.roundNumber,
      opponent: player2,
      estimatedStartTime: new Date(Date.now() + 30000), // 30 seconds from now
      timeToRespond: 60000, // 1 minute to respond
    };

    // Send to player 1
    this.sendMatchReadyNotification(player1.id, {
      ...notification,
      opponent: player2,
    });

    // Send to player 2
    this.sendMatchReadyNotification(player2.id, {
      ...notification,
      opponent: player1,
    });

    // Notify other tournament participants about the upcoming match
    this.broadcastTournamentUpdate(tournament.id, {
      type: TournamentUpdateType.MATCH_RESULT,
      tournamentId: tournament.id,
      data: {
        matchId: match.id,
        roundNumber: match.roundNumber,
        status: 'starting_soon',
        players: [player1.name, player2.name],
      },
      timestamp: new Date(),
    });

    // Add system message to tournament chat
    this.sendSystemMessage(tournament.lobbyId, {
      id: `match_ready_${match.id}`,
      lobbyId: tournament.lobbyId,
      senderId: 'system',
      senderName: 'Tournament System',
      message: `Match starting soon: ${player1.name} vs ${player2.name} (Round ${match.roundNumber})`,
      timestamp: new Date(),
      type: ChatMessageType.TOURNAMENT_UPDATE,
    });
  }

  /**
   * Broadcast bracket updates to all tournament participants
   */
  broadcastBracketUpdate(
    tournament: Tournament,
    updatedRound: TournamentRound,
    eliminatedPlayers?: TournamentPlayer[]
  ): void {
    const bracketUpdate: BracketUpdateNotification = {
      type: 'bracket_update',
      tournamentId: tournament.id,
      roundNumber: updatedRound.roundNumber,
      updatedMatches: updatedRound.matches,
      eliminatedPlayers: eliminatedPlayers || [],
      nextRoundMatches: this.getNextRoundPreview(tournament, updatedRound.roundNumber),
    };

    // Broadcast to all tournament participants
    this.partyWebSocketServer.broadcastToLobby(tournament.lobbyId, {
      type: PartyMessageType.BRACKET_UPDATE,
      lobbyId: tournament.lobbyId,
      senderId: 'system',
      data: bracketUpdate,
      timestamp: new Date(),
    });

    // Send individual notifications to eliminated players
    if (eliminatedPlayers && eliminatedPlayers.length > 0) {
      eliminatedPlayers.forEach(player => {
        this.sendPlayerEliminationNotification(player, tournament);
      });
    }

    // Update tournament statistics
    this.broadcastTournamentUpdate(tournament.id, {
      type: TournamentUpdateType.BRACKET_UPDATED,
      tournamentId: tournament.id,
      data: {
        roundNumber: updatedRound.roundNumber,
        completedMatches: updatedRound.matches.filter(m => m.status === 'completed').length,
        totalMatches: updatedRound.matches.length,
        eliminatedCount: eliminatedPlayers?.length || 0,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Announce tournament completion with final results
   */
  announceTournamentCompletion(
    tournament: Tournament,
    finalRankings: TournamentRanking[],
    statistics: TournamentStatistics
  ): void {
    const completionNotification: TournamentCompletionNotification = {
      type: 'tournament_completed',
      tournamentId: tournament.id,
      winner: finalRankings[0],
      finalRankings: finalRankings,
      statistics: statistics,
      duration: statistics.duration,
      totalMatches: statistics.totalMatches,
    };

    // Broadcast completion to all participants
    this.partyWebSocketServer.broadcastToLobby(tournament.lobbyId, {
      type: PartyMessageType.TOURNAMENT_COMPLETED,
      lobbyId: tournament.lobbyId,
      senderId: 'system',
      data: completionNotification,
      timestamp: new Date(),
    });

    // Send individual congratulations to winner
    if (finalRankings.length > 0) {
      this.sendWinnerNotification(finalRankings[0].player, tournament, finalRankings[0]);
    }

    // Send final statistics to all players
    finalRankings.forEach((ranking, index) => {
      this.sendFinalRankingNotification(ranking.player, tournament, ranking, index + 1);
    });

    // Add final system message
    this.sendSystemMessage(tournament.lobbyId, {
      id: `tournament_completed_${tournament.id}`,
      lobbyId: tournament.lobbyId,
      senderId: 'system',
      senderName: 'Tournament System',
      message: `🏆 Tournament completed! Winner: ${finalRankings[0]?.player.name || 'Unknown'}`,
      timestamp: new Date(),
      type: ChatMessageType.TOURNAMENT_UPDATE,
    });

    // Clean up notification queue for this tournament
    this.notificationQueue.delete(tournament.id);
  }

  /**
   * Notify about match completion and results
   */
  notifyMatchCompletion(
    tournament: Tournament,
    match: TournamentMatch,
    result: MatchResult
  ): void {
    const winner = tournament.players.find(p => p.id === result.winnerId);
    const loser = tournament.players.find(p => p.id === result.loserId);

    if (!winner || !loser) {
      console.error('Could not find winner or loser for match result notification');
      return;
    }

    // Broadcast match result to all tournament participants
    this.partyWebSocketServer.broadcastToLobby(tournament.lobbyId, {
      type: PartyMessageType.MATCH_COMPLETED,
      lobbyId: tournament.lobbyId,
      senderId: 'system',
      data: {
        matchId: match.id,
        roundNumber: match.roundNumber,
        winner: winner.name,
        loser: loser.name,
        score: `${result.player1Score} - ${result.player2Score}`,
        statistics: result.statistics,
      },
      timestamp: new Date(),
    });

    // Send system message about match result
    this.sendSystemMessage(tournament.lobbyId, {
      id: `match_completed_${match.id}`,
      lobbyId: tournament.lobbyId,
      senderId: 'system',
      senderName: 'Tournament System',
      message: `Match completed: ${winner.name} defeated ${loser.name} (${result.player1Score}-${result.player2Score})`,
      timestamp: new Date(),
      type: ChatMessageType.TOURNAMENT_UPDATE,
    });

    // Update tournament progress
    this.broadcastTournamentUpdate(tournament.id, {
      type: TournamentUpdateType.MATCH_RESULT,
      tournamentId: tournament.id,
      data: {
        matchId: match.id,
        roundNumber: match.roundNumber,
        result: result,
        winner: winner,
        loser: loser,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Notify about round completion and advancement
   */
  notifyRoundCompletion(
    tournament: Tournament,
    completedRound: TournamentRound,
    nextRound?: TournamentRound
  ): void {
    // Broadcast round completion
    this.partyWebSocketServer.broadcastToLobby(tournament.lobbyId, {
      type: PartyMessageType.ROUND_COMPLETED,
      lobbyId: tournament.lobbyId,
      senderId: 'system',
      data: {
        roundNumber: completedRound.roundNumber,
        completedMatches: completedRound.matches.length,
        nextRound: nextRound ? {
          roundNumber: nextRound.roundNumber,
          matchCount: nextRound.matches.length,
          estimatedStartTime: nextRound.startTime,
        } : null,
      },
      timestamp: new Date(),
    });

    // Send system message
    const message = nextRound 
      ? `Round ${completedRound.roundNumber} completed! Round ${nextRound.roundNumber} starting soon...`
      : `Round ${completedRound.roundNumber} completed! Tournament finishing...`;

    this.sendSystemMessage(tournament.lobbyId, {
      id: `round_completed_${completedRound.roundNumber}`,
      lobbyId: tournament.lobbyId,
      senderId: 'system',
      senderName: 'Tournament System',
      message: message,
      timestamp: new Date(),
      type: ChatMessageType.TOURNAMENT_UPDATE,
    });

    // Update tournament progress
    this.broadcastTournamentUpdate(tournament.id, {
      type: TournamentUpdateType.ROUND_ADVANCED,
      tournamentId: tournament.id,
      data: {
        completedRound: completedRound.roundNumber,
        nextRound: nextRound?.roundNumber,
        remainingPlayers: tournament.players.filter(p => !p.isEliminated).length,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Send player status updates (waiting, in match, eliminated, etc.)
   */
  notifyPlayerStatusUpdate(
    tournament: Tournament,
    player: TournamentPlayer,
    newStatus: PlayerStatus,
    additionalData?: any
  ): void {
    // Update player status in tournament
    player.status = newStatus;

    // Broadcast status update to all tournament participants
    this.partyWebSocketServer.broadcastToLobby(tournament.lobbyId, {
      type: PartyMessageType.PLAYER_STATUS_UPDATE,
      lobbyId: tournament.lobbyId,
      senderId: 'system',
      data: {
        playerId: player.id,
        playerName: player.name,
        status: newStatus,
        additionalData: additionalData,
      },
      timestamp: new Date(),
    });

    // Send specific notifications based on status
    switch (newStatus) {
      case PlayerStatus.ELIMINATED:
        this.sendPlayerEliminationNotification(player, tournament);
        break;
      case PlayerStatus.IN_MATCH:
        // Match start notification is handled separately
        break;
      case PlayerStatus.WAITING:
        this.sendPlayerWaitingNotification(player, tournament);
        break;
    }
  }

  /**
   * Send waiting time estimates to players
   */
  sendWaitTimeEstimate(
    tournament: Tournament,
    player: TournamentPlayer,
    estimatedWaitTime: number,
    currentPosition?: number
  ): void {
    this.partyWebSocketServer.sendToPlayer(player.id, {
      type: 'TOURNAMENT_UPDATE' as any,
      payload: {
        type: TournamentUpdateType.BRACKET_UPDATED,
        tournamentId: tournament.id,
        data: {
          waitTimeEstimate: estimatedWaitTime,
          currentPosition: currentPosition,
          message: `Estimated wait time: ${Math.ceil(estimatedWaitTime / 60000)} minutes`,
        },
        timestamp: new Date(),
      },
      timestamp: new Date(),
    });
  }

  // Private helper methods

  private sendMatchReadyNotification(playerId: string, notification: MatchReadyNotification): void {
    this.partyWebSocketServer.sendToPlayer(playerId, {
      type: 'MATCH_READY' as any,
      payload: notification,
      timestamp: new Date(),
    });
  }

  private sendPlayerEliminationNotification(player: TournamentPlayer, tournament: Tournament): void {
    this.partyWebSocketServer.sendToPlayer(player.id, {
      type: 'TOURNAMENT_UPDATE' as any,
      payload: {
        type: TournamentUpdateType.PLAYER_ELIMINATED,
        tournamentId: tournament.id,
        data: {
          message: 'You have been eliminated from the tournament',
          finalRank: player.currentRank,
          canSpectate: true,
        },
        timestamp: new Date(),
      },
      timestamp: new Date(),
    });
  }

  private sendWinnerNotification(player: TournamentPlayer, tournament: Tournament, ranking: TournamentRanking): void {
    this.partyWebSocketServer.sendToPlayer(player.id, {
      type: 'TOURNAMENT_UPDATE' as any,
      payload: {
        type: TournamentUpdateType.TOURNAMENT_COMPLETED,
        tournamentId: tournament.id,
        data: {
          message: '🏆 Congratulations! You won the tournament!',
          finalRank: 1,
          finalScore: ranking.finalScore,
          tournamentPoints: ranking.tournamentPoints,
        },
        timestamp: new Date(),
      },
      timestamp: new Date(),
    });
  }

  private sendFinalRankingNotification(
    player: TournamentPlayer,
    tournament: Tournament,
    ranking: TournamentRanking,
    rank: number
  ): void {
    this.partyWebSocketServer.sendToPlayer(player.id, {
      type: 'TOURNAMENT_UPDATE' as any,
      payload: {
        type: TournamentUpdateType.TOURNAMENT_COMPLETED,
        tournamentId: tournament.id,
        data: {
          message: `Tournament finished! Final rank: #${rank}`,
          finalRank: rank,
          finalScore: ranking.finalScore,
          matchRecord: ranking.matchRecord,
          cooperationPercentage: ranking.cooperationPercentage,
          tournamentPoints: ranking.tournamentPoints,
        },
        timestamp: new Date(),
      },
      timestamp: new Date(),
    });
  }

  private sendPlayerWaitingNotification(player: TournamentPlayer, tournament: Tournament): void {
    this.partyWebSocketServer.sendToPlayer(player.id, {
      type: 'TOURNAMENT_UPDATE' as any,
      payload: {
        type: TournamentUpdateType.BRACKET_UPDATED,
        tournamentId: tournament.id,
        data: {
          message: 'Waiting for next match...',
          status: 'waiting',
        },
        timestamp: new Date(),
      },
      timestamp: new Date(),
    });
  }

  private sendSystemMessage(lobbyId: string, message: ChatMessage): void {
    this.partyWebSocketServer.broadcastToLobby(lobbyId, {
      type: PartyMessageType.SYSTEM_MESSAGE,
      lobbyId: lobbyId,
      senderId: 'system',
      data: message,
      timestamp: new Date(),
    });
  }

  private broadcastTournamentUpdate(tournamentId: string, update: TournamentUpdate): void {
    this.partyWebSocketServer.broadcastToTournament(tournamentId, {
      type: 'TOURNAMENT_UPDATE' as any,
      payload: update,
      timestamp: new Date(),
    });
  }

  private getNextRoundPreview(tournament: Tournament, currentRound: number): TournamentMatch[] {
    // This would typically come from the tournament engine
    // For now, return empty array as placeholder
    return [];
  }

  // Public utility methods

  /**
   * Set notification preferences for a player
   */
  setPlayerNotificationPreferences(playerId: string, preferences: NotificationPreferences): void {
    this.playerNotificationPreferences.set(playerId, preferences);
  }

  /**
   * Get notification preferences for a player
   */
  getPlayerNotificationPreferences(playerId: string): NotificationPreferences {
    return this.playerNotificationPreferences.get(playerId) || {
      matchReady: true,
      bracketUpdates: true,
      tournamentCompletion: true,
      playerElimination: true,
      systemMessages: true,
    };
  }

  /**
   * Queue a notification for later delivery
   */
  queueNotification(tournamentId: string, notification: NotificationQueueItem): void {
    if (!this.notificationQueue.has(tournamentId)) {
      this.notificationQueue.set(tournamentId, []);
    }
    this.notificationQueue.get(tournamentId)!.push(notification);
  }

  /**
   * Process queued notifications for a tournament
   */
  processQueuedNotifications(tournamentId: string): void {
    const notifications = this.notificationQueue.get(tournamentId);
    if (!notifications || notifications.length === 0) {
      return;
    }

    notifications.forEach(notification => {
      // Process each notification based on its type
      switch (notification.type) {
        case 'match_ready':
          // Re-send match ready notification
          break;
        case 'bracket_update':
          // Re-send bracket update
          break;
        // Add other notification types as needed
      }
    });

    // Clear processed notifications
    this.notificationQueue.set(tournamentId, []);
  }
}

// Notification type interfaces
interface MatchReadyNotification {
  type: 'match_ready';
  tournamentId: string;
  matchId: string;
  roundNumber: number;
  opponent: TournamentPlayer;
  estimatedStartTime: Date;
  timeToRespond: number;
}

interface BracketUpdateNotification {
  type: 'bracket_update';
  tournamentId: string;
  roundNumber: number;
  updatedMatches: TournamentMatch[];
  eliminatedPlayers: TournamentPlayer[];
  nextRoundMatches: TournamentMatch[];
}

interface TournamentCompletionNotification {
  type: 'tournament_completed';
  tournamentId: string;
  winner: TournamentRanking;
  finalRankings: TournamentRanking[];
  statistics: TournamentStatistics;
  duration: number;
  totalMatches: number;
}

interface NotificationPreferences {
  matchReady: boolean;
  bracketUpdates: boolean;
  tournamentCompletion: boolean;
  playerElimination: boolean;
  systemMessages: boolean;
}

interface NotificationQueueItem {
  type: string;
  data: any;
  timestamp: Date;
  retryCount?: number;
}