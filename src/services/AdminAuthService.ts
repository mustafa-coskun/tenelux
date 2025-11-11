export interface AdminUser {
  id: string;
  username: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: AdminPermission[];
  lastLogin: Date;
  isActive: boolean;
}

export interface AdminSession {
  userId: string;
  token: string;
  expiresAt: Date;
  permissions: AdminPermission[];
  role: 'super_admin' | 'admin' | 'moderator';
}

export type AdminPermission =
  | 'view_debug_panel'
  | 'view_performance_dashboard'
  | 'manage_users'
  | 'manage_tournaments'
  | 'view_system_logs'
  | 'clear_system_data'
  | 'export_data'
  | 'simulate_errors'
  | 'manage_storage';

/**
 * Admin Authentication Service
 * Handles authentication and authorization for admin features
 */
class AdminAuthService {
  private currentSession: AdminSession | null = null;
  private readonly STORAGE_KEY = 'tenebris_admin_session';
  private readonly SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 hours

  // Server-based authentication
  async authenticateAdmin(username: string, password: string): Promise<AdminSession | null> {
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      if (data.success) {
        const session: AdminSession = {
          userId: data.user.id,
          token: data.token,
          expiresAt: new Date(data.expiresAt),
          permissions: data.user.permissions,
          role: data.user.role
        };
        
        this.currentSession = session;
        this.saveSessionToStorage();
        return session;
      }
      
      return null;
    } catch (error) {
      console.error('Admin authentication error:', error);
      return null;
    }
  }

  // Legacy method - now uses server authentication
  authenticate(username: string, password: string): AdminSession | null {
    // This method is now async, but keeping for compatibility
    console.warn('Use authenticateAdmin() instead of authenticate()');
    return null;
  }

  // Predefined admin users (kept for reference, now handled by server)
  private readonly ADMIN_USERS: Record<string, { password: string; user: AdminUser }> = {
    'admin': {
      password: 'TenebrisAdmin2024!', // In production, this would be hashed
      user: {
        id: 'admin-001',
        username: 'admin',
        role: 'super_admin',
        permissions: [
          'view_debug_panel',
          'view_performance_dashboard',
          'manage_users',
          'manage_tournaments',
          'view_system_logs',
          'clear_system_data',
          'export_data',
          'simulate_errors',
          'manage_storage'
        ],
        lastLogin: new Date(),
        isActive: true
      }
    },
    'moderator': {
      password: 'TenebrisMod2024!',
      user: {
        id: 'mod-001',
        username: 'moderator',
        role: 'moderator',
        permissions: [
          'view_debug_panel',
          'view_performance_dashboard',
          'view_system_logs',
          'export_data'
        ],
        lastLogin: new Date(),
        isActive: true
      }
    }
  };

  constructor() {
    this.loadSessionFromStorage();
    this.setupSessionCleanup();
  }

  /**
   * Authenticate admin user (server-based)
   */
  async login(username: string, password: string): Promise<{
    success: boolean;
    session?: AdminSession;
    error?: string;
  }> {
    try {
      const session = await this.authenticateAdmin(username, password);
      
      if (session) {
        return {
          success: true,
          session: session
        };
      } else {
        return {
          success: false,
          error: 'Geçersiz admin bilgileri'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Giriş işlemi sırasında hata oluştu'
      };
    }
  }

  /**
   * Legacy login method (kept for compatibility)
   */
  async loginLegacy(username: string, password: string): Promise<{
    success: boolean;
    session?: AdminSession;
    error?: string;
  }> {
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));

      const adminData = this.ADMIN_USERS[username.toLowerCase()];

      if (!adminData) {
        return {
          success: false,
          error: 'Geçersiz kullanıcı adı veya şifre'
        };
      }

      if (!adminData.user.isActive) {
        return {
          success: false,
          error: 'Hesap devre dışı bırakılmış'
        };
      }

      // In production, use proper password hashing (bcrypt, etc.)
      if (adminData.password !== password) {
        return {
          success: false,
          error: 'Geçersiz kullanıcı adı veya şifre'
        };
      }

      // Create session
      const session: AdminSession = {
        userId: adminData.user.id,
        token: this.generateToken(),
        expiresAt: new Date(Date.now() + this.SESSION_DURATION),
        permissions: adminData.user.permissions,
        role: adminData.user.role
      };

      // Update last login
      adminData.user.lastLogin = new Date();

      this.currentSession = session;
      this.saveSessionToStorage();

      console.log('🔐 Admin login successful:', username);

      return {
        success: true,
        session
      };

    } catch (error) {
      console.error('Admin login error:', error);
      return {
        success: false,
        error: 'Giriş işlemi sırasında hata oluştu'
      };
    }
  }

  /**
   * Logout admin user
   */
  logout(): void {
    if (this.currentSession) {
      console.log('🔐 Admin logout:', this.currentSession.userId);
    }

    this.currentSession = null;
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    if (!this.currentSession) {
      return false;
    }

    // Check if session is expired
    if (new Date() > this.currentSession.expiresAt) {
      this.logout();
      return false;
    }

    return true;
  }

  /**
   * Get current admin session
   */
  getCurrentSession(): AdminSession | null {
    return this.isAuthenticated() ? this.currentSession : null;
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission: AdminPermission): boolean {
    const session = this.getCurrentSession();
    return session ? session.permissions.includes(permission) : false;
  }

  /**
   * Check if user has any of the specified permissions
   */
  hasAnyPermission(permissions: AdminPermission[]): boolean {
    return permissions.some(permission => this.hasPermission(permission));
  }

  /**
   * Check if user has specific role
   */
  hasRole(role: 'super_admin' | 'admin' | 'moderator'): boolean {
    const session = this.getCurrentSession();
    if (!session) return false;

    // Super admin has all roles
    if (session.role === 'super_admin') return true;

    // Admin has admin and moderator roles
    if (session.role === 'admin' && (role === 'admin' || role === 'moderator')) return true;

    // Exact role match
    return session.role === role;
  }

  /**
   * Get user info for current session
   */
  getCurrentUser(): AdminUser | null {
    const session = this.getCurrentSession();
    if (!session) return null;

    // Find user data
    for (const adminData of Object.values(this.ADMIN_USERS)) {
      if (adminData.user.id === session.userId) {
        return adminData.user;
      }
    }

    return null;
  }

  /**
   * Extend current session
   */
  extendSession(): boolean {
    if (!this.isAuthenticated() || !this.currentSession) {
      return false;
    }

    this.currentSession.expiresAt = new Date(Date.now() + this.SESSION_DURATION);
    this.saveSessionToStorage();

    return true;
  }

  /**
   * Generate secure token
   */
  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `admin_${Date.now()}_${token}`;
  }

  /**
   * Save session to localStorage
   */
  private saveSessionToStorage(): void {
    if (this.currentSession) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentSession));
      } catch (error) {
        console.error('Failed to save admin session:', error);
      }
    }
  }

  /**
   * Load session from localStorage
   */
  private loadSessionFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored);

        // Convert date string back to Date object
        session.expiresAt = new Date(session.expiresAt);

        // Check if session is still valid
        if (new Date() <= session.expiresAt) {
          this.currentSession = session;
          console.log('🔐 Admin session restored');
        } else {
          localStorage.removeItem(this.STORAGE_KEY);
          console.log('🔐 Admin session expired, cleared');
        }
      }
    } catch (error) {
      console.error('Failed to load admin session:', error);
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Setup automatic session cleanup
   */
  private setupSessionCleanup(): void {
    // Check session validity every minute
    setInterval(() => {
      if (this.currentSession && new Date() > this.currentSession.expiresAt) {
        console.log('🔐 Admin session expired, logging out');
        this.logout();
      }
    }, 60 * 1000);
  }

  /**
   * Get session time remaining in minutes
   */
  getSessionTimeRemaining(): number {
    if (!this.currentSession) return 0;

    const remaining = this.currentSession.expiresAt.getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / (60 * 1000)));
  }

  /**
   * Check if session is about to expire (less than 30 minutes)
   */
  isSessionExpiringSoon(): boolean {
    return this.getSessionTimeRemaining() < 30;
  }
}

// Singleton instance
let adminAuthServiceInstance: AdminAuthService | null = null;

export function getAdminAuthService(): AdminAuthService {
  if (!adminAuthServiceInstance) {
    adminAuthServiceInstance = new AdminAuthService();
  }
  return adminAuthServiceInstance;
}

export default AdminAuthService;