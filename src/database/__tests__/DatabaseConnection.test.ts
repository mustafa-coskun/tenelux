import DatabaseConnection from '../DatabaseConnection';
import DatabaseInitializer from '../DatabaseInitializer';

describe('DatabaseConnection', () => {
  let db: DatabaseConnection;

  beforeAll(async () => {
    await DatabaseInitializer.initialize();
    db = DatabaseConnection.getInstance();
  });

  afterAll(async () => {
    await DatabaseInitializer.shutdown();
  });

  beforeEach(async () => {
    await db.reset();
  });

  describe('Connection Management', () => {
    it('should create a singleton instance', () => {
      const instance1 = DatabaseConnection.getInstance();
      const instance2 = DatabaseConnection.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should perform health check successfully', async () => {
      const isHealthy = await db.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should get a valid connection', () => {
      const connection = db.getConnection();
      expect(connection).toBeDefined();
    });

    it('should get a pooled connection', () => {
      const connection = db.getPooledConnection();
      expect(connection).toBeDefined();
    });
  });

  describe('Database Operations', () => {
    it('should execute run operations', async () => {
      const result = await db.run(
        'INSERT INTO players (id, name, is_ai) VALUES (?, ?, ?)',
        ['test-id', 'Test Player', 0]
      );
      expect(result.lastID).toBeDefined();
      expect(result.changes).toBe(1);
    });

    it('should execute get operations', async () => {
      await db.run('INSERT INTO players (id, name, is_ai) VALUES (?, ?, ?)', [
        'test-id',
        'Test Player',
        0,
      ]);

      const player = await db.get('SELECT * FROM players WHERE id = ?', [
        'test-id',
      ]);
      expect(player).toBeDefined();
      expect(player.name).toBe('Test Player');
    });

    it('should execute all operations', async () => {
      await db.run('INSERT INTO players (id, name, is_ai) VALUES (?, ?, ?)', [
        'test-id-1',
        'Test Player 1',
        0,
      ]);
      await db.run('INSERT INTO players (id, name, is_ai) VALUES (?, ?, ?)', [
        'test-id-2',
        'Test Player 2',
        1,
      ]);

      const players = await db.all('SELECT * FROM players');
      expect(players).toHaveLength(2);
    });
  });

  describe('Transaction Management', () => {
    it('should handle successful transactions', async () => {
      await db.beginTransaction();
      await db.run('INSERT INTO players (id, name, is_ai) VALUES (?, ?, ?)', [
        'test-id',
        'Test Player',
        0,
      ]);
      await db.commit();

      const player = await db.get('SELECT * FROM players WHERE id = ?', [
        'test-id',
      ]);
      expect(player).toBeDefined();
    });

    it('should handle transaction rollback', async () => {
      await db.beginTransaction();
      await db.run('INSERT INTO players (id, name, is_ai) VALUES (?, ?, ?)', [
        'test-id',
        'Test Player',
        0,
      ]);
      await db.rollback();

      const player = await db.get('SELECT * FROM players WHERE id = ?', [
        'test-id',
      ]);
      expect(player).toBeUndefined();
    });
  });

  describe('Database Reset', () => {
    it('should reset database successfully', async () => {
      await db.run('INSERT INTO players (id, name, is_ai) VALUES (?, ?, ?)', [
        'test-id',
        'Test Player',
        0,
      ]);

      let players = await db.all('SELECT * FROM players');
      expect(players).toHaveLength(1);

      await db.reset();

      players = await db.all('SELECT * FROM players');
      expect(players).toHaveLength(0);
    });
  });
});
