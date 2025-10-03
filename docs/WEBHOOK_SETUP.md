# Dialpad Webhook Setup Guide

This guide explains how to set up and use the Dialpad webhook endpoint to receive real-time call events.

## Overview

The webhook endpoint receives call events from Dialpad in real-time and stores them in the same database as the API sync method. This provides an alternative to polling the API and enables real-time call logging.

## Webhook Configuration

### Dialpad Webhook Settings

Configure your Dialpad webhook with the following settings:

```json
{
  "webhook": {
    "hook_url": "https://dp-call-logs.iceman.systems/webhook",
    "id": "5212604609576960",
    "signature": {
      "algo": "HS256",
      "secret": "dp_call_logs",
      "type": "jwt"
    }
  }
}
```

### Environment Variables

Make sure to set the webhook secret in your `.env` file:

```bash
# Webhook Configuration
WEBHOOK_SECRET=dp_call_logs
```

**Important:** The `WEBHOOK_SECRET` must match the secret configured in your Dialpad webhook settings.

## Webhook Endpoints

### Main Webhook Endpoint

**POST** `/webhook`

Receives call events from Dialpad.

**Authentication:** Requires JWT signature verification via `Authorization` header.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "message": "Call data processed successfully",
  "call_id": "1234567890"
}
```

### Health Check

**GET** `/webhook/health`

Check webhook endpoint health and statistics.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-10-03T12:00:00.000Z",
  "stats": {
    "total": 150,
    "success": 148,
    "failed": 2,
    "successRate": "98.67%"
  }
}
```

### Statistics

**GET** `/webhook/stats`

Get webhook processing statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 150,
    "success": 148,
    "failed": 2,
    "successRate": "98.67%"
  }
}
```

### Reset Statistics

**POST** `/webhook/stats/reset`

Reset webhook statistics counters.

**Response:**
```json
{
  "success": true,
  "message": "Statistics reset successfully"
}
```

### Webhook Logs

**GET** `/webhook/logs?limit=50`

Get recent webhook processing logs.

**Query Parameters:**
- `limit` (optional): Number of logs to retrieve (default: 50, max: 100)

**Response:**
```json
{
  "success": true,
  "count": 50,
  "logs": [
    {
      "id": 1,
      "call_id": "1234567890",
      "status": "success",
      "error_message": null,
      "payload": { ... },
      "processed_at": "2025-10-03T12:00:00.000Z"
    }
  ]
}
```

### Test Endpoint (Development Only)

**POST** `/webhook/test`

Test webhook processing without JWT authentication. Only available in development mode.

**Request:**
```json
{
  "call": {
    "id": "test123",
    "direction": "inbound",
    "duration": 120,
    ...
  }
}
```

## JWT Authentication

The webhook endpoint uses JWT (JSON Web Token) for authentication to ensure that calls are coming from Dialpad.

### How It Works

1. Dialpad signs the webhook payload with a secret key using HS256 algorithm
2. The signature is sent in the `Authorization` header as a Bearer token
3. The webhook endpoint verifies the signature using the same secret key
4. If verification succeeds, the payload is processed

### JWT Payload Structure

The JWT token contains the webhook event data:

```json
{
  "iat": 1696339200,  // Issued at timestamp
  "exp": 1696342800,  // Expiration timestamp
  "body": {           // The actual webhook payload
    "call": { ... }
  }
}
```

## Webhook Payload Structure

The webhook payload can have different structures depending on the event type. The service handles multiple formats:

### Standard Format
```json
{
  "call": {
    "id": "1234567890",
    "direction": "inbound",
    "state": "completed",
    "date_started": 1696339200000,
    "date_ended": 1696339320000,
    "duration": 120,
    "external_number": "+1234567890",
    "internal_number": "+0987654321",
    "contact": {
      "id": "contact123",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    },
    "target": {
      "id": "user123",
      "name": "Jane Smith",
      "email": "jane@example.com"
    },
    "recordings": [
      {
        "id": "rec123",
        "url": "https://...",
        "duration": 118
      }
    ]
  }
}
```

### Alternative Formats

The service also handles these formats:

```json
{
  "data": {
    "call": { ... }
  }
}
```

```json
{
  "event": {
    "call": { ... }
  }
}
```

## Database Storage

Webhook events are stored in the same database tables as API-synced calls:

- **calls**: Main call records
- **contacts**: External contact information
- **users**: Internal user/target information
- **recording_details**: Call recording metadata
- **webhook_logs**: Webhook processing logs and audit trail

## Testing the Webhook

### Using curl (Development)

```bash
# Test without authentication (dev only)
curl -X POST http://localhost:3001/webhook/test \
  -H "Content-Type: application/json" \
  -d '{
    "call": {
      "id": "test123",
      "direction": "inbound",
      "duration": 120,
      "state": "completed",
      "external_number": "+1234567890",
      "date_started": 1696339200000,
      "date_ended": 1696339320000
    }
  }'
```

### Using curl (Production with JWT)

```bash
# Generate a test JWT token first (you'll need the secret)
# Then send the request
curl -X POST https://your-domain.com/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -d '{
    "call": { ... }
  }'
```

### Check Webhook Health

```bash
curl http://localhost:3001/webhook/health
```

### View Webhook Stats

```bash
curl http://localhost:3001/webhook/stats
```

### View Recent Logs

```bash
curl http://localhost:3001/webhook/logs?limit=20
```

## Troubleshooting

### Common Issues

#### 1. "Unauthorized" Error

**Problem:** JWT verification failed

**Solutions:**
- Verify the `WEBHOOK_SECRET` matches your Dialpad webhook configuration
- Check that the JWT token is properly formatted in the `Authorization` header
- Ensure the token hasn't expired

#### 2. "Empty webhook payload" Error

**Problem:** No call data in the webhook payload

**Solutions:**
- Check the webhook payload structure
- Verify Dialpad is sending the correct data format
- Review webhook logs to see the actual payload received

#### 3. Database Errors

**Problem:** Failed to insert call data

**Solutions:**
- Check database connection
- Verify database schema is up to date
- Check webhook logs for specific error messages

### Debugging Tips

1. **Enable Debug Logging**: Set `NODE_ENV=development` for detailed logs
2. **Check Webhook Logs**: Use `/webhook/logs` endpoint to see recent webhook events
3. **Monitor Statistics**: Use `/webhook/stats` to track success/failure rates
4. **Test Locally**: Use `/webhook/test` endpoint in development to test without JWT

### Log Locations

- Application logs: Console output (or configure morgan for file logging)
- Webhook processing logs: Database table `webhook_logs`
- Database query logs: Enable in PostgreSQL configuration

## Security Considerations

1. **JWT Secret**: Keep your `WEBHOOK_SECRET` secure and never commit it to version control
2. **HTTPS**: Always use HTTPS in production for webhook endpoints
3. **Rate Limiting**: Consider implementing rate limiting for production webhooks
4. **IP Whitelisting**: Optionally restrict webhook requests to Dialpad's IP ranges
5. **Payload Size**: The endpoint accepts payloads up to 10MB (configurable)

## Production Deployment

### Using Docker

The webhook endpoint is automatically available when running with Docker:

```bash
# Start services
docker-compose up -d

# Webhook is available at http://localhost:3001/webhook
```

### SSL/TLS Configuration

For production, configure a reverse proxy (nginx/Apache) with SSL:

```nginx
server {
    listen 443 ssl;
    server_name dp-call-logs.iceman.systems;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /webhook {
        proxy_pass http://localhost:3001/webhook;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Environment Setup

1. Copy `.env.example` to `.env`
2. Configure all required environment variables
3. Set `NODE_ENV=production`
4. Configure `WEBHOOK_SECRET` to match Dialpad settings
5. Restart the application

## Monitoring

### Key Metrics to Monitor

- **Success Rate**: Track via `/webhook/stats`
- **Response Time**: Monitor webhook endpoint latency
- **Error Rate**: Check `/webhook/logs` for failed events
- **Database Performance**: Monitor insert/update query times

### Recommended Monitoring Tools

- **Application Monitoring**: PM2, New Relic, or DataDog
- **Log Aggregation**: ELK Stack or Splunk
- **Uptime Monitoring**: UptimeRobot or Pingdom
- **Database Monitoring**: pgAdmin or PostgreSQL built-in tools

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review webhook logs: `/webhook/logs`
3. Check application logs
4. Verify Dialpad webhook configuration
5. Test with `/webhook/test` endpoint in development

## Additional Resources

- [Dialpad API Documentation](https://developers.dialpad.com/)
- [JWT Documentation](https://jwt.io/)
- [Express.js Documentation](https://expressjs.com/)
