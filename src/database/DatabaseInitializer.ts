import DatabaseConnection from './DatabaseConnection';

export class DatabaseInitializer {
  private static initialized = false;

  public static async initialize(): Promise<void> {
    if (DatabaseInitializer.initialized) {
      console.log('Database already initialized');
      return;
    }

    try {
      const db = DatabaseConnection.getInstance();
      await db.initialize();

      // Verify database health
      const isHealthy = await db.healthCheck();
      if (!isHealthy) {
        throw new Error('Database health check failed after initialization');
      }

      DatabaseInitializer.initialized = true;
      console.log('Database initialization completed successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  public static async shutdown(): Promise<void> {
    if (!DatabaseInitializer.initialized) {
      return;
    }

    try {
      const db = DatabaseConnection.getInstance();
      await db.close();
      DatabaseInitializer.initialized = false;
      console.log('Database shutdown completed successfully');
    } catch (error) {
      console.error('Database shutdown failed:', error);
      throw error;
    }
  }

  public static isInitialized(): boolean {
    return DatabaseInitializer.initialized;
  }

  public static async reset(): Promise<void> {
    if (!DatabaseInitializer.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const db = DatabaseConnection.getInstance();
      await db.reset();
      console.log('Database reset completed successfully');
    } catch (error) {
      console.error('Database reset failed:', error);
      throw error;
    }
  }
}

export default DatabaseInitializer;
