const express = require('express');
const { getDatabaseManager } = require('../../database/DatabaseManagerWrapper');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { displayName, avatar, preferences } = req.body;

    const dbManager = getDatabaseManager();
    if (!dbManager) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Validate input
    if (displayName && (displayName.length < 2 || displayName.length > 50)) {
      return res.status(400).json({ error: 'Display name must be between 2 and 50 characters' });
    }

    // Update user profile
    const updateData = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (preferences !== undefined) updateData.preferences = JSON.stringify(preferences);

    // Add lastActive timestamp
    updateData.lastActive = new Date().toISOString();

    const userRepo = dbManager.getUserRepository();
    await userRepo.update(userId, updateData);

    // Get updated user data
    const updatedUser = await userRepo.findById(userId);

    if (!updatedUser) {
      return res.status(500).json({ error: 'Failed to fetch updated profile' });
    }

    // Remove sensitive data
    const { passwordHash, ...safeUser } = updatedUser;

    res.json({
      success: true,
      user: safeUser
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const dbManager = getDatabaseManager();
    if (!dbManager) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const userRepo = dbManager.getUserRepository();
    const user = await userRepo.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove sensitive data
    const { passwordHash, ...safeUser } = user;

    res.json({
      success: true,
      user: safeUser
    });

  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;