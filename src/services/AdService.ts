/**
 * Ad Service - Ezoic Integration
 * AI-powered ad optimization with clean, contextual ads
 * Higher revenue than AdSense, automatic optimization
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

interface EzoicConfig {
  enabled: boolean;
  siteId: string;
}

declare global {
  interface Window {
    ezstandalone?: any;
    ezoicTestActive?: boolean;
  }
}

class AdService {
  private config: EzoicConfig;
  private initialized: boolean = false;

  constructor() {
    this.config = {
      enabled: process.env.REACT_APP_ADS_ENABLED === 'true',
      siteId: process.env.REACT_APP_EZOIC_SITE_ID || '',
    };

    if (this.config.enabled) {
      this.initializeEzoic();
    }
  }

  /**
   * Ezoic SDK'yı başlat
   */
  private initializeEzoic(): void {
    console.log('🎯 Initializing Ezoic...');
    
    // Ezoic automatically handles ad placement via their script
    // No manual initialization needed
    this.initialized = true;
  }

  /**
   * Banner reklam göster
   * Ezoic otomatik olarak en iyi yerlere reklam koyar
   */
  showBanner(placement: AdPlacement, containerId?: string): void {
    if (!this.isEnabled()) {
      return;
    }

    console.log(`📺 Ezoic handling ad placement: ${placement}`);
    // Ezoic AI automatically places ads in optimal locations
  }

  /**
   * Midgame reklam göster (oyun arası)
   */
  async showMidgameAd(placement: AdPlacement): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    console.log(`🎮 Ad opportunity at: ${placement}`);
    // Ezoic handles this automatically
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
    
    // Ezoic doesn't have traditional rewarded ads
    // But we can still give rewards for engagement
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
    // Ezoic has built-in adblock detection
    return window.ezoicTestActive === false;
  }

  /**
   * SDK hazır mı?
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Site ID al
   */
  getSiteId(): string {
    return this.config.siteId;
  }
}

// Singleton instance
export const adService = new AdService();
