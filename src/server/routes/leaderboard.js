const express = require('express');
const { getDatabaseManager } = require('../../database/DatabaseManagerWrapper');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get leaderboard
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { filter = 'global', limit = 50, orderBy = 'totalScore' } = req.query;
    
    const dbManager = getDatabaseManager();
    if (!dbManager) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const userRepo = dbManager.getUserRepository();
    
    // Validate parameters
    const validFilters = ['global', 'local', 'friends', 'weekly', 'monthly'];
    const validOrderBy = ['totalScore', 'winRate', 'trustScore', 'totalGames'];
    
    if (!validFilters.includes(filter)) {
      return res.status(400).json({ error: 'Invalid filter parameter' });
    }
    
    if (!validOrderBy.includes(orderBy)) {
      return res.status(400).json({ error: 'Invalid orderBy parameter' });
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 users

    let users = [];

    if (filter === 'global' || filter === 'local') {
      // Get global/local leaderboard (same for now)
      users = await getGlobalLeaderboard(userRepo, limitNum, orderBy);
    } else if (filter === 'friends' && req.user) {
      // Get friends leaderboard
      users = await getFriendsLeaderboard(userRepo, req.user.id, limitNum, orderBy);
    } else if (filter === 'weekly') {
      // Get weekly leaderboard
      users = await getWeeklyLeaderboard(userRepo, limitNum, orderBy);
    } else if (filter === 'monthly') {
      // Get monthly leaderboard
      users = await getMonthlyLeaderboard(userRepo, limitNum, orderBy);
    } else {
      users = await getGlobalLeaderboard(userRepo, limitNum, orderBy);
    }

    // Format users for leaderboard
    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      isOnline: isUserOnline(user.lastActive),
      stats: {
        totalScore: user.stats.totalScore || 0,
        totalGames: user.stats.totalGames || 0,
        wins: user.stats.wins || 0,
        winRate: user.stats.winRate || 0,
        trustScore: user.stats.trustScore || 50,
        level: user.stats.level || 1,
        experience: user.stats.experience || 0
      }
    }));

    res.json({
      success: true,
      leaderboard,
      filter,
      orderBy,
      total: leaderboard.length
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user rank
router.get('/rank/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { orderBy = 'totalScore' } = req.query;
    
    const dbManager = getDatabaseManager();
    if (!dbManager) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const userRepo = dbManager.getUserRepository();
    
    // Get user
    const user = await userRepo.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate rank (simplified - in production you'd want to optimize this)
    const allUsers = await getGlobalLeaderboard(userRepo, 1000, orderBy);
    const userRank = allUsers.findIndex(u => u.id === parseInt(userId)) + 1;

    res.json({
      success: true,
      rank: userRank || null,
      total: allUsers.length,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        stats: user.stats
      }
    });

  } catch (error) {
    console.error('Error fetching user rank:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
async function getGlobalLeaderboard(userRepo, limit, orderBy) {
  try {
    // Get all active users with stats
    const query = `
      SELECT u.*, s.* FROM users u
      LEFT JOIN user_stats s ON u.id = s.user_id
      WHERE u.status = 'active' AND u.is_guest = 0
      ORDER BY ${getOrderByField(orderBy)} DESC
      LIMIT ?
    `;

    // Since we're using the wrapper, we need to use raw query
    const dbManager = getDatabaseManager();
    const db = dbManager.db; // Access the underlying database service
    
    return new Promise((resolve, reject) => {
      db.db.all(query, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const users = rows.map(row => db.formatUserRow(row));
          resolve(users);
        }
      });
    });
  } catch (error) {
    console.error('Error in getGlobalLeaderboard:', error);
    return [];
  }
}

async function getFriendsLeaderboard(userRepo, userId, limit, orderBy) {
  try {
    // Get user's friends
    const user = await userRepo.findById(userId);
    if (!user || !user.friends || user.friends.length === 0) {
      return [];
    }

    // Get friends data
    const friendsData = [];
    for (const friendId of user.friends) {
      const friend = await userRepo.findById(friendId);
      if (friend && friend.status === 'active') {
        friendsData.push(friend);
      }
    }

    // Sort friends by the specified criteria
    friendsData.sort((a, b) => {
      const aValue = getStatValue(a.stats, orderBy);
      const bValue = getStatValue(b.stats, orderBy);
      return bValue - aValue;
    });

    return friendsData.slice(0, limit);
  } catch (error) {
    console.error('Error in getFriendsLeaderboard:', error);
    return [];
  }
}

function getOrderByField(orderBy) {
  switch (orderBy) {
    case 'totalScore': return 's.total_score';
    case 'winRate': return 's.win_rate';
    case 'trustScore': return 's.trust_score';
    case 'totalGames': return 's.total_games';
    default: return 's.total_score';
  }
}

function getStatValue(stats, orderBy) {
  if (!stats) return 0;
  
  switch (orderBy) {
    case 'totalScore': return stats.totalScore || 0;
    case 'winRate': return stats.winRate || 0;
    case 'trustScore': return stats.trustScore || 50;
    case 'totalGames': return stats.totalGames || 0;
    default: return stats.totalScore || 0;
  }
}

async function getWeeklyLeaderboard(userRepo, limit, orderBy) {
  try {
    // Get users who were active in the last 7 days
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const query = `
      SELECT u.*, s.* FROM users u
      LEFT JOIN user_stats s ON u.id = s.user_id
      WHERE u.status = 'active' 
        AND u.is_guest = 0 
        AND u.last_active > ?
      ORDER BY ${getOrderByField(orderBy)} DESC
      LIMIT ?
    `;

    const dbManager = getDatabaseManager();
    const db = dbManager.db;
    
    return new Promise((resolve, reject) => {
      db.db.all(query, [oneWeekAgo.toISOString(), limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const users = rows.map(row => db.formatUserRow(row));
          resolve(users);
        }
      });
    });
  } catch (error) {
    console.error('Error in getWeeklyLeaderboard:', error);
    return [];
  }
}

async function getMonthlyLeaderboard(userRepo, limit, orderBy) {
  try {
    // Get users who were active in the last 30 days
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const query = `
      SELECT u.*, s.* FROM users u
      LEFT JOIN user_stats s ON u.id = s.user_id
      WHERE u.status = 'active' 
        AND u.is_guest = 0 
        AND u.last_active > ?
      ORDER BY ${getOrderByField(orderBy)} DESC
      LIMIT ?
    `;

    const dbManager = getDatabaseManager();
    const db = dbManager.db;
    
    return new Promise((resolve, reject) => {
      db.db.all(query, [oneMonthAgo.toISOString(), limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const users = rows.map(row => db.formatUserRow(row));
          resolve(users);
        }
      });
    });
  } catch (error) {
    console.error('Error in getMonthlyLeaderboard:', error);
    return [];
  }
}

function isUserOnline(lastActive) {
  if (!lastActive) return false;
  
  const now = new Date();
  const lastActiveDate = new Date(lastActive);
  const diffMinutes = (now - lastActiveDate) / (1000 * 60);
  
  return diffMinutes < 15; // Consider online if active within 15 minutes
}

module.exports = router;