const WebSocket = require('ws');

const clients = [];
let lobby = null;
const playerMatches = new Map(); // Track which players are in which match

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createClient(name, id) {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://game.coshbilisim.com');
    const client = { name, id, ws, messages: [], currentMatch: null };
    
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
      
      if (msg.type === 'TOURNAMENT_MATCH_READY') {
        client.currentMatch = msg.matchId;
        console.log(`🎮 ${name} ready for match: ${msg.opponent?.name}`);
      }
      
      if (msg.type === 'GAME_OVER') {
        console.log(`✅ ${name} match finished`);
        client.currentMatch = null;
      }
      
      if (msg.type === 'TOURNAMENT_COMPLETED') {
        console.log(`\n🏆 TOURNAMENT COMPLETED!`);
        console.log(`👑 Winner: ${msg.winner?.name}`);
        if (msg.standings) {
          console.log(`📊 Standings:`);
          msg.standings.forEach((s, i) => {
            console.log(`  ${i + 1}. ${s.player.name}: ${s.score} points (${s.wins}W-${s.losses}L)`);
          });
        }
      }
      
      if (msg.type === 'TOURNAMENT_ROUND_STARTED') {
        console.log(`\n🎯 Round ${msg.round} started`);
      }
    });
    
    clients.push(client);
    resolve(client);
  });
}

async function playMatch() {
  // Find players in current match
  const activePlayers = clients.filter(c => c.currentMatch);
  
  if (activePlayers.length === 0) {
    console.log('⚠️ No active players');
    return;
  }
  
  console.log(`🎮 Playing match: ${activePlayers.map(p => p.name).join(' vs ')}`);
  
  // Play 5 rounds
  for (let round = 0; round < 5; round++) {
    for (const player of activePlayers) {
      player.ws.send(JSON.stringify({
        type: 'GAME_DECISION',
        decision: 'COOPERATE',
        round: round
      }));
    }
    await wait(500);
  }
  
  await wait(2000);
  
  // Decline reversals
  for (const player of activePlayers) {
    player.ws.send(JSON.stringify({
      type: 'DECISION_REVERSAL_RESPONSE',
      accept: false
    }));
  }
  
  await wait(1000);
}

async function run() {
  // Create 4 players
  for (let i = 1; i <= 4; i++) {
    await createClient(`P${i}`, `test_${i}_${Date.now()}_${Math.random()}`);
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
  
  // Play matches - Round Robin has 3 rounds for 4 players
  // Round 1: P1 vs P2, P3 vs P4
  // Round 2: P1 vs P3, P2 vs P4
  // Round 3: P1 vs P4, P2 vs P3
  
  for (let round = 1; round <= 3; round++) {
    console.log(`\n📍 Round ${round}`);
    await playMatch();
    
    if (round < 3) {
      console.log('\n⏳ Waiting for next round (12s)...');
      await wait(12000);
    }
  }
  
  console.log('\n⏳ Waiting for tournament completion...');
  await wait(5000);
  
  // Check for completion
  const completed = clients.some(c => c.messages.some(m => m.type === 'TOURNAMENT_COMPLETED'));
  if (completed) {
    console.log('\n✅ Test PASSED!');
  } else {
    console.log('\n❌ Test FAILED - Tournament did not complete');
    console.log('Last messages:', clients[0].messages.slice(-10).map(m => m.type));
  }
  
  // Cleanup
  await wait(1000);
  clients.forEach(c => c.ws.close());
  process.exit(completed ? 0 : 1);
}

run().catch(console.error);
