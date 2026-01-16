/**
 * Ad Service - Crazy Games SDK Integration
 * Simple and easy monetization for web games
 */

export enum AdType {
  MIDGAME = 'midgame',      // Oyun arası reklam
  REWARDED = 'rewarded'      // Ödüllü reklam
}

export enum AdPlacement {
  MAIN_MENU = 'main_menu',
  GAME_END = 'game_end',
  ROUND_END = 'round_end',
  TOURNAMENT_END = 'tournament_end'
}

interface CrazyGamesSDK {
  ad: {
    requestAd: (type: 'midgame' | 'rewarded', callbacks?: {
      adStarted?: () => void;
      adFinished?: () => void;
      adError?: (error: any) => void;
      adBlocked?: () => void;
    }) => void;
    hasAdblock: boolean;
  };
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime: () => void;
    inviteLink: (params: any) => void;
  };
  banner: {
    requestBanner: (options: any) => void;
    clearBanner: () => void;
    clearAllBanners: () => void;
  };
}

declare global {
  interface Window {
    CrazyGames?: CrazyGamesSDK;
  }
}

class AdService {
  private sdk: CrazyGamesSDK | null = null;
  private enabled: boolean = true;
  private isGameplayActive: boolean = false;

  constructor() {
    this.initializeSDK();
  }

  /**
   * Crazy Games SDK'yı başlat
   */
  private initializeSDK(): void {
    // SDK yüklenmesini bekle
    const checkSDK = setInterval(() => {
      if (window.CrazyGames) {
        this.sdk = window.CrazyGames;
        clearInterval(checkSDK);
        console.log('✅ Crazy Games SDK initialized');
        
        // Oyun başladığında bildir
        this.gameplayStart();
      }
    }, 100);

    // 5 saniye sonra timeout
    setTimeout(() => {
      clearInterval(checkSDK);
      if (!this.sdk) {
        console.warn('⚠️ Crazy Games SDK not loaded - running without ads');
        this.enabled = false;
      }
    }, 5000);
  }

  /**
   * Oyun başladığını bildir (SDK'ya)
   */
  gameplayStart(): void {
    if (this.sdk && !this.isGameplayActive) {
      this.sdk.game.gameplayStart();
      this.isGameplayActive = true;
      console.log('🎮 Gameplay started');
    }
  }

  /**
   * Oyun durduğunu bildir (reklam gösterileceği zaman)
   */
  gameplayStop(): void {
    if (this.sdk && this.isGameplayActive) {
      this.sdk.game.gameplayStop();
      this.isGameplayActive = false;
      console.log('⏸️ Gameplay stopped');
    }
  }

  /**
   * Oyuncu mutlu anı (iyi bir şey olduğunda)
   */
  happytime(): void {
    if (this.sdk) {
      this.sdk.game.happytime();
      console.log('😊 Happytime triggered');
    }
  }

  /**
   * Midgame reklam göster (oyun arası)
   */
  async showMidgameAd(placement: AdPlacement): Promise<boolean> {
    if (!this.enabled || !this.sdk) {
      console.log('Ads disabled or SDK not loaded');
      return false;
    }

    return new Promise((resolve) => {
      console.log(`📺 Showing midgame ad: ${placement}`);
      
      // Oyunu durdur
      this.gameplayStop();

      this.sdk!.ad.requestAd('midgame', {
        adStarted: () => {
          console.log('Ad started');
        },
        adFinished: () => {
          console.log('Ad finished');
          // Oyunu devam ettir
          this.gameplayStart();
          resolve(true);
        },
        adError: (error) => {
          console.error('Ad error:', error);
          // Oyunu devam ettir
          this.gameplayStart();
          resolve(false);
        },
        adBlocked: () => {
          console.warn('Ad blocked');
          // Oyunu devam ettir
          this.gameplayStart();
          resolve(false);
        }
      });
    });
  }

  /**
   * Ödüllü reklam göster
   */
  async showRewardedAd(placement: AdPlacement): Promise<{ watched: boolean; reward?: any }> {
    if (!this.enabled || !this.sdk) {
      console.log('Ads disabled or SDK not loaded');
      return { watched: false };
    }

    return new Promise((resolve) => {
      console.log(`🎁 Showing rewarded ad: ${placement}`);
      
      // Oyunu durdur
      this.gameplayStop();

      this.sdk!.ad.requestAd('rewarded', {
        adStarted: () => {
          console.log('Rewarded ad started');
        },
        adFinished: () => {
          console.log('Rewarded ad finished - giving reward');
          // Oyunu devam ettir
          this.gameplayStart();
          resolve({
            watched: true,
            reward: { type: 'bonus_points', amount: 10 }
          });
        },
        adError: (error) => {
          console.error('Rewarded ad error:', error);
          // Oyunu devam ettir
          this.gameplayStart();
          resolve({ watched: false });
        },
        adBlocked: () => {
          console.warn('Rewarded ad blocked');
          // Oyunu devam ettir
          this.gameplayStart();
          resolve({ watched: false });
        }
      });
    });
  }

  /**
   * Banner reklam göster (kullanılmıyor - Crazy Games otomatik banner gösterir)
   */
  showBanner(placement: AdPlacement): void {
    // Crazy Games otomatik olarak banner gösterir
    // Manuel banner kontrolü gerekmez
    console.log(`Banner placement: ${placement} (handled by Crazy Games)`);
  }

  /**
   * AdBlock tespit edildi mi?
   */
  isAdBlockDetected(): boolean {
    return this.sdk?.ad.hasAdblock || false;
  }

  /**
   * SDK hazır mı?
   */
  isReady(): boolean {
    return this.sdk !== null;
  }

  /**
   * Reklamlar etkin mi?
   */
  isEnabled(): boolean {
    return this.enabled && this.sdk !== null;
  }
}

// Singleton instance
export const adService = new AdService();
