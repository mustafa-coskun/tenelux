# Tenelux Deployment Guide

## 🚀 Deployment Seçenekleri

### 1. Kendi Linux Sunucunda (VPS)

#### A. Manuel Deployment

```bash
# Sunucuya bağlan
ssh user@your-server.com

# Node.js yükle (eğer yoksa)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Repoyu clone et
git clone https://github.com/mustafa-coskun/tenelux.git
cd tenelux

# Dependencies yükle
npm install

# Environment variables ayarla
cp .env.example .env
nano .env  # Gerekli değişkenleri düzenle

# Build al
npm run build

# PM2 ile başlat
npm install -g pm2
pm2 start server.js --name tenelux
pm2 startup
pm2 save
```

#### B. Docker ile Deployment

```bash
# Docker yükle
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose yükle
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Repoyu clone et
git clone https://github.com/mustafa-coskun/tenelux.git
cd tenelux

# Docker ile başlat
docker-compose up -d

# Logları izle
docker-compose logs -f
```

#### C. Nginx Reverse Proxy (SSL için)

```bash
# Nginx yükle
sudo apt install nginx

# Nginx config
sudo nano /etc/nginx/sites-available/tenelux
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
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
}
```

```bash
# Config'i aktif et
sudo ln -s /etc/nginx/sites-available/tenelux /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# SSL ekle (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🆓 Free Hosting Seçenekleri

### 1. **Railway.app** (Önerilen - En Kolay)

**Özellikler:**
- ✅ Free tier: $5 credit/month
- ✅ GitHub entegrasyonu
- ✅ Otomatik deployment
- ✅ SSL sertifikası
- ✅ WebSocket desteği
- ✅ Database desteği

**Deployment:**
1. https://railway.app adresine git
2. GitHub ile giriş yap
3. "New Project" → "Deploy from GitHub repo"
4. Tenelux reposunu seç
5. Environment variables ekle
6. Deploy!

**Avantajları:**
- Çok kolay setup
- Git push ile otomatik deploy
- Güzel dashboard

### 2. **Render.com** (İyi Alternatif)

**Özellikler:**
- ✅ Free tier mevcut
- ✅ Otomatik SSL
- ✅ GitHub entegrasyonu
- ✅ WebSocket desteği

**Deployment:**
1. https://render.com adresine git
2. "New Web Service"
3. GitHub reposunu bağla
4. Build command: `npm install && npm run build`
5. Start command: `npm start`

**Not:** Free tier'da 15 dakika inactivity sonrası sleep mode'a girer.

### 3. **Fly.io** (Güçlü Seçenek)

**Özellikler:**
- ✅ Free tier: 3 shared-cpu VMs
- ✅ Global deployment
- ✅ WebSocket desteği
- ✅ Persistent storage

**Deployment:**
```bash
# Fly CLI yükle
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Deploy
flyctl launch
flyctl deploy
```

### 4. **Heroku** (Klasik)

**Not:** Heroku free tier'ı kaldırdı, ama hobby tier ($7/month) hala uygun.

### 5. **Vercel** (Frontend için)

Frontend'i Vercel'de, backend'i başka yerde host edebilirsin:
- Frontend: Vercel (free)
- Backend: Railway/Render (free)

---

## 📋 Deployment Checklist

### Deployment Öncesi
- [ ] `.env` dosyasını yapılandır
- [ ] Database path'ini ayarla
- [ ] WebSocket URL'ini güncelle
- [ ] CORS ayarlarını kontrol et
- [ ] Port ayarlarını kontrol et

### Deployment Sonrası
- [ ] Health check endpoint test et
- [ ] WebSocket bağlantısını test et
- [ ] Database yazma/okuma test et
- [ ] SSL sertifikasını kontrol et
- [ ] Monitoring kur (PM2/Railway dashboard)

---

## 🔧 Environment Variables

```env
# Server
NODE_ENV=production
PORT=3001

# Database
DB_PATH=./data/tenelux.db

# WebSocket
WS_PORT=3001

# CORS (production domain)
ALLOWED_ORIGINS=https://your-domain.com

# Session
SESSION_SECRET=your-secret-key-here
```

---

## 📊 Monitoring & Maintenance

### PM2 Commands
```bash
# Status
pm2 status

# Logs
pm2 logs tenelux

# Restart
pm2 restart tenelux

# Stop
pm2 stop tenelux

# Monitor
pm2 monit
```

### Docker Commands
```bash
# Status
docker-compose ps

# Logs
docker-compose logs -f

# Restart
docker-compose restart

# Stop
docker-compose down

# Rebuild
docker-compose up -d --build
```

### Güncelleme
```bash
# Git ile
cd tenelux
git pull origin main
npm install
npm run build
pm2 restart tenelux

# Docker ile
cd tenelux
git pull origin main
docker-compose up -d --build
```

---

## 🐛 Troubleshooting

### WebSocket Bağlantı Sorunu
- Nginx config'de WebSocket upgrade header'larını kontrol et
- Firewall'da port açık mı kontrol et
- SSL kullanıyorsan `wss://` kullan

### Database Sorunu
- `data` klasörü yazılabilir mi kontrol et
- SQLite yüklü mü kontrol et
- Disk alanı yeterli mi kontrol et

### Build Hatası
- Node.js versiyonu 14+ olmalı
- `node_modules` sil ve tekrar `npm install`
- `package-lock.json` güncel mi kontrol et

---

## 💡 Önerilen Setup

**Küçük Proje (0-100 kullanıcı):**
- Railway.app free tier
- Tek container
- SQLite database

**Orta Proje (100-1000 kullanıcı):**
- VPS (DigitalOcean $6/month)
- PM2 ile process management
- Nginx reverse proxy
- PostgreSQL database

**Büyük Proje (1000+ kullanıcı):**
- Multiple VPS instances
- Load balancer
- Redis for sessions
- PostgreSQL cluster
- CDN for static files

---

## 📞 Support

Deployment sorunları için:
- GitHub Issues: https://github.com/mustafa-coskun/tenelux/issues
- Documentation: Bu dosya

---

**Son Güncelleme:** November 23, 2025
