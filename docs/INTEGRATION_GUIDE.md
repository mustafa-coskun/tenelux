# Tenebris Game Integration Guide

## Overview

This guide provides comprehensive instructions for integrating with the Tenebris Game Enhanced System, including trust scores, friend management, party modes, and advanced matchmaking.

## Quick Start

### 1. Authentication Setup

```javascript
// Initialize API client
const API_BASE = 'http://localhost:3000/api';

class TenebrisClient {
  constructor() {
    this.token = localStorage.getItem('tenebris_token');
    this.baseURL = API_BASE;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...options.headers
      },
      ...options
    };

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  }

  async login(username, password) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    this.token = response.sessionToken;
    localStorage.setItem('tenebris_token', this.token);
    return response;
  }

  async register(username, displayName, password) {
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password })
    });

    this.token = response.sessionToken;
    localStorage.setItem('tenebris_token', this.token);
    return response;
  }

  async guestLogin(displayName) {
    const response = await this.request('/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ displayName })
    });

    this.token = response.sessionToken;
    localStorage.setItem('tenebris_token', this.token);
    return response;
  }
}

// Usage
const client = new TenebrisClient();
```

### 2. Trust Score Integration

```javascript
class TrustScoreManager {
  constructor(client) {
    this.client = client;
  }

  async getTrustScore() {
    return await this.client.request('/game/trust-score');
  }

  async getBehaviorStats() {
    const response = await this.getTrustScore();
    return response.behaviorStats;
  }

  // Display trust score with visual indicator
  renderTrustScore(trustScore) {
    const color = this.getTrustScoreColor(trustScore);
    const level = this.getTrustScoreLevel(trustScore);
    
    return `
      <div class="trust-score" style="color: ${color}">
        <span class="score">${trustScore}</span>
        <span class="level">${level}</span>
      </div>
    `;
  }

  getTrustScoreColor(score) {
    if (score >= 80) return '#4CAF50'; // Green
    if (score >= 60) return '#FF9800'; // Orange
    if (score >= 40) return '#FFC107'; // Yellow
    return '#F44336'; // Red
  }

  getTrustScoreLevel(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Very Good';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 50) return 'Average';
    if (score >= 40) return 'Below Average';
    return 'Poor';
  }
}
```

### 3. Enhanced Statistics Integration

```javascript
class GameStatsManager {
  constructor(client) {
    this.client = client;
  }

  async getBasicStats() {
    return await this.client.request('/game/stats');
  }

  async getEnhancedStats(mode = null) {
    const endpoint = mode ? `/game/stats/enhanced?mode=${mode}` : '/game/stats/enhanced';
    return await this.client.request(endpoint);
  }

  async renderSeparateStats() {
    const response = await this.getEnhancedStats();
    const { separateStats } = response;

    return `
      <div class="stats-container">
        <div class="stats-mode">
          <h3>Single Player</h3>
          <div class="stats-grid">
            <div>Games: ${separateStats.singlePlayer.totalGames}</div>
            <div>Wins: ${separateStats.singlePlayer.wins}</div>
            <div>Win Rate: ${(separateStats.singlePlayer.wins / separateStats.singlePlayer.totalGames * 100).toFixed(1)}%</div>
          </div>
        </div>
        
        <div class="stats-mode">
          <h3>Multiplayer</h3>
          <div class="stats-grid">
            <div>Games: ${separateStats.multiplayer.totalGames}</div>
            <div>Wins: ${separateStats.multiplayer.wins}</div>
            <div>Trust Score: ${separateStats.multiplayer.trustScore}</div>
            <div>Cooperation Rate: ${(separateStats.multiplayer.cooperationRate * 100).toFixed(1)}%</div>
          </div>
        </div>
        
        <div class="stats-mode">
          <h3>Party Games</h3>
          <div class="stats-grid">
            <div>Games: ${separateStats.party.totalGames}</div>
            <div>Wins: ${separateStats.party.wins}</div>
            <div>Avg Party Size: ${separateStats.party.averagePartySize}</div>
          </div>
        </div>
      </div>
    `;
  }
}
```

### 4. Friend Management Integration

```javascript
class FriendManager {
  constructor(client) {
    this.client = client;
  }

  async getFriends() {
    return await this.client.request('/friends');
  }

  async getFriendRequests() {
    return await this.client.request('/friends/requests');
  }

  async searchUsers(query) {
    return await this.client.request(`/friends/search?q=${encodeURIComponent(query)}`);
  }

  async sendFriendRequest(userId) {
    return await this.client.request('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  async acceptFriendRequest(requestId) {
    return await this.client.request('/friends/accept', {
      method: 'POST',
      body: JSON.stringify({ userId: requestId })
    });
  }

  async declineFriendRequest(requestId) {
    return await this.client.request('/friends/decline', {
      method: 'POST',
      body: JSON.stringify({ userId: requestId })
    });
  }

  async removeFriend(friendId) {
    return await this.client.request('/friends/remove', {
      method: 'POST',
      body: JSON.stringify({ userId: friendId })
    });
  }

  async blockUser(userId) {
    return await this.client.request('/friends/block', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  // Render friends list with online status
  renderFriendsList(friends) {
    return friends.map(friend => `
      <div class="friend-item ${friend.isOnline ? 'online' : 'offline'}">
        <div class="friend-info">
          <span class="name">${friend.displayName}</span>
          <span class="status">${friend.isOnline ? 'Online' : 'Offline'}</span>
          <span class="trust-score">Trust: ${friend.trustScore}</span>
        </div>
        <div class="friend-actions">
          ${friend.canInviteToParty ? '<button onclick="inviteToParty(' + friend.id + ')">Invite</button>' : ''}
          <button onclick="removeFriend(${friend.id})">Remove</button>
        </div>
      </div>
    `).join('');
  }
}
```

### 5. Party System Integration

```javascript
class PartyManager {
  constructor(client) {
    this.client = client;
  }

  async createParty(settings) {
    return await this.client.request('/party/create', {
      method: 'POST',
      body: JSON.stringify({ settings })
    });
  }

  async joinParty(partyCode) {
    return await this.client.request('/party/join', {
      method: 'POST',
      body: JSON.stringify({ partyCode })
    });
  }

  async leaveParty() {
    return await this.client.request('/party/leave', {
      method: 'POST'
    });
  }

  async getCurrentParty() {
    return await this.client.request('/party/current');
  }

  async startPartyGame() {
    return await this.client.request('/party/start', {
      method: 'POST'
    });
  }

  async getPartyStatus(partyId) {
    return await this.client.request(`/party/${partyId}/status`);
  }

  // Render party interface
  renderPartyInterface(party, isHost) {
    return `
      <div class="party-container">
        <div class="party-header">
          <h3>Party: ${party.settings.name}</h3>
          <span class="party-code">Code: ${party.code}</span>
        </div>
        
        <div class="party-members">
          ${party.members.map(member => `
            <div class="member ${member.isHost ? 'host' : ''}">
              <span class="name">${member.displayName}</span>
              ${member.isHost ? '<span class="host-badge">Host</span>' : ''}
              ${isHost && !member.isHost ? '<button onclick="kickMember(' + member.id + ')">Kick</button>' : ''}
            </div>
          `).join('')}
        </div>
        
        <div class="party-actions">
          ${isHost ? '<button onclick="startGame()">Start Game</button>' : ''}
          <button onclick="leaveParty()">Leave Party</button>
        </div>
      </div>
    `;
  }
}
```

### 6. Enhanced Matchmaking Integration

```javascript
class MatchmakingManager {
  constructor(client) {
    this.client = client;
  }

  async getMatchmakingStats() {
    return await this.client.request('/matchmaking/stats');
  }

  async updatePreferences(preferences) {
    return await this.client.request('/matchmaking/preferences', {
      method: 'POST',
      body: JSON.stringify({ preferences })
    });
  }

  async getPreferences() {
    return await this.client.request('/matchmaking/preferences');
  }

  async getQueuePosition(playerId) {
    return await this.client.request(`/matchmaking/queue-position/${playerId}`);
  }

  // Render matchmaking preferences
  renderPreferencesForm(currentPreferences) {
    return `
      <form class="matchmaking-preferences">
        <div class="preference-group">
          <label>Game Mode:</label>
          <select name="gameMode" value="${currentPreferences.gameMode}">
            <option value="single">Single Player</option>
            <option value="multi">Multiplayer</option>
            <option value="party">Party Mode</option>
          </select>
        </div>
        
        <div class="preference-group">
          <label>Max Wait Time:</label>
          <input type="range" name="maxWaitTime" 
                 min="30000" max="600000" step="30000"
                 value="${currentPreferences.maxWaitTime}">
          <span>${Math.round(currentPreferences.maxWaitTime / 1000)}s</span>
        </div>
        
        <div class="preference-group">
          <label>Trust Score Tolerance:</label>
          <input type="range" name="trustScoreTolerance" 
                 min="5" max="50" step="5"
                 value="${currentPreferences.trustScoreTolerance}">
          <span>±${currentPreferences.trustScoreTolerance}</span>
        </div>
        
        <div class="preference-group">
          <label>Skill Level Tolerance:</label>
          <input type="range" name="skillLevelTolerance" 
                 min="50" max="1000" step="50"
                 value="${currentPreferences.skillLevelTolerance}">
          <span>±${currentPreferences.skillLevelTolerance}</span>
        </div>
        
        <button type="submit">Update Preferences</button>
      </form>
    `;
  }
}
```

### 7. Post-Game Modification Integration

```javascript
class PostGameManager {
  constructor(client) {
    this.client = client;
  }

  async submitModification(gameId, request) {
    return await this.client.request(`/game/${gameId}/modification`, {
      method: 'POST',
      body: JSON.stringify({ request })
    });
  }

  async getModificationHistory(gameId) {
    return await this.client.request(`/game/${gameId}/modification`);
  }

  async getPostGameStats(gameId) {
    return await this.client.request(`/game/${gameId}/stats`);
  }

  // Render post-game modification interface
  renderModificationInterface(gameId, gameResult) {
    return `
      <div class="post-game-modification">
        <h3>Game Result Modification</h3>
        
        <div class="game-stats">
          <h4>Game Statistics (Always Displayed)</h4>
          <div class="stats-display">
            <div>Your Score: ${gameResult.yourScore}</div>
            <div>Opponent Score: ${gameResult.opponentScore}</div>
            <div>Result: ${gameResult.result}</div>
            <div>Duration: ${gameResult.duration}s</div>
          </div>
        </div>
        
        <div class="modification-options">
          <h4>Request Modification</h4>
          <form onsubmit="submitModification(event, '${gameId}')">
            <div class="option">
              <input type="radio" name="modificationType" value="no_change" checked>
              <label>No changes needed</label>
            </div>
            
            <div class="option">
              <input type="radio" name="modificationType" value="score_change">
              <label>Score adjustment needed</label>
              <input type="number" name="newScore" placeholder="New score">
            </div>
            
            <div class="option">
              <input type="radio" name="modificationType" value="result_change">
              <label>Result change needed</label>
              <select name="newResult">
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="draw">Draw</option>
              </select>
            </div>
            
            <div class="details">
              <label>Reason for modification:</label>
              <textarea name="details" placeholder="Explain why this modification is needed..."></textarea>
            </div>
            
            <button type="submit">Submit Request</button>
          </form>
        </div>
      </div>
    `;
  }
}
```

### 8. WebSocket Integration

```javascript
class WebSocketManager {
  constructor(client) {
    this.client = client;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.eventHandlers = new Map();
  }

  connect() {
    const wsUrl = `ws://localhost:3000?token=${this.client.token}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  handleMessage(data) {
    const handler = this.eventHandlers.get(data.type);
    if (handler) {
      handler(data);
    }
  }

  on(eventType, handler) {
    this.eventHandlers.set(eventType, handler);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect();
      }, 1000 * this.reconnectAttempts);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

### 9. Complete Integration Example

```javascript
class TenebrisGameApp {
  constructor() {
    this.client = new TenebrisClient();
    this.trustScore = new TrustScoreManager(this.client);
    this.gameStats = new GameStatsManager(this.client);
    this.friends = new FriendManager(this.client);
    this.party = new PartyManager(this.client);
    this.matchmaking = new MatchmakingManager(this.client);
    this.postGame = new PostGameManager(this.client);
    this.websocket = new WebSocketManager(this.client);
    
    this.init();
  }

  async init() {
    // Check for existing session
    if (this.client.token) {
      try {
        await this.loadUserData();
        this.setupWebSocket();
      } catch (error) {
        console.error('Session validation failed:', error);
        this.showLoginForm();
      }
    } else {
      this.showLoginForm();
    }
  }

  async loadUserData() {
    const [profile, trustScore, stats, friends] = await Promise.all([
      this.client.request('/user/profile'),
      this.trustScore.getTrustScore(),
      this.gameStats.getEnhancedStats(),
      this.friends.getFriends()
    ]);

    this.renderDashboard(profile.user, trustScore, stats, friends.friends);
  }

  setupWebSocket() {
    this.websocket.connect();
    
    // Handle real-time events
    this.websocket.on('FRIEND_REQUEST_RECEIVED', (data) => {
      this.showNotification(`Friend request from ${data.fromUsername}`);
      this.refreshFriendRequests();
    });

    this.websocket.on('PARTY_INVITATION', (data) => {
      this.showPartyInvitation(data);
    });

    this.websocket.on('MATCH_FOUND', (data) => {
      this.showMatchFound(data);
    });

    this.websocket.on('TRUST_SCORE_UPDATED', (data) => {
      this.updateTrustScoreDisplay(data.newScore);
    });
  }

  renderDashboard(user, trustScore, stats, friends) {
    const dashboardHTML = `
      <div class="dashboard">
        <header class="user-header">
          <h1>Welcome, ${user.displayName}</h1>
          <div class="trust-score-display">
            ${this.trustScore.renderTrustScore(trustScore.trustScore)}
          </div>
        </header>
        
        <div class="dashboard-grid">
          <section class="stats-section">
            <h2>Game Statistics</h2>
            ${await this.gameStats.renderSeparateStats()}
          </section>
          
          <section class="friends-section">
            <h2>Friends</h2>
            <div class="friends-list">
              ${this.friends.renderFriendsList(friends)}
            </div>
          </section>
          
          <section class="party-section">
            <h2>Party</h2>
            <button onclick="createParty()">Create Party</button>
            <button onclick="joinParty()">Join Party</button>
          </section>
          
          <section class="matchmaking-section">
            <h2>Find Match</h2>
            <button onclick="findMatch()">Find Match</button>
            <button onclick="showPreferences()">Preferences</button>
          </section>
        </div>
      </div>
    `;

    document.getElementById('app').innerHTML = dashboardHTML;
  }

  showNotification(message) {
    // Implementation for showing notifications
    console.log('Notification:', message);
  }

  async refreshFriendRequests() {
    const requests = await this.friends.getFriendRequests();
    // Update UI with new friend requests
  }

  showPartyInvitation(data) {
    // Show party invitation modal
    console.log('Party invitation:', data);
  }

  showMatchFound(data) {
    // Show match found notification
    console.log('Match found:', data);
  }

  updateTrustScoreDisplay(newScore) {
    // Update trust score in UI
    console.log('Trust score updated:', newScore);
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  new TenebrisGameApp();
});
```

## Error Handling Best Practices

### 1. API Error Handling

```javascript
class ErrorHandler {
  static handle(error, context = '') {
    console.error(`Error in ${context}:`, error);

    switch (error.message) {
      case 'Authentication required':
        this.redirectToLogin();
        break;
      case 'Rate limit exceeded':
        this.showRateLimitMessage();
        break;
      case 'Server not ready':
        this.showMaintenanceMessage();
        break;
      default:
        this.showGenericError(error.message);
    }
  }

  static redirectToLogin() {
    localStorage.removeItem('tenebris_token');
    window.location.href = '/login';
  }

  static showRateLimitMessage() {
    alert('Too many requests. Please wait a moment before trying again.');
  }

  static showMaintenanceMessage() {
    alert('Server is currently under maintenance. Please try again later.');
  }

  static showGenericError(message) {
    alert(`An error occurred: ${message}`);
  }
}
```

### 2. Retry Logic

```javascript
class RetryableRequest {
  static async execute(requestFn, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }

        if (this.isRetryableError(error)) {
          await this.delay(delay * attempt);
          continue;
        }

        throw error;
      }
    }
  }

  static isRetryableError(error) {
    const retryableErrors = [
      'Network error',
      'Server not ready',
      'Timeout'
    ];
    return retryableErrors.some(msg => error.message.includes(msg));
  }

  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Performance Optimization

### 1. Caching Strategy

```javascript
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
  }

  set(key, value, ttlMs = 300000) { // 5 minutes default
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + ttlMs);
  }

  get(key) {
    if (this.isExpired(key)) {
      this.delete(key);
      return null;
    }
    return this.cache.get(key);
  }

  isExpired(key) {
    const expiry = this.ttl.get(key);
    return expiry && Date.now() > expiry;
  }

  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  clear() {
    this.cache.clear();
    this.ttl.clear();
  }
}
```

### 2. Request Batching

```javascript
class RequestBatcher {
  constructor(client) {
    this.client = client;
    this.batches = new Map();
    this.batchTimeout = 100; // ms
  }

  async batchRequest(key, requestFn) {
    if (!this.batches.has(key)) {
      this.batches.set(key, {
        requests: [],
        timeout: setTimeout(() => this.executeBatch(key), this.batchTimeout)
      });
    }

    const batch = this.batches.get(key);
    
    return new Promise((resolve, reject) => {
      batch.requests.push({ requestFn, resolve, reject });
    });
  }

  async executeBatch(key) {
    const batch = this.batches.get(key);
    if (!batch) return;

    this.batches.delete(key);
    clearTimeout(batch.timeout);

    try {
      const results = await Promise.allSettled(
        batch.requests.map(req => req.requestFn())
      );

      results.forEach((result, index) => {
        const request = batch.requests[index];
        if (result.status === 'fulfilled') {
          request.resolve(result.value);
        } else {
          request.reject(result.reason);
        }
      });
    } catch (error) {
      batch.requests.forEach(req => req.reject(error));
    }
  }
}
```

## Testing Integration

### 1. Unit Tests

```javascript
// Example using Jest
describe('TenebrisClient', () => {
  let client;

  beforeEach(() => {
    client = new TenebrisClient();
    global.fetch = jest.fn();
  });

  test('should authenticate user successfully', async () => {
    const mockResponse = {
      success: true,
      user: { id: 1, username: 'testuser' },
      sessionToken: 'mock-token'
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const result = await client.login('testuser', 'password');
    
    expect(result).toEqual(mockResponse);
    expect(client.token).toBe('mock-token');
  });

  test('should handle authentication errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' })
    });

    await expect(client.login('invalid', 'password'))
      .rejects.toThrow('Invalid credentials');
  });
});
```

### 2. Integration Tests

```javascript
describe('Enhanced Game System Integration', () => {
  let app;

  beforeEach(async () => {
    app = new TenebrisGameApp();
    await app.init();
  });

  test('should load user dashboard with all components', async () => {
    // Mock API responses
    mockApiResponses();
    
    await app.loadUserData();
    
    expect(document.querySelector('.trust-score-display')).toBeTruthy();
    expect(document.querySelector('.stats-section')).toBeTruthy();
    expect(document.querySelector('.friends-section')).toBeTruthy();
  });

  test('should handle friend request workflow', async () => {
    const friendManager = app.friends;
    
    // Send friend request
    await friendManager.sendFriendRequest(123);
    
    // Verify request was sent
    expect(mockApiCall).toHaveBeenCalledWith('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ userId: 123 })
    });
  });
});
```

## Deployment Considerations

### 1. Environment Configuration

```javascript
const config = {
  development: {
    apiUrl: 'http://localhost:3000/api',
    wsUrl: 'ws://localhost:3000',
    debug: true
  },
  production: {
    apiUrl: 'https://api.tenebris-game.com/api',
    wsUrl: 'wss://api.tenebris-game.com',
    debug: false
  }
};

const env = process.env.NODE_ENV || 'development';
export default config[env];
```

### 2. Build Optimization

```javascript
// webpack.config.js
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        tenebris: {
          test: /[\\/]tenebris-client[\\/]/,
          name: 'tenebris-client',
          chunks: 'all'
        }
      }
    }
  }
};
```

This integration guide provides a comprehensive foundation for implementing all enhanced game system features. Adapt the examples to your specific framework and requirements.