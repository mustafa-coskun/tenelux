import {
  ChatMessage,
  ChatMessageType,
  PartyMessage,
  PartyMessageType,
  TournamentPlayer,
  Tournament,
  PlayerStatus,
} from '../types/party';
import { PartyWebSocketServer } from './PartyWebSocketServer';

/**
 * Service for managing tournament chat functionality
 * Handles tournament-wide chat, moderation tools, and player status display
 */
export class TournamentChatService {
  private partyWebSocketServer: PartyWebSocketServer;
  private chatHistory: Map<string, ChatMessage[]>; // lobbyId -> messages
  private mutedPlayers: Map<string, Set<string>>; // lobbyId -> Set of muted playerIds
  private chatModerators: Map<string, Set<string>>; // lobbyId -> Set of moderator playerIds
  private messageFilters: MessageFilter[];
  private rateLimits: Map<string, PlayerRateLimit>; // playerId -> rate limit info

  constructor(partyWebSocketServer: PartyWebSocketServer) {
    this.partyWebSocketServer = partyWebSocketServer;
    this.chatHistory = new Map();
    this.mutedPlayers = new Map();
    this.chatModerators = new Map();
    this.messageFilters = this.initializeMessageFilters();
    this.rateLimits = new Map();

    // Clean up rate limits every minute
    setInterval(() => {
      this.cleanupRateLimits();
    }, 60000);
  }

  /**
   * Send a chat message to the tournament
   */
  sendChatMessage(
    lobbyId: string,
    senderId: string,
    senderName: string,
    message: string,
    tournament?: Tournament
  ): ChatMessageResult {
    // Validate sender
    if (!senderId || !senderName) {
      return {
        success: false,
        error: 'Sender ID and name are required',
        errorCode: 'INVALID_SENDER',
      };
    }

    // Check if player is muted
    if (this.isPlayerMuted(lobbyId, senderId)) {
      return {
        success: false,
        error: 'You are muted and cannot send messages',
        errorCode: 'PLAYER_MUTED',
      };
    }

    // Check rate limiting
    const rateLimitResult = this.checkRateLimit(senderId);
    if (!rateLimitResult.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds`,
        errorCode: 'RATE_LIMITED',
      };
    }

    // Filter message content
    const filteredMessage = this.filterMessage(message);
    if (!filteredMessage.allowed) {
      return {
        success: false,
        error: filteredMessage.reason || 'Message contains inappropriate content',
        errorCode: 'MESSAGE_FILTERED',
      };
    }

    // Create chat message
    const chatMessage: ChatMessage = {
      id: this.generateMessageId(),
      lobbyId: lobbyId,
      senderId: senderId,
      senderName: senderName,
      message: filteredMessage.cleanedMessage || message,
      timestamp: new Date(),
      type: ChatMessageType.PLAYER_MESSAGE,
    };

    // Add player status information if tournament is provided
    if (tournament) {
      const player = tournament.players.find(p => p.id === senderId);
      if (player) {
        chatMessage.playerStatus = player.status;
        chatMessage.isHost = player.isHost;
        chatMessage.isEliminated = player.isEliminated;
      }
    }

    // Store message in history
    this.addMessageToHistory(lobbyId, chatMessage);

    // Update rate limit
    this.updateRateLimit(senderId);

    // Broadcast message to all tournament participants
    this.partyWebSocketServer.broadcastToLobby(lobbyId, {
      type: PartyMessageType.CHAT_MESSAGE,
      lobbyId: lobbyId,
      senderId: senderId,
      data: chatMessage,
      timestamp: new Date(),
    });

    return {
      success: true,
      message: chatMessage,
    };
  }

  /**
   * Send a system message to the tournament chat
   */
  sendSystemMessage(
    lobbyId: string,
    message: string,
    messageType: ChatMessageType = ChatMessageType.SYSTEM_MESSAGE
  ): void {
    const systemMessage: ChatMessage = {
      id: this.generateMessageId(),
      lobbyId: lobbyId,
      senderId: 'system',
      senderName: 'Tournament System',
      message: message,
      timestamp: new Date(),
      type: messageType,
    };

    // Store message in history
    this.addMessageToHistory(lobbyId, systemMessage);

    // Broadcast system message
    this.partyWebSocketServer.broadcastToLobby(lobbyId, {
      type: PartyMessageType.SYSTEM_MESSAGE,
      lobbyId: lobbyId,
      senderId: 'system',
      data: systemMessage,
      timestamp: new Date(),
    });
  }

  /**
   * Mute a player (host/moderator action)
   */
  mutePlayer(
    lobbyId: string,
    moderatorId: string,
    targetPlayerId: string,
    duration?: number
  ): ModerationResult {
    // Check if moderator has permissions
    if (!this.hasModeratorPermissions(lobbyId, moderatorId)) {
      return {
        success: false,
        error: 'Insufficient permissions to mute players',
        errorCode: 'INSUFFICIENT_PERMISSIONS',
      };
    }

    // Add player to muted list
    if (!this.mutedPlayers.has(lobbyId)) {
      this.mutedPlayers.set(lobbyId, new Set());
    }
    this.mutedPlayers.get(lobbyId)!.add(targetPlayerId);

    // Schedule unmute if duration is specified
    if (duration && duration > 0) {
      setTimeout(() => {
        this.unmutePlayer(lobbyId, moderatorId, targetPlayerId);
      }, duration);
    }

    // Send system message about mute
    this.sendSystemMessage(
      lobbyId,
      `Player has been muted by tournament host${duration ? ` for ${Math.ceil(duration / 60000)} minutes` : ''}`,
      ChatMessageType.HOST_MESSAGE
    );

    return {
      success: true,
      action: 'muted',
      targetPlayerId: targetPlayerId,
      duration: duration,
    };
  }

  /**
   * Unmute a player (host/moderator action)
   */
  unmutePlayer(
    lobbyId: string,
    moderatorId: string,
    targetPlayerId: string
  ): ModerationResult {
    // Check if moderator has permissions
    if (!this.hasModeratorPermissions(lobbyId, moderatorId)) {
      return {
        success: false,
        error: 'Insufficient permissions to unmute players',
        errorCode: 'INSUFFICIENT_PERMISSIONS',
      };
    }

    // Remove player from muted list
    const mutedSet = this.mutedPlayers.get(lobbyId);
    if (mutedSet) {
      mutedSet.delete(targetPlayerId);
    }

    // Send system message about unmute
    this.sendSystemMessage(
      lobbyId,
      'Player has been unmuted by tournament host',
      ChatMessageType.HOST_MESSAGE
    );

    return {
      success: true,
      action: 'unmuted',
      targetPlayerId: targetPlayerId,
    };
  }

  /**
   * Clear chat history (host action)
   */
  clearChatHistory(lobbyId: string, moderatorId: string): ModerationResult {
    // Check if moderator has permissions
    if (!this.hasModeratorPermissions(lobbyId, moderatorId)) {
      return {
        success: false,
        error: 'Insufficient permissions to clear chat',
        errorCode: 'INSUFFICIENT_PERMISSIONS',
      };
    }

    // Clear chat history
    this.chatHistory.set(lobbyId, []);

    // Send system message about chat clear
    this.sendSystemMessage(
      lobbyId,
      'Chat history has been cleared by tournament host',
      ChatMessageType.HOST_MESSAGE
    );

    // Notify all participants about chat clear
    this.partyWebSocketServer.broadcastToLobby(lobbyId, {
      type: PartyMessageType.SYSTEM_MESSAGE,
      lobbyId: lobbyId,
      senderId: 'system',
      data: {
        type: 'chat_cleared',
        message: 'Chat history cleared',
      },
      timestamp: new Date(),
    });

    return {
      success: true,
      action: 'chat_cleared',
    };
  }

  /**
   * Delete a specific message (host/moderator action)
   */
  deleteMessage(
    lobbyId: string,
    moderatorId: string,
    messageId: string
  ): ModerationResult {
    // Check if moderator has permissions
    if (!this.hasModeratorPermissions(lobbyId, moderatorId)) {
      return {
        success: false,
        error: 'Insufficient permissions to delete messages',
        errorCode: 'INSUFFICIENT_PERMISSIONS',
      };
    }

    // Find and remove message from history
    const messages = this.chatHistory.get(lobbyId);
    if (!messages) {
      return {
        success: false,
        error: 'Chat history not found',
        errorCode: 'CHAT_NOT_FOUND',
      };
    }

    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      return {
        success: false,
        error: 'Message not found',
        errorCode: 'MESSAGE_NOT_FOUND',
      };
    }

    const deletedMessage = messages[messageIndex];
    messages.splice(messageIndex, 1);

    // Notify all participants about message deletion
    this.partyWebSocketServer.broadcastToLobby(lobbyId, {
      type: PartyMessageType.SYSTEM_MESSAGE,
      lobbyId: lobbyId,
      senderId: 'system',
      data: {
        type: 'message_deleted',
        messageId: messageId,
        deletedBy: moderatorId,
      },
      timestamp: new Date(),
    });

    return {
      success: true,
      action: 'message_deleted',
      messageId: messageId,
      deletedMessage: deletedMessage,
    };
  }

  /**
   * Get chat history for a lobby
   */
  getChatHistory(lobbyId: string, limit?: number): ChatMessage[] {
    const messages = this.chatHistory.get(lobbyId) || [];
    if (limit && limit > 0) {
      return messages.slice(-limit);
    }
    return [...messages];
  }

  /**
   * Add moderator permissions to a player
   */
  addModerator(lobbyId: string, hostId: string, playerId: string): ModerationResult {
    // Only host can add moderators
    if (!this.hasModeratorPermissions(lobbyId, hostId)) {
      return {
        success: false,
        error: 'Only tournament host can add moderators',
        errorCode: 'HOST_ONLY_ACTION',
      };
    }

    if (!this.chatModerators.has(lobbyId)) {
      this.chatModerators.set(lobbyId, new Set());
    }
    this.chatModerators.get(lobbyId)!.add(playerId);

    this.sendSystemMessage(
      lobbyId,
      'A new chat moderator has been added',
      ChatMessageType.HOST_MESSAGE
    );

    return {
      success: true,
      action: 'moderator_added',
      targetPlayerId: playerId,
    };
  }

  /**
   * Remove moderator permissions from a player
   */
  removeModerator(lobbyId: string, hostId: string, playerId: string): ModerationResult {
    // Only host can remove moderators
    if (!this.hasModeratorPermissions(lobbyId, hostId)) {
      return {
        success: false,
        error: 'Only tournament host can remove moderators',
        errorCode: 'HOST_ONLY_ACTION',
      };
    }

    const moderators = this.chatModerators.get(lobbyId);
    if (moderators) {
      moderators.delete(playerId);
    }

    this.sendSystemMessage(
      lobbyId,
      'A chat moderator has been removed',
      ChatMessageType.HOST_MESSAGE
    );

    return {
      success: true,
      action: 'moderator_removed',
      targetPlayerId: playerId,
    };
  }

  /**
   * Send tournament status updates to chat
   */
  sendTournamentStatusUpdate(
    lobbyId: string,
    tournament: Tournament,
    updateType: string,
    data: any
  ): void {
    let message = '';
    
    switch (updateType) {
      case 'match_starting':
        message = `🎮 Match starting: ${data.player1} vs ${data.player2}`;
        break;
      case 'match_completed':
        message = `✅ Match completed: ${data.winner} defeated ${data.loser}`;
        break;
      case 'round_completed':
        message = `🏁 Round ${data.roundNumber} completed`;
        break;
      case 'player_eliminated':
        message = `❌ ${data.playerName} has been eliminated`;
        break;
      case 'tournament_starting':
        message = `🚀 Tournament starting with ${data.playerCount} players!`;
        break;
      case 'tournament_completed':
        message = `🏆 Tournament completed! Winner: ${data.winner}`;
        break;
      default:
        message = `📢 Tournament update: ${data.message || 'Status changed'}`;
    }

    this.sendSystemMessage(lobbyId, message, ChatMessageType.TOURNAMENT_UPDATE);
  }

  /**
   * Display player status in chat (online, in match, eliminated, etc.)
   */
  updatePlayerStatusDisplay(
    lobbyId: string,
    tournament: Tournament,
    playerId: string,
    newStatus: PlayerStatus
  ): void {
    const player = tournament.players.find(p => p.id === playerId);
    if (!player) {
      return;
    }

    let statusMessage = '';
    
    switch (newStatus) {
      case PlayerStatus.IN_MATCH:
        statusMessage = `${player.name} is now in a match`;
        break;
      case PlayerStatus.WAITING:
        statusMessage = `${player.name} is waiting for next match`;
        break;
      case PlayerStatus.ELIMINATED:
        statusMessage = `${player.name} has been eliminated`;
        break;
      case PlayerStatus.SPECTATING:
        statusMessage = `${player.name} is now spectating`;
        break;
      case PlayerStatus.DISCONNECTED:
        statusMessage = `${player.name} has disconnected`;
        break;
      default:
        return; // Don't send message for other status changes
    }

    this.sendSystemMessage(lobbyId, statusMessage, ChatMessageType.SYSTEM_MESSAGE);
  }

  // Private helper methods

  private isPlayerMuted(lobbyId: string, playerId: string): boolean {
    const mutedSet = this.mutedPlayers.get(lobbyId);
    return mutedSet ? mutedSet.has(playerId) : false;
  }

  private hasModeratorPermissions(lobbyId: string, playerId: string): boolean {
    // Host always has moderator permissions
    // Check if player is in moderators list
    const moderators = this.chatModerators.get(lobbyId);
    return moderators ? moderators.has(playerId) : false;
  }

  private checkRateLimit(playerId: string): RateLimitResult {
    const now = Date.now();
    const rateLimit = this.rateLimits.get(playerId);

    if (!rateLimit) {
      return { allowed: true };
    }

    // Check if rate limit window has expired
    if (now - rateLimit.windowStart > rateLimit.windowDuration) {
      // Reset rate limit
      rateLimit.messageCount = 0;
      rateLimit.windowStart = now;
      return { allowed: true };
    }

    // Check if under rate limit
    if (rateLimit.messageCount < rateLimit.maxMessages) {
      return { allowed: true };
    }

    // Rate limited
    const retryAfter = Math.ceil((rateLimit.windowStart + rateLimit.windowDuration - now) / 1000);
    return {
      allowed: false,
      retryAfter: retryAfter,
    };
  }

  private updateRateLimit(playerId: string): void {
    const now = Date.now();
    let rateLimit = this.rateLimits.get(playerId);

    if (!rateLimit) {
      rateLimit = {
        messageCount: 0,
        windowStart: now,
        windowDuration: 60000, // 1 minute
        maxMessages: 10, // 10 messages per minute
      };
      this.rateLimits.set(playerId, rateLimit);
    }

    // Reset window if expired
    if (now - rateLimit.windowStart > rateLimit.windowDuration) {
      rateLimit.messageCount = 0;
      rateLimit.windowStart = now;
    }

    rateLimit.messageCount++;
  }

  private filterMessage(message: string): MessageFilterResult {
    for (const filter of this.messageFilters) {
      const result = filter.filter(message);
      if (!result.allowed) {
        return result;
      }
      message = result.cleanedMessage || message;
    }

    return {
      allowed: true,
      cleanedMessage: message,
    };
  }

  private initializeMessageFilters(): MessageFilter[] {
    return [
      new ProfanityFilter(),
      new SpamFilter(),
      new LinkFilter(),
    ];
  }

  private addMessageToHistory(lobbyId: string, message: ChatMessage): void {
    if (!this.chatHistory.has(lobbyId)) {
      this.chatHistory.set(lobbyId, []);
    }

    const messages = this.chatHistory.get(lobbyId)!;
    messages.push(message);

    // Keep only last 100 messages
    if (messages.length > 100) {
      messages.splice(0, messages.length - 100);
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupRateLimits(): void {
    const now = Date.now();
    const expiredPlayers: string[] = [];

    this.rateLimits.forEach((rateLimit, playerId) => {
      if (now - rateLimit.windowStart > rateLimit.windowDuration * 2) {
        expiredPlayers.push(playerId);
      }
    });

    expiredPlayers.forEach(playerId => {
      this.rateLimits.delete(playerId);
    });
  }

  // Public cleanup methods

  /**
   * Clean up chat data when tournament ends
   */
  cleanupTournamentChat(lobbyId: string): void {
    this.chatHistory.delete(lobbyId);
    this.mutedPlayers.delete(lobbyId);
    this.chatModerators.delete(lobbyId);
  }

  /**
   * Set host as initial moderator
   */
  initializeChatForTournament(lobbyId: string, hostId: string): void {
    if (!this.chatModerators.has(lobbyId)) {
      this.chatModerators.set(lobbyId, new Set());
    }
    this.chatModerators.get(lobbyId)!.add(hostId);

    this.sendSystemMessage(
      lobbyId,
      'Tournament chat initialized. Host has moderation privileges.',
      ChatMessageType.SYSTEM_MESSAGE
    );
  }
}

// Interface definitions
interface ChatMessageResult {
  success: boolean;
  message?: ChatMessage;
  error?: string;
  errorCode?: string;
}

interface ModerationResult {
  success: boolean;
  action?: string;
  targetPlayerId?: string;
  messageId?: string;
  deletedMessage?: ChatMessage;
  duration?: number;
  error?: string;
  errorCode?: string;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

interface PlayerRateLimit {
  messageCount: number;
  windowStart: number;
  windowDuration: number;
  maxMessages: number;
}

interface MessageFilterResult {
  allowed: boolean;
  cleanedMessage?: string;
  reason?: string;
}

// Message filter interfaces and implementations
interface MessageFilter {
  filter(message: string): MessageFilterResult;
}

class ProfanityFilter implements MessageFilter {
  private profanityWords = ['spam', 'inappropriate']; // Placeholder list

  filter(message: string): MessageFilterResult {
    const lowerMessage = message.toLowerCase();
    
    for (const word of this.profanityWords) {
      if (lowerMessage.includes(word)) {
        return {
          allowed: false,
          reason: 'Message contains inappropriate language',
        };
      }
    }

    return { allowed: true };
  }
}

class SpamFilter implements MessageFilter {
  filter(message: string): MessageFilterResult {
    // Check for repeated characters
    if (/(.)\1{10,}/.test(message)) {
      return {
        allowed: false,
        reason: 'Message appears to be spam (repeated characters)',
      };
    }

    // Check for excessive caps
    const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
    if (message.length > 10 && capsRatio > 0.7) {
      return {
        allowed: false,
        reason: 'Please avoid excessive use of capital letters',
      };
    }

    return { allowed: true };
  }
}

class LinkFilter implements MessageFilter {
  filter(message: string): MessageFilterResult {
    // Simple URL detection
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    
    if (urlRegex.test(message)) {
      // For now, just clean the message by removing URLs
      const cleanedMessage = message.replace(urlRegex, '[link removed]');
      return {
        allowed: true,
        cleanedMessage: cleanedMessage,
      };
    }

    return { allowed: true };
  }
}

// Extend ChatMessage interface to include additional tournament-specific fields
declare module '../types/party' {
  interface ChatMessage {
    playerStatus?: PlayerStatus;
    isHost?: boolean;
    isEliminated?: boolean;
  }
}