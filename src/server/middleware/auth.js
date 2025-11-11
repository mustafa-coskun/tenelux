const { getDatabaseManager } = require('../../database/DatabaseManagerWrapper');

// JWT token verification middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Get database manager
    const dbManager = getDatabaseManager();
    if (!dbManager) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Find session by token
    const sessionRepo = dbManager.getSessionRepository();
    const session = await sessionRepo.findByToken(token);

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if session is expired
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    
    if (now > expiresAt) {
      // Clean up expired session
      await sessionRepo.invalidateSession(session.id);
      return res.status(401).json({ error: 'Token expired' });
    }

    // Get user data
    const userRepo = dbManager.getUserRepository();
    const user = await userRepo.findById(session.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({ error: 'Account is not active' });
    }

    // Update session last used
    await sessionRepo.updateLastUsed(session.id);

    // Add user info to request
    req.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isGuest: user.isGuest,
      status: user.status
    };

    req.session = session;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      req.session = null;
      return next();
    }

    // Try to authenticate, but don't fail if it doesn't work
    const dbManager = getDatabaseManager();
    if (!dbManager) {
      req.user = null;
      req.session = null;
      return next();
    }

    const sessionRepo = dbManager.getSessionRepository();
    const session = await sessionRepo.findByToken(token);

    if (!session) {
      req.user = null;
      req.session = null;
      return next();
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    
    if (now > expiresAt) {
      req.user = null;
      req.session = null;
      return next();
    }

    const userRepo = dbManager.getUserRepository();
    const user = await userRepo.findById(session.userId);

    if (!user || user.status !== 'active') {
      req.user = null;
      req.session = null;
      return next();
    }

    // Update session
    await sessionRepo.updateLastUsed(session.id);

    req.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isGuest: user.isGuest,
      status: user.status
    };

    req.session = session;

    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    req.user = null;
    req.session = null;
    next();
  }
};

// Admin only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check if user has admin privileges
  // This would need to be implemented based on your user system
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

// Guest access middleware (allows both authenticated and guest users)
const allowGuests = (req, res, next) => {
  // This middleware allows access for both authenticated users and guests
  // You can add specific logic here if needed
  next();
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  allowGuests
};