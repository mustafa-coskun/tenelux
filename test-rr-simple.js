const WebSocket = require('ws');

const clients = [];
let lobby = null;

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createClient(name, id) {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://game.coshbilisim.com');
    const client = { name, id, ws, messages: [] };
    
    ws.on('open', () => {
      console.log(`✅ ${name} connected`);
      ws.send(JSON.stringify({
        type: 'REGISTER',
        sessionToken: id,
        playerId: id
      }));
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      client.messages.push(msg);
      console.log(`📨 ${name}: ${msg.type}`);
      
      if (msg.type === 'TOURNAMENT_COMPLETED') {
        console.log(`🏆 WINNER: ${msg.winner?.name}`);
        console.log(`📊 Standings:`, msg.standings?.map(s => `${s.player.name}: ${s.score}`));
      }
    });
    
    clients.push(client);
    resolve(client);
  });
}

async function run() {
  // Create 4 players
  for (let i = 1; i <= 4; i++) {
    await createClient(`P${i}`, `test_${i}_${Date.now()}`);
    await wait(200);
  }
  
  await wait(1000);
  
  // Create lobby
  console.log('\n🏠 Creating Round Robin lobby...');
  clients[0].ws.send(JSON.stringify({
    type: 'CREATE_PARTY_LOBBY',
    player: {
      id: clients[0].id,
      name: clients[0].name,
      isAI: false,
      trustScore: 50,
      totalGamesPlayed: 0,
      createdAt: new Date().toISOString()
    },
    settings: {
      maxPlayers: 4,
      roundCount: 5,
      tournamentFormat: 'round_robin',
      allowSpectators: true,
      chatEnabled: true,
      autoStartWhenFull: false
    }
  }));
  
  await wait(2000);
  
  // Find lobby code
  const lobbyMsg = clients[0].messages.find(m => m.type === 'LOBBY_CREATED');
  if (!lobbyMsg) {
    console.error('❌ Lobby not created');
    return;
  }
  
  lobby = lobbyMsg.lobby;
  console.log(`✅ Lobby: ${lobby.code}\n`);
  
  // Join others
  for (let i = 1; i < 4; i++) {
    console.log(`👥 ${clients[i].name} joining...`);
    clients[i].ws.send(JSON.stringify({
      type: 'JOIN_PARTY_LOBBY',
      player: {
        id: clients[i].id,
        name: clients[i].name,
        isAI: false,
        trustScore: 50,
        totalGamesPlayed: 0,
        createdAt: new Date().toISOString()
      },
      lobbyCode: lobby.code
    }));
    await wait(1000);
  }
  
  await wait(2000);
  
  // Start tournament
  console.log('\n🏆 Starting tournament...\n');
  clients[0].ws.send(JSON.stringify({
    type: 'START_TOURNAMENT',
    lobbyId: lobby.code
  }));
  
  await wait(3000);
  
  // Play all matches
  console.log('🎮 Playing matches...\n');
  
  for (let matchNum = 0; matchNum < 6; matchNum++) {
    console.log(`Match ${matchNum + 1}/6`);
    
    // All players make decisions
    for (let round = 0; round < 5; round++) {
      for (const client of clients) {
        client.ws.send(JSON.stringify({
          type: 'GAME_DECISION',
          decision: 'COOPERATE',
          round: round
        }));
      }
      await wait(500);
    }
    
    await wait(2000);
    
    // Decline reversals
    for (const client of clients) {
      client.ws.send(JSON.stringify({
        type: 'DECISION_REVERSAL_RESPONSE',
        accept: false
      }));
    }
    
    await wait(2000);
    
    if (matchNum < 5) {
      console.log('⏳ Waiting for next match...\n');
      await wait(12000);
    }
  }
  
  console.log('\n⏳ Waiting for completion...');
  await wait(10000);
  
  // Check for completion
  const completed = clients.some(c => c.messages.some(m => m.type === 'TOURNAMENT_COMPLETED'));
  if (completed) {
    console.log('\n✅ Tournament completed!');
  } else {
    console.log('\n❌ Tournament did not complete');
    console.log('Last messages:', clients[0].messages.slice(-5).map(m => m.type));
  }
  
  // Cleanup
  clients.forEach(c => c.ws.close());
  process.exit(0);
}

run().catch(console.error);
