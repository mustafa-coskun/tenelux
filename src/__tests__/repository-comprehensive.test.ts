// Comprehensive Repository Tests

import { initializeDatabaseManager, resetDatabaseManager } from '../database/DatabaseManager';
import { getSecurityService } from '../services/SecurityService';
import { testConfig } from '../config/database';

describe('Repository Comprehensive Tests', () => {
  let dbManager: any;
  let securityService: any;

  beforeAll(async () => {
    securityService = getSecurityService(testConfig.security);
    dbManager = await initializeDatabaseManager();
  });

  afterAll(async () => {
    if (dbManager) {
      await dbManager.close();
    }
    await resetDatabaseManager();
  });

  describe('User Repository', () => {
    test('should handle complete user lifecycle', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Create user
      const userData = {
        username: 'lifecycletest',
        displayName: 'Lifecycle Test User',
        email: 'lifecycle@test.com',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false,
        avatar: '🎮'
      };
      
      const user = await userRepo.createUser(userData);
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.username).toBe(userData.username);
      expect(user.createdAt).toBeDefined();
      
      // Find by ID
      const foundById = await userRepo.findById(user.id);
      expect(foundById).toBeDefined();
      expect(foundById?.username).toBe(userData.username);
      
      // Find by username
      const foundByUsername = await userRepo.findByUsername(userData.username);
      expect(foundByUsername).toBeDefined();
      expect(foundByUsername?.id).toBe(user.id);
      
      // Find by email
      const foundByEmail = await userRepo.findByEmail(userData.email!);
      expect(foundByEmail).toBeDefined();
      expect(foundByEmail?.id).toBe(user.id);
      
      // Update user
      const updateData = {
        displayName: 'Updated Display Name',
        avatar: '🚀'
      };
      
      const updatedUser = await userRepo.update(user.id, updateData);
      expect(updatedUser.displayName).toBe(updateData.displayName);
      expect(updatedUser.avatar).toBe(updateData.avatar);
      expect(updatedUser.updatedAt).toBeDefined();
      
      // Update last active
      await userRepo.updateLastActive(user.id);
      const activeUser = await userRepo.findById(user.id);
      expect(activeUser?.lastActive).toBeDefined();
      
      // Test user stats
      const stats = {
        totalGames: 10,
        wins: 7,
        losses: 3,
        totalScore: 850
      };
      
      await userRepo.updateStats(user.id, stats);
      const userWithStats = await userRepo.findById(user.id);
      expect(userWithStats?.stats).toBeDefined();
      expect(userWithStats?.stats.totalGames).toBe(stats.totalGames);
      
      // Delete user
      await userRepo.delete(user.id);
      const deletedUser = await userRepo.findById(user.id);
      expect(deletedUser).toBeNull();
    });

    test('should handle user authentication features', async () => {
      const userRepo = dbManager.getUserRepository();
      
      const user = await userRepo.createUser({
        username: 'authtest',
        displayName: 'Auth Test User',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      // Test login attempts
      expect(await userRepo.isAccountLocked(user.id)).toBe(false);
      
      await userRepo.incrementLoginAttempts(user.id);
      await userRepo.incrementLoginAttempts(user.id);
      await userRepo.incrementLoginAttempts(user.id);
      
      const userWithAttempts = await userRepo.findById(user.id);
      expect(userWithAttempts?.loginAttempts).toBe(3);
      
      // Reset login attempts
      await userRepo.resetLoginAttempts(user.id);
      const resetUser = await userRepo.findById(user.id);
      expect(resetUser?.loginAttempts).toBe(0);
    });

    test('should handle batch operations', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Create multiple users
      const userDataList = [];
      for (let i = 0; i < 5; i++) {
        userDataList.push({
          username: `batchtest${i}`,
          displayName: `Batch Test User ${i}`,
          passwordHash: await securityService.hashPassword('testpass'),
          isGuest: false
        });
      }
      
      const users = await userRepo.createMany(userDataList);
      expect(users).toHaveLength(5);
      
      // Find multiple users
      const foundUsers = await userRepo.findBy({
        username: {
          operator: 'LIKE',
          value: 'batchtest%'
        }
      });
      expect(foundUsers.length).toBeGreaterThanOrEqual(5);
      
      // Update multiple users
      const updateCount = await userRepo.updateMany(
        { username: { operator: 'LIKE', value: 'batchtest%' } },
        { avatar: '🔥' }
      );
      expect(updateCount).toBeGreaterThanOrEqual(5);
      
      // Delete multiple users
      const deleteCount = await userRepo.deleteMany({
        username: { operator: 'LIKE', value: 'batchtest%' }
      });
      expect(deleteCount).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Session Repository', () => {
    test('should handle session lifecycle', async () => {
      const sessionRepo = dbManager.getSessionRepository();
      const userRepo = dbManager.getUserRepository();
      
      // Create test user
      const user = await userRepo.createUser({
        username: 'sessiontest',
        displayName: 'Session Test User',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      // Create session
      const sessionData = {
        userId: user.id,
        token: securityService.generateSecureToken(),
        expiresAt: new Date(Date.now() + 60000),
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      };
      
      const session = await sessionRepo.createSession(sessionData);
      expect(session).toBeDefined();
      expect(session.token).toBe(sessionData.token);
      expect(session.userId).toBe(user.id);
      
      // Find by token
      const foundSession = await sessionRepo.findByToken(sessionData.token);
      expect(foundSession).toBeDefined();
      expect(foundSession?.id).toBe(session.id);
      
      // Update last used
      await sessionRepo.updateLastUsed(session.id);
      const updatedSession = await sessionRepo.findById(session.id);
      expect(updatedSession?.lastUsed).toBeDefined();
      
      // Find user sessions
      const userSessions = await sessionRepo.findByUserId(user.id);
      expect(userSessions.length).toBeGreaterThanOrEqual(1);
      expect(userSessions[0].userId).toBe(user.id);
      
      // Invalidate session
      await sessionRepo.invalidateSession(session.id);
      const invalidatedSession = await sessionRepo.findById(session.id);
      expect(invalidatedSession?.isActive).toBe(false);
    });

    test('should handle session cleanup', async () => {
      const sessionRepo = dbManager.getSessionRepository();
      const userRepo = dbManager.getUserRepository();
      
      // Create test user
      const user = await userRepo.createUser({
        username: 'cleanuptest',
        displayName: 'Cleanup Test User',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      // Create expired session
      const expiredSession = await sessionRepo.createSession({
        userId: user.id,
        token: securityService.generateSecureToken(),
        expiresAt: new Date(Date.now() - 60000), // Expired
        ipAddress: '127.0.0.1'
      });
      
      // Create active session
      const activeSession = await sessionRepo.createSession({
        userId: user.id,
        token: securityService.generateSecureToken(),
        expiresAt: new Date(Date.now() + 60000), // Active
        ipAddress: '127.0.0.1'
      });
      
      // Cleanup expired sessions
      const cleanedCount = await sessionRepo.cleanupExpired();
      expect(cleanedCount).toBeGreaterThanOrEqual(1);
      
      // Expired session should be gone
      const expiredFound = await sessionRepo.findById(expiredSession.id);
      expect(expiredFound).toBeNull();
      
      // Active session should remain
      const activeFound = await sessionRepo.findById(activeSession.id);
      expect(activeFound).toBeDefined();
    });
  });

  describe('Game Repository', () => {
    test('should handle game lifecycle', async () => {
      const gameRepo = dbManager.getGameRepository();
      const userRepo = dbManager.getUserRepository();
      
      // Create test users
      const user1 = await userRepo.createUser({
        username: 'gameplayer1',
        displayName: 'Game Player 1',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      const user2 = await userRepo.createUser({
        username: 'gameplayer2',
        displayName: 'Game Player 2',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      // Create game
      const gameData = {
        type: 'multiplayer',
        status: 'active',
        participants: JSON.stringify([
          { userId: user1.id, role: 'player' },
          { userId: user2.id, role: 'player' }
        ]),
        settings: JSON.stringify({
          maxRounds: 10,
          timePerRound: 30
        }),
        lobbyCode: 'TEST123'
      };
      
      const game = await gameRepo.createGame(gameData);
      expect(game).toBeDefined();
      expect(game.type).toBe(gameData.type);
      expect(game.status).toBe(gameData.status);
      
      // Find by ID
      const foundGame = await gameRepo.findById(game.id);
      expect(foundGame).toBeDefined();
      expect(foundGame?.id).toBe(game.id);
      
      // Find by lobby code
      const gamesByLobby = await gameRepo.findGamesByLobbyCode('TEST123');
      expect(gamesByLobby.length).toBeGreaterThanOrEqual(1);
      expect(gamesByLobby[0].lobbyCode).toBe('TEST123');
      
      // Update game
      const updateData = {
        status: 'completed',
        completedAt: new Date()
      };
      
      const updatedGame = await gameRepo.update(game.id, updateData);
      expect(updatedGame.status).toBe('completed');
      expect(updatedGame.completedAt).toBeDefined();
      
      // Get game statistics
      const stats = await gameRepo.getGameStatistics();
      expect(stats).toBeDefined();
      expect(stats.totalGames).toBeGreaterThanOrEqual(1);
    });

    test('should handle game queries', async () => {
      const gameRepo = dbManager.getGameRepository();
      
      // Create multiple games
      const games = [];
      for (let i = 0; i < 3; i++) {
        const game = await gameRepo.createGame({
          type: 'single_player',
          status: i % 2 === 0 ? 'active' : 'completed',
          participants: JSON.stringify([]),
          settings: JSON.stringify({}),
          lobbyCode: `QUERY${i}`
        });
        games.push(game);
      }
      
      // Find active games
      const activeGames = await gameRepo.findBy({ status: 'active' });
      expect(activeGames.length).toBeGreaterThanOrEqual(2);
      
      // Find completed games
      const completedGames = await gameRepo.findBy({ status: 'completed' });
      expect(completedGames.length).toBeGreaterThanOrEqual(1);
      
      // Count games
      const totalCount = await gameRepo.count({});
      expect(totalCount).toBeGreaterThanOrEqual(3);
      
      // Paginate games
      const paginatedResult = await gameRepo.paginate({}, 1, 2);
      expect(paginatedResult.data.length).toBeLessThanOrEqual(2);
      expect(paginatedResult.total).toBeGreaterThanOrEqual(3);
      expect(paginatedResult.page).toBe(1);
      expect(paginatedResult.pageSize).toBe(2);
    });
  });

  describe('Repository Statistics', () => {
    test('should provide repository statistics', async () => {
      const userRepo = dbManager.getUserRepository();
      const sessionRepo = dbManager.getSessionRepository();
      const gameRepo = dbManager.getGameRepository();
      
      // Create some test data
      await userRepo.createUser({
        username: 'statstest',
        displayName: 'Stats Test User',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      // Get statistics
      const userStats = await userRepo.getStats();
      expect(userStats).toBeDefined();
      expect(userStats.tableName).toBe('users');
      expect(userStats.totalRecords).toBeGreaterThanOrEqual(1);
      expect(userStats.recentActivity).toBeDefined();
      
      const sessionStats = await sessionRepo.getStats();
      expect(sessionStats).toBeDefined();
      expect(sessionStats.tableName).toBe('sessions');
      
      const gameStats = await gameRepo.getStats();
      expect(gameStats).toBeDefined();
      expect(gameStats.tableName).toBe('games');
    });
  });

  describe('Error Handling', () => {
    test('should handle validation errors', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Test missing required fields
      await expect(userRepo.createUser({
        username: '', // Empty username
        displayName: 'Test User',
        passwordHash: 'hash',
        isGuest: false
      })).rejects.toThrow();
      
      // Test invalid data types
      await expect(userRepo.createUser({
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: 'hash',
        isGuest: 'not_boolean' as any // Invalid type
      })).rejects.toThrow();
    });

    test('should handle constraint violations', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Create user
      await userRepo.createUser({
        username: 'constrainttest',
        displayName: 'Constraint Test User',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      });
      
      // Try to create duplicate username
      await expect(userRepo.createUser({
        username: 'constrainttest', // Duplicate
        displayName: 'Another User',
        passwordHash: await securityService.hashPassword('testpass'),
        isGuest: false
      })).rejects.toThrow();
    });

    test('should handle not found errors', async () => {
      const userRepo = dbManager.getUserRepository();
      
      // Try to find non-existent user
      const nonExistentUser = await userRepo.findById('non-existent-id');
      expect(nonExistentUser).toBeNull();
      
      // Try to update non-existent user
      await expect(userRepo.update('non-existent-id', {
        displayName: 'Updated Name'
      })).rejects.toThrow();
      
      // Try to delete non-existent user
      await expect(userRepo.delete('non-existent-id')).rejects.toThrow();
    });
  });
});