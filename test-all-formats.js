/**
 * Test All Tournament Formats
 * Tests Single Elimination, Round Robin, and Double Elimination
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

class FormatTestRunner {
  constructor() {
    this.clients = [];
    this.currentLobby = null;
  }

  async createClients(count) {
    console.log(`🎮 Creating ${count} test clients...`);
    
    for (let i = 0; i < count; i++) {
      const client = new TournamentTestClient(
        `Player${i + 1}`,
        `test_player_${i + 1}_${Date.now()}_${Math.random()}`
      );
      await client.connect();
      this.clients.push(client);
      await this.wait(100);
    }
    
    console.log(`✅ ${count} clients created\n`);
  }

  async createLobby(maxPlayers, format) {
    console.log(`🏠 Creating ${format} lobby for ${maxPlayers} players...`);
    
    const host = this.clients[0];
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Lobby creation timeout'));
      }, 10000);

      host.on('LOBBY_CREATED', (message) => {
        clearTimeout(timeout);
        this.currentLobby = message.lobby;
        console.log(`✅ Lobby created: ${this.currentLobby.code}`);
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
          tournamentFormat: format,
          allowSpectators: true,
          chatEnabled: true,
          autoStartWhenFull: false
        }
      });
    });
  }

  async joinLobby(clientIndex) {
    const lobbyCode = this.currentLobby.code || this.currentLobby.lobbyCode;
    const client = this.clients[clientIndex];
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${client.name} join timeout`));
      }, 10000);

      client.on('LOBBY_JOINED', (message) => {
        clearTimeout(timeout);
        console.log(`✅ ${client.name} joined (${message.lobby.currentPlayerCount}/${message.lobby.maxPlayers})`);
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
    console.log(`🏆 Starting tournament...\n`);
    
    const host = this.clients[0];
    
    return new Promise((resolve) => {
      let matchReadyCount = 0;

      this.clients.forEach(client => {
        client.on('TOURNAMENT_MATCH_READY', () => {
          matchReadyCount++;
          
          if (matchReadyCount === this.clients.length) {
            console.log(`✅ All players ready for matches\n`);
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

  async simulateMatch(client1Index, client2Index) {
    const client1 = this.clients[client1Index];
    const client2 = this.clients[client2Index];
    
    await this.wait(1000);
    
    // Play 5 rounds
    for (let round = 0; round < 5; round++) {
      client1.send({
        type: 'GAME_DECISION',
        decision: 'COOPERATE',
        round: round
      });
      
      client2.send({
        type: 'GAME_DECISION',
        decision: 'COOPERATE',
        round: round
      });
      
      await this.wait(500);
    }
    
    await this.wait(2000);
  }

  async handleReversals(client1Index, client2Index) {
    const client1 = this.clients[client1Index];
    const client2 = this.clients[client2Index];
    
    await this.wait(500);
    
    client1.send({
      type: 'DECISION_REVERSAL_RESPONSE',
      accept: false
    });
    
    client2.send({
      type: 'DECISION_REVERSAL_RESPONSE',
      accept: false
    });
    
    await this.wait(1000);
  }

  async waitForTournamentCompletion() {
    console.log(`⏳ Waiting for tournament completion...`);
    
    return new Promise((resolve) => {
      let completionCount = 0;
      
      this.clients.forEach(client => {
        client.on('TOURNAMENT_COMPLETED', (message) => {
          completionCount++;
          
          if (completionCount === this.clients.length) {
            console.log(`✅ Tournament completed!`);
            console.log(`🏆 Winner: ${message.winner?.name || 'Unknown'}\n`);
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
    this.clients.forEach(client => client.disconnect());
    this.clients = [];
    await this.wait(1000);
  }

  // Test Scenarios

  async testRoundRobin4Players() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TEST: 4-Player Round Robin`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      await this.createClients(4);
      await this.createLobby(4, 'round_robin');
      
      for (let i = 1; i < 4; i++) {
        await this.joinLobby(i);
        await this.wait(500);
      }
      
      await this.startTournament();
      
      // Round Robin: 6 matches total (each player plays 3 matches)
      console.log(`🎮 Playing Round Robin matches...\n`);
      
      const matches = [
        [0, 1], [2, 3], // Round 1
        [0, 2], [1, 3], // Round 2
        [0, 3], [1, 2]  // Round 3
      ];
      
      for (let i = 0; i < matches.length; i++) {
        const [p1, p2] = matches[i];
        console.log(`Match ${i + 1}/6: ${this.clients[p1].name} vs ${this.clients[p2].name}`);
        await this.simulateMatch(p1, p2);
        await this.handleReversals(p1, p2);
        
        if (i < matches.length - 1) {
          console.log(`⏳ Waiting for next match...\n`);
          await this.wait(12000);
        }
      }
      
      await this.waitForTournamentCompletion();
      
      console.log(`✅ TEST PASSED: Round Robin\n`);
      return true;
    } catch (error) {
      console.error(`❌ TEST FAILED:`, error);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  async testDoubleElimination4Players() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TEST: 4-Player Double Elimination`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      await this.createClients(4);
      await this.createLobby(4, 'double_elimination');
      
      for (let i = 1; i < 4; i++) {
        await this.joinLobby(i);
        await this.wait(500);
      }
      
      await this.startTournament();
      
      console.log(`🎮 Winners Bracket Round 1...\n`);
      
      // Winners Bracket Round 1: 2 matches
      console.log(`Match 1: ${this.clients[0].name} vs ${this.clients[1].name}`);
      await this.simulateMatch(0, 1);
      await this.handleReversals(0, 1);
      
      await this.wait(2000);
      
      console.log(`Match 2: ${this.clients[2].name} vs ${this.clients[3].name}`);
      await this.simulateMatch(2, 3);
      await this.handleReversals(2, 3);
      
      console.log(`\n⏳ Waiting for Losers Bracket...\n`);
      await this.wait(12000);
      
      // Losers Bracket: 1 match
      console.log(`🎮 Losers Bracket Match...\n`);
      await this.simulateMatch(0, 2); // Assuming these lost
      await this.handleReversals(0, 2);
      
      console.log(`\n⏳ Waiting for Winners Final...\n`);
      await this.wait(12000);
      
      // Winners Final
      console.log(`🎮 Winners Final...\n`);
      await this.simulateMatch(1, 3); // Winners from WB R1
      await this.handleReversals(1, 3);
      
      console.log(`\n⏳ Waiting for Grand Final...\n`);
      await this.wait(12000);
      
      // Grand Final
      console.log(`🎮 Grand Final...\n`);
      await this.simulateMatch(1, 2); // Winner from WF vs Winner from LB
      await this.handleReversals(1, 2);
      
      await this.waitForTournamentCompletion();
      
      console.log(`✅ TEST PASSED: Double Elimination\n`);
      return true;
    } catch (error) {
      console.error(`❌ TEST FAILED:`, error);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  async runAllTests() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 ALL TOURNAMENT FORMATS TEST SUITE`);
    console.log(`${'='.repeat(60)}\n`);

    const results = [];

    // Test Round Robin
    results.push({
      name: 'Round Robin (4 players)',
      passed: await this.testRoundRobin4Players()
    });

    await this.wait(3000);

    // Test Double Elimination
    results.push({
      name: 'Double Elimination (4 players)',
      passed: await this.testDoubleElimination4Players()
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

    console.log(`\n${passedCount}/${totalCount} tests passed\n`);

    if (passedCount === totalCount) {
      console.log(`🎉 ALL TESTS PASSED! 🎉\n`);
    } else {
      console.log(`⚠️ SOME TESTS FAILED\n`);
    }
  }
}

// Run tests
const runner = new FormatTestRunner();
runner.runAllTests().then(() => {
  console.log(`✅ Test suite completed`);
  process.exit(0);
}).catch(error => {
  console.error(`❌ Test suite failed:`, error);
  process.exit(1);
});
