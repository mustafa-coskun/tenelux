// Simple Modular Server Test

const express = require('express');
const http = require('http');
const path = require('path');

// Import database system
const { initializeDatabaseManager, getDatabaseManager } = require('./src/database/DatabaseManagerWrapper');

// Import WebSocket server
const { initializeGameServer } = require('./src/server/websocket/gameServer');

console.log('Starting simple server...');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Global variables
let dbManager = null;

// Basic middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'build')));

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Ezoic ads.txt redirect
app.get('/ads.txt', (req, res) => {
  res.redirect(301, 'https://srv.adstxtmanager.com/6170144175424873/tenelux.site');
});

// Import and use auth routes
try {
  console.log('Loading auth routes...');
  const authRoutes = require('./src/server/routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('Auth routes loaded successfully');
} catch (error) {
  console.error('Failed to load auth routes:', error.message);
}

// Import and use friends routes
try {
  console.log('Loading friends routes...');
  const friendsRoutes = require('./src/server/routes/friends');
  app.use('/api/friends', friendsRoutes);
  console.log('Friends routes loaded successfully');
} catch (error) {
  console.error('Failed to load friends routes:', error.message);
}

// Import and use user routes
try {
  console.log('Loading user routes...');
  const userRoutes = require('./src/server/routes/user');
  app.use('/api/user', userRoutes);
  console.log('User routes loaded successfully');
} catch (error) {
  console.error('Failed to load user routes:', error.message);
}

// Import and use leaderboard routes
try {
  console.log('Loading leaderboard routes...');
  const leaderboardRoutes = require('./src/server/routes/leaderboard');
  app.use('/api/leaderboard', leaderboardRoutes);
  console.log('Leaderboard routes loaded successfully');
} catch (error) {
  console.error('Failed to load leaderboard routes:', error.message);
}

// Initialize and start server
async function initializeServer() {
  try {
    console.log('Initializing database...');
    await initializeDatabaseManager();
    dbManager = getDatabaseManager();

    if (!dbManager) {
      throw new Error('Database manager initialization failed');
    }

    console.log('Database initialized successfully');

    // Initialize WebSocket server
    console.log('Initializing WebSocket server...');
    initializeGameServer(server, dbManager);
    console.log('WebSocket server initialized');

    // Start daily cleanup job for guest users
    startGuestCleanupJob(dbManager);

    // Start server
    server.listen(PORT, () => {
      console.log(`Simple server running on port ${PORT}`);
      console.log(`WebSocket server available at ws://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

// Guest user cleanup job
function startGuestCleanupJob(dbManager) {
  const cleanupGuestUsers = async () => {
    try {
      console.log('🧹 Starting guest user cleanup...');

      const userRepo = dbManager.getUserRepository();
      const sessionRepo = dbManager.getSessionRepository();

      // Find guest users older than 1 day
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // TODO: Implement guest user cleanup when database methods are ready
      console.log('🧹 Guest cleanup scheduled but not implemented yet');

    } catch (error) {
      console.error('🧹 Guest cleanup failed:', error);
    }
  };

  // Run cleanup immediately
  cleanupGuestUsers();

  // Run cleanup every 6 hours
  setInterval(cleanupGuestUsers, 6 * 60 * 60 * 1000);

  console.log('🧹 Guest cleanup job started (runs every 6 hours)');
}

console.log('Server setup complete');
initializeServer();