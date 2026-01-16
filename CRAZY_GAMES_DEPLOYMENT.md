# Crazy Games Deployment Guide

## Adım 1: Backend'i Deploy Et (Render.com - Ücretsiz)

### 1.1 Render.com'a Kaydol
- https://render.com adresine git
- GitHub hesabınla giriş yap

### 1.2 Yeni Web Service Oluştur
1. Dashboard'da **"New +"** butonuna tıkla
2. **"Web Service"** seç
3. GitHub repo'nu bağla: `mustafa-coskun/tenelux`
4. Ayarları yap:
   - **Name:** `tenelux-backend`
   - **Region:** Frankfurt (en yakın)
   - **Branch:** `main`
   - **Root Directory:** `.` (boş bırak)
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`

### 1.3 Environment Variables Ekle
```
NODE_ENV=production
PORT=10000
WS_PORT=10000
DB_PATH=./data/tenelux.db
SESSION_SECRET=tenelux-crazy-games-2025-secret-key
ALLOWED_ORIGINS=https://www.crazygames.com,https://crazygames.com
```

### 1.4 Deploy Et
- **"Create Web Service"** butonuna tıkla
- Deploy tamamlanınca URL'i kopyala (örn: `https://tenelux-backend.onrender.com`)

---

## Adım 2: Frontend'i Crazy Games için Hazırla

### 2.1 Backend URL'ini Güncelle
`.env.production` dosyasını aç ve backend URL'ini güncelle:

```bash
REACT_APP_API_URL=https://tenelux-backend.onrender.com
REACT_APP_WS_URL=wss://tenelux-backend.onrender.com
```

### 2.2 Build Al
```bash
npm run build
```

### 2.3 Build Klasörünü Zip'le
- `build` klasörünü sıkıştır
- Dosya adı: `tenelux-game.zip`

---

## Adım 3: Crazy Games'e Yükle

### 3.1 Developer Portal'a Git
- https://developer.crazygames.com
- Hesap oluştur / Giriş yap

### 3.2 Yeni Oyun Ekle
1. **"Add Game"** butonuna tıkla
2. Oyun bilgilerini doldur:
   - **Title:** Tenelux: Shadows of Pacta
   - **Category:** Strategy
   - **Description:** Mahkum İkilemi tabanlı çok oyunculu strateji oyunu
   - **Tags:** strategy, multiplayer, prisoner's dilemma, turn-based

### 3.3 Oyun Dosyasını Yükle
1. **"Upload Game"** sekmesine git
2. `tenelux-game.zip` dosyasını yükle
3. **Game Type:** HTML5
4. **Orientation:** Landscape (yatay)
5. **Responsive:** Yes

### 3.4 SDK Entegrasyonunu Test Et
- Crazy Games otomatik olarak SDK'yı test edecek
- Reklamların çalıştığını doğrula
- Gameplay start/stop çağrılarını kontrol et

### 3.5 Yayınla
- Tüm kontroller geçtikten sonra **"Submit for Review"**
- Onay süreci 1-3 gün sürer

---

## Adım 4: Test Et

### 4.1 Local Test
```bash
# Backend'i başlat
node server.js

# Frontend'i başlat (başka terminal)
npm start
```

### 4.2 Production Test
- Render.com'daki backend URL'ini tarayıcıda aç
- WebSocket bağlantısını test et
- Multiplayer özelliklerini dene

---

## Önemli Notlar

### Backend Ücretsiz Plan Limitleri (Render.com)
- ✅ 750 saat/ay ücretsiz (yeterli)
- ✅ Otomatik SSL
- ✅ WebSocket desteği
- ⚠️ 15 dakika inaktivite sonrası uyur (ilk istek 30 saniye sürebilir)
- ⚠️ 512 MB RAM (küçük oyunlar için yeterli)

### Alternatif Backend Hosting'ler
1. **Railway.app** - Daha hızlı, ama ücretli
2. **Fly.io** - Ücretsiz plan var, daha karmaşık
3. **Heroku** - Artık ücretsiz plan yok

### Crazy Games SDK Özellikleri
- ✅ Otomatik reklam gösterimi
- ✅ Banner reklamlar otomatik
- ✅ Midgame ve rewarded reklamlar manuel
- ✅ Gelir paylaşımı: %70 developer, %30 platform

---

## Sorun Giderme

### Backend'e Bağlanamıyor
1. Render.com dashboard'da logları kontrol et
2. Environment variables doğru mu?
3. CORS ayarları Crazy Games domain'ini içeriyor mu?

### Reklamlar Görünmüyor
1. Crazy Games SDK yüklendi mi? (Console'da kontrol et)
2. `window.CrazyGames` objesi var mı?
3. AdService initialize oldu mu?

### WebSocket Bağlantısı Kopuyor
1. Backend uyudu mu? (İlk istek 30 saniye sürebilir)
2. WSS (güvenli WebSocket) kullanıyor musun?
3. Firewall/proxy sorunu var mı?

---

## İletişim

Sorularınız için:
- GitHub Issues: https://github.com/mustafa-coskun/tenelux/issues
- Crazy Games Support: https://developer.crazygames.com/support
