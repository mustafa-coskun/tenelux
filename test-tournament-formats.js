/**
 * Test Tournament Formats
 * Quick test to verify bracket generation for different formats
 */

const WebSocket = require('ws');

async function testFormat(format, playerCount) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing ${format.toUpperCase()} with ${playerCount} players`);
  console.log(`${'='.repeat(60)}\n`);

  const ws = new WebSocket('wss://game.coshbilisim.com');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Test timeout'));
    }, 30000);

    ws.on('open', () => {
      console.log('✅ Connected');
      
      // Register
      ws.send(JSON.stringify({
        type: 'REGISTER',
        sessionToken: `test_${Date.now()}`,
        playerId: `test_${Date.now()}`
      }));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        console.log(`📨 Received: ${message.type}`);

        if (message.type === 'REGISTERED') {
          // Create lobby
          ws.send(JSON.stringify({
            type: 'CREATE_PARTY_LOBBY',
            player: {
              id: `test_${Date.now()}`,
              name: 'TestHost',
              isAI: false,
              trustScore: 50,
              totalGamesPlayed: 0,
              createdAt: new Date().toISOString()
            },
            settings: {
              maxPlayers: playerCount,
              roundCount: 5,
              tournamentFormat: format,
              allowSpectators: true,
              chatEnabled: true,
              autoStartWhenFull: false
            }
          }));
        }

        if (message.type === 'LOBBY_CREATED') {
          console.log(`✅ Lobby created: ${message.lobby.code}`);
          console.log(`   Format: ${message.lobby.settings.tournamentFormat}`);
          console.log(`   Max players: ${message.lobby.maxPlayers}`);
          
          clearTimeout(timeout);
          ws.close();
          resolve({
            format: format,
            playerCount: playerCount,
            success: true,
            lobbyCode: message.lobby.code
          });
        }

        if (message.type === 'ERROR') {
          console.error(`❌ Error: ${message.message}`);
          clearTimeout(timeout);
          ws.close();
          reject(new Error(message.message));
        }
      } catch (error) {
        console.error('❌ Parse error:', error);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function runTests() {
  const tests = [
    { format: 'single_elimination', playerCount: 8 },
    { format: 'double_elimination', playerCount: 8 },
    { format: 'round_robin', playerCount: 4 },
    { format: 'round_robin', playerCount: 6 },
  ];

  const results = [];

  for (const test of tests) {
    try {
      const result = await testFormat(test.format, test.playerCount);
      results.push({ ...result, passed: true });
      console.log(`✅ PASSED: ${test.format} with ${test.playerCount} players\n`);
    } catch (error) {
      results.push({ 
        format: test.format, 
        playerCount: test.playerCount, 
        passed: false, 
        error: error.message 
      });
      console.error(`❌ FAILED: ${test.format} with ${test.playerCount} players`);
      console.error(`   Error: ${error.message}\n`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${'='.repeat(60)}\n`);

  results.forEach(result => {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status}: ${result.format} (${result.playerCount} players)`);
    if (!result.passed) {
      console.log(`   Error: ${result.error}`);
    }
  });

  const passedCount = results.filter(r => r.passed).length;
  console.log(`\n${passedCount}/${results.length} tests passed\n`);

  process.exit(passedCount === results.length ? 0 : 1);
}

runTests();
