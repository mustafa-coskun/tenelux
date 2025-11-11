const WebSocket = require('ws');

// Test tournament UI flow with real user IDs
async function testTournamentUI() {
    console.log('🧪 Testing Tournament UI Flow...');
    
    const connections = [];
    const players = [
        { id: '07a9e126bfd5b1cfcbb6d84e817599fde46ff114f971fd609fb89a0731cf349c', name: 'Test' },
        { id: '7e3d47e916bb5e0bbda5ee9f4adc9ed3fb2fd6d1669323499465b528e710dd31', name: 'Test User' },
        { id: 'guest_9f3fe562c2735d064eeedbf000803c614a0ea96b6c221b0aac24f9b8d91c5ce5', name: 'Misafir 646' },
        { id: 'guest_0a628539adca1ffb277c510556199b352f8ddd47a00d00649d5b5618342984cb', name: 'Misafir 844' }
    ];

    // Connect all players
    for (let i = 0; i < players.length; i++) {
        const ws = new WebSocket('ws://localhost:3000');
        connections.push({ ws, player: players[i] });
        
        await new Promise((resolve) => {
            ws.on('open', () => {
                console.log(`✅ ${players[i].name} connected`);
                // Register with session token
                ws.send(JSON.stringify({
                    type: 'REGISTER',
                    playerId: null,
                    sessionToken: players[i].id
                }));
                resolve();
            });
        });

        // Add message handlers
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            console.log(`📨 ${players[i].name} received:`, message.type);
            
            if (message.type === 'TOURNAMENT_MATCH_READY') {
                console.log(`⚔️ ${players[i].name} match ready vs ${message.opponent?.name || 'Unknown'}`);
            }
            
            // Store lobby code for host
            if (i === 0 && message.type === 'LOBBY_CREATED') {
                connections[0].lobbyCode = message.lobbyCode || message.code || message.lobby?.code;
                console.log(`🏠 Lobby created: ${connections[0].lobbyCode}`, message);
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

    await new Promise(resolve => setTimeout(resolve, 500));

    // Wait for lobby creation
    await new Promise(resolve => setTimeout(resolve, 500));

    const lobbyId = connections[0].lobbyCode;
    if (!lobbyId) {
        console.log('❌ Failed to create lobby');
        return;
    }

    // Other players join
    for (let i = 1; i < players.length; i++) {
        console.log(`👥 ${players[i].name} joining lobby`);
        connections[i].ws.send(JSON.stringify({
            type: 'JOIN_PARTY_LOBBY',
            lobbyCode: lobbyId,
            playerName: players[i].name
        }));
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start tournament
    console.log('🏆 Starting tournament...');
    connections[0].ws.send(JSON.stringify({
        type: 'START_TOURNAMENT',
        lobbyId: lobbyId
    }));

    // Wait for tournament to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Tournament test completed');
    
    // Close connections
    connections.forEach(conn => conn.ws.close());
}

testTournamentUI().catch(console.error);