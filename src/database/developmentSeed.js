// Development-only seed data
const { getDatabaseManager } = require('./DatabaseManager');
const { getSecurityService } = require('../services/SecurityService');
const { getLogger } = require('../services/LoggingService');
const { getValidatedConfig } = require('../config/validation');

async function seedDevelopmentData() {
  // Only seed in development environment
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production') {
    console.log('⚠️ Skipping database seeding in production environment');
    return;
  }
  
  if (nodeEnv === 'test') {
    console.log('⚠️ Skipping database seeding in test environment');
    return;
  }

  try {
    // Get services
    const config = getValidatedConfig();
    const logger = getLogger(config.logging);
    const securityService = getSecurityService(config.security);
    const dbManager = getDatabaseManager();

    if (!dbManager || !dbManager.isInitialized()) {
      console.log('⚠️ Database manager not initialized, skipping seed');
      return;
    }

    logger.info('🌱 Seeding database with development data...');
    logger.info(`📍 Environment: ${nodeEnv}`);

    const userRepo = dbManager.getUserRepository();

    // Test users data
    const testUsers = [
      {
        username: 'progamer123',
        displayName: 'ProGamer123',
        password: 'test123',
        isGuest: false,
        avatar: '🎮',
        stats: {
          totalGames: 150,
          wins: 120,
          losses: 30,
          cooperations: 100,
          betrayals: 20,
          totalScore: 7500,
          winRate: 80,
          trustScore: 85,
          betrayalRate: 16.7,
          averageScore: 50,
          longestWinStreak: 15,
          currentWinStreak: 5,
          gamesThisWeek: 10,
          gamesThisMonth: 45
        }
      },
      {
        username: 'strategymaster',
        displayName: 'StrategyMaster',
        password: 'test123',
        isGuest: false,
        avatar: '🧠',
        stats: {
          totalGames: 200,
          wins: 140,
          losses: 60,
          cooperations: 150,
          betrayals: 10,
          totalScore: 9200,
          winRate: 70,
          trustScore: 92,
          betrayalRate: 6.25,
          averageScore: 46,
          longestWinStreak: 12,
          currentWinStreak: 3,
          gamesThisWeek: 8,
          gamesThisMonth: 35
        }
      },
      {
        username: 'cooperator',
        displayName: 'The Cooperator',
        password: 'test123',
        isGuest: false,
        avatar: '🤝',
        stats: {
          totalGames: 100,
          wins: 75,
          losses: 25,
          cooperations: 90,
          betrayals: 5,
          totalScore: 4800,
          winRate: 75,
          trustScore: 95,
          betrayalRate: 5.3,
          averageScore: 48,
          longestWinStreak: 8,
          currentWinStreak: 2,
          gamesThisWeek: 5,
          gamesThisMonth: 20
        }
      },
      {
        username: 'betrayer',
        displayName: 'The Betrayer',
        password: 'test123',
        isGuest: false,
        avatar: '⚔️',
        stats: {
          totalGames: 80,
          wins: 45,
          losses: 35,
          cooperations: 20,
          betrayals: 55,
          totalScore: 3200,
          winRate: 56.25,
          trustScore: 25,
          betrayalRate: 73.3,
          averageScore: 40,
          longestWinStreak: 6,
          currentWinStreak: 0,
          gamesThisWeek: 3,
          gamesThisMonth: 15
        }
      },
      {
        username: 'newbie',
        displayName: 'Newbie Player',
        password: 'test123',
        isGuest: false,
        avatar: '🆕',
        stats: {
          totalGames: 10,
          wins: 4,
          losses: 6,
          cooperations: 7,
          betrayals: 3,
          totalScore: 350,
          winRate: 40,
          trustScore: 55,
          betrayalRate: 30,
          averageScore: 35,
          longestWinStreak: 2,
          currentWinStreak: 1,
          gamesThisWeek: 10,
          gamesThisMonth: 10
        }
      }
    ];

    for (const userData of testUsers) {
      try {
        // Check if user already exists
        const existingUser = await userRepo.findByUsername(userData.username);
        if (existingUser) {
          logger.info(`⏭️ User ${userData.username} already exists, skipping...`);
          continue;
        }

        // Hash password
        const passwordHash = await securityService.hashPassword(userData.password);

        // Create user data
        const userToCreate = {
          username: userData.username,
          displayName: userData.displayName,
          passwordHash: passwordHash,
          isGuest: userData.isGuest,
          avatar: userData.avatar,
          stats: userData.stats,
          preferences: {
            matchmakingRegion: 'global',
            trustScoreMatching: true,
            allowFriendRequests: true
          }
        };

        // Create user
        const createdUser = await userRepo.createUser(userToCreate);
        logger.info(`✅ Created development user: ${userData.username}`, { userId: createdUser.id });

      } catch (error) {
        logger.error(`❌ Error creating user ${userData.username}`, error);
      }
    }

    logger.info('🎉 Development database seeding completed!');
    logger.info('📋 Development test credentials:');
    logger.info('   Username: progamer123, Password: test123');
    logger.info('   Username: strategymaster, Password: test123');
    logger.info('   Username: cooperator, Password: test123');
    logger.info('   Username: betrayer, Password: test123');
    logger.info('   Username: newbie, Password: test123');
    logger.info('');
    logger.info('🔐 Development admin credentials:');
    logger.info('   Username: admin, Password: TenebrisAdmin2024!');
    logger.info('   Username: moderator, Password: ModPass123!');
    logger.info('');
    logger.info('⚠️ These credentials are for development only!');

  } catch (error) {
    console.error('❌ Error seeding development database:', error);
  }
}

async function clearDevelopmentData() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production') {
    console.log('⚠️ Cannot clear data in production environment');
    return;
  }

  try {
    const config = getValidatedConfig();
    const logger = getLogger(config.logging);
    const dbManager = getDatabaseManager();

    if (!dbManager || !dbManager.isInitialized()) {
      console.log('⚠️ Database manager not initialized, cannot clear data');
      return;
    }

    logger.info('🧹 Clearing development data...');

    const userRepo = dbManager.getUserRepository();
    const sessionRepo = dbManager.getSessionRepository();
    const gameRepo = dbManager.getGameRepository();

    // Clear test users
    const testUsernames = ['progamer123', 'strategymaster', 'cooperator', 'betrayer', 'newbie'];
    
    for (const username of testUsernames) {
      try {
        const user = await userRepo.findByUsername(username);
        if (user) {
          // Clear user's sessions first
          await sessionRepo.invalidateUserSessions(user.id);
          
          // Delete user
          await userRepo.delete(user.id);
          logger.info(`🗑️ Deleted development user: ${username}`);
        }
      } catch (error) {
        logger.error(`❌ Error deleting user ${username}`, error);
      }
    }

    // Clear expired sessions
    await sessionRepo.cleanupExpired();
    
    // Clear old games (older than 7 days in development)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const oldGames = await gameRepo.findBy({
      created_at: {
        operator: '<',
        value: sevenDaysAgo.toISOString()
      }
    });

    for (const game of oldGames) {
      await gameRepo.delete(game.id);
    }

    logger.info(`🧹 Development data cleanup completed! Removed ${oldGames.length} old games`);

  } catch (error) {
    console.error('❌ Error clearing development data:', error);
  }
}

module.exports = {
  seedDevelopmentData,
  clearDevelopmentData
};