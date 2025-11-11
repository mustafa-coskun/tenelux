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
        display_name TEXT,
        password_hash TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_guest INTEGER DEFAULT 0,
        avatar TEXT DEFAULT '🎮',
        friends TEXT DEFAULT '[]',
        friend_requests_sent TEXT DEFAULT '[]',
        friend_requests_received TEXT DEFAULT '[]',
        achievements TEXT DEFAULT '[]',
        preferences TEXT DEFAULT '{}'
      )
    `;

        const createUserStatsTable = `
      CREATE TABLE IF NOT EXISTS user_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        average_score REAL DEFAULT 0,
        best_score INTEGER DEFAULT 0,
        cooperation_rate REAL DEFAULT 0,
        betrayal_rate REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

        const createUserSessionsTable = `
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

        const createGameHistoryTable = `
      CREATE TABLE IF NOT EXISTS game_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player1_id INTEGER,
        player2_id INTEGER,
        player1_score INTEGER DEFAULT 0,
        player2_score INTEGER DEFAULT 0,
        winner_id INTEGER,
        game_mode TEXT DEFAULT 'multiplayer',
        rounds_played INTEGER DEFAULT 10,
        game_duration INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player1_id) REFERENCES users (id),
        FOREIGN KEY (player2_id) REFERENCES users (id),
        FOREIGN KEY (winner_id) REFERENCES users (id)
      )
    `;

        // Execute table creation
        this.db.serialize(() => {
            this.db.run(createUsersTable, (err) => {
                if (err) {
                    console.error('❌ Error creating users table:', err);
                } else {
                    console.log('✅ Users table ready');
                }
            });

            this.db.run(createUserStatsTable, (err) => {
                if (err) {
                    console.error('❌ Error creating user stats table:', err);
                } else {
                    console.log('✅ User stats table ready');
                }
            });

            this.db.run(createUserSessionsTable, (err) => {
                if (err) {
                    console.error('❌ Error creating user sessions table:', err);
                } else {
                    console.log('✅ User sessions table ready');
                }
            });

            this.db.run(createGameHistoryTable, (err) => {
                if (err) {
                    console.error('❌ Error creating game history table:', err);
                } else {
                    console.log('✅ Game history table ready');
                }
            });
        });
    }

    // Game History Methods
    async createGameHistory(gameData) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO game_history (
                    player1_id, player2_id, player1_score, player2_score,
                    winner_id, game_mode, rounds_played, game_duration, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [
                gameData.player1_id,
                gameData.player2_id,
                gameData.player1_score,
                gameData.player2_score,
                gameData.winner_id,
                gameData.game_mode,
                gameData.rounds_played,
                gameData.game_duration,
                gameData.created_at
            ], function (err) {
                if (err) {
                    console.error('❌ Error creating game history:', err);
                    reject(err);
                } else {
                    console.log('✅ Game history created with ID:', this.lastID);
                    resolve({ id: this.lastID, changes: this.changes });
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
                } else {
                    resolve(row);
                }
            });
        });
    }

    async createUserStats(statsData) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO user_stats (
                    user_id, games_played, games_won, total_score,
                    average_score, best_score, cooperation_rate, betrayal_rate,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [
                statsData.user_id,
                statsData.games_played || 0,
                statsData.games_won || 0,
                statsData.total_score || 0,
                statsData.average_score || 0,
                statsData.best_score || 0,
                statsData.cooperation_rate || 0,
                statsData.betrayal_rate || 0,
                statsData.created_at,
                statsData.updated_at
            ], function (err) {
                if (err) {
                    console.error('❌ Error creating user stats:', err);
                    reject(err);
                } else {
                    console.log('✅ User stats created with ID:', this.lastID);
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    // Session methods
    async getSessionByToken(token) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM user_sessions WHERE session_token = ? AND is_active = 1`;
            this.db.get(query, [token], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
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