/**
 * StateManagementService
 * 
 * Ortak state save/load mantığı, LocalStorage yönetimi ve state migration
 * StateManager'ı wrap eder ve ek yardımcı fonksiyonlar sağlar
 */

import { getErrorHandlingService } from './ErrorHandlingService';

export interface StateMetadata {
  version: string;
  timestamp: number;
  userId?: string;
  expiresAt?: number;
}

export interface StoredState<T = any> {
  data: T;
  metadata: StateMetadata;
}

export interface StateMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (oldData: any) => any;
}

class StateManagementService {
  private readonly CURRENT_VERSION = '1.0.0';
  private readonly DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 saat
  private errorService = getErrorHandlingService();
  private migrations: StateMigration[] = [];

  /**
   * State'i localStorage'a kaydet
   */
  saveState<T>(key: string, data: T, options?: {
    version?: string;
    userId?: string;
    expiryMs?: number;
  }): boolean {
    return this.errorService.tryCatchSync(() => {
      const metadata: StateMetadata = {
        version: options?.version || this.CURRENT_VERSION,
        timestamp: Date.now(),
        userId: options?.userId,
        expiresAt: options?.expiryMs ? Date.now() + options.expiryMs : undefined
      };

      const storedState: StoredState<T> = {
        data,
        metadata
      };

      const serialized = JSON.stringify(storedState);
      localStorage.setItem(key, serialized);
      
      console.log(`💾 State saved: ${key}`, {
        size: new Blob([serialized]).size,
        version: metadata.version
      });

      return true;
    }, `saveState_${key}`, { operation: 'save_state' }, false) || false;
  }

  /**
   * State'i localStorage'dan yükle
   */
  loadState<T>(key: string, options?: {
    validateVersion?: boolean;
    autoMigrate?: boolean;
  }): T | null {
    return this.errorService.tryCatchSync(() => {
      const stored = localStorage.getItem(key);
      if (!stored) {
        return null;
      }

      const storedState: StoredState<T> = JSON.parse(stored);

      // Metadata kontrolü
      if (!storedState.metadata) {
        console.warn(`⚠️ State has no metadata: ${key}`);
        return storedState as any; // Eski format
      }

      // Expiry kontrolü
      if (storedState.metadata.expiresAt && Date.now() > storedState.metadata.expiresAt) {
        console.warn(`⏰ State expired: ${key}`);
        this.removeState(key);
        return null;
      }

      // Version kontrolü ve migration
      if (options?.validateVersion && storedState.metadata.version !== this.CURRENT_VERSION) {
        console.warn(`🔄 State version mismatch: ${key}`, {
          stored: storedState.metadata.version,
          current: this.CURRENT_VERSION
        });

        if (options?.autoMigrate) {
          const migrated = this.migrateState(storedState, this.CURRENT_VERSION);
          if (migrated) {
            // Migrated state'i kaydet
            this.saveState(key, migrated.data, {
              version: migrated.metadata.version,
              userId: migrated.metadata.userId
            });
            return migrated.data;
          }
        }

        return null;
      }

      console.log(`📂 State loaded: ${key}`, {
        version: storedState.metadata.version,
        age: Date.now() - storedState.metadata.timestamp
      });

      return storedState.data;
    }, `loadState_${key}`, { operation: 'load_state' }, false);
  }

  /**
   * State'i kaldır
   */
  removeState(key: string): boolean {
    return this.errorService.tryCatchSync(() => {
      localStorage.removeItem(key);
      console.log(`🗑️ State removed: ${key}`);
      return true;
    }, `removeState_${key}`, { operation: 'remove_state' }, false) || false;
  }

  /**
   * State'in var olup olmadığını kontrol et
   */
  hasState(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }

  /**
   * State'in geçerli olup olmadığını kontrol et
   */
  isStateValid(key: string): boolean {
    const state = this.loadState(key, { validateVersion: true });
    return state !== null;
  }

  /**
   * State'in yaşını al (ms)
   */
  getStateAge(key: string): number | null {
    return this.errorService.tryCatchSync(() => {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const storedState: StoredState = JSON.parse(stored);
      if (!storedState.metadata) return null;

      return Date.now() - storedState.metadata.timestamp;
    }, `getStateAge_${key}`, { operation: 'get_state_age' }, false);
  }

  /**
   * State metadata'sını al
   */
  getStateMetadata(key: string): StateMetadata | null {
    return this.errorService.tryCatchSync(() => {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const storedState: StoredState = JSON.parse(stored);
      return storedState.metadata || null;
    }, `getStateMetadata_${key}`, { operation: 'get_state_metadata' }, false);
  }

  /**
   * State'i güncelle (merge)
   */
  updateState<T>(key: string, updates: Partial<T>): boolean {
    return this.errorService.tryCatchSync(() => {
      const currentState = this.loadState<T>(key);
      if (!currentState) {
        console.warn(`⚠️ Cannot update non-existent state: ${key}`);
        return false;
      }

      const updatedState = {
        ...currentState,
        ...updates
      };

      return this.saveState(key, updatedState);
    }, `updateState_${key}`, { operation: 'update_state' }, false) || false;
  }

  /**
   * Birden fazla state'i kaydet (batch)
   */
  saveStates(states: Array<{ key: string; data: any; options?: any }>): boolean {
    return this.errorService.tryCatchSync(() => {
      let allSuccess = true;

      for (const state of states) {
        const success = this.saveState(state.key, state.data, state.options);
        if (!success) {
          allSuccess = false;
          console.error(`❌ Failed to save state: ${state.key}`);
        }
      }

      return allSuccess;
    }, 'saveStates_batch', { operation: 'save_states_batch' }, false) || false;
  }

  /**
   * Birden fazla state'i yükle (batch)
   */
  loadStates<T = any>(keys: string[], options?: {
    validateVersion?: boolean;
    autoMigrate?: boolean;
  }): Record<string, T | null> {
    return this.errorService.tryCatchSync(() => {
      const result: Record<string, T | null> = {};

      for (const key of keys) {
        result[key] = this.loadState<T>(key, options);
      }

      return result;
    }, 'loadStates_batch', { operation: 'load_states_batch' }, false) || {};
  }

  /**
   * Birden fazla state'i kaldır (batch)
   */
  removeStates(keys: string[]): boolean {
    return this.errorService.tryCatchSync(() => {
      let allSuccess = true;

      for (const key of keys) {
        const success = this.removeState(key);
        if (!success) {
          allSuccess = false;
        }
      }

      return allSuccess;
    }, 'removeStates_batch', { operation: 'remove_states_batch' }, false) || false;
  }

  /**
   * Tüm state'leri temizle (belirli prefix ile)
   */
  clearStates(prefix?: string): boolean {
    return this.errorService.tryCatchSync(() => {
      const keys = this.getAllStateKeys(prefix);
      
      for (const key of keys) {
        localStorage.removeItem(key);
      }

      console.log(`🗑️ Cleared ${keys.length} states${prefix ? ` with prefix: ${prefix}` : ''}`);
      return true;
    }, 'clearStates', { operation: 'clear_states' }, false) || false;
  }

  /**
   * Tüm state key'lerini al
   */
  getAllStateKeys(prefix?: string): string[] {
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (!prefix || key.startsWith(prefix))) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * LocalStorage boyutunu al (bytes)
   */
  getStorageSize(): number {
    let total = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          total += key.length + value.length;
        }
      }
    }

    return total * 2; // UTF-16 encoding
  }

  /**
   * LocalStorage kullanım yüzdesini al (tahmini)
   */
  getStorageUsagePercent(): number {
    const ESTIMATED_QUOTA = 5 * 1024 * 1024; // 5MB (tarayıcıya göre değişir)
    const used = this.getStorageSize();
    return (used / ESTIMATED_QUOTA) * 100;
  }

  /**
   * Eski state'leri temizle (expiry veya age'e göre)
   */
  cleanupOldStates(maxAgeMs?: number): number {
    return this.errorService.tryCatchSync(() => {
      const keys = this.getAllStateKeys();
      let cleanedCount = 0;

      for (const key of keys) {
        try {
          const stored = localStorage.getItem(key);
          if (!stored) continue;

          const storedState: StoredState = JSON.parse(stored);
          
          // Expiry kontrolü
          if (storedState.metadata?.expiresAt && Date.now() > storedState.metadata.expiresAt) {
            localStorage.removeItem(key);
            cleanedCount++;
            continue;
          }

          // Age kontrolü
          if (maxAgeMs && storedState.metadata?.timestamp) {
            const age = Date.now() - storedState.metadata.timestamp;
            if (age > maxAgeMs) {
              localStorage.removeItem(key);
              cleanedCount++;
            }
          }
        } catch (error) {
          // Geçersiz state - temizle
          localStorage.removeItem(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} old states`);
      }

      return cleanedCount;
    }, 'cleanupOldStates', { operation: 'cleanup_old_states' }, false) || 0;
  }

  /**
   * State migration ekle
   */
  addMigration(migration: StateMigration): void {
    this.migrations.push(migration);
    console.log(`🔄 Added migration: ${migration.fromVersion} -> ${migration.toVersion}`);
  }

  /**
   * State'i migrate et
   */
  private migrateState<T>(storedState: StoredState<T>, targetVersion: string): StoredState<T> | null {
    let currentState = storedState;
    let currentVersion = storedState.metadata.version;

    // Migration chain'i bul ve uygula
    while (currentVersion !== targetVersion) {
      const migration = this.migrations.find(m => m.fromVersion === currentVersion);
      
      if (!migration) {
        console.error(`❌ No migration found from ${currentVersion} to ${targetVersion}`);
        return null;
      }

      try {
        console.log(`🔄 Migrating state: ${currentVersion} -> ${migration.toVersion}`);
        
        const migratedData = migration.migrate(currentState.data);
        
        currentState = {
          data: migratedData,
          metadata: {
            ...currentState.metadata,
            version: migration.toVersion,
            timestamp: Date.now()
          }
        };

        currentVersion = migration.toVersion;
      } catch (error) {
        console.error(`❌ Migration failed: ${currentVersion} -> ${migration.toVersion}`, error);
        return null;
      }
    }

    return currentState;
  }

  /**
   * State'i export et (JSON)
   */
  exportState(key: string): string | null {
    return this.errorService.tryCatchSync(() => {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      return stored;
    }, `exportState_${key}`, { operation: 'export_state' }, false);
  }

  /**
   * State'i import et (JSON)
   */
  importState(key: string, jsonData: string): boolean {
    return this.errorService.tryCatchSync(() => {
      // Validate JSON
      const parsed = JSON.parse(jsonData);
      
      // Save to localStorage
      localStorage.setItem(key, jsonData);
      
      console.log(`📥 State imported: ${key}`);
      return true;
    }, `importState_${key}`, { operation: 'import_state' }, false) || false;
  }

  /**
   * State'i clone et
   */
  cloneState<T>(sourceKey: string, targetKey: string): boolean {
    return this.errorService.tryCatchSync(() => {
      const state = this.loadState<T>(sourceKey);
      if (!state) {
        console.warn(`⚠️ Cannot clone non-existent state: ${sourceKey}`);
        return false;
      }

      return this.saveState(targetKey, state);
    }, `cloneState_${sourceKey}_to_${targetKey}`, { operation: 'clone_state' }, false) || false;
  }

  /**
   * State'leri karşılaştır
   */
  compareStates<T>(key1: string, key2: string): {
    equal: boolean;
    differences?: string[];
  } {
    return this.errorService.tryCatchSync(() => {
      const state1 = this.loadState<T>(key1);
      const state2 = this.loadState<T>(key2);

      if (!state1 || !state2) {
        return {
          equal: false,
          differences: ['One or both states do not exist']
        };
      }

      const json1 = JSON.stringify(state1);
      const json2 = JSON.stringify(state2);

      if (json1 === json2) {
        return { equal: true };
      }

      // Basit fark tespiti
      const differences: string[] = [];
      const keys1 = Object.keys(state1 as any);
      const keys2 = Object.keys(state2 as any);

      const allKeys = new Set([...keys1, ...keys2]);
      
      for (const key of allKeys) {
        const val1 = (state1 as any)[key];
        const val2 = (state2 as any)[key];

        if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          differences.push(key);
        }
      }

      return {
        equal: false,
        differences
      };
    }, `compareStates_${key1}_${key2}`, { operation: 'compare_states' }, false) || { equal: false };
  }

  /**
   * State snapshot al
   */
  createSnapshot(prefix?: string): Record<string, any> {
    return this.errorService.tryCatchSync(() => {
      const keys = this.getAllStateKeys(prefix);
      const snapshot: Record<string, any> = {};

      for (const key of keys) {
        const state = this.loadState(key);
        if (state) {
          snapshot[key] = state;
        }
      }

      console.log(`📸 Created snapshot with ${Object.keys(snapshot).length} states`);
      return snapshot;
    }, 'createSnapshot', { operation: 'create_snapshot' }, false) || {};
  }

  /**
   * Snapshot'ı restore et
   */
  restoreSnapshot(snapshot: Record<string, any>): boolean {
    return this.errorService.tryCatchSync(() => {
      let successCount = 0;

      for (const [key, data] of Object.entries(snapshot)) {
        if (this.saveState(key, data)) {
          successCount++;
        }
      }

      console.log(`📥 Restored ${successCount}/${Object.keys(snapshot).length} states from snapshot`);
      return successCount === Object.keys(snapshot).length;
    }, 'restoreSnapshot', { operation: 'restore_snapshot' }, false) || false;
  }
}

// Singleton instance
let stateManagementServiceInstance: StateManagementService | null = null;

export function getStateManagementService(): StateManagementService {
  if (!stateManagementServiceInstance) {
    stateManagementServiceInstance = new StateManagementService();
  }
  return stateManagementServiceInstance;
}

export default StateManagementService;
