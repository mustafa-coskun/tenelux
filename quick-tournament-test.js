const WebSocket = require('ws');

// Hızlı tournament test - sadece progression'ı test et
const testUsers = [
    { id: 'player1', name: 'Alice' },
    { id: 'player2', name: 'Bob' },
    { id: 'player3', name: 'Charlie' },
    { id: 'player4', name: 'Diana' }
];

let connections = [];
let lobbyId = null;
let tournamentId = null;

async function quickTest() {
    console.log('🧪 Quick Tournament Test...');
    
    // Create connections
    for (let i = 0; i < 4; i++) {
        const ws = new WebSocket('ws://localhost:3000');
        const user = testUsers[i];
        
        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'REGISTER',
                playerId: user.id,
                playerName: user.name
            }));
        });
        
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            handleMessage(i, message);
        });
        
        connections.push({ ws, user });
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create lobby
    connections[0].ws.send(JSON.stringify({
        type: 'CREATE_PARTY_LOBBY',
        hostPlayerId: testUsers[0].id,
        hostPlayerName: testUsers[0].name,
        settings: { gameMode: 'tournament', maxPlayers: 4, tournamentFormat: 'single_elimination' }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Join all players
    for (let i = 1; i < 4; i++) {
        connections[i].ws.send(JSON.stringify({
            type: 'JOIN_PARTY_LOBBY',
            playerId: testUsers[i].id,
            playerName: testUsers[i].name,
            lobbyCode: lobbyId
        }));
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start tournament
    connections[0].ws.send(JSON.stringify({
        type: 'START_TOURNAMENT',
        lobbyId: lobbyId
    }));
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Complete matches
    if (tournamentId) {
        const match1Id = `tournament_${tournamentId}_match_${tournamentId}_0_0`;
        const match2Id = `tournament_${tournamentId}_match_${tournamentId}_0_1`;
        
        console.log('\n🧪 Completing matches...');
        
        // Complete match 1: Alice wins
        connections[0].ws.send(JSON.stringify({
            type: 'COMPLETE_TOURNAMENT_MATCH',
            matchId: match1Id,
            winner: 'player1',
            scores: { player1: 30, player2: 20 }
        }));
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Complete match 2: Diana wins
        connections[0].ws.send(JSON.stringify({
            type: 'COMPLETE_TOURNAMENT_MATCH',
            matchId: match2Id,
            winner: 'player2', // player2 in Charlie vs Diana = Diana
            scores: { player1: 15, player2: 25 }
        }));
        
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Cleanup
    setTimeout(() => {
        connections.forEach(conn => {
            if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.close();
            }
        });
        process.exit(0);
    }, 5000);
}

function handleMessage(playerIndex, message) {
    const playerName = testUsers[playerIndex].name;
    
    switch (message.type) {
        case 'REGISTERED':
            console.log(`✅ ${playerName} registered`);
            break;
            
        case 'LOBBY_CREATED':
            lobbyId = message.lobby.id;
            console.log(`🏠 Lobby created: ${lobbyId}`);
            break;
            
        case 'LOBBY_JOINED':
            console.log(`👥 ${playerName} joined lobby`);
            break;
            
        case 'TOURNAMENT_STARTED':
            tournamentId = message.tournament.id;
            console.log(`🏆 Tournament started! ID: ${tournamentId}`);
            break;
            
        case 'TOURNAMENT_MATCH_READY':
            console.log(`⚔️ ${playerName} match ready vs ${message.opponent?.name}`);
            break;
            
        case 'TOURNAMENT_MATCH_COMPLETED_MANUALLY':
            console.log(`✅ Match completed: ${message.matchId}`);
            break;
            
        case 'TOURNAMENT_ROUND_STARTED':
            console.log(`🎯 NEW ROUND STARTED: Round ${message.round}!`);
            console.log(`⚔️ New matches: ${message.matches?.length || 0}`);
            break;
            
        case 'TOURNAMENT_COMPLETED':
            console.log(`🏆 TOURNAMENT COMPLETED! Winner: ${message.winner?.name}`);
            break;
            
        case 'ERROR':
            console.error(`❌ ${playerName} error: ${message.message}`);
            break;
    }
}

quickTest().catch(console.error);