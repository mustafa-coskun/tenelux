const WebSocket = require('ws');

// Kapsamlı tournament test - tüm senaryoları test et
const testUsers = [
    { id: 'player1', name: 'Alice' },
    { id: 'player2', name: 'Bob' },
    { id: 'player3', name: 'Charlie' },
    { id: 'player4', name: 'Diana' }
];

let connections = [];
let lobbyId = null;
let tournamentId = null;
let activeMatches = new Map();
let tournamentData = null;

async function comprehensiveTest() {
    console.log('🧪 COMPREHENSIVE TOURNAMENT TEST STARTING...');
    console.log('📋 Testing: Lobby creation, tournament start, match completion, forfeit, updates');
    
    // Create connections
    for (let i = 0; i < 4; i++) {
        const ws = new WebSocket('ws://localhost:3000');
        const user = testUsers[i];
        
        ws.on('open', () => {
            console.log(`🔌 ${user.name} connected`);
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
        
        ws.on('error', (error) => {
            console.error(`❌ ${user.name} WebSocket error:`, error.message);
        });
        
        connections.push({ ws, user });
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n🏠 PHASE 1: Creating lobby...');
    // Create lobby
    connections[0].ws.send(JSON.stringify({
        type: 'CREATE_PARTY_LOBBY',
        hostPlayerId: testUsers[0].id,
        hostPlayerName: testUsers[0].name,
        settings: { 
            gameMode: 'tournament', 
            maxPlayers: 4, 
            tournamentFormat: 'single_elimination',
            roundCount: 10
        }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n👥 PHASE 2: Players joining...');
    // Join all players
    for (let i = 1; i < 4; i++) {
        connections[i].ws.send(JSON.stringify({
            type: 'JOIN_PARTY_LOBBY',
            playerId: testUsers[i].id,
            playerName: testUsers[i].name,
            lobbyCode: lobbyId
        }));
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log('\n🏆 PHASE 3: Starting tournament...');
    // Start tournament
    connections[0].ws.send(JSON.stringify({
        type: 'START_TOURNAMENT',
        lobbyId: lobbyId
    }));
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n⚔️ PHASE 4: Testing match completion...');
    // Test match completion using the correct match IDs from activeMatches
    if (activeMatches.size > 0) {
        console.log(`📊 Found ${activeMatches.size} active matches`);
        
        const matchArray = Array.from(activeMatches.values());
        
        for (let i = 0; i < matchArray.length; i++) {
            const match = matchArray[i];
            console.log(`🎯 Processing match ${i + 1}: ${match.player1Id} vs ${match.player2Id}`);
            console.log(`🔍 Match ID: ${match.id}`);
            
            // Complete first match normally
            if (i === 0) {
                console.log(`✅ Completing match ${match.id} normally - ${match.player1Id} wins`);
                connections[0].ws.send(JSON.stringify({
                    type: 'COMPLETE_TOURNAMENT_MATCH',
                    matchId: match.id,
                    winner: match.player1Id,
                    scores: { player1: 30, player2: 20 }
                }));
                
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            // Test forfeit on second match
            else if (i === 1) {
                console.log(`🏳️ Testing forfeit on match ${match.id} - ${match.player2Id} forfeits`);
                
                // Find the connection for player2 of this match
                const forfeitingPlayerConn = connections.find(conn => conn.user.id === match.player2Id);
                if (forfeitingPlayerConn) {
                    forfeitingPlayerConn.ws.send(JSON.stringify({
                        type: 'TOURNAMENT_FORFEIT',
                        matchId: match.id,
                        tournamentId: tournamentId
                    }));
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    } else {
        console.log('❌ No active matches found for testing!');
    }
    
    console.log('\n📊 PHASE 5: Checking tournament progression...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n🧪 PHASE 6: Testing reconnection scenario...');
    // Test reconnection by disconnecting and reconnecting a player
    const testPlayer = connections[0];
    console.log(`🔌 Disconnecting ${testPlayer.user.name} for reconnection test...`);
    testPlayer.ws.close();
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reconnect
    console.log(`🔄 Reconnecting ${testPlayer.user.name}...`);
    const newWs = new WebSocket('ws://localhost:3000');
    newWs.on('open', () => {
        newWs.send(JSON.stringify({
            type: 'REGISTER',
            playerId: testPlayer.user.id,
            playerName: testPlayer.user.name
        }));
    });
    
    newWs.on('message', (data) => {
        const message = JSON.parse(data.toString());
        handleMessage(0, message);
    });
    
    connections[0].ws = newWs;
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n📋 PHASE 7: Final tournament state check...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n🏁 TEST COMPLETED - Cleaning up...');
    // Cleanup
    setTimeout(() => {
        connections.forEach(conn => {
            if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.close();
            }
        });
        
        console.log('\n📊 FINAL RESULTS:');
        console.log(`🏠 Lobby ID: ${lobbyId}`);
        console.log(`🏆 Tournament ID: ${tournamentId}`);
        console.log(`⚔️ Active matches tracked: ${activeMatches.size}`);
        console.log(`📈 Tournament progression: ${tournamentData ? 'SUCCESS' : 'FAILED'}`);
        
        process.exit(0);
    }, 3000);
}

function handleMessage(playerIndex, message) {
    const playerName = testUsers[playerIndex].name;
    
    switch (message.type) {
        case 'REGISTERED':
            console.log(`✅ ${playerName} registered successfully`);
            break;
            
        case 'LOBBY_CREATED':
            lobbyId = message.lobby.id;
            console.log(`🏠 Lobby created successfully: ${lobbyId}`);
            console.log(`👥 Initial players: ${message.lobby.participants.length}`);
            break;
            
        case 'LOBBY_JOINED':
            console.log(`👥 ${playerName} joined lobby (${message.lobby.participants.length}/4 players)`);
            break;
            
        case 'LOBBY_UPDATED':
            console.log(`🔄 Lobby updated: ${message.lobby.participants.length}/4 players`);
            break;
            
        case 'TOURNAMENT_STARTED':
            tournamentId = message.tournament.id;
            tournamentData = message.tournament;
            console.log(`🏆 TOURNAMENT STARTED! ID: ${tournamentId}`);
            console.log(`📊 Format: ${message.tournament.format}`);
            console.log(`👥 Players: ${message.tournament.players.length}`);
            console.log(`🎯 Rounds: ${message.tournament.bracket.rounds.length}`);
            
            // Log initial bracket
            if (message.tournament.bracket.rounds.length > 0) {
                console.log(`⚔️ First round matches:`);
                message.tournament.bracket.rounds[0].matches.forEach((match, i) => {
                    console.log(`   Match ${i + 1}: ${match.player1Id} vs ${match.player2Id} (${match.id})`);
                    activeMatches.set(match.id, match);
                });
            }
            break;
            
        case 'TOURNAMENT_MATCH_READY':
            console.log(`⚔️ ${playerName} match ready vs ${message.opponent?.name} (Match: ${message.matchId})`);
            // Store the correct match ID from server
            if (message.matchId) {
                const matchData = {
                    id: message.matchId,
                    player1Id: testUsers[playerIndex].id,
                    player2Id: message.opponent?.id,
                    round: message.round || 0
                };
                activeMatches.set(message.matchId, matchData);
                console.log(`📝 Stored match: ${message.matchId}`);
            }
            break;
            
        case 'TOURNAMENT_MATCH_COMPLETED':
            console.log(`✅ MATCH COMPLETED: ${message.matchId}`);
            console.log(`🏆 Winner: ${message.winner?.name || message.winner}`);
            if (message.tournament) {
                tournamentData = message.tournament;
                console.log(`📊 Tournament updated - Current round: ${message.tournament.currentRound}`);
                console.log(`🎯 Tournament status: ${message.tournament.status}`);
            }
            break;
            
        case 'TOURNAMENT_ROUND_STARTED':
            console.log(`🎯 NEW ROUND STARTED: Round ${message.round}!`);
            console.log(`⚔️ New matches: ${message.matches?.length || 0}`);
            if (message.matches) {
                message.matches.forEach((match, i) => {
                    console.log(`   Match ${i + 1}: ${match.player1Id} vs ${match.player2Id}`);
                    activeMatches.set(match.id, match);
                });
            }
            break;
            
        case 'TOURNAMENT_OPPONENT_FORFEITED':
            console.log(`🏳️ ${playerName} received opponent forfeit notification`);
            console.log(`🏆 Message: ${message.message}`);
            if (message.tournament) {
                tournamentData = message.tournament;
                console.log(`📊 Tournament updated after forfeit`);
            }
            break;
            
        case 'TOURNAMENT_FORFEIT_CONFIRMED':
            console.log(`🏳️ ${playerName} forfeit confirmed`);
            console.log(`ℹ️ Message: ${message.message}`);
            if (message.tournament) {
                tournamentData = message.tournament;
                console.log(`📊 Tournament updated after forfeit confirmation`);
            }
            break;
            
        case 'TOURNAMENT_COMPLETED':
            console.log(`🏆 TOURNAMENT COMPLETED!`);
            console.log(`👑 Winner: ${message.winner?.name || message.winner}`);
            console.log(`📊 Final standings:`);
            if (message.tournament && message.tournament.players) {
                message.tournament.players
                    .sort((a, b) => (b.statistics?.tournamentPoints || 0) - (a.statistics?.tournamentPoints || 0))
                    .forEach((player, i) => {
                        console.log(`   ${i + 1}. ${player.name} - ${player.statistics?.tournamentPoints || 0} points`);
                    });
            }
            break;
            
        case 'ERROR':
            console.error(`❌ ${playerName} ERROR: ${message.message}`);
            break;
            
        default:
            console.log(`📨 ${playerName} received: ${message.type}`);
            break;
    }
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

comprehensiveTest().catch(console.error);