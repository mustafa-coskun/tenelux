# Google AdSense Kurulum Rehberi

## ✅ Adım 1: AdSense Hesabı (Tamamlandı)

Client ID'n: `ca-pub-6170144175424873`

---

## 📝 Adım 2: Ad Unit'leri Oluştur

### AdSense Dashboard'a Git

1. https://www.google.com/adsense adresine git
2. Sol menüden **"Ads"** → **"By ad unit"** seç
3. **"Display ads"** seç

### Oluşturulacak Ad Unit'ler

#### 1. Sidebar Banner (300x250 veya 160x600)

```
Ad unit name: Tenelux - Sidebar
Ad type: Display ads
Ad size: Responsive (önerilen) veya 300x250
```

**Oluştur** → Ad unit code'u kopyala → Slot ID'yi not et

Örnek slot ID: `1234567890`

`.env` dosyasına ekle:
```
REACT_APP_AD_SIDEBAR=1234567890
```

#### 2. Footer Banner (728x90)

```
Ad unit name: Tenelux - Footer
Ad type: Display ads
Ad size: Responsive veya 728x90
```

`.env` dosyasına ekle:
```
REACT_APP_AD_FOOTER=1234567891
```

#### 3. Game End Banner

```
Ad unit name: Tenelux - Game End
Ad type: Display ads
Ad size: Responsive
```

`.env` dosyasına ekle:
```
REACT_APP_AD_GAME_END=1234567892
```

#### 4. Lobby Banner

```
Ad unit name: Tenelux - Lobby
Ad type: Display ads
Ad size: Responsive
```

`.env` dosyasına ekle:
```
REACT_APP_AD_LOBBY=1234567893
```

#### 5. Statistics Panel

```
Ad unit name: Tenelux - Statistics
Ad type: Display ads
Ad size: Responsive
```

`.env` dosyasına ekle:
```
REACT_APP_AD_STATS=1234567894
```

---

## 🎯 Adım 3: Ad Unit ID'lerini .env'e Ekle

AdSense'de her ad unit oluşturduktan sonra:

1. Ad unit code'unu kopyala
2. `data-ad-slot="XXXXXXXXXX"` kısmındaki numarayı bul
3. `.env` dosyasına ekle

**Örnek:**

AdSense'den aldığın kod:
```html
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-6170144175424873"
     data-ad-slot="1234567890"
     data-ad-format="auto"></ins>
```

`.env` dosyasına ekle:
```
REACT_APP_AD_SIDEBAR=1234567890
```

---

## 🚀 Adım 4: Test Et

### Development Modda Test

```bash
# Uygulamayı başlat
npm start

# Browser'da aç
http://localhost:3000
```

### Kontrol Listesi

- [ ] AdSense script yüklendi mi? (Console'da hata var mı?)
- [ ] Ad container'lar görünüyor mu?
- [ ] "Advertisement" placeholder'ı görünüyor mu?
- [ ] AdBlock kapalı mı?

### Test Reklamları

İlk 1-2 gün AdSense test reklamları gösterebilir. Bu normal!

---

## 📍 Adım 5: Component'lere Reklam Ekle

### Ana Menüye Sidebar Ekle

```tsx
// src/components/MainMenu.tsx
import { AdBanner } from './AdBanner';
import { AdPlacement } from '../services/AdService';

export const MainMenu = () => {
  return (
    <div className="main-menu">
      {/* Sol tarafta sidebar */}
      <div className="sidebar-left">
        <AdBanner placement={AdPlacement.SIDEBAR} className="sidebar" />
      </div>

      {/* Ana içerik */}
      <div className="menu-content">
        {/* Menü butonları */}
      </div>

      {/* Alt kısımda footer */}
      <div className="footer-ads">
        <AdBanner placement={AdPlacement.FOOTER} className="footer" />
      </div>
    </div>
  );
};
```

### Oyun Sonuna Banner Ekle

```tsx
// src/components/StatisticsPanel.tsx
import { AdBanner } from './AdBanner';
import { AdPlacement } from '../services/AdService';

export const StatisticsPanel = () => {
  return (
    <div className="statistics-panel">
      {/* İstatistikler */}
      <div className="stats">
        {/* ... */}
      </div>

      {/* Reklam */}
      <AdBanner placement={AdPlacement.STATISTICS_PANEL} />
    </div>
  );
};
```

### Lobby'ye Banner Ekle

```tsx
// src/components/PartyLobby.tsx
import { AdBanner } from './AdBanner';
import { AdPlacement } from '../services/AdService';

export const PartyLobby = () => {
  return (
    <div className="party-lobby">
      {/* Oyuncu listesi */}
      <div className="players">
        {/* ... */}
      </div>

      {/* Bekleme sırasında reklam */}
      {lobby.status === 'waiting_for_players' && (
        <AdBanner placement={AdPlacement.LOBBY_WAITING} />
      )}
    </div>
  );
};
```

---

## 🎨 Adım 6: CSS Düzenlemeleri

### MainMenu Layout Örneği

```css
/* src/components/MainMenu.css */

.main-menu {
  display: grid;
  grid-template-columns: 300px 1fr;
  grid-template-rows: 1fr auto;
  gap: 20px;
  padding: 20px;
  min-height: 100vh;
}

.sidebar-left {
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.menu-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.footer-ads {
  grid-column: 2;
  display: flex;
  justify-content: center;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .main-menu {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }

  .sidebar-left {
    grid-row: 1;
    grid-column: 1;
  }

  .footer-ads {
    grid-column: 1;
  }
}
```

---

## ⚠️ Önemli Notlar

### AdSense Policy

1. **Sayfa başına max 3 reklam** göster
2. **"Advertisement"** etiketi kullan (otomatik ekleniyor)
3. **Yanıltıcı yerleşim yapma** (buton gibi görünmesin)
4. **Tıklamayı teşvik etme** ("Buraya tıkla" yazma)

### Test Süreci

- İlk 24-48 saat test reklamları gösterilir
- Gerçek reklamlar yavaş yavaş gelmeye başlar
- İlk hafta düşük gelir normal

### Onay Süreci

AdSense hesabın tam onaylanması için:
- Site trafiği olmalı (günlük 50+ ziyaretçi)
- Kaliteli içerik
- Privacy policy sayfası
- 1-2 hafta sürebilir

---

## 📊 Gelir Takibi

### AdSense Dashboard

1. https://www.google.com/adsense
2. **"Reports"** sekmesi
3. Günlük gelir, tıklama, gösterim istatistikleri

### Önemli Metrikler

- **Page RPM**: Sayfa başına gelir
- **Impressions**: Gösterim sayısı
- **Clicks**: Tıklama sayısı
- **CTR**: Tıklama oranı (Click-Through Rate)

---

## 🐛 Sorun Giderme

### Reklamlar Görünmüyor

1. **Console'u kontrol et**
   - Browser DevTools → Console
   - AdSense hataları var mı?

2. **AdBlock kapalı mı?**
   - AdBlock extension'ı devre dışı bırak

3. **Ad unit ID doğru mu?**
   - `.env` dosyasındaki ID'leri kontrol et

4. **Script yüklendi mi?**
   - Network tab'da `adsbygoogle.js` var mı?

### "Ad request not filled"

Bu normal! AdSense her zaman reklam gösteremeyebilir:
- Düşük trafik
- Coğrafi konum
- Reklam envanteri

### Düşük Gelir

İlk haftalarda normal:
- Test reklamları düşük eCPM
- Trafik az
- AdSense optimizasyon yapıyor

---

## ✅ Checklist

Deployment öncesi:

- [ ] AdSense hesabı onaylandı
- [ ] 5 ad unit oluşturuldu
- [ ] Ad unit ID'leri `.env`'e eklendi
- [ ] Component'lere reklam eklendi
- [ ] CSS düzenlemeleri yapıldı
- [ ] Test edildi (AdBlock kapalı)
- [ ] Privacy policy eklendi
- [ ] Mobile responsive kontrol edildi

---

## 🚀 Production'a Alma

```bash
# 1. .env dosyasını kontrol et
cat .env

# 2. Build al
npm run build

# 3. Deploy et
# Railway, Render, veya kendi sunucun

# 4. AdSense'de site URL'ini güncelle
# AdSense → Sites → Add site
```

---

## 📞 Yardım

Sorun mu yaşıyorsun?

- **AdSense Help**: https://support.google.com/adsense
- **Policy Guide**: https://support.google.com/adsense/answer/48182
- **GitHub Issues**: Proje repository'sine issue aç

---

**Başarılar! 🎉**

AdSense kurulumu tamamlandığında gelir akışı başlayacak!
