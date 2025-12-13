# AdSense Policy Compliance Guide

## Genel Bakış

Bu dokümantasyon, Tenelux oyununda AdSense politikalarına uygun reklam yerleşimi için rehber niteliğindedir.

## AdSense Politika Gereksinimleri

### ✅ İzin Verilen Reklam Yerleşimleri

1. **Ana Menü (MAIN_MENU)**
   - Oyun kuralları ve açıklamaları mevcut
   - Yeterli içerik: 300+ karakter
   - Kullanıcı değeri: Oyun seçenekleri ve bilgiler

2. **Oyun Sonu (GAME_END)**
   - Detaylı sonuçlar ve istatistikler
   - Yeterli içerik: Skor, analiz, öneriler
   - Kullanıcı değeri: Performans değerlendirmesi

3. **İstatistik Paneli (STATISTICS_PANEL)**
   - Kapsamlı oyun verileri
   - Grafikler ve analizler
   - Kullanıcı değeri: Gelişim takibi

4. **Kenar Çubuğu (SIDEBAR)**
   - Ek oyun bilgileri ile birlikte
   - Navigasyon ve ipuçları
   - Kullanıcı değeri: Yardımcı içerik

5. **Alt Bilgi (FOOTER)**
   - Site bilgileri ve linkler
   - Hakkında, iletişim, politikalar
   - Kullanıcı değeri: Site navigasyonu

### ❌ Yasaklı Reklam Yerleşimleri

1. **Bekleme Ekranları (LOBBY_WAITING)**
   - Yetersiz içerik
   - Sadece "bekleniyor" mesajı
   - AdSense politikası ihlali

2. **Bağlantı Ekranları (CONNECTING)**
   - İçerik yok
   - Sadece loading animasyonu
   - AdSense politikası ihlali

3. **Hata Sayfaları**
   - Düşük değerli içerik
   - Kullanıcı deneyimi olumsuz
   - AdSense politikası ihlali

4. **Kısa Geçiş Ekranları**
   - Turnuva round geçişleri
   - Anlık bildirimler
   - AdSense politikası ihlali

## Teknik Uygulama

### AdService Kontrolleri

```typescript
// Placement kontrolü
shouldShowAd(placement: AdPlacement): boolean {
  // Sadece izin verilen placement'larda reklam göster
  const allowedPlacements = [
    AdPlacement.MAIN_MENU,
    AdPlacement.GAME_END,
    AdPlacement.STATISTICS_PANEL,
    AdPlacement.SIDEBAR,
    AdPlacement.FOOTER,
  ];
  
  return allowedPlacements.includes(placement);
}

// İçerik yeterlilik kontrolü
isPageContentSufficient(): boolean {
  const bodyText = document.body.innerText || '';
  const contentLength = bodyText.trim().length;
  
  // Minimum 300 karakter içerik gerekli
  return contentLength >= 300;
}
```

### Component Kullanımı

```tsx
// Doğru kullanım - Ana menüde
<AdBanner placement={AdPlacement.MAIN_MENU} />

// Yanlış kullanım - Bekleme ekranında
// <AdBanner placement={AdPlacement.LOBBY_WAITING} /> // KULLANMAYIN
```

## Politika İhlali Çözümleri

### Tespit Edilen Sorunlar

1. **"Yayıncı içeriği olmayan ekranlarda reklamlar"**
   - Çözüm: Bekleme/bağlantı ekranlarından reklamları kaldırdık
   - Uygulama: AdService'te placement kontrolü

2. **"Düşük değerli içerik"**
   - Çözüm: Minimum içerik uzunluğu kontrolü (300 karakter)
   - Uygulama: `isPageContentSufficient()` fonksiyonu

3. **"Loading ekranlarında reklamlar"**
   - Çözüm: Loading indicator tespiti
   - Uygulama: İçerik analizi ile otomatik engelleme

### Önleyici Tedbirler

1. **Çift Kontrol Sistemi**
   ```typescript
   // Hem placement hem de içerik kontrolü
   if (adService.shouldShowAd(placement) && adService.isPageAdSenseCompliant()) {
     // Reklamı göster
   }
   ```

2. **Otomatik İçerik Analizi**
   - Sayfa içeriği uzunluğu kontrolü
   - Loading keyword tespiti
   - Oyun içeriği varlığı kontrolü

3. **Test Mode Logging**
   - Geliştirme sırasında detaylı loglar
   - Politika ihlali uyarıları
   - Reklam engelleme sebepleri

## Monitoring ve Bakım

### Düzenli Kontroller

1. **Haftalık AdSense Console İncelemesi**
   - Politika ihlali bildirimleri
   - Reklam performansı
   - Kullanıcı deneyimi metrikleri

2. **Aylık İçerik Denetimi**
   - Yeni eklenen sayfalar
   - Reklam yerleşimi uygunluğu
   - İçerik kalitesi değerlendirmesi

3. **Çeyreklik Politika Güncellemesi**
   - AdSense politika değişiklikleri
   - Kod güncellemeleri
   - Compliance test'leri

### Acil Durum Prosedürü

Politika ihlali bildirimi alındığında:

1. **Anında Müdahale**
   ```bash
   # Tüm reklamları geçici olarak devre dışı bırak
   REACT_APP_ADS_ENABLED=false
   ```

2. **Sorun Tespiti**
   - Console loglarını incele
   - İhlal yapan sayfaları belirle
   - Reklam yerleşimlerini kontrol et

3. **Düzeltme ve Test**
   - Sorunlu placement'ları kaldır
   - İçerik kalitesini artır
   - Test environment'ta doğrula

4. **Yeniden İnceleme Talebi**
   - AdSense Console'dan talep gönder
   - Yapılan değişiklikleri belirt
   - Compliance kanıtlarını sun

## İletişim

Politika ile ilgili sorular için:
- Geliştirici ekibi ile iletişime geçin
- AdSense Help Center'ı inceleyin
- Google Publisher politikalarını takip edin

---

**Son Güncelleme:** Aralık 2024
**Versiyon:** 1.0
**Durum:** Aktif Compliance