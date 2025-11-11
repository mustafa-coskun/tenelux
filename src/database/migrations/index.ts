// Migration registry and runner

import { Migration } from '../core/interfaces';
import { createInitialTables } from './001_create_initial_tables';
import { addUserEnhancements } from './002_add_user_enhancements';
import { addGameEnhancements } from './003_add_game_enhancements';
import { addIndexes } from './004_add_indexes';
import { addEnhancedGameSystem } from './005_add_enhanced_game_system';

// All migrations in order
export const migrations: Migration[] = [
  createInitialTables,
  addUserEnhancements,
  addGameEnhancements,
  addIndexes,
  addEnhancedGameSystem
];

// Get migrations by version
export function getMigrationByVersion(version: string): Migration | undefined {
  return migrations.find(m => m.version === version);
}

// Get pending migrations
export function getPendingMigrations(appliedVersions: string[]): Migration[] {
  return migrations.filter(m => !appliedVersions.includes(m.version));
}

// Validate migration order
export function validateMigrationOrder(): boolean {
  const versions = migrations.map(m => m.version);
  const sortedVersions = [...versions].sort();
  return JSON.stringify(versions) === JSON.stringify(sortedVersions);
}

// Get latest migration version
export function getLatestMigrationVersion(): string {
  return migrations[migrations.length - 1]?.version || '000';
}

// Migration runner utility
export class MigrationRunner {
  constructor(private adapter: any) {}

  async getAppliedMigrations(): Promise<string[]> {
    try {
      const results = await this.adapter.query(
        'SELECT version FROM migrations ORDER BY version'
      ) as { version: string }[];
      return results.map(r => r.version);
    } catch (error) {
      // Migrations table might not exist yet
      return [];
    }
  }

  async runPendingMigrations(): Promise<void> {
    const appliedVersions = await this.getAppliedMigrations();
    const pendingMigrations = getPendingMigrations(appliedVersions);

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    console.log(`📦 Running ${pendingMigrations.length} pending migrations...`);

    for (const migration of pendingMigrations) {
      try {
        console.log(`⏳ Running migration ${migration.version}: ${migration.name}`);
        
        await migration.up(this.adapter);
        
        // Record migration as applied
        await this.adapter.execute(
          'INSERT OR REPLACE INTO migrations (version, name, applied_at) VALUES (?, ?, ?)',
          [migration.version, migration.name, new Date().toISOString()]
        );
        
        console.log(`✅ Migration ${migration.version} completed`);
      } catch (error) {
        console.error(`❌ Migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    console.log('✅ All migrations completed successfully');
  }

  async rollbackMigration(version: string): Promise<void> {
    const migration = getMigrationByVersion(version);
    if (!migration) {
      throw new Error(`Migration ${version} not found`);
    }

    console.log(`⏳ Rolling back migration ${version}: ${migration.name}`);
    
    try {
      await migration.down(this.adapter);
      
      // Remove migration record
      await this.adapter.execute(
        'DELETE FROM migrations WHERE version = ?',
        [version]
      );
      
      console.log(`✅ Migration ${version} rolled back successfully`);
    } catch (error) {
      console.error(`❌ Rollback of migration ${version} failed:`, error);
      throw error;
    }
  }

  async getMigrationStatus(): Promise<{
    applied: string[];
    pending: string[];
    latest: string;
  }> {
    const appliedVersions = await this.getAppliedMigrations();
    const pendingMigrations = getPendingMigrations(appliedVersions);
    
    return {
      applied: appliedVersions,
      pending: pendingMigrations.map(m => m.version),
      latest: getLatestMigrationVersion()
    };
  }
}