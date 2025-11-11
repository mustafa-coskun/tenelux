# Production Deployment Checklist

## Pre-Deployment Preparation

### Environment Setup
- [ ] Production server provisioned and configured
- [ ] Node.js (v16+) installed
- [ ] PM2 or similar process manager installed
- [ ] Nginx or Apache configured as reverse proxy
- [ ] SSL/TLS certificates installed and configured
- [ ] Firewall rules configured (ports 80, 443, SSH only)

### Database Setup
- [ ] Production database server configured
- [ ] Database user created with minimal required permissions
- [ ] Database backups configured and tested
- [ ] Connection pooling configured appropriately
- [ ] Database monitoring set up

### Security Configuration
- [ ] Environment variables configured securely
- [ ] Admin passwords changed from defaults
- [ ] Rate limiting configured appropriately
- [ ] Input validation tested thoroughly
- [ ] Security headers configured in web server

## Environment Variables

### Required Production Variables

```bash
# Application Environment
NODE_ENV=production
PORT=3000

# Database Configuration
DB_TYPE=postgresql  # or sqlite for smaller deployments
DB_HOST=your-db-host.com
DB_PORT=5432
DB_NAME=tenebris_prod
DB_USER=tenebris_user
DB_PASSWORD=secure-database-password
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_TIMEOUT=30000

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100

# Admin Credentials (CHANGE THESE!)
ADMIN_PASSWORD=your-very-secure-admin-password
MODERATOR_PASSWORD=your-secure-moderator-password

# Logging Configuration
LOG_LEVEL=warn
LOG_FILE=/var/log/tenebris/app.log
LOG_MAX_SIZE=10485760
LOG_MAX_FILES=10

# Optional: External Services
REDIS_URL=redis://localhost:6379
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
```

### Security Checklist

- [ ] All default passwords changed
- [ ] Environment variables stored securely (not in code)
- [ ] Database credentials use principle of least privilege
- [ ] SSL/TLS certificates valid and properly configured
- [ ] Security headers configured in web server
- [ ] Rate limiting enabled and configured
- [ ] Input validation active on all endpoints

## Database Migration

### Pre-Migration
- [ ] Current database backed up
- [ ] Migration scripts tested in staging environment
- [ ] Rollback plan prepared and tested
- [ ] Maintenance window scheduled and communicated

### Migration Steps
```bash
# 1. Backup current database
pg_dump tenebris_prod > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Run migrations
npm run migrate:prod

# 3. Verify migration success
npm run migrate:status

# 4. Test basic functionality
curl https://your-domain.com/api/health
```

### Post-Migration
- [ ] Database integrity verified
- [ ] Application functionality tested
- [ ] Performance benchmarks compared
- [ ] Backup of migrated database created

## Application Deployment

### Build Process
```bash
# 1. Install dependencies
npm ci --production

# 2. Build application (if applicable)
npm run build

# 3. Run tests
npm test

# 4. Security audit
npm audit --audit-level moderate
```

### Deployment Steps
```bash
# 1. Stop current application
pm2 stop tenebris-game

# 2. Deploy new code
git pull origin main
npm ci --production

# 3. Run database migrations
npm run migrate

# 4. Start application
pm2 start ecosystem.config.js

# 5. Verify deployment
pm2 status
curl https://your-domain.com/api/health
```

## Web Server Configuration

### Nginx Configuration Example
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://localhost:3000;
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
        proxy_pass http://localhost:3000;
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

## Process Management

### PM2 Configuration (ecosystem.config.js)
```javascript
module.exports = {
  apps: [{
    name: 'tenebris-game',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/tenebris/error.log',
    out_file: '/var/log/tenebris/out.log',
    log_file: '/var/log/tenebris/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

### Process Management Commands
```bash
# Start application
pm2 start ecosystem.config.js

# Monitor processes
pm2 monit

# View logs
pm2 logs tenebris-game

# Restart application
pm2 restart tenebris-game

# Stop application
pm2 stop tenebris-game

# Save PM2 configuration
pm2 save
pm2 startup
```

## Monitoring and Logging

### Log Configuration
- [ ] Application logs configured and rotating
- [ ] Web server logs configured
- [ ] Database logs configured
- [ ] System logs monitored
- [ ] Log aggregation set up (optional)

### Monitoring Setup
- [ ] Health check endpoint configured
- [ ] Performance metrics collection enabled
- [ ] Database monitoring configured
- [ ] Uptime monitoring configured
- [ ] Alert thresholds configured

### Health Check Endpoints
```bash
# Application health
curl https://your-domain.com/api/health

# Database health
curl https://your-domain.com/api/admin/stats \
  -H "Authorization: Bearer admin-token"

# Performance metrics
curl https://your-domain.com/api/admin/metrics \
  -H "Authorization: Bearer admin-token"
```

## Backup Strategy

### Database Backups
```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/var/backups/tenebris"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
pg_dump tenebris_prod > "$BACKUP_DIR/tenebris_$DATE.sql"

# Compress backup
gzip "$BACKUP_DIR/tenebris_$DATE.sql"

# Remove backups older than 30 days
find $BACKUP_DIR -name "tenebris_*.sql.gz" -mtime +30 -delete
```

### Application Backups
- [ ] Code repository backed up
- [ ] Configuration files backed up
- [ ] SSL certificates backed up
- [ ] Log files archived

## Security Hardening

### Server Security
- [ ] SSH key-based authentication only
- [ ] Fail2ban configured
- [ ] Automatic security updates enabled
- [ ] Unnecessary services disabled
- [ ] File permissions properly set

### Application Security
- [ ] Security headers configured
- [ ] Rate limiting active
- [ ] Input validation tested
- [ ] SQL injection protection verified
- [ ] XSS protection enabled

### Database Security
- [ ] Database user has minimal permissions
- [ ] Database not accessible from internet
- [ ] Connection encryption enabled
- [ ] Regular security updates applied

## Performance Optimization

### Application Performance
- [ ] Connection pooling configured
- [ ] Caching strategy implemented
- [ ] Static file serving optimized
- [ ] Compression enabled

### Database Performance
- [ ] Indexes created for common queries
- [ ] Query performance analyzed
- [ ] Connection pooling optimized
- [ ] Regular maintenance scheduled

### Web Server Performance
- [ ] Gzip compression enabled
- [ ] Static file caching configured
- [ ] Keep-alive connections enabled
- [ ] Worker processes optimized

## Testing in Production

### Smoke Tests
```bash
# Test basic functionality
curl -f https://your-domain.com/api/health || exit 1

# Test user registration
curl -X POST https://your-domain.com/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123","displayName":"Test User"}'

# Test user login
curl -X POST https://your-domain.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}'
```

### Load Testing
```bash
# Install artillery for load testing
npm install -g artillery

# Run load test
artillery quick --count 10 --num 100 https://your-domain.com/api/health
```

## Post-Deployment Verification

### Functionality Tests
- [ ] User registration works
- [ ] User login works
- [ ] Game creation works
- [ ] WebSocket connections work
- [ ] Admin panel accessible

### Performance Tests
- [ ] Response times acceptable
- [ ] Memory usage stable
- [ ] CPU usage reasonable
- [ ] Database performance good

### Security Tests
- [ ] SSL certificate valid
- [ ] Security headers present
- [ ] Rate limiting working
- [ ] Authentication required where expected

## Rollback Plan

### Preparation
- [ ] Previous version tagged in git
- [ ] Database backup created before deployment
- [ ] Rollback procedure documented and tested

### Rollback Steps
```bash
# 1. Stop current application
pm2 stop tenebris-game

# 2. Restore previous code version
git checkout previous-stable-tag
npm ci --production

# 3. Restore database (if needed)
psql tenebris_prod < backup_before_deployment.sql

# 4. Start application
pm2 start ecosystem.config.js

# 5. Verify rollback
curl https://your-domain.com/api/health
```

## Maintenance Schedule

### Daily
- [ ] Check application logs for errors
- [ ] Monitor system resources
- [ ] Verify backup completion

### Weekly
- [ ] Review performance metrics
- [ ] Check security logs
- [ ] Update dependencies (if needed)

### Monthly
- [ ] Security audit
- [ ] Performance optimization review
- [ ] Backup restoration test

### Quarterly
- [ ] Full security assessment
- [ ] Disaster recovery test
- [ ] Capacity planning review

## Emergency Contacts

### Technical Contacts
- Development Team Lead: [contact info]
- System Administrator: [contact info]
- Database Administrator: [contact info]

### Service Providers
- Hosting Provider: [contact info]
- Domain Registrar: [contact info]
- SSL Certificate Provider: [contact info]

## Documentation Updates

After successful deployment:
- [ ] Update deployment documentation
- [ ] Update API documentation
- [ ] Update troubleshooting guides
- [ ] Update team runbooks

## Sign-off

### Deployment Team
- [ ] Development Team Lead: _________________ Date: _______
- [ ] System Administrator: _________________ Date: _______
- [ ] Security Officer: _____________________ Date: _______
- [ ] Project Manager: _____________________ Date: _______

### Post-Deployment Review
- [ ] Deployment successful: Yes / No
- [ ] Issues encountered: ________________________________
- [ ] Lessons learned: ___________________________________
- [ ] Next deployment improvements: ______________________