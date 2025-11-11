import { getStorageOptimizer } from './StorageOptimizer';
import { getUsernameService } from './UsernameService';
import { getAvatarService } from './AvatarService';

export interface GameStats {
  totalGames: number;
  wins: number;
  losses: number;
  cooperations: number;
  betrayals: number;
  totalScore: number;
  winRate: number;
  trustScore: number; // 0-100
  betrayalRate: number;
  averageScore: number;
  longestWinStreak: number;
  currentWinStreak: number;
  gamesThisWeek: number;
  gamesThisMonth: number;
}

export interface User {
  id: string;
  username: string; // Eşsiz kullanıcı adı (değiştirilemez)
  displayName: string; // Görünen ad (değiştirilebilir)
  email?: string;
  avatar: string; // Avatar emoji veya URL
  createdAt: Date;
  lastActive: Date;
  isGuest: boolean;
  stats: GameStats;
  friends: string[];
  friendRequests: {
    sent: string[];
    received: string[];
  };
  achievements: string[];
  preferences: {
    matchmakingRegion: 'global' | 'local';
    trustScoreMatching: boolean;
    allowFriendRequests: boolean;
  };
}

export interface GameSession {
  userId: string;
  currentState: 'menu' | 'lobby' | 'tournament' | 'spectator' | 'in_game';
  lobbyId?: string;
  tournamentId?: string;
  matchId?: string;
  opponent?: any;
  tournamentMatch?: boolean;
  playerData?: any;
  lastUpdated: Date;
}

class UserService {
  private currentUser: User | null = null;
  private currentSession: GameSession | null = null;
  private readonly STORAGE_KEYS = {
    USER: 'tenebris_user',
    SESSION: 'tenebris_session'
  };
  private storageOptimizer = getStorageOptimizer();

  constructor() {
    this.loadUserFromStorage();
    this.loadSessionFromStorage();
    this.storageOptimizer.autoCleanup();
  }

  createUser(username: string, displayName: string, isGuest: boolean = false, skipUsernameCheck: boolean = false): User {
    const usernameService = getUsernameService();
    const avatarService = getAvatarService();

    // Username kontrolü sadece signup için (login'de skip et)
    if (!isGuest && !skipUsernameCheck && !usernameService.reserveUsername(username)) {
      throw new Error('Bu kullanıcı adı zaten alınmış');
    }

    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      username: isGuest ? `guest_${Date.now()}` : username.trim(),
      displayName: displayName.trim() || username.trim(),
      createdAt: new Date(),
      lastActive: new Date(),
      isGuest: isGuest,
      avatar: avatarService.getRandomAvatar().emoji,
      stats: this.createDefaultStats(),
      friends: [],
      friendRequests: { sent: [], received: [] },
      achievements: [],
      preferences: {
        matchmakingRegion: 'global',
        trustScoreMatching: true,
        allowFriendRequests: true
      }
    };

    this.currentUser = user;
    this.saveUserToStorage();
    console.log('🎮 User created:', user);
    return user;
  }

  private createDefaultStats(): GameStats {
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
      gamesThisMonth: 0
    };
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  updateUser(updates: Partial<User>): User | null {
    if (!this.currentUser) return null;
    this.currentUser = { ...this.currentUser, ...updates, lastActive: new Date() };
    this.saveUserToStorage();
    return this.currentUser;
  }

  createSession(state: GameSession['currentState'], data?: any): GameSession {
    if (!this.currentUser) throw new Error('No user logged in');
    const session: GameSession = {
      userId: this.currentUser.id,
      currentState: state,
      lastUpdated: new Date(),
      ...data
    };
    this.currentSession = session;
    this.saveSessionToStorage();
    return session;
  }

  updateSession(updates: Partial<GameSession>): GameSession | null {
    if (!this.currentSession) return null;
    this.currentSession = { ...this.currentSession, ...updates, lastUpdated: new Date() };
    this.saveSessionToStorage();
    return this.currentSession;
  }

  getCurrentSession(): GameSession | null {
    return this.currentSession;
  }

  clearSession(): void {
    this.currentSession = null;
    localStorage.removeItem(this.STORAGE_KEYS.SESSION);
  }

  private saveUserToStorage(): void {
    if (this.currentUser) {
      localStorage.setItem(this.STORAGE_KEYS.USER, JSON.stringify(this.currentUser));
    }
  }

  private loadUserFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.USER);
      if (stored) {
        const user = JSON.parse(stored);
        user.createdAt = new Date(user.createdAt);
        user.lastActive = new Date(user.lastActive);
        this.currentUser = user;
      }
    } catch (error) {
      localStorage.removeItem(this.STORAGE_KEYS.USER);
    }
  }

  private saveSessionToStorage(): void {
    if (this.currentSession) {
      localStorage.setItem(this.STORAGE_KEYS.SESSION, JSON.stringify(this.currentSession));
    }
  }

  private loadSessionFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.SESSION);
      if (stored) {
        const session = JSON.parse(stored);
        session.lastUpdated = new Date(session.lastUpdated);
        const maxAge = 24 * 60 * 60 * 1000;
        const age = Date.now() - session.lastUpdated.getTime();
        if (age < maxAge) {
          this.currentSession = session;
        } else {
          localStorage.removeItem(this.STORAGE_KEYS.SESSION);
        }
      }
    } catch (error) {
      localStorage.removeItem(this.STORAGE_KEYS.SESSION);
    }
  }

  isLoggedIn(): boolean {
    return this.currentUser !== null;
  }

  hasActiveSession(): boolean {
    return this.currentSession !== null;
  }

  getOrCreateUser(name?: string): User {
    if (this.currentUser) {
      this.updateUser({});
      return this.currentUser;
    }
    const userName = name || `Player_${Date.now().toString().slice(-6)}`;
    const displayName = name ? `Misafir ${name}` : `Misafir Player_${Date.now().toString().slice(-6)}`;
    
    // Create guest user with secure session
    const user = this.createUser(userName, displayName, true);
    
    // Initialize guest session via WebSocket if available
    if ((window as any).wsClient) {
      (window as any).wsClient.createGuestSession(displayName);
    }
    
    return user;
  }

  createSecureGuestSession(displayName: string): string {
    // Generate secure guest token
    const timestamp = Date.now();
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const randomHex = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    
    return `guest_${timestamp}_${randomHex}`;
  }

  explicitLogout(): void {
    localStorage.removeItem(this.STORAGE_KEYS.USER);
    localStorage.removeItem(this.STORAGE_KEYS.SESSION);
    this.currentUser = null;
    this.currentSession = null;
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
    if (this.currentSession) {
      this.currentSession = {
        ...this.currentSession,
        currentState: 'menu',
        lobbyId: undefined,
        tournamentId: undefined,
        playerData: undefined,
        lastUpdated: new Date()
      };
      this.saveSessionToStorage();
    }
  }

  // Game Statistics
  updateGameStats(gameResult: {
    won: boolean;
    score: number;
    cooperated: boolean;
    betrayed: boolean;
  }): void {
    if (!this.currentUser || this.currentUser.isGuest) return;

    const stats = this.currentUser.stats;
    stats.totalGames++;
    stats.totalScore += gameResult.score;

    if (gameResult.won) {
      stats.wins++;
      stats.currentWinStreak++;
      if (stats.currentWinStreak > stats.longestWinStreak) {
        stats.longestWinStreak = stats.currentWinStreak;
      }
    } else {
      stats.losses++;
      stats.currentWinStreak = 0;
    }

    if (gameResult.cooperated) stats.cooperations++;
    if (gameResult.betrayed) stats.betrayals++;

    stats.winRate = (stats.wins / stats.totalGames) * 100;
    stats.averageScore = stats.totalScore / stats.totalGames;
    stats.betrayalRate = (stats.betrayals / (stats.cooperations + stats.betrayals)) * 100;

    this.updateTrustScore(gameResult);
    this.saveUserToStorage();
  }

  private updateTrustScore(gameResult: { cooperated: boolean; betrayed: boolean; won: boolean }): void {
    if (!this.currentUser) return;
    let trustChange = 0;
    if (gameResult.cooperated) trustChange += 2;
    if (gameResult.betrayed) trustChange -= 5;
    if (gameResult.won && gameResult.cooperated) trustChange += 1;
    this.currentUser.stats.trustScore = Math.max(0, Math.min(100, this.currentUser.stats.trustScore + trustChange));
  }

  // Friend System
  sendFriendRequest(targetUserId: string): boolean {
    if (!this.currentUser || this.currentUser.isGuest) return false;
    if (this.currentUser.friends.includes(targetUserId)) return false;
    if (this.currentUser.friendRequests.sent.includes(targetUserId)) return false;
    this.currentUser.friendRequests.sent.push(targetUserId);
    this.saveUserToStorage();
    return true;
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

  // Username validation
  validateUsername(username: string): { valid: boolean; error?: string; suggestions?: string[] } {
    const usernameService = getUsernameService();
    const validation = usernameService.validateUsername(username);
    
    if (!validation.valid) {
      const suggestions = usernameService.generateSuggestions(username);
      return {
        valid: false,
        error: validation.error,
        suggestions: suggestions
      };
    }
    
    return { valid: true };
  }

  // Profile updates
  updateDisplayName(newDisplayName: string): boolean {
    if (!this.currentUser || this.currentUser.isGuest) return false;
    
    const trimmed = newDisplayName.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 30) return false;
    
    this.currentUser.displayName = trimmed;
    this.saveUserToStorage();
    return true;
  }

  updateAvatar(avatarEmoji: string): boolean {
    if (!this.currentUser) return false;
    
    this.currentUser.avatar = avatarEmoji;
    this.saveUserToStorage();
    return true;
  }
}

let userServiceInstance: UserService | null = null;

export function getUserService(): UserService {
  if (!userServiceInstance) {
    userServiceInstance = new UserService();
  }
  return userServiceInstance;
}

export default UserService;