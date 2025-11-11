# Tenebris Game Troubleshooting Guide

## Overview

This guide provides solutions to common issues encountered when using the Enhanced Game System features including trust scores, friend management, party modes, and advanced matchmaking.

## Common Issues and Solutions

### Authentication Issues

#### Issue: "Authentication required" error
**Symptoms:**
- API calls return 401 Unauthorized
- User gets logged out unexpectedly
- Session token appears invalid

**Solutions:**
1. **Check token expiration:**
   ```javascript
   // Verify token is not expired
   const token = localStorage.getItem('tenebris_token');
   if (!token) {
     // Redirect to login
     window.location.href = '/login';
   }
   ```

2. **Refresh session:**
   ```javascript
   try {
     await client.request('/user/profile');
   } catch (error) {
     if (error.message.includes('Authentication')) {
       // Clear invalid token and redirect
       localStorage.removeItem('tenebris_token');
       window.location.href = '/login';
     }
   }
   ```

3. **Check token format:**
   ```javascript
   // Ensure Bearer prefix is included
   headers: {
     'Authorization': `Bearer ${token}` // Not just token
   }
   ```

#### Issue: "Rate limit exceeded" during login
**Symptoms:**
- 429 Too Many Requests error
- Cannot login after multiple attempts
- Temporary lockout message

**Solutions:**
1. **Wait for rate limit reset:**
   - Wait 5-10 minutes before attempting again
   - Rate limits reset automatically

2. **Implement exponential backoff:**
   ```javascript
   async function loginWithBackoff(username, password, attempt = 1) {
     try {
       return await client.login(username, password);
     } catch (error) {
       if (error.message.includes('rate limit') && attempt < 3) {
         const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
         await new Promise(resolve => setTimeout(resolve, delay));
         return loginWithBackoff(username, password, attempt + 1);
       }
       throw error;
     }
   }
   ```

### Trust Score Issues

#### Issue: Trust score not updating after games
**Symptoms:**
- Trust score remains the same after multiple games
- Behavior statistics not reflecting recent gameplay
- Silent games not being tracked

**Diagnostic Steps:**
1. **Check game mode:**
   ```javascript
   // Verify game is multiplayer or party mode
   const gameStats = await client.request('/game/stats/enhanced?mode=multi');
   console.log('Multiplayer games:', gameStats.stats.totalGames);
   ```

2. **Verify silence tracking:**
   ```javascript
   const trustData = await client.request('/game/trust-score');
   console.log('Silence ratio:', trustData.behaviorStats.silenceRatio);
   console.log('Total games:', trustData.behaviorStats.totalGames);
   ```

**Solutions:**
1. **Ensure proper game completion:**
   - Games must be completed (not abandoned)
   - Both players must finish the game
   - Game mode must be 'multi' or 'party'

2. **Check server-side processing:**
   ```javascript
   // Verify game result was processed
   const recentGames = await client.request('/game/stats');
   console.log('Recent games:', recentGames.recentGames);
   ```

#### Issue: Trust score calculation seems incorrect
**Symptoms:**
- Trust score doesn't match expected value
- Inconsistent behavior statistics
- Trust score changes unexpectedly

**Diagnostic Steps:**
1. **Understand calculation method:**
   - Trust score is based on silence ratio relative to all players
   - Score ranges from 0-100
   - Higher silence ratio = higher trust score

2. **Check calculation manually:**
   ```javascript
   const behaviorStats = await client.request('/game/trust-score');
   const expectedRatio = behaviorStats.silentGames / behaviorStats.totalGames;
   console.log('Expected silence ratio:', expectedRatio);
   console.log('Actual silence ratio:', behaviorStats.silenceRatio);
   ```

**Solutions:**
1. **Wait for sufficient data:**
   - Trust score accuracy improves with more games
   - Minimum 10 games recommended for stable score

2. **Contact support if calculation is clearly wrong:**
   - Provide game IDs and expected vs actual scores
   - Include behavior statistics for review

### Friend Management Issues

#### Issue: Friend requests not being sent/received
**Symptoms:**
- Friend request appears to send but recipient doesn't receive it
- No notification of incoming friend requests
- Friend request status shows as pending indefinitely

**Diagnostic Steps:**
1. **Check friend request status:**
   ```javascript
   const requests = await client.request('/friends/requests');
   console.log('Pending requests:', requests.requests);
   ```

2. **Verify user exists:**
   ```javascript
   const searchResults = await client.request('/friends/search?q=username');
   console.log('User found:', searchResults.users.length > 0);
   ```

**Solutions:**
1. **Check for existing relationship:**
   ```javascript
   // User might already be a friend or blocked
   const friends = await client.request('/friends');
   const isAlreadyFriend = friends.friends.some(f => f.id === targetUserId);
   ```

2. **Refresh friend requests:**
   ```javascript
   // Manually refresh to check for new requests
   await refreshFriendRequests();
   ```

3. **Check WebSocket connection:**
   ```javascript
   // Ensure real-time notifications are working
   if (websocket.ws.readyState !== WebSocket.OPEN) {
     websocket.connect();
   }
   ```

#### Issue: Cannot remove or block friends
**Symptoms:**
- Remove friend button doesn't work
- Block user functionality fails
- Friend still appears in list after removal

**Solutions:**
1. **Check API response:**
   ```javascript
   try {
     await client.request('/friends/remove', {
       method: 'POST',
       body: JSON.stringify({ userId: friendId })
     });
     // Refresh friends list
     await refreshFriendsList();
   } catch (error) {
     console.error('Remove friend error:', error);
   }
   ```

2. **Clear local cache:**
   ```javascript
   // Clear cached friends data
   localStorage.removeItem('cached_friends');
   await loadFriendsFromServer();
   ```

### Party System Issues

#### Issue: Cannot create or join parties
**Symptoms:**
- Party creation fails with no error message
- Join party by code doesn't work
- Party code appears invalid

**Diagnostic Steps:**
1. **Check party code format:**
   ```javascript
   // Party codes are typically 6-8 characters, alphanumeric
   const isValidCode = /^[A-Z0-9]{6,8}$/.test(partyCode.toUpperCase());
   ```

2. **Verify user isn't already in a party:**
   ```javascript
   const currentParty = await client.request('/party/current');
   if (currentParty.party) {
     console.log('Already in party:', currentParty.party.id);
   }
   ```

**Solutions:**
1. **Leave existing party first:**
   ```javascript
   try {
     await client.request('/party/leave', { method: 'POST' });
   } catch (error) {
     // Ignore if not in a party
   }
   ```

2. **Validate party settings:**
   ```javascript
   const validSettings = {
     name: 'My Party',
     maxPlayers: Math.min(Math.max(settings.maxPlayers, 2), 8),
     gameType: 'standard',
     isPrivate: Boolean(settings.isPrivate)
   };
   ```

#### Issue: Party members not synchronizing
**Symptoms:**
- Member list shows different players for different users
- Host changes not reflected for all members
- Party status inconsistent

**Solutions:**
1. **Check WebSocket connection:**
   ```javascript
   // Ensure all party members have active WebSocket connections
   websocket.on('PARTY_UPDATED', (data) => {
     updatePartyDisplay(data.party);
   });
   ```

2. **Force party refresh:**
   ```javascript
   const party = await client.request('/party/current');
   updatePartyDisplay(party.party);
   ```

3. **Handle connection drops:**
   ```javascript
   websocket.on('disconnect', () => {
     // Show reconnection indicator
     showReconnectingMessage();
   });
   
   websocket.on('reconnect', async () => {
     // Refresh party state
     await refreshPartyState();
     hideReconnectingMessage();
   });
   ```

### Matchmaking Issues

#### Issue: Long wait times or no matches found
**Symptoms:**
- Matchmaking takes longer than expected
- No suitable opponents found message
- Queue position doesn't change

**Diagnostic Steps:**
1. **Check queue status:**
   ```javascript
   const queueStatus = await client.request('/matchmaking/queue-position/123');
   console.log('Queue position:', queueStatus.position);
   console.log('Estimated wait:', queueStatus.estimatedWaitTime);
   ```

2. **Review matchmaking preferences:**
   ```javascript
   const preferences = await client.request('/matchmaking/preferences');
   console.log('Current preferences:', preferences.preferences);
   ```

**Solutions:**
1. **Adjust preferences for faster matching:**
   ```javascript
   const relaxedPreferences = {
     gameMode: 'multi',
     maxWaitTime: 600000, // 10 minutes
     trustScoreTolerance: 30, // Wider range
     skillLevelTolerance: 500 // Wider range
   };
   
   await client.request('/matchmaking/preferences', {
     method: 'POST',
     body: JSON.stringify({ preferences: relaxedPreferences })
   });
   ```

2. **Check server population:**
   ```javascript
   const stats = await client.request('/matchmaking/stats');
   console.log('Current queue size:', stats.serverStats.currentQueueSize);
   ```

#### Issue: Matched with inappropriate skill levels
**Symptoms:**
- Consistently matched with much stronger/weaker players
- Trust score differences too large
- Unfair game experiences

**Solutions:**
1. **Tighten matchmaking preferences:**
   ```javascript
   const strictPreferences = {
     trustScoreTolerance: 10, // Narrower range
     skillLevelTolerance: 100, // Narrower range
     maxWaitTime: 300000 // Accept longer wait times
   };
   ```

2. **Check trust score accuracy:**
   ```javascript
   const trustScore = await client.request('/game/trust-score');
   // Ensure your trust score is accurate before matchmaking
   ```

### Post-Game Modification Issues

#### Issue: Modification requests not being processed
**Symptoms:**
- Submitted modification request but no response
- Both players submitted requests but no changes applied
- Modification status shows as pending indefinitely

**Diagnostic Steps:**
1. **Check modification history:**
   ```javascript
   const history = await client.request(`/game/${gameId}/modification`);
   console.log('Modification requests:', history.modificationHistory);
   console.log('Current status:', history.status);
   ```

2. **Verify both players submitted requests:**
   ```javascript
   // Both players must submit matching requests for changes to apply
   const bothPlayersSubmitted = history.modificationHistory.length >= 2;
   ```

**Solutions:**
1. **Ensure matching requests:**
   ```javascript
   // Both players must request the same modification type
   const player1Request = { type: 'score_change', newScore: 150 };
   const player2Request = { type: 'score_change', newScore: 150 };
   // These would be processed
   ```

2. **Check modification window:**
   ```javascript
   // Modifications must be submitted within time limit (usually 24 hours)
   const gameAge = Date.now() - new Date(gameResult.completedAt).getTime();
   const isWithinWindow = gameAge < 24 * 60 * 60 * 1000; // 24 hours
   ```

#### Issue: Post-game statistics not displaying
**Symptoms:**
- Statistics screen doesn't appear after game
- Empty or missing game data
- Error loading post-game information

**Solutions:**
1. **Force statistics refresh:**
   ```javascript
   try {
     const stats = await client.request(`/game/${gameId}/stats`);
     displayPostGameStats(stats.stats);
   } catch (error) {
     console.error('Failed to load post-game stats:', error);
     showErrorMessage('Unable to load game statistics');
   }
   ```

2. **Check game completion status:**
   ```javascript
   // Ensure game was properly completed
   const gameData = await client.request(`/game/${gameId}/stats`);
   if (!gameData.stats.completedAt) {
     console.log('Game not properly completed');
   }
   ```

### Performance Issues

#### Issue: Slow API responses
**Symptoms:**
- Long loading times for friends list, stats, etc.
- Timeouts on API requests
- UI feels sluggish

**Solutions:**
1. **Implement caching:**
   ```javascript
   class CachedClient extends TenebrisClient {
     constructor() {
       super();
       this.cache = new Map();
     }
   
     async cachedRequest(endpoint, options = {}, ttl = 300000) {
       const cacheKey = `${endpoint}_${JSON.stringify(options)}`;
       const cached = this.cache.get(cacheKey);
       
       if (cached && Date.now() - cached.timestamp < ttl) {
         return cached.data;
       }
       
       const data = await this.request(endpoint, options);
       this.cache.set(cacheKey, { data, timestamp: Date.now() });
       return data;
     }
   }
   ```

2. **Use request batching:**
   ```javascript
   // Batch multiple requests together
   const [friends, stats, trustScore] = await Promise.all([
     client.request('/friends'),
     client.request('/game/stats/enhanced'),
     client.request('/game/trust-score')
   ]);
   ```

3. **Implement pagination:**
   ```javascript
   // Load friends list in chunks
   async function loadFriendsPaginated(page = 1, limit = 20) {
     return await client.request(`/friends?page=${page}&limit=${limit}`);
   }
   ```

#### Issue: Memory leaks in WebSocket connections
**Symptoms:**
- Browser memory usage increases over time
- Multiple WebSocket connections
- Performance degrades during long sessions

**Solutions:**
1. **Proper cleanup:**
   ```javascript
   class WebSocketManager {
     disconnect() {
       if (this.ws) {
         this.ws.close();
         this.ws = null;
       }
       this.eventHandlers.clear();
     }
   }
   
   // Clean up on page unload
   window.addEventListener('beforeunload', () => {
     websocketManager.disconnect();
   });
   ```

2. **Prevent duplicate connections:**
   ```javascript
   connect() {
     if (this.ws && this.ws.readyState === WebSocket.OPEN) {
       return; // Already connected
     }
     // ... connection logic
   }
   ```

### Database and Server Issues

#### Issue: "Server not ready" errors
**Symptoms:**
- 503 Service Unavailable responses
- Database connection errors
- Intermittent API failures

**Solutions:**
1. **Implement retry logic:**
   ```javascript
   async function requestWithRetry(requestFn, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await requestFn();
       } catch (error) {
         if (error.message.includes('Server not ready') && i < maxRetries - 1) {
           await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
           continue;
         }
         throw error;
       }
     }
   }
   ```

2. **Check server health:**
   ```javascript
   const health = await client.request('/health');
   if (health.status !== 'healthy') {
     showMaintenanceMessage();
   }
   ```

#### Issue: Data inconsistency between client and server
**Symptoms:**
- Local data doesn't match server data
- Stale information displayed
- Sync issues after reconnection

**Solutions:**
1. **Force data refresh:**
   ```javascript
   async function forceRefresh() {
     // Clear all caches
     localStorage.clear();
     sessionStorage.clear();
     
     // Reload data from server
     await loadUserData();
   }
   ```

2. **Implement data validation:**
   ```javascript
   function validateData(localData, serverData) {
     const isValid = localData.lastUpdated <= serverData.lastUpdated;
     if (!isValid) {
       console.warn('Local data is stale, refreshing...');
       return serverData;
     }
     return localData;
   }
   ```

## Debugging Tools

### 1. API Request Logger

```javascript
class APILogger {
  static log(method, url, data, response) {
    if (process.env.NODE_ENV === 'development') {
      console.group(`API ${method} ${url}`);
      console.log('Request:', data);
      console.log('Response:', response);
      console.groupEnd();
    }
  }
}
```

### 2. WebSocket Event Monitor

```javascript
class WebSocketMonitor {
  constructor(websocket) {
    this.websocket = websocket;
    this.events = [];
  }

  monitor() {
    const originalOn = this.websocket.on.bind(this.websocket);
    
    this.websocket.on = (eventType, handler) => {
      const wrappedHandler = (data) => {
        this.events.push({
          type: eventType,
          data: data,
          timestamp: new Date()
        });
        
        console.log(`WebSocket Event: ${eventType}`, data);
        return handler(data);
      };
      
      return originalOn(eventType, wrappedHandler);
    };
  }

  getEventHistory() {
    return this.events;
  }
}
```

### 3. Performance Monitor

```javascript
class PerformanceMonitor {
  static measureApiCall(name, apiCall) {
    return async (...args) => {
      const start = performance.now();
      try {
        const result = await apiCall(...args);
        const duration = performance.now() - start;
        console.log(`API Call ${name}: ${duration.toFixed(2)}ms`);
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        console.error(`API Call ${name} failed after ${duration.toFixed(2)}ms:`, error);
        throw error;
      }
    };
  }
}
```

## Getting Help

### 1. Enable Debug Mode

```javascript
// Add to your application initialization
window.TENEBRIS_DEBUG = true;

// This will enable additional logging and debugging features
```

### 2. Collect Diagnostic Information

```javascript
function collectDiagnostics() {
  return {
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    token: localStorage.getItem('tenebris_token') ? 'present' : 'missing',
    websocketState: websocket.ws ? websocket.ws.readyState : 'not initialized',
    cacheSize: Object.keys(localStorage).length,
    apiErrors: getRecentApiErrors(),
    performanceMetrics: getPerformanceMetrics()
  };
}
```

### 3. Report Issues

When reporting issues, include:
- Steps to reproduce the problem
- Expected vs actual behavior
- Browser and version
- Diagnostic information from `collectDiagnostics()`
- Console errors and network requests
- Screenshots if applicable

### 4. Contact Support

- GitHub Issues: [Repository Issues Page]
- Email: support@tenebris-game.com
- Discord: [Community Server]
- Documentation: [Online Documentation]

Remember to never include sensitive information like passwords or full session tokens in bug reports.