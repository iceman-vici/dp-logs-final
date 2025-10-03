# Server Configuration Guide

This guide explains how to configure the Dialpad Logs System for external access using your server's IP address or domain name.

## Why Configuration is Needed

By default, the application is configured for local development using `localhost`. When deploying to a server and accessing it from external clients (browsers on other computers), you need to configure:

1. **CORS Origins** - Tell the backend which domains can access it
2. **Frontend API URL** - Tell the frontend where to find the backend API

## Quick Setup

### 1. Find Your Server IP or Domain

```bash
# Find your server's public IP
curl ifconfig.me

# Or
hostname -I
```

Example result: `194.163.40.197`

### 2. Update .env File

```bash
# Copy the example file
cp .env.example .env

# Edit the file
nano .env
```

### 3. Configure for Your Server

Replace `YOUR_SERVER_IP` with your actual IP address or domain:

```bash
# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_USER=dp_calls
DB_PASSWORD=dp_logs
DB_NAME=dialpad_calls_db

# Dialpad API Configuration
DIALPAD_TOKEN=your_actual_dialpad_token_here

# Webhook Configuration
WEBHOOK_SECRET=dp_call_logs

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Configuration - IMPORTANT!
# Add your server IP/domain here
CORS_ORIGINS=http://localhost:3000,http://YOUR_SERVER_IP:3000,http://YOUR_SERVER_IP:3001

# Frontend API URL - IMPORTANT!
# Update with your server IP/domain
REACT_APP_API_URL=http://YOUR_SERVER_IP:3001/api

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. Example with Real IP

For a server at `194.163.40.197`:

```bash
CORS_ORIGINS=http://localhost:3000,http://194.163.40.197:3000,http://194.163.40.197:3001
REACT_APP_API_URL=http://194.163.40.197:3001/api
DIALPAD_TOKEN=dp_live_abc123xyz...
```

### 5. Rebuild and Restart

```bash
# Stop services
docker-compose down

# Rebuild frontend (required to apply new API URL)
docker-compose build --no-cache frontend

# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps
```

## Configuration Details

### CORS_ORIGINS

**What it does:** Tells the backend which origins (domains) are allowed to make requests to it.

**Format:** Comma-separated list of full URLs including protocol and port

**Example:**
```bash
CORS_ORIGINS=http://localhost:3000,http://192.168.1.100:3000,http://example.com:3000
```

**Common patterns:**
- Local development: `http://localhost:3000`
- Server IP: `http://YOUR_IP:3000`
- Domain name: `http://yourdomain.com`
- HTTPS: `https://yourdomain.com`
- Multiple ports: Include both `:3000` and `:3001`

### REACT_APP_API_URL

**What it does:** Tells the frontend React app where to send API requests.

**Format:** Full URL to the backend API including protocol, host, port, and `/api` path

**Example:**
```bash
REACT_APP_API_URL=http://192.168.1.100:3001/api
```

**Important:** This must be set **before** building the frontend container because React bakes environment variables into the build.

## Using a Domain Name

If you have a domain name pointing to your server:

```bash
# With domain
CORS_ORIGINS=http://localhost:3000,http://calls.yourdomain.com
REACT_APP_API_URL=http://calls.yourdomain.com:3001/api

# With HTTPS (recommended for production)
CORS_ORIGINS=https://calls.yourdomain.com
REACT_APP_API_URL=https://calls.yourdomain.com/api
```

## Production Considerations

### 1. Use HTTPS

Always use HTTPS in production:

```bash
CORS_ORIGINS=https://yourdomain.com
REACT_APP_API_URL=https://yourdomain.com/api
```

### 2. Use Environment-Specific Origins

Don't use `*` for CORS in production. Specify exact origins:

```bash
# Good ✅
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Bad ❌
CORS_ORIGINS=*
```

### 3. Reverse Proxy Setup

For production, use nginx or Apache as a reverse proxy:

```nginx
# Example nginx configuration
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001/api;
    }

    # Webhook
    location /webhook {
        proxy_pass http://localhost:3001/webhook;
    }
}
```

Then configure:
```bash
CORS_ORIGINS=http://yourdomain.com
REACT_APP_API_URL=http://yourdomain.com/api
```

## Troubleshooting

### CORS Error: "Response body is not available to scripts"

**Problem:** The frontend can't access the backend due to CORS restrictions.

**Solution:**
1. Check that your server IP is in `CORS_ORIGINS`
2. Restart the backend: `docker-compose restart backend`
3. Check backend logs: `docker-compose logs backend | grep -i cors`

### Frontend Still Calling localhost

**Problem:** The frontend is calling `localhost:3001` instead of your server IP.

**Solution:**
1. Update `REACT_APP_API_URL` in `.env`
2. Rebuild frontend: `docker-compose build --no-cache frontend`
3. Restart: `docker-compose up -d`

**Verify:** Open browser DevTools → Network tab, check the request URLs

### Can't Access from External Network

**Problem:** The application works locally but not from other computers.

**Solutions:**
1. Check firewall allows ports 3000, 3001, 5432
2. Verify docker-compose has correct port bindings
3. Use public IP, not private network IP

```bash
# Check firewall
sudo ufw status
sudo ufw allow 3000
sudo ufw allow 3001

# Check if ports are listening
sudo netstat -tlnp | grep -E ':(3000|3001|5432)'
```

## Verification Checklist

After configuration, verify:

- [ ] `.env` file exists and has correct values
- [ ] `CORS_ORIGINS` includes your server IP/domain
- [ ] `REACT_APP_API_URL` points to your server IP/domain
- [ ] `DIALPAD_TOKEN` is set
- [ ] Frontend was rebuilt after changing `REACT_APP_API_URL`
- [ ] All services are running: `docker-compose ps`
- [ ] Backend health check works: `curl http://YOUR_IP:3001/api/health`
- [ ] Frontend loads in browser: `http://YOUR_IP:3000`
- [ ] No CORS errors in browser console
- [ ] API calls go to correct IP (check browser Network tab)

## Testing

### Test Backend

```bash
# From server
curl http://localhost:3001/api/health

# From external
curl http://YOUR_SERVER_IP:3001/api/health

# Should return: {"status":"healthy","timestamp":"..."}
```

### Test Frontend

1. Open browser to `http://YOUR_SERVER_IP:3000`
2. Open DevTools (F12) → Network tab
3. Refresh page
4. Check that API calls go to `YOUR_SERVER_IP:3001`, not `localhost:3001`
5. Verify no CORS errors in Console tab

### Test Webhook

```bash
# Test webhook endpoint
curl http://YOUR_SERVER_IP:3001/webhook/health

# Should return: {"success":true,"status":"healthy",...}
```

## Quick Reference

| Setting | Purpose | Example |
|---------|---------|---------|
| `CORS_ORIGINS` | Backend: Allow these origins | `http://192.168.1.100:3000,http://192.168.1.100:3001` |
| `REACT_APP_API_URL` | Frontend: API endpoint | `http://192.168.1.100:3001/api` |
| `DIALPAD_TOKEN` | Backend: Dialpad API access | `dp_live_abc123...` |
| `WEBHOOK_SECRET` | Backend: Webhook auth | `dp_call_logs` |

## Need Help?

1. Check logs: `docker-compose logs -f`
2. Verify configuration: `cat .env`
3. Test connectivity: Use curl commands above
4. Review [README.md](../README.md) for more details
5. Open an issue on GitHub
