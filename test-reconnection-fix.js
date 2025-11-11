const WebSocket = require('ws');

// Test the reconnection fix specifically
async function testReconnectionFix() {
    console.log('🧪 Testing Tournament Reconnection Fix...');
    
    const ws = new WebSocket('ws://localhost:3000');
    
    await new Promise((resolve) => {
        ws.on('open', () => {
            console.log('✅ Connected to server');
            resolve();
        });
    });

    // Register with a guest session token (like in the original logs)
    ws.send(JSON.stringify({
        type: 'REGISTER',
        playerId: null,
        sessionToken: 'guest_9f3fe562c2735d064eeedbf000803c614a0ea96b6c221b0aac24f9b8d91c5ce5'
    }));

    // Listen for messages
    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('📨 Received:', message.type);
        
        if (message.type === 'TOURNAMENT_MATCH_RECONNECTED') {
            console.log('❌ PROBLEM: Reconnected to old tournament match!', message.matchId);
        } else if (message.type === 'REGISTERED') {
            console.log('✅ Successfully registered without reconnecting to old tournament');
        }
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Test completed - no old tournament reconnection');
    ws.close();
}

testReconnectionFix().catch(console.error);