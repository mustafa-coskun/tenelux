const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class OptimizedDatabaseService {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '../../data/tenebris.db');
    this.cache = new Map(); // In-memory cache for frequent queries
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.init();
  }

  init() {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Open database with performance optimizations
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('❌ Database connection failed:', err.message);
      } else {
        console.log('✅ Connected to SQLite database');
        this.optimizeDatabase();
        this.createTables();
      }
    });
  }

  optimizeDatabase() {
    // Performance optimizations
    this.db.serialize(() => {
      // WAL mode for better concurrent access
      this.db.run("PRAGMA journal_mode = WAL;");
      
      // Increase cache size (default is 2MB, set to 64MB)
      this.db.run("PRAGMA cache_size = -64000;");
      
      // Faster synchronization
      this.db.run("PRAGMA synchronous = NORMAL;");
      
      // Memory-mapped I/O
      this.db.run("PRAGMA mmap_size = 268435456;"); // 256MB
      
      // Optimize for speed over safety (for development)
      this.db.run("PRAGMA temp_store = MEMORY;");
      
      console.log('⚡ Database optimizations applied');
    });
  }

  createTables() {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_guest BOOLEAN DEFAULT 0,
        avatar TEXT DEFAULT '🎮',
        friends TEXT DEFAULT '[]',
        friend_requests_sent TEXT DEFAULT '[]',
        friend_requests_received TEXT DEFAULT '[]',
        achievements TEXT DEFAULT '[]',
        preferences TEXT DEFAULT '{"matchmakingRegion":"global","trustScoreMatching":true,"allowFriendRequests":true}'
      )
    `;

    const createUserStatsTable = `
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id TEXT PRIMARY KEY,
        total_games INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        cooperations INTEGER DEFAULT 0,
        betrayals INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        win_rate REAL DEFAULT 0,
        trust_score INTEGER DEFAULT 50,
        betrayal_rate REAL DEFAULT 0,
        average_score REAL DEFAULT 0,
        longest_win_streak INTEGER DEFAULT 0,
        current_win_streak INTEGER DEFAULT 0,
        games_this_week INTEGER DEFAULT 0,
        games_this_month INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `;

    const createUserSessionsTable = `
      CREATE TABLE IF NOT EXISTS user_sessions (
        session_token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `;

    const createIndexes = [
      "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);",
      "CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);",
      "CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);",
      "CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);"
    ];

    // Execute table creation
    this.db.serialize(() => {
      this.db.run(createUsersTable);
      this.db.run(createUserStatsTable);
      this.db.run(createUserSessionsTable);
      
      // Create indexes for better performance
      createIndexes.forEach(indexSQL => {
        this.db.run(indexSQL);
      });
      
      console.log('✅ Database tables and indexes ready');
    });
  }

  // Cached user lookup
  async getUserByUsername(username) {
    const cacheKey = `user:${username.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.*, s.* FROM users u
        LEFT JOIN user_stats s ON u.id = s.user_id
        WHERE u.username = ? COLLATE NOCASE
      `;
      
      this.db.get(query, [username], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          const user = this.formatUserRow(row);
          // Cache the result
          this.cache.set(cacheKey, {
            data: user,
            timestamp: Date.now()
          });
          resolve(user);
        } else {
          resolve(null);
        }
      });
    });
  }

  // Batch operations for better performance
  async createUserBatch(userData) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run("BEGIN TRANSACTION");
        
        const userStmt = this.db.prepare(`
          INSERT INTO users (
            id, username, display_name, password_hash, is_guest, avatar,
            friends, friend_requests_sent, friend_requests_received,
            achievements, preferences
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const statsStmt = this.db.prepare(`
          INSERT INTO user_stats (user_id) VALUES (?)
        `);

        userStmt.run([
          userData.id, userData.username, userData.displayName, 
          userData.passwordHash, userData.isGuest ? 1 : 0, userData.avatar,
          JSON.stringify(userData.friends || []),
          JSON.stringify(userData.friendRequests?.sent || []),
          JSON.stringify(userData.friendRequests?.received || []),
          JSON.stringify(userData.achievements || []),
          JSON.stringify(userData.preferences || {})
        ], function(userErr) {
          if (userErr) {
            this.db.run("ROLLBACK");
            reject(userErr);
            return;
          }

          statsStmt.run([userData.id], function(statsErr) {
            if (statsErr) {
              console.warn('Warning: Could not create user stats:', statsErr);
            }
            
            this.db.run("COMMIT", (commitErr) => {
              if (commitErr) {
                reject(commitErr);
              } else {
                resolve({ id: userData.id, changes: this.changes });
              }
            });
          });
        });
      });
    });
  }

  // Connection pooling simulation (SQLite doesn't have real pooling)
  async executeQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Prepared statements cache
  preparedStatements = new Map();

  getPreparedStatement(sql) {
    if (!this.preparedStatements.has(sql)) {
      this.preparedStatements.set(sql, this.db.prepare(sql));
    }
    return this.preparedStatements.get(sql);
  }

  // Cleanup cache periodically
  startCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.cacheTimeout) {
          this.cache.delete(key);
        }
      }
    }, this.cacheTimeout);
  }

  // All other methods from original DatabaseService...
  formatUserRow(row) {
    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      createdAt: new Date(row.created_at),
      lastActive: new Date(row.last_active),
      isGuest: Boolean(row.is_guest),
      avatar: row.avatar,
      stats: {
        totalGames: row.total_games || 0,
        wins: row.wins || 0,
        losses: row.losses || 0,
        cooperations: row.cooperations || 0,
        betrayals: row.betrayals || 0,
        totalScore: row.total_score || 0,
        winRate: row.win_rate || 0,
        trustScore: row.trust_score || 50,
        betrayalRate: row.betrayal_rate || 0,
        averageScore: row.average_score || 0,
        longestWinStreak: row.longest_win_streak || 0,
        currentWinStreak: row.current_win_streak || 0,
        gamesThisWeek: row.games_this_week || 0,
        gamesThisMonth: row.games_this_month || 0
      },
      friends: JSON.parse(row.friends || '[]'),
      friendRequests: {
        sent: JSON.parse(row.friend_requests_sent || '[]'),
        received: JSON.parse(row.friend_requests_received || '[]')
      },
      achievements: JSON.parse(row.achievements || '[]'),
      preferences: JSON.parse(row.preferences || '{"matchmakingRegion":"global","trustScoreMatching":true,"allowFriendRequests":true}')
    };
  }

  close() {
    // Close prepared statements
    for (const stmt of this.preparedStatements.values()) {
      stmt.finalize();
    }
    
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err);
        } else {
          console.log('✅ Database connection closed');
        }
      });
    }
  }
}

module.exports = { OptimizedDatabaseService };