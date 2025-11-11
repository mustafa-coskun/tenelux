import WebSocket from 'ws';
import { performance } from 'perf_hooks';

/**
 * ConcurrentUserTest simulates multiple users connecting and playing simultaneously
 * to test system performance under load
 */
export class ConcurrentUserTest {
  private connections: WebSocket[] = [];
  private players: Array<{ id: string; ws: WebSocket; matchId?: string }> = [];
  private metrics: {
    connectionTime: number[];
    messageLatency: number[];
    matchmakingTime: number[];
    gameCompletionTime: number[];
    errors: string[];
  } = {
    connectionTime: [],
    messageLatency: [],
    matchmakingTime: [],
    gameCompletionTime: [],
    errors: []
  };

  constructor(private serverUrl: string = 'ws://localhost:3001') {}

  /**
   * Test concurrent connections
   */
  async testConcurrentConnections(userCount: number): Promise<void> {
    console.log(`🔗 Testing ${userCount} concurrent connections...`);
    
    const connectionPromises = [];
    
    for (let i = 0; i < userCount; i++) {
      connectionPromises.push(this.createConnection(i));
    }

    try {
      await Promise.all(connectionPromises);
      console.log(`✅ Successfully connected ${this.connections.length} users`);
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      this.metrics.errors.push(`Connection failed: ${error}`);
    }
  }

  /**
   * Test concurrent matchmaking
   */
  async testConcurrentMatchmaking(pairs: number): Promise<void> {
    console.log(`🎮 Testing matchmaking with ${pairs} pairs (${pairs * 2} users)...`);
    
    if (this.players.length < pairs * 2) {
      throw new Error(`Need at least ${pairs * 2} connected players for matchmaking test`);
    }

    const matchmakingPromises = [];
    
    for (let i = 0; i < pairs * 2; i++) {
      const player = this.players[i];
      const startTime = performance.now();
      
      matchmakingPromises.push(
        this.joinQueue(player).then(() => {
          const endTime = performance.now();
          this.metrics.matchmakingTime.push(endTime - startTime);
        })
      );
    }

    try {
      await Promise.all(matchmakingPromises);
      console.log(`✅ Matchmaking completed for ${pairs} pairs`);
    } catch (error) {
      console.error('❌ Matchmaking test failed:', error);
      this.metrics.errors.push(`Matchmaking failed: ${error}`);
    }
  }

  /**
   * Test concurrent gameplay
   */
  async testConcurrentGameplay(): Promise<void> {
    console.log('🎯 Testing concurrent gameplay...');
    
    const gameplayPromises = this.players
      .filter(player => player.matchId)
      .map(player => this.simulateGameplay(player));

    try {
      await Promise.all(gameplayPromises);
      console.log('✅ Concurrent gameplay test completed');
    } catch (error) {
      console.error('❌ Gameplay test failed:', error);
      this.metrics.errors.push(`Gameplay failed: ${error}`);
    }
  }

  /**
   * Test message throughput
   */
  async testMessageThroughput(messagesPerSecond: number, duration: number): Promise<void> {
    console.log(`📨 Testing message throughput: ${messagesPerSecond} msg/sec for ${duration}s`);
    
    const interval = 1000 / messagesPerSecond;
    const totalMessages = messagesPerSecond * duration;
    let sentMessages = 0;

    return new Promise((resolve, reject) => {
      const sendMessage = () => {
        if (sentMessages >= totalMessages) {
          resolve();
          return;
        }

        const player = this.players[sentMessages % this.players.length];
        if (player && player.ws.readyState === WebSocket.OPEN) {
          const startTime = performance.now();
          
          player.ws.send(JSON.stringify({
            type: 'PING',
            timestamp: startTime
          }));

          // Listen for response to measure latency
          const responseHandler = (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString());
              if (message.type === 'PONG') {
                const latency = performance.now() - startTime;
                this.metrics.messageLatency.push(latency);
                player.ws.removeListener('message', responseHandler);
              }
            } catch (error) {
              // Ignore parsing errors for other messages
            }
          };

          player.ws.on('message', responseHandler);
        }

        sentMessages++;
        setTimeout(sendMessage, interval);
      };

      sendMessage();
    });
  }

  /**
   * Run comprehensive load test
   */
  async runLoadTest(config: {
    userCount: number;
    matchPairs: number;
    messagesPerSecond: number;
    testDuration: number;
  }): Promise<void> {
    console.log('🚀 Starting comprehensive load test...');
    
    try {
      // Phase 1: Connect users
      await this.testConcurrentConnections(config.userCount);
      await this.wait(1000);

      // Phase 2: Test matchmaking
      await this.testConcurrentMatchmaking(config.matchPairs);
      await this.wait(2000);

      // Phase 3: Test gameplay
      await this.testConcurrentGameplay();
      await this.wait(1000);

      // Phase 4: Test message throughput
      await this.testMessageThroughput(config.messagesPerSecond, config.testDuration);

      console.log('✅ Load test completed successfully');
      this.printMetrics();
    } catch (error) {
      console.error('❌ Load test failed:', error);
      this.metrics.errors.push(`Load test failed: ${error}`);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Create a single connection
   */
  private async createConnection(index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      const ws = new WebSocket(this.serverUrl);
      
      ws.on('open', () => {
        const connectionTime = performance.now() - startTime;
        this.metrics.connectionTime.push(connectionTime);
        
        const playerId = `test-player-${index}`;
        const player = { id: playerId, ws };
        
        this.connections.push(ws);
        this.players.push(player);

        // Register with server
        ws.send(JSON.stringify({
          type: 'REGISTER',
          playerId: playerId
        }));

        resolve();
      });

      ws.on('error', (error) => {
        this.metrics.errors.push(`Connection ${index} error: ${error.message}`);
        reject(error);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(player, message);
        } catch (error) {
          this.metrics.errors.push(`Message parsing error: ${error}`);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          reject(new Error(`Connection ${index} timeout`));
        }
      }, 10000);
    });
  }

  /**
   * Join matchmaking queue
   */
  private async joinQueue(player: { id: string; ws: WebSocket }): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Matchmaking timeout for ${player.id}`));
      }, 30000);

      const messageHandler = (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'MATCH_FOUND') {
            player.matchId = message.matchId;
            clearTimeout(timeout);
            player.ws.removeListener('message', messageHandler);
            resolve();
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      player.ws.on('message', messageHandler);

      player.ws.send(JSON.stringify({
        type: 'JOIN_QUEUE',
        player: {
          id: player.id,
          name: `TestPlayer${player.id}`
        }
      }));
    });
  }

  /**
   * Simulate gameplay for a player
   */
  private async simulateGameplay(player: { id: string; ws: WebSocket; matchId?: string }): Promise<void> {
    if (!player.matchId) return;

    const startTime = performance.now();
    let roundsPlayed = 0;
    const maxRounds = 10;

    return new Promise((resolve) => {
      const messageHandler = (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'NEW_ROUND') {
            // Make random decision
            const decision = Math.random() > 0.5 ? 'COOPERATE' : 'BETRAY';
            
            setTimeout(() => {
              player.ws.send(JSON.stringify({
                type: 'GAME_DECISION',
                matchId: player.matchId,
                decision: decision
              }));
            }, Math.random() * 1000); // Random delay up to 1 second
            
            roundsPlayed++;
          } else if (message.type === 'SHOW_STATISTICS') {
            const gameTime = performance.now() - startTime;
            this.metrics.gameCompletionTime.push(gameTime);
            player.ws.removeListener('message', messageHandler);
            resolve();
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      player.ws.on('message', messageHandler);

      // Timeout after 5 minutes
      setTimeout(() => {
        player.ws.removeListener('message', messageHandler);
        resolve();
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(player: { id: string; ws: WebSocket }, message: any): void {
    // Basic message handling for test purposes
    switch (message.type) {
      case 'REGISTERED':
        console.log(`✅ Player ${player.id} registered`);
        break;
      case 'ERROR':
        this.metrics.errors.push(`Player ${player.id} error: ${message.message}`);
        break;
    }
  }

  /**
   * Print performance metrics
   */
  private printMetrics(): void {
    console.log('\n📊 Performance Metrics:');
    console.log('========================');
    
    if (this.metrics.connectionTime.length > 0) {
      const avgConnectionTime = this.metrics.connectionTime.reduce((a, b) => a + b, 0) / this.metrics.connectionTime.length;
      const maxConnectionTime = Math.max(...this.metrics.connectionTime);
      console.log(`Connection Time - Avg: ${avgConnectionTime.toFixed(2)}ms, Max: ${maxConnectionTime.toFixed(2)}ms`);
    }

    if (this.metrics.messageLatency.length > 0) {
      const avgLatency = this.metrics.messageLatency.reduce((a, b) => a + b, 0) / this.metrics.messageLatency.length;
      const maxLatency = Math.max(...this.metrics.messageLatency);
      console.log(`Message Latency - Avg: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`);
    }

    if (this.metrics.matchmakingTime.length > 0) {
      const avgMatchmaking = this.metrics.matchmakingTime.reduce((a, b) => a + b, 0) / this.metrics.matchmakingTime.length;
      console.log(`Matchmaking Time - Avg: ${avgMatchmaking.toFixed(2)}ms`);
    }

    if (this.metrics.gameCompletionTime.length > 0) {
      const avgGameTime = this.metrics.gameCompletionTime.reduce((a, b) => a + b, 0) / this.metrics.gameCompletionTime.length;
      console.log(`Game Completion Time - Avg: ${avgGameTime.toFixed(2)}ms`);
    }

    console.log(`Total Errors: ${this.metrics.errors.length}`);
    if (this.metrics.errors.length > 0) {
      console.log('Errors:', this.metrics.errors.slice(0, 5)); // Show first 5 errors
    }
  }

  /**
   * Wait for specified milliseconds
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up all connections
   */
  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up connections...');
    
    for (const ws of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }

    this.connections = [];
    this.players = [];
  }
}

export default ConcurrentUserTest;