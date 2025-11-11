// Friends API routes

const express = require('express');
const { getDatabaseManager } = require('../../database/DatabaseManagerWrapper');

const router = express.Router();

// Middleware to verify session token
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    const dbManager = getDatabaseManager();
    const sessionRepo = dbManager.getSessionRepository();
    
    const session = await sessionRepo.findByToken(token);
    if (!session || !session.isActive) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    req.userId = session.userId;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Get user's friends list
router.get('/', authenticateUser, async (req, res) => {
  try {
    // TODO: Implement friends table and logic
    // For now return empty array
    res.json({ friends: [] });
  } catch (error) {
    console.error('Error getting friends:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// Get friend requests
router.get('/requests', authenticateUser, async (req, res) => {
  try {
    // TODO: Implement friend requests table and logic
    // For now return empty arrays
    res.json({ 
      requests: {
        sent: [],
        received: []
      }
    });
  } catch (error) {
    console.error('Error getting friend requests:', error);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

// Search users
router.get('/search', authenticateUser, async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({ users: [] });
    }

    const dbManager = getDatabaseManager();
    const userRepo = dbManager.getUserRepository();
    
    // Search users by username (excluding current user)
    // TODO: Implement proper search with friend status
    // For now return empty array
    res.json({ users: [] });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Send friend request
router.post('/request', authenticateUser, async (req, res) => {
  try {
    const { userId: targetUserId } = req.body;
    
    if (!targetUserId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // TODO: Implement friend request logic
    res.json({ success: true, message: 'Friend request sent' });
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept friend request
router.post('/accept', authenticateUser, async (req, res) => {
  try {
    const { userId: requesterId } = req.body;
    
    if (!requesterId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // TODO: Implement accept friend request logic
    res.json({ success: true, message: 'Friend request accepted' });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Decline friend request
router.post('/decline', authenticateUser, async (req, res) => {
  try {
    const { userId: requesterId } = req.body;
    
    if (!requesterId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // TODO: Implement decline friend request logic
    res.json({ success: true, message: 'Friend request declined' });
  } catch (error) {
    console.error('Error declining friend request:', error);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// Remove friend
router.delete('/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId: friendId } = req.params;
    
    if (!friendId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // TODO: Implement remove friend logic
    res.json({ success: true, message: 'Friend removed' });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

module.exports = router;