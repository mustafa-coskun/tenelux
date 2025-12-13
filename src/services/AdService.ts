/**
 * Ad Service - Reklam yönetimi için merkezi servis
 */

export enum AdType {
  BANNER = 'banner',
  INTERSTITIAL = 'interstitial',
  REWARDED = 'rewarded',
  NATIVE = 'native'
}

export enum AdPlacement {
  MAIN_MENU = 'main_menu',
  GAME_END = 'game_end',
  LOBBY_WAITING = 'lobby_waiting',
  TOURNAMENT_ROUND_END = 'tournament_round_end',
  STATISTICS_PANEL = 'statistics_panel',
  SIDEBAR = 'sidebar',
  FOOTER = 'footer'
}

interface AdConfig {
  enabled: boolean;
  provider: 'adsense' | 'admob' | 'unity' | 'propeller';
  testMode: boolean;
  adUnits: {
    [key in AdPlacement]?: string; // Ad unit ID
  };
}

class AdService {
  private config: AdConfig;
  private adsLoaded: Set<string> = new Set();
  private adBlockDetected: boolean = false;

  constructor() {
    this.config = {
      enabled: process.env.REACT_APP_ADS_ENABLED === 'true',
      provider: (process.env.REACT_APP_AD_PROVIDER as any) || 'adsense',
      testMode: process.env.NODE_ENV !== 'production',
      adUnits: {
        [AdPlacement.MAIN_MENU]: process.env.REACT_APP_AD_MAIN_MENU,
        [AdPlacement.GAME_END]: process.env.REACT_APP_AD_GAME_END,
        [AdPlacement.LOBBY_WAITING]: process.env.REACT_APP_AD_LOBBY,
        [AdPlacement.TOURNAMENT_ROUND_END]: process.env.REACT_APP_AD_TOURNAMENT,
        [AdPlacement.STATISTICS_PANEL]: process.env.REACT_APP_AD_STATS,
        [AdPlacement.SIDEBAR]: process.env.REACT_APP_AD_SIDEBAR,
        [AdPlacement.FOOTER]: process.env.REACT_APP_AD_FOOTER,
      }
    };

    this.detectAdBlock();
    
    // Log configuration for debugging
    if (this.config.testMode) {
      console.log('AdService initialized:', {
        enabled: this.config.enabled,
        provider: this.config.provider,
        testMode: this.config.testMode,
        adUnitsConfigured: Object.keys(this.config.adUnits).filter(k => this.config.adUnits[k as AdPlacement]).length
      });
    }
  }

  /**
   * AdBlock tespit et
   */
  private async detectAdBlock(): Promise<void> {
    try {
      const testAd = document.createElement('div');
      testAd.innerHTML = '&nbsp;';
      testAd.className = 'adsbox';
      testAd.style.position = 'absolute';
      testAd.style.left = '-9999px';
      document.body.appendChild(testAd);

      await new Promise(resolve => setTimeout(resolve, 100));

      const isBlocked = testAd.offsetHeight === 0;
      this.adBlockDetected = isBlocked;
      document.body.removeChild(testAd);

      if (isBlocked) {
        console.warn('AdBlock detected');
      }
    } catch (error) {
      console.error('AdBlock detection failed:', error);
    }
  }

  /**
   * Reklam gösterilmeli mi kontrol et
   * AdSense politikalarına uygun olarak içerik olmayan ekranlarda reklam gösterme
   */
  shouldShowAd(placement: AdPlacement): boolean {
    if (!this.config.enabled) return false;
    if (this.adBlockDetected) return false;
    if (!this.config.adUnits[placement]) return false;
    
    // AdSense Policy Compliance: Sadece yüksek kaliteli içeriğe sahip sayfalarda reklam göster
    // İzin verilen yerleşimler (yeterli içeriğe sahip):
    const allowedPlacements = [
      AdPlacement.MAIN_MENU,           // Ana menü - oyun kuralları ve seçenekler
      AdPlacement.GAME_END,            // Oyun sonu - sonuçlar ve istatistikler  
      AdPlacement.STATISTICS_PANEL,    // İstatistik paneli - detaylı veriler
      AdPlacement.SIDEBAR,             // Kenar çubuğu - ek içerik ile
      AdPlacement.FOOTER,              // Alt bilgi - site bilgileri ile
    ];
    
    // AdSense Policy: Bu yerleşimlerde reklam gösterme (içerik yetersiz):
    const prohibitedPlacements = [
      AdPlacement.LOBBY_WAITING,        // Bekleme ekranları
      AdPlacement.TOURNAMENT_ROUND_END, // Kısa geçiş ekranları
    ];
    
    // Sadece izin verilen yerleşimlerde reklam göster
    if (!allowedPlacements.includes(placement)) {
      if (this.config.testMode) {
        console.log(`Ad blocked for policy compliance: ${placement}`);
      }
      return false;
    }
    
    return true;
  }

  /**
   * Banner reklam yükle
   * AdSense politikalarına uygun olarak sadece uygun sayfalarda
   */
  loadBannerAd(placement: AdPlacement, containerId: string): void {
    if (!this.shouldShowAd(placement)) {
      if (this.config.testMode) {
        console.log(`Ad loading blocked for policy compliance: ${placement}`);
      }
      return;
    }

    const adUnitId = this.config.adUnits[placement];
    if (!adUnitId) return;

    try {
      // Google AdSense
      if (this.config.provider === 'adsense') {
        this.loadAdSenseBanner(containerId, adUnitId);
      }
      
      this.adsLoaded.add(containerId);
      
      if (this.config.testMode) {
        console.log(`Ad loaded successfully: ${placement} at ${containerId}`);
      }
    } catch (error) {
      console.error('Failed to load banner ad:', error);
    }
  }

  /**
   * AdSense banner yükle - Policy compliant
   */
  private loadAdSenseBanner(containerId: string, adUnitId: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    // AdSense Policy: Sadece yeterli içeriğe sahip sayfalarda reklam yükle
    if (!this.isPageContentSufficient()) {
      if (this.config.testMode) {
        console.log('Ad loading blocked: Insufficient page content for AdSense policy');
      }
      return;
    }

    // Önceki reklamı temizle
    container.innerHTML = '';

    // Yeni reklam elementi oluştur
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', process.env.REACT_APP_ADSENSE_CLIENT || '');
    ins.setAttribute('data-ad-slot', adUnitId);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    
    // Test mode için
    if (this.config.testMode) {
      ins.setAttribute('data-adtest', 'on');
    }

    container.appendChild(ins);

    // AdSense script'i yükle
    try {
      (window as any).adsbygoogle = (window as any).adsbygoogle || [];
      (window as any).adsbygoogle.push({});
      
      if (this.config.testMode) {
        console.log('AdSense ad loaded:', { containerId, adUnitId, testMode: true });
      }
    } catch (error) {
      console.error('AdSense push failed:', error);
    }
  }

  /**
   * Sayfa içeriğinin AdSense politikaları için yeterli olup olmadığını kontrol et
   */
  private isPageContentSufficient(): boolean {
    // Sayfa içeriği kontrolü
    const bodyText = document.body.innerText || '';
    const contentLength = bodyText.trim().length;
    
    // Minimum içerik uzunluğu (AdSense için önerilen)
    const minContentLength = 300;
    
    // Loading/connecting ekranlarını tespit et
    const loadingIndicators = [
      'bağlanıyor', 'connecting', 'loading', 'yükleniyor',
      'bekleniyor', 'waiting', 'aranıyor', 'finding'
    ];
    
    const hasLoadingContent = loadingIndicators.some(indicator => 
      bodyText.toLowerCase().includes(indicator)
    );
    
    // Yeterli içerik var mı ve loading ekranı değil mi?
    const sufficient = contentLength >= minContentLength && !hasLoadingContent;
    
    if (this.config.testMode) {
      console.log('Content sufficiency check:', {
        contentLength,
        minRequired: minContentLength,
        hasLoadingContent,
        sufficient
      });
    }
    
    return sufficient;
  }

  /**
   * Interstitial (tam ekran) reklam göster
   */
  async showInterstitialAd(placement: AdPlacement): Promise<boolean> {
    if (!this.shouldShowAd(placement)) return false;

    try {
      // Burada interstitial ad logic'i gelecek
      console.log('Showing interstitial ad for:', placement);
      
      // Simüle edilmiş bekleme
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
    } catch (error) {
      console.error('Failed to show interstitial ad:', error);
      return false;
    }
  }

  /**
   * Rewarded (ödüllü) video reklam göster
   */
  async showRewardedAd(placement: AdPlacement): Promise<{ watched: boolean; reward?: any }> {
    if (!this.shouldShowAd(placement)) {
      return { watched: false };
    }

    try {
      console.log('Showing rewarded ad for:', placement);
      
      // Burada rewarded ad logic'i gelecek
      // Örnek: Unity Ads, AdMob rewarded video
      
      // Simüle edilmiş bekleme
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        watched: true,
        reward: { type: 'bonus_points', amount: 10 }
      };
    } catch (error) {
      console.error('Failed to show rewarded ad:', error);
      return { watched: false };
    }
  }

  /**
   * Reklam temizle
   */
  clearAd(containerId: string): void {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '';
      this.adsLoaded.delete(containerId);
    }
  }

  /**
   * AdSense policy compliance check
   * Sayfa türünü analiz ederek reklam gösterilip gösterilmeyeceğini belirle
   */
  isPageAdSenseCompliant(): boolean {
    const url = window.location.pathname;
    const title = document.title;
    const bodyText = document.body.innerText || '';
    
    // Yasaklı sayfa türleri (AdSense policy)
    const prohibitedPageTypes = [
      '/loading', '/connecting', '/waiting', '/error',
      'bağlanıyor', 'yükleniyor', 'bekleniyor', 'hata'
    ];
    
    // URL veya içerik kontrolü
    const isProhibited = prohibitedPageTypes.some(type => 
      url.includes(type) || title.toLowerCase().includes(type) || 
      bodyText.toLowerCase().includes(type)
    );
    
    // Minimum içerik kontrolü
    const hasMinimumContent = bodyText.trim().length >= 300;
    
    // Oyun içeriği var mı kontrolü
    const hasGameContent = bodyText.includes('oyun') || bodyText.includes('game') ||
                          bodyText.includes('strateji') || bodyText.includes('mahkum');
    
    const compliant = !isProhibited && hasMinimumContent && hasGameContent;
    
    if (this.config.testMode) {
      console.log('AdSense compliance check:', {
        url, isProhibited, hasMinimumContent, hasGameContent, compliant
      });
    }
    
    return compliant;
  }

  /**
   * Tüm reklamları temizle
   */
  clearAllAds(): void {
    this.adsLoaded.forEach(containerId => {
      this.clearAd(containerId);
    });
  }

  /**
   * AdBlock tespit edildi mi?
   */
  isAdBlockDetected(): boolean {
    return this.adBlockDetected;
  }

  /**
   * Reklam ayarlarını al
   */
  getConfig(): AdConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const adService = new AdService();
