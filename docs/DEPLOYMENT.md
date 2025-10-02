# Deployment Guide

## Prerequisites

- Node.js 14+ and npm
- PostgreSQL 12+
- Dialpad API token
- Server with at least 2GB RAM
- Domain name (optional, for production)

## Development Deployment

### Using Node.js directly

1. **Clone the repository:**
```bash
git clone https://github.com/iceman-vici/dp-logs-final.git
cd dp-logs-final
```

2. **Run setup script:**
```bash
# Linux/Mac
chmod +x scripts/setup.sh
./scripts/setup.sh

# Windows
scripts\setup.bat
```

3. **Configure environment variables:**
```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your credentials

# Frontend
cd ../frontend
cp .env.example .env
# Edit .env if needed
```

4. **Setup database:**
```bash
psql -U your_user -d postgres -c "CREATE DATABASE dialpad_logs;"
psql -U your_user -d dialpad_logs -f backend/database/schema.sql
```

5. **Start services:**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm start
```

### Using Docker Compose

1. **Clone and navigate:**
```bash
git clone https://github.com/iceman-vici/dp-logs-final.git
cd dp-logs-final
```

2. **Create .env files:**
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. **Start with Docker Compose:**
```bash
docker-compose up -d
```

4. **Check logs:**
```bash
docker-compose logs -f
```

## Production Deployment

### Option 1: Traditional VPS (Ubuntu/Debian)

1. **Install dependencies:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install nginx
sudo apt install -y nginx

# Install PM2
sudo npm install -g pm2
```

2. **Setup PostgreSQL:**
```bash
sudo -u postgres psql
CREATE DATABASE dialpad_logs;
CREATE USER dialpad_user WITH ENCRYPTED PASSWORD 'strong_password';
GRANT ALL PRIVILEGES ON DATABASE dialpad_logs TO dialpad_user;
\q

# Run schema
psql -U dialpad_user -d dialpad_logs -f backend/database/schema.sql
```

3. **Deploy application:**
```bash
# Clone repo
cd /var/www
sudo git clone https://github.com/iceman-vici/dp-logs-final.git
cd dp-logs-final

# Setup backend
cd backend
sudo npm ci --only=production
sudo cp .env.example .env
# Edit .env with production values

# Setup frontend
cd ../frontend
sudo npm ci
sudo npm run build
```

4. **Configure PM2:**
```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'dialpad-backend',
    script: './backend/server.js',
    cwd: '/var/www/dp-logs-final',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

5. **Configure Nginx:**
```nginx
# /etc/nginx/sites-available/dialpad-logs
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        root /var/www/dp-logs-final/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

6. **Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/dialpad-logs /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Option 2: Heroku Deployment

1. **Prepare for Heroku:**
```bash
# Install Heroku CLI
# Create Procfile in root
echo "web: cd backend && node server.js" > Procfile
```

2. **Create Heroku app:**
```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:hobby-dev
```

3. **Set environment variables:**
```bash
heroku config:set NODE_ENV=production
heroku config:set DIALPAD_TOKEN=your_token
# Set other required vars
```

4. **Deploy:**
```bash
git push heroku main
```

### Option 3: AWS EC2

1. **Launch EC2 instance:**
- AMI: Ubuntu Server 22.04 LTS
- Instance type: t3.small or larger
- Security group: Open ports 22, 80, 443, 3001

2. **Connect and setup:**
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
# Follow VPS deployment steps above
```

3. **Setup SSL with Let's Encrypt:**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Environment Variables Reference

### Backend Production Variables
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=dialpad_user
DB_PASSWORD=strong_password_here
DB_NAME=dialpad_logs

# Dialpad API
DIALPAD_TOKEN=your_production_token

# Server
PORT=3001
NODE_ENV=production

# CORS
CORS_ORIGINS=https://your-domain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Frontend Production Variables
```env
REACT_APP_API_URL=https://your-domain.com/api
```

## Monitoring

### Setup PM2 Monitoring
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Health Checks
```bash
# Add to crontab
*/5 * * * * curl -f http://localhost:3001/api/health || pm2 restart dialpad-backend
```

## Backup Strategy

### Database Backup
```bash
# Create backup script
cat > /home/ubuntu/backup-db.sh << EOF
#!/bin/bash
DATE=\$(date +%Y%m%d_%H%M%S)
pg_dump -U dialpad_user dialpad_logs > /backups/dialpad_logs_\$DATE.sql
# Keep only last 7 days
find /backups -type f -mtime +7 -delete
EOF

chmod +x /home/ubuntu/backup-db.sh

# Add to crontab (daily at 2 AM)
0 2 * * * /home/ubuntu/backup-db.sh
```

## Troubleshooting

### Common Issues

1. **Database connection errors:**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

2. **PM2 issues:**
```bash
pm2 logs
pm2 restart all
pm2 status
```

3. **Nginx errors:**
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

## Security Recommendations

1. **Use environment variables** for all sensitive data
2. **Enable SSL/TLS** for production
3. **Set up firewall rules:**
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
4. **Regular updates:**
```bash
sudo apt update && sudo apt upgrade
npm audit fix
```
5. **Use strong passwords** for database
6. **Implement rate limiting** and request validation
7. **Add authentication** for production API