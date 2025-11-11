import { getUserService, User, GameSession } from '../UserService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock
});

describe('UserService', () => {
  let userService: any;

  beforeEach(() => {
    // Clear storage before each test
    localStorageMock.clear();
    sessionStorageMock.clear();
    
    // Get fresh instance
    userService = getUserService();
    
    // Reset internal state
    userService.currentUser = null;
    userService.currentSession = null;
    
    // Clear any existing data from previous tests
    userService.explicitLogout();
  });

  describe('User Management', () => {
    test('should create a new user with valid data', () => {
      const userName = 'TestPlayer';
      const user = userService.createUser(userName);

      expect(user).toBeDefined();
      expect(user.id).toMatch(/^user_\d+_[a-z0-9]+$/);
      expect(user.name).toBe(userName);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.lastActive).toBeInstanceOf(Date);
      expect(userService.getCurrentUser()).toEqual(user);
    });

    test('should trim whitespace from user name', () => {
      const userName = '  TestPlayer  ';
      const user = userService.createUser(userName);

      expect(user.name).toBe('TestPlayer');
    });

    test('should update user data correctly', () => {
      const user = userService.createUser('TestPlayer');
      const originalLastActive = user.lastActive;

      // Wait a bit to ensure different timestamp
      setTimeout(() => {
        const updatedUser = userService.updateUser({ name: 'UpdatedPlayer' });

        expect(updatedUser).toBeDefined();
        expect(updatedUser!.name).toBe('UpdatedPlayer');
        expect(updatedUser!.id).toBe(user.id);
        expect(updatedUser!.lastActive.getTime()).toBeGreaterThan(originalLastActive.getTime());
      }, 10);
    });

    test('should return null when updating without current user', () => {
      const result = userService.updateUser({ name: 'TestPlayer' });
      expect(result).toBeNull();
    });

    test('should get or create user when none exists', () => {
      const user = userService.getOrCreateUser('NewPlayer');

      expect(user).toBeDefined();
      expect(user.name).toBe('NewPlayer');
      expect(userService.isLoggedIn()).toBe(true);
    });

    test('should return existing user when one exists', () => {
      const originalUser = userService.createUser('ExistingPlayer');
      const retrievedUser = userService.getOrCreateUser('DifferentName');

      expect(retrievedUser.id).toBe(originalUser.id);
      expect(retrievedUser.name).toBe('ExistingPlayer'); // Should keep original name
    });

    test('should generate default name when none provided', () => {
      const user = userService.getOrCreateUser();

      expect(user.name).toMatch(/^Player_\d{6}$/);
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      userService.createUser('TestPlayer');
    });

    test('should create a new session', () => {
      const session = userService.createSession('lobby', { lobbyId: 'test-lobby' });

      expect(session).toBeDefined();
      expect(session.userId).toBe(userService.getCurrentUser().id);
      expect(session.currentState).toBe('lobby');
      expect(session.lobbyId).toBe('test-lobby');
      expect(session.lastUpdated).toBeInstanceOf(Date);
    });

    test('should throw error when creating session without user', () => {
      userService.currentUser = null;

      expect(() => {
        userService.createSession('lobby');
      }).toThrow('No user logged in');
    });

    test('should update existing session', () => {
      const session = userService.createSession('lobby');
      const originalTimestamp = session.lastUpdated;

      setTimeout(() => {
        const updatedSession = userService.updateSession({ currentState: 'tournament' });

        expect(updatedSession).toBeDefined();
        expect(updatedSession!.currentState).toBe('tournament');
        expect(updatedSession!.lastUpdated.getTime()).toBeGreaterThan(originalTimestamp.getTime());
      }, 10);
    });

    test('should return null when updating without current session', () => {
      const result = userService.updateSession({ currentState: 'menu' });
      expect(result).toBeNull();
    });

    test('should clear session data', () => {
      userService.createSession('lobby');
      expect(userService.hasActiveSession()).toBe(true);

      userService.clearSession();
      expect(userService.hasActiveSession()).toBe(false);
      expect(userService.getCurrentSession()).toBeNull();
    });
  });

  describe('Persistence', () => {
    test('should save and load user data from localStorage', () => {
      const user = userService.createUser('PersistentPlayer');
      
      // Create new service instance to test loading
      const newService = getUserService();
      const loadedUser = newService.getCurrentUser();

      expect(loadedUser).toBeDefined();
      expect(loadedUser!.id).toBe(user.id);
      expect(loadedUser!.name).toBe(user.name);
      expect(loadedUser!.createdAt).toEqual(user.createdAt);
    });

    test('should save and load session data from localStorage', () => {
      userService.createUser('TestPlayer');
      const session = userService.createSession('lobby', { lobbyId: 'test-lobby' });
      
      // Create new service instance to test loading
      const newService = getUserService();
      const loadedSession = newService.getCurrentSession();

      expect(loadedSession).toBeDefined();
      expect(loadedSession!.userId).toBe(session.userId);
      expect(loadedSession!.currentState).toBe(session.currentState);
      expect(loadedSession!.lobbyId).toBe(session.lobbyId);
    });

    test('should handle corrupted user data gracefully', () => {
      // Clear existing data first
      userService.explicitLogout();
      localStorageMock.setItem('tenebris_user', 'invalid-json');
      
      // Force reload from storage
      userService.loadUserFromStorage();
      expect(userService.getCurrentUser()).toBeNull();
      expect(localStorageMock.getItem('tenebris_user')).toBeNull();
    });

    test('should handle corrupted session data gracefully', () => {
      // Clear existing data first
      userService.explicitLogout();
      localStorageMock.setItem('tenebris_session', 'invalid-json');
      
      // Force reload from storage
      userService.loadSessionFromStorage();
      expect(userService.getCurrentSession()).toBeNull();
      expect(localStorageMock.getItem('tenebris_session')).toBeNull();
    });

    test('should expire old sessions', () => {
      // Clear existing data first
      userService.explicitLogout();
      
      // Manually set old session data
      const oldSession = {
        userId: 'test-user',
        currentState: 'lobby',
        lastUpdated: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
      };
      localStorageMock.setItem('tenebris_session', JSON.stringify(oldSession));
      
      // Force reload from storage
      userService.loadSessionFromStorage();
      expect(userService.getCurrentSession()).toBeNull();
    });
  });

  describe('Logout and Leave Functionality', () => {
    beforeEach(() => {
      userService.createUser('TestPlayer');
      userService.createSession('lobby', { lobbyId: 'test-lobby' });
    });

    test('should leave lobby while preserving user identity', () => {
      userService.leaveLobby();
      
      const session = userService.getCurrentSession();
      expect(session).toBeDefined();
      expect(session!.currentState).toBe('menu');
      expect(session!.lobbyId).toBeUndefined();
      expect(userService.getCurrentUser()).toBeDefined();
    });

    test('should perform explicit logout clearing all data', () => {
      userService.explicitLogout();
      
      expect(userService.getCurrentUser()).toBeNull();
      expect(userService.getCurrentSession()).toBeNull();
      expect(localStorageMock.getItem('tenebris_user')).toBeNull();
      expect(localStorageMock.getItem('tenebris_session')).toBeNull();
    });

    test('should handle intentional disconnection flags', () => {
      expect(userService.isIntentionalDisconnection()).toBe(false);
      
      userService.markIntentionalLeave();
      expect(userService.isIntentionalDisconnection()).toBe(true);
      
      userService.clearIntentionalLeave();
      expect(userService.isIntentionalDisconnection()).toBe(false);
    });
  });

  describe('Utility Methods', () => {
    test('should correctly report login status', () => {
      expect(userService.isLoggedIn()).toBe(false);
      
      userService.createUser('TestPlayer');
      expect(userService.isLoggedIn()).toBe(true);
      
      userService.logout();
      expect(userService.isLoggedIn()).toBe(false);
    });

    test('should correctly report active session status', () => {
      userService.createUser('TestPlayer');
      expect(userService.hasActiveSession()).toBe(false);
      
      userService.createSession('lobby');
      expect(userService.hasActiveSession()).toBe(true);
      
      userService.clearSession();
      expect(userService.hasActiveSession()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty user name gracefully', () => {
      const user = userService.createUser('   ');
      expect(user.name).toBe('');
    });

    test('should handle multiple rapid updates', () => {
      const user = userService.createUser('TestPlayer');
      
      for (let i = 0; i < 10; i++) {
        userService.updateUser({ name: `Player${i}` });
      }
      
      const finalUser = userService.getCurrentUser();
      expect(finalUser!.name).toBe('Player9');
      expect(finalUser!.id).toBe(user.id);
    });

    test('should handle session updates without active session', () => {
      userService.createUser('TestPlayer');
      const result = userService.updateSession({ currentState: 'tournament' });
      expect(result).toBeNull();
    });
  });
});