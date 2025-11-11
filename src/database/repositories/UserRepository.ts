// User repository implementation

import { BaseRepository } from './BaseRepository';
import { IUserRepository, IDatabaseAdapter } from '../core/interfaces';
import { User, UserStats, UserPreferences } from '../core/types';
import { ValidationError, NotFoundError } from '../core/errors';
import { getSecurityService } from '../../services/SecurityService';

export class UserRepository extends BaseRepository<User> implements IUserRepository {
  private securityService = getSecurityService();

  constructor(adapter: IDatabaseAdapter) {
    super(adapter, 'users');
  }

  protected getIdField(): string {
    return 'id';
  }

  protected mapRowToEntity(row: any): User {
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      email: row.email,
      isGuest: Boolean(row.is_guest),
      avatar: row.avatar,
      status: row.status || 'active',
      lastActive: new Date(row.last_active),
      emailVerified: Boolean(row.email_verified),
      loginAttempts: row.login_attempts || 0,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      preferences: this.parseJsonField(row.preferences, this.getDefaultPreferences()),
      stats: this.parseJsonField(row.stats, this.getDefaultStats()),
      friends: this.parseJsonField(row.friends, []),
      achievements: this.parseJsonField(row.achievements, []),
      trustScore: row.trust_score || 50,
      totalGames: row.total_games || 0,
      silentGames: row.silent_games || 0,
      silenceRatio: row.silence_ratio || 0
    };
  }

  protected mapEntityToRow(entity: Partial<User>): any {
    const row: any = {};

    if (entity.id !== undefined) row.id = entity.id;
    if (entity.username !== undefined) row.username = entity.username;
    if (entity.displayName !== undefined) row.display_name = entity.displayName;
    if (entity.passwordHash !== undefined) row.password_hash = entity.passwordHash;
    if (entity.email !== undefined) row.email = entity.email;
    if (entity.isGuest !== undefined) row.is_guest = entity.isGuest ? 1 : 0;
    if (entity.avatar !== undefined) row.avatar = entity.avatar;
    if (entity.status !== undefined) row.status = entity.status;
    if (entity.lastActive !== undefined) row.last_active = entity.lastActive.toISOString();
    if (entity.emailVerified !== undefined) row.email_verified = entity.emailVerified ? 1 : 0;
    if (entity.loginAttempts !== undefined) row.login_attempts = entity.loginAttempts;
    if (entity.lockedUntil !== undefined) row.locked_until = entity.lockedUntil?.toISOString();
    if (entity.preferences !== undefined) row.preferences = JSON.stringify(entity.preferences);
    if (entity.stats !== undefined) row.stats = JSON.stringify(entity.stats);
    if (entity.friends !== undefined) row.friends = JSON.stringify(entity.friends);
    if (entity.achievements !== undefined) row.achievements = JSON.stringify(entity.achievements);

    return row;
  }

  protected validateEntity(entity: Partial<User>): void {
    if (entity.username !== undefined) {
      if (!this.securityService.validateUsername(entity.username)) {
        throw new ValidationError('Invalid username format');
      }
    }

    if (entity.email !== undefined && entity.email) {
      if (!this.securityService.validateEmail(entity.email)) {
        throw new ValidationError('Invalid email format');
      }
    }

    if (entity.displayName !== undefined) {
      if (!entity.displayName || entity.displayName.trim().length === 0) {
        throw new ValidationError('Display name is required');
      }
      if (entity.displayName.length > 50) {
        throw new ValidationError('Display name must be 50 characters or less');
      }
    }

    if (entity.status !== undefined) {
      const validStatuses = ['active', 'inactive', 'banned', 'suspended'];
      if (!validStatuses.includes(entity.status)) {
        throw new ValidationError('Invalid user status');
      }
    }

    if (entity.avatar !== undefined) {
      if (entity.avatar.length > 10) {
        throw new ValidationError('Avatar must be 10 characters or less');
      }
    }
  }

  // IUserRepository specific methods
  async findByUsername(username: string): Promise<User | null> {
    if (!username) {
      return null;
    }

    try {
      const sql = `SELECT * FROM ${this.tableName} WHERE username = ? LIMIT 1`;
      const rows = await this.adapter.query(sql, [username.toLowerCase()]);
      
      if (rows.length === 0) {
        return null;
      }
      
      return this.mapRowToEntity(rows[0]);
    } catch (error) {
      throw new Error(`Failed to find user by username: ${error.message}`);
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    if (!email) {
      return null;
    }

    const users = await this.findBy({ email: email.toLowerCase() });
    return users.length > 0 ? users[0] : null;
  }

  async updateLastActive(userId: string): Promise<void> {
    await this.update(userId, { lastActive: new Date() });
  }

  async findActiveUsers(limit: number = 50): Promise<User[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    return this.findBy({
      status: 'active',
      last_active: {
        operator: '>',
        value: oneHourAgo.toISOString()
      },
      limit,
      orderBy: 'last_active',
      orderDirection: 'DESC'
    });
  }

  async updateStats(userId: string, stats: Partial<UserStats>): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', { userId });
    }

    const updatedStats = { ...user.stats, ...stats };
    
    // Recalculate derived stats
    if (updatedStats.totalGames > 0) {
      updatedStats.winRate = (updatedStats.wins / updatedStats.totalGames) * 100;
      updatedStats.betrayalRate = (updatedStats.betrayals / updatedStats.totalGames) * 100;
      updatedStats.averageScore = updatedStats.totalScore / updatedStats.totalGames;
    }

    await this.update(userId, { stats: updatedStats });
  }

  // User management methods
  async createUser(userData: {
    username?: string;
    displayName: string;
    email?: string;
    passwordHash?: string;
    isGuest?: boolean;
    avatar?: string;
  }): Promise<User> {
    const user: Omit<User, 'id' | 'createdAt' | 'updatedAt'> = {
      username: userData.username || '',
      displayName: userData.displayName,
      email: userData.email,
      passwordHash: userData.passwordHash,
      isGuest: userData.isGuest || false,
      avatar: userData.avatar || '🎮',
      status: 'active',
      lastActive: new Date(),
      emailVerified: false,
      loginAttempts: 0,
      preferences: this.getDefaultPreferences(),
      stats: this.getDefaultStats(),
      friends: [],
      achievements: [],
      trustScore: 50,
      totalGames: 0,
      silentGames: 0,
      silenceRatio: 0
    };

    return this.create(user);
  }

  async updatePassword(userId: string, newPasswordHash: string): Promise<void> {
    await this.update(userId, { 
      passwordHash: newPasswordHash,
      loginAttempts: 0,
      lockedUntil: undefined
    });
  }

  async incrementLoginAttempts(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', { userId });
    }

    const loginAttempts = user.loginAttempts + 1;
    const updates: Partial<User> = { loginAttempts };

    // Lock account if too many attempts
    const maxAttempts = 5; // This should come from config
    if (loginAttempts >= maxAttempts) {
      updates.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }

    await this.update(userId, updates);
  }

  async resetLoginAttempts(userId: string): Promise<void> {
    await this.update(userId, { 
      loginAttempts: 0,
      lockedUntil: undefined
    });
  }

  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) {
      return false;
    }

    return user.lockedUntil ? user.lockedUntil > new Date() : false;
  }

  async addFriend(userId: string, friendId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', { userId });
    }

    if (!user.friends.includes(friendId)) {
      const updatedFriends = [...user.friends, friendId];
      await this.update(userId, { friends: updatedFriends });
    }
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', { userId });
    }

    const updatedFriends = user.friends.filter(id => id !== friendId);
    await this.update(userId, { friends: updatedFriends });
  }

  async addAchievement(userId: string, achievementId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', { userId });
    }

    if (!user.achievements.includes(achievementId)) {
      const updatedAchievements = [...user.achievements, achievementId];
      await this.update(userId, { achievements: updatedAchievements });
    }
  }

  async updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', { userId });
    }

    const updatedPreferences = { ...user.preferences, ...preferences };
    await this.update(userId, { preferences: updatedPreferences });
  }

  async findUsersByStatus(status: User['status'], limit: number = 100): Promise<User[]> {
    return this.findBy({
      status,
      limit,
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
  }

  async searchUsers(query: string, limit: number = 20): Promise<User[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)
        AND status = 'active'
        AND is_guest = 0
      ORDER BY 
        CASE 
          WHEN LOWER(username) = ? THEN 1
          WHEN LOWER(display_name) = ? THEN 2
          WHEN LOWER(username) LIKE ? THEN 3
          WHEN LOWER(display_name) LIKE ? THEN 4
          ELSE 5
        END,
        username
      LIMIT ?
    `;

    const params = [
      searchTerm, searchTerm,
      query.toLowerCase(), query.toLowerCase(),
      `${query.toLowerCase()}%`, `${query.toLowerCase()}%`,
      limit
    ];

    const rows = await this.adapter.query<any>(sql, params);
    return rows.map(row => this.mapRowToEntity(row));
  }

  async getLeaderboard(limit: number = 50, orderBy: 'totalScore' | 'winRate' | 'trustScore' = 'totalScore'): Promise<User[]> {
    const orderField = this.getStatsOrderField(orderBy);
    
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'active' AND is_guest = 0
      ORDER BY JSON_EXTRACT(stats, '$.${orderField}') DESC
      LIMIT ?
    `;

    const rows = await this.adapter.query<any>(sql, [limit]);
    return rows.map(row => this.mapRowToEntity(row));
  }

  // Utility methods
  private parseJsonField<T>(field: string | null, defaultValue: T): T {
    if (!field) {
      return defaultValue;
    }

    try {
      return JSON.parse(field);
    } catch {
      return defaultValue;
    }
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      matchmakingRegion: 'global',
      trustScoreMatching: true,
      allowFriendRequests: true,
      language: 'en',
      theme: 'dark',
      notifications: {
        email: true,
        push: true,
        gameInvites: true,
        friendRequests: true
      }
    };
  }

  private getDefaultStats(): UserStats {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      cooperations: 0,
      betrayals: 0,
      totalScore: 0,
      winRate: 0,
      trustScore: 50,
      betrayalRate: 0,
      averageScore: 0,
      longestWinStreak: 0,
      currentWinStreak: 0,
      gamesThisWeek: 0,
      gamesThisMonth: 0,
      rank: 0,
      experience: 0,
      level: 1
    };
  }

  private getStatsOrderField(orderBy: string): string {
    switch (orderBy) {
      case 'totalScore': return 'totalScore';
      case 'winRate': return 'winRate';
      case 'trustScore': return 'trustScore';
      default: return 'totalScore';
    }
  }
}