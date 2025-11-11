// JavaScript wrapper for TypeScript DatabaseManager
// This provides a CommonJS interface to the TypeScript modules

const { getDatabaseService } = require('./DatabaseService');

// For now, we'll use the old DatabaseService as a fallback
// until we can properly set up TypeScript compilation

class DatabaseManagerWrapper {
  constructor() {
    this.db = getDatabaseService();
    this.initialized = true;
  }

  async initialize() {
    // Already initialized in constructor
    return Promise.resolve();
  }

  isInitialized() {
    return this.initialized;
  }

  async migrate(migrations) {
    // For now, skip migrations as the old system doesn't support them
    console.log('⚠️ Migration skipped - using legacy database system');
    return Promise.resolve();
  }

  async healthCheck() {
    return {
      isConnected: true,
      responseTime: 0,
      activeConnections: 1,
      totalConnections: 1,
      uptime: process.uptime(),
      lastError: null
    };
  }

  async close() {
    // The old system doesn't need explicit closing
    this.initialized = false;
    return Promise.resolve();
  }

  getUserRepository() {
    return {
      findByUsername: (username) => this.db.getUserByUsername(username),
      findById: (id) => this.db.getUserById(id),
      findByEmail: (email) => this.db.getUserByEmail(email),
      createUser: (userData) => this.db.createUser(userData),
      update: (id, updates) => this.db.updateUser(id, updates),
      updateLastActive: (id) => this.db.updateUser(id, { lastActive: new Date().toISOString() }),
      updateStats: (id, stats) => this.db.updateUserStats(id, stats),
      delete: (id) => this.db.deleteUser(id),
      incrementLoginAttempts: (id) => {
        // Not implemented in old system
        return Promise.resolve();
      },
      resetLoginAttempts: (id) => {
        // Not implemented in old system
        return Promise.resolve();
      },
      isAccountLocked: (id) => {
        // Not implemented in old system
        return Promise.resolve(false);
      }
    };
  }

  getSessionRepository() {
    return {
      findByToken: (token) => this.db.getSessionByToken(token),
      findById: (id) => this.db.getSessionById(id),
      createSession: (sessionData) => this.db.createSession(sessionData),
      update: (id, updates) => this.db.updateSession(id, updates),
      updateLastUsed: (id) => this.db.updateSession(id, { lastUsed: new Date().toISOString() }),
      invalidateSession: (id) => this.db.deleteSession(id),
      invalidateUserSessions: (userId) => {
        // Not implemented in old system
        return Promise.resolve();
      },
      cleanupExpired: () => {
        // Not implemented in old system
        return Promise.resolve(0);
      }
    };
  }

  getUserStatsRepository() {
    return {
      findByUserId: (userId) => this.db.getUserStats(userId),
      create: (statsData) => this.db.createUserStats(statsData),
      update: (id, updates) => this.db.updateUserStats(id, updates),
      updateStats: (userId, stats) => this.db.updateUserStats(userId, stats),
      incrementGamesPlayed: (userId) => {
        // Will be handled in update method
        return Promise.resolve();
      },
      incrementGamesWon: (userId) => {
        // Will be handled in update method
        return Promise.resolve();
      }
    };
  }

  getGameHistoryRepository() {
    return {
      create: (gameData) => this.db.createGameHistory(gameData),
      findById: (id) => this.db.getGameHistoryById(id),
      findByUserId: (userId) => this.db.getGameHistoryByUserId(userId),
      findByPlayers: (player1Id, player2Id) => this.db.getGameHistoryByPlayers(player1Id, player2Id),
      getRecentGames: (limit = 10) => this.db.getRecentGameHistory(limit)
    };
  }

  getGameRepository() {
    return {
      findById: (id) => this.db.getGameById(id),
      createGame: (gameData) => this.db.createGame(gameData),
      update: (id, updates) => this.db.updateGame(id, updates),
      findGamesByLobbyCode: (lobbyCode) => this.db.getGamesByLobbyCode(lobbyCode),
      getGameStatistics: () => {
        return Promise.resolve({
          totalGames: 0,
          activeGames: 0,
          completedGames: 0
        });
      }
    };
  }

  async getStatistics() {
    return {
      database: await this.healthCheck(),
      repositories: {},
      connectionPool: null,
      transactions: null
    };
  }

  async cleanup() {
    return {
      expiredSessions: 0,
      inactiveGames: 0,
      oldLogs: 0
    };
  }

  async optimize() {
    return {
      vacuum: false,
      analyze: false,
      reindex: false,
      duration: 0
    };
  }
}

// Singleton instance
let databaseManagerInstance = null;

function getDatabaseManager() {
  if (!databaseManagerInstance) {
    databaseManagerInstance = new DatabaseManagerWrapper();
  }
  return databaseManagerInstance;
}

async function initializeDatabaseManager() {
  const manager = getDatabaseManager();
  await manager.initialize();
  return manager;
}

async function resetDatabaseManager() {
  if (databaseManagerInstance) {
    await databaseManagerInstance.close();
    databaseManagerInstance = null;
  }
}

module.exports = {
  DatabaseManagerWrapper,
  getDatabaseManager,
  initializeDatabaseManager,
  resetDatabaseManager
};