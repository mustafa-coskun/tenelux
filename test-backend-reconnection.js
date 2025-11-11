const WebSocket = require('ws');

// Test just the backend reconnection logic
async function testBackendReconnection() {
    console.log('🧪 Testing Backend Tournament Reconnection...');
    
    // Use the same session token from the original logs
    const sessionToken = 'guest_9f3fe562c2735d064eeedbf000803c614a0ea96b6c221b0aac24f9b8d91c5ce5';
    
    const ws = new WebSocket('ws://localhost:3000');
    
    await new Promise((resolve) => {
        ws.on('open', () => {
            console.log('✅ Connected to server');
            resolve();
        });
    });

    // Register with the session token
    ws.send(JSON.stringify({
        type: 'REGISTER',
        playerId: null,
        sessionToken: sessionToken
    }));

    // Listen for messages
    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('📨 Received:', message.type);
        
        if (message.type === 'TOURNAMENT_MATCH_RECONNECTED') {
            console.log('✅ SUCCESS: Received TOURNAMENT_MATCH_RECONNECTED');
            console.log('Match ID:', message.matchId);
            console.log('Opponent:', message.opponent?.name);
            console.log('Current Round:', message.currentRound);
            console.log('Game State:', message.gameState);
        } else if (message.type === 'REGISTERED') {
            console.log('✅ Successfully registered - no old tournament reconnection (this is good!)');
        }
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✅ Backend reconnection test completed');
    ws.close();
}

testBackendReconnection().catch(console.error);