import {
  TournamentSecurityService,
  SecurityRiskLevel,
  CheatFlag,
  getTournamentSecurityService
} from '../services/TournamentSecurityService';
import {
  TournamentMessageSecurityService,
  MessagePatternType,
  getTournamentMessageSecurityService
} from '../services/TournamentMessageSecurityService';
import {
  Tournament,
  TournamentStatus,
  TournamentFormat,
  MatchResult,
  ActiveMatch,
  MatchStatus,
  PartyMessage,
  PartyMessageType,
  HostAction,
  HostActionType,
  ChatMessage,
  ChatMessageType,
  TournamentPlayer,
  PlayerStatus
} from '../types/party';

describe('Tournament Security Validation', () => {
  let securityService: TournamentSecurityService;
  let messageSecurityService: TournamentMessageSecurityService;

  beforeEach(() => {
    securityService = new TournamentSecurityService();
    messageSecurityService = new TournamentMessageSecurityService();
  });

  describe('Secure Lobby Code Generation', () => {
    test('should generate secure lobby codes with proper entropy', () => {
      const secureLobbyCode = securityService.generateSecureLobbyCode();
      
      expect(secureLobbyCode.code).toHaveLength(6);
      expect(secureLobbyCode.entropy).toBeGreaterThan(10);
      expect(secureLobbyCode.usageCount).toBe(0);
      expect(secureLobbyCode.maxUsage).toBe(1);
      expect(secureLobbyCode.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test('should validate lobby codes correctly', () => {
      const secureLobbyCode = securityService.generateSecureLobbyCode();
      
      // Valid code
      const validValidation = securityService.validateLobbyCode(secureLobbyCode.code, secureLobbyCode);
      if (!validValidation.isValid) {
        console.log('Validation failed:', validValidation);
      }
      expect(validValidation.isValid).toBe(true);
      expect(validValidation.riskLevel).toBe(SecurityRiskLevel.LOW);

      // Invalid format
      const invalidFormatValidation = securityService.validateLobbyCode('ABC', secureLobbyCode);
      expect(invalidFormatValidation.isValid).toBe(false);
      expect(invalidFormatValidation.errorCode).toBe('invalid_lobby_code');

      // Weak pattern
      const weakPatternValidation = securityService.validateLobbyCode('123456');
      expect(weakPatternValidation.isValid).toBe(false);
      expect(weakPatternValidation.errorCode).toBe('WEAK_CODE_PATTERN');
    });

    test('should reject codes with weak patterns', () => {
      const weakCodes = ['000000', '111111', '123456', 'AAAAAA', 'ABCDEF'];
      
      weakCodes.forEach(code => {
        const validation = securityService.validateLobbyCode(code);
        expect(validation.isValid).toBe(false);
        expect(validation.errorCode).toBe('WEAK_CODE_PATTERN');
        expect([SecurityRiskLevel.MEDIUM, SecurityRiskLevel.HIGH]).toContain(validation.riskLevel);
      });
    });
  });

  describe('Tournament Integrity Validation', () => {
    let mockTournament: Tournament;
    let mockPlayers: TournamentPlayer[];

    beforeEach(() => {
      mockPlayers = [
        {
          id: 'player1',
          name: 'Player 1',
          isHost: true,
          isEliminated: false,
          currentRank: 0,
          statistics: {
            matchesPlayed: 0,
            matchesWon: 0,
            matchesLost: 0,
            totalPoints: 0,
            cooperationRate: 0,
            betrayalRate: 0,
            averageMatchScore: 0,
            headToHeadRecord: new Map(),
            tournamentPoints: 0
          },
          status: PlayerStatus.READY,
          joinedAt: new Date()
        },
        {
          id: 'player2',
          name: 'Player 2',
          isHost: false,
          isEliminated: false,
          currentRank: 0,
          statistics: {
            matchesPlayed: 0,
            matchesWon: 0,
            matchesLost: 0,
            totalPoints: 0,
            cooperationRate: 0,
            betrayalRate: 0,
            averageMatchScore: 0,
            headToHeadRecord: new Map(),
            tournamentPoints: 0
          },
          status: PlayerStatus.READY,
          joinedAt: new Date()
        },
        {
          id: 'player3',
          name: 'Player 3',
          isHost: false,
          isEliminated: false,
          currentRank: 0,
          statistics: {
            matchesPlayed: 0,
            matchesWon: 0,
            matchesLost: 0,
            totalPoints: 0,
            cooperationRate: 0,
            betrayalRate: 0,
            averageMatchScore: 0,
            headToHeadRecord: new Map(),
            tournamentPoints: 0
          },
          status: PlayerStatus.READY,
          joinedAt: new Date()
        },
        {
          id: 'player4',
          name: 'Player 4',
          isHost: false,
          isEliminated: false,
          currentRank: 0,
          statistics: {
            matchesPlayed: 0,
            matchesWon: 0,
            matchesLost: 0,
            totalPoints: 0,
            cooperationRate: 0,
            betrayalRate: 0,
            averageMatchScore: 0,
            headToHeadRecord: new Map(),
            tournamentPoints: 0
          },
          status: PlayerStatus.READY,
          joinedAt: new Date()
        }
      ];

      mockTournament = {
        id: 'tournament1',
        lobbyId: 'lobby1',
        format: TournamentFormat.SINGLE_ELIMINATION,
        players: mockPlayers,
        bracket: {
          rounds: [],
          eliminatedPlayers: [],
          activeMatches: new Map(),
          nextMatchPairings: []
        },
        currentRound: 0,
        totalRounds: 3,
        status: TournamentStatus.IN_PROGRESS,
        startTime: new Date()
      };
    });

    test('should validate tournament structure correctly', () => {
      const validation = securityService.validateTournamentIntegrity(mockTournament);
      expect(validation.isValid).toBe(true);
      expect(validation.riskLevel).toBe(SecurityRiskLevel.LOW);
    });

    test('should reject tournaments with invalid player count', () => {
      const invalidTournament = { ...mockTournament, players: [mockPlayers[0]] }; // Only 1 player
      
      const validation = securityService.validateTournamentIntegrity(invalidTournament);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('INVALID_PLAYER_COUNT');
    });

    test('should reject tournaments with duplicate players', () => {
      const duplicatePlayer = { ...mockPlayers[0] };
      const invalidTournament = { ...mockTournament, players: [mockPlayers[0], mockPlayers[1], mockPlayers[2], duplicatePlayer] };
      
      const validation = securityService.validateTournamentIntegrity(invalidTournament);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('DUPLICATE_PLAYER');
    });

    test('should reject tournaments with invalid round state', () => {
      const invalidTournament = { ...mockTournament, currentRound: -1 };
      
      const validation = securityService.validateTournamentIntegrity(invalidTournament);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('INVALID_ROUND_STATE');
    });
  });

  describe('Match Result Anti-Cheat Validation', () => {
    let mockActiveMatch: ActiveMatch;
    let mockTournament: Tournament;

    beforeEach(() => {
      const player1: TournamentPlayer = {
        id: 'player1',
        name: 'Player 1',
        isHost: false,
        isEliminated: false,
        currentRank: 0,
        statistics: {
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          totalPoints: 0,
          cooperationRate: 0,
          betrayalRate: 0,
          averageMatchScore: 0,
          headToHeadRecord: new Map(),
          tournamentPoints: 0
        },
        status: PlayerStatus.IN_MATCH,
        joinedAt: new Date()
      };

      const player2: TournamentPlayer = {
        id: 'player2',
        name: 'Player 2',
        isHost: false,
        isEliminated: false,
        currentRank: 0,
        statistics: {
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          totalPoints: 0,
          cooperationRate: 0,
          betrayalRate: 0,
          averageMatchScore: 0,
          headToHeadRecord: new Map(),
          tournamentPoints: 0
        },
        status: PlayerStatus.IN_MATCH,
        joinedAt: new Date()
      };

      mockActiveMatch = {
        id: 'match1',
        tournamentId: 'tournament1',
        roundNumber: 1,
        player1,
        player2,
        status: MatchStatus.IN_PROGRESS,
        startTime: new Date(Date.now() - 60000) // Started 1 minute ago
      };

      mockTournament = {
        id: 'tournament1',
        lobbyId: 'lobby1',
        format: TournamentFormat.SINGLE_ELIMINATION,
        players: [player1, player2],
        bracket: {
          rounds: [],
          eliminatedPlayers: [],
          activeMatches: new Map(),
          nextMatchPairings: []
        },
        currentRound: 1,
        totalRounds: 3,
        status: TournamentStatus.IN_PROGRESS,
        startTime: new Date()
      };
    });

    test('should validate legitimate match results', () => {
      const validResult: MatchResult = {
        matchId: 'match1',
        player1Id: 'player1',
        player2Id: 'player2',
        winnerId: 'player1',
        loserId: 'player2',
        player1Score: 45,
        player2Score: 30,
        gameSessionId: 'session1',
        statistics: {
          totalRounds: 10,
          player1Cooperations: 6,
          player1Betrayals: 4,
          player2Cooperations: 5,
          player2Betrayals: 5,
          matchDuration: 300 // 5 minutes
        },
        completedAt: new Date()
      };

      const validation = securityService.validateMatchResult(validResult, mockTournament, mockActiveMatch);
      if (!validation.isValid) {
        console.log('Match result validation failed:', validation);
      }
      expect(validation.isValid).toBe(true);
      expect(validation.riskLevel).toBe(SecurityRiskLevel.LOW);
    });

    test('should reject match results with mismatched IDs', () => {
      const invalidResult: MatchResult = {
        matchId: 'wrong_match',
        player1Id: 'player1',
        player2Id: 'player2',
        winnerId: 'player1',
        loserId: 'player2',
        player1Score: 45,
        player2Score: 30,
        gameSessionId: 'session1',
        statistics: {
          totalRounds: 10,
          player1Cooperations: 6,
          player1Betrayals: 4,
          player2Cooperations: 5,
          player2Betrayals: 5,
          matchDuration: 300
        },
        completedAt: new Date()
      };

      const validation = securityService.validateMatchResult(invalidResult, mockTournament, mockActiveMatch);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('MATCH_ID_MISMATCH');
    });

    test('should reject matches completed too quickly', () => {
      const tooFastResult: MatchResult = {
        matchId: 'match1',
        player1Id: 'player1',
        player2Id: 'player2',
        winnerId: 'player1',
        loserId: 'player2',
        player1Score: 45,
        player2Score: 30,
        gameSessionId: 'session1',
        statistics: {
          totalRounds: 10,
          player1Cooperations: 6,
          player1Betrayals: 4,
          player2Cooperations: 5,
          player2Betrayals: 5,
          matchDuration: 10 // Only 10 seconds
        },
        completedAt: new Date(mockActiveMatch.startTime.getTime() + 10000) // 10 seconds after start
      };

      const validation = securityService.validateMatchResult(tooFastResult, mockTournament, mockActiveMatch);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('MATCH_TOO_SHORT');
      expect(validation.riskLevel).toBe(SecurityRiskLevel.HIGH);
    });

    test('should reject matches with inconsistent statistics', () => {
      const inconsistentResult: MatchResult = {
        matchId: 'match1',
        player1Id: 'player1',
        player2Id: 'player2',
        winnerId: 'player1',
        loserId: 'player2',
        player1Score: 45,
        player2Score: 30,
        gameSessionId: 'session1',
        statistics: {
          totalRounds: 10,
          player1Cooperations: 6,
          player1Betrayals: 3, // Should be 4 to total 10
          player2Cooperations: 5,
          player2Betrayals: 5,
          matchDuration: 300
        },
        completedAt: new Date()
      };

      const validation = securityService.validateMatchResult(inconsistentResult, mockTournament, mockActiveMatch);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('INCONSISTENT_STATISTICS');
    });
  });

  describe('Player Session Tracking', () => {
    test('should track player sessions correctly', () => {
      const validation1 = securityService.trackPlayerSession('player1', 'session1');
      expect(validation1.isValid).toBe(true);

      // Same player, different session should fail
      const validation2 = securityService.trackPlayerSession('player1', 'session2');
      expect(validation2.isValid).toBe(false);
      expect(validation2.errorCode).toBe('DUPLICATE_SESSION_DETECTED');
    });

    test('should remove player sessions correctly', () => {
      securityService.trackPlayerSession('player1', 'session1');
      securityService.removePlayerSession('player1', 'session1');
      
      // Should be able to track again after removal
      const validation = securityService.trackPlayerSession('player1', 'session2');
      expect(validation.isValid).toBe(true);
    });
  });

  describe('Message Security Validation', () => {
    test('should validate party messages correctly', () => {
      // Use a fresh service instance to avoid rate limiting interference
      const freshMessageSecurityService = new TournamentMessageSecurityService();
      
      const validMessage: PartyMessage = {
        type: PartyMessageType.CHAT_MESSAGE,
        lobbyId: 'lobby1',
        senderId: 'fresh_player',
        data: {
          id: 'msg1',
          lobbyId: 'lobby1',
          senderId: 'fresh_player',
          senderName: 'Fresh Player',
          message: 'Hello everyone!',
          timestamp: new Date(),
          type: ChatMessageType.PLAYER_MESSAGE
        },
        timestamp: new Date()
      };
      
      const validation = freshMessageSecurityService.validatePartyMessage(validMessage, 'fresh_player', 'fresh_conn');
      if (!validation.isValid) {
        console.log('Message validation failed:', validation);
      }
      expect(validation.isValid).toBe(true);
      expect(validation.riskLevel).toBe(SecurityRiskLevel.LOW);
    });

    test('should reject messages with invalid structure', () => {
      const invalidMessage = {
        // Missing required fields
        lobbyId: 'lobby1',
        data: 'some data'
      } as PartyMessage;

      const validation = messageSecurityService.validatePartyMessage(invalidMessage, 'player1', 'conn1');
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('INVALID_MESSAGE_TYPE');
    });

    test('should enforce rate limiting', () => {
      // Use a different player ID to avoid interference from previous tests
      const testPlayerId = 'rate_limit_test_player';
      const message: PartyMessage = {
        type: PartyMessageType.CHAT_MESSAGE,
        lobbyId: 'lobby1',
        senderId: testPlayerId,
        data: { message: 'test' },
        timestamp: new Date()
      };

      // Send messages rapidly
      for (let i = 0; i < 35; i++) {
        const validation = messageSecurityService.validatePartyMessage(message, testPlayerId, 'conn_rate_test');
        if (i >= 30) { // Should start failing after 30 messages
          expect(validation.isValid).toBe(false);
          expect(['MESSAGE_COUNT_LIMIT_EXCEEDED', 'MESSAGE_RATE_LIMIT_EXCEEDED']).toContain(validation.errorCode);
        }
      }
    });
  });

  describe('Host Action Security', () => {
    test('should validate legitimate host actions', () => {
      const validAction: HostAction = {
        type: HostActionType.KICK_PLAYER,
        lobbyId: 'lobby1',
        hostId: 'host1',
        targetPlayerId: 'player2'
      };

      const validation = messageSecurityService.validateHostAction(validAction, 'host1', true);
      expect(validation.isValid).toBe(true);
      expect(validation.shouldLog).toBe(true); // Host actions should be logged
    });

    test('should reject unauthorized host actions', () => {
      const unauthorizedAction: HostAction = {
        type: HostActionType.KICK_PLAYER,
        lobbyId: 'lobby1',
        hostId: 'host1',
        targetPlayerId: 'player2'
      };

      const validation = messageSecurityService.validateHostAction(unauthorizedAction, 'player1', false);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('UNAUTHORIZED_HOST_ACTION');
      expect(validation.riskLevel).toBe(SecurityRiskLevel.HIGH);
    });

    test('should validate action-specific requirements', () => {
      const incompleteAction: HostAction = {
        type: HostActionType.KICK_PLAYER,
        lobbyId: 'lobby1',
        hostId: 'host1'
        // Missing targetPlayerId
      };

      const validation = messageSecurityService.validateHostAction(incompleteAction, 'host1', true);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('MISSING_TARGET_PLAYER');
    });
  });

  describe('Chat Message Security', () => {
    test('should validate legitimate chat messages', () => {
      const validChatMessage: ChatMessage = {
        id: 'msg1',
        lobbyId: 'lobby1',
        senderId: 'player1',
        senderName: 'Player 1',
        message: 'Hello everyone!',
        timestamp: new Date(),
        type: ChatMessageType.PLAYER_MESSAGE
      };

      const validation = messageSecurityService.validateChatMessage(validChatMessage, 'player1');
      expect(validation.isValid).toBe(true);
      expect(validation.riskLevel).toBe(SecurityRiskLevel.LOW);
    });

    test('should reject messages that are too long', () => {
      const longMessage: ChatMessage = {
        id: 'msg1',
        lobbyId: 'lobby1',
        senderId: 'player1',
        senderName: 'Player 1',
        message: 'a'.repeat(600), // Exceeds 500 character limit
        timestamp: new Date(),
        type: ChatMessageType.PLAYER_MESSAGE
      };

      const validation = messageSecurityService.validateChatMessage(longMessage, 'player1');
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('CHAT_MESSAGE_TOO_LONG');
    });

    test('should reject messages with sender ID mismatch', () => {
      const mismatchedMessage: ChatMessage = {
        id: 'msg1',
        lobbyId: 'lobby1',
        senderId: 'player2', // Different from actual sender
        senderName: 'Player 2',
        message: 'Hello!',
        timestamp: new Date(),
        type: ChatMessageType.PLAYER_MESSAGE
      };

      const validation = messageSecurityService.validateChatMessage(mismatchedMessage, 'player1');
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('CHAT_SENDER_MISMATCH');
      expect(validation.riskLevel).toBe(SecurityRiskLevel.HIGH);
    });

    test('should detect malicious chat content', () => {
      const maliciousMessage: ChatMessage = {
        id: 'msg1',
        lobbyId: 'lobby1',
        senderId: 'player1',
        senderName: 'Player 1',
        message: '<script>alert("xss")</script>',
        timestamp: new Date(),
        type: ChatMessageType.PLAYER_MESSAGE
      };

      const validation = messageSecurityService.validateChatMessage(maliciousMessage, 'player1');
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('MALICIOUS_CHAT_CONTENT');
      expect(validation.riskLevel).toBe(SecurityRiskLevel.HIGH);
    });
  });

  describe('Anti-Cheat Metrics', () => {
    test('should track suspicious activity correctly', () => {
      // Simulate suspicious activity
      const result: MatchResult = {
        matchId: 'match1',
        player1Id: 'player1',
        player2Id: 'player2',
        winnerId: 'player1',
        loserId: 'player2',
        player1Score: 45,
        player2Score: 30,
        gameSessionId: 'session1',
        statistics: {
          totalRounds: 10,
          player1Cooperations: 6,
          player1Betrayals: 4,
          player2Cooperations: 5,
          player2Betrayals: 5,
          matchDuration: 10 // Too fast
        },
        completedAt: new Date()
      };

      const mockActiveMatch: ActiveMatch = {
        id: 'match1',
        tournamentId: 'tournament1',
        roundNumber: 1,
        player1: { id: 'player1' } as TournamentPlayer,
        player2: { id: 'player2' } as TournamentPlayer,
        status: MatchStatus.IN_PROGRESS,
        startTime: new Date(Date.now() - 10000)
      };

      const mockTournament: Tournament = {
        id: 'tournament1',
        players: [],
        bracket: { rounds: [], eliminatedPlayers: [], activeMatches: new Map(), nextMatchPairings: [] }
      } as Tournament;

      // This should flag suspicious activity
      securityService.validateMatchResult(result, mockTournament, mockActiveMatch);

      const metrics = securityService.getAntiCheatMetrics('player1');
      expect(metrics.suspiciousActivityCount).toBeGreaterThan(0);
      expect(metrics.flaggedBehaviors).toContain(CheatFlag.IMPOSSIBLE_TIMING);
      expect(metrics.riskScore).toBeGreaterThan(0);
    });

    test('should identify high-risk players', () => {
      // Simulate multiple violations to increase risk score
      for (let i = 0; i < 5; i++) {
        const result: MatchResult = {
          matchId: `match${i}`,
          player1Id: 'player1',
          player2Id: 'player2',
          winnerId: 'player1',
          loserId: 'player2',
          player1Score: 45,
          player2Score: 30,
          gameSessionId: `session${i}`,
          statistics: {
            totalRounds: 10,
            player1Cooperations: 6,
            player1Betrayals: 4,
            player2Cooperations: 5,
            player2Betrayals: 5,
            matchDuration: 10 // Consistently too fast
          },
          completedAt: new Date()
        };

        const mockActiveMatch: ActiveMatch = {
          id: `match${i}`,
          tournamentId: 'tournament1',
          roundNumber: 1,
          player1: { id: 'player1' } as TournamentPlayer,
          player2: { id: 'player2' } as TournamentPlayer,
          status: MatchStatus.IN_PROGRESS,
          startTime: new Date(Date.now() - 10000)
        };

        const mockTournament: Tournament = {
          id: 'tournament1',
          players: [],
          bracket: { rounds: [], eliminatedPlayers: [], activeMatches: new Map(), nextMatchPairings: [] }
        } as Tournament;

        securityService.validateMatchResult(result, mockTournament, mockActiveMatch);
      }

      expect(securityService.isPlayerHighRisk('player1')).toBe(true);
    });
  });

  describe('Security Data Cleanup', () => {
    test('should clean up old security data', () => {
      // Add some data
      securityService.trackPlayerSession('player1', 'session1');
      messageSecurityService.validatePartyMessage({
        type: PartyMessageType.CHAT_MESSAGE,
        lobbyId: 'lobby1',
        senderId: 'player1',
        data: {},
        timestamp: new Date()
      }, 'player1', 'conn1');

      // Cleanup should not throw errors
      expect(() => {
        securityService.cleanupSecurityData();
        messageSecurityService.cleanupSecurityData();
      }).not.toThrow();
    });
  });
});