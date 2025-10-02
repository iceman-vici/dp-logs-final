# API Documentation

## Base URL

```
http://localhost:3001/api
```

## Authentication

Currently, the API does not require authentication. In production, implement JWT or OAuth2.

## Endpoints

### Calls

#### Get Recent Calls

```http
GET /calls
```

**Query Parameters:**
- `limit` (optional): Number of calls to return (default: 10)
- `offset` (optional): Number of calls to skip for pagination (default: 0)

**Response:**
```json
[
  {
    "call_id": "string",
    "contact_name": "string",
    "target_name": "string",
    "direction": "inbound|outbound",
    "duration": 12345,
    "duration_formatted": "2m 5s",
    "state": "completed|missed|abandoned",
    "started_at": "2024-01-01T10:00:00Z",
    ...
  }
]
```

#### Get Call by ID

```http
GET /calls/:id
```

**Response:**
```json
{
  "call_id": "string",
  "contact_id": "string",
  "target_id": "string",
  "direction": "inbound|outbound",
  "duration": 12345,
  "state": "completed",
  ...
}
```

### Statistics

#### Get User Statistics

```http
GET /stats/users
```

**Query Parameters:**
- `limit` (optional): Number of users to return (default: 10)

**Response:**
```json
[
  {
    "user": "John Doe",
    "calls": 150,
    "total_duration": "25m 30s",
    "avg_duration": "3m 15s",
    "placed": 80,
    "answered": 60,
    "missed_total": 10,
    ...
  }
]
```

#### Get Call Summary

```http
GET /stats/summary
```

**Response:**
```json
{
  "total_calls": 1000,
  "unique_contacts": 250,
  "unique_users": 25,
  "avg_duration_seconds": 180,
  "completed_calls": 850,
  "missed_calls": 100,
  "recorded_calls": 500
}
```

### Synchronization

#### Download Calls from Dialpad

```http
GET /sync/download
```

**Query Parameters:**
- `from` (required): Start date in ISO format (NY timezone)
- `to` (required): End date in ISO format (NY timezone)
- `limit` (optional): Maximum number of calls to fetch (default: 50)

**Response:**
```json
{
  "success": true,
  "inserted": 45,
  "total": 50,
  "message": "Downloaded and inserted 45 out of 50 calls",
  "errors": []
}
```

#### Sync All Calls

```http
POST /sync/all
```

**Response:**
```json
{
  "message": "Full sync endpoint - to be implemented"
}
```

### Health Check

#### Get API Health Status

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T10:00:00Z"
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

### Common HTTP Status Codes

- `200 OK`: Successful request
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## Rate Limiting

The API implements rate limiting:
- Window: 15 minutes
- Maximum requests: 100 per window

Exceeding the rate limit will return a `429 Too Many Requests` status.

## Examples

### cURL Examples

#### Get recent calls:
```bash
curl http://localhost:3001/api/calls?limit=5
```

#### Download calls for a date range:
```bash
curl "http://localhost:3001/api/sync/download?from=2024-01-01T00:00:00&to=2024-01-02T23:59:59"
```

#### Get user statistics:
```bash
curl http://localhost:3001/api/stats/users?limit=10
```