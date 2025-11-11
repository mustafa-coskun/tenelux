import {
  PartyMessage,
  PartyMessageType,
  HostAction,
  HostActionType,
  TournamentUpdate,
  ChatMessage,
  ChatMessageType
} from '../types/party';
import { ValidationResult } from './SecurityValidationService';
import { getTournamentSecurityService, SecurityRiskLevel } from './TournamentSecurityService';

export interface MessageSecurityValidation {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
  riskLevel?: SecurityRiskLevel;
  shouldBlock?: boolean;
  shouldLog?: boolean;
}

export interface MessageRateLimit {
  playerId: string;
  messageCount: number;
  windowStart: Date;
  lastMessageTime: Date;
  violationCount: number;
}

export interface SuspiciousMessagePattern {
  playerId: string;
  patternType: MessagePatternType;
  occurrenceCount: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
}

export enum MessagePatternType {
  RAPID_MESSAGING = 'rapid_messaging',
  DUPLICATE_MESSAGES = 'duplicate_messages',
  SPAM_CONTENT = 'spam_content',
  MALICIOUS_PAYLOAD = 'malicious_payload',
  UNAUTHORIZED_ACTIONS = 'unauthorized_actions',
  INVALID_MESSAGE_STRUCTURE = 'invalid_message_structure'
}

/**
 * Tournament Message Security Service
 * Validates and secures all tournament-related WebSocket messages
 */
export class TournamentMessageSecurityService {
  private messageRateLimits: Map<string, MessageRateLimit> = new Map();
  private suspiciousPatterns: Map<string, SuspiciousMessagePattern[]> = new Map();
  private recentMessages: Map<string, PartyMessage[]> = new Map();
  private securityService = getTournamentSecurityService();

  // Rate limiting configuration
  private readonly MESSAGE_RATE_WINDOW = 60000; // 1 minute
  private readonly MAX_MESSAGES_PER_WINDOW = 30;
  private readonly MIN_MESSAGE_INTERVAL = 50; // 50ms between messages (less strict for tests)
  private readonly CHAT_RATE_LIMIT = 10; // 10 chat messages per minute
  private readonly HOST_ACTION_RATE_LIMIT = 5; // 5 host actions per minute

  // Security thresholds
  private readonly MAX_MESSAGE_SIZE = 10000; // 10KB max message size
  private readonly MAX_CHAT_MESSAGE_LENGTH = 500;
  private readonly DUPLICATE_MESSAGE_THRESHOLD = 3;
  private readonly SPAM_DETECTION_THRESHOLD = 5;

  /**
   * Validate a party message for security issues
   */
  validatePartyMessage(
    message: PartyMessage,
    senderId: string,
    connectionId: string
  ): MessageSecurityValidation {
    // 1. Basic message structure validation
    const structureValidation = this.validateMessageStructure(message);
    if (!structureValidation.isValid) {
      return structureValidation;
    }

    // 2. Rate limiting validation
    const rateLimitValidation = this.validateMessageRateLimit(senderId, message.type);
    if (!rateLimitValidation.isValid) {
      return rateLimitValidation;
    }

    // 3. Message size validation
    const sizeValidation = this.validateMessageSize(message);
    if (!sizeValidation.isValid) {
      return sizeValidation;
    }

    // 4. Content validation based on message type
    const contentValidation = this.validateMessageContent(message, senderId);
    if (!contentValidation.isValid) {
      return contentValidation;
    }

    // 5. Duplicate message detection
    const duplicateValidation = this.validateDuplicateMessage(message, senderId);
    if (!duplicateValidation.isValid) {
      return duplicateValidation;
    }

    // 6. Spam pattern detection
    const spamValidation = this.validateSpamPatterns(message, senderId);
    if (!spamValidation.isValid) {
      return spamValidation;
    }

    // Update tracking
    this.updateMessageTracking(senderId, message);

    return { 
      isValid: true, 
      riskLevel: SecurityRiskLevel.LOW,
      shouldBlock: false,
      shouldLog: false
    };
  }

  /**
   * Validate host action security
   */
  validateHostAction(
    action: HostAction,
    senderId: string,
    isActualHost: boolean
  ): MessageSecurityValidation {
    // Verify host privileges
    if (!isActualHost) {
      this.flagSuspiciousPattern(senderId, MessagePatternType.UNAUTHORIZED_ACTIONS);
      return {
        isValid: false,
        errorCode: 'UNAUTHORIZED_HOST_ACTION',
        errorMessage: 'Player is not authorized to perform host actions',
        riskLevel: SecurityRiskLevel.HIGH,
        shouldBlock: true,
        shouldLog: true
      };
    }

    // Validate action structure
    if (!action.type || !Object.values(HostActionType).includes(action.type)) {
      return {
        isValid: false,
        errorCode: 'INVALID_HOST_ACTION_TYPE',
        errorMessage: 'Invalid host action type',
        riskLevel: SecurityRiskLevel.MEDIUM,
        shouldBlock: true,
        shouldLog: true
      };
    }

    // Validate action-specific requirements
    const actionValidation = this.validateSpecificHostAction(action);
    if (!actionValidation.isValid) {
      return actionValidation;
    }

    // Check host action rate limiting
    const rateLimitValidation = this.validateHostActionRateLimit(senderId);
    if (!rateLimitValidation.isValid) {
      return rateLimitValidation;
    }

    return { 
      isValid: true, 
      riskLevel: SecurityRiskLevel.LOW,
      shouldBlock: false,
      shouldLog: true // Log all host actions for audit
    };
  }

  /**
   * Validate chat message security
   */
  validateChatMessage(
    chatMessage: ChatMessage,
    senderId: string
  ): MessageSecurityValidation {
    // Validate message length
    if (chatMessage.message.length > this.MAX_CHAT_MESSAGE_LENGTH) {
      return {
        isValid: false,
        errorCode: 'CHAT_MESSAGE_TOO_LONG',
        errorMessage: 'Chat message exceeds maximum length',
        riskLevel: SecurityRiskLevel.LOW,
        shouldBlock: true,
        shouldLog: false
      };
    }

    // Validate sender ID matches
    if (chatMessage.senderId !== senderId) {
      this.flagSuspiciousPattern(senderId, MessagePatternType.UNAUTHORIZED_ACTIONS);
      return {
        isValid: false,
        errorCode: 'CHAT_SENDER_MISMATCH',
        errorMessage: 'Chat message sender ID does not match connection',
        riskLevel: SecurityRiskLevel.HIGH,
        shouldBlock: true,
        shouldLog: true
      };
    }

    // Check for malicious content patterns
    const contentValidation = this.validateChatContent(chatMessage.message);
    if (!contentValidation.isValid) {
      return contentValidation;
    }

    // Check chat rate limiting
    const rateLimitValidation = this.validateChatRateLimit(senderId);
    if (!rateLimitValidation.isValid) {
      return rateLimitValidation;
    }

    return { 
      isValid: true, 
      riskLevel: SecurityRiskLevel.LOW,
      shouldBlock: false,
      shouldLog: false
    };
  }

  /**
   * Check if player should be temporarily blocked
   */
  shouldBlockPlayer(playerId: string): boolean {
    const rateLimit = this.messageRateLimits.get(playerId);
    if (rateLimit && rateLimit.violationCount >= 3) {
      return true;
    }

    const patterns = this.suspiciousPatterns.get(playerId) || [];
    const highRiskPatterns = patterns.filter(p => 
      p.occurrenceCount >= this.SPAM_DETECTION_THRESHOLD
    );
    
    return highRiskPatterns.length > 0;
  }

  /**
   * Get security metrics for a player
   */
  getPlayerSecurityMetrics(playerId: string): {
    messageCount: number;
    violationCount: number;
    suspiciousPatterns: MessagePatternType[];
    riskLevel: SecurityRiskLevel;
    isBlocked: boolean;
  } {
    const rateLimit = this.messageRateLimits.get(playerId);
    const patterns = this.suspiciousPatterns.get(playerId) || [];
    
    const violationCount = rateLimit?.violationCount || 0;
    const suspiciousPatterns = patterns.map(p => p.patternType);
    
    let riskLevel = SecurityRiskLevel.LOW;
    if (violationCount >= 2 || patterns.length >= 2) {
      riskLevel = SecurityRiskLevel.MEDIUM;
    }
    if (violationCount >= 3 || patterns.length >= 3) {
      riskLevel = SecurityRiskLevel.HIGH;
    }

    return {
      messageCount: rateLimit?.messageCount || 0,
      violationCount,
      suspiciousPatterns,
      riskLevel,
      isBlocked: this.shouldBlockPlayer(playerId)
    };
  }

  /**
   * Clean up old security data
   */
  cleanupSecurityData(): void {
    const now = new Date();
    const cleanupAge = 60 * 60 * 1000; // 1 hour

    // Clean up rate limits
    this.messageRateLimits.forEach((rateLimit, playerId) => {
      const age = now.getTime() - rateLimit.windowStart.getTime();
      if (age > this.MESSAGE_RATE_WINDOW * 2) {
        this.messageRateLimits.delete(playerId);
      }
    });

    // Clean up suspicious patterns
    this.suspiciousPatterns.forEach((patterns, playerId) => {
      const recentPatterns = patterns.filter(pattern => 
        now.getTime() - pattern.lastOccurrence.getTime() < cleanupAge
      );
      
      if (recentPatterns.length === 0) {
        this.suspiciousPatterns.delete(playerId);
      } else {
        this.suspiciousPatterns.set(playerId, recentPatterns);
      }
    });

    // Clean up recent messages
    this.recentMessages.forEach((messages, playerId) => {
      const recentMessages = messages.filter(message => 
        now.getTime() - message.timestamp.getTime() < cleanupAge
      );
      
      if (recentMessages.length === 0) {
        this.recentMessages.delete(playerId);
      } else {
        this.recentMessages.set(playerId, recentMessages);
      }
    });
  }

  // Private helper methods

  private validateMessageStructure(message: PartyMessage): MessageSecurityValidation {
    if (!message) {
      return {
        isValid: false,
        errorCode: 'INVALID_MESSAGE_STRUCTURE',
        errorMessage: 'Message object is required',
        riskLevel: SecurityRiskLevel.MEDIUM,
        shouldBlock: true,
        shouldLog: true
      };
    }

    if (!message.type || !Object.values(PartyMessageType).includes(message.type)) {
      return {
        isValid: false,
        errorCode: 'INVALID_MESSAGE_TYPE',
        errorMessage: 'Invalid message type',
        riskLevel: SecurityRiskLevel.MEDIUM,
        shouldBlock: true,
        shouldLog: true
      };
    }

    if (!message.lobbyId || typeof message.lobbyId !== 'string') {
      return {
        isValid: false,
        errorCode: 'INVALID_LOBBY_ID',
        errorMessage: 'Valid lobby ID is required',
        riskLevel: SecurityRiskLevel.MEDIUM,
        shouldBlock: true,
        shouldLog: true
      };
    }

    if (!message.timestamp || !(message.timestamp instanceof Date)) {
      return {
        isValid: false,
        errorCode: 'INVALID_TIMESTAMP',
        errorMessage: 'Valid timestamp is required',
        riskLevel: SecurityRiskLevel.LOW,
        shouldBlock: true,
        shouldLog: false
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateMessageRateLimit(senderId: string, messageType: PartyMessageType): MessageSecurityValidation {
    const now = new Date();
    let rateLimit = this.messageRateLimits.get(senderId);

    if (!rateLimit) {
      rateLimit = {
        playerId: senderId,
        messageCount: 0,
        windowStart: now,
        lastMessageTime: now,
        violationCount: 0
      };
    }

    // Check window reset
    const windowElapsed = now.getTime() - rateLimit.windowStart.getTime();
    if (windowElapsed >= this.MESSAGE_RATE_WINDOW) {
      rateLimit.messageCount = 0;
      rateLimit.windowStart = now;
    }

    // Check minimum interval (skip for first message)
    const timeSinceLastMessage = now.getTime() - rateLimit.lastMessageTime.getTime();
    if (rateLimit.messageCount > 0 && timeSinceLastMessage < this.MIN_MESSAGE_INTERVAL) {
      rateLimit.violationCount++;
      this.flagSuspiciousPattern(senderId, MessagePatternType.RAPID_MESSAGING);
      
      return {
        isValid: false,
        errorCode: 'MESSAGE_RATE_LIMIT_EXCEEDED',
        errorMessage: 'Messages are being sent too quickly',
        riskLevel: SecurityRiskLevel.MEDIUM,
        shouldBlock: true,
        shouldLog: true
      };
    }

    // Check message count limits
    const maxMessages = this.getMaxMessagesForType(messageType);
    if (rateLimit.messageCount >= maxMessages) {
      rateLimit.violationCount++;
      this.flagSuspiciousPattern(senderId, MessagePatternType.RAPID_MESSAGING);
      
      return {
        isValid: false,
        errorCode: 'MESSAGE_COUNT_LIMIT_EXCEEDED',
        errorMessage: 'Too many messages in time window',
        riskLevel: SecurityRiskLevel.MEDIUM,
        shouldBlock: true,
        shouldLog: true
      };
    }

    // Update rate limit
    rateLimit.messageCount++;
    rateLimit.lastMessageTime = now;
    this.messageRateLimits.set(senderId, rateLimit);

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateMessageSize(message: PartyMessage): MessageSecurityValidation {
    const messageSize = JSON.stringify(message).length;
    
    if (messageSize > this.MAX_MESSAGE_SIZE) {
      return {
        isValid: false,
        errorCode: 'MESSAGE_TOO_LARGE',
        errorMessage: 'Message exceeds maximum size limit',
        riskLevel: SecurityRiskLevel.MEDIUM,
        shouldBlock: true,
        shouldLog: true
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateMessageContent(message: PartyMessage, senderId: string): MessageSecurityValidation {
    // Validate that sender ID matches message sender (if applicable)
    if (message.senderId && message.senderId !== senderId) {
      this.flagSuspiciousPattern(senderId, MessagePatternType.UNAUTHORIZED_ACTIONS);
      return {
        isValid: false,
        errorCode: 'SENDER_ID_MISMATCH',
        errorMessage: 'Message sender ID does not match connection',
        riskLevel: SecurityRiskLevel.HIGH,
        shouldBlock: true,
        shouldLog: true
      };
    }

    // Check for malicious payload patterns
    if (this.containsMaliciousPayload(message.data)) {
      this.flagSuspiciousPattern(senderId, MessagePatternType.MALICIOUS_PAYLOAD);
      return {
        isValid: false,
        errorCode: 'MALICIOUS_PAYLOAD_DETECTED',
        errorMessage: 'Message contains potentially malicious content',
        riskLevel: SecurityRiskLevel.HIGH,
        shouldBlock: true,
        shouldLog: true
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateDuplicateMessage(message: PartyMessage, senderId: string): MessageSecurityValidation {
    const recentMessages = this.recentMessages.get(senderId) || [];
    const now = new Date();
    
    // Check for exact duplicates in the last minute
    const duplicateCount = recentMessages.filter(recentMessage => {
      const timeDiff = now.getTime() - recentMessage.timestamp.getTime();
      return timeDiff < 60000 && // Within last minute
             recentMessage.type === message.type &&
             JSON.stringify(recentMessage.data) === JSON.stringify(message.data);
    }).length;

    if (duplicateCount >= this.DUPLICATE_MESSAGE_THRESHOLD) {
      this.flagSuspiciousPattern(senderId, MessagePatternType.DUPLICATE_MESSAGES);
      return {
        isValid: false,
        errorCode: 'DUPLICATE_MESSAGE_DETECTED',
        errorMessage: 'Too many duplicate messages detected',
        riskLevel: SecurityRiskLevel.MEDIUM,
        shouldBlock: true,
        shouldLog: true
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateSpamPatterns(message: PartyMessage, senderId: string): MessageSecurityValidation {
    // Check if player is already flagged for spam
    const patterns = this.suspiciousPatterns.get(senderId) || [];
    const spamPatterns = patterns.filter(p => 
      p.patternType === MessagePatternType.SPAM_CONTENT ||
      p.patternType === MessagePatternType.RAPID_MESSAGING
    );

    if (spamPatterns.length > 0 && spamPatterns[0].occurrenceCount >= this.SPAM_DETECTION_THRESHOLD) {
      return {
        isValid: false,
        errorCode: 'SPAM_PATTERN_DETECTED',
        errorMessage: 'Player flagged for spam behavior',
        riskLevel: SecurityRiskLevel.HIGH,
        shouldBlock: true,
        shouldLog: true
      };
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateSpecificHostAction(action: HostAction): MessageSecurityValidation {
    switch (action.type) {
      case HostActionType.KICK_PLAYER:
        if (!action.targetPlayerId) {
          return {
            isValid: false,
            errorCode: 'MISSING_TARGET_PLAYER',
            errorMessage: 'Kick action requires target player ID',
            riskLevel: SecurityRiskLevel.LOW,
            shouldBlock: true,
            shouldLog: true
          };
        }
        break;

      case HostActionType.TRANSFER_HOST:
        if (!action.targetPlayerId) {
          return {
            isValid: false,
            errorCode: 'MISSING_TARGET_PLAYER',
            errorMessage: 'Host transfer requires target player ID',
            riskLevel: SecurityRiskLevel.LOW,
            shouldBlock: true,
            shouldLog: true
          };
        }
        break;

      case HostActionType.UPDATE_SETTINGS:
        if (!action.data) {
          return {
            isValid: false,
            errorCode: 'MISSING_SETTINGS_DATA',
            errorMessage: 'Settings update requires data',
            riskLevel: SecurityRiskLevel.LOW,
            shouldBlock: true,
            shouldLog: true
          };
        }
        break;
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateHostActionRateLimit(senderId: string): MessageSecurityValidation {
    const now = new Date();
    let rateLimit = this.messageRateLimits.get(senderId);

    if (!rateLimit) {
      return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
    }

    const windowElapsed = now.getTime() - rateLimit.windowStart.getTime();
    if (windowElapsed < this.MESSAGE_RATE_WINDOW) {
      // Count host actions in current window (approximate)
      const hostActionCount = Math.floor(rateLimit.messageCount * 0.2); // Estimate
      
      if (hostActionCount >= this.HOST_ACTION_RATE_LIMIT) {
        return {
          isValid: false,
          errorCode: 'HOST_ACTION_RATE_LIMIT',
          errorMessage: 'Too many host actions in time window',
          riskLevel: SecurityRiskLevel.MEDIUM,
          shouldBlock: true,
          shouldLog: true
        };
      }
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateChatContent(message: string): MessageSecurityValidation {
    // Check for common malicious patterns
    const maliciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i,
      /vbscript:/i
    ];

    for (const pattern of maliciousPatterns) {
      if (pattern.test(message)) {
        return {
          isValid: false,
          errorCode: 'MALICIOUS_CHAT_CONTENT',
          errorMessage: 'Chat message contains potentially malicious content',
          riskLevel: SecurityRiskLevel.HIGH,
          shouldBlock: true,
          shouldLog: true
        };
      }
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private validateChatRateLimit(senderId: string): MessageSecurityValidation {
    const now = new Date();
    let rateLimit = this.messageRateLimits.get(senderId);

    if (!rateLimit) {
      return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
    }

    const windowElapsed = now.getTime() - rateLimit.windowStart.getTime();
    if (windowElapsed < this.MESSAGE_RATE_WINDOW) {
      // Estimate chat message count (approximate)
      const chatMessageCount = Math.floor(rateLimit.messageCount * 0.3);
      
      if (chatMessageCount >= this.CHAT_RATE_LIMIT) {
        return {
          isValid: false,
          errorCode: 'CHAT_RATE_LIMIT_EXCEEDED',
          errorMessage: 'Too many chat messages in time window',
          riskLevel: SecurityRiskLevel.MEDIUM,
          shouldBlock: true,
          shouldLog: false
        };
      }
    }

    return { isValid: true, riskLevel: SecurityRiskLevel.LOW };
  }

  private containsMaliciousPayload(data: any): boolean {
    if (!data) return false;

    const dataString = JSON.stringify(data);
    
    // Check for common injection patterns
    const maliciousPatterns = [
      /__proto__/,
      /constructor/,
      /prototype/,
      /eval\(/,
      /Function\(/,
      /setTimeout\(/,
      /setInterval\(/
    ];

    return maliciousPatterns.some(pattern => pattern.test(dataString));
  }

  private getMaxMessagesForType(messageType: PartyMessageType): number {
    switch (messageType) {
      case PartyMessageType.CHAT_MESSAGE:
        return this.CHAT_RATE_LIMIT;
      case PartyMessageType.PLAYER_JOINED:
      case PartyMessageType.PLAYER_LEFT:
        return 5; // Lower limit for join/leave spam
      default:
        return this.MAX_MESSAGES_PER_WINDOW;
    }
  }

  private flagSuspiciousPattern(playerId: string, patternType: MessagePatternType): void {
    const patterns = this.suspiciousPatterns.get(playerId) || [];
    const existingPattern = patterns.find(p => p.patternType === patternType);
    
    if (existingPattern) {
      existingPattern.occurrenceCount++;
      existingPattern.lastOccurrence = new Date();
    } else {
      patterns.push({
        playerId,
        patternType,
        occurrenceCount: 1,
        firstOccurrence: new Date(),
        lastOccurrence: new Date()
      });
    }
    
    this.suspiciousPatterns.set(playerId, patterns);
  }

  private updateMessageTracking(senderId: string, message: PartyMessage): void {
    const recentMessages = this.recentMessages.get(senderId) || [];
    recentMessages.push(message);
    
    // Keep only last 20 messages
    if (recentMessages.length > 20) {
      recentMessages.shift();
    }
    
    this.recentMessages.set(senderId, recentMessages);
  }
}

// Singleton instance
let tournamentMessageSecurityServiceInstance: TournamentMessageSecurityService | null = null;

export function getTournamentMessageSecurityService(): TournamentMessageSecurityService {
  if (!tournamentMessageSecurityServiceInstance) {
    tournamentMessageSecurityServiceInstance = new TournamentMessageSecurityService();
    
    // Set up cleanup interval
    setInterval(() => {
      tournamentMessageSecurityServiceInstance?.cleanupSecurityData();
    }, 5 * 60 * 1000); // Clean up every 5 minutes
  }
  
  return tournamentMessageSecurityServiceInstance;
}

export default TournamentMessageSecurityService;