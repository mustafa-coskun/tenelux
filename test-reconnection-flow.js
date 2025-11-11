const WebSocket = require('ws');

// Test the complete tournament reconnection flow
async function testReconnectionFlow() {
    console.log('🧪 Testing Complete Tournament Reconnection Flow...');
    
    const players = [
        { id: 'test_player_1', name: 'Test Player 1' },
        { id: 'test_player_2', name: 'Test Player 2' },
        { id: 'test_player_3', name: 'Test Player 3' },
        { id: 'test_player_4', name: 'Test Player 4' }
    ];

    const connections = [];

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
            if (message.type === 'TOURNAMENT_MATCH_READY') {
                console.log(`⚔️ ${players[i].name} match ready vs ${message.opponent?.name || 'Unknown'}`);
            } else if (message.type === 'TOURNAMENT_MATCH_RECONNECTED') {
                console.log(`🔄 ${players[i].name} reconnected to match: ${message.matchId}`);
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

    await new Promise(resolve => setTimeout(resolve, 500));

    // Capture lobby code
    let lobbyCode = null;
    connections[0].ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'LOBBY_CREATED') {
            lobbyCode = message.lobby.code;
            console.log(`🏠 Lobby created: ${lobbyCode}`);
        }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

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
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start tournament
    console.log('🏆 Starting tournament...');
    connections[0].ws.send(JSON.stringify({
        type: 'START_TOURNAMENT',
        lobbyId: lobbyCode
    }));

    // Wait for tournament to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('🔄 Simulating reconnection...');
    
    // Disconnect and reconnect first player to test reconnection
    connections[0].ws.close();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Reconnect
    const reconnectWs = new WebSocket('ws://localhost:3000');
    await new Promise((resolve) => {
        reconnectWs.on('open', () => {
            console.log('🔌 Player 1 reconnecting...');
            reconnectWs.send(JSON.stringify({
                type: 'REGISTER',
                playerId: players[0].id,
                sessionToken: players[0].id
            }));
            resolve();
        });
    });

    reconnectWs.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log(`📨 Reconnected player received: ${message.type}`);
        
        if (message.type === 'TOURNAMENT_MATCH_RECONNECTED') {
            console.log('✅ SUCCESS: Tournament match reconnection working!');
            console.log('Match ID:', message.matchId);
            console.log('Opponent:', message.opponent?.name);
            console.log('Current Round:', message.currentRound);
            console.log('Game State:', message.gameState);
        }
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ Reconnection flow test completed');
    
    // Close all connections
    connections.forEach(conn => {
        if (conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.close();
        }
    });
    reconnectWs.close();
}

testReconnectionFlow().catch(console.error);