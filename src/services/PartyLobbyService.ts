import {
  PartyLobby,
  PartySettings,
  TournamentPlayer,
  LobbyStatus,
  LobbyCreationRequest,
  LobbyJoinRequest,
  PartyLobbyService as IPartyLobbyService,
  LobbyError,
  TournamentFormat,
  PlayerStatus
} from '../types/party';
import { TournamentPlayerManager } from './tournament/TournamentPlayerManager';
import { getTournamentSecurityService, SecureLobbyCode } from './TournamentSecurityService';

/**
 * Party Lobby Service
 * Manages party lobby creation, joining, and management
 */
export class PartyLobbyService implements IPartyLobbyService {
  private lobbies: Map<string, PartyLobby> = new Map();
  private lobbyCodeToId: Map<string, string> = new Map();
  private secureLobbyCodes: Map<string, SecureLobbyCode> = new Map();
  private securityService = getTournamentSecurityService();
  private lobbyUpdateCallbacks: Map<string, ((lobby: PartyLobby) => void)[]> = new Map();

  constructor() {
    // URL'den lobi kodu kontrol et
    this.checkURLForLobbyCode();
    
    // Cross-tab communication için window message listener ekle
    this.setupCrossTabCommunication();
  }

  /**
   * Create a new party lobby
   */
  async createLobby(request: LobbyCreationRequest): Promise<PartyLobby> {
    console.log('🎮 Creating new lobby for:', request.hostPlayerName);
    
    const lobbyId = this.generateLobbyId();
    const secureLobbyCode = this.securityService.generateSecureLobbyCode();
    const lobbyCode = secureLobbyCode.code;
    
    console.log('🎮 Generated lobby code:', lobbyCode);
    
    // Create host player
    const hostPlayer = TournamentPlayerManager.createTournamentPlayer(
      request.hostPlayerId,
      request.hostPlayerName,
      true
    );
    
    // Ensure host player has correct host flag
    hostPlayer.isHost = true;

    const lobby: PartyLobby = {
      id: lobbyId,
      code: lobbyCode,
      hostPlayerId: request.hostPlayerId,
      participants: [hostPlayer],
      settings: { ...request.settings },
      status: LobbyStatus.WAITING_FOR_PLAYERS,
      createdAt: new Date(),
      maxPlayers: request.settings.maxPlayers,
      currentPlayerCount: 1
    };

    this.lobbies.set(lobbyId, lobby);
    this.lobbyCodeToId.set(lobbyCode, lobbyId);
    this.secureLobbyCodes.set(lobbyCode, secureLobbyCode);

    // Cross-tab broadcast
    this.broadcastLobbyUpdate('create', lobby);

    console.log('✅ Lobby created successfully:', lobbyId);
    console.log('🎮 Total lobbies now:', this.lobbies.size);
    console.log('🎮 Share this URL to join: ' + window.location.origin + '?lobby=' + lobbyCode);

    return lobby;
  }

  /**
   * Join an existing lobby
   */
  async joinLobby(request: LobbyJoinRequest): Promise<PartyLobby> {
    console.log('🎮 Joining lobby with code:', request.lobbyCode);
    console.log('🎮 Available lobbies:', this.lobbies.size);
    console.log('🎮 Available codes:', Array.from(this.lobbyCodeToId.keys()));
    

    
    // Önce lobi kodunun var olup olmadığını kontrol et
    const lobbyId = this.lobbyCodeToId.get(request.lobbyCode);
    
    if (!lobbyId) {
      console.log('❌ Lobby code not found:', request.lobbyCode);
      throw new Error('invalid_lobby_code');
    }

    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      console.log('❌ Lobby not found for ID:', lobbyId);
      throw new Error('lobby_not_found');
    }

    console.log('✅ Found lobby:', lobby.id, 'with', lobby.currentPlayerCount, 'players');

    // Basit güvenlik kontrolü - sadece gerekli olanlar
    const secureLobbyCode = this.secureLobbyCodes.get(request.lobbyCode);
    if (secureLobbyCode) {
      const codeValidation = this.securityService.validateLobbyCode(request.lobbyCode, secureLobbyCode);
      
      if (!codeValidation.isValid) {
        console.log('❌ Code validation failed:', codeValidation.errorCode);
        throw new Error(codeValidation.errorCode || 'invalid_lobby_code');
      }
    }

    // Check if lobby is full
    if (lobby.currentPlayerCount >= lobby.maxPlayers) {
      throw new Error('lobby_full');
    }

    // Check if tournament has already started
    if (lobby.status === LobbyStatus.TOURNAMENT_IN_PROGRESS) {
      throw new Error('tournament_already_started');
    }

    // Check if player is already in lobby
    const existingPlayer = lobby.participants.find(p => p.id === request.playerId);
    if (existingPlayer) {
      throw new Error('player_already_in_lobby');
    }

    // Track player session for anti-cheat
    const sessionValidation = this.securityService.trackPlayerSession(request.playerId, lobbyId);
    if (!sessionValidation.isValid) {
      throw new Error(sessionValidation.errorCode || 'session_validation_failed');
    }

    // Create new player and add to lobby
    const newPlayer = TournamentPlayerManager.createTournamentPlayer(
      request.playerId,
      request.playerName,
      false
    );

    lobby.participants.push(newPlayer);
    lobby.currentPlayerCount++;

    // Update secure lobby code usage
    if (secureLobbyCode) {
      secureLobbyCode.usageCount++;
    }

    // Update lobby status if ready to start
    if (lobby.currentPlayerCount >= 4) {
      lobby.status = LobbyStatus.READY_TO_START;
    }

    // Auto-start if enabled and lobby is full
    if (lobby.settings.autoStartWhenFull && lobby.currentPlayerCount === lobby.maxPlayers) {
      lobby.status = LobbyStatus.TOURNAMENT_IN_PROGRESS;
    }

    // Cross-tab broadcast
    this.broadcastLobbyUpdate('update', lobby);

    // Lobi güncellemesini bildir
    this.notifyLobbyUpdate(lobby);

    return lobby;
  }

  /**
   * Leave a lobby
   */
  async leaveLobby(playerId: string, lobbyId: string): Promise<void> {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      throw new Error(LobbyError.LOBBY_NOT_FOUND);
    }

    const playerIndex = lobby.participants.findIndex(p => p.id === playerId);
    
    if (playerIndex === -1) {
      throw new Error(LobbyError.PLAYER_NOT_IN_LOBBY);
    }

    const isHost = lobby.hostPlayerId === playerId;
    
    // Remove player from lobby
    lobby.participants.splice(playerIndex, 1);
    lobby.currentPlayerCount--;

    // Remove player session tracking
    this.securityService.removePlayerSession(playerId, lobbyId);

    // Handle host leaving
    if (isHost) {
      if (lobby.participants.length > 0) {
        // Transfer host to next player
        const newHost = lobby.participants[0];
        newHost.isHost = true;
        lobby.hostPlayerId = newHost.id;
      } else {
        // Close lobby if no players left
        this.closeLobby(lobbyId, playerId);
        return;
      }
    }

    // Update lobby status
    if (lobby.currentPlayerCount < 4) {
      lobby.status = LobbyStatus.WAITING_FOR_PLAYERS;
    }
  }

  /**
   * Update lobby settings
   */
  async updateSettings(
    lobbyId: string, 
    hostId: string, 
    settings: Partial<PartySettings>
  ): Promise<PartyLobby> {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      throw new Error(LobbyError.LOBBY_NOT_FOUND);
    }

    if (lobby.hostPlayerId !== hostId) {
      throw new Error(LobbyError.HOST_PRIVILEGES_REQUIRED);
    }

    if (lobby.status === LobbyStatus.TOURNAMENT_IN_PROGRESS) {
      throw new Error(LobbyError.TOURNAMENT_ALREADY_STARTED);
    }

    // Update settings
    lobby.settings = { ...lobby.settings, ...settings };

    // Update max players if changed
    if (settings.maxPlayers && settings.maxPlayers !== lobby.maxPlayers) {
      lobby.maxPlayers = settings.maxPlayers;
      
      // If new max is less than current players, we need to handle this
      if (lobby.currentPlayerCount > lobby.maxPlayers) {
        // Keep host and first players up to max
        const playersToKeep = lobby.participants.slice(0, lobby.maxPlayers);
        lobby.participants = playersToKeep;
        lobby.currentPlayerCount = playersToKeep.length;
      }
    }

    // Update lobby status
    if (lobby.currentPlayerCount >= 4) {
      lobby.status = LobbyStatus.READY_TO_START;
    } else {
      lobby.status = LobbyStatus.WAITING_FOR_PLAYERS;
    }

    return lobby;
  }

  /**
   * Kick a player from lobby
   */
  async kickPlayer(lobbyId: string, hostId: string, targetPlayerId: string): Promise<void> {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      throw new Error(LobbyError.LOBBY_NOT_FOUND);
    }

    if (lobby.hostPlayerId !== hostId) {
      throw new Error(LobbyError.HOST_PRIVILEGES_REQUIRED);
    }

    if (targetPlayerId === hostId) {
      throw new Error('Cannot kick yourself');
    }

    const playerIndex = lobby.participants.findIndex(p => p.id === targetPlayerId);
    
    if (playerIndex === -1) {
      throw new Error(LobbyError.PLAYER_NOT_IN_LOBBY);
    }

    // Remove player
    lobby.participants.splice(playerIndex, 1);
    lobby.currentPlayerCount--;

    // Update lobby status
    if (lobby.currentPlayerCount < 4) {
      lobby.status = LobbyStatus.WAITING_FOR_PLAYERS;
    }
  }

  /**
   * Start tournament
   */
  async startTournament(lobbyId: string, hostId: string): Promise<any> {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      throw new Error(LobbyError.LOBBY_NOT_FOUND);
    }

    if (lobby.hostPlayerId !== hostId) {
      throw new Error(LobbyError.HOST_PRIVILEGES_REQUIRED);
    }

    if (lobby.currentPlayerCount < 4) {
      throw new Error(LobbyError.INSUFFICIENT_PLAYERS);
    }

    if (lobby.status === LobbyStatus.TOURNAMENT_IN_PROGRESS) {
      throw new Error(LobbyError.TOURNAMENT_ALREADY_STARTED);
    }

    // Update lobby status
    lobby.status = LobbyStatus.TOURNAMENT_IN_PROGRESS;

    // Set all players to ready status
    lobby.participants.forEach(player => {
      player.status = PlayerStatus.READY;
    });

    // Return tournament creation data (will be handled by TournamentService)
    return {
      lobbyId: lobby.id,
      format: lobby.settings.tournamentFormat,
      players: lobby.participants,
      settings: lobby.settings
    };
  }

  /**
   * Close lobby
   */
  async closeLobby(lobbyId: string, hostId: string): Promise<void> {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      throw new Error(LobbyError.LOBBY_NOT_FOUND);
    }

    if (lobby.hostPlayerId !== hostId) {
      throw new Error(LobbyError.HOST_PRIVILEGES_REQUIRED);
    }

    // Update status and clean up
    lobby.status = LobbyStatus.LOBBY_CLOSED;
    
    // Remove from maps
    this.lobbies.delete(lobbyId);
    this.lobbyCodeToId.delete(lobby.code);
    this.secureLobbyCodes.delete(lobby.code);

    // Clean up player sessions for this lobby
    lobby.participants.forEach(player => {
      this.securityService.removePlayerSession(player.id, lobbyId);
    });
  }

  /**
   * Get lobby by ID
   */
  async getLobby(lobbyId: string): Promise<PartyLobby | null> {
    return this.lobbies.get(lobbyId) || null;
  }

  /**
   * Get lobby by code
   */
  async getLobbyByCode(code: string): Promise<PartyLobby | null> {
    const lobbyId = this.lobbyCodeToId.get(code);
    if (!lobbyId) return null;
    return this.lobbies.get(lobbyId) || null;
  }

  /**
   * Transfer host privileges
   */
  async transferHost(lobbyId: string, currentHostId: string, newHostId: string): Promise<PartyLobby> {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      throw new Error(LobbyError.LOBBY_NOT_FOUND);
    }

    if (lobby.hostPlayerId !== currentHostId) {
      throw new Error(LobbyError.HOST_PRIVILEGES_REQUIRED);
    }

    if (lobby.status === LobbyStatus.TOURNAMENT_IN_PROGRESS) {
      throw new Error(LobbyError.TOURNAMENT_ALREADY_STARTED);
    }

    const newHost = lobby.participants.find(p => p.id === newHostId);
    const currentHost = lobby.participants.find(p => p.id === currentHostId);
    
    if (!newHost) {
      throw new Error(LobbyError.PLAYER_NOT_IN_LOBBY);
    }

    if (newHostId === currentHostId) {
      throw new Error('Cannot transfer host to yourself');
    }

    // Transfer host privileges
    if (currentHost) {
      currentHost.isHost = false;
    }
    newHost.isHost = true;
    lobby.hostPlayerId = newHostId;

    return lobby;
  }

  /**
   * Handle host leaving with automatic host transfer or lobby closure
   */
  async handleHostLeaving(lobbyId: string, hostId: string): Promise<{ action: 'transferred' | 'closed', newHost?: TournamentPlayer, lobby?: PartyLobby }> {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      throw new Error(LobbyError.LOBBY_NOT_FOUND);
    }

    if (lobby.hostPlayerId !== hostId) {
      throw new Error(LobbyError.HOST_PRIVILEGES_REQUIRED);
    }

    // Remove host from participants
    const hostIndex = lobby.participants.findIndex(p => p.id === hostId);
    if (hostIndex !== -1) {
      lobby.participants.splice(hostIndex, 1);
      lobby.currentPlayerCount--;
    }

    // Check if there are remaining players
    if (lobby.participants.length === 0) {
      // Close lobby if no players left
      await this.closeLobby(lobbyId, hostId);
      return { action: 'closed' };
    }

    // Transfer host to the first remaining player
    const newHost = lobby.participants[0];
    newHost.isHost = true;
    lobby.hostPlayerId = newHost.id;

    // Update lobby status based on player count
    if (lobby.currentPlayerCount < 4) {
      lobby.status = LobbyStatus.WAITING_FOR_PLAYERS;
    }

    return { 
      action: 'transferred', 
      newHost, 
      lobby 
    };
  }

  /**
   * Subscribe to lobby updates
   */
  subscribeLobbyUpdates(lobbyId: string, callback: (lobby: PartyLobby) => void): void {
    if (!this.lobbyUpdateCallbacks.has(lobbyId)) {
      this.lobbyUpdateCallbacks.set(lobbyId, []);
    }
    this.lobbyUpdateCallbacks.get(lobbyId)!.push(callback);
  }

  /**
   * Unsubscribe from lobby updates
   */
  unsubscribeLobbyUpdates(lobbyId: string, callback: (lobby: PartyLobby) => void): void {
    const callbacks = this.lobbyUpdateCallbacks.get(lobbyId);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Notify lobby update subscribers
   */
  private notifyLobbyUpdate(lobby: PartyLobby): void {
    const callbacks = this.lobbyUpdateCallbacks.get(lobby.id);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(lobby);
        } catch (error) {
          console.error('Error in lobby update callback:', error);
        }
      });
    }
  }

  /**
   * Get all active lobbies (for admin/debugging)
   */
  getAllLobbies(): PartyLobby[] {
    return Array.from(this.lobbies.values());
  }

  /**
   * Clean up expired lobbies
   */
  cleanupExpiredLobbies(): void {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours

    Array.from(this.lobbies.entries()).forEach(([lobbyId, lobby]) => {
      const age = now - lobby.createdAt.getTime();
      
      if (age > maxAge && lobby.status !== LobbyStatus.TOURNAMENT_IN_PROGRESS) {
        this.lobbies.delete(lobbyId);
        this.lobbyCodeToId.delete(lobby.code);
        this.secureLobbyCodes.delete(lobby.code);
        
        // Clean up player sessions
        lobby.participants.forEach(player => {
          this.securityService.removePlayerSession(player.id, lobbyId);
        });
      }
    });
  }

  /**
   * Generate unique lobby ID
   */
  private generateLobbyId(): string {
    return `lobby_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * URL'den lobi kodu kontrol et
   */
  private checkURLForLobbyCode(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const lobbyCode = urlParams.get('lobby');
    
    if (lobbyCode) {
      console.log('🎮 Found lobby code in URL:', lobbyCode);
      // URL'deki lobi kodunu geçici olarak sakla
      sessionStorage.setItem('pendingLobbyCode', lobbyCode);
    }
  }

  /**
   * Bekleyen lobi kodunu al
   */
  getPendingLobbyCode(): string | null {
    return sessionStorage.getItem('pendingLobbyCode');
  }

  /**
   * Bekleyen lobi kodunu temizle
   */
  clearPendingLobbyCode(): void {
    sessionStorage.removeItem('pendingLobbyCode');
  }

  /**
   * Cross-tab communication kurulumu
   */
  private setupCrossTabCommunication(): void {
    // localStorage değişikliklerini dinle
    window.addEventListener('storage', (e) => {
      if (e.key === 'partyLobbyUpdate' && e.newValue) {
        try {
          const updateData = JSON.parse(e.newValue);
          this.handleCrossTabLobbyUpdate(updateData);
        } catch (error) {
          console.error('Error parsing cross-tab lobby update:', error);
        }
      }
    });

    // Sayfa yüklendiğinde mevcut lobiler yükle
    this.loadLobbiesFromLocalStorage();
  }

  /**
   * Cross-tab lobi güncellemesini işle
   */
  private handleCrossTabLobbyUpdate(updateData: any): void {
    const { action, lobby } = updateData;
    
    if (action === 'create' || action === 'update') {
      // Date objelerini yeniden oluştur
      lobby.createdAt = new Date(lobby.createdAt);
      
      this.lobbies.set(lobby.id, lobby);
      this.lobbyCodeToId.set(lobby.code, lobby.id);
      
      console.log('🎮 Cross-tab lobby update received:', lobby.code, action);
      
      // Local subscribers'ı bilgilendir
      this.notifyLobbyUpdate(lobby);
    }
  }

  /**
   * localStorage'dan lobiler yükle
   */
  private loadLobbiesFromLocalStorage(): void {
    try {
      const storedLobbies = localStorage.getItem('partyLobbies');
      if (storedLobbies) {
        const lobbiesData = JSON.parse(storedLobbies);
        Object.entries(lobbiesData).forEach(([id, lobbyData]: [string, any]) => {
          // Date objelerini yeniden oluştur
          lobbyData.createdAt = new Date(lobbyData.createdAt);
          this.lobbies.set(id, lobbyData);
          this.lobbyCodeToId.set(lobbyData.code, id);
        });
        console.log('🎮 Loaded', this.lobbies.size, 'lobbies from localStorage');
      }
    } catch (error) {
      console.error('Error loading lobbies from localStorage:', error);
    }
  }

  /**
   * Lobi güncellemesini cross-tab broadcast et
   */
  private broadcastLobbyUpdate(action: string, lobby: PartyLobby): void {
    try {
      const updateData = { action, lobby };
      localStorage.setItem('partyLobbyUpdate', JSON.stringify(updateData));
      
      // Hemen temizle (sadece event tetiklemek için)
      setTimeout(() => {
        localStorage.removeItem('partyLobbyUpdate');
      }, 100);
      
      // Tüm lobiler localStorage'a kaydet
      const lobbiesObj = Object.fromEntries(this.lobbies);
      localStorage.setItem('partyLobbies', JSON.stringify(lobbiesObj));
    } catch (error) {
      console.error('Error broadcasting lobby update:', error);
    }
  }



  /**
   * Generate 6-character lobby code (deprecated - now using secure generation)
   * @deprecated Use TournamentSecurityService.generateSecureLobbyCode() instead
   */
  private generateLobbyCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.lobbyCodeToId.has(code)); // Ensure uniqueness
    
    return code;
  }
}

// Singleton instance
let partyLobbyServiceInstance: PartyLobbyService | null = null;

export function getPartyLobbyService(): PartyLobbyService {
  if (!partyLobbyServiceInstance) {
    partyLobbyServiceInstance = new PartyLobbyService();
    
    // Set up cleanup interval
    setInterval(() => {
      partyLobbyServiceInstance?.cleanupExpiredLobbies();
    }, 10 * 60 * 1000); // Clean up every 10 minutes
  }
  
  return partyLobbyServiceInstance;
}

export default PartyLobbyService;