# 🚀 Linux Sunucu Deployment

## Adım 1: Sunucuya Bağlan

```bash
ssh user@your-server-ip
# veya
ssh user@game.coshbilisim.com
```

## Adım 2: Gerekli Paketleri Yükle

```bash
# Node.js yükle (18.x)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Git yükle
sudo apt-get install -y git

# PM2 yükle (process manager)
sudo npm install -g pm2

# Kontrol et
node --version  # v18.x.x
npm --version   # 9.x.x
git --version   # 2.x.x
```

## Adım 3: Projeyi Clone Et

```bash
# app klasörüne git
cd /path/to/app
# veya yeni klasör oluştur
mkdir -p ~/app
cd ~/app

# GitHub'dan clone et
git clone https://github.com/mustafa-coskun/tenelux.git
cd tenelux

# Veya mevcut klasörü güncelle
cd ~/app/tenelux
git pull origin main
```

## Adım 4: Environment Variables Ayarla

```bash
# .env dosyası oluştur
nano .env
```

**.env içeriği:**
```env
# Server
NODE_ENV=production
PORT=3001

# Database
DB_PATH=./data/tenelux.db

# WebSocket
WS_PORT=3001

# CORS
ALLOWED_ORIGINS=https://game.coshbilisim.com

# Session
SESSION_SECRET=your-production-secret-key-here

# AdSense
REACT_APP_ADS_ENABLED=true
REACT_APP_AD_PROVIDER=adsense
REACT_APP_ADSENSE_CLIENT=ca-pub-6170144175424873
REACT_APP_AD_SIDEBAR=8591573945
REACT_APP_AD_FOOTER=8994172273
REACT_APP_AD_GAME_END=1754810659
REACT_APP_AD_STATS=8479166956
REACT_APP_AD_MAIN_MENU=8591573945
REACT_APP_AD_LOBBY=8994172273
REACT_APP_AD_TOURNAMENT=1754810659
```

Kaydet: `Ctrl+X`, `Y`, `Enter`

## Adım 5: Dependencies Yükle

```bash
npm install
```

## Adım 6: Build Al

```bash
npm run build
```

**Beklenen çıktı:**
```
Compiled successfully.
File sizes after gzip:
  180.26 kB  build/static/js/main.fa24640c.js
  ...
```

## Adım 7: PM2 ile Başlat

```bash
# İlk kez başlatma
pm2 start server.js --name tenelux

# Otomatik restart ayarla
pm2 startup
pm2 save

# Durumu kontrol et
pm2 status
```

**Beklenen çıktı:**
```
┌─────┬──────────┬─────────┬─────────┬─────────┐
│ id  │ name     │ status  │ restart │ uptime  │
├─────┼──────────┼─────────┼─────────┼─────────┤
│ 0   │ tenelux  │ online  │ 0       │ 0s      │
└─────┴──────────┴─────────┴─────────┴─────────┘
```

## Adım 8: Nginx Ayarla (Opsiyonel - SSL için)

```bash
# Nginx yükle
sudo apt install nginx

# Config oluştur
sudo nano /etc/nginx/sites-available/tenelux
```

**Nginx config:**
```nginx
server {
    listen 80;
    server_name game.coshbilisim.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name game.coshbilisim.com;

    # SSL certificates (Cloudflare varsa gerekli değil)
    # ssl_certificate /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;

    # Proxy to Node.js
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3001;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Config'i aktif et
sudo ln -s /etc/nginx/sites-available/tenelux /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Adım 9: Firewall Ayarla

```bash
# Port 3001'i aç (Nginx kullanıyorsan gerekli değil)
sudo ufw allow 3001

# Nginx kullanıyorsan
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Adım 10: Test Et

```bash
# Local test
curl http://localhost:3001

# PM2 logs
pm2 logs tenelux

# Nginx logs (varsa)
sudo tail -f /var/log/nginx/error.log
```

**Browser'da test:**
```
https://game.coshbilisim.com
```

---

## 🔄 Güncelleme (Update)

```bash
cd ~/app/tenelux

# Değişiklikleri çek
git pull origin main

# Dependencies güncelle
npm install

# Yeniden build
npm run build

# PM2'yi restart et
pm2 restart tenelux

# Logları kontrol et
pm2 logs tenelux
```

---

## 📊 PM2 Komutları

```bash
# Durumu göster
pm2 status

# Logları göster
pm2 logs tenelux

# Restart
pm2 restart tenelux

# Stop
pm2 stop tenelux

# Start
pm2 start tenelux

# Delete
pm2 delete tenelux

# Monitor
pm2 monit

# Tüm process'leri restart et
pm2 restart all
```

---

## 🐛 Sorun Giderme

### Port zaten kullanımda

```bash
# Port 3001'i kullanan process'i bul
sudo lsof -i :3001

# Process'i öldür
sudo kill -9 <PID>
```

### PM2 başlamıyor

```bash
# PM2'yi temizle
pm2 kill
pm2 start server.js --name tenelux
```

### Build hatası

```bash
# node_modules'ü temizle
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Database hatası

```bash
# data klasörünü oluştur
mkdir -p data

# İzinleri ayarla
chmod 755 data
```

### Nginx hatası

```bash
# Config'i test et
sudo nginx -t

# Nginx'i restart et
sudo systemctl restart nginx

# Logları kontrol et
sudo tail -f /var/log/nginx/error.log
```

---

## 📝 Hızlı Deployment Script

```bash
#!/bin/bash
# deploy.sh

cd ~/app/tenelux
git pull origin main
npm install
npm run build
pm2 restart tenelux
pm2 logs tenelux --lines 50
```

**Kullanım:**
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## ✅ Checklist

- [ ] Sunucuya SSH bağlantısı
- [ ] Node.js yüklü (v18+)
- [ ] Git yüklü
- [ ] PM2 yüklü
- [ ] Proje clone edildi
- [ ] .env dosyası oluşturuldu
- [ ] npm install çalıştırıldı
- [ ] npm run build başarılı
- [ ] PM2 ile başlatıldı
- [ ] pm2 startup yapıldı
- [ ] pm2 save yapıldı
- [ ] Firewall ayarlandı
- [ ] Browser'da test edildi
- [ ] ads.txt erişilebilir
- [ ] AdSense doğrulaması yapıldı

---

## 🚀 Hızlı Başlangıç (Tek Komut)

```bash
cd ~/app && \
git clone https://github.com/mustafa-coskun/tenelux.git && \
cd tenelux && \
npm install && \
npm run build && \
pm2 start server.js --name tenelux && \
pm2 startup && \
pm2 save && \
pm2 logs tenelux
```

**Not:** .env dosyasını manuel oluşturman gerekecek!

---

## 📞 Yardım

Sorun mu yaşıyorsun?

1. **PM2 logs:** `pm2 logs tenelux`
2. **Server logs:** `tail -f logs/server.log`
3. **Nginx logs:** `sudo tail -f /var/log/nginx/error.log`
4. **Process status:** `pm2 status`

---

**Başarılar! 🎉**
