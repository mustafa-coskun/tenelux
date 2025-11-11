// User repository unit tests

import { UserRepository } from '../UserRepository';
import { SQLiteAdapter } from '../../adapters/SQLiteAdapter';
import { testConfig } from '../../../config/database';

describe('UserRepository', () => {
  let adapter: SQLiteAdapter;
  let userRepo: UserRepository;

  beforeEach(async () => {
    // Use in-memory SQLite for testing
    adapter = new SQLiteAdapter();
    await adapter.connect({ ...testConfig.database, database: ':memory:' });
    
    // Create tables
    await adapter.execute(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        email TEXT,
        is_guest BOOLEAN DEFAULT 0,
        avatar TEXT DEFAULT '🎮',
        status TEXT DEFAULT 'active',
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
        email_verified BOOLEAN DEFAULT 0,
        login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        preferences TEXT DEFAULT '{}',
        stats TEXT DEFAULT '{}',
        friends TEXT DEFAULT '[]',
        achievements TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    userRepo = new UserRepository(adapter);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('createUser', () => {
    test('should create a new user successfully', async () => {
      const userData = {
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: 'hashedpassword',
        isGuest: false
      };

      const user = await userRepo.createUser(userData);

      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.displayName).toBe('Test User');
      expect(user.isGuest).toBe(false);
      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeDefined();
    });

    test('should create a guest user', async () => {
      const userData = {
        displayName: 'Guest User',
        isGuest: true
      };

      const user = await userRepo.createUser(userData);

      expect(user).toBeDefined();
      expect(user.displayName).toBe('Guest User');
      expect(user.isGuest).toBe(true);
      expect(user.passwordHash).toBeUndefined();
    });

    test('should validate required fields', async () => {
      await expect(userRepo.createUser({
        username: '', // Empty username
        displayName: 'Test User',
        isGuest: false
      })).rejects.toThrow();

      await expect(userRepo.createUser({
        username: 'testuser',
        displayName: '', // Empty display name
        isGuest: false
      })).rejects.toThrow();
    });

    test('should validate username format', async () => {
      await expect(userRepo.createUser({
        username: 'ab', // Too short
        displayName: 'Test User',
        isGuest: false
      })).rejects.toThrow();

      await expect(userRepo.createUser({
        username: 'user@name', // Invalid characters
        displayName: 'Test User',
        isGuest: false
      })).rejects.toThrow();
    });
  });

  describe('findByUsername', () => {
    test('should find user by username', async () => {
      const userData = {
        username: 'findtest',
        displayName: 'Find Test',
        passwordHash: 'hashedpassword',
        isGuest: false
      };

      const createdUser = await userRepo.createUser(userData);
      const foundUser = await userRepo.findByUsername('findtest');

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(createdUser.id);
      expect(foundUser?.username).toBe('findtest');
    });

    test('should return null for non-existent user', async () => {
      const user = await userRepo.findByUsername('nonexistent');
      expect(user).toBeNull();
    });

    test('should be case insensitive', async () => {
      await userRepo.createUser({
        username: 'CaseTest',
        displayName: 'Case Test',
        isGuest: false
      });

      const user = await userRepo.findByUsername('casetest');
      expect(user).toBeDefined();
      expect(user?.username).toBe('CaseTest');
    });
  });

  describe('updateStats', () => {
    test('should update user statistics', async () => {
      const user = await userRepo.createUser({
        username: 'statstest',
        displayName: 'Stats Test',
        isGuest: false
      });

      const newStats = {
        totalGames: 10,
        wins: 7,
        losses: 3,
        totalScore: 350
      };

      await userRepo.updateStats(user.id, newStats);

      const updatedUser = await userRepo.findById(user.id);
      expect(updatedUser?.stats.totalGames).toBe(10);
      expect(updatedUser?.stats.wins).toBe(7);
      expect(updatedUser?.stats.winRate).toBe(70); // Should be calculated
    });
  });

  describe('addFriend', () => {
    test('should add friend to user', async () => {
      const user1 = await userRepo.createUser({
        username: 'user1',
        displayName: 'User 1',
        isGuest: false
      });

      const user2 = await userRepo.createUser({
        username: 'user2',
        displayName: 'User 2',
        isGuest: false
      });

      await userRepo.addFriend(user1.id, user2.id);

      const updatedUser = await userRepo.findById(user1.id);
      expect(updatedUser?.friends).toContain(user2.id);
    });

    test('should not add duplicate friends', async () => {
      const user1 = await userRepo.createUser({
        username: 'user3',
        displayName: 'User 3',
        isGuest: false
      });

      const user2 = await userRepo.createUser({
        username: 'user4',
        displayName: 'User 4',
        isGuest: false
      });

      await userRepo.addFriend(user1.id, user2.id);
      await userRepo.addFriend(user1.id, user2.id); // Add again

      const updatedUser = await userRepo.findById(user1.id);
      const friendCount = updatedUser?.friends.filter(id => id === user2.id).length;
      expect(friendCount).toBe(1);
    });
  });

  describe('isAccountLocked', () => {
    test('should detect locked account', async () => {
      const user = await userRepo.createUser({
        username: 'lockedtest',
        displayName: 'Locked Test',
        isGuest: false
      });

      // Lock the account
      await userRepo.update(user.id, {
        lockedUntil: new Date(Date.now() + 60000) // Lock for 1 minute
      });

      const isLocked = await userRepo.isAccountLocked(user.id);
      expect(isLocked).toBe(true);
    });

    test('should detect unlocked account', async () => {
      const user = await userRepo.createUser({
        username: 'unlockedtest',
        displayName: 'Unlocked Test',
        isGuest: false
      });

      const isLocked = await userRepo.isAccountLocked(user.id);
      expect(isLocked).toBe(false);
    });
  });

  describe('searchUsers', () => {
    beforeEach(async () => {
      // Create test users for search
      await userRepo.createUser({
        username: 'alice',
        displayName: 'Alice Smith',
        isGuest: false
      });

      await userRepo.createUser({
        username: 'bob',
        displayName: 'Bob Johnson',
        isGuest: false
      });

      await userRepo.createUser({
        username: 'charlie',
        displayName: 'Charlie Brown',
        isGuest: false
      });
    });

    test('should search by username', async () => {
      const results = await userRepo.searchUsers('alice');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].username).toBe('alice');
    });

    test('should search by display name', async () => {
      const results = await userRepo.searchUsers('Smith');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].displayName).toContain('Smith');
    });

    test('should return empty array for no matches', async () => {
      const results = await userRepo.searchUsers('nonexistent');
      expect(results).toEqual([]);
    });
  });
});