// Session repository implementation

import { BaseRepository } from './BaseRepository';
import { ISessionRepository, IDatabaseAdapter } from '../core/interfaces';
import { Session } from '../core/types';
import { ValidationError, NotFoundError } from '../core/errors';

export class SessionRepository extends BaseRepository<Session> implements ISessionRepository {
  constructor(adapter: IDatabaseAdapter) {
    super(adapter, 'user_sessions');
  }

  protected getIdField(): string {
    return 'id';
  }

  protected mapRowToEntity(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: new Date(row.expires_at),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      isActive: Boolean(row.is_active),
      lastUsed: new Date(row.last_used),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deviceInfo: this.parseJsonField(row.device_info, undefined)
    };
  }

  protected mapEntityToRow(entity: Partial<Session>): any {
    const row: any = {};

    if (entity.id !== undefined) row.id = entity.id;
    if (entity.userId !== undefined) row.user_id = entity.userId;
    
    console.log('SessionRepository.mapEntityToRow - entity.userId:', entity.userId, 'row.user_id:', row.user_id);
    if (entity.token !== undefined) row.token = entity.token;
    if (entity.expiresAt !== undefined) row.expires_at = entity.expiresAt.toISOString();
    if (entity.ipAddress !== undefined) row.ip_address = entity.ipAddress;
    if (entity.userAgent !== undefined) row.user_agent = entity.userAgent;
    if (entity.isActive !== undefined) row.is_active = entity.isActive ? 1 : 0;
    if (entity.lastUsed !== undefined) row.last_used = entity.lastUsed.toISOString();
    if (entity.deviceInfo !== undefined) row.device_info = JSON.stringify(entity.deviceInfo);

    return row;
  }

  protected validateEntity(entity: Partial<Session>): void {
    if (entity.userId !== undefined && !entity.userId) {
      throw new ValidationError('User ID is required');
    }

    if (entity.token !== undefined && !entity.token) {
      throw new ValidationError('Session token is required');
    }

    if (entity.expiresAt !== undefined) {
      if (!(entity.expiresAt instanceof Date)) {
        throw new ValidationError('Expires at must be a valid date');
      }
      if (entity.expiresAt <= new Date()) {
        throw new ValidationError('Session expiration must be in the future');
      }
    }

    if (entity.ipAddress !== undefined && entity.ipAddress) {
      if (!this.isValidIpAddress(entity.ipAddress)) {
        throw new ValidationError('Invalid IP address format');
      }
    }

    if (entity.userAgent !== undefined && entity.userAgent) {
      if (entity.userAgent.length > 500) {
        throw new ValidationError('User agent must be 500 characters or less');
      }
    }
  }

  // ISessionRepository specific methods
  async findByToken(token: string): Promise<Session | null> {
    if (!token) {
      return null;
    }

    const sessions = await this.findBy({
      token,
      is_active: 1,
      expires_at: {
        operator: '>',
        value: new Date().toISOString()
      }
    });

    return sessions.length > 0 ? sessions[0] : null;
  }

  async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.deleteMany({
      expires_at: {
        operator: '<=',
        value: now
      }
    });

    this.logger.debug(`Cleaned up ${result} expired sessions`);
    return result;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    if (!userId) {
      return [];
    }

    return this.findBy({
      user_id: userId,
      is_active: 1,
      expires_at: {
        operator: '>',
        value: new Date().toISOString()
      },
      orderBy: 'last_used',
      orderDirection: 'DESC'
    });
  }

  async invalidateUserSessions(userId: string): Promise<number> {
    if (!userId) {
      return 0;
    }

    const result = await this.updateMany(
      { user_id: userId, is_active: 1 },
      { isActive: false }
    );

    this.logger.debug(`Invalidated ${result} sessions for user ${userId}`);
    return result;
  }

  async deleteByUserId(userId: string): Promise<number> {
    if (!userId) {
      return 0;
    }

    const result = await this.deleteMany({
      user_id: userId
    });

    this.logger.debug(`Deleted ${result} sessions for user ${userId}`);
    return result;
  }

  async extendSession(sessionId: string, expiresAt: Date): Promise<void> {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found', { sessionId });
    }

    if (!session.isActive) {
      throw new ValidationError('Cannot extend inactive session');
    }

    await this.update(sessionId, {
      expiresAt,
      lastUsed: new Date()
    });
  }

  // Session management methods
  async createSession(sessionData: {
    userId: number;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: Session['deviceInfo'];
  }): Promise<Session> {
    console.log('SessionRepository.createSession called with:', sessionData);
    const session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'> = {
      userId: sessionData.userId,
      token: sessionData.token,
      expiresAt: sessionData.expiresAt,
      ipAddress: sessionData.ipAddress,
      userAgent: sessionData.userAgent,
      isActive: true,
      lastUsed: new Date(),
      deviceInfo: sessionData.deviceInfo
    };

    return this.create(session);
  }

  async updateLastUsed(sessionId: string): Promise<void> {
    await this.update(sessionId, { lastUsed: new Date() });
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.update(sessionId, { isActive: false });
  }

  async invalidateSessionByToken(token: string): Promise<void> {
    const session = await this.findByToken(token);
    if (session) {
      await this.invalidateSession(session.id);
    }
  }

  async findActiveSessions(limit: number = 100): Promise<Session[]> {
    return this.findBy({
      is_active: 1,
      expires_at: {
        operator: '>',
        value: new Date().toISOString()
      },
      limit,
      orderBy: 'last_used',
      orderDirection: 'DESC'
    });
  }

  async findSessionsByIpAddress(ipAddress: string, limit: number = 50): Promise<Session[]> {
    if (!ipAddress) {
      return [];
    }

    return this.findBy({
      ip_address: ipAddress,
      is_active: 1,
      expires_at: {
        operator: '>',
        value: new Date().toISOString()
      },
      limit,
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
  }

  async countActiveSessionsForUser(userId: string): Promise<number> {
    return this.count({
      user_id: userId,
      is_active: 1,
      expires_at: {
        operator: '>',
        value: new Date().toISOString()
      }
    });
  }

  async findExpiredSessions(limit: number = 1000): Promise<Session[]> {
    return this.findBy({
      expires_at: {
        operator: '<=',
        value: new Date().toISOString()
      },
      limit,
      orderBy: 'expires_at',
      orderDirection: 'ASC'
    });
  }

  async cleanupInactiveSessions(inactiveThresholdHours: number = 24): Promise<number> {
    const threshold = new Date(Date.now() - inactiveThresholdHours * 60 * 60 * 1000);

    const result = await this.deleteMany({
      is_active: 0,
      updated_at: {
        operator: '<',
        value: threshold.toISOString()
      }
    });

    this.logger.debug(`Cleaned up ${result} inactive sessions older than ${inactiveThresholdHours} hours`);
    return result;
  }

  async getSessionStatistics(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    uniqueUsers: number;
    uniqueIpAddresses: number;
    averageSessionDuration: number;
  }> {
    const now = new Date().toISOString();

    const [
      totalSessions,
      activeSessions,
      expiredSessions,
      uniqueUsersResult,
      uniqueIpResult,
      durationResult
    ] = await Promise.all([
      this.count(),
      this.count({
        is_active: 1,
        expires_at: { operator: '>', value: now }
      }),
      this.count({
        expires_at: { operator: '<=', value: now }
      }),
      this.adapter.query<{ count: number }>(`
        SELECT COUNT(DISTINCT user_id) as count 
        FROM ${this.tableName} 
        WHERE is_active = 1 AND expires_at > ?
      `, [now]),
      this.adapter.query<{ count: number }>(`
        SELECT COUNT(DISTINCT ip_address) as count 
        FROM ${this.tableName} 
        WHERE is_active = 1 AND expires_at > ? AND ip_address IS NOT NULL
      `, [now]),
      this.adapter.query<{ avg_duration: number }>(`
        SELECT AVG(
          CASE 
            WHEN is_active = 1 THEN (julianday('now') - julianday(created_at)) * 24 * 60 * 60 * 1000
            ELSE (julianday(updated_at) - julianday(created_at)) * 24 * 60 * 60 * 1000
          END
        ) as avg_duration
        FROM ${this.tableName}
        WHERE created_at > datetime('now', '-30 days')
      `)
    ]);

    return {
      totalSessions,
      activeSessions,
      expiredSessions,
      uniqueUsers: uniqueUsersResult[0]?.count || 0,
      uniqueIpAddresses: uniqueIpResult[0]?.count || 0,
      averageSessionDuration: durationResult[0]?.avg_duration || 0
    };
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

  private isValidIpAddress(ip: string): boolean {
    // IPv4 regex
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    // IPv6 regex (simplified)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  // Batch operations for session management
  async createMultipleSessions(sessionsData: Array<{
    userId: number;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: Session['deviceInfo'];
  }>): Promise<Session[]> {
    const sessions: Array<Omit<Session, 'id' | 'createdAt' | 'updatedAt'>> = sessionsData.map(data => ({
      userId: data.userId,
      token: data.token,
      expiresAt: data.expiresAt,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      isActive: true,
      lastUsed: new Date(),
      deviceInfo: data.deviceInfo
    }));

    return this.createMany(sessions);
  }

  async invalidateMultipleSessions(sessionIds: string[]): Promise<number> {
    if (sessionIds.length === 0) {
      return 0;
    }

    return this.updateMany(
      { id: sessionIds },
      { isActive: false }
    );
  }
}