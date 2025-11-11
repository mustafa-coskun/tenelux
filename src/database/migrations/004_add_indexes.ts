// Database indexes migration

import { Migration, IDatabaseAdapter } from '../core/interfaces';

export const addIndexes: Migration = {
  version: '004',
  name: 'Add database indexes for performance',
  
  async up(adapter: IDatabaseAdapter): Promise<void> {
    // Users table indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_is_guest ON users(is_guest)
    `);

    // User sessions table indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON user_sessions(is_active)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_ip_address ON user_sessions(ip_address)
    `);

    // Games table indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_type ON games(type)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_status ON games(status)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_lobby_code ON games(lobby_code)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_started_at ON games(started_at)
    `);

    // Tournament indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournaments_organizer_id ON tournaments(organizer_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournaments_start_time ON tournaments(start_time)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournaments_tournament_type ON tournaments(tournament_type)
    `);

    // Tournament participants indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id ON tournament_participants(tournament_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_participants_user_id ON tournament_participants(user_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_participants_status ON tournament_participants(status)
    `);

    // Game history indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_game_history_game_id ON game_history(game_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_game_history_user_id ON game_history(user_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_game_history_opponent_id ON game_history(opponent_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_game_history_game_type ON game_history(game_type)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_game_history_result ON game_history(result)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_game_history_tournament_id ON game_history(tournament_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_game_history_created_at ON game_history(created_at)
    `);

    // User achievements indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_user_achievements_earned_at ON user_achievements(earned_at)
    `);

    // Achievements indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_achievements_rarity ON achievements(rarity)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_achievements_is_active ON achievements(is_active)
    `);

    // Leaderboard indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_leaderboards_type ON leaderboards(type)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_leaderboards_category ON leaderboards(category)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_leaderboards_is_active ON leaderboards(is_active)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_leaderboards_start_date ON leaderboards(start_date)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_leaderboards_end_date ON leaderboards(end_date)
    `);

    // Leaderboard entries indexes
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_leaderboard_id ON leaderboard_entries(leaderboard_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_user_id ON leaderboard_entries(user_id)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_rank_position ON leaderboard_entries(rank_position)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_score ON leaderboard_entries(score)
    `);

    // Composite indexes for common queries
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_status_guest ON users(status, is_guest)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON user_sessions(user_id, is_active, expires_at)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_games_type_status ON games(type, status)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_game_history_user_type ON game_history(user_id, game_type, created_at)
    `);
    
    await adapter.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_status ON tournament_participants(tournament_id, status)
    `);

    console.log('✅ Database indexes added successfully');
  },

  async down(adapter: IDatabaseAdapter): Promise<void> {
    // Drop all indexes
    const indexes = [
      // Users indexes
      'idx_users_username',
      'idx_users_email',
      'idx_users_status',
      'idx_users_last_active',
      'idx_users_is_guest',
      
      // Sessions indexes
      'idx_sessions_token',
      'idx_sessions_user_id',
      'idx_sessions_expires_at',
      'idx_sessions_is_active',
      'idx_sessions_ip_address',
      
      // Games indexes
      'idx_games_type',
      'idx_games_status',
      'idx_games_lobby_code',
      'idx_games_created_at',
      'idx_games_started_at',
      
      // Tournament indexes
      'idx_tournaments_organizer_id',
      'idx_tournaments_status',
      'idx_tournaments_start_time',
      'idx_tournaments_tournament_type',
      
      // Tournament participants indexes
      'idx_tournament_participants_tournament_id',
      'idx_tournament_participants_user_id',
      'idx_tournament_participants_status',
      
      // Game history indexes
      'idx_game_history_game_id',
      'idx_game_history_user_id',
      'idx_game_history_opponent_id',
      'idx_game_history_game_type',
      'idx_game_history_result',
      'idx_game_history_tournament_id',
      'idx_game_history_created_at',
      
      // Achievement indexes
      'idx_user_achievements_user_id',
      'idx_user_achievements_achievement_id',
      'idx_user_achievements_earned_at',
      'idx_achievements_category',
      'idx_achievements_rarity',
      'idx_achievements_is_active',
      
      // Leaderboard indexes
      'idx_leaderboards_type',
      'idx_leaderboards_category',
      'idx_leaderboards_is_active',
      'idx_leaderboards_start_date',
      'idx_leaderboards_end_date',
      'idx_leaderboard_entries_leaderboard_id',
      'idx_leaderboard_entries_user_id',
      'idx_leaderboard_entries_rank_position',
      'idx_leaderboard_entries_score',
      
      // Composite indexes
      'idx_users_status_guest',
      'idx_sessions_user_active',
      'idx_games_type_status',
      'idx_game_history_user_type',
      'idx_tournament_participants_tournament_status'
    ];

    for (const indexName of indexes) {
      try {
        await adapter.execute(`DROP INDEX IF EXISTS ${indexName}`);
      } catch (error) {
        console.warn(`Failed to drop index ${indexName}:`, error.message);
      }
    }
    
    console.log('✅ Database indexes rollback completed');
  }
};