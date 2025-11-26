# Tenelux Monetization Guide - Reklam Entegrasyonu

## 🎯 Reklam Yerleştirme Stratejisi

### Önerilen Reklam Konumları

#### 1. **Ana Menü Reklamları**
- Sidebar banner (300x250 veya 160x600)
- Footer banner (728x90)
- Kullanıcı deneyimini bozmaz

#### 2. **Oyun Arası Reklamları** (En Etkili)
- Maç bitiminde (rewarded video)
- Round aralarında (interstitial)
- Turnuva roundları arasında (10 saniyelik bekleme)

#### 3. **Lobby Reklamları**
- Bekleme ekranında banner
- Oyuncu beklerken video reklam

#### 4. **İstatistik Sayfası**
- Yan panel banner
- Native ads

### ⚠️ Dikkat Edilmesi Gerekenler

- ❌ Oyun sırasında reklam gösterme (kullanıcı deneyimi bozulur)
- ✅ Doğal bekleme noktalarında reklam göster
- ✅ Rewarded ads kullan (kullanıcıya değer sun)
- ✅ Reklam yükleme sürelerini optimize et

---

## 🔧 Popüler Reklam Ağları

### 1. **Google AdSense** (En Popüler)

**장점:**
- Kolay entegrasyon
- Yüksek eCPM
- Otomatik reklam optimizasyonu
- Türkiye'de iyi çalışır

**Kurulum:**
```html
<!-- public/index.html -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
     crossorigin="anonymous"></script>
```

### 2. **Google AdMob** (Mobil için)

**장점:**
- Mobil oyunlar için optimize
- Rewarded video ads
- Interstitial ads
- Banner ads

### 3. **Unity Ads** (Oyun odaklı)

**장점:**
- Oyun geliştiriciler için
- Yüksek eCPM
- Video ads

### 4. **PropellerAds** (Alternatif)

**장점:**
- AdSense alternatifi
- Türkiye'de çalışır
- Kolay onay

---

## 💻 Kod Implementasyonu

### Reklam Servisi Oluşturma



```typescript
// src/services/AdService.ts
// Yukarıda oluşturuldu
```

### Component Kullanımı

#### 1. Banner Reklam Ekleme

```tsx
import { AdBanner } from './components/AdBanner';
import { AdPlacement } from './services/AdService';

// Ana menüde sidebar banner
<AdBanner 
  placement={AdPlacement.SIDEBAR} 
  className="sidebar"
/>

// Footer banner
<AdBanner 
  placement={AdPlacement.FOOTER} 
  className="footer"
/>
```

#### 2. Ödüllü Reklam Butonu

```tsx
import { RewardedAdButton } from './components/RewardedAdButton';
import { AdPlacement } from './services/AdService';

// Oyun bitiminde bonus puan için
<RewardedAdButton
  placement={AdPlacement.GAME_END}
  onReward={(reward) => {
    console.log('Reward received:', reward);
    // Kullanıcıya bonus ver
    addBonusPoints(reward.amount);
  }}
  buttonText="Reklam İzle"
  rewardText="+10 Puan"
/>
```

---

## 📍 Önerilen Reklam Yerleşimleri

### 1. Ana Menü (MainMenu.tsx)

```tsx
import { AdBanner } from './AdBanner';
import { AdPlacement } from '../services/AdService';

export const MainMenu: React.FC = () => {
  return (
    <div className="main-menu">
      {/* Sol sidebar banner */}
      <div className="sidebar-left">
        <AdBanner placement={AdPlacement.SIDEBAR} />
      </div>

      {/* Ana içerik */}
      <div className="menu-content">
        {/* ... menü butonları ... */}
      </div>

      {/* Footer banner */}
      <AdBanner placement={AdPlacement.FOOTER} />
    </div>
  );
};
```

### 2. Oyun Sonu (StatisticsPanel.tsx)

```tsx
import { RewardedAdButton } from './RewardedAdButton';
import { AdPlacement } from '../services/AdService';

export const StatisticsPanel: React.FC = ({ onClose }) => {
  const handleAdReward = (reward: any) => {
    // Bonus puan ekle
    console.log('Bonus earned:', reward);
  };

  return (
    <div className="statistics-panel">
      {/* İstatistikler */}
      <div className="stats">
        {/* ... */}
      </div>

      {/* Ödüllü reklam butonu */}
      <RewardedAdButton
        placement={AdPlacement.GAME_END}
        onReward={handleAdReward}
        buttonText="Bonus Puan İçin Reklam İzle"
        rewardText="+10 Puan"
      />

      {/* Banner reklam */}
      <AdBanner placement={AdPlacement.STATISTICS_PANEL} />
    </div>
  );
};
```

### 3. Lobby Bekleme (PartyLobby.tsx)

```tsx
import { AdBanner } from './AdBanner';
import { AdPlacement } from '../services/AdService';

export const PartyLobby: React.FC = () => {
  return (
    <div className="party-lobby">
      {/* Oyuncu listesi */}
      <div className="players">
        {/* ... */}
      </div>

      {/* Bekleme sırasında banner */}
      {lobby.status === 'waiting_for_players' && (
        <AdBanner placement={AdPlacement.LOBBY_WAITING} />
      )}
    </div>
  );
};
```

### 4. Turnuva Round Arası (TournamentMatchGame.tsx)

```tsx
import { adService, AdPlacement } from '../services/AdService';

export const TournamentMatchGame: React.FC = () => {
  const handleRoundEnd = async () => {
    // Round bitti, 10 saniye bekleme var
    // Bu sürede interstitial reklam göster
    await adService.showInterstitialAd(AdPlacement.TOURNAMENT_ROUND_END);
  };

  return (
    <div className="tournament-match">
      {/* ... oyun içeriği ... */}
    </div>
  );
};
```

---

## 🎨 CSS Özelleştirme

### Dark Theme Uyumlu Reklam Stilleri

```css
/* src/components/AdBanner.css */
.ad-banner {
  background: linear-gradient(135deg, 
    rgba(30, 30, 40, 0.5), 
    rgba(20, 20, 30, 0.5)
  );
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

/* Oyun temasına uygun reklam konteyneri */
.ad-banner::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(
    circle at center,
    rgba(102, 126, 234, 0.1) 0%,
    transparent 70%
  );
  pointer-events: none;
}
```

---

## 🔧 Google AdSense Kurulumu

### 1. AdSense Hesabı Oluştur

1. https://www.google.com/adsense adresine git
2. Hesap oluştur ve site ekle
3. Site doğrulaması yap
4. Reklam birimlerini oluştur

### 2. Reklam Birimleri Oluştur

AdSense dashboard'da:
- **Display Ads** → **Banner ads** oluştur
- Her placement için ayrı ad unit
- Responsive ad units kullan

### 3. Environment Variables Ayarla

```bash
# .env dosyasına ekle
REACT_APP_ADS_ENABLED=true
REACT_APP_AD_PROVIDER=adsense
REACT_APP_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
REACT_APP_AD_MAIN_MENU=1234567890
REACT_APP_AD_GAME_END=1234567891
# ... diğer ad unit ID'leri
```

### 4. Test Et

```bash
# Development modda test
npm start

# Production build
npm run build
npm start
```

---

## 📊 Reklam Performans Optimizasyonu

### 1. Viewability Artırma

```typescript
// Reklamın görünür olduğundan emin ol
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      // Reklam görünür, yükle
      adService.loadBannerAd(placement, containerId);
    }
  });
});
```

### 2. Lazy Loading

```typescript
// Sadece gerektiğinde reklam yükle
useEffect(() => {
  const timer = setTimeout(() => {
    adService.loadBannerAd(placement, containerId);
  }, 1000); // 1 saniye gecikme

  return () => clearTimeout(timer);
}, []);
```

### 3. Ad Refresh

```typescript
// Belirli aralıklarla reklamı yenile (AdSense policy'ye uygun)
useEffect(() => {
  const interval = setInterval(() => {
    adService.clearAd(containerId);
    adService.loadBannerAd(placement, containerId);
  }, 60000); // 60 saniyede bir

  return () => clearInterval(interval);
}, []);
```

---

## 💰 Gelir Tahminleri

### Örnek Hesaplama

**Varsayımlar:**
- Günlük aktif kullanıcı: 1000
- Kullanıcı başına sayfa görüntüleme: 10
- Reklam gösterim oranı: 80%
- eCPM (1000 gösterim başına kazanç): $2

**Hesaplama:**
```
Günlük gösterim = 1000 kullanıcı × 10 sayfa × 0.8 = 8,000 gösterim
Günlük gelir = (8,000 / 1000) × $2 = $16
Aylık gelir = $16 × 30 = $480
```

### Gelir Artırma Stratejileri

1. **Rewarded Ads Kullan**: 3-5x daha yüksek eCPM
2. **Interstitial Ads**: Doğal bekleme noktalarında
3. **Native Ads**: Daha yüksek CTR
4. **A/B Testing**: Farklı yerleşimleri test et
5. **Ad Mediation**: Birden fazla ad network kullan

---

## ⚠️ AdSense Policy Uyumu

### Yapılması Gerekenler ✅

- Reklam yerleşimlerini açıkça belirt
- "Advertisement" etiketi kullan
- Kullanıcı deneyimini koru
- Geçerli içerik sun
- Privacy policy ekle

### Yapılmaması Gerekenler ❌

- Reklamlara tıklamayı teşvik etme
- Yanıltıcı yerleşim
- Çok fazla reklam (sayfa başına max 3)
- Otomatik reklam yenileme (30 saniyeden kısa)
- Yetişkin içerik

---

## 🔐 Privacy Policy

Reklamlar için privacy policy gerekli:

```markdown
# Privacy Policy - Advertising

We use Google AdSense to display advertisements. 
Google may use cookies and web beacons to collect 
information about your visits to this and other websites.

For more information:
- Google Privacy Policy: https://policies.google.com/privacy
- How Google uses data: https://policies.google.com/technologies/partner-sites
```

---

## 🚀 Production Deployment

### Build Öncesi Checklist

- [ ] AdSense hesabı onaylandı
- [ ] Ad unit ID'leri .env'e eklendi
- [ ] Privacy policy eklendi
- [ ] Test edildi (development)
- [ ] AdBlock detection çalışıyor
- [ ] Mobile responsive

### Build ve Deploy

```bash
# Environment variables ayarla
cp .env.example .env
nano .env  # Ad unit ID'lerini ekle

# Build
npm run build

# Deploy
# Railway, Render, veya kendi sunucun
```

---

## 📈 Analytics ve Tracking

### Google Analytics Entegrasyonu

```typescript
// Reklam tıklamalarını track et
const trackAdClick = (placement: AdPlacement) => {
  if (window.gtag) {
    window.gtag('event', 'ad_click', {
      event_category: 'Advertising',
      event_label: placement,
    });
  }
};
```

---

## 🆘 Troubleshooting

### Reklamlar Görünmüyor

1. **AdBlock kontrolü**: `adService.isAdBlockDetected()`
2. **Console errors**: Browser console'u kontrol et
3. **Ad unit ID**: Doğru ID kullanıldığından emin ol
4. **AdSense onayı**: Hesap onaylandı mı?

### Düşük Gelir

1. **Viewability**: Reklamlar görünür mü?
2. **Placement**: Daha iyi konumlar dene
3. **Ad format**: Farklı formatlar test et
4. **Traffic quality**: Organik trafik artır

---

## 📚 Kaynaklar

- [Google AdSense Help](https://support.google.com/adsense)
- [AdSense Policies](https://support.google.com/adsense/answer/48182)
- [Ad Placement Guide](https://support.google.com/adsense/answer/1354736)
- [Optimization Tips](https://support.google.com/adsense/answer/9183549)

---

**Son Güncelleme:** November 23, 2025
