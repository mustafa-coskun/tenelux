# Database Security Refactor Guide

## Overview

This document provides a comprehensive guide for the new database security system implemented in the Tenebris Game project. The refactor introduces a robust, secure, and scalable database architecture with enhanced security features.

## Architecture Overview

### Core Components

1. **Database Manager** (`src/database/DatabaseManager.ts`)
   - Central database management system
   - Connection pooling and health monitoring
   - Transaction management
   - Performance optimization

2. **Repository Pattern** (`src/database/repositories/`)
   - `BaseRepository.ts` - Abstract base class
   - `UserRepository.ts` - User data operations
   - `SessionRepository.ts` - Session management
   - `GameRepository.ts` - Game data operations

3. **Database Adapters** (`src/database/adapters/`)
   - `IDatabaseAdapter.ts` - Interface definition
   - `SQLiteAdapter.ts` - SQLite implementation
   - `PostgreSQLAdapter.ts` - PostgreSQL implementation (future)
   - `MongoDBAdapter.ts` - MongoDB implementation (future)

4. **Security Services** (`src/services/`)
   - `SecurityService.ts` - Input validation and sanitization
   - `LoggingService.ts` - Secure logging
   - `AuthenticationService.ts` - User authentication

5. **Configuration Management** (`src/config/`)
   - Environment-based configuration
   - Validation and type safety
   - Database connection settings

## Security Features

### Input Validation and Sanitization

```typescript
// Example: User input validation
const securityService = getSecurityService();

// Validate username format
if (!securityService.validateUsername(username)) {
  throw new ValidationError('Invalid username format');
}

// Sanitize display name
const sanitizedDisplayName = securityService.sanitizeInput(displayName);
```

### SQL Injection Prevention

- All database queries use parameterized statements
- Input validation at multiple layers
- Type-safe query builders

```typescript
// Safe query example
const user = await userRepo.findByUsername(username); // Automatically parameterized
```

### Password Security

```typescript
// Secure password hashing
const passwordHash = await securityService.hashPassword(password);

// Password verification
const isValid = await securityService.verifyPassword(password, hash);
```

### Session Management

```typescript
// Secure session creation
const session = await sessionRepo.createSession({
  userId: user.id,
  token: securityService.generateSecureToken(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});
```

### Rate Limiting

```typescript
// Check rate limits
const allowed = await securityService.rateLimit(identifier);
if (!allowed) {
  return res.status(429).json({ error: 'Too many requests' });
}
```

## Configuration

### Environment Variables

```bash
# Database Configuration
DB_TYPE=sqlite
DB_PATH=./data/tenebris.db
DB_POOL_SIZE=10
DB_TIMEOUT=30000

# Security Configuration
BCRYPT_ROUNDS=12
JWT_SECRET=your-secret-key
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/app.log
LOG_MAX_SIZE=10485760
LOG_MAX_FILES=5
```

### Database Configuration

```typescript
// src/config/database.ts
export const databaseConfig: DatabaseConfig = {
  type: process.env.DB_TYPE as DatabaseType || 'sqlite',
  connection: {
    path: process.env.DB_PATH || './data/tenebris.db',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  pool: {
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    max: parseInt(process.env.DB_POOL_MAX || '10'),
    acquireTimeoutMillis: parseInt(process.env.DB_TIMEOUT || '30000')
  }
};
```

## Usage Examples

### Database Manager Initialization

```typescript
import { initializeDatabaseManager } from './src/database/DatabaseManager';

// Initialize database manager
const dbManager = await initializeDatabaseManager();

// Get repositories
const userRepo = dbManager.getUserRepository();
const sessionRepo = dbManager.getSessionRepository();
const gameRepo = dbManager.getGameRepository();
```

### User Operations

```typescript
// Create user
const user = await userRepo.createUser({
  username: 'player123',
  displayName: 'Player 123',
  email: 'player@example.com',
  passwordHash: await securityService.hashPassword('password'),
  isGuest: false
});

// Find user
const foundUser = await userRepo.findByUsername('player123');

// Update user
const updatedUser = await userRepo.update(user.id, {
  displayName: 'Updated Name'
});

// Update user statistics
await userRepo.updateStats(user.id, {
  totalGames: 10,
  wins: 7,
  losses: 3
});
```

### Session Operations

```typescript
// Create session
const session = await sessionRepo.createSession({
  userId: user.id,
  token: securityService.generateSecureToken(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  ipAddress: '127.0.0.1'
});

// Validate session
const validSession = await sessionRepo.findByToken(token);
if (validSession && validSession.expiresAt > new Date()) {
  // Session is valid
}

// Cleanup expired sessions
const cleanedCount = await sessionRepo.cleanupExpired();
```

### Game Operations

```typescript
// Create game
const game = await gameRepo.createGame({
  type: 'multiplayer',
  status: 'active',
  participants: JSON.stringify([
    { userId: user1.id, role: 'player' },
    { userId: user2.id, role: 'player' }
  ]),
  settings: JSON.stringify({
    maxRounds: 10,
    timePerRound: 30
  })
});

// Find games by lobby code
const games = await gameRepo.findGamesByLobbyCode('ABC123');

// Update game status
await gameRepo.update(game.id, {
  status: 'completed',
  completedAt: new Date()
});
```

## Performance Monitoring

### Database Performance

```typescript
// Get database statistics
const stats = await dbManager.getStatistics();
console.log('Database health:', stats.database);
console.log('Repository stats:', stats.repositories);

// Run database optimization
const optimizationResults = await dbManager.optimize();
console.log('Optimization completed:', optimizationResults);
```

### Performance Metrics

```typescript
import { performanceCollector } from './src/utils/performance';

// Get performance metrics
const metrics = performanceCollector.getMetrics();
console.log('Request metrics:', metrics.requests);
console.log('Database metrics:', metrics.database);
console.log('Memory usage:', metrics.memory);
```

## Maintenance Operations

### Database Cleanup

```typescript
// Clean up expired data
const cleanupResults = await dbManager.cleanup();
console.log('Cleanup results:', cleanupResults);

// Manual cleanup operations
const { cleanupExpiredData } = require('./src/database/cleanup');
await cleanupExpiredData();
```

### Database Optimization

```typescript
// Run vacuum and analyze
await dbManager.vacuum();
await dbManager.analyze();

// Full optimization
const results = await dbManager.optimize();
```

## Migration Guide

### From Old System to New System

1. **Backup existing data**
   ```bash
   cp ./data/tenebris.db ./data/tenebris.db.backup
   ```

2. **Update imports**
   ```typescript
   // Old
   const { getDatabaseService } = require('./src/database/DatabaseService');
   
   // New
   const { initializeDatabaseManager } = require('./src/database/DatabaseManager');
   ```

3. **Update database calls**
   ```typescript
   // Old
   const db = getDatabaseService();
   const user = await db.getUserByUsername(username);
   
   // New
   const dbManager = await initializeDatabaseManager();
   const userRepo = dbManager.getUserRepository();
   const user = await userRepo.findByUsername(username);
   ```

4. **Run migrations**
   ```typescript
   const { migrations } = require('./src/database/migrations');
   await dbManager.migrate(migrations);
   ```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testNamePattern="Database Security"
npm test -- --testNamePattern="Repository"
npm test -- --testNamePattern="Performance"
```

### Test Configuration

```typescript
// Test database configuration
export const testConfig = {
  database: {
    type: 'sqlite',
    connection: {
      path: ':memory:' // In-memory database for tests
    }
  },
  security: {
    bcryptRounds: 4, // Faster for tests
    rateLimitEnabled: false
  },
  logging: {
    level: 'error', // Reduce test noise
    console: false
  }
};
```

## Deployment

### Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] SSL/TLS certificates installed
- [ ] Firewall rules configured
- [ ] Monitoring and alerting set up
- [ ] Backup strategy implemented
- [ ] Performance baselines established

### Environment Setup

```bash
# Production environment variables
export NODE_ENV=production
export DB_TYPE=postgresql
export DB_HOST=your-db-host
export DB_NAME=tenebris_prod
export DB_USER=tenebris_user
export DB_PASSWORD=secure-password
export LOG_LEVEL=warn
export BCRYPT_ROUNDS=12
```

### Health Monitoring

```typescript
// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = await dbManager.healthCheck();
  const metrics = performanceCollector.getMetrics();
  
  res.json({
    status: health.isConnected ? 'healthy' : 'unhealthy',
    database: health,
    performance: metrics,
    timestamp: new Date().toISOString()
  });
});
```

## Troubleshooting

### Common Issues

1. **Connection Pool Exhaustion**
   - Increase `DB_POOL_MAX` environment variable
   - Check for connection leaks in application code
   - Monitor connection usage patterns

2. **Slow Query Performance**
   - Enable query logging with `LOG_LEVEL=debug`
   - Run database optimization: `await dbManager.optimize()`
   - Check database indexes

3. **Memory Leaks**
   - Monitor memory usage with performance metrics
   - Check for unclosed database connections
   - Review caching strategies

4. **Authentication Issues**
   - Verify password hashing configuration
   - Check session expiration settings
   - Review rate limiting configuration

### Debugging

```typescript
// Enable debug logging
process.env.LOG_LEVEL = 'debug';

// Monitor performance
const timer = new PerformanceTimer('operation_name');
// ... perform operation
const duration = timer.end();

// Check database health
const health = await dbManager.healthCheck();
console.log('Database status:', health);
```

## Security Best Practices

1. **Input Validation**
   - Always validate and sanitize user input
   - Use type-safe interfaces
   - Implement rate limiting

2. **Password Security**
   - Use strong hashing algorithms (bcrypt)
   - Implement proper salt rounds
   - Never log passwords or hashes

3. **Session Management**
   - Use secure, random session tokens
   - Implement proper expiration
   - Clean up expired sessions regularly

4. **Database Security**
   - Use parameterized queries
   - Implement proper access controls
   - Regular security audits

5. **Logging Security**
   - Never log sensitive information
   - Use structured logging
   - Implement log rotation

## Support and Maintenance

For questions or issues related to the database security system:

1. Check this documentation first
2. Review test files for usage examples
3. Check application logs for error details
4. Run health checks to verify system status

Regular maintenance tasks:
- Weekly: Review performance metrics
- Monthly: Run database optimization
- Quarterly: Security audit and dependency updates