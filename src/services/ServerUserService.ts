import { User, GameStats, GameSession } from './UserService';

export interface AuthResponse {
  success: boolean;
  user?: User;
  sessionToken?: string;
  error?: string;
}

export interface ValidationResponse {
  valid: boolean;
  error?: string;
  suggestions?: string[];
}

class ServerUserService {
  private currentUser: User | null = null;
  private sessionToken: string | null = null;
  private readonly API_BASE = '/api';

  constructor() {
    this.loadSessionFromStorage();
  }

  private async apiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.API_BASE}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  async register(username: string, displayName: string, password: string): Promise<AuthResponse> {
    try {
      const response = await this.apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, displayName, password })
      });

      if (response.success) {
        this.currentUser = response.user;
        this.sessionToken = response.sessionToken;
        this.saveSessionToStorage();
      }

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      };
    }
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    try {
      const response = await this.apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (response.success) {
        this.currentUser = response.user;
        this.sessionToken = response.sessionToken;
        this.saveSessionToStorage();
      }

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed'
      };
    }
  }

  async loginAsGuest(displayName?: string): Promise<AuthResponse> {
    try {
      const response = await this.apiCall('/auth/guest', {
        method: 'POST',
        body: JSON.stringify({ displayName })
      });

      if (response.success) {
        this.currentUser = response.user;
        this.sessionToken = response.sessionToken;
        this.saveSessionToStorage();
      }

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Guest login failed'
      };
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.sessionToken) {
        await this.apiCall('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ sessionToken: this.sessionToken })
        });
      }
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      this.currentUser = null;
      this.sessionToken = null;
      this.clearSessionFromStorage();
    }
  }

  async validateUsername(username: string): Promise<ValidationResponse> {
    try {
      const response = await fetch(`${this.API_BASE}/auth/validate-username/${encodeURIComponent(username)}`);
      return await response.json();
    } catch (error) {
      return {
        valid: false,
        error: 'Validation failed'
      };
    }
  }

  async updateProfile(updates: { displayName?: string; avatar?: string }): Promise<boolean> {
    try {
      const response = await this.apiCall('/user/profile', {
        method: 'PUT',
        body: JSON.stringify(updates)
      });

      if (response.success) {
        this.currentUser = response.user;
        this.saveSessionToStorage();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Profile update failed:', error);
      return false;
    }
  }

  async refreshProfile(): Promise<boolean> {
    try {
      if (!this.sessionToken) return false;

      const response = await this.apiCall('/user/profile');
      this.currentUser = response.user;
      this.saveSessionToStorage();
      return true;
    } catch (error) {
      console.error('Profile refresh failed:', error);
      // Session might be invalid, clear it
      this.currentUser = null;
      this.sessionToken = null;
      this.clearSessionFromStorage();
      return false;
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  isLoggedIn(): boolean {
    return this.currentUser !== null && this.sessionToken !== null;
  }

  getSessionToken(): string | null {
    return this.sessionToken;
  }

  // Set session token only (for guest sessions)
  setSessionToken(sessionToken: string | null): void {
    this.sessionToken = sessionToken;
    if (sessionToken && this.currentUser) {
      this.saveSessionToStorage();
    }
  }

  // Clear session token
  clearSessionToken(): void {
    this.sessionToken = null;
    this.clearSessionFromStorage();
  }

  // Set current user and session token (for external login)
  async setCurrentUser(user: User, sessionToken: string): Promise<void> {
    this.currentUser = user;
    this.sessionToken = sessionToken;
    this.saveSessionToStorage();
  }

  // Local storage management
  private saveSessionToStorage(): void {
    if (this.currentUser && this.sessionToken) {
      const sessionData = {
        user: this.currentUser,
        sessionToken: this.sessionToken,
        timestamp: Date.now()
      };
      localStorage.setItem('tenebris_server_session', JSON.stringify(sessionData));
    }
  }

  private loadSessionFromStorage(): void {
    try {
      const stored = localStorage.getItem('tenebris_server_session');
      if (stored) {
        const sessionData = JSON.parse(stored);
        
        // Check if session is not too old (24 hours)
        const maxAge = 24 * 60 * 60 * 1000;
        const age = Date.now() - sessionData.timestamp;
        
        if (age < maxAge) {
          this.currentUser = sessionData.user;
          this.sessionToken = sessionData.sessionToken;
          
          // TODO: Refresh profile in background to validate session
          // this.refreshProfile().catch(() => {
          //   // Session invalid, will be cleared by refreshProfile
          // });
        } else {
          this.clearSessionFromStorage();
        }
      }
    } catch (error) {
      console.warn('Failed to load session from storage:', error);
      this.clearSessionFromStorage();
    }
  }

  private clearSessionFromStorage(): void {
    localStorage.removeItem('tenebris_server_session');
  }

  // Legacy compatibility methods
  createUser(username: string, displayName: string, isGuest: boolean = false): User {
    throw new Error('Use register() or loginAsGuest() instead');
  }

  updateUser(updates: Partial<User>): User | null {
    throw new Error('Use updateProfile() instead');
  }

  updateDisplayName(newDisplayName: string): boolean {
    // This will be async in the new system, but for compatibility we'll make it sync
    this.updateProfile({ displayName: newDisplayName });
    return true;
  }

  updateAvatar(avatarEmoji: string): boolean {
    // This will be async in the new system, but for compatibility we'll make it sync
    this.updateProfile({ avatar: avatarEmoji });
    return true;
  }

  // Session management (simplified for now)
  createSession(state: GameSession['currentState'], data?: any): GameSession {
    if (!this.currentUser) throw new Error('No user logged in');
    
    // For now, return a mock session - this should be handled by server
    return {
      userId: this.currentUser.id,
      currentState: state,
      lastUpdated: new Date(),
      ...data
    };
  }

  getCurrentSession(): GameSession | null {
    // This should be fetched from server
    return null;
  }

  clearSession(): void {
    // This should notify server
  }

  // Game stats (these should be handled by server)
  updateGameStats(gameResult: {
    won: boolean;
    score: number;
    cooperated: boolean;
    betrayed: boolean;
  }): void {
    // This should send to server
    console.warn('updateGameStats should be implemented on server side');
  }

  // Other legacy methods
  getOrCreateUser(name?: string): User {
    if (this.currentUser) return this.currentUser;
    throw new Error('Use loginAsGuest() instead');
  }

  explicitLogout(): void {
    this.logout();
  }

  isIntentionalDisconnection(): boolean {
    const intentionalFlag = sessionStorage.getItem('tenebris_intentional_leave');
    return intentionalFlag === 'true';
  }

  markIntentionalLeave(): void {
    sessionStorage.setItem('tenebris_intentional_leave', 'true');
  }

  clearIntentionalLeave(): void {
    sessionStorage.removeItem('tenebris_intentional_leave');
  }

  leaveLobby(): void {
    // This should notify server
  }

  hasActiveSession(): boolean {
    return this.isLoggedIn();
  }

  sendFriendRequest(targetUserId: string): boolean {
    // This should be implemented on server
    return false;
  }

  getTrustScoreRange(): { min: number; max: number } {
    if (!this.currentUser) return { min: 0, max: 100 };
    const trustScore = this.currentUser.stats.trustScore;
    const range = 15;
    return {
      min: Math.max(0, trustScore - range),
      max: Math.min(100, trustScore + range)
    };
  }
}

let serverUserServiceInstance: ServerUserService | null = null;

export function getServerUserService(): ServerUserService {
  if (!serverUserServiceInstance) {
    serverUserServiceInstance = new ServerUserService();
  }
  return serverUserServiceInstance;
}

export default ServerUserService;