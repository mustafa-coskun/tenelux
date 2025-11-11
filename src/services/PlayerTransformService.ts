/**
 * PlayerTransformService
 * 
 * Ortak oyuncu dönüşüm fonksiyonları
 * User <-> Player dönüşümleri ve veri zenginleştirme
 */

import { Player } from '../types/index';
import { TournamentPlayer, TournamentPlayerStats, PlayerStatus } from '../types/party';
import { User } from './UserService';

class PlayerTransformService {
  /**
   * User nesnesini Player nesnesine dönüştürür
   */
  userToPlayer(user: User): Player {
    return {
      id: String(user.id), // Ensure ID is always a string
      name: user.displayName || user.username,
      isAI: false,
      trustScore: user.stats?.trustScore || 50,
      totalGamesPlayed: user.stats?.totalGames || 0,
      createdAt: user.createdAt
    };
  }

  /**
   * Player nesnesini User nesnesine dönüştürür (kısmi)
   * Not: Tam bir User nesnesi oluşturmak için ek bilgi gerekir
   */
  playerToUser(player: Player): Partial<User> {
    return {
      id: player.id,
      displayName: player.name,
      username: player.name.toLowerCase().replace(/\s+/g, '_'),
      createdAt: player.createdAt,
      lastActive: new Date(),
      isGuest: player.isAI,
      stats: {
        totalGames: player.totalGamesPlayed,
        trustScore: player.trustScore,
        wins: 0,
        losses: 0,
        cooperations: 0,
        betrayals: 0,
        totalScore: 0,
        winRate: 0,
        betrayalRate: 0,
        averageScore: 0,
        longestWinStreak: 0,
        currentWinStreak: 0,
        gamesThisWeek: 0,
        gamesThisMonth: 0
      }
    };
  }

  /**
   * User nesnesini TournamentPlayer nesnesine dönüştürür
   */
  userToTournamentPlayer(user: User, isHost: boolean = false): TournamentPlayer {
    return {
      id: String(user.id), // Ensure ID is always a string
      name: user.displayName || user.username,
      avatar: user.avatar,
      isHost: isHost,
      isEliminated: false,
      currentRank: 0,
      statistics: this.createDefaultTournamentStats(),
      status: PlayerStatus.WAITING,
      joinedAt: new Date()
    };
  }

  /**
   * TournamentPlayer nesnesini Player nesnesine dönüştürür
   */
  tournamentPlayerToPlayer(tournamentPlayer: TournamentPlayer): Player {
    return {
      id: tournamentPlayer.id,
      name: tournamentPlayer.name,
      isAI: false,
      trustScore: this.calculateTrustScoreFromTournamentStats(tournamentPlayer.statistics),
      totalGamesPlayed: tournamentPlayer.statistics.matchesPlayed,
      createdAt: tournamentPlayer.joinedAt
    };
  }

  /**
   * Player verilerini istatistiklerle zenginleştirir
   */
  enrichPlayerData(player: Player, additionalStats?: Partial<Player>): Player {
    return {
      ...player,
      ...additionalStats,
      // Güven skorunu güncelle
      trustScore: additionalStats?.trustScore !== undefined 
        ? additionalStats.trustScore 
        : player.trustScore,
      // Toplam oyun sayısını güncelle
      totalGamesPlayed: additionalStats?.totalGamesPlayed !== undefined
        ? additionalStats.totalGamesPlayed
        : player.totalGamesPlayed
    };
  }

  /**
   * User verilerini istatistiklerle zenginleştirir
   */
  enrichUserData(user: User, gameStats?: Partial<User['stats']>): User {
    return {
      ...user,
      stats: {
        ...user.stats,
        ...gameStats
      },
      lastActive: new Date()
    };
  }

  /**
   * TournamentPlayer verilerini istatistiklerle zenginleştirir
   */
  enrichTournamentPlayerData(
    player: TournamentPlayer, 
    stats?: Partial<TournamentPlayerStats>
  ): TournamentPlayer {
    return {
      ...player,
      statistics: {
        ...player.statistics,
        ...stats
      }
    };
  }

  /**
   * Birden fazla User'ı Player listesine dönüştürür
   */
  usersToPlayers(users: User[]): Player[] {
    return users.map(user => this.userToPlayer(user));
  }

  /**
   * Birden fazla Player'ı User listesine dönüştürür (kısmi)
   */
  playersToUsers(players: Player[]): Partial<User>[] {
    return players.map(player => this.playerToUser(player));
  }

  /**
   * Birden fazla User'ı TournamentPlayer listesine dönüştürür
   */
  usersToTournamentPlayers(users: User[], hostUserId?: string): TournamentPlayer[] {
    return users.map(user => 
      this.userToTournamentPlayer(user, user.id === hostUserId)
    );
  }

  /**
   * Birden fazla TournamentPlayer'ı Player listesine dönüştürür
   */
  tournamentPlayersToPlayers(tournamentPlayers: TournamentPlayer[]): Player[] {
    return tournamentPlayers.map(tp => this.tournamentPlayerToPlayer(tp));
  }

  /**
   * Player bilgilerini günceller (immutable)
   */
  updatePlayer(player: Player, updates: Partial<Player>): Player {
    return {
      ...player,
      ...updates
    };
  }

  /**
   * TournamentPlayer bilgilerini günceller (immutable)
   */
  updateTournamentPlayer(
    player: TournamentPlayer, 
    updates: Partial<TournamentPlayer>
  ): TournamentPlayer {
    return {
      ...player,
      ...updates
    };
  }

  /**
   * Player'ın güven skorunu hesaplar
   */
  calculateTrustScore(
    cooperations: number, 
    betrayals: number, 
    totalGames: number
  ): number {
    if (totalGames === 0) return 50; // Varsayılan

    const cooperationRate = cooperations / totalGames;
    const betrayalRate = betrayals / totalGames;
    
    // Güven skoru: 0-100 arası
    // Yüksek işbirliği = yüksek güven
    // Yüksek ihanet = düşük güven
    const trustScore = 50 + (cooperationRate * 50) - (betrayalRate * 50);
    
    return Math.max(0, Math.min(100, Math.round(trustScore)));
  }

  /**
   * TournamentPlayer istatistiklerinden güven skoru hesaplar
   */
  private calculateTrustScoreFromTournamentStats(stats: TournamentPlayerStats): number {
    const totalDecisions = stats.matchesPlayed * 5; // Ortalama 5 tur varsayımı
    const cooperations = Math.round(totalDecisions * stats.cooperationRate);
    const betrayals = Math.round(totalDecisions * stats.betrayalRate);
    
    return this.calculateTrustScore(cooperations, betrayals, stats.matchesPlayed);
  }

  /**
   * Varsayılan turnuva istatistikleri oluşturur
   */
  private createDefaultTournamentStats(): TournamentPlayerStats {
    return {
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      totalPoints: 0,
      cooperationRate: 0,
      betrayalRate: 0,
      averageMatchScore: 0,
      headToHeadRecord: new Map(),
      tournamentPoints: 0
    };
  }

  /**
   * Player'ın aktif olup olmadığını kontrol eder
   */
  isPlayerActive(player: Player | TournamentPlayer): boolean {
    if ('status' in player) {
      // TournamentPlayer
      return player.status !== PlayerStatus.DISCONNECTED && 
             player.status !== PlayerStatus.ELIMINATED;
    }
    // Player - her zaman aktif kabul et
    return true;
  }

  /**
   * İki Player'ın aynı olup olmadığını kontrol eder
   */
  isSamePlayer(player1: Player | TournamentPlayer, player2: Player | TournamentPlayer): boolean {
    return player1.id === player2.id;
  }

  /**
   * Player listesinden belirli bir Player'ı bulur
   */
  findPlayerById(players: (Player | TournamentPlayer)[], playerId: string): Player | TournamentPlayer | undefined {
    return players.find(p => p.id === playerId);
  }

  /**
   * Player listesinden belirli bir Player'ı kaldırır (immutable)
   */
  removePlayer(players: Player[], playerId: string): Player[] {
    return players.filter(p => p.id !== playerId);
  }

  /**
   * TournamentPlayer listesinden belirli bir Player'ı kaldırır (immutable)
   */
  removeTournamentPlayer(players: TournamentPlayer[], playerId: string): TournamentPlayer[] {
    return players.filter(p => p.id !== playerId);
  }

  /**
   * Player'ları güven skoruna göre sıralar
   */
  sortPlayersByTrustScore(players: Player[], descending: boolean = true): Player[] {
    return [...players].sort((a, b) => 
      descending ? b.trustScore - a.trustScore : a.trustScore - b.trustScore
    );
  }

  /**
   * TournamentPlayer'ları sıralamaya göre sıralar
   */
  sortTournamentPlayersByRank(players: TournamentPlayer[]): TournamentPlayer[] {
    return [...players].sort((a, b) => a.currentRank - b.currentRank);
  }
}

// Singleton instance
let playerTransformServiceInstance: PlayerTransformService | null = null;

export function getPlayerTransformService(): PlayerTransformService {
  if (!playerTransformServiceInstance) {
    playerTransformServiceInstance = new PlayerTransformService();
  }
  return playerTransformServiceInstance;
}

export default PlayerTransformService;
