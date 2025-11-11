// Initial database tables migration

import { Migration, IDatabaseAdapter } from '../core/interfaces';

export const createInitialTables: Migration = {
  version: '001',
  name: 'Create initial tables',

  async up(adapter: IDatabaseAdapter): Promise<void> {
    // Users table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        email TEXT UNIQUE,
        is_guest BOOLEAN DEFAULT 0,
        avatar TEXT DEFAULT '🎮',
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'banned', 'suspended')),
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
        email_verified BOOLEAN DEFAULT 0,
        login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        preferences TEXT DEFAULT '{}',
        stats TEXT DEFAULT '{}',
        friends TEXT DEFAULT '[]',
        achievements TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User sessions table
    await adapter.execute(`
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
    `);

    // Games table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('single', 'tournament', 'party', 'ranked')),
        players TEXT NOT NULL DEFAULT '[]',
        status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'starting', 'in_progress', 'paused', 'completed', 'cancelled', 'abandoned')),
        settings TEXT NOT NULL DEFAULT '{}',
        started_at DATETIME,
        completed_at DATETIME,
        results TEXT,
        lobby_code TEXT,
        current_round INTEGER DEFAULT 0,
        decisions TEXT DEFAULT '{}',
        metadata TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migrations tracking table
    await adapter.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Initial tables created successfully');
  },

  async down(adapter: IDatabaseAdapter): Promise<void> {
    // Drop tables in reverse order
    await adapter.execute('DROP TABLE IF EXISTS migrations');
    await adapter.execute('DROP TABLE IF EXISTS games');
    await adapter.execute('DROP TABLE IF EXISTS user_sessions');
    await adapter.execute('DROP TABLE IF EXISTS users');

    console.log('✅ Initial tables dropped successfully');
  }
};