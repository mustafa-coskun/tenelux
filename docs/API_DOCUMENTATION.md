# Tenebris Game API Documentation

## Overview

The Tenebris Game API provides comprehensive endpoints for user authentication, game management, social features, and enhanced game system functionality including trust scores, friend management, and party modes.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Most endpoints require authentication using Bearer tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your_session_token>
```

## Response Format

All API responses follow this standard format:

```json
{
  "success": true|false,
  "data": {...},
  "error": "Error message (if applicable)"
}
```

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- Authentication endpoints: 5 requests per minute per IP
- General endpoints: 100 requests per minute per user
- Admin endpoints: 20 requests per minute per IP

## API Endpoints

### Authentication

#### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "username": "string (3-20 characters)",
  "displayName": "string (max 50 characters)",
  "password": "string (min 6 characters)"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "number",
    "username": "string",
    "displayName": "string",
    "isGuest": false,
    "createdAt": "datetime"
  },
  "sessionToken": "string"
}
```

**Error Codes:**
- `400`: Invalid input data
- `409`: Username already exists
- `429`: Too many registration attempts

#### POST /api/auth/login
Authenticate existing user.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "number",
    "username": "string",
    "displayName": "string",
    "isGuest": false,
    "lastActive": "datetime"
  },
  "sessionToken": "string"
}
```

**Error Codes:**
- `401`: Invalid credentials
- `423`: Account temporarily locked
- `429`: Too many login attempts

#### POST /api/auth/guest
Create a guest user session.

**Request Body:**
```json
{
  "displayName": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "number",
    "displayName": "string",
    "isGuest": true
  },
  "sessionToken": "string"
}
```

#### POST /api/auth/logout
Invalidate current session.

**Request Body:**
```json
{
  "sessionToken": "string"
}
```

**Response:**
```json
{
  "success": true
}
```

### User Management

#### GET /api/user/profile
Get current user profile.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "user": {
    "id": "number",
    "username": "string",
    "displayName": "string",
    "avatar": "string",
    "stats": {
      "totalGames": "number",
      "wins": "number",
      "losses": "number",
      "trustScore": "number"
    }
  }
}
```

#### PUT /api/user/profile
Update user profile.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "displayName": "string (optional)",
  "avatar": "string (optional, max 10 chars)"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "number",
    "username": "string",
    "displayName": "string",
    "avatar": "string"
  }
}
```

### Game Statistics

#### GET /api/game/stats
Get basic game statistics for current user.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalGames": "number",
    "wins": "number",
    "losses": "number",
    "cooperations": "number",
    "betrayals": "number",
    "totalScore": "number",
    "winRate": "number",
    "trustScore": "number",
    "betrayalRate": "number"
  },
  "recentGames": [
    {
      "id": "number",
      "type": "string",
      "status": "string",
      "createdAt": "datetime",
      "completedAt": "datetime",
      "participantCount": "number"
    }
  ]
}
```

#### GET /api/game/stats/enhanced
Get enhanced game statistics with mode separation.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `mode` (optional): `single`, `multi`, or `party`

**Response:**
```json
{
  "success": true,
  "separateStats": {
    "singlePlayer": {
      "totalGames": "number",
      "wins": "number",
      "losses": "number",
      "averageScore": "number"
    },
    "multiplayer": {
      "totalGames": "number",
      "wins": "number",
      "losses": "number",
      "trustScore": "number",
      "cooperationRate": "number"
    },
    "party": {
      "totalGames": "number",
      "wins": "number",
      "losses": "number",
      "averagePartySize": "number"
    }
  }
}
```

### Trust Score System

#### GET /api/game/trust-score
Get current user's trust score and behavior statistics.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "trustScore": "number (0-100)",
  "behaviorStats": {
    "totalGames": "number",
    "silentGames": "number",
    "silenceRatio": "number",
    "trustScore": "number",
    "behaviorTrend": "improving|stable|declining"
  }
}
```

### Post-Game Modifications

#### POST /api/game/:gameId/modification
Submit a modification request for a completed game.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "request": {
    "type": "score_change|result_change|no_change",
    "details": "string",
    "newScore": "number (optional)",
    "newResult": "win|loss|draw (optional)"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Modification request submitted successfully"
}
```

#### GET /api/game/:gameId/modification
Get modification history for a game.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "modificationHistory": [
    {
      "id": "number",
      "playerId": "number",
      "request": "object",
      "timestamp": "datetime"
    }
  ],
  "status": {
    "applied": "boolean",
    "finalResult": "object"
  }
}
```

#### GET /api/game/:gameId/stats
Get post-game statistics (always displayed regardless of modifications).

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "stats": {
    "gameId": "number",
    "participants": "array",
    "originalResult": "object",
    "finalResult": "object",
    "modificationApplied": "boolean",
    "statistics": "object"
  }
}
```

### Enhanced Matchmaking

#### GET /api/matchmaking/stats
Get matchmaking queue statistics.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "enhancedStats": {
    "averageWaitTime": "number",
    "successfulMatches": "number",
    "queueSize": "number"
  },
  "serverStats": {
    "currentQueueSize": "number",
    "activeMatches": "number",
    "serverUptime": "number",
    "queueEntries": "array"
  }
}
```

#### POST /api/matchmaking/preferences
Update matchmaking preferences.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "preferences": {
    "gameMode": "single|multi|party",
    "maxWaitTime": "number (30000-600000ms)",
    "trustScoreTolerance": "number (5-50)",
    "skillLevelTolerance": "number (50-1000)"
  }
}
```

**Response:**
```json
{
  "success": true,
  "preferences": "object",
  "message": "Matchmaking preferences updated successfully"
}
```

#### GET /api/matchmaking/preferences
Get current matchmaking preferences.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "preferences": {
    "gameMode": "string",
    "maxWaitTime": "number",
    "trustScoreTolerance": "number",
    "skillLevelTolerance": "number"
  }
}
```

#### GET /api/matchmaking/queue-position/:playerId
Get current queue position for a player.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "inQueue": "boolean",
  "position": "number",
  "totalInQueue": "number",
  "waitTime": "number (seconds)",
  "estimatedWaitTime": "number (seconds)",
  "preferences": "object"
}
```

### Friend Management

#### GET /api/friends
Get current user's friends list.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "friends": [
    {
      "id": "number",
      "username": "string",
      "displayName": "string",
      "isOnline": "boolean",
      "lastSeen": "datetime",
      "trustScore": "number",
      "canInviteToParty": "boolean"
    }
  ]
}
```

#### GET /api/friends/requests
Get pending friend requests.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "requests": [
    {
      "id": "number",
      "fromUserId": "number",
      "fromUsername": "string",
      "fromDisplayName": "string",
      "status": "pending",
      "createdAt": "datetime"
    }
  ]
}
```

#### GET /api/friends/search
Search for users to add as friends.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `q`: Search query (minimum 2 characters)

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "number",
      "username": "string",
      "displayName": "string",
      "trustScore": "number",
      "friendshipStatus": "none|pending|friends|blocked"
    }
  ]
}
```

#### POST /api/friends/request
Send a friend request.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "userId": "number"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Friend request sent successfully"
}
```

#### POST /api/friends/accept
Accept a friend request.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "userId": "number"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Friend request accepted"
}
```

#### POST /api/friends/decline
Decline a friend request.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "userId": "number"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Friend request declined"
}
```

#### POST /api/friends/remove
Remove a friend.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "userId": "number"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Friend removed successfully"
}
```

#### POST /api/friends/block
Block a user.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "userId": "number"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User blocked successfully"
}
```

### Party Management

#### POST /api/party/create
Create a new party.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "settings": {
    "name": "string",
    "maxPlayers": "number (2-8)",
    "gameType": "string",
    "isPrivate": "boolean"
  }
}
```

**Response:**
```json
{
  "success": true,
  "party": {
    "id": "number",
    "code": "string",
    "hostId": "number",
    "members": "array",
    "settings": "object",
    "status": "waiting|playing|finished"
  }
}
```

#### POST /api/party/join
Join an existing party.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "partyCode": "string"
}
```

**Response:**
```json
{
  "success": true,
  "party": {
    "id": "number",
    "code": "string",
    "hostId": "number",
    "members": "array",
    "settings": "object",
    "status": "string"
  }
}
```

#### POST /api/party/leave
Leave current party.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Left party successfully"
}
```

#### GET /api/party/current
Get current party information.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "party": {
    "id": "number",
    "code": "string",
    "hostId": "number",
    "members": "array",
    "settings": "object",
    "status": "string"
  }
}
```

#### POST /api/party/start
Start a party game (host only).

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "gameSession": {
    "id": "number",
    "partyId": "number",
    "status": "starting",
    "participants": "array"
  }
}
```

#### GET /api/party/:partyId/status
Get party status.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "status": {
    "id": "number",
    "status": "waiting|playing|finished",
    "memberCount": "number",
    "maxMembers": "number",
    "currentGame": "object|null"
  }
}
```

### Lobby Management

#### POST /api/lobby/create
Create a multiplayer lobby.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "settings": {
    "maxPlayers": "number",
    "gameType": "string",
    "isPrivate": "boolean"
  }
}
```

**Response:**
```json
{
  "success": true,
  "lobby": {
    "id": "string",
    "code": "string",
    "hostPlayerId": "number",
    "settings": "object",
    "participants": "array",
    "status": "waiting_for_players"
  }
}
```

#### POST /api/lobby/join
Join a lobby by code.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "lobbyCode": "string"
}
```

**Response:**
```json
{
  "success": true,
  "lobby": {
    "id": "string",
    "code": "string",
    "participants": "array",
    "status": "string"
  }
}
```

#### POST /api/lobby/leave
Leave current lobby.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true
}
```

### Leaderboards

#### GET /api/leaderboard
Get game leaderboards.

**Query Parameters:**
- `limit`: Number of entries (1-100, default: 50)
- `filter`: `all`, `registered`, `thisWeek`, `thisMonth`

**Response:**
```json
{
  "users": [
    {
      "id": "number",
      "username": "string",
      "displayName": "string",
      "stats": {
        "totalScore": "number",
        "totalGames": "number",
        "winRate": "number"
      }
    }
  ]
}
```

### System Health

#### GET /api/health
Get system health status.

**Response:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "datetime",
  "uptime": "number",
  "memory": "object",
  "performance": "object",
  "database": "object",
  "version": "string",
  "environment": "string"
}
```

### Admin Endpoints

#### POST /api/admin/login
Admin authentication.

**Request Body:**
```json
{
  "username": "admin|moderator",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "token": "string",
  "user": {
    "id": "string",
    "username": "string",
    "role": "super_admin|moderator",
    "permissions": "array"
  },
  "expiresAt": "datetime"
}
```

#### GET /api/admin/stats
Get system statistics (admin only).

**Headers:** `Authorization: Bearer <admin_token>`

**Response:**
```json
{
  "users": {
    "total": "number",
    "registered": "number",
    "guests": "number",
    "active": "number"
  },
  "sessions": {
    "active": "number",
    "total": "number",
    "expired": "number"
  },
  "games": "object",
  "database": "object",
  "server": "object"
}
```

#### GET /api/admin/metrics
Get performance metrics (admin only).

**Headers:** `Authorization: Bearer <admin_token>`

**Response:**
```json
{
  "performance": "object",
  "database": "object",
  "server": {
    "uptime": "number",
    "memory": "object",
    "cpu": "object",
    "version": "string",
    "platform": "string"
  }
}
```

#### GET /api/admin/users
Get user list (admin only).

**Headers:** `Authorization: Bearer <admin_token>`

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `search`: Search query

**Response:**
```json
{
  "users": [
    {
      "id": "number",
      "username": "string",
      "displayName": "string",
      "isGuest": "boolean",
      "createdAt": "datetime",
      "lastActive": "datetime",
      "stats": "object"
    }
  ]
}
```

## Error Handling

### Standard Error Codes

- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required or invalid
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists
- `423 Locked`: Account temporarily locked
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Server not ready

### Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional error details (optional)"
}
```

## WebSocket Events

The API also supports real-time communication via WebSocket for:

- Live game updates
- Party synchronization
- Friend status changes
- Matchmaking notifications
- Chat messages

WebSocket connection endpoint: `ws://localhost:3000`

## Security Considerations

- All passwords are hashed using bcrypt
- Session tokens expire after 24 hours (4 hours for guests)
- Rate limiting prevents abuse
- Input sanitization prevents XSS attacks
- SQL injection protection via parameterized queries
- CORS protection for cross-origin requests

## SDK and Integration

For easier integration, consider using the official Tenebris Game SDK (coming soon) which provides:

- Type-safe API client
- Automatic token management
- WebSocket event handling
- Error handling utilities
- Request/response validation