/**
 * Tournament Test Runner
 * Automated testing for tournament scenarios
 */

const WebSocket = require('ws');

class TournamentTestClient {
  constructor(name, sessionToken) {
    this.name = name;
    this.sessionToken = sessionToken;
    this.ws = null;
    this.connected = false;
    this.messageHandlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('wss://game.coshbilisim.com');
      
      this.ws.on('open', () => {
        console.log(`✅ ${this.name} connected`);
        this.connected = true;
        
        // Register
        this.send({
          type: 'REGISTER',
          sessionToken: this.sessionToken,
          playerId: this.sessionToken
        });
        
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log(`📨 ${this.name} received:`, message.type);
          
          // Call registered handlers
          const handler = this.messageHandlers.get(message.type);
          if (handler) {
            handler(message);
          }
        } catch (error) {
          console.error(`❌ ${this.name} message parse error:`, error);
        }
      });

      this.ws.on('error', (error) => {
        console.error(`❌ ${this.name} error:`, error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(`🔌 ${this.name} disconnected`);
        this.connected = false;
      });
    });
  }

  send(message) {
    if (this.connected && this.ws) {
      this.ws.send(JSON.stringify(message));
    }
  }

  on(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

class TournamentTestRunner {
  constructor() {
    this.clients = [];
    this.currentLobby = null;
    this.testResults = [];
  }

  async createClients(count) {
    console.log(`\n🎮 Creating ${count} test clients...`);
    
    for (let i = 0; i < count; i++) {
      const client = new TournamentTestClient(
        `Player${i + 1}`,
        `test_player_${i + 1}_${Date.now()}`
      );
      await client.connect();
      this.clients.push(client);
      await this.wait(100); // Small delay between connections
    }
    
    console.log(`✅ ${count} clients created and connected\n`);
  }

  async createLobby(maxPlayers = 4) {
    console.log(`\n🏠 Creating lobby for ${maxPlayers} players...`);
    
    const host = this.clients[0];
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Lobby creation timeout'));
      }, 10000);

      host.on('LOBBY_CREATED', (message) => {
        clearTimeout(timeout);
        this.currentLobby = message.lobby;
        console.log(`✅ Lobby created:`, JSON.stringify(this.currentLobby, null, 2));
        resolve(this.currentLobby);
      });

      host.on('ERROR', (message) => {
        clearTimeout(timeout);
        reject(new Error(`Lobby creation failed: ${message.message}`));
      });

      host.send({
        type: 'CREATE_PARTY_LOBBY',
        player: {
          id: host.sessionToken,
          name: host.name,
          isAI: false,
          trustScore: 50,
          totalGamesPlayed: 0,
          createdAt: new Date().toISOString()
        },
        settings: {
          maxPlayers: maxPlayers,
          roundCount: 5,
          tournamentFormat: 'single_elimination',
          allowSpectators: true,
          chatEnabled: true,
          autoStartWhenFull: false
        }
      });
    });
  }

  async joinLobby(clientIndex) {
    const lobbyCode = this.currentLobby.code || this.currentLobby.lobbyCode;
    console.log(`\n👥 ${this.clients[clientIndex].name} joining lobby ${lobbyCode}...`);
    
    const client = this.clients[clientIndex];
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${client.name} join timeout`));
      }, 10000);

      client.on('LOBBY_JOINED', (message) => {
        clearTimeout(timeout);
        console.log(`✅ ${client.name} joined lobby`);
        console.log(`   Players: ${message.lobby.currentPlayerCount}/${message.lobby.maxPlayers}`);
        resolve(message.lobby);
      });

      client.on('ERROR', (message) => {
        clearTimeout(timeout);
        reject(new Error(`${client.name} join failed: ${message.message}`));
      });

      client.send({
        type: 'JOIN_PARTY_LOBBY',
        player: {
          id: client.sessionToken,
          name: client.name,
          isAI: false,
          trustScore: 50,
          totalGamesPlayed: 0,
          createdAt: new Date().toISOString()
        },
        lobbyCode: lobbyCode
      });
    });
  }

  async startTournament() {
    console.log(`\n🏆 Starting tournament...`);
    
    const host = this.clients[0];
    
    return new Promise((resolve) => {
      let matchReadyCount = 0;
      const expectedMatches = Math.floor(this.clients.length / 2);

      this.clients.forEach(client => {
        client.on('TOURNAMENT_MATCH_READY', (message) => {
          matchReadyCount++;
          console.log(`✅ Match ready for ${client.name} (${matchReadyCount}/${expectedMatches * 2})`);
          
          if (matchReadyCount === expectedMatches * 2) {
            resolve();
          }
        });
      });

      const lobbyCode = this.currentLobby.code || this.currentLobby.lobbyCode;
      host.send({
        type: 'START_TOURNAMENT',
        lobbyId: lobbyCode
      });
    });
  }

  async simulateMatch(client1Index, client2Index, decisions) {
    console.log(`\n🎮 Simulating match: ${this.clients[client1Index].name} vs ${this.clients[client2Index].name}`);
    
    const client1 = this.clients[client1Index];
    const client2 = this.clients[client2Index];
    
    let matchId = null;
    let gameOverCount = 0;
    
    // Capture match ID from first message
    const captureMatchId = (message) => {
      if (message.matchId && !matchId) {
        matchId = message.matchId;
        console.log(`  Match ID: ${matchId}`);
      }
    };
    
    client1.on('ROUND_RESULT', captureMatchId);
    client2.on('ROUND_RESULT', captureMatchId);
    
    // Wait for match to be ready
    await this.wait(2000);
    
    // Play 5 rounds
    for (let round = 0; round < 5; round++) {
      console.log(`  Round ${round + 1}...`);
      
      // Send decisions
      client1.send({
        type: 'GAME_DECISION',
        decision: decisions.player1[round],
        round: round
      });
      
      client2.send({
        type: 'GAME_DECISION',
        decision: decisions.player2[round],
        round: round
      });
      
      await this.wait(800);
    }
    
    // Wait for GAME_OVER
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      
      const handleGameOver = () => {
        gameOverCount++;
        if (gameOverCount === 2) {
          clearTimeout(timeout);
          resolve();
        }
      };
      
      client1.on('GAME_OVER', handleGameOver);
      client2.on('GAME_OVER', handleGameOver);
    });
    
    console.log(`✅ Match completed`);
    return matchId;
  }

  async handleDecisionReversal(clientIndex, accept, matchId) {
    const client = this.clients[clientIndex];
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log(`⏰ ${client.name} reversal timeout, continuing...`);
        resolve();
      }, 5000);

      const cleanup = () => {
        clearTimeout(timeout);
        client.messageHandlers.delete('REVERSAL_APPROVED');
        client.messageHandlers.delete('SHOW_STATISTICS');
      };

      client.on('REVERSAL_APPROVED', () => {
        console.log(`✅ ${client.name} reversal approved`);
        cleanup();
        resolve();
      });

      client.on('SHOW_STATISTICS', () => {
        console.log(`✅ ${client.name} statistics shown`);
        cleanup();
        resolve();
      });

      client.send({
        type: 'DECISION_REVERSAL_RESPONSE',
        matchId: matchId,
        accept: accept
      });
    });
  }

  async waitForTournamentCompletion() {
    console.log(`\n🏆 Waiting for tournament completion...`);
    
    return new Promise((resolve) => {
      let completionCount = 0;
      
      this.clients.forEach(client => {
        client.on('TOURNAMENT_COMPLETED', (message) => {
          completionCount++;
          console.log(`✅ ${client.name} received tournament completion (${completionCount}/${this.clients.length})`);
          
          if (completionCount === this.clients.length) {
            console.log(`\n🎉 Tournament completed for all players!`);
            console.log(`Winner: ${message.winner?.name || 'Unknown'}`);
            resolve(message);
          }
        });
      });
    });
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    console.log(`\n🧹 Cleaning up...`);
    this.clients.forEach(client => client.disconnect());
    this.clients = [];
  }

  // Test Scenarios

  async test4PlayerSingleElimination() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TEST: 4-Player Single Elimination`);
    console.log(`${'='.repeat(60)}`);

    try {
      // Setup
      await this.createClients(4);
      await this.createLobby(4);
      
      // Wait for lobby to be fully created
      await this.wait(2000);
      
      // Join all players
      for (let i = 1; i < 4; i++) {
        await this.joinLobby(i);
        await this.wait(1000);
      }
      
      // Start tournament
      await this.startTournament();
      await this.wait(2000);
      
      // Round 1 - Match 1: P1 vs P2
      let matchId = await this.simulateMatch(0, 1, {
        player1: ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE'],
        player2: ['BETRAY', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE']
      });
      
      // Handle reversal (both decline)
      await this.wait(1000);
      await this.handleDecisionReversal(0, false, matchId);
      await this.handleDecisionReversal(1, false, matchId);
      
      await this.wait(2000);
      
      // Round 1 - Match 2: P3 vs P4
      matchId = await this.simulateMatch(2, 3, {
        player1: ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE'],
        player2: ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE']
      });
      
      // Handle reversal
      await this.wait(1000);
      await this.handleDecisionReversal(2, false, matchId);
      await this.handleDecisionReversal(3, false, matchId);
      
      // Wait for round 2 (10 second delay)
      console.log(`\n⏳ Waiting 12 seconds for next round...`);
      await this.wait(12000);
      
      // Final: Winner1 vs Winner2
      matchId = await this.simulateMatch(1, 2, {
        player1: ['COOPERATE', 'BETRAY', 'COOPERATE', 'COOPERATE', 'COOPERATE'],
        player2: ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE']
      });
      
      // Handle reversal
      await this.wait(1000);
      await this.handleDecisionReversal(1, false, matchId);
      await this.handleDecisionReversal(2, false, matchId);
      
      // Wait for tournament completion
      const result = await this.waitForTournamentCompletion();
      
      console.log(`\n✅ TEST PASSED: 4-Player Single Elimination`);
      console.log(`Winner: ${result.winner?.name}`);
      
      return true;
    } catch (error) {
      console.error(`\n❌ TEST FAILED:`, error);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  async test8PlayerSingleElimination() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TEST: 8-Player Single Elimination`);
    console.log(`${'='.repeat(60)}`);

    try {
      await this.createClients(8);
      await this.createLobby(8);
      
      for (let i = 1; i < 8; i++) {
        await this.joinLobby(i);
        await this.wait(300);
      }
      
      await this.startTournament();
      await this.wait(2000);
      
      // Round 1: 4 matches (8 players → 4 winners)
      console.log(`\n🎮 Round 1: Quarterfinals (4 matches)`);
      const round1Winners = [];
      
      for (let i = 0; i < 4; i++) {
        const p1Index = i * 2;
        const p2Index = i * 2 + 1;
        
        const matchId = await this.simulateMatch(p1Index, p2Index, {
          player1: ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE'],
          player2: ['BETRAY', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE']
        });
        
        // P2 wins (has more points)
        round1Winners.push(p2Index);
        
        await this.wait(1000);
        await this.handleDecisionReversal(p1Index, false, matchId);
        await this.handleDecisionReversal(p2Index, false, matchId);
        await this.wait(1000);
      }
      
      console.log(`✅ Round 1 complete. Winners:`, round1Winners.map(i => this.clients[i].name));
      
      // Wait for round 2
      console.log(`\n⏳ Waiting 12 seconds for Round 2...`);
      await this.wait(12000);
      
      // Round 2: 2 matches (4 players → 2 winners)
      console.log(`\n🎮 Round 2: Semifinals (2 matches)`);
      const round2Winners = [];
      
      for (let i = 0; i < 2; i++) {
        const p1Index = round1Winners[i * 2];
        const p2Index = round1Winners[i * 2 + 1];
        
        const matchId = await this.simulateMatch(p1Index, p2Index, {
          player1: ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE'],
          player2: ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE']
        });
        
        // Tie - random winner (let's say P1)
        round2Winners.push(p1Index);
        
        await this.wait(1000);
        await this.handleDecisionReversal(p1Index, false, matchId);
        await this.handleDecisionReversal(p2Index, false, matchId);
        await this.wait(1000);
      }
      
      console.log(`✅ Round 2 complete. Winners:`, round2Winners.map(i => this.clients[i].name));
      
      // Wait for final
      console.log(`\n⏳ Waiting 12 seconds for Final...`);
      await this.wait(12000);
      
      // Final (2 players → 1 winner)
      console.log(`\n🎮 Round 3: Final`);
      const matchId = await this.simulateMatch(round2Winners[0], round2Winners[1], {
        player1: ['COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE'],
        player2: ['BETRAY', 'COOPERATE', 'COOPERATE', 'COOPERATE', 'COOPERATE']
      });
      
      await this.wait(1000);
      await this.handleDecisionReversal(round2Winners[0], false, matchId);
      await this.handleDecisionReversal(round2Winners[1], false, matchId);
      
      const result = await this.waitForTournamentCompletion();
      
      console.log(`\n✅ TEST PASSED: 8-Player Single Elimination`);
      console.log(`Winner: ${result.winner?.name}`);
      
      return true;
    } catch (error) {
      console.error(`\n❌ TEST FAILED:`, error);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  async runAllTests() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 TOURNAMENT TEST SUITE`);
    console.log(`${'='.repeat(60)}\n`);

    const results = [];

    // Test 2: 8 Players (skip 4 player for now)
    results.push({
      name: '8-Player Single Elimination',
      passed: await this.test8PlayerSingleElimination()
    });

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 TEST SUMMARY`);
    console.log(`${'='.repeat(60)}\n`);

    results.forEach(result => {
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`${status}: ${result.name}`);
    });

    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;

    console.log(`\n${passedCount}/${totalCount} tests passed`);

    if (passedCount === totalCount) {
      console.log(`\n🎉 ALL TESTS PASSED! 🎉\n`);
    } else {
      console.log(`\n⚠️ SOME TESTS FAILED\n`);
    }
  }
}

// Run tests
const runner = new TournamentTestRunner();
runner.runAllTests().then(() => {
  console.log(`\n✅ Test suite completed`);
  process.exit(0);
}).catch(error => {
  console.error(`\n❌ Test suite failed:`, error);
  process.exit(1);
});
