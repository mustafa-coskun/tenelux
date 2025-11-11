const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

/**
 * Hybrid Database Service
 * - Hot data (active sessions, online users) in memory
 * - Cold data (user profiles, stats) in SQLite
 * - Periodic sync between memory and disk
 */
class HybridDatabaseService {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../../data/tenebris.db');

        // In-memory stores for hot data
        this.activeSessions = new Map(); // session_token -> user_data
        this.onlineUsers = new Map(); // user_id -> user_data
        this.recentStats = new Map(); // user_id -> recent_stats

        // Sync intervals
        this.syncInterval = 30 * 1000; // 30 seconds
        this.cleanupInterval = 5 * 60 * 1000; // 5 minutes

        this.init();
    }

    init() {
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Open SQLite database
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('❌ Database connection failed:', err.message);
            } else {
                console.log('✅ Connected to hybrid database system');
                this.optimizeDatabase();
                this.createTables();
                this.startSyncProcess();
            }
        });
    }

    optimizeDatabase() {
        this.db.serialize(() => {
            this.db.run("PRAGMA journal_mode = WAL;");
            this.db.run("PRAGMA cache_size = -32000;"); // 32MB cache
            this.db.run("PRAGMA synchronous = NORMAL;");
            this.db.run("PRAGMA temp_store = MEMORY;");
            console.log('⚡ Hybrid database optimizations applied');
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
        achievements TEXT DEFAULT '[]',
        preferences TEXT DEFAULT '{}'
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
        last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `;

        this.db.serialize(() => {
            this.db.run(createUsersTable);
            this.db.run(createUserStatsTable);

            // Create indexes
            this.db.run("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);");
            this.db.run("CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);");

            console.log('✅ Hybrid database tables ready');
        });
    }

    // Fast session operations (memory-only)
    async createSession(sessionToken, userId) {
        try {
            // Get user from memory or database
            let user = this.onlineUsers.get(userId);
            if (!user) {
                user = await this.getUserFromDatabase(userId);
                if (user) {
                    this.onlineUsers.set(userId, user);
                }
            }

            if (user) {
                this.activeSessions.set(sessionToken, {
                    userId: userId,
                    user: user,
                    createdAt: new Date(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                });

                console.log(`🔑 Session created in memory: ${sessionToken.substring(0, 8)}...`);
                return sessionToken;
            }

            throw new Error('User not found');
        } catch (error) {
            console.error('❌ Error creating session:', error);
            throw error;
        }
    }

    // Ultra-fast session validation (memory-only)
    async getSessionUser(sessionToken) {
        const session = this.activeSessions.get(sessionToken);

        if (!session) {
            return null;
        }

        // Check expiration
        if (Date.now() > session.expiresAt.getTime()) {
            this.activeSessions.delete(sessionToken);
            return null;
        }

        // Update last active in memory
        session.user.lastActive = new Date();
        this.onlineUsers.set(session.userId, session.user);

        return session.user;
    }

    // Fast user creation (memory + async database write)
    async createUser(userData) {
        const user = {
            id: userData.id,
            username: userData.username,
            displayName: userData.displayName,
            passwordHash: userData.passwordHash,
            createdAt: new Date(),
            lastActive: new Date(),
            isGuest: userData.isGuest,
            avatar: userData.avatar,
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
            friends: userData.friends || [],
            achievements: userData.achievements || [],
            preferences: userData.preferences || {}
        };

        // Store in memory immediately
        this.onlineUsers.set(user.id, user);

        // Async write to database (don't wait)
        this.writeUserToDatabase(user).catch(err => {
            console.error('❌ Error writing user to database:', err);
        });

        console.log(`👤 User created in memory: ${user.username}`);
        return user;
    }

    // Fast user lookup (memory first, then database)
    async getUserByUsername(username) {
        // Check online users first
        for (const user of this.onlineUsers.values()) {
            if (user.username.toLowerCase() === username.toLowerCase()) {
                return user;
            }
        }

        // Fallback to database
        const user = await this.getUserFromDatabase(null, username);
        if (user) {
            this.onlineUsers.set(user.id, user);
        }

        return user;
    }

    // Database operations (slower, for persistence)
    async getUserFromDatabase(userId = null, username = null) {
        return new Promise((resolve, reject) => {
            let query, params;

            if (userId) {
                query = `
          SELECT u.*, s.* FROM users u
          LEFT JOIN user_stats s ON u.id = s.user_id
          WHERE u.id = ?
        `;
                params = [userId];
            } else if (username) {
                query = `
          SELECT u.*, s.* FROM users u
          LEFT JOIN user_stats s ON u.id = s.user_id
          WHERE u.username = ? COLLATE NOCASE
        `;
                params = [username];
            } else {
                return resolve(null);
            }

            this.db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    resolve(this.formatUserRow(row));
                } else {
                    resolve(null);
                }
            });
        });
    }

    async writeUserToDatabase(user) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run("BEGIN TRANSACTION");

                const userStmt = this.db.prepare(`
          INSERT OR REPLACE INTO users (
            id, username, display_name, password_hash, last_active,
            is_guest, avatar, friends, achievements, preferences
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

                const statsStmt = this.db.prepare(`
          INSERT OR REPLACE INTO user_stats (
            user_id, total_games, wins, losses, cooperations, betrayals,
            total_score, win_rate, trust_score, betrayal_rate, average_score,
            longest_win_streak, current_win_streak, games_this_week, games_this_month,
            last_synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

                userStmt.run([
                    user.id, user.username, user.displayName, user.passwordHash,
                    user.lastActive.toISOString(), user.isGuest ? 1 : 0, user.avatar,
                    JSON.stringify(user.friends), JSON.stringify(user.achievements),
                    JSON.stringify(user.preferences)
                ], function (userErr) {
                    if (userErr) {
                        this.db.run("ROLLBACK");
                        reject(userErr);
                        return;
                    }

                    const stats = user.stats;
                    statsStmt.run([
                        user.id, stats.totalGames, stats.wins, stats.losses,
                        stats.cooperations, stats.betrayals, stats.totalScore,
                        stats.winRate, stats.trustScore, stats.betrayalRate,
                        stats.averageScore, stats.longestWinStreak, stats.currentWinStreak,
                        stats.gamesThisWeek, stats.gamesThisMonth, new Date().toISOString()
                    ], function (statsErr) {
                        if (statsErr) {
                            console.warn('Warning: Could not sync user stats:', statsErr);
                        }

                        this.db.run("COMMIT", (commitErr) => {
                            if (commitErr) {
                                reject(commitErr);
                            } else {
                                resolve({ id: user.id });
                            }
                        });
                    });
                });
            });
        });
    }

    // Periodic sync process
    startSyncProcess() {
        // Sync memory to database
        setInterval(async () => {
            console.log('🔄 Syncing memory data to database...');

            const syncPromises = [];
            for (const user of this.onlineUsers.values()) {
                syncPromises.push(
                    this.writeUserToDatabase(user).catch(err => {
                        console.error(`❌ Failed to sync user ${user.id}:`, err);
                    })
                );
            }

            await Promise.all(syncPromises);
            console.log(`✅ Synced ${syncPromises.length} users to database`);
        }, this.syncInterval);

        // Cleanup inactive sessions and users
        setInterval(() => {
            const now = Date.now();
            let cleanedSessions = 0;
            let cleanedUsers = 0;

            // Clean expired sessions
            for (const [token, session] of this.activeSessions.entries()) {
                if (now > session.expiresAt.getTime()) {
                    this.activeSessions.delete(token);
                    cleanedSessions++;
                }
            }

            // Clean inactive users (not in active sessions)
            const activeUserIds = new Set();
            for (const session of this.activeSessions.values()) {
                activeUserIds.add(session.userId);
            }

            for (const [userId, user] of this.onlineUsers.entries()) {
                if (!activeUserIds.has(userId)) {
                    const inactiveTime = now - user.lastActive.getTime();
                    if (inactiveTime > 30 * 60 * 1000) { // 30 minutes
                        this.onlineUsers.delete(userId);
                        cleanedUsers++;
                    }
                }
            }

            if (cleanedSessions > 0 || cleanedUsers > 0) {
                console.log(`🧹 Cleaned ${cleanedSessions} sessions, ${cleanedUsers} inactive users`);
            }
        }, this.cleanupInterval);
    }

    // Performance stats
    getPerformanceStats() {
        return {
            activeSessions: this.activeSessions.size,
            onlineUsers: this.onlineUsers.size,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };
    }

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
            achievements: JSON.parse(row.achievements || '[]'),
            preferences: JSON.parse(row.preferences || '{}')
        };
    }

    close() {
        if (this.db) {
            // Final sync before closing
            console.log('💾 Final sync before shutdown...');
            const syncPromises = [];
            for (const user of this.onlineUsers.values()) {
                syncPromises.push(this.writeUserToDatabase(user));
            }

            Promise.all(syncPromises).then(() => {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err);
                    } else {
                        console.log('✅ Hybrid database closed');
                    }
                });
            });
        }
    }
}

module.exports = { HybridDatabaseService };