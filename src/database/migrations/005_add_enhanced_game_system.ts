// Enhanced Game System migration - Trust Score, Game Modes, Social Features

import { Migration, IDatabaseAdapter } from '../core/interfaces';

export const addEnhancedGameSystem: Migration = {
  version: '005',
  name: 'Add Enhanced Game System',
  
  async up(adapter: IDatabaseAdapter): Promise<void> {
    // Add trust score fields to users table
    try {
      await adapter.execute(`
        ALTER TABLE users ADD COLUMN trust_score REAL DEFAULT 50.0
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE users ADD COLUMN total_games INTEGER DEFAULT 0
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE users ADD COLUMN silent_games INTEGER DEFAULT 0
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE users ADD COLUMN silence_ratio REAL DEFAULT 0.0
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    // Add game mode fields to games table
    try {
      await adapter.execute(`
        ALTER TABLE games ADD COLUMN game_mode TEXT DEFAULT 'multi' CHECK(game_mode IN ('single', 'multi', 'party'))
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE games ADD COLUMN affects_stats BOOLEAN DEFAULT 1
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE games ADD COLUMN player1_silent BOOLEAN DEFAULT 0
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE games ADD COLUMN player2_silent BOOLEAN DEFAULT 0
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    // Create friendships table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL,
        addressee_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'blocked', 'rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (addressee_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(requester_id, addressee_id)
      )
    `);

    // Create parties table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS parties (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        name TEXT NOT NULL,
        max_players INTEGER DEFAULT 4,
        status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting', 'playing', 'finished')),
        is_private BOOLEAN DEFAULT 0,
        invite_code TEXT UNIQUE,
        game_settings TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create party_members table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS party_members (
        id TEXT PRIMARY KEY,
        party_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT DEFAULT 'joined' CHECK(status IN ('invited', 'joined', 'ready', 'left')),
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES parties (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(party_id, user_id)
      )
    `);

    // Create game_modifications table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS game_modifications (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        player1_id TEXT NOT NULL,
        player2_id TEXT NOT NULL,
        player1_request TEXT,
        player2_request TEXT,
        player1_new_score INTEGER,
        player2_new_score INTEGER,
        player1_new_result TEXT,
        player2_new_result TEXT,
        final_decision TEXT,
        applied BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
        FOREIGN KEY (player1_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (player2_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create separate statistics tables for different game modes
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS user_single_stats (
        user_id TEXT PRIMARY KEY,
        total_games INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        highest_score INTEGER DEFAULT 0,
        average_score REAL DEFAULT 0,
        total_playtime INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS user_multi_stats (
        user_id TEXT PRIMARY KEY,
        total_games INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        cooperations INTEGER DEFAULT 0,
        betrayals INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        highest_score INTEGER DEFAULT 0,
        win_rate REAL DEFAULT 0,
        betrayal_rate REAL DEFAULT 0,
        average_score REAL DEFAULT 0,
        longest_win_streak INTEGER DEFAULT 0,
        current_win_streak INTEGER DEFAULT 0,
        total_playtime INTEGER DEFAULT 0,
        rank_points INTEGER DEFAULT 1000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS user_party_stats (
        user_id TEXT PRIMARY KEY,
        total_games INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        cooperations INTEGER DEFAULT 0,
        betrayals INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        highest_score INTEGER DEFAULT 0,
        win_rate REAL DEFAULT 0,
        betrayal_rate REAL DEFAULT 0,
        average_score REAL DEFAULT 0,
        parties_hosted INTEGER DEFAULT 0,
        parties_joined INTEGER DEFAULT 0,
        total_playtime INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_trust_score ON users(trust_score)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_total_games ON users(total_games)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_game_mode ON games(game_mode)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_affects_stats ON games(affects_stats)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_parties_host ON parties(host_id)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_parties_status ON parties(status)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_party_members_party ON party_members(party_id)
    `);

    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_party_members_user ON party_members(user_id)
    `);

    console.log('✅ Enhanced Game System schema added successfully');
  },

  async down(adapter: IDatabaseAdapter): Promise<void> {
    // Drop indexes
    await adapter.execute('DROP INDEX IF EXISTS idx_party_members_user');
    await adapter.execute('DROP INDEX IF EXISTS idx_party_members_party');
    await adapter.execute('DROP INDEX IF EXISTS idx_parties_status');
    await adapter.execute('DROP INDEX IF EXISTS idx_parties_host');
    await adapter.execute('DROP INDEX IF EXISTS idx_friendships_status');
    await adapter.execute('DROP INDEX IF EXISTS idx_friendships_addressee');
    await adapter.execute('DROP INDEX IF EXISTS idx_friendships_requester');
    await adapter.execute('DROP INDEX IF EXISTS idx_games_affects_stats');
    await adapter.execute('DROP INDEX IF EXISTS idx_games_game_mode');
    await adapter.execute('DROP INDEX IF EXISTS idx_users_total_games');
    await adapter.execute('DROP INDEX IF EXISTS idx_users_trust_score');

    // Drop tables
    await adapter.execute('DROP TABLE IF EXISTS user_party_stats');
    await adapter.execute('DROP TABLE IF EXISTS user_multi_stats');
    await adapter.execute('DROP TABLE IF EXISTS user_single_stats');
    await adapter.execute('DROP TABLE IF EXISTS game_modifications');
    await adapter.execute('DROP TABLE IF EXISTS party_members');
    await adapter.execute('DROP TABLE IF EXISTS parties');
    await adapter.execute('DROP TABLE IF EXISTS friendships');
    
    console.log('✅ Enhanced Game System schema rollback completed');
    console.log('⚠️ Note: Added columns to users and games tables cannot be easily removed in SQLite');
  }
};