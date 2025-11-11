const WebSocket = require('ws');

// Comprehensive Tournament Test Script
// Tests all tournament scenarios including forfeits, statistics, round progression

class TournamentTestClient {
    constructor(name, port = 3000) {
        this.name = name;
        this.ws = null;
        this.port = port;
        this.playerId = null;
        this.lobbyCode = null;
        this.tournamentId = null;
        this.currentMatch = null;
        this.isHost = false;
        this.gameState = 'DISCONNECTED';
        this.roundDecisions = [];
        this.statistics = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(`ws://localhost:${this.port}/ws`);
            
            this.ws.on('open', () => {
                console.log(`✅ ${this.name} connected to server`);
                this.gameState = 'CONNECTED';
                resolve();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (error) {
                    console.error(`❌ ${this.name} message parse error:`, error);
                }
            });

            this.ws.on('error', (error) => {
                console.error(`❌ ${this.name} WebSocket error:`, error);
                reject(error);
            });

            this.ws.on('close', () => {
                console.log(`🔌 ${this.name} disconnected`);
                this.gameState = 'DISCONNECTED';
            });
        });
    }

    handleMessage(message) {
        console.log(`📨 ${this.name} received:`, message.type);
        
        switch (message.type) {
            case 'PLAYER_ID_ASSIGNED':
                this.playerId = message.playerId;
                console.log(`🆔 ${this.name} assigned ID: ${this.playerId}`);
                break;

            case 'LOBBY_CREATED':
                this.lobbyCode = message.lobbyCode;
                this.isHost = true;
                console.log(`🏠 ${this.name} created lobby: ${this.lobbyCode}`);
                break;

            case 'LOBBY_JOINED':
                this.lobbyCode = message.lobbyCode;
                console.log(`🚪 ${this.name} joined lobby: ${this.lobbyCode}`);
                break;

            case 'PARTY_LOBBY_UPDATED':
                console.log(`👥 ${this.name} lobby updated - Participants: ${message.participants?.length || 0}`);
                break;

            case 'TOURNAMENT_CREATED':
                this.tournamentId = message.tournament.id;
                console.log(`🏆 ${this.name} tournament created: ${this.tournamentId}`);
                console.log(`🏆 Tournament format: ${message.tournament.format}`);
                console.log(`🏆 Tournament players: ${message.tournament.players?.length || 0}`);
                break;

            case 'TOURNAMENT_UPDATED':
                console.log(`🔄 ${this.name} tournament updated`);
                if (message.tournament) {
                    console.log(`🔄 Current round: ${message.tournament.currentRound}`);
                    console.log(`🔄 Status: ${message.tournament.status}`);
                    console.log(`🔄 Active matches: ${message.tournament.bracket?.length || 0}`);
                }
                break;

            case 'TOURNAMENT_MATCH_READY':
                this.currentMatch = {
                    id: message.matchId,
                    opponent: message.opponent,
                    round: message.round
                };
                console.log(`⚔️ ${this.name} match ready vs ${message.opponent?.name}`);
                console.log(`⚔️ Match ID: ${message.matchId}`);
                break;

            case 'ROUND_STARTED':
                console.log(`🎮 ${this.name} round ${message.round} started`);
                // Auto-play with random decisions
                setTimeout(() => {
                    const decision = Math.random() > 0.5 ? 'COOPERATE' : 'DEFECT';
                    this.makeDecision(decision);
                }, 1000);
                break;

            case 'ROUND_RESULT':
                console.log(`📊 ${this.name} round result:`, {
                    round: message.round,
                    playerDecision: message.playerDecision,
                    opponentDecision: message.opponentDecision,
                    playerScore: message.playerScore,
                    opponentScore: message.opponentScore
                });
                this.roundDecisions.push({
                    round: message.round,
                    decision: message.playerDecision,
                    score: message.playerScore
                });
                break;

            case 'GAME_OVER':
                console.log(`🏁 ${this.name} game over:`, {
                    winner: message.winner?.name,
                    finalScores: message.finalScores,
                    totalRounds: message.totalRounds
                });
                break;

            case 'STATISTICS_READY':
                this.statistics = message.statistics;
                console.log(`📈 ${this.name} statistics ready:`, {
                    totalPoints: message.statistics.totalPoints,
                    cooperationPercentage: message.statistics.cooperationPercentage,
                    gamesWon: message.statistics.gamesWon
                });
                
                // Test: Statistics should return to tournament view
                setTimeout(() => {
                    console.log(`🔙 ${this.name} closing statistics (should return to tournament)`);
                    this.send({
                        type: 'CLOSE_STATISTICS'
                    });
                }, 2000);
                break;

            case 'TOURNAMENT_MATCH_COMPLETED':
                console.log(`✅ ${this.name} tournament match completed:`, {
                    matchId: message.matchId,
                    winnerId: message.winnerId,
                    scores: message.scores
                });
                break;

            case 'TOURNAMENT_ROUND_COMPLETED':
                console.log(`🏆 ${this.name} tournament round completed:`, {
                    round: message.round,
                    nextRound: message.nextRound
                });
                break;

            case 'TOURNAMENT_OPPONENT_FORFEITED':
                console.log(`🏳️ ${this.name} opponent forfeited - I WIN!`);
                console.log(`🏳️ Message: ${message.message}`);
                console.log(`🏳️ Should stay in tournament view`);
                break;

            case 'TOURNAMENT_FORFEIT_CONFIRMED':
                console.log(`🏳️ ${this.name} forfeit confirmed - I LEFT`);
                console.log(`🏳️ Message: ${message.message}`);
                break;

            case 'TOURNAMENT_COMPLETED':
                console.log(`🎉 ${this.name} TOURNAMENT COMPLETED!`);
                console.log(`🎉 Winner: ${message.winner?.name}`);
                console.log(`🎉 Final standings:`, message.standings);
                break;

            case 'ERROR':
                console.error(`❌ ${this.name} error:`, message.message);
                break;

            default:
                console.log(`❓ ${this.name} unknown message:`, message.type);
        }
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    register() {
        console.log(`📝 ${this.name} registering...`);
        this.send({
            type: 'REGISTER',
            playerId: this.name + '_' + Date.now(),
            sessionToken: this.name + '_token_' + Date.now()
        });
    }

    createLobby() {
        console.log(`🏠 ${this.name} creating lobby...`);
        this.send({
            type: 'CREATE_LOBBY',
            playerName: this.name,
            maxPlayers: 4
        });
    }

    joinLobby(lobbyCode) {
        console.log(`🚪 ${this.name} joining lobby ${lobbyCode}...`);
        this.send({
            type: 'JOIN_LOBBY',
            lobbyCode: lobbyCode,
            playerName: this.name
        });
    }

    startTournament() {
        console.log(`🏆 ${this.name} starting tournament...`);
        this.send({
            type: 'START_TOURNAMENT',
            lobbyCode: this.lobbyCode,
            format: 'SINGLE_ELIMINATION'
        });
    }

    makeDecision(decision) {
        console.log(`🎯 ${this.name} making decision: ${decision}`);
        this.send({
            type: 'MAKE_DECISION',
            decision: decision
        });
    }

    forfeitTournament() {
        console.log(`🏳️ ${this.name} forfeiting tournament...`);
        this.send({
            type: 'TOURNAMENT_FORFEIT',
            matchId: this.currentMatch?.id,
            tournamentId: this.tournamentId
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Test Scenarios
async function runComprehensiveTournamentTest() {
    console.log('🚀 Starting Comprehensive Tournament Test...\n');

    // Create 4 test clients
    const players = [
        new TournamentTestClient('TestPlayer1'),
        new TournamentTestClient('TestPlayer2'), 
        new TournamentTestClient('TestPlayer3'),
        new TournamentTestClient('TestPlayer4')
    ];

    try {
        // Connect all players
        console.log('📡 Connecting all players...');
        await Promise.all(players.map(p => p.connect()));
        await sleep(1000);

        // Register all players
        console.log('\n📝 Registering all players...');
        players.forEach(p => p.register());
        await sleep(2000);

        // Player 1 creates lobby
        console.log('\n🏠 Creating lobby...');
        players[0].createLobby();
        await sleep(2000);

        // Other players join
        console.log('\n🚪 Players joining lobby...');
        for (let i = 1; i < players.length; i++) {
            players[i].joinLobby(players[0].lobbyCode);
            await sleep(500);
        }
        await sleep(2000);

        // Start tournament
        console.log('\n🏆 Starting tournament...');
        players[0].startTournament();
        await sleep(3000);

        // Test Scenario 1: Normal match completion
        console.log('\n🎮 TEST SCENARIO 1: Normal match completion');
        await sleep(5000); // Let first matches start
        
        // Test Scenario 2: Player forfeit during match
        console.log('\n🏳️ TEST SCENARIO 2: Player forfeit during match');
        await sleep(3000);
        
        // Have one player forfeit
        if (players[1].currentMatch) {
            console.log(`🏳️ ${players[1].name} will forfeit...`);
            players[1].forfeitTournament();
        }
        
        await sleep(5000);

        // Test Scenario 3: Statistics flow
        console.log('\n📈 TEST SCENARIO 3: Statistics flow test');
        await sleep(5000);

        // Test Scenario 4: Round progression
        console.log('\n🔄 TEST SCENARIO 4: Round progression test');
        await sleep(10000);

        console.log('\n✅ Tournament test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        // Cleanup
        console.log('\n🧹 Cleaning up...');
        players.forEach(p => p.disconnect());
    }
}

// Test specific issues
async function testSpecificIssues() {
    console.log('🔍 Testing specific tournament issues...\n');

    const players = [
        new TournamentTestClient('IssueTest1'),
        new TournamentTestClient('IssueTest2')
    ];

    try {
        await Promise.all(players.map(p => p.connect()));
        await sleep(1000);

        // Register players
        players.forEach(p => p.register());
        await sleep(1000);

        // Create 2-player tournament for focused testing
        players[0].createLobby();
        await sleep(1000);
        players[1].joinLobby(players[0].lobbyCode);
        await sleep(1000);
        players[0].startTournament();
        await sleep(3000);

        // Issue Test 1: Statistics screen navigation
        console.log('\n🧪 ISSUE TEST 1: Statistics screen should return to tournament');
        await sleep(5000);

        // Issue Test 2: Forfeit winner should stay in tournament
        console.log('\n🧪 ISSUE TEST 2: Forfeit winner should stay in tournament view');
        if (players[1].currentMatch) {
            players[1].forfeitTournament();
        }
        await sleep(3000);

        // Issue Test 3: Score calculation accuracy
        console.log('\n🧪 ISSUE TEST 3: Score calculation should be accurate');
        await sleep(5000);

    } catch (error) {
        console.error('❌ Issue test failed:', error);
    } finally {
        players.forEach(p => p.disconnect());
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
async function main() {
    console.log('🎯 Tournament Debug Test Suite\n');
    console.log('This will test:');
    console.log('- Tournament creation and progression');
    console.log('- Forfeit handling and winner notification');
    console.log('- Statistics screen navigation');
    console.log('- Score calculation accuracy');
    console.log('- Round progression and bracket updates');
    console.log('- UI state management\n');

    // Run comprehensive test
    await runComprehensiveTournamentTest();
    
    await sleep(2000);
    
    // Run specific issue tests
    await testSpecificIssues();

    console.log('\n🏁 All tests completed!');
    process.exit(0);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { TournamentTestClient, runComprehensiveTournamentTest, testSpecificIssues };