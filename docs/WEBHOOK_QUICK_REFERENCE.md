# Webhook Quick Reference

## Quick Setup

1. **Configure Environment**
   ```bash
   WEBHOOK_SECRET=dp_call_logs
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Database Migration**
   ```bash
   psql -U postgres -d dialpad_logs -f backend/database/migration-webhook-logs.sql
   ```

4. **Configure Dialpad Webhook**
   ```json
   {
     "hook_url": "https://your-domain.com/webhook",
     "signature": {
       "algo": "HS256",
       "secret": "dp_call_logs",
       "type": "jwt"
     }
   }
   ```

## Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/webhook` | Receive call events | Yes (JWT) |
| GET | `/webhook/health` | Health check | No |
| GET | `/webhook/stats` | View statistics | No |
| POST | `/webhook/stats/reset` | Reset statistics | No |
| GET | `/webhook/logs?limit=50` | View recent logs | No |
| POST | `/webhook/test` | Test endpoint | No (dev only) |

## Testing

### Test in Development (No Auth)
```bash
curl -X POST http://localhost:3001/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"call":{"id":"test123","duration":120}}'
```

### Check Health
```bash
curl http://localhost:3001/webhook/health
```

### View Statistics
```bash
curl http://localhost:3001/webhook/stats
```

### View Recent Logs
```bash
curl http://localhost:3001/webhook/logs?limit=20
```

## Database Queries

### View Webhook Statistics
```sql
SELECT * FROM webhook_stats_view;
```

### View Recent Activity
```sql
SELECT * FROM webhook_recent_activity LIMIT 20;
```

### Check Failed Webhooks
```sql
SELECT * FROM webhook_logs 
WHERE status = 'failed' 
ORDER BY processed_at DESC 
LIMIT 10;
```

### Cleanup Old Logs
```sql
SELECT cleanup_old_webhook_logs(30); -- Delete logs older than 30 days
```

## Monitoring Commands

### Docker Logs
```bash
# View webhook logs
docker-compose logs -f backend | grep Webhook

# View all backend logs
docker-compose logs -f backend
```

### Application Status
```bash
# Check if webhook is receiving events
curl http://localhost:3001/webhook/stats

# Check system health
curl http://localhost:3001/webhook/health
```

## Troubleshooting

### Common Issues

**Issue: 401 Unauthorized**
- Check `WEBHOOK_SECRET` matches Dialpad config
- Verify JWT token in Authorization header

**Issue: Empty Payload**
- Check webhook payload format
- Review `/webhook/logs` for actual data received

**Issue: Database Errors**
- Verify database connection
- Run migration: `migration-webhook-logs.sql`
- Check database logs

### Debug Mode
```bash
# Enable debug logging
NODE_ENV=development npm start

# Or with Docker
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Production Checklist

- [ ] Set `WEBHOOK_SECRET` in production .env
- [ ] Run database migration
- [ ] Configure HTTPS/SSL
- [ ] Set up reverse proxy (nginx/Apache)
- [ ] Configure Dialpad webhook URL
- [ ] Test with `/webhook/test` first (dev only)
- [ ] Monitor `/webhook/stats` after deployment
- [ ] Set up log aggregation
- [ ] Configure uptime monitoring
- [ ] Set up alerts for failed webhooks

## Quick Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Check webhook stats
curl http://localhost:3001/webhook/stats

# View recent activity
curl http://localhost:3001/webhook/logs?limit=10

# Health check
curl http://localhost:3001/webhook/health

# Database shell
docker-compose exec postgres psql -U postgres -d dialpad_logs

# View webhook logs in DB
docker-compose exec postgres psql -U postgres -d dialpad_logs \
  -c "SELECT * FROM webhook_logs ORDER BY processed_at DESC LIMIT 10;"
```

## Environment Variables

```bash
# Required
WEBHOOK_SECRET=dp_call_logs          # Must match Dialpad config
DB_HOST=postgres                     # Database host
DB_PORT=5432                         # Database port
DB_USER=postgres                     # Database user
DB_PASSWORD=postgres                 # Database password
DB_NAME=dialpad_logs                 # Database name

# Optional
PORT=3001                            # API port
NODE_ENV=production                  # Environment
CORS_ORIGINS=*                       # CORS origins
RATE_LIMIT_WINDOW_MS=900000         # Rate limit window
RATE_LIMIT_MAX_REQUESTS=100         # Rate limit max
```

## Support

For detailed documentation, see [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md)
