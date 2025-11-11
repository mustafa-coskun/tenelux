// DEPRECATED: This file is deprecated. Use DatabaseManager.ts instead.
// This file is kept for backward compatibility only.
// TODO: Remove this file after migration is complete

console.warn('⚠️ WARNING: DatabaseService.js is deprecated!');
console.warn('⚠️ Please migrate to DatabaseManager.ts for enhanced security and performance');
console.warn('⚠️ This file will be removed in a future version');

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseService {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../../data/tenebris.db');
        this.isReady = false;
        this.readyPromise = null;
        this.init();
    }

    init() {
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Create ready promise
        this.readyPromise = new Promise((resolve, reject) => {
            // Open database
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Connected to SQLite database');
                    this.createTables();
                    this.isReady = true;
                    resolve();
                }
            });
        });
    }

    createTables() {
        const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        status TEXT DEFAULT 'active',
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
        user_id INTEGER PRIMARY KEY,
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
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        is_active BOOLEAN DEFAULT 1,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
        device_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `;

        const createGameHistoryTable = `
      CREATE TABLE IF NOT EXISTS game_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player1_id INTEGER NOT NULL,
        player2_id INTEGER NOT NULL,
        player1_score INTEGER DEFAULT 0,
        player2_score INTEGER DEFAULT 0,
        winner_id INTEGER,
        game_mode TEXT DEFAULT 'multiplayer',
        rounds_played INTEGER DEFAULT 0,
        game_duration INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player1_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (player2_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (winner_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `;

        // Execute table creation
        this.db.serialize(() => {
            this.db.run(createUsersTable, (err) => {
                if (err) console.error('❌ Error creating users table:', err);
                else {
                    console.log('✅ Users table ready');
                    // Add status column if it doesn't exist
                    this.db.run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`, (alterErr) => {
                        if (alterErr && !alterErr.message.includes('duplicate column')) {
                            console.error('❌ Error adding status column:', alterErr);
                        } else if (!alterErr) {
                            console.log('✅ Status column added to users table');
                        }
                    });
                }
            });

            this.db.run(createUserStatsTable, (err) => {
                if (err) console.error('❌ Error creating user_stats table:', err);
                else console.log('✅ User stats table ready');
            });

            this.db.run(createUserSessionsTable, (err) => {
                if (err) console.error('❌ Error creating user_sessions table:', err);
                else console.log('✅ User sessions table ready');
            });

            this.db.run(createGameHistoryTable, (err) => {
                if (err) console.error('❌ Error creating game_history table:', err);
                else {
                    console.log('✅ Game history table ready');
                    // Migrate old table structure to new structure
                    this.migrateGameHistoryTable();
                }
            });
        });
    }

    migrateGameHistoryTable() {
        // Check if new columns exist
        this.db.all("PRAGMA table_info(game_history)", (err, columns) => {
            if (err) {
                console.error('❌ Error checking game_history table structure:', err);
                return;
            }

            const columnNames = columns.map(col => col.name);
            const hasNewStructure = columnNames.includes('player1_id') &&
                columnNames.includes('player2_id') &&
                columnNames.includes('player1_score');

            if (!hasNewStructure) {
                console.log('🔄 Migrating game_history table to new structure...');

                // Backup old data if exists
                this.db.run(`CREATE TABLE IF NOT EXISTS game_history_backup AS SELECT * FROM game_history`, (backupErr) => {
                    if (backupErr) {
                        console.error('❌ Error backing up game_history:', backupErr);
                        return;
                    }

                    // Drop old table
                    this.db.run(`DROP TABLE game_history`, (dropErr) => {
                        if (dropErr) {
                            console.error('❌ Error dropping old game_history table:', dropErr);
                            return;
                        }

                        // Create new table with correct structure
                        const newGameHistoryTable = `
                          CREATE TABLE game_history (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            player1_id INTEGER NOT NULL,
                            player2_id INTEGER NOT NULL,
                            player1_score INTEGER DEFAULT 0,
                            player2_score INTEGER DEFAULT 0,
                            winner_id INTEGER,
                            game_mode TEXT DEFAULT 'multiplayer',
                            rounds_played INTEGER DEFAULT 0,
                            game_duration INTEGER DEFAULT 0,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (player1_id) REFERENCES users (id) ON DELETE CASCADE,
                            FOREIGN KEY (player2_id) REFERENCES users (id) ON DELETE CASCADE,
                            FOREIGN KEY (winner_id) REFERENCES users (id) ON DELETE SET NULL
                          )
                        `;

                        this.db.run(newGameHistoryTable, (createErr) => {
                            if (createErr) {
                                console.error('❌ Error creating new game_history table:', createErr);
                            } else {
                                console.log('✅ Game history table migrated successfully');
                            }
                        });
                    });
                });
            } else {
                console.log('✅ Game history table already has new structure');
            }
        });
    }

    // User operations
    async createUser(userData) {
        // Wait for database to be ready
        await this.readyPromise;

        return new Promise((resolve, reject) => {
            const self = this;
            const {
                id, username, displayName, passwordHash, isGuest, avatar,
                friends = [], friendRequests = { sent: [], received: [] },
                achievements = [], preferences = {}
            } = userData;

            const stmt = this.db.prepare(`
        INSERT INTO users (
          username, display_name, password_hash, is_guest, avatar,
          friends, friend_requests_sent, friend_requests_received,
          achievements, preferences
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

            stmt.run([
                username, displayName, passwordHash, isGuest ? 1 : 0, avatar,
                JSON.stringify(friends),
                JSON.stringify(friendRequests.sent),
                JSON.stringify(friendRequests.received),
                JSON.stringify(achievements),
                JSON.stringify(preferences)
            ], function (err) {
                if (err) {
                    reject(err);
                } else {
                    // Get the auto-generated ID
                    const userId = this.lastID;
                    console.log('Generated user ID:', userId);

                    // Create default stats - use database instance directly
                    const statsStmt = self.db.prepare(`
            INSERT INTO user_stats (user_id) VALUES (?)
          `);
                    statsStmt.run([userId], function (statsErr) {
                        if (statsErr) {
                            console.warn('Warning: Could not create user stats:', statsErr);
                        }

                        // Return full user object
                        resolve({
                            id: userId,
                            username: username,
                            displayName: displayName,
                            passwordHash: passwordHash,
                            isGuest: isGuest,
                            avatar: avatar || '🎮',
                            friends: friends,
                            friendRequests: friendRequests,
                            achievements: achievements,
                            preferences: preferences,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    });
                }
            });
        });
    }

    async getUserByUsername(username) {
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
                    resolve(this.formatUserRow(row));
                } else {
                    resolve(null);
                }
            });
        });
    }

    async getUserById(userId) {
        return new Promise((resolve, reject) => {
            const query = `
        SELECT u.*, s.* FROM users u
        LEFT JOIN user_stats s ON u.id = s.user_id
        WHERE u.id = ?
      `;

            this.db.get(query, [userId], (err, row) => {
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

    async updateUser(userId, updates) {
        return new Promise((resolve, reject) => {
            const allowedFields = ['display_name', 'avatar', 'last_active', 'friends', 'achievements', 'preferences'];
            const setClause = [];
            const values = [];

            Object.keys(updates).forEach(key => {
                if (allowedFields.includes(key)) {
                    setClause.push(`${key} = ?`);
                    if (typeof updates[key] === 'object') {
                        values.push(JSON.stringify(updates[key]));
                    } else {
                        values.push(updates[key]);
                    }
                }
            });

            if (setClause.length === 0) {
                return resolve({ changes: 0 });
            }

            values.push(userId);
            const query = `UPDATE users SET ${setClause.join(', ')} WHERE id = ?`;

            this.db.run(query, values, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    async updateUserStats(userId, stats) {
        return new Promise((resolve, reject) => {
            const query = `
        INSERT OR REPLACE INTO user_stats (
          user_id, total_games, wins, losses, cooperations, betrayals,
          total_score, win_rate, trust_score, betrayal_rate, average_score,
          longest_win_streak, current_win_streak, games_this_week, games_this_month
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

            this.db.run(query, [
                userId, stats.totalGames, stats.wins, stats.losses,
                stats.cooperations, stats.betrayals, stats.totalScore,
                stats.winRate, stats.trustScore, stats.betrayalRate,
                stats.averageScore, stats.longestWinStreak, stats.currentWinStreak,
                stats.gamesThisWeek, stats.gamesThisMonth
            ], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Session operations
    async createSession(sessionData) {
        return new Promise((resolve, reject) => {
            console.log('DatabaseService.createSession called with:', sessionData);
            const stmt = this.db.prepare(`
        INSERT INTO user_sessions (user_id, token, expires_at, ip_address, user_agent, is_active, last_used)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

            const now = new Date().toISOString();
            stmt.run([
                sessionData.userId,
                sessionData.token,
                sessionData.expiresAt.toISOString(),
                sessionData.ipAddress,
                sessionData.userAgent,
                1, // is_active
                now // last_used
            ], function (err) {
                if (err) {
                    console.log('DatabaseService.createSession error:', err);
                    reject(err);
                } else {
                    const sessionId = this.lastID;
                    console.log('DatabaseService.createSession success, ID:', sessionId);
                    resolve({
                        id: sessionId,
                        userId: sessionData.userId,
                        token: sessionData.token,
                        expiresAt: sessionData.expiresAt,
                        ipAddress: sessionData.ipAddress,
                        userAgent: sessionData.userAgent,
                        isActive: true,
                        lastUsed: new Date(now),
                        createdAt: new Date(now),
                        updatedAt: new Date(now)
                    });
                }
            });
        });
    }

    async getSessionUser(sessionToken) {
        return new Promise((resolve, reject) => {
            const query = `
        SELECT u.*, s.* FROM user_sessions us
        JOIN users u ON us.user_id = u.id
        LEFT JOIN user_stats s ON u.id = s.user_id
        WHERE us.session_token = ? AND us.expires_at > datetime('now')
      `;

            this.db.get(query, [sessionToken], (err, row) => {
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

    async getSessionByToken(token) {
        return new Promise((resolve, reject) => {
            const query = `
        SELECT * FROM user_sessions 
        WHERE token = ? AND expires_at > datetime('now') AND is_active = 1
      `;

            this.db.get(query, [token], (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    // Convert row to Session object format
                    resolve({
                        id: row.id,
                        userId: row.user_id,
                        token: row.token,
                        expiresAt: new Date(row.expires_at),
                        ipAddress: row.ip_address,
                        userAgent: row.user_agent,
                        isActive: Boolean(row.is_active),
                        lastUsed: new Date(row.last_used),
                        createdAt: new Date(row.created_at),
                        updatedAt: new Date(row.updated_at),
                        deviceInfo: row.device_info ? JSON.parse(row.device_info) : undefined
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    async updateSession(sessionId, updates) {
        return new Promise((resolve, reject) => {
            const setClause = Object.keys(updates).map(key => {
                // Convert camelCase to snake_case
                const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
                return `${dbKey} = ?`;
            }).join(', ');

            const values = Object.values(updates).map(value => {
                if (value instanceof Date) {
                    return value.toISOString();
                }
                return value;
            });

            const query = `UPDATE user_sessions SET ${setClause} WHERE id = ?`;
            values.push(sessionId);

            this.db.run(query, values, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    async deleteSession(sessionToken) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM user_sessions WHERE token = ?', [sessionToken], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    async cleanupExpiredSessions() {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM user_sessions WHERE expires_at <= datetime("now")', function (err) {
                if (err) {
                    reject(err);
                } else {
                    if (this.changes > 0) {
                        console.log(`🧹 Cleaned up ${this.changes} expired sessions`);
                    }
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Game history
    async addGameHistory(gameData) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
        INSERT INTO game_history (
          id, user_id, game_type, opponent_id, result, score,
          cooperated, betrayed, duration
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

            stmt.run([
                gameData.id, gameData.userId, gameData.gameType,
                gameData.opponentId, gameData.result, gameData.score,
                gameData.cooperated ? 1 : 0, gameData.betrayed ? 1 : 0,
                gameData.duration
            ], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: gameData.id, changes: this.changes });
                }
            });
        });
    }

    async createGameHistory(gameData) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
        INSERT INTO game_history (
          player1_id, player2_id, player1_score, player2_score, winner_id,
          game_mode, rounds_played, game_duration, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

            const now = new Date().toISOString();
            stmt.run([
                gameData.player1_id,
                gameData.player2_id,
                gameData.player1_score,
                gameData.player2_score,
                gameData.winner_id,
                gameData.game_mode,
                gameData.rounds_played,
                gameData.game_duration,
                gameData.created_at || now
            ], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        changes: this.changes,
                        ...gameData,
                        created_at: gameData.created_at || now
                    });
                }
            });
        });
    }

    async getUserStats(userId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM user_stats WHERE user_id = ?`;
            this.db.get(query, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    resolve({
                        userId: row.user_id,
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
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    async createUserStats(statsData) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
        INSERT INTO user_stats (
          user_id, total_games, wins, losses, cooperations, betrayals,
          total_score, win_rate, trust_score, betrayal_rate, average_score,
          longest_win_streak, current_win_streak, games_this_week, games_this_month
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

            stmt.run([
                statsData.userId,
                statsData.totalGames || 0,
                statsData.wins || 0,
                statsData.losses || 0,
                statsData.cooperations || 0,
                statsData.betrayals || 0,
                statsData.totalScore || 0,
                statsData.winRate || 0,
                statsData.trustScore || 50,
                statsData.betrayalRate || 0,
                statsData.averageScore || 0,
                statsData.longestWinStreak || 0,
                statsData.currentWinStreak || 0,
                statsData.gamesThisWeek || 0,
                statsData.gamesThisMonth || 0
            ], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        changes: this.changes,
                        ...statsData
                    });
                }
            });
        });
    }

    // Utility methods
    formatUserRow(row) {
        if (!row) return null;

        return {
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            passwordHash: row.password_hash,
            status: row.status || 'active',
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

let databaseInstance = null;

function getDatabaseService() {
    if (!databaseInstance) {
        databaseInstance = new DatabaseService();
    }
    return databaseInstance;
}

module.exports = { DatabaseService, getDatabaseService };