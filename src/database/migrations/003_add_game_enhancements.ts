// Game enhancements migration

import { Migration, IDatabaseAdapter } from '../core/interfaces';

export const addGameEnhancements: Migration = {
  version: '003',
  name: 'Add game enhancements',
  
  async up(adapter: IDatabaseAdapter): Promise<void> {
    // Create tournaments table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        organizer_id TEXT NOT NULL,
        tournament_type TEXT DEFAULT 'single_elimination' CHECK (tournament_type IN ('single_elimination', 'double_elimination', 'round_robin', 'swiss')),
        status TEXT DEFAULT 'registration' CHECK (status IN ('registration', 'starting', 'in_progress', 'completed', 'cancelled')),
        max_participants INTEGER NOT NULL,
        current_participants INTEGER DEFAULT 0,
        entry_fee INTEGER DEFAULT 0,
        prize_pool INTEGER DEFAULT 0,
        start_time DATETIME,
        end_time DATETIME,
        registration_deadline DATETIME,
        rules TEXT DEFAULT '[]',
        settings TEXT DEFAULT '{}',
        bracket_data TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organizer_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create tournament_participants table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS tournament_participants (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        registration_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in', 'playing', 'eliminated', 'winner', 'disqualified')),
        seed_number INTEGER,
        current_round INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        points INTEGER DEFAULT 0,
        tie_breaker_score REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(tournament_id, user_id)
      )
    `);

    // Create game_history table for detailed game records
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS game_history (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        opponent_id TEXT,
        game_type TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw', 'abandoned')),
        score INTEGER DEFAULT 0,
        opponent_score INTEGER DEFAULT 0,
        cooperated_count INTEGER DEFAULT 0,
        betrayed_count INTEGER DEFAULT 0,
        was_betrayed_count INTEGER DEFAULT 0,
        total_rounds INTEGER DEFAULT 0,
        game_duration INTEGER DEFAULT 0,
        trust_score_change INTEGER DEFAULT 0,
        rank_points_change INTEGER DEFAULT 0,
        tournament_id TEXT,
        lobby_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (opponent_id) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE SET NULL
      )
    `);

    // Create achievements table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        icon TEXT DEFAULT '🏆',
        points INTEGER DEFAULT 0,
        rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
        requirements TEXT DEFAULT '{}',
        is_hidden BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_achievements table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS user_achievements (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        progress TEXT DEFAULT '{}',
        is_showcased BOOLEAN DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (achievement_id) REFERENCES achievements (id) ON DELETE CASCADE,
        UNIQUE(user_id, achievement_id)
      )
    `);

    // Create leaderboards table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS leaderboards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('global', 'weekly', 'monthly', 'seasonal', 'tournament')),
        category TEXT NOT NULL,
        start_date DATETIME,
        end_date DATETIME,
        is_active BOOLEAN DEFAULT 1,
        settings TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create leaderboard_entries table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS leaderboard_entries (
        id TEXT PRIMARY KEY,
        leaderboard_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        rank_position INTEGER NOT NULL,
        score INTEGER NOT NULL,
        additional_data TEXT DEFAULT '{}',
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (leaderboard_id) REFERENCES leaderboards (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(leaderboard_id, user_id)
      )
    `);

    console.log('✅ Game enhancements added successfully');
  },

  async down(adapter: IDatabaseAdapter): Promise<void> {
    // Drop tables in reverse order of dependencies
    await adapter.execute('DROP TABLE IF EXISTS leaderboard_entries');
    await adapter.execute('DROP TABLE IF EXISTS leaderboards');
    await adapter.execute('DROP TABLE IF EXISTS user_achievements');
    await adapter.execute('DROP TABLE IF EXISTS achievements');
    await adapter.execute('DROP TABLE IF EXISTS game_history');
    await adapter.execute('DROP TABLE IF EXISTS tournament_participants');
    await adapter.execute('DROP TABLE IF EXISTS tournaments');
    
    console.log('✅ Game enhancements rollback completed');
  }
};