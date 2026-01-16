/**
 * Ad Service - Banner Ad Integration
 */

export enum AdType {
  BANNER = 'banner',
  DISPLAY = 'display',
  NATIVE = 'native'
}

export enum AdPlacement {
  MAIN_MENU = 'main_menu',
  GAME_END = 'game_end',
  ROUND_END = 'round_end',
  TOURNAMENT_END = 'tournament_end',
  SIDEBAR = 'sidebar'
}

interface AdConfig {
  enabled: boolean;
}

class AdService {
  private config: AdConfig;
  private initialized: boolean = false;

  constructor() {
    this.config = {
      enabled: process.env.REACT_APP_ADS_ENABLED === 'true',
    };

    if (this.config.enabled) {
      this.initialize();
    }
  }

  /**
   * Ad service'i başlat
   */
  private initialize(): void {
    console.log('🎯 Ad service initialized');
    this.initialized = true;
  }

  /**
   * Banner reklam göster
   */
  showBanner(placement: AdPlacement, containerId?: string): void {
    if (!this.isEnabled()) {
      return;
    }

    console.log(`📺 Ad placement: ${placement}`);
    // Banner container zaten AdBanner component'inde oluşturuldu
  }

  /**
   * Midgame reklam göster (oyun arası)
   */
  async showMidgameAd(placement: AdPlacement): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    console.log(`🎮 Ad opportunity at: ${placement}`);
    return true;
  }

  /**
   * Ödüllü reklam göster
   */
  async showRewardedAd(placement: AdPlacement): Promise<{ watched: boolean; reward?: any }> {
    if (!this.isEnabled()) {
      return { watched: false };
    }

    console.log(`🎁 Rewarded ad at: ${placement}`);
    
    return {
      watched: true,
      reward: { type: 'bonus_points', amount: 10 }
    };
  }

  /**
   * Oyun başladığını bildir
   */
  gameplayStart(): void {
    console.log('🎮 Gameplay started');
  }

  /**
   * Oyun durduğunu bildir
   */
  gameplayStop(): void {
    console.log('⏸️ Gameplay stopped');
  }

  /**
   * Oyuncu mutlu anı
   */
  happytime(): void {
    console.log('😊 Happytime');
  }

  /**
   * Reklamlar etkin mi?
   */
  isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }

  /**
   * AdBlock tespit edildi mi?
   */
  isAdBlockDetected(): boolean {
    return false;
  }

  /**
   * SDK hazır mı?
   */
  isReady(): boolean {
    return this.initialized;
  }
}

// Singleton instance
export const adService = new AdService();
