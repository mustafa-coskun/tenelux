/**
 * Ad Service - PropellerAds Integration
 * High CPM, easy approval, perfect for games
 */

export enum AdType {
  BANNER = 'banner',
  INTERSTITIAL = 'interstitial',
  PUSH = 'push',
  ONCLICK = 'onclick'
}

export enum AdPlacement {
  MAIN_MENU = 'main_menu',
  GAME_END = 'game_end',
  ROUND_END = 'round_end',
  TOURNAMENT_END = 'tournament_end'
}

interface PropellerAdsConfig {
  enabled: boolean;
  zoneIds: {
    banner?: string;
    interstitial?: string;
    push?: string;
    onclick?: string;
  };
}

declare global {
  interface Window {
    propellerads?: any;
  }
}

class AdService {
  private config: PropellerAdsConfig;
  private initialized: boolean = false;

  constructor() {
    this.config = {
      enabled: process.env.REACT_APP_ADS_ENABLED === 'true',
      zoneIds: {
        banner: process.env.REACT_APP_PROPELLER_BANNER_ZONE,
        interstitial: process.env.REACT_APP_PROPELLER_INTERSTITIAL_ZONE,
        push: process.env.REACT_APP_PROPELLER_PUSH_ZONE,
        onclick: process.env.REACT_APP_PROPELLER_ONCLICK_ZONE,
      }
    };

    if (this.config.enabled) {
      this.initializePropellerAds();
    }
  }

  /**
   * PropellerAds SDK'yı başlat
   */
  private initializePropellerAds(): void {
    console.log('🚀 Initializing PropellerAds...');
    this.initialized = true;
  }

  /**
   * Banner reklam göster
   */
  showBanner(placement: AdPlacement, containerId?: string): void {
    if (!this.isEnabled() || !this.config.zoneIds.banner) {
      return;
    }

    console.log(`📺 Showing PropellerAds banner: ${placement}`);

    // PropellerAds banner script'i otomatik yüklenir
    // HTML'de zone ID ile script tag eklenir
  }

  /**
   * Interstitial (tam ekran) reklam göster
   */
  async showInterstitialAd(placement: AdPlacement): Promise<boolean> {
    if (!this.isEnabled() || !this.config.zoneIds.interstitial) {
      return false;
    }

    console.log(`📺 Showing PropellerAds interstitial: ${placement}`);

    // PropellerAds interstitial otomatik gösterilir
    // Sayfa yüklendiğinde veya belirli aksiyonlarda
    return true;
  }

  /**
   * Push notification reklam
   */
  async showPushAd(): Promise<boolean> {
    if (!this.isEnabled() || !this.config.zoneIds.push) {
      return false;
    }

    console.log('🔔 PropellerAds push notification enabled');
    return true;
  }

  /**
   * OnClick reklam (her tıklamada)
   */
  enableOnClickAds(): void {
    if (!this.isEnabled() || !this.config.zoneIds.onclick) {
      return;
    }

    console.log('👆 PropellerAds onClick ads enabled');
    // OnClick ads otomatik çalışır
  }

  /**
   * Midgame reklam göster (oyun arası)
   */
  async showMidgameAd(placement: AdPlacement): Promise<boolean> {
    return this.showInterstitialAd(placement);
  }

  /**
   * Ödüllü reklam göster (PropellerAds'de yok, interstitial kullan)
   */
  async showRewardedAd(placement: AdPlacement): Promise<{ watched: boolean; reward?: any }> {
    const shown = await this.showInterstitialAd(placement);
    
    if (shown) {
      return {
        watched: true,
        reward: { type: 'bonus_points', amount: 10 }
      };
    }
    
    return { watched: false };
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
    // PropellerAds kendi adblock detection'ını yapar
    return false;
  }

  /**
   * SDK hazır mı?
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Zone ID'leri al
   */
  getZoneIds(): typeof this.config.zoneIds {
    return this.config.zoneIds;
  }
}

// Singleton instance
export const adService = new AdService();
