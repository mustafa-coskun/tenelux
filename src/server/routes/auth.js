// Authentication routes

const express = require('express');
const { getDatabaseManager } = require('../../database/DatabaseManagerWrapper');
const { generateSecureToken, validateUsername } = require('../utils/helpers');

const router = express.Router();

// Get services (these should be injected in a real app)
const getSecurityService = () => ({
  sanitizeInput: (input) => input ? input.replace(/[<>]/g, '').trim() : '',
  validateUsername: (username) => username && username.length >= 3 && username.length <= 20,
  validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  validatePassword: (password) => ({
    isValid: password && password.length >= 6,
    errors: password && password.length >= 6 ? [] : ['Password must be at least 6 characters']
  }),
  hashPassword: (password) => require('bcrypt').hashSync(password, 10),
  verifyPassword: (password, hash) => require('bcrypt').compareSync(password, hash),
  generateSecureToken: () => require('crypto').randomBytes(32).toString('hex'),
  rateLimit: () => Promise.resolve(true)
});

const getLogger = () => ({
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
  audit: (...args) => console.log('[AUDIT]', ...args)
});

// Registration endpoint
router.post('/register', async (req, res) => {
  try {
    const dbManager = getDatabaseManager();
    const securityService = getSecurityService();
    const logger = getLogger();

    if (!dbManager || !securityService || !logger) {
      return res.status(503).json({ error: 'Sunucu henüz hazır değil' });
    }

    const { username, displayName, password, avatar } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Input sanitization
    const sanitizedUsername = securityService.sanitizeInput(username || '');
    const sanitizedDisplayName = securityService.sanitizeInput(displayName || '');
    const sanitizedAvatar = securityService.sanitizeInput(avatar || '🎮');
    
    // Validation
    if (!sanitizedUsername || sanitizedUsername.length < 3) {
      return res.status(400).json({ error: 'Geçersiz kullanıcı adı' });
    }
    
    if (!sanitizedDisplayName) {
      return res.status(400).json({ error: 'Görünen ad gerekli' });
    }
    
    const passwordValidation = securityService.validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.errors[0] });
    }
    
    const userRepo = dbManager.getUserRepository();
    const sessionRepo = dbManager.getSessionRepository();
    
    // Check if user already exists
    const existingUser = await userRepo.findByUsername(sanitizedUsername);
    if (existingUser) {
      return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış' });
    }
    
    // Hash password
    const passwordHash = securityService.hashPassword(password);
    
    // Create user
    const user = await userRepo.createUser({
      username: sanitizedUsername,
      displayName: sanitizedDisplayName,
      passwordHash: passwordHash,
      avatar: sanitizedAvatar,
      isGuest: false
    });
    
    console.log('Created user:', user);
    console.log('User ID:', user.id);
    
    // Log registration
    logger.audit('USER_REGISTERED', user.id, {
      username: sanitizedUsername,
      displayName: sanitizedDisplayName,
      ipAddress: clientIp
    });
    
    // Return success message - user needs to login separately
    res.json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu. Lütfen giriş yapın.',
      username: sanitizedUsername
    });
    
  } catch (error) {
    const logger = getLogger();
    logger.error('Registration error', error, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const dbManager = getDatabaseManager();
    const securityService = getSecurityService();
    const logger = getLogger();

    if (!dbManager || !securityService || !logger) {
      return res.status(503).json({ error: 'Sunucu henüz hazır değil' });
    }

    const { username, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Input sanitization
    const sanitizedUsername = securityService.sanitizeInput(username || '');
    
    if (!sanitizedUsername || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    }
    
    const userRepo = dbManager.getUserRepository();
    const sessionRepo = dbManager.getSessionRepository();
    
    // Find user
    const user = await userRepo.findByUsername(sanitizedUsername);
    if (!user) {
      logger.audit('LOGIN_FAILED', null, {
        username: sanitizedUsername,
        reason: 'user_not_found',
        ipAddress: clientIp
      });
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
    }
    
    // Debug: Log user info
    logger.debug('User found for login', {
      userId: user.id,
      username: user.username,
      hasId: !!user.id,
      userKeys: Object.keys(user),
      userIdValue: JSON.stringify(user.id)
    });
    
    // Check if account is locked
    if (await userRepo.isAccountLocked(user.id)) {
      logger.audit('LOGIN_BLOCKED', user.id, {
        username: sanitizedUsername,
        reason: 'account_locked',
        ipAddress: clientIp
      });
      return res.status(423).json({ error: 'Hesap geçici olarak kilitlendi' });
    }
    
    // Verify password
    const isValidPassword = await securityService.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      await userRepo.incrementLoginAttempts(user.id);
      logger.audit('LOGIN_FAILED', user.id, {
        username: sanitizedUsername,
        reason: 'invalid_password',
        ipAddress: clientIp
      });
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
    }
    
    // Reset login attempts on successful login
    await userRepo.resetLoginAttempts(user.id);
    await userRepo.updateLastActive(user.id);
    
    // Create session
    const sessionToken = generateSecureToken();
    
    // Debug: Log session creation data
    logger.debug('Creating session for login', {
      userId: user.id,
      userIdType: typeof user.id,
      sessionToken: sessionToken.substring(0, 8) + '...'
    });
    
    const session = await sessionRepo.createSession({
      userId: user.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      ipAddress: clientIp,
      userAgent: req.headers['user-agent']
    });
    
    // Log successful login
    logger.audit('LOGIN_SUCCESS', user.id, {
      username: sanitizedUsername,
      ipAddress: clientIp
    });
    
    // Return user data without password
    const { passwordHash: _, ...userResponse } = user;
    res.json({
      success: true,
      user: userResponse,
      sessionToken: sessionToken
    });
    
  } catch (error) {
    const logger = getLogger();
    logger.error('Login error', error, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Guest login endpoint - No database storage for guests
router.post('/guest', async (req, res) => {
  try {
    const logger = getLogger();
    const { displayName } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Generate unique guest data (no database storage)
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const guestUsername = `misafir_${timestamp}_${randomSuffix}`;
    const guestDisplayName = displayName || `Misafir ${randomSuffix}`;
    
    // Create temporary guest user object (not saved to database)
    const guestUser = {
      id: `guest_${timestamp}_${randomSuffix}`,
      username: guestUsername,
      displayName: guestDisplayName,
      isGuest: true,
      avatar: '🎭',
      createdAt: new Date(),
      lastActive: new Date(),
      stats: {
        totalGames: 0,
        wins: 0,
        losses: 0,
        cooperations: 0,
        betrayals: 0,
        totalScore: 0,
        winRate: 0,
        trustScore: 50,
        betrayalRate: 0,
        averageScore: 0,
        longestWinStreak: 0,
        currentWinStreak: 0,
        gamesThisWeek: 0,
        gamesThisMonth: 0
      },
      friends: [],
      friendRequests: { sent: [], received: [] },
      achievements: [],
      preferences: {
        matchmakingRegion: 'global',
        trustScoreMatching: false,
        allowFriendRequests: false
      }
    };

    // Generate temporary session token (no database storage)
    const sessionToken = `guest_${generateSecureToken()}`;

    // Log guest login (but don't store user in database)
    logger.info('GUEST_LOGIN', {
      guestId: guestUser.id,
      displayName: guestDisplayName,
      ipAddress: clientIp,
      note: 'Guest user - not stored in database'
    });

    res.json({
      success: true,
      user: guestUser,
      sessionToken: sessionToken
    });

  } catch (error) {
    const logger = getLogger();
    logger.error('Guest login error', error, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const dbManager = getDatabaseManager();
    const logger = getLogger();

    if (!dbManager || !logger) {
      return res.status(503).json({ error: 'Sunucu henüz hazır değil' });
    }

    const { sessionToken } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (sessionToken) {
      const sessionRepo = dbManager.getSessionRepository();
      const session = await sessionRepo.findByToken(sessionToken);
      
      if (session) {
        // Deactivate session instead of deleting
        await sessionRepo.update(session.id, { 
          is_active: 0,
          updated_at: new Date().toISOString()
        });
        
        logger.audit('LOGOUT', session.userId, {
          ipAddress: clientIp
        });
      }
    }
    
    res.json({ success: true, message: 'Başarıyla çıkış yapıldı' });
    
  } catch (error) {
    const logger = getLogger();
    logger.error('Logout error', error, {
      ipAddress: req.ip,
      sessionToken: req.body.sessionToken ? 'provided' : 'missing'
    });
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Username validation endpoint
router.get('/validate-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const validation = await validateUsername(username);
    res.json(validation);
  } catch (error) {
    const logger = getLogger();
    logger.error('Username validation error', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;