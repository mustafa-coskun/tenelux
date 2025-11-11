const WebSocket = require('ws');

// Test random tournament matchmaking
async function testRandomMatchmaking() {
    console.log('🧪 Testing Random Tournament Matchmaking...');
    
    const players = [
        { id: 'player_A', name: 'Alice' },
        { id: 'player_B', name: 'Bob' },
        { id: 'player_C', name: 'Charlie' },
        { id: 'player_D', name: 'Diana' }
    ];

    const connections = [];
    let lobbyCode = null;

    // Connect all players
    for (let i = 0; i < players.length; i++) {
        const ws = new WebSocket('ws://localhost:3000');
        connections.push({ ws, player: players[i] });
        
        await new Promise((resolve) => {
            ws.on('open', () => {
                console.log(`✅ ${players[i].name} connected`);
                ws.send(JSON.stringify({
                    type: 'REGISTER',
                    playerId: players[i].id,
                    sessionToken: players[i].id
                }));
                resolve();
            });
        });

        // Add message handlers
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'LOBBY_CREATED') {
                lobbyCode = message.lobby.code;
                console.log(`🏠 Lobby created: ${lobbyCode}`);
            } else if (message.type === 'TOURNAMENT_MATCH_READY') {
                console.log(`⚔️ ${players[i].name} matched vs ${message.opponent?.name || 'Unknown'}`);
                console.log(`   Match ID: ${message.matchId}`);
            } else if (message.type === 'REGISTERED') {
                console.log(`✅ ${players[i].name} registered`);
            }
        });

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Host creates lobby
    console.log('🏠 Creating lobby...');
    connections[0].ws.send(JSON.stringify({
        type: 'CREATE_PARTY_LOBBY',
        playerName: players[0].name,
        settings: {
            maxPlayers: 4,
            tournamentFormat: 'single_elimination',
            roundCount: 10
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!lobbyCode) {
        console.log('❌ Failed to create lobby');
        return;
    }

    // Other players join
    for (let i = 1; i < players.length; i++) {
        console.log(`👥 ${players[i].name} joining lobby`);
        connections[i].ws.send(JSON.stringify({
            type: 'JOIN_PARTY_LOBBY',
            lobbyCode: lobbyCode,
            playerName: players[i].name
        }));
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start tournament multiple times to test randomness
    for (let round = 1; round <= 3; round++) {
        console.log(`\n🏆 Starting tournament round ${round}...`);
        connections[0].ws.send(JSON.stringify({
            type: 'START_TOURNAMENT',
            lobbyId: lobbyCode
        }));

        // Wait for matches to be created
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Reset for next round (in real scenario, tournament would continue)
        console.log(`✅ Tournament round ${round} completed\n`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('✅ Random matchmaking test completed');
    
    // Close connections
    connections.forEach(conn => {
        if (conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.close();
        }
    });
}

testRandomMatchmaking().catch(console.error);