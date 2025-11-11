# Migration Guide: Old Database System to New Security-Enhanced System

## Overview

This guide provides step-by-step instructions for migrating from the old database system to the new security-enhanced database architecture.

## Pre-Migration Checklist

- [ ] Backup existing database
- [ ] Review current data structure
- [ ] Test migration in development environment
- [ ] Prepare rollback plan
- [ ] Schedule maintenance window

## Step 1: Backup Current System

### Database Backup

```bash
# Backup SQLite database
cp ./data/tenebris.db ./data/tenebris.db.backup.$(date +%Y%m%d_%H%M%S)

# Verify backup
ls -la ./data/tenebris.db.backup.*
```

### Code Backup

```bash
# Create branch for old system
git checkout -b pre-security-refactor
git add .
git commit -m "Backup before security refactor migration"
git checkout main
```

## Step 2: Environment Configuration

### Update Environment Variables

Create or update `.env` file:

```bash
# Database Configuration
NODE_ENV=development
DB_TYPE=sqlite
DB_PATH=./data/tenebris.db
DB_POOL_SIZE=10
DB_TIMEOUT=30000

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/app.log
LOG_MAX_SIZE=10485760
LOG_MAX_FILES=5

# Admin Credentials (Change in production!)
ADMIN_PASSWORD=TenebrisAdmin2024!
MODERATOR_PASSWORD=ModPass123!
```

### Production Environment

```bash
# Production environment variables
export NODE_ENV=production
export DB_TYPE=sqlite  # or postgresql for production
export DB_PATH=/var/lib/tenebris/tenebris.db
export LOG_LEVEL=warn
export BCRYPT_ROUNDS=12

# Security settings
export ADMIN_PASSWORD=your-secure-admin-password
export MODERATOR_PASSWORD=your-secure-moderator-password
```

## Step 3: Code Migration

### Update Imports

Replace old database service imports:

```typescript
// OLD - Remove these imports
const { getDatabaseService } = require('./src/database/DatabaseService');
const { seedDatabase } = require('./src/database/seedData');

// NEW - Add these imports
const { initializeDatabaseManager, getDatabaseManager } = require('./src/database/DatabaseManager');
const { seedDevelopmentData } = require('./src/database/developmentSeed');
const { getSecurityService } = require('./src/services/SecurityService');
const { getLogger } = require('./src/services/LoggingService');
```

### Update Database Initialization

```typescript
// OLD
const db = getDatabaseService();

// NEW
let dbManager;
let securityService;
let logger;

async function initializeApp() {
  try {
    const config = getValidatedConfig();
    logger = getLogger(config.logging);
    securityService = getSecurityService(config.security);
    dbManager = await initializeDatabaseManager();
    
    // Run migrations
    const { migrations } = require('./src/database/migrations');
    await dbManager.migrate(migrations);
    
    logger.info('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}
```

### Update Database Operations

#### User Operations

```typescript
// OLD
const user = await db.getUserByUsername(username);
await db.createUser(userData);
await db.updateUser(userId, updates);

// NEW
const userRepo = dbManager.getUserRepository();
const user = await userRepo.findByUsername(username);
await userRepo.createUser(userData);
await userRepo.update(userId, updates);
```

#### Session Operations

```typescript
// OLD
const session = await db.getSessionByToken(token);
await db.createSession(sessionData);
await db.deleteSession(sessionId);

// NEW
const sessionRepo = dbManager.getSessionRepository();
const session = await sessionRepo.findByToken(token);
await sessionRepo.createSession(sessionData);
await sessionRepo.invalidateSession(sessionId);
```

#### Game Operations

```typescript
// OLD
const game = await db.getGameById(gameId);
await db.createGame(gameData);
await db.updateGame(gameId, updates);

// NEW
const gameRepo = dbManager.getGameRepository();
const game = await gameRepo.findById(gameId);
await gameRepo.createGame(gameData);
await gameRepo.update(gameId, updates);
```

### Update Authentication

```typescript
// OLD
const passwordHash = bcrypt.hashSync(password, 10);
const isValid = bcrypt.compareSync(password, hash);

// NEW
const passwordHash = await securityService.hashPassword(password);
const isValid = await securityService.verifyPassword(password, hash);
```

### Update Input Validation

```typescript
// OLD
function sanitizeInput(input) {
  return input.replace(/[<>]/g, '').trim();
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// NEW
const sanitized = securityService.sanitizeInput(input);
const isValid = securityService.validateEmail(email);
```

## Step 4: Database Schema Migration

### Run Migrations

```typescript
// Automatic migration during initialization
const { migrations } = require('./src/database/migrations');
await dbManager.migrate(migrations);
```

### Manual Migration (if needed)

```sql
-- Add new columns for enhanced security
ALTER TABLE users ADD COLUMN login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;
ALTER TABLE users ADD COLUMN last_active TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
```

## Step 5: Update API Endpoints

### Add Authentication Middleware

```typescript
// Add to server.js
async function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const sessionRepo = dbManager.getSessionRepository();
    const session = await sessionRepo.findByToken(token);
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userRepo = dbManager.getUserRepository();
    const user = await userRepo.findById(session.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    logger.error('Authentication middleware error', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
```

### Update Registration Endpoint

```typescript
// OLD
app.post('/api/register', async (req, res) => {
  // Basic validation and user creation
});

// NEW
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, displayName, email } = req.body;
    
    // Validate input
    if (!securityService.validateUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }
    
    const passwordValidation = securityService.validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.errors.join(', ') });
    }
    
    // Create user with new system
    const userRepo = dbManager.getUserRepository();
    const user = await userRepo.createUser({
      username: securityService.sanitizeInput(username).toLowerCase(),
      displayName: securityService.sanitizeInput(displayName),
      email: email ? securityService.sanitizeInput(email).toLowerCase() : undefined,
      passwordHash: await securityService.hashPassword(password),
      isGuest: false
    });
    
    // Create session
    const sessionRepo = dbManager.getSessionRepository();
    const session = await sessionRepo.createSession({
      userId: user.id,
      token: securityService.generateSecureToken(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.status(201).json({
      user: { ...user, passwordHash: undefined },
      token: session.token
    });
    
  } catch (error) {
    logger.error('Registration error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

## Step 6: Update Logging

### Replace Console Logging

```typescript
// OLD
console.log('User created:', user);
console.error('Database error:', error);

// NEW
logger.info('User created', { userId: user.id, username: user.username });
logger.error('Database error', error, { operation: 'createUser' });
```

### Structured Logging

```typescript
// Use structured logging with context
logger.audit('USER_LOGIN', userId, {
  username: user.username,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});

logger.security('FAILED_LOGIN_ATTEMPT', {
  username: attemptedUsername,
  ipAddress: req.ip,
  reason: 'invalid_password'
});
```

## Step 7: Update Development Seed Data

### Replace Old Seed Function

```typescript
// OLD
const { seedDatabase } = require('./src/database/seedData');
await seedDatabase();

// NEW
const { seedDevelopmentData } = require('./src/database/developmentSeed');
await seedDevelopmentData();
```

### Environment-Conditional Seeding

```typescript
// Only seed in development
if (config.isDevelopment) {
  setTimeout(() => {
    seedDevelopmentData().catch(logger.error);
  }, 2000);
}
```

## Step 8: Testing Migration

### Run Tests

```bash
# Run all tests to verify migration
npm test

# Run specific migration tests
npm test -- --testNamePattern="Database Security"
npm test -- --testNamePattern="Migration"
```

### Manual Testing

1. **User Registration**
   ```bash
   curl -X POST http://localhost:3000/api/register \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"testpass123","displayName":"Test User"}'
   ```

2. **User Login**
   ```bash
   curl -X POST http://localhost:3000/api/login \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"testpass123"}'
   ```

3. **Authenticated Request**
   ```bash
   curl -X GET http://localhost:3000/api/user/profile \
     -H "Authorization: Bearer YOUR_TOKEN_HERE"
   ```

## Step 9: Performance Verification

### Check Database Performance

```typescript
// Get performance metrics
const metrics = performanceCollector.getMetrics();
console.log('Database performance:', metrics.database);

// Run optimization
const optimizationResults = await dbManager.optimize();
console.log('Optimization results:', optimizationResults);
```

### Monitor Memory Usage

```typescript
// Check memory usage
const memoryUsage = process.memoryUsage();
console.log('Memory usage:', {
  rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
  heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
});
```

## Step 10: Cleanup Old Code

### Remove Deprecated Files

```bash
# Mark old files as deprecated (don't delete immediately)
mv src/database/DatabaseService.js src/database/DatabaseService.js.deprecated
mv src/database/seedData.js src/database/seedData.js.deprecated

# Update package.json to remove unused dependencies
npm uninstall old-unused-packages
```

### Update Documentation

```bash
# Update README.md with new setup instructions
# Update API documentation
# Update deployment guides
```

## Rollback Plan

If migration fails, follow these steps:

### 1. Restore Database

```bash
# Stop application
pm2 stop tenebris-game

# Restore database backup
cp ./data/tenebris.db.backup.YYYYMMDD_HHMMSS ./data/tenebris.db

# Restart with old code
git checkout pre-security-refactor
npm install
pm2 start tenebris-game
```

### 2. Verify Rollback

```bash
# Test basic functionality
curl http://localhost:3000/api/health

# Check logs
tail -f logs/app.log
```

## Post-Migration Tasks

### 1. Monitor System

- Check application logs for errors
- Monitor performance metrics
- Verify all features work correctly

### 2. Update Documentation

- Update API documentation
- Update deployment procedures
- Update troubleshooting guides

### 3. Security Audit

- Review security configurations
- Test authentication flows
- Verify input validation

### 4. Performance Baseline

- Establish new performance baselines
- Set up monitoring alerts
- Document performance improvements

## Troubleshooting

### Common Issues

1. **Migration Fails**
   - Check database permissions
   - Verify environment variables
   - Review migration logs

2. **Authentication Issues**
   - Verify password hashing configuration
   - Check session token generation
   - Review rate limiting settings

3. **Performance Degradation**
   - Run database optimization
   - Check query performance
   - Review connection pool settings

### Getting Help

1. Check application logs: `tail -f logs/app.log`
2. Run health check: `curl http://localhost:3000/api/health`
3. Review migration test results
4. Check database connectivity

## Success Criteria

Migration is successful when:

- [ ] All tests pass
- [ ] User registration/login works
- [ ] Game functionality is preserved
- [ ] Performance is maintained or improved
- [ ] Security features are active
- [ ] Logging is working correctly
- [ ] No data loss occurred

## Next Steps

After successful migration:

1. Monitor system for 24-48 hours
2. Gradually remove deprecated code
3. Update team documentation
4. Plan for future enhancements
5. Schedule regular security audits