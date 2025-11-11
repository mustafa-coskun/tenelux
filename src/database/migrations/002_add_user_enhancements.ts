// User enhancements migration

import { Migration, IDatabaseAdapter } from '../core/interfaces';

export const addUserEnhancements: Migration = {
  version: '002',
  name: 'Add user enhancements',
  
  async up(adapter: IDatabaseAdapter): Promise<void> {
    // Add additional user fields if they don't exist
    try {
      await adapter.execute(`
        ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT 0
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE users ADD COLUMN two_factor_secret TEXT
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE users ADD COLUMN backup_codes TEXT DEFAULT '[]'
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'UTC'
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await adapter.execute(`
        ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'
      `);
    } catch (error) {
      // Column might already exist, ignore error
    }

    // Create user_profiles table for extended profile information
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY,
        bio TEXT,
        location TEXT,
        website TEXT,
        birth_date DATE,
        profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'friends', 'private')),
        show_online_status BOOLEAN DEFAULT 1,
        allow_friend_requests BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create user_statistics table for detailed game statistics
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS user_statistics (
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
        trust_score INTEGER DEFAULT 50,
        betrayal_rate REAL DEFAULT 0,
        average_score REAL DEFAULT 0,
        longest_win_streak INTEGER DEFAULT 0,
        current_win_streak INTEGER DEFAULT 0,
        longest_lose_streak INTEGER DEFAULT 0,
        current_lose_streak INTEGER DEFAULT 0,
        games_this_week INTEGER DEFAULT 0,
        games_this_month INTEGER DEFAULT 0,
        games_this_year INTEGER DEFAULT 0,
        total_playtime INTEGER DEFAULT 0,
        average_game_duration REAL DEFAULT 0,
        favorite_game_mode TEXT,
        rank_points INTEGER DEFAULT 1000,
        rank_tier TEXT DEFAULT 'bronze',
        last_rank_update DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    console.log('✅ User enhancements added successfully');
  },

  async down(adapter: IDatabaseAdapter): Promise<void> {
    // Drop new tables
    await adapter.execute('DROP TABLE IF EXISTS user_statistics');
    await adapter.execute('DROP TABLE IF EXISTS user_profiles');

    // Remove added columns (SQLite doesn't support DROP COLUMN easily)
    // In a real migration system, you might need to recreate the table
    console.log('⚠️ Note: Added columns to users table cannot be easily removed in SQLite');
    
    console.log('✅ User enhancements rollback completed');
  }
};