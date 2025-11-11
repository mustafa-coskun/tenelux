// Database cleanup utilities
const { getDatabaseManager } = require('./DatabaseManager');
const { getLogger } = require('../services/LoggingService');
const { getValidatedConfig } = require('../config/validation');

/**
 * Clean up expired sessions and old data
 */
async function cleanupExpiredData() {
  try {
    const config = getValidatedConfig();
    const logger = getLogger(config.logging);
    const dbManager = getDatabaseManager();

    if (!dbManager || !dbManager.isInitialized()) {
      console.log('⚠️ Database manager not initialized, skipping cleanup');
      return { success: false, message: 'Database not initialized' };
    }

    logger.info('🧹 Starting database cleanup...');

    const sessionRepo = dbManager.getSessionRepository();
    const gameRepo = dbManager.getGameRepository();
    const userRepo = dbManager.getUserRepository();

    const results = {
      expiredSessions: 0,
      oldGames: 0,
      inactiveGuests: 0,
      totalCleaned: 0
    };

    // Clean up expired sessions
    const expiredSessions = await sessionRepo.cleanupExpired();
    results.expiredSessions = expiredSessions;
    logger.info(`🗑️ Cleaned up ${expiredSessions} expired sessions`);

    // Clean up old completed games (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldGames = await gameRepo.findBy({
      status: 'completed',
      completed_at: {
        operator: '<',
        value: thirtyDaysAgo.toISOString()
      }
    });

    for (const game of oldGames) {
      await gameRepo.delete(game.id);
    }
    results.oldGames = oldGames.length;
    logger.info(`🗑️ Cleaned up ${oldGames.length} old games`);

    // Clean up inactive guest users (older than 7 days, no recent activity)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const inactiveGuests = await userRepo.findBy({
      is_guest: 1,
      last_active: {
        operator: '<',
        value: sevenDaysAgo.toISOString()
      }
    });

    for (const guest of inactiveGuests) {
      // Clean up guest's sessions first
      await sessionRepo.invalidateUserSessions(guest.id);
      
      // Delete guest user
      await userRepo.delete(guest.id);
    }
    results.inactiveGuests = inactiveGuests.length;
    logger.info(`🗑️ Cleaned up ${inactiveGuests.length} inactive guest users`);

    results.totalCleaned = results.expiredSessions + results.oldGames + results.inactiveGuests;
    
    logger.info('✅ Database cleanup completed', results);
    return { success: true, results };

  } catch (error) {
    console.error('❌ Error during database cleanup:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up development test data
 */
async function cleanupDevelopmentData() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production') {
    console.log('⚠️ Cannot clean development data in production environment');
    return { success: false, message: 'Not allowed in production' };
  }

  try {
    const { clearDevelopmentData } = require('./developmentSeed');
    await clearDevelopmentData();
    return { success: true, message: 'Development data cleaned' };
  } catch (error) {
    console.error('❌ Error cleaning development data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Optimize database (vacuum, analyze, etc.)
 */
async function optimizeDatabase() {
  try {
    const config = getValidatedConfig();
    const logger = getLogger(config.logging);
    const dbManager = getDatabaseManager();

    if (!dbManager || !dbManager.isInitialized()) {
      console.log('⚠️ Database manager not initialized, skipping optimization');
      return { success: false, message: 'Database not initialized' };
    }

    logger.info('⚡ Starting database optimization...');

    // Get database statistics before optimization
    const statsBefore = await dbManager.getStatistics();
    
    // Run optimization
    const optimizationResults = await dbManager.optimize();
    
    // Get statistics after optimization
    const statsAfter = await dbManager.getStatistics();
    
    logger.info('✅ Database optimization completed', {
      before: statsBefore,
      after: statsAfter,
      results: optimizationResults
    });

    return { 
      success: true, 
      results: optimizationResults,
      statsBefore,
      statsAfter
    };

  } catch (error) {
    console.error('❌ Error during database optimization:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get database health and statistics
 */
async function getDatabaseHealth() {
  try {
    const dbManager = getDatabaseManager();

    if (!dbManager || !dbManager.isInitialized()) {
      return {
        status: 'unhealthy',
        message: 'Database not initialized',
        timestamp: new Date().toISOString()
      };
    }

    const health = await dbManager.healthCheck();
    const stats = await dbManager.getStatistics();

    return {
      status: health.isConnected ? 'healthy' : 'unhealthy',
      health,
      statistics: stats,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error getting database health:', error);
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Run full maintenance (cleanup + optimization)
 */
async function runFullMaintenance() {
  console.log('🔧 Starting full database maintenance...');
  
  const results = {
    cleanup: null,
    optimization: null,
    health: null,
    timestamp: new Date().toISOString()
  };

  // Run cleanup
  console.log('1/3 Running cleanup...');
  results.cleanup = await cleanupExpiredData();

  // Run optimization
  console.log('2/3 Running optimization...');
  results.optimization = await optimizeDatabase();

  // Check final health
  console.log('3/3 Checking health...');
  results.health = await getDatabaseHealth();

  console.log('✅ Full database maintenance completed');
  return results;
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'cleanup':
      cleanupExpiredData().then(result => {
        console.log('Cleanup result:', result);
        process.exit(result.success ? 0 : 1);
      });
      break;
      
    case 'cleanup-dev':
      cleanupDevelopmentData().then(result => {
        console.log('Development cleanup result:', result);
        process.exit(result.success ? 0 : 1);
      });
      break;
      
    case 'optimize':
      optimizeDatabase().then(result => {
        console.log('Optimization result:', result);
        process.exit(result.success ? 0 : 1);
      });
      break;
      
    case 'health':
      getDatabaseHealth().then(result => {
        console.log('Database health:', result);
        process.exit(result.status === 'healthy' ? 0 : 1);
      });
      break;
      
    case 'maintenance':
      runFullMaintenance().then(result => {
        console.log('Maintenance result:', result);
        const success = result.cleanup?.success && result.optimization?.success;
        process.exit(success ? 0 : 1);
      });
      break;
      
    default:
      console.log('Usage: node cleanup.js <command>');
      console.log('Commands:');
      console.log('  cleanup     - Clean up expired data');
      console.log('  cleanup-dev - Clean up development test data');
      console.log('  optimize    - Optimize database');
      console.log('  health      - Check database health');
      console.log('  maintenance - Run full maintenance');
      process.exit(1);
  }
}

module.exports = {
  cleanupExpiredData,
  cleanupDevelopmentData,
  optimizeDatabase,
  getDatabaseHealth,
  runFullMaintenance
};