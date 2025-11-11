import {
  Tournament,
  TournamentPlayer,
  ActiveMatch,
  PlayerStatus,
  ChatMessage,
  ChatMessageType,
  PartyMessage,
  PartyMessageType
} from '../types/party';
import { GameSession } from '../types';

/**
 * Spectator Service
 * Manages spectator functionality for eliminated tournament players
 */
export class SpectatorService {
  private spectators: Map<string, TournamentPlayer> = new Map(); // tournamentId -> spectators
  private spectatorMessages: Map<string, ChatMessage[]> = new Map(); // tournamentId -> messages
  private watchingMatches: Map<string, Set<string>> = new Map(); // matchId -> spectator player IDs
  private spectatorSessions: Map<string, string> = new Map(); // spectatorId -> currentMatchId

  /**
   * Add a player as spectator when they are eliminated
   */
  addSpectator(tournamentId: string, player: TournamentPlayer): void {
    // Update player status
    player.status = PlayerStatus.SPECTATING;
    player.isEliminated = true;

    // Add to spectators list
    const spectatorKey = `${tournamentId}_${player.id}`;
    this.spectators.set(spectatorKey, player);

    // Initialize spectator messages if not exists
    if (!this.spectatorMessages.has(tournamentId)) {
      this.spectatorMessages.set(tournamentId, []);
    }

    // Send welcome message
    this.addSystemMessage(
      tournamentId,
      `${player.name} has been eliminated and is now spectating the tournament.`
    );

    console.log(`👁️ Player ${player.name} is now spectating tournament ${tournamentId}`);
  }

  /**
   * Remove spectator from tournament
   */
  removeSpectator(tournamentId: string, playerId: string): void {
    const spectatorKey = `${tournamentId}_${playerId}`;
    const spectator = this.spectators.get(spectatorKey);

    if (spectator) {
      // Remove from watching any matches
      this.stopWatchingMatch(playerId);

      // Remove from spectators
      this.spectators.delete(spectatorKey);
      this.spectatorSessions.delete(playerId);

      // Send goodbye message
      this.addSystemMessage(
        tournamentId,
        `${spectator.name} has left the tournament.`
      );

      console.log(`👋 Spectator ${spectator.name} left tournament ${tournamentId}`);
    }
  }

  /**
   * Get all spectators for a tournament
   */
  getSpectators(tournamentId: string): TournamentPlayer[] {
    const spectators: TournamentPlayer[] = [];
    
    for (const [key, spectator] of Array.from(this.spectators.entries())) {
      if (key.startsWith(`${tournamentId}_`)) {
        spectators.push(spectator);
      }
    }

    return spectators;
  }

  /**
   * Start watching a specific match
   */
  startWatchingMatch(spectatorId: string, matchId: string): void {
    // Stop watching previous match if any
    this.stopWatchingMatch(spectatorId);

    // Add to watching list
    if (!this.watchingMatches.has(matchId)) {
      this.watchingMatches.set(matchId, new Set());
    }
    this.watchingMatches.get(matchId)!.add(spectatorId);

    // Update spectator session
    this.spectatorSessions.set(spectatorId, matchId);

    console.log(`👁️ Spectator ${spectatorId} started watching match ${matchId}`);
  }

  /**
   * Stop watching current match
   */
  stopWatchingMatch(spectatorId: string): void {
    const currentMatchId = this.spectatorSessions.get(spectatorId);
    
    if (currentMatchId) {
      const watchers = this.watchingMatches.get(currentMatchId);
      if (watchers) {
        watchers.delete(spectatorId);
        if (watchers.size === 0) {
          this.watchingMatches.delete(currentMatchId);
        }
      }
      this.spectatorSessions.delete(spectatorId);
    }
  }

  /**
   * Get spectators watching a specific match
   */
  getMatchSpectators(matchId: string): string[] {
    const watchers = this.watchingMatches.get(matchId);
    return watchers ? Array.from(watchers) : [];
  }

  /**
   * Send spectator chat message
   */
  sendSpectatorMessage(
    tournamentId: string, 
    spectatorId: string, 
    message: string
  ): ChatMessage | null {
    const spectatorKey = `${tournamentId}_${spectatorId}`;
    const spectator = this.spectators.get(spectatorKey);

    if (!spectator) {
      console.error(`Spectator ${spectatorId} not found in tournament ${tournamentId}`);
      return null;
    }

    // Validate message
    if (!message.trim() || message.length > 200) {
      return null;
    }

    const chatMessage: ChatMessage = {
      id: this.generateMessageId(),
      lobbyId: tournamentId,
      senderId: spectatorId,
      senderName: spectator.name,
      message: message.trim(),
      timestamp: new Date(),
      type: ChatMessageType.PLAYER_MESSAGE
    };

    // Add to spectator messages
    const messages = this.spectatorMessages.get(tournamentId) || [];
    messages.push(chatMessage);
    this.spectatorMessages.set(tournamentId, messages);

    // Keep only last 100 messages
    if (messages.length > 100) {
      messages.splice(0, messages.length - 100);
    }

    console.log(`💬 Spectator message from ${spectator.name}: ${message}`);
    return chatMessage;
  }

  /**
   * Get spectator chat messages for tournament
   */
  getSpectatorMessages(tournamentId: string): ChatMessage[] {
    return this.spectatorMessages.get(tournamentId) || [];
  }

  /**
   * Add system message to spectator chat
   */
  addSystemMessage(tournamentId: string, message: string): void {
    const systemMessage: ChatMessage = {
      id: this.generateMessageId(),
      lobbyId: tournamentId,
      senderId: 'system',
      senderName: 'System',
      message,
      timestamp: new Date(),
      type: ChatMessageType.SYSTEM_MESSAGE
    };

    const messages = this.spectatorMessages.get(tournamentId) || [];
    messages.push(systemMessage);
    this.spectatorMessages.set(tournamentId, messages);
  }

  /**
   * Notify spectators of match events
   */
  notifySpectators(
    tournamentId: string, 
    matchId: string, 
    eventType: 'match_started' | 'match_completed' | 'round_completed',
    data?: any
  ): PartyMessage[] {
    const notifications: PartyMessage[] = [];
    const spectators = this.getSpectators(tournamentId);

    if (spectators.length === 0) {
      return notifications;
    }

    let message = '';
    switch (eventType) {
      case 'match_started':
        message = `🎮 Match started: ${data?.player1Name} vs ${data?.player2Name}`;
        break;
      case 'match_completed':
        message = `🏁 Match completed: ${data?.winnerName} defeated ${data?.loserName}`;
        break;
      case 'round_completed':
        message = `📊 Round ${data?.roundNumber} completed in match ${matchId}`;
        break;
    }

    if (message) {
      this.addSystemMessage(tournamentId, message);

      // Create notification for spectators
      const notification: PartyMessage = {
        type: PartyMessageType.SYSTEM_MESSAGE,
        lobbyId: tournamentId,
        senderId: 'system',
        data: {
          message,
          eventType,
          matchId,
          ...data
        },
        timestamp: new Date()
      };

      notifications.push(notification);
    }

    return notifications;
  }

  /**
   * Get spectator view data for a match
   */
  getSpectatorMatchView(matchId: string, gameSession?: GameSession): any {
    const spectatorCount = this.getMatchSpectators(matchId).length;

    return {
      matchId,
      spectatorCount,
      isLive: gameSession ? !gameSession.endTime : false,
      currentRound: gameSession?.rounds.length || 0,
      maxRounds: gameSession?.sessionConfig.maxRounds || 10,
      gamePhase: gameSession?.currentPhase || 'trust_phase',
      // Don't expose actual decisions to spectators for fairness
      playersStatus: gameSession?.players.map(player => ({
        id: player.id,
        name: player.name,
        isThinking: true // Always show as thinking to maintain suspense
      })) || []
    };
  }

  /**
   * Check if player is spectating
   */
  isSpectating(tournamentId: string, playerId: string): boolean {
    const spectatorKey = `${tournamentId}_${playerId}`;
    return this.spectators.has(spectatorKey);
  }

  /**
   * Get current match being watched by spectator
   */
  getCurrentWatchingMatch(spectatorId: string): string | null {
    return this.spectatorSessions.get(spectatorId) || null;
  }

  /**
   * Update spectator with tournament progress
   */
  updateSpectatorTournamentStatus(
    tournamentId: string, 
    tournament: Tournament, 
    activeMatches: ActiveMatch[]
  ): void {
    const spectators = this.getSpectators(tournamentId);
    
    if (spectators.length > 0) {
      const statusMessage = `🏆 Tournament Update: Round ${tournament.currentRound}/${tournament.totalRounds} - ${activeMatches.length} active matches`;
      this.addSystemMessage(tournamentId, statusMessage);
    }
  }

  /**
   * Clean up spectator data for completed tournament
   */
  cleanupTournament(tournamentId: string): void {
    // Remove all spectators for this tournament
    const keysToRemove: string[] = [];
    for (const [key] of Array.from(this.spectators.entries())) {
      if (key.startsWith(`${tournamentId}_`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => {
      this.spectators.delete(key);
    });

    // Clear spectator messages
    this.spectatorMessages.delete(tournamentId);

    // Clear watching sessions for this tournament's matches
    for (const [spectatorId, matchId] of Array.from(this.spectatorSessions.entries())) {
      // This is a simplified cleanup - in a real implementation,
      // you'd need to track which matches belong to which tournament
      this.stopWatchingMatch(spectatorId);
    }

    console.log(`🧹 Cleaned up spectator data for tournament ${tournamentId}`);
  }

  /**
   * Get spectator statistics
   */
  getSpectatorStats(tournamentId: string): {
    totalSpectators: number;
    activeWatchers: number;
    totalMessages: number;
  } {
    const spectators = this.getSpectators(tournamentId);
    const messages = this.getSpectatorMessages(tournamentId);
    
    let activeWatchers = 0;
    for (const spectator of spectators) {
      if (this.getCurrentWatchingMatch(spectator.id)) {
        activeWatchers++;
      }
    }

    return {
      totalSpectators: spectators.length,
      activeWatchers,
      totalMessages: messages.length
    };
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default SpectatorService;