// WebSocket Game Server

const WebSocket = require('ws');
const { generateId } = require('../utils/helpers');

class GameServer {
    constructor(server, dbManager, logger) {
        this.wss = new WebSocket.Server({ server });
        this.dbManager = dbManager;
        this.logger = logger;

        // Game state
        this.connectedClients = new Map();
        this.serverSessions = new Map();
        this.matchmakingQueue = [];
        this.activeMatches = new Map();
        this.partyLobbies = new Map();
        this.activeTournaments = new Map();
        this.privateGames = new Map(); // gameCode -> { hostId, guestId, status }
        
        // Server-side player ID management
        // Maps: sessionToken -> serverPlayerId
        this.sessionToPlayerId = new Map();
        // Maps: serverPlayerId -> playerData
        this.serverPlayers = new Map();
        // Maps: connectionId -> sessionToken
        this.connectionToSession = new Map();
        // Maps: clientId (WebSocket) -> tournamentPlayerId (for tournament matches)
        this.clientIdToTournamentPlayerId = new Map();
        // Maps: tournamentPlayerId -> clientId (reverse mapping)
        this.tournamentPlayerIdToClientId = new Map();

        this.setupWebSocketHandlers();
    }
    
    /**
     * Generate a secure server-side player ID
     * Format: srv_<timestamp>_<random>
     */
    generateServerPlayerId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 15);
        return `srv_${timestamp}_${random}`;
    }
    
    /**
     * Generate AI player ID
     * Format: ai_bot_<timestamp>_<random>
     */
    generateAIPlayerId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 15);
        return `ai_bot_${timestamp}_${random}`;
    }
    
    /**
     * Get or create server player ID for a session
     */
    getOrCreateServerPlayerId(sessionToken, playerData = {}) {
        // Check if we already have a player ID for this session
        let playerId = this.sessionToPlayerId.get(sessionToken);
        
        if (!playerId) {
            // Create new server-side player ID
            playerId = this.generateServerPlayerId();
            this.sessionToPlayerId.set(sessionToken, playerId);
            
            // Store player data
            this.serverPlayers.set(playerId, {
                id: playerId,
                sessionToken: sessionToken,
                name: playerData.name || 'Player',
                isAI: false,
                createdAt: new Date(),
                lastActivity: new Date(),
                ...playerData
            });
            
            console.log('🆔 Created new server player ID:', {
                sessionToken: sessionToken.substring(0, 8) + '...',
                playerId: playerId
            });
        } else {
            // Update last activity
            const player = this.serverPlayers.get(playerId);
            if (player) {
                player.lastActivity = new Date();
            }
        }
        
        return playerId;
    }
    
    /**
     * Validate that a player ID belongs to the session
     */
    validatePlayerIdForSession(playerId, sessionToken) {
        const expectedPlayerId = this.sessionToPlayerId.get(sessionToken);
        return expectedPlayerId === playerId;
    }
    
    /**
     * Get player data by server player ID
     */
    getPlayerData(playerId) {
        return this.serverPlayers.get(playerId);
    }

    setupWebSocketHandlers() {
        this.wss.on('connection', (ws) => {
            ws.clientId = null;

            if (this.logger) {
                this.logger.debug('New WebSocket connection');
            }

            ws.on('message', async (message) => {
                try {
                    console.log('📨 Raw message received:', message.toString());
                    const data = JSON.parse(message);

                    if (this.logger) {
                        this.logger.debug('Server received WebSocket message', {
                            type: data.type,
                            clientId: ws.clientId,
                            hasData: !!data
                        });
                    }

                    await this.handleMessage(ws, data);
                } catch (error) {
                    console.error('❌ WebSocket message parsing error:', error);
                    console.error('❌ Raw message that caused error:', message.toString());
                    if (this.logger) {
                        this.logger.error('WebSocket message error', error);
                    }
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message format' }));
                }
            });

            ws.on('close', () => {
                if (ws.clientId) {
                    this.handleDisconnection(ws.clientId);
                }
            });

            ws.on('error', (error) => {
                if (this.logger) {
                    this.logger.error('WebSocket error', error);
                }
            });
        });
    }

    broadcastToMatch(matchId, message) {
        try {
            if (!this.activeMatches || !this.tournamentMatches) {
                console.warn('⚠️ broadcastToMatch called with missing maps.');
                return;
            }

            const match =
                this.activeMatches.get(matchId) ||
                this.tournamentMatches.get(matchId);

            if (!match) {
                console.warn(`⚠️ No active or tournament match found for matchId: ${matchId}`);
                return;
            }

            const playerIds = [match.player1.playerId, match.player2.playerId];
            for (const playerId of playerIds) {
                const ws = this.clients.get(playerId);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(message));
                    console.log(`📤 Sent '${message.type}' to ${playerId}`);
                }
            }
        } catch (err) {
            console.error('❌ broadcastToMatch error:', err);
        }
    }

    async handleMessage(ws, data) {
        switch (data.type) {
            case 'REGISTER':
                console.log('🔑 REGISTER received - sessionToken:', data.sessionToken ? 'YES' : 'NO', 'playerId:', data.playerId);

                // Use session token as clientId if provided, otherwise generate one
                ws.clientId = data.sessionToken || data.playerId || generateId();
                this.connectedClients.set(ws.clientId, ws);
                
                // If playerId is provided and different from clientId, create mapping for tournament matches
                if (data.playerId && data.playerId !== ws.clientId) {
                    this.clientIdToTournamentPlayerId.set(ws.clientId, String(data.playerId));
                    this.tournamentPlayerIdToClientId.set(String(data.playerId), ws.clientId);
                    console.log('🔑 Player ID mapping created:', {
                        clientId: ws.clientId.substring(0, 20) + '...',
                        playerId: data.playerId
                    });
                }

                // Check if player was in an active tournament match and reconnect
                for (const [matchId, match] of this.activeMatches.entries()) {
                    if (match.isTournamentMatch &&
                        (match.player1.playerId === ws.clientId || match.player2.playerId === ws.clientId)) {

                        // Only reconnect to matches from active tournaments
                        const tournament = this.activeTournaments.get(match.tournamentId);
                        if (!tournament || tournament.status === 'COMPLETED') {
                            console.log(`[WS INFO] Skipping reconnection to inactive tournament match`, {
                                matchId: matchId,
                                tournamentId: match.tournamentId,
                                tournamentStatus: tournament?.status || 'NOT_FOUND'
                            });
                            continue;
                        }

                        console.log(`[WS INFO] Tournament player reconnected to match`, {
                            matchId: matchId,
                            playerId: ws.clientId,
                            tournamentId: match.tournamentId
                        });

                        // Mark player as reconnected
                        if (match.player1.playerId === ws.clientId) {
                            match.player1.disconnected = false;
                        } else {
                            match.player2.disconnected = false;
                        }

                        // Send match state to reconnected player with correct opponent
                        const opponentPlayer = match.player1.playerId === ws.clientId ? match.player2.player : match.player1.player;
                        
                        ws.send(JSON.stringify({
                            type: 'TOURNAMENT_MATCH_RECONNECTED',
                            matchId: matchId,
                            opponent: opponentPlayer, // Send opponent, not self
                            currentRound: match.currentRound,
                            scores: match.scores,
                            gameState: match.gameState,
                            message: 'Turnuva maçına yeniden bağlandınız!'
                        }));

                        // Notify opponent about reconnection
                        const opponentId = match.player1.playerId === ws.clientId ?
                            match.player2.playerId : match.player1.playerId;

                        this.broadcastToClient(opponentId, {
                            type: 'TOURNAMENT_OPPONENT_RECONNECTED',
                            matchId: matchId,
                            message: 'Rakibiniz yeniden bağlandı!'
                        });

                        break;
                    }
                }

                // If session token provided, validate it
                if (data.sessionToken && this.dbManager) {
                    // Guest sessions don't need database validation
                    if (data.sessionToken.startsWith('guest_')) {
                        ws.isAuthenticated = false; // Guests are not authenticated users
                        ws.userId = data.sessionToken; // Use session token as userId for guests
                        if (this.logger) {
                            this.logger.debug('Guest session accepted', {
                                clientId: ws.clientId,
                                guestId: ws.userId
                            });
                        }
                    } else {
                        // Regular user session - validate against database
                        try {
                            const sessionRepo = this.dbManager.getSessionRepository();
                            const session = await sessionRepo.findByToken(data.sessionToken);
                            if (session && session.isActive) {
                                // Update session last used
                                await sessionRepo.updateLastUsed(session.id);
                                ws.userId = session.userId;
                                ws.isAuthenticated = true;
                                if (this.logger) {
                                    this.logger.debug('WebSocket authenticated with session', {
                                        clientId: ws.clientId,
                                        userId: ws.userId
                                    });
                                }
                            } else {
                                ws.isAuthenticated = false;
                                if (this.logger) {
                                    this.logger.warn('Invalid session token provided', { clientId: ws.clientId });
                                }
                            }
                        } catch (error) {
                            ws.isAuthenticated = false;
                            if (this.logger) {
                                this.logger.error('Session validation error', error);
                            }
                        }
                    }
                } else {
                    ws.isAuthenticated = false;
                }

                // Create or update server session
                let session = this.serverSessions.get(ws.clientId);
                if (!session) {
                    session = this.createServerSession(ws.clientId, ws.userId || ws.clientId);
                    this.serverSessions.set(ws.clientId, session);
                    if (this.logger) {
                        this.logger.debug('Created new server session', {
                            clientId: ws.clientId,
                            userId: ws.userId,
                            authenticated: ws.isAuthenticated
                        });
                    }
                } else {
                    session.clientId = ws.clientId;
                    session.connectionStatus = 'connected';
                    session.lastSeen = new Date();
                    if (this.logger) {
                        this.logger.debug('Restored existing server session', {
                            clientId: ws.clientId,
                            userId: ws.userId,
                            authenticated: ws.isAuthenticated
                        });
                    }
                }

                ws.send(JSON.stringify({
                    type: 'REGISTERED',
                    playerId: ws.clientId,
                    authenticated: ws.isAuthenticated,
                    userId: ws.userId
                }));
                if (this.logger) {
                    this.logger.debug('WebSocket client registered', {
                        clientId: ws.clientId,
                        authenticated: ws.isAuthenticated,
                        userId: ws.userId
                    });
                }
                break;



            case 'CREATE_PARTY_LOBBY':
                console.log('🎮 CREATE_PARTY_LOBBY received:', data);
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                try {
                    // Extract player name from player object or use direct hostPlayerName
                    const hostPlayerName = data.player?.name || data.hostPlayerName || 'Unknown Player';
                    console.log('🎮 Creating lobby for host:', hostPlayerName, 'ID:', ws.clientId);
                    
                    const lobby = this.createPartyLobby(ws.clientId, hostPlayerName, data.settings);
                    ws.send(JSON.stringify({
                        type: 'LOBBY_CREATED',
                        lobby: lobby
                    }));
                } catch (error) {
                    console.error('Failed to create lobby:', error);
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Failed to create lobby: ' + error.message
                    }));
                }
                break;

            case 'JOIN_PARTY_LOBBY':
                console.log('🎮 JOIN_PARTY_LOBBY received:', data);
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                try {
                    // Use client-provided player ID for lobby management
                    const joiningPlayerId = data.player?.id || ws.clientId;
                    const playerName = data.player?.name || data.playerName || 'Unknown Player';
                    console.log('🎮 Player joining lobby:', playerName, 'ID:', joiningPlayerId, 'Code:', data.lobbyCode);
                    
                    // Map client player ID to connection
                    this.connectedClients.set(joiningPlayerId, ws);
                    
                    const lobby = this.joinPartyLobby(joiningPlayerId, playerName, data.lobbyCode);
                    
                    // Send LOBBY_JOINED to the joining player
                    ws.send(JSON.stringify({
                        type: 'LOBBY_JOINED',
                        lobby: lobby
                    }));
                    
                    // Broadcast LOBBY_UPDATED to all lobby participants
                    this.broadcastToLobby(data.lobbyCode, {
                        type: 'LOBBY_UPDATED',
                        lobby: lobby
                    });
                } catch (error) {
                    console.error('Failed to join lobby:', error);
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Failed to join lobby: ' + error.message
                    }));
                }
                break;

            case 'LEAVE_PARTY_LOBBY':
                console.log('🎮 LEAVE_PARTY_LOBBY received:', data);
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                try {
                    const lobby = this.leavePartyLobby(ws.clientId, data.lobbyCode);
                    if (lobby) {
                        // Broadcast to remaining lobby participants
                        this.broadcastToLobby(data.lobbyCode, {
                            type: 'LOBBY_UPDATED',
                            lobby: lobby
                        });
                    }
                } catch (error) {
                    console.error('Failed to leave lobby:', error);
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Failed to leave lobby: ' + error.message
                    }));
                }
                break;

            case 'JOIN_QUEUE':
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                // Check if player is in a party lobby
                let isInPartyLobby = false;
                for (const [lobbyCode, lobby] of this.partyLobbies.entries()) {
                    if (lobby.participants.some(p => p.id === ws.clientId)) {
                        isInPartyLobby = true;
                        ws.send(JSON.stringify({ 
                            type: 'ERROR', 
                            message: 'Lobby\'deyken genel matchmaking\'e katılamazsınız. Önce lobby\'den ayrılın.' 
                        }));
                        break;
                    }
                }

                if (isInPartyLobby) return;

                // Allow both authenticated users and guests (who are now stored in DB)
                // Authentication check removed since guests are now proper users

                this.updateSessionActivity(ws.clientId);
                this.removeFromQueue(ws.clientId);

                const queueEntry = {
                    playerId: ws.clientId,
                    player: data.player,
                    timestamp: Date.now(),
                    preferences: data.preferences || {
                        gameMode: 'multi',
                        maxWaitTime: 300000,
                        trustScoreTolerance: 15,
                        skillLevelTolerance: 200
                    }
                };

                this.matchmakingQueue.push(queueEntry);
                if (this.logger) {
                    this.logger.debug('Player joined enhanced matchmaking queue', {
                        playerName: data.player.name,
                        queueSize: this.matchmakingQueue.length,
                        preferences: queueEntry.preferences
                    });
                }

                ws.send(JSON.stringify({
                    type: 'QUEUE_STATUS',
                    position: this.matchmakingQueue.length,
                    queueSize: this.matchmakingQueue.length,
                    estimatedWaitTime: Math.max(30, this.matchmakingQueue.length * 15),
                    matchmakingMode: 'enhanced'
                }));

                this.findMatch();
                break;

            case 'LEAVE_QUEUE':
                if (ws.clientId) {
                    this.removeFromQueue(ws.clientId);
                    ws.send(JSON.stringify({
                        type: 'LEFT_QUEUE'
                    }));
                }
                break;

            case 'FORFEIT_MATCH':
                console.log('🏳️ FORFEIT_MATCH received from:', ws.clientId);
                
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    break;
                }

                // Find the match this player is in
                let forfeitMatchId = null;
                let forfeitMatch = null;
                
                for (const [matchId, match] of this.activeMatches.entries()) {
                    if (match.player1.playerId === ws.clientId || match.player2.playerId === ws.clientId) {
                        forfeitMatchId = matchId;
                        forfeitMatch = match;
                        break;
                    }
                }

                if (!forfeitMatch) {
                    console.log('⚠️ No active match found for forfeit');
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'No active match found' }));
                    break;
                }

                const forfeitingPlayerId = ws.clientId;
                const forfeitOpponentId = forfeitMatch.player1.playerId === forfeitingPlayerId ? 
                    forfeitMatch.player2.playerId : forfeitMatch.player1.playerId;

                console.log('🏳️ Processing forfeit:', {
                    matchId: forfeitMatchId,
                    forfeitingPlayer: forfeitingPlayerId,
                    opponent: forfeitOpponentId
                });

                // Calculate forfeit scores
                const currentRound = forfeitMatch.currentRound || 0;
                const maxRounds = forfeitMatch.maxRounds || 10;
                const remainingRounds = Math.max(0, maxRounds - currentRound);
                const forfeitBonus = remainingRounds * 3;
                const currentScores = forfeitMatch.scores || { player1: 0, player2: 0 };
                
                const isPlayer1Winner = forfeitMatch.player1.playerId === forfeitOpponentId;
                const finalScores = {
                    player1: isPlayer1Winner ? currentScores.player1 + forfeitBonus : currentScores.player1,
                    player2: isPlayer1Winner ? currentScores.player2 : currentScores.player2 + forfeitBonus
                };

                console.log('🏳️ Forfeit scoring:', {
                    currentRound,
                    maxRounds,
                    remainingRounds,
                    forfeitBonus,
                    finalScores
                });

                // Send immediate statistics to winner (no waiting)
                this.broadcastToClient(forfeitOpponentId, {
                    type: 'SHOW_STATISTICS',
                    scores: finalScores,
                    forfeit: true,
                    forfeitedBy: forfeitingPlayerId,
                    isWinner: true,
                    immediate: true, // Flag to show immediately without waiting
                    message: 'Rakibiniz pes etti. Kazandınız!'
                });

                // Confirm forfeit to the forfeiting player
                ws.send(JSON.stringify({
                    type: 'FORFEIT_CONFIRMED',
                    message: 'Oyundan ayrıldınız'
                }));

                // Clean up match
                if (forfeitMatch.roundTimeout) {
                    clearTimeout(forfeitMatch.roundTimeout);
                }
                this.activeMatches.delete(forfeitMatchId);

                console.log('🏳️ Match ended due to forfeit:', forfeitMatchId);
                break;

            case 'CREATE_PRIVATE_GAME':
                if (!ws.clientId || !data.gameCode) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid request' }));
                    break;
                }

                // Oyun kodu zaten varsa hata
                if (this.privateGames.has(data.gameCode)) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game code already exists' }));
                    break;
                }

                // Private game oluştur
                this.privateGames.set(data.gameCode, {
                    hostId: ws.clientId,
                    hostPlayer: data.player,
                    guestId: null,
                    status: 'waiting',
                    createdAt: Date.now()
                });

                console.log(`🎮 Private game created: ${data.gameCode} by ${data.player.name}`);

                ws.send(JSON.stringify({
                    type: 'PRIVATE_GAME_CREATED',
                    gameCode: data.gameCode
                }));
                break;

            case 'JOIN_PRIVATE_GAME':
                if (!ws.clientId || !data.gameCode) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid request' }));
                    break;
                }

                const privateGame = this.privateGames.get(data.gameCode);

                if (!privateGame) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
                    break;
                }

                if (privateGame.status !== 'waiting') {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game already started' }));
                    break;
                }

                if (privateGame.hostId === ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Cannot join your own game' }));
                    break;
                }

                // Guest'i ekle ve maçı başlat
                privateGame.guestId = ws.clientId;
                privateGame.guestPlayer = data.player;
                privateGame.status = 'matched';

                console.log(`🎮 Player ${data.player.name} joined private game: ${data.gameCode}`);

                // Her iki oyuncuya da match found gönder
                const matchId = `private_${data.gameCode}_${Date.now()}`;
                
                const hostWs = Array.from(this.wss.clients).find(
                    client => client.clientId === privateGame.hostId
                );
                const guestWs = ws;

                if (hostWs) {
                    hostWs.send(JSON.stringify({
                        type: 'MATCH_FOUND',
                        matchId: matchId,
                        opponent: privateGame.guestPlayer,
                        isHost: true
                    }));
                }

                guestWs.send(JSON.stringify({
                    type: 'MATCH_FOUND',
                    matchId: matchId,
                    opponent: privateGame.hostPlayer,
                    isHost: false
                }));

                // Active match oluştur
                this.createPrivateMatch(matchId, privateGame.hostPlayer, privateGame.guestPlayer);

                // Private game'i temizle
                this.privateGames.delete(data.gameCode);
                break;

            case 'START_TOURNAMENT':
                console.log('🏆 START_TOURNAMENT received:', data);
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                try {
                    // startTournament now handles broadcasting TOURNAMENT_STARTED internally
                    // to ensure correct message order (TOURNAMENT_STARTED before TOURNAMENT_MATCH_READY)
                    const tournament = await this.startTournament(data.lobbyId, ws.clientId);
                    if (!tournament) {
                        throw new Error('Failed to create tournament');
                    }
                } catch (error) {
                    console.error('Failed to start tournament:', error);
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Failed to start tournament: ' + error.message
                    }));
                }
                break;

            case 'UPDATE_LOBBY_SETTINGS':
                console.log('⚙️ UPDATE_LOBBY_SETTINGS received:', data);
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                try {
                    const { lobbyId, settings } = data;
                    const lobby = this.partyLobbies.get(lobbyId);
                    
                    if (!lobby) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'Lobby not found'
                        }));
                        return;
                    }

                    // Check if user is host
                    if (lobby.hostPlayerId !== ws.clientId) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'Only host can update settings'
                        }));
                        return;
                    }

                    // Check if tournament is in progress
                    if (lobby.status === 'tournament_in_progress') {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'Cannot update settings during tournament'
                        }));
                        return;
                    }

                    // Update settings
                    lobby.settings = { ...lobby.settings, ...settings };
                    
                    // Update max players if changed
                    if (settings.maxPlayers && settings.maxPlayers !== lobby.maxPlayers) {
                        lobby.maxPlayers = settings.maxPlayers;
                    }

                    console.log('⚙️ Lobby settings updated:', {
                        lobbyId: lobbyId,
                        newSettings: lobby.settings,
                        maxPlayers: lobby.maxPlayers
                    });

                    // Broadcast updated lobby to all participants
                    this.broadcastToLobby(lobbyId, {
                        type: 'LOBBY_UPDATED',
                        lobby: lobby
                    });

                    // Confirm to host
                    ws.send(JSON.stringify({
                        type: 'SETTINGS_UPDATED',
                        message: 'Settings updated successfully'
                    }));

                } catch (error) {
                    console.error('Failed to update lobby settings:', error);
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Failed to update settings: ' + error.message
                    }));
                }
                break;

            case 'COMPLETE_TOURNAMENT_MATCH':
                // Test endpoint to manually complete tournament matches
                console.log('🧪 COMPLETE_TOURNAMENT_MATCH received:', data);
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                try {
                    const { matchId, winner, scores } = data;
                    console.log('🧪 Looking for match:', matchId);
                    console.log('🧪 Active matches count:', this.activeMatches.size);
                    
                    const match = this.activeMatches.get(matchId);
                    
                    if (!match) {
                        console.log('🧪 Match not found in activeMatches');
                        // List all active matches for debugging
                        for (const [id, m] of this.activeMatches.entries()) {
                            console.log('🧪 Available match:', id, 'Tournament ID:', m.tournamentId);
                        }
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'Match not found' }));
                        return;
                    }

                    console.log('🧪 Match found:', {
                        matchId: matchId,
                        tournamentId: match.tournamentId,
                        gameState: match.gameState
                    });

                    if (!match.tournamentId) {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'Not a tournament match' }));
                        return;
                    }

                    // Set match scores and complete it
                    match.scores = scores;
                    match.gameState = 'COMPLETED';
                    
                    console.log('🧪 Manually completing tournament match:', matchId, 'Winner:', winner);
                    console.log('🧪 About to call processTournamentMatchResult...');
                    
                    // Process tournament match result
                    this.processTournamentMatchResult(matchId, winner, scores);
                    
                    console.log('🧪 processTournamentMatchResult completed');
                    
                    ws.send(JSON.stringify({ 
                        type: 'TOURNAMENT_MATCH_COMPLETED_MANUALLY',
                        matchId: matchId,
                        winner: winner,
                        scores: scores
                    }));
                    
                } catch (error) {
                    console.error('🧪 Failed to complete tournament match:', error);
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Failed to complete tournament match: ' + error.message
                    }));
                }
                break;

            case 'TOURNAMENT_MATCH_RESULT':
                console.log('🏆 TOURNAMENT_MATCH_RESULT received:', data);
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                try {
                    const { tournamentId, matchResult } = data;
                    
                    if (!matchResult || !matchResult.matchId) {
                        console.error('❌ Invalid match result data');
                        return;
                    }
                    
                    console.log('🏆 Processing match result from client:', {
                        matchId: matchResult.matchId,
                        winnerId: matchResult.winnerId,
                        scores: { player1: matchResult.player1Score, player2: matchResult.player2Score }
                    });
                    
                    // This message is informational from client - server is the source of truth
                    // Server already processed the match and determined the winner
                    // Client perspectives may differ due to player1/player2 role swapping
                    console.log('✅ Match result acknowledged from client (informational only)');
                    
                } catch (error) {
                    console.error('❌ Failed to process tournament match result:', error);
                }
                break;

            case 'GAME_DECISION':
                this.updateSessionActivity(ws.clientId);

                const gameMatchId = data.matchId;
                const match = this.activeMatches.get(gameMatchId);

                console.log('🎮 GAME_DECISION received:', {
                    matchId: gameMatchId,
                    clientId: ws.clientId,
                    decision: data.decision,
                    round: data.round,
                    matchExists: !!match,
                    gameState: match?.gameState
                });

                if (match && match.gameState === 'WAITING_FOR_DECISIONS') {
                    // Check if this is player1 or player2
                    // Try both direct client ID match and tournament player ID match
                    const clientId = ws.clientId;
                    const tournamentPlayerId = this.clientIdToTournamentPlayerId?.get(clientId);
                    
                    const isPlayer1 = (match.player1.playerId === clientId) || 
                                     (tournamentPlayerId && match.player1.playerId === tournamentPlayerId);
                    const isPlayer2 = (match.player2.playerId === clientId) || 
                                     (tournamentPlayerId && match.player2.playerId === tournamentPlayerId);
                    
                    const roundDecisions = match.decisions.get(match.currentRound) || {};

                    console.log('🎮 Player identification:', {
                        clientId: clientId,
                        tournamentPlayerId: tournamentPlayerId,
                        player1Id: match.player1.playerId,
                        player2Id: match.player2.playerId,
                        isPlayer1: isPlayer1,
                        isPlayer2: isPlayer2,
                        currentRound: match.currentRound
                    });

                    if (isPlayer1) {
                        roundDecisions.player1Decision = data.decision;
                        console.log('🎮 Player 1 decision set:', data.decision);
                    } else if (isPlayer2) {
                        roundDecisions.player2Decision = data.decision;
                        console.log('🎮 Player 2 decision set:', data.decision);
                    } else {
                        console.error('🎮 Player not identified as player1 or player2!');
                        return;
                    }
                    match.decisions.set(match.currentRound, roundDecisions);

                    console.log('🎮 Current round decisions:', {
                        round: match.currentRound,
                        player1Decision: roundDecisions.player1Decision,
                        player2Decision: roundDecisions.player2Decision,
                        bothDecided: !!(roundDecisions.player1Decision && roundDecisions.player2Decision)
                    });

                    if (roundDecisions.player1Decision && roundDecisions.player2Decision) {
                        console.log('🎮 Both players decided, processing round result');
                        if (match.roundTimeout) {
                            clearTimeout(match.roundTimeout);
                            match.roundTimeout = null;
                        }
                        this.processRoundResult(match, gameMatchId);
                    } else {
                        console.log('🎮 Waiting for other player decision');
                    }
                } else {
                    console.log('🎮 Match not found or not in correct state:', {
                        matchExists: !!match,
                        gameState: match?.gameState,
                        expectedState: 'WAITING_FOR_DECISIONS'
                    });
                }
                break;

            case 'GAME_MESSAGE':
                const msgMatchId = data.matchId;
                const gameMatch = this.activeMatches.get(msgMatchId);
                if (gameMatch) {
                    const senderClientId = ws.clientId;
                    
                    // For tournament matches, check both direct client ID and tournament player ID
                    const tournamentPlayerId = this.clientIdToTournamentPlayerId.get(senderClientId);
                    
                    console.log('💬 GAME_MESSAGE routing:', {
                        senderClientId: senderClientId.substring(0, 20) + '...',
                        tournamentPlayerId: tournamentPlayerId,
                        player1Id: gameMatch.player1.playerId.substring(0, 20) + '...',
                        player2Id: gameMatch.player2.playerId.substring(0, 20) + '...',
                        isTournamentMatch: gameMatch.isTournamentMatch
                    });
                    
                    // Determine which player is sending
                    const isPlayer1 = (gameMatch.player1.playerId === senderClientId) || 
                                     (tournamentPlayerId && gameMatch.player1.playerId === tournamentPlayerId);
                    const isPlayer2 = (gameMatch.player2.playerId === senderClientId) || 
                                     (tournamentPlayerId && gameMatch.player2.playerId === tournamentPlayerId);
                    
                    let opponentId = null;
                    if (isPlayer1) {
                        opponentId = gameMatch.player2.playerId;
                        console.log('💬 Sender is Player1, sending to Player2:', opponentId.substring(0, 20) + '...');
                    } else if (isPlayer2) {
                        opponentId = gameMatch.player1.playerId;
                        console.log('💬 Sender is Player2, sending to Player1:', opponentId.substring(0, 20) + '...');
                    } else {
                        console.error('💬 ❌ Sender not identified as player1 or player2!');
                        return;
                    }

                    this.broadcastToClient(opponentId, {
                        type: 'OPPONENT_MESSAGE',
                        message: data.message,
                        timestamp: data.timestamp
                    });
                }
                break;

            case 'CREATE_PARTY_LOBBY':
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                // Security check for guests
                if (ws.isGuest && ws.guestSession) {
                    // Additional rate limiting for guests
                    if (ws.guestSession.rateLimitTokens <= 0) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'Rate limit exceeded. Please wait before creating another lobby.'
                        }));
                        return;
                    }
                    ws.guestSession.rateLimitTokens--;
                }

                // Allow both authenticated and guest users to create lobbies
                // Guest users won't have their stats saved to database

                // Only update session activity for authenticated users
                if (ws.isAuthenticated) {
                    this.updateSessionActivity(ws.clientId);
                }

                const lobbyCode = this.generateLobbyCode();
                const lobby = {
                    id: lobbyCode,
                    code: lobbyCode,
                    hostPlayerId: ws.clientId,
                    hostPlayerName: data.hostPlayerName,
                    participants: [{
                        id: ws.clientId,
                        name: data.hostPlayerName,
                        isHost: true,
                        isReady: true,
                        status: 'ready'
                    }],
                    currentPlayerCount: 1,
                    maxPlayers: (data.settings && data.settings.maxPlayers) || 8,
                    settings: data.settings || {
                        maxPlayers: 8,
                        roundCount: 10,
                        tournamentFormat: 'singleElimination',
                        allowSpectators: true,
                        chatEnabled: true,
                        autoStartWhenFull: false
                    },
                    status: 'waiting_for_players',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    tournament: null
                };

                // Store lobby (in production, use database)
                if (!this.partyLobbies) {
                    this.partyLobbies = new Map();
                }
                this.partyLobbies.set(lobbyCode, lobby);

                ws.send(JSON.stringify({
                    type: 'PARTY_LOBBY_CREATED',
                    lobbyCode: lobbyCode,
                    lobby: lobby
                }));

                if (this.logger) {
                    this.logger.info('Party lobby created', {
                        lobbyCode,
                        hostId: ws.clientId,
                        hostName: data.hostPlayerName
                    });
                }
                break;

            case 'JOIN_PARTY_LOBBY':
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                // Security check for guests
                if (ws.isGuest && ws.guestSession) {
                    if (ws.guestSession.rateLimitTokens <= 0) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'Rate limit exceeded. Please wait before joining another lobby.'
                        }));
                        return;
                    }
                    ws.guestSession.rateLimitTokens--;
                }

                const joinLobbyCode = data.lobbyCode;
                const joinLobby = this.partyLobbies?.get(joinLobbyCode);

                if (!joinLobby) {
                    ws.send(JSON.stringify({
                        type: 'PARTY_LOBBY_ERROR',
                        error: 'Lobby not found'
                    }));
                    return;
                }

                if (joinLobby.participants.length >= joinLobby.settings.maxPlayers) {
                    ws.send(JSON.stringify({
                        type: 'PARTY_LOBBY_ERROR',
                        error: 'Lobby is full'
                    }));
                    return;
                }

                if (joinLobby.status !== 'waiting_for_players') {
                    ws.send(JSON.stringify({
                        type: 'PARTY_LOBBY_ERROR',
                        error: 'Tournament has already started'
                    }));
                    return;
                }

                // Check if player already in lobby
                const existingPlayer = joinLobby.participants.find(p => p.id === ws.clientId);
                if (existingPlayer) {
                    ws.send(JSON.stringify({
                        type: 'PARTY_LOBBY_JOINED',
                        lobby: joinLobby
                    }));
                    return;
                }

                // Add player to lobby
                const newPlayer = {
                    id: ws.clientId,
                    name: data.playerName,
                    isHost: false,
                    isReady: false,
                    status: 'waiting'
                };

                joinLobby.participants.push(newPlayer);
                joinLobby.currentPlayerCount = joinLobby.participants.length;
                joinLobby.updatedAt = new Date();

                // Update lobby status based on player count
                if (joinLobby.currentPlayerCount >= 4) {
                    joinLobby.status = 'ready_to_start';
                } else {
                    joinLobby.status = 'waiting_for_players';
                }

                // Broadcast to all players in lobby
                this.broadcastToLobby(joinLobbyCode, {
                    type: 'PARTY_LOBBY_UPDATED',
                    lobby: joinLobby
                });

                ws.send(JSON.stringify({
                    type: 'PARTY_LOBBY_JOINED',
                    lobby: joinLobby
                }));

                if (this.logger) {
                    this.logger.info('Player joined party lobby', {
                        lobbyCode: joinLobbyCode,
                        playerId: ws.clientId,
                        playerName: data.playerName
                    });
                }
                break;

            case 'TOURNAMENT_FORFEIT':
                console.log('🏳️ TOURNAMENT_FORFEIT received:', data);
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                try {
                    const { matchId, tournamentId } = data;
                    const match = this.activeMatches.get(matchId);
                    
                    if (!match || !match.isTournamentMatch) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'Tournament match not found'
                        }));
                        return;
                    }

                    // Determine winner (opponent of the forfeiting player)
                    const forfeitingPlayerId = ws.clientId;
                    const winnerId = match.player1.playerId === forfeitingPlayerId ? 
                        match.player2.playerId : match.player1.playerId;
                    
                    console.log('🏳️ Tournament forfeit:', {
                        matchId: matchId,
                        forfeitingPlayer: forfeitingPlayerId,
                        winner: winnerId
                    });

                    // Calculate fair forfeit scores
                    const currentRound = match.currentRound || 0;
                    const maxRounds = match.maxRounds || 10;
                    const remainingRounds = maxRounds - currentRound;
                    
                    // Give winner 3 points for each remaining round
                    const forfeitBonus = remainingRounds * 3;
                    const currentScores = match.scores || { player1: 0, player2: 0 };
                    
                    // Complete the match with forfeit result
                    match.gameState = 'COMPLETED';
                    
                    if (match.player1.playerId === winnerId) {
                        match.scores = { 
                            player1: currentScores.player1 + forfeitBonus, 
                            player2: currentScores.player2 
                        };
                    } else {
                        match.scores = { 
                            player1: currentScores.player1, 
                            player2: currentScores.player2 + forfeitBonus 
                        };
                    }
                    
                    console.log('🏳️ Forfeit scoring:', {
                        currentRound: currentRound,
                        maxRounds: maxRounds,
                        remainingRounds: remainingRounds,
                        forfeitBonus: forfeitBonus,
                        finalScores: match.scores
                    });

                    // Process tournament match result
                    this.processTournamentMatchResult(match, matchId, winnerId);

                    // Get updated tournament data
                    const tournament = this.activeTournaments.get(match.tournamentId);

                    // Get player names from tournament
                    const winnerPlayer = tournament?.players?.find(p => p.id === winnerId);
                    const forfeitingPlayer = tournament?.players?.find(p => p.id === forfeitingPlayerId);
                    const winnerName = winnerPlayer?.name || 'Bilinmeyen Kazanan';
                    const forfeitingName = forfeitingPlayer?.name || 'Bilinmeyen Oyuncu';

                    // Create statistics data for forfeit
                    const forfeitStatistics = {
                        matchId: matchId,
                        isTournamentMatch: true,
                        tournamentId: match.tournamentId,
                        winner: {
                            id: winnerId,
                            name: winnerName
                        },
                        loser: {
                            id: forfeitingPlayerId,
                            name: forfeitingName
                        },
                        scores: match.scores,
                        rounds: match.rounds || [],
                        currentRound: currentRound,
                        maxRounds: maxRounds,
                        forfeit: true,
                        forfeitedBy: forfeitingPlayerId,
                        message: 'Rakibiniz pes etti'
                    };

                    // Notify forfeit to pes eden (if still connected)
                    this.broadcastToClient(forfeitingPlayerId, {
                        type: 'TOURNAMENT_FORFEIT_CONFIRMED',
                        message: 'Turnuvadan ayrıldınız.',
                        tournament: tournament
                    });

                    // Notify winner with statistics
                    console.log('🏳️ *** NOTIFYING WINNER WITH STATISTICS ***:', winnerId);
                    this.broadcastToClient(winnerId, {
                        type: 'SHOW_STATISTICS',
                        ...forfeitStatistics,
                        tournament: tournament
                    });
                    
                    // Also send opponent forfeited message
                    this.broadcastToClient(winnerId, {
                        type: 'TOURNAMENT_OPPONENT_FORFEITED',
                        message: 'Rakibiniz pes etti! Kazandınız!',
                        tournament: tournament,
                        statistics: forfeitStatistics
                    });
                    
                    // Broadcast to all lobby
                    this.broadcastToLobby(tournament.lobbyId, {
                        type: 'TOURNAMENT_UPDATED',
                        tournament: tournament,
                        message: 'Turnuva güncellendi - forfeit'
                    });

                } catch (error) {
                    console.error('Failed to process tournament forfeit:', error);
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Failed to process forfeit: ' + error.message
                    }));
                }
                break;

            case 'DEBUG_TOURNAMENT':
                console.log('🔍 DEBUG_TOURNAMENT received from:', ws.clientId);
                
                // Find active tournaments
                for (const [tournamentId, tournament] of this.activeTournaments.entries()) {
                    console.log('🔍 Tournament:', tournamentId);
                    console.log('🔍 Players:', tournament.players.map(p => ({ id: p.id, name: p.name })));
                    
                    // Find active matches for this tournament
                    for (const [matchId, match] of this.activeMatches.entries()) {
                        if (match.tournamentId === tournamentId) {
                            console.log('🔍 Match:', matchId);
                            console.log('🔍 Player1:', { id: match.player1.playerId, player: match.player1.player });
                            console.log('🔍 Player2:', { id: match.player2.playerId, player: match.player2.player });
                        }
                    }
                }
                break;

            case 'PING':
                // Heartbeat - respond with PONG
                ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));

                // Update session activity if client is registered
                if (ws.clientId) {
                    this.updateSessionActivity(ws.clientId);
                }
                break;

            case 'PONG':
                // Client responded to our ping - update activity
                if (ws.clientId) {
                    this.updateSessionActivity(ws.clientId);
                }
                break;

            case 'LEAVE_PARTY_LOBBY':
                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                const leaveLobbyCode = data.lobbyCode;
                const leaveLobby = this.partyLobbies?.get(leaveLobbyCode);

                if (!leaveLobby) {
                    ws.send(JSON.stringify({
                        type: 'PARTY_LOBBY_ERROR',
                        error: 'Lobby not found'
                    }));
                    return;
                }

                // Remove player from lobby
                const playerIndex = leaveLobby.participants.findIndex(p => p.id === ws.clientId);
                if (playerIndex === -1) {
                    ws.send(JSON.stringify({
                        type: 'PARTY_LOBBY_ERROR',
                        error: 'Player not in lobby'
                    }));
                    return;
                }

                const leavingPlayer = leaveLobby.participants[playerIndex];
                leaveLobby.participants.splice(playerIndex, 1);
                leaveLobby.currentPlayerCount = leaveLobby.participants.length;
                leaveLobby.updatedAt = new Date();

                // If host is leaving, transfer host to next player
                if (leavingPlayer.isHost && leaveLobby.participants.length > 0) {
                    const newHost = leaveLobby.participants[0];
                    newHost.isHost = true;
                    leaveLobby.hostPlayerId = newHost.id;
                    leaveLobby.hostPlayerName = newHost.name;

                    if (this.logger) {
                        this.logger.info('Host transferred due to leave', {
                            lobbyCode: leaveLobbyCode,
                            oldHost: ws.clientId,
                            newHost: newHost.id,
                            newHostName: newHost.name
                        });
                    }
                }

                // If lobby is empty, delete it
                if (leaveLobby.participants.length === 0) {
                    this.partyLobbies.delete(leaveLobbyCode);
                    if (this.logger) {
                        this.logger.info('Empty lobby deleted', { lobbyCode: leaveLobbyCode });
                    }
                } else {
                    // Broadcast to remaining players
                    this.broadcastToLobby(leaveLobbyCode, {
                        type: 'PLAYER_LEFT_LOBBY',
                        playerId: ws.clientId,
                        playerName: leavingPlayer.name,
                        lobby: leaveLobby,
                        newHost: leavingPlayer.isHost ? leaveLobby.participants[0] : null
                    });
                }

                // Confirm to leaving player
                ws.send(JSON.stringify({
                    type: 'PARTY_LOBBY_LEFT',
                    success: true
                }));

                if (this.logger) {
                    this.logger.info('Player left party lobby', {
                        lobbyCode: leaveLobbyCode,
                        playerId: ws.clientId,
                        playerName: leavingPlayer.name,
                        wasHost: leavingPlayer.isHost,
                        remainingPlayers: leaveLobby.participants.length
                    });
                }
                break;

            case 'DECISION_CHANGE_REQUEST':
                console.log('🔄 Decision change request received:', {
                    clientId: ws.clientId,
                    matchId: data.matchId,
                    roundNumber: data.roundNumber,
                    newDecision: data.newDecision
                });

                const changeMatchId = data.matchId;
                const changeMatch = this.activeMatches.get(changeMatchId);

                if (!changeMatch) {
                    console.log('🔄 Match not found for decision change:', changeMatchId);
                    ws.send(JSON.stringify({
                        type: 'DECISION_CHANGE_ERROR',
                        message: 'Oyun oturumu bulunamadı.'
                    }));
                    return;
                }

                // Update the decision in match data
                const roundDecisions = changeMatch.decisions.get(data.roundNumber);
                if (roundDecisions) {
                    // Check both direct clientId and tournament player ID mapping
                    let isPlayer1 = changeMatch.player1.playerId === ws.clientId;
                    
                    // If not matched, check tournament player ID mapping
                    if (!isPlayer1 && changeMatch.isTournamentMatch) {
                        const tournamentPlayerId = this.clientIdToTournamentPlayerId.get(ws.clientId);
                        if (tournamentPlayerId) {
                            isPlayer1 = changeMatch.player1.playerId === tournamentPlayerId;
                        }
                    }
                    
                    const oldDecision = isPlayer1 ? roundDecisions.player1Decision : roundDecisions.player2Decision;

                    if (isPlayer1) {
                        roundDecisions.player1Decision = data.newDecision;
                    } else {
                        roundDecisions.player2Decision = data.newDecision;
                    }

                    console.log('🔄 Decision changed:', {
                        round: data.roundNumber,
                        player: isPlayer1 ? 'player1' : 'player2',
                        oldDecision: oldDecision,
                        newDecision: data.newDecision,
                        wsClientId: ws.clientId.substring(0, 20) + '...',
                        matchPlayer1Id: changeMatch.player1.playerId,
                        matchPlayer2Id: changeMatch.player2.playerId
                    });

                    // Recalculate scores for this round
                    this.recalculateRoundScore(changeMatch, data.roundNumber);

                    // Track decision changes
                    if (!changeMatch.decisionChanges) {
                        changeMatch.decisionChanges = {
                            player1Complete: false,
                            player2Complete: false,
                            changesCount: 0
                        };
                    }

                    changeMatch.decisionChanges.changesCount++;

                    // Send confirmation (without broadcasting scores yet)
                    ws.send(JSON.stringify({
                        type: 'DECISION_CHANGED',
                        roundNumber: data.roundNumber,
                        newDecision: data.newDecision,
                        message: 'Karar değiştirildi. Diğer oyuncunun değişikliklerini bekliyor...'
                    }));

                    console.log('🔄 Decision change tracked:', {
                        round: data.roundNumber,
                        player: isPlayer1 ? 'player1' : 'player2',
                        totalChanges: changeMatch.decisionChanges.changesCount,
                        updatedScores: changeMatch.scores
                    });
                } else {
                    ws.send(JSON.stringify({
                        type: 'DECISION_CHANGE_ERROR',
                        message: 'Round bulunamadı.'
                    }));
                }
                break;

            case 'DECISION_REVERSAL_COMPLETE':
                console.log('🔄 Decision reversal complete received:', {
                    clientId: ws.clientId,
                    matchId: data.matchId
                });

                const completeMatchId = data.matchId;
                const completeMatch = this.activeMatches.get(completeMatchId);

                if (!completeMatch) {
                    ws.send(JSON.stringify({
                        type: 'REVERSAL_ERROR',
                        message: 'Oyun oturumu bulunamadı.'
                    }));
                    return;
                }

                // Finalize the game with updated scores
                const finalWinner = completeMatch.scores.player1 > completeMatch.scores.player2 ? 'player1' :
                    completeMatch.scores.player2 > completeMatch.scores.player1 ? 'player2' : 'tie';

                console.log('🔄 Finalizing game with updated scores:', {
                    finalScores: completeMatch.scores,
                    winner: finalWinner
                });

                // Send final statistics to both players
                this.broadcastToClient(completeMatch.player1.playerId, {
                    type: 'SHOW_STATISTICS',
                    finalScores: completeMatch.scores,
                    totalRounds: completeMatch.maxRounds,
                    winner: finalWinner,
                    session: completeMatch.session
                });

                this.broadcastToClient(completeMatch.player2.playerId, {
                    type: 'SHOW_STATISTICS',
                    finalScores: completeMatch.scores,
                    totalRounds: completeMatch.maxRounds,
                    winner: finalWinner,
                    session: completeMatch.session
                });

                // Mark match as completed for rematch functionality
                completeMatch.gameState = 'COMPLETED';
                console.log('🏁 Match marked as COMPLETED for rematch functionality');

                // Process tournament match result if this is a tournament match
                if (completeMatch.tournamentId) {
                    console.log('🏆 Processing tournament match result:', completeMatchId);
                    this.processTournamentMatchResult(completeMatchId, finalWinner, completeMatch.scores);
                }

                // Save updated game results
                if (!completeMatch.resultsSaved) {
                    try {
                        await this.saveGameResults(completeMatch, completeMatchId, finalWinner);
                        completeMatch.resultsSaved = true;
                        console.log('✅ Updated game results saved successfully');
                    } catch (error) {
                        console.error('❌ Error saving updated game results:', error);
                    }
                }

                // Clean up timeout but keep match for rematch
                if (completeMatch.reversalTimeout) {
                    clearTimeout(completeMatch.reversalTimeout);
                }
                this.activeMatches.delete(completeMatchId);
                break;

            case 'DECISION_CHANGES_COMPLETE':
                console.log('🔄 Player completed decision changes:', {
                    clientId: ws.clientId,
                    matchId: data.matchId
                });

                const changesCompleteMatchId = data.matchId;
                const changesCompleteMatch = this.activeMatches.get(changesCompleteMatchId);

                if (!changesCompleteMatch) {
                    ws.send(JSON.stringify({
                        type: 'REVERSAL_ERROR',
                        message: 'Oyun oturumu bulunamadı.'
                    }));
                    return;
                }

                // Initialize decision changes if not exists
                if (!changesCompleteMatch.decisionChanges) {
                    changesCompleteMatch.decisionChanges = {
                        player1Complete: false,
                        player2Complete: false,
                        changesCount: 0
                    };
                }

                // Mark player as complete
                // Try both direct client ID match and tournament player ID match
                const clientId = ws.clientId;
                const tournamentPlayerId = this.clientIdToTournamentPlayerId?.get(clientId);
                
                const isPlayer1Complete = (changesCompleteMatch.player1.playerId === clientId) || 
                                         (tournamentPlayerId && changesCompleteMatch.player1.playerId === tournamentPlayerId);
                
                console.log('🔄 Determining which player completed:', {
                    wsClientId: clientId,
                    tournamentPlayerId: tournamentPlayerId,
                    player1Id: changesCompleteMatch.player1.playerId,
                    player2Id: changesCompleteMatch.player2.playerId,
                    isPlayer1: isPlayer1Complete
                });
                
                if (isPlayer1Complete) {
                    changesCompleteMatch.decisionChanges.player1Complete = true;
                    console.log('✅ Player 1 marked as complete');
                } else {
                    changesCompleteMatch.decisionChanges.player2Complete = true;
                    console.log('✅ Player 2 marked as complete');
                }

                console.log('🔄 Decision changes completion status:', {
                    player1Complete: changesCompleteMatch.decisionChanges.player1Complete,
                    player2Complete: changesCompleteMatch.decisionChanges.player2Complete
                });

                // Check if both players are complete
                if (changesCompleteMatch.decisionChanges.player1Complete &&
                    changesCompleteMatch.decisionChanges.player2Complete) {

                    console.log('🔄 Both players completed decision changes - showing final results');

                    // Calculate final winner
                    const finalWinner = changesCompleteMatch.scores.player1 > changesCompleteMatch.scores.player2 ? 'player1' :
                        changesCompleteMatch.scores.player2 > changesCompleteMatch.scores.player1 ? 'player2' : 'tie';

                    // Send final scores to both players
                    this.broadcastToClient(changesCompleteMatch.player1.playerId, {
                        type: 'FINAL_SCORES_UPDATE',
                        finalScores: changesCompleteMatch.scores,
                        winner: finalWinner,
                        message: 'Tüm değişiklikler tamamlandı!'
                    });

                    this.broadcastToClient(changesCompleteMatch.player2.playerId, {
                        type: 'FINAL_SCORES_UPDATE',
                        finalScores: changesCompleteMatch.scores,
                        winner: finalWinner,
                        message: 'Tüm değişiklikler tamamlandı!'
                    });

                    // Show statistics immediately
                    this.finalizeDecisionReversal(changesCompleteMatch, changesCompleteMatchId);

                } else {
                    // Notify the completing player that we're waiting for the other
                    ws.send(JSON.stringify({
                        type: 'WAITING_FOR_OTHER_PLAYER',
                        message: 'Değişiklikleriniz kaydedildi. Diğer oyuncunun tamamlamasını bekliyoruz...'
                    }));
                }
                break;

            // case 'DECISION_REVERSAL_RESPONSE':
            //     console.log('🔄 Decision reversal response received:', {
            //         clientId: ws.clientId,
            //         accept: data.accept,
            //         acceptType: typeof data.accept,
            //         matchId: data.matchId,
            //         rawData: data
            //     });

            //     const reversalMatchId = data.matchId;
            //     const reversalMatch = this.activeMatches.get(reversalMatchId);

            //     if (!reversalMatch) {
            //         console.log('🔄 Match not found for reversal response:', reversalMatchId);
            //         console.log('🔄 Active matches:', Array.from(this.activeMatches.keys()));
            //         console.log('🔄 This might be due to timeout or previous cleanup');

            //         // Send error back to client
            //         ws.send(JSON.stringify({
            //             type: 'REVERSAL_ERROR',
            //             message: 'Oyun oturumu bulunamadı. Zaman aşımı nedeniyle istatistik ekranına geçiliyor.'
            //         }));
            //         return;
            //     }

            //     // Initialize reversal responses if not exists
            //     if (!reversalMatch.reversalResponses) {
            //         reversalMatch.reversalResponses = {};
            //     }

            //     // Store player's response
            //     const isPlayer1 = reversalMatch.player1.playerId === ws.clientId;
            //     if (isPlayer1) {
            //         reversalMatch.reversalResponses.player1 = data.accept;
            //         console.log('🔄 Player 1 reversal response:', data.accept);
            //     } else {
            //         reversalMatch.reversalResponses.player2 = data.accept;
            //         console.log('🔄 Player 2 reversal response:', data.accept);
            //     }

            //     // Check if both players responded
            //     const p1Response = reversalMatch.reversalResponses.player1;
            //     const p2Response = reversalMatch.reversalResponses.player2;

            //     console.log('🔄 Reversal responses status:', {
            //         player1: p1Response,
            //         player2: p2Response,
            //         bothResponded: p1Response !== undefined && p2Response !== undefined
            //     });

            //     if (p1Response !== undefined && p2Response !== undefined) {
            //         // Both players responded
            //         if (p1Response && p2Response) {
            //             // Both accepted - allow decision change
            //             console.log('🔄 Both players accepted reversal - entering selection phase');

            //             reversalMatch.gameState = 'REVERSAL_SELECTION';

            //             // Initialize decision change tracking
            //             reversalMatch.decisionChanges = {
            //                 player1Complete: false,
            //                 player2Complete: false,
            //                 changesCount: 0
            //             };

            //             this.broadcastToClient(reversalMatch.player1.playerId, {
            //                 type: 'REVERSAL_SELECTION_PHASE',
            //                 message: 'Her iki oyuncu da değişikliği kabul etti. Hangi turu değiştirmek istiyorsunuz?'
            //             });

            //             this.broadcastToClient(reversalMatch.player2.playerId, {
            //                 type: 'REVERSAL_SELECTION_PHASE',
            //                 message: 'Her iki oyuncu da değişikliği kabul etti. Hangi turu değiştirmek istiyorsunuz?'
            //             });

            //         } else if (!p1Response && !p2Response) {
            //             // Both rejected - go to statistics
            //             console.log('🔄 Both players rejected reversal - going to statistics');

            //             const winner = reversalMatch.scores.player1 > reversalMatch.scores.player2 ? 'player1' :
            //                 reversalMatch.scores.player2 > reversalMatch.scores.player1 ? 'player2' : 'tie';

            //             this.broadcastToClient(reversalMatch.player1.playerId, {
            //                 type: 'SHOW_STATISTICS',
            //                 finalScores: reversalMatch.scores,
            //                 totalRounds: reversalMatch.maxRounds,
            //                 winner: winner
            //             });

            //             this.broadcastToClient(reversalMatch.player2.playerId, {
            //                 type: 'SHOW_STATISTICS',
            //                 finalScores: reversalMatch.scores,
            //                 totalRounds: reversalMatch.maxRounds,
            //                 winner: winner
            //             });

            //             // Mark match as completed for rematch functionality
            //             reversalMatch.gameState = 'COMPLETED';

            //             // Save game results to database (if not already saved)
            //             if (!reversalMatch.resultsSaved) {
            //                 try {
            //                     await this.saveGameResults(reversalMatch, reversalMatchId, winner);
            //                     reversalMatch.resultsSaved = true;
            //                 } catch (error) {
            //                     console.error('❌ Error saving game results in both rejected:', error);
            //                 }
            //             }

            //             // Clean up match and timeout
            //             if (reversalMatch.reversalTimeout) {
            //                 clearTimeout(reversalMatch.reversalTimeout);
            //             }
            //             this.activeMatches.delete(reversalMatchId);

            //         } else {
            //             // One accepted, one rejected
            //             const acceptedPlayer = p1Response ? 'player1' : 'player2';
            //             const rejectedPlayer = p1Response ? 'player2' : 'player1';

            //             console.log('🔄 Mixed responses - one accepted, one rejected');

            //             // Notify the player who accepted that the other rejected
            //             const acceptedPlayerId = acceptedPlayer === 'player1' ?
            //                 reversalMatch.player1.playerId : reversalMatch.player2.playerId;

            //             const rejectedPlayerId = acceptedPlayer === 'player1' ?
            //                 reversalMatch.player2.playerId : reversalMatch.player1.playerId;

            //             this.broadcastToClient(acceptedPlayerId, {
            //                 type: 'REVERSAL_REJECTED',
            //                 message: 'Rakibiniz değişikliği kabul etmedi. İstatistik ekranına geçiliyor.'
            //             });

            //             this.broadcastToClient(rejectedPlayerId, {
            //                 type: 'REVERSAL_REJECTED',
            //                 message: 'Değişikliği reddettiniz. İstatistik ekranına geçiliyor.'
            //             });

            //             // Go to statistics after a short delay
            //             setTimeout(async () => {
            //                 const winner = reversalMatch.scores.player1 > reversalMatch.scores.player2 ? 'player1' :
            //                     reversalMatch.scores.player2 > reversalMatch.scores.player1 ? 'player2' : 'tie';

            //                 this.broadcastToClient(reversalMatch.player1.playerId, {
            //                     type: 'SHOW_STATISTICS',
            //                     finalScores: reversalMatch.scores,
            //                     totalRounds: reversalMatch.maxRounds,
            //                     winner: winner
            //                 });

            //                 this.broadcastToClient(reversalMatch.player2.playerId, {
            //                     type: 'SHOW_STATISTICS',
            //                     finalScores: reversalMatch.scores,
            //                     totalRounds: reversalMatch.maxRounds,
            //                     winner: winner
            //                 });

            //                 // Save game results to database (if not already saved)
            //                 if (!reversalMatch.resultsSaved) {
            //                     try {
            //                         await this.saveGameResults(reversalMatch, reversalMatchId, winner);
            //                         reversalMatch.resultsSaved = true;
            //                     } catch (error) {
            //                         console.error('❌ Error saving game results in mixed responses:', error);
            //                     }
            //                 }

            //                 // Clean up match and timeout
            //                 if (reversalMatch.reversalTimeout) {
            //                     clearTimeout(reversalMatch.reversalTimeout);
            //                 }
            //                 this.activeMatches.delete(reversalMatchId);
            //             }, 2000);
            //         }
            //     } else {
            //         // Only one player responded so far
            //         console.log('🔄 Waiting for other player response');

            //         // Notify the responding player that we're waiting for the other
            //         ws.send(JSON.stringify({
            //             type: 'REVERSAL_RESPONSE_RECEIVED',
            //             message: 'Yanıtınız alındı. Diğer oyuncunun yanıtı bekleniyor...'
            //         }));
            //     }
            //     break;

            case 'DECISION_REVERSAL_RESPONSE': {
                console.log('🔄 Decision reversal response received:', {
                    clientId: ws.clientId,
                    accept: data.accept,
                    acceptType: typeof data.accept,
                    matchId: data.matchId,
                    rawData: data,
                });

                const matchId = data.matchId;
                const reversalMatch =
                    this.activeMatches?.get(matchId) ||
                    this.tournamentMatches?.get(matchId);

                if (!reversalMatch) {
                    console.warn('⚠️ No active match found for reversal response:', matchId);
                    return;
                }

                // ✅ Eğer reversalResponses tanımlı değilse oluştur
                if (!reversalMatch.reversalResponses) {
                    reversalMatch.reversalResponses = { player1: undefined, player2: undefined };
                }
                
                // Check if both players already responded (duplicate message)
                const p1Current = reversalMatch.reversalResponses.player1;
                const p2Current = reversalMatch.reversalResponses.player2;
                if (p1Current !== undefined && p2Current !== undefined) {
                    console.log('⚠️ Both players already responded, ignoring duplicate');
                    return;
                }

                const clientId = ws.clientId;
                const tournamentPlayerId = this.clientIdToTournamentPlayerId?.get(clientId);

                const isPlayer1 =
                    reversalMatch.player1.playerId === clientId ||
                    (tournamentPlayerId && reversalMatch.player1.playerId === tournamentPlayerId);
                const isPlayer2 =
                    reversalMatch.player2.playerId === clientId ||
                    (tournamentPlayerId && reversalMatch.player2.playerId === tournamentPlayerId);

                if (!isPlayer1 && !isPlayer2) {
                    console.error('🚫 Player not identified as player1 or player2 for reversal!', {
                        clientId,
                        tournamentPlayerId,
                        player1Id: reversalMatch.player1.playerId,
                        player2Id: reversalMatch.player2.playerId,
                    });
                    return;
                }

                if (isPlayer1) {
                    reversalMatch.reversalResponses.player1 = data.accept;
                    console.log('🔄 Player 1 reversal response:', data.accept);
                } else if (isPlayer2) {
                    reversalMatch.reversalResponses.player2 = data.accept;
                    console.log('🔄 Player 2 reversal response:', data.accept);
                }

                const p1 = reversalMatch.reversalResponses.player1;
                const p2 = reversalMatch.reversalResponses.player2;
                const bothResponded = p1 !== undefined && p2 !== undefined;

                console.log('🔄 Reversal responses status:', {
                    player1: p1,
                    player2: p2,
                    bothResponded,
                });

                if (bothResponded) {
                    console.log('✅ Both players responded to reversal request.');

                    if (p1 && p2) {
                        console.log('🔁 Both players accepted reversal. Triggering rematch...');
                        
                        // Clear reversal timeout
                        if (reversalMatch.reversalTimeout) {
                            clearTimeout(reversalMatch.reversalTimeout);
                            reversalMatch.reversalTimeout = null;
                            console.log('⏰ Reversal timeout cleared (approved)');
                        }
                        
                        const reversalMessage = {
                            type: 'REVERSAL_APPROVED',
                            matchId,
                        };
                        
                        // Send directly to both players
                        this.broadcastToClient(reversalMatch.player1.playerId, reversalMessage);
                        this.broadcastToClient(reversalMatch.player2.playerId, reversalMessage);
                        
                        // Clear reversal responses for rematch
                        reversalMatch.reversalResponses = {};
                    } else {
                        console.log('❌ At least one player declined reversal. Showing statistics...');
                        
                        // Clear reversal timeout
                        if (reversalMatch.reversalTimeout) {
                            clearTimeout(reversalMatch.reversalTimeout);
                            reversalMatch.reversalTimeout = null;
                            console.log('⏰ Reversal timeout cleared (declined)');
                        }
                        
                        // Calculate winner
                        const winner = reversalMatch.scores.player1 > reversalMatch.scores.player2 ? 'player1' :
                            reversalMatch.scores.player2 > reversalMatch.scores.player1 ? 'player2' : 'tie';
                        
                        // Send personalized statistics to each player
                        console.log('📤 Sending statistics to both players');
                        
                        // Player 1 perspective
                        this.broadcastToClient(reversalMatch.player1.playerId, {
                            type: 'SHOW_STATISTICS',
                            matchId,
                            yourScore: reversalMatch.scores.player1,
                            opponentScore: reversalMatch.scores.player2,
                            finalScores: reversalMatch.scores,
                            totalRounds: reversalMatch.maxRounds,
                            winner: winner,
                            session: reversalMatch.session
                        });
                        
                        // Player 2 perspective
                        this.broadcastToClient(reversalMatch.player2.playerId, {
                            type: 'SHOW_STATISTICS',
                            matchId,
                            yourScore: reversalMatch.scores.player2,
                            opponentScore: reversalMatch.scores.player1,
                            finalScores: reversalMatch.scores,
                            totalRounds: reversalMatch.maxRounds,
                            winner: winner,
                            session: reversalMatch.session
                        });
                        
                        // Process tournament match result if this is a tournament match
                        if (reversalMatch.tournamentId) {
                            console.log('🏆 Processing tournament match result after reversal declined');
                            
                            let actualWinnerId = null;
                            if (winner === 'player1') {
                                actualWinnerId = reversalMatch.player1.playerId;
                            } else if (winner === 'player2') {
                                actualWinnerId = reversalMatch.player2.playerId;
                            } else {
                                actualWinnerId = 'tie';
                            }
                            
                            this.processTournamentMatchResultWithMatch(reversalMatch, matchId, actualWinnerId);
                        }
                        
                        // Save game results
                        if (!reversalMatch.resultsSaved) {
                            this.saveGameResults(reversalMatch, matchId, winner).catch(error => {
                                console.error('❌ Error saving game results:', error);
                            });
                            reversalMatch.resultsSaved = true;
                        }
                        
                        // Don't delete match yet - let clients view statistics first
                        // Set a timeout to clean up match after statistics viewing
                        console.log('✅ Statistics sent, match kept for viewing');
                        
                        setTimeout(() => {
                            console.log('🧹 Cleaning up match after statistics viewing:', matchId);
                            if (this.activeMatches) {
                                this.activeMatches.delete(matchId);
                            }
                            if (this.tournamentMatches) {
                                this.tournamentMatches.delete(matchId);
                            }
                        }, 30000); // 30 seconds to view statistics
                        
                        // Clear reversal responses
                        reversalMatch.reversalResponses = {};
                    }
                } else {
                    console.log('⏳ Waiting for the other player response...');
                }

                break;
            }


            case 'REMATCH_REQUEST':
                // Rematch functionality removed - return error
                ws.send(JSON.stringify({
                    type: 'ERROR',
                    message: 'Rematch functionality has been disabled'
                }));
                break;
                console.log('🔄 REMATCH_REQUEST received from:', ws.clientId);

                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                // Find the player's last completed match
                let lastMatchId = null;
                let lastMatch = null;

                // Look for recently completed matches involving this player
                for (const [matchId, match] of this.activeMatches.entries()) {
                    if ((match.player1.playerId === ws.clientId || match.player2.playerId === ws.clientId) &&
                        match.gameState === 'COMPLETED') {
                        lastMatchId = matchId;
                        lastMatch = match;
                        break;
                    }
                }

                if (!lastMatch) {
                    console.log('❌ No recent match found for rematch request');

                    // Send a more user-friendly message
                    ws.send(JSON.stringify({
                        type: 'REMATCH_NOT_AVAILABLE',
                        message: 'Rematch mevcut değil. Ana menüden yeni oyun başlatabilirsiniz.',
                        action: 'return_to_menu'
                    }));
                    return;
                }

                // Add this player to rematch requests
                if (!lastMatch.rematchRequests) {
                    lastMatch.rematchRequests = new Set();
                }
                lastMatch.rematchRequests.add(ws.clientId);

                const opponentId = lastMatch.player1.playerId === ws.clientId ?
                    lastMatch.player2.playerId : lastMatch.player1.playerId;

                console.log('🔄 Rematch request from:', ws.clientId, 'opponent:', opponentId);

                // Notify the requesting player
                ws.send(JSON.stringify({
                    type: 'REMATCH_REQUEST_SENT',
                    message: 'Rematch isteği gönderildi. Rakibinizin yanıtı bekleniyor...'
                }));

                // Notify the opponent
                this.broadcastToClient(opponentId, {
                    type: 'REMATCH_REQUEST_RECEIVED',
                    requesterId: ws.clientId,
                    message: 'Rakibiniz yeniden oynamak istiyor. Kabul ediyor musunuz?'
                });

                // Check if both players have requested rematch
                if (lastMatch.rematchRequests.has(opponentId)) {
                    console.log('🎮 Both players want rematch - starting new match');

                    // Both players want rematch - start a new match
                    const newMatchId = generateId();
                    const newMatch = {
                        id: newMatchId,
                        player1: lastMatch.player1,
                        player2: lastMatch.player2,
                        timestamp: Date.now(),
                        currentRound: 0,
                        maxRounds: 10,
                        decisions: new Map(),
                        scores: { player1: 0, player2: 0 },
                        gameState: 'WAITING_FOR_DECISIONS',
                        rematchRequests: new Set(),
                        roundTimeout: null
                    };

                    // Initialize first round
                    const initialRoundDecisions = {};
                    newMatch.decisions.set(0, initialRoundDecisions);

                    // Set round timeout
                    newMatch.roundTimeout = setTimeout(() => {
                        const timeoutMatch = this.activeMatches.get(newMatchId);
                        if (!timeoutMatch || timeoutMatch.roundTimeout === null) return;

                        const timeoutRoundDecisions = timeoutMatch.decisions.get(0) || {};

                        if (!timeoutRoundDecisions.player1Decision) {
                            timeoutRoundDecisions.player1Decision = 'COOPERATE';
                        }
                        if (!timeoutRoundDecisions.player2Decision) {
                            timeoutRoundDecisions.player2Decision = 'COOPERATE';
                        }

                        timeoutMatch.decisions.set(0, timeoutRoundDecisions);
                        timeoutMatch.roundTimeout = null;

                        this.processRoundResult(timeoutMatch, newMatchId);
                    }, 30000);

                    this.activeMatches.set(newMatchId, newMatch);

                    // Clean up old match
                    this.activeMatches.delete(lastMatchId);

                    // Notify both players
                    this.broadcastToClient(lastMatch.player1.playerId, {
                        type: 'REMATCH_ACCEPTED',
                        matchId: newMatchId,
                        opponent: lastMatch.player2.player,
                        isPlayer1: true,
                        message: 'Rematch kabul edildi! Yeni oyun başlıyor...'
                    });

                    this.broadcastToClient(lastMatch.player2.playerId, {
                        type: 'REMATCH_ACCEPTED',
                        matchId: newMatchId,
                        opponent: lastMatch.player1.player,
                        isPlayer1: false,
                        message: 'Rematch kabul edildi! Yeni oyun başlıyor...'
                    });

                    // Start first round after a short delay
                    setTimeout(() => {
                        this.broadcastToClient(lastMatch.player1.playerId, {
                            type: 'NEW_ROUND',
                            round: 0,
                            timerDuration: 30
                        });

                        this.broadcastToClient(lastMatch.player2.playerId, {
                            type: 'NEW_ROUND',
                            round: 0,
                            timerDuration: 30
                        });
                    }, 2000);
                }
                break;

            case 'REMATCH_RESPONSE':
                console.log('🔄 REMATCH_RESPONSE received from:', ws.clientId, 'accept:', data.accept);

                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                // Find the match where this player received a rematch request
                let responseMatchId = null;
                let responseMatch = null;

                for (const [matchId, match] of this.activeMatches.entries()) {
                    if ((match.player1.playerId === ws.clientId || match.player2.playerId === ws.clientId) &&
                        match.gameState === 'COMPLETED') {
                        responseMatchId = matchId;
                        responseMatch = match;
                        break;
                    }
                }

                if (!responseMatch) {
                    ws.send(JSON.stringify({
                        type: 'REMATCH_ERROR',
                        message: 'No match found for rematch response'
                    }));
                    return;
                }

                const requesterId = responseMatch.player1.playerId === ws.clientId ?
                    responseMatch.player2.playerId : responseMatch.player1.playerId;

                if (data.accept) {
                    // Player accepted - add to rematch requests and check if both want rematch
                    if (!responseMatch.rematchRequests) {
                        responseMatch.rematchRequests = new Set();
                    }
                    responseMatch.rematchRequests.add(ws.clientId);

                    if (responseMatch.rematchRequests.has(requesterId)) {
                        // Both players want rematch - handled in REMATCH_REQUEST case above
                        console.log('🎮 Rematch accepted by both players');
                    } else {
                        // Notify requester that their request was accepted
                        this.broadcastToClient(requesterId, {
                            type: 'REMATCH_RESPONSE_RECEIVED',
                            accepted: true,
                            message: 'Rakibiniz rematch isteğinizi kabul etti!'
                        });
                    }
                } else {
                    // Player rejected
                    this.broadcastToClient(requesterId, {
                        type: 'REMATCH_REJECTED',
                        message: 'Rakibiniz rematch isteğinizi reddetti.'
                    });

                    ws.send(JSON.stringify({
                        type: 'REMATCH_REJECTED',
                        message: 'Rematch isteğini reddettiniz.'
                    }));
                }
                break;

            case 'COMMUNICATION_MESSAGE':
                console.log('💬 COMMUNICATION_MESSAGE received from:', ws.clientId);

                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                // Find the active match for this player
                let commMatch = null;
                let commMatchId = null;

                for (const [matchId, match] of this.activeMatches.entries()) {
                    if (match.player1.playerId === ws.clientId || match.player2.playerId === ws.clientId) {
                        commMatch = match;
                        commMatchId = matchId;
                        break;
                    }
                }

                if (!commMatch) {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'No active match found for communication'
                    }));
                    return;
                }

                // Forward message to opponent
                const commOpponentId = commMatch.player1.playerId === ws.clientId ?
                    commMatch.player2.playerId : commMatch.player1.playerId;

                this.broadcastToClient(commOpponentId, {
                    type: 'OPPONENT_MESSAGE',
                    message: data.message,
                    timestamp: Date.now(),
                    senderId: ws.clientId
                });

                // Confirm message sent
                ws.send(JSON.stringify({
                    type: 'MESSAGE_SENT',
                    message: 'Mesaj gönderildi'
                }));
                break;

            case 'KICK_PLAYER':
                console.log('👢 KICK_PLAYER received from:', ws.clientId, 'target:', data.targetPlayerId);

                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                // Find the lobby where this player is host
                let kickLobby = null;
                for (const lobby of this.partyLobbies.values()) {
                    if (lobby.hostPlayerId === ws.clientId) {
                        kickLobby = lobby;
                        break;
                    }
                }

                if (!kickLobby) {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'You are not a host of any lobby'
                    }));
                    return;
                }

                // Remove the target player from lobby
                const targetIndex = kickLobby.participants.findIndex(p => p.id === data.targetPlayerId);
                if (targetIndex === -1) {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Player not found in lobby'
                    }));
                    return;
                }

                // Remove player
                const kickedPlayer = kickLobby.participants[targetIndex];
                kickLobby.participants.splice(targetIndex, 1);
                kickLobby.currentPlayerCount = kickLobby.participants.length;

                // Update lobby status based on player count
                if (kickLobby.currentPlayerCount >= 4) {
                    kickLobby.status = 'ready_to_start';
                } else {
                    kickLobby.status = 'waiting_for_players';
                }

                console.log(`[WS INFO] Player kicked from party lobby`, {
                    lobbyCode: kickLobby.code,
                    kickedPlayerId: data.targetPlayerId,
                    kickedPlayerName: kickedPlayer.name,
                    hostId: ws.clientId
                });

                // Notify kicked player
                this.broadcastToClient(data.targetPlayerId, {
                    type: 'KICKED_FROM_LOBBY',
                    lobbyCode: kickLobby.code,
                    message: 'Host tarafından lobiden atıldınız'
                });

                // Broadcast updated lobby to remaining participants
                this.broadcastToLobby(kickLobby.code, {
                    type: 'PARTY_LOBBY_UPDATED',
                    lobby: kickLobby
                });

                // Confirm to host
                ws.send(JSON.stringify({
                    type: 'PLAYER_KICKED',
                    targetPlayerId: data.targetPlayerId,
                    message: 'Player kicked successfully'
                }));
                break;

            case 'CLOSE_LOBBY':
                console.log('🗑️ CLOSE_LOBBY received from:', ws.clientId);

                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                // Find the lobby where this player is host
                let closeLobby = null;
                let closeLobbyCode = null;
                for (const [lobbyCode, lobby] of this.partyLobbies.entries()) {
                    if (lobby.hostPlayerId === ws.clientId) {
                        closeLobby = lobby;
                        closeLobbyCode = lobbyCode;
                        break;
                    }
                }

                if (!closeLobby) {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'You are not a host of any lobby'
                    }));
                    return;
                }

                console.log(`[WS INFO] Lobby closed by host`, {
                    lobbyCode: closeLobbyCode,
                    hostId: ws.clientId,
                    participantCount: closeLobby.participants.length
                });

                // Notify all participants that lobby is closed
                this.broadcastToLobby(closeLobbyCode, {
                    type: 'LOBBY_CLOSED',
                    message: 'Lobi host tarafından kapatıldı. Ana menüye yönlendiriliyorsunuz.'
                });

                // Remove lobby
                this.partyLobbies.delete(closeLobbyCode);

                // Confirm to host
                ws.send(JSON.stringify({
                    type: 'LOBBY_CLOSED',
                    message: 'Lobi başarıyla kapatıldı'
                }));
                break;

            case 'START_TOURNAMENT':
                console.log('🏆 START_TOURNAMENT received from:', ws.clientId, 'lobbyId:', data.lobbyId);

                if (!ws.clientId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
                    return;
                }

                // Find the lobby where this player is host
                let tournamentLobby = null;
                let tournamentLobbyCode = null;
                for (const [lobbyCode, lobby] of this.partyLobbies.entries()) {
                    if (lobby.hostPlayerId === ws.clientId && (lobbyCode === data.lobbyId || lobby.id === data.lobbyId)) {
                        tournamentLobby = lobby;
                        tournamentLobbyCode = lobbyCode;
                        break;
                    }
                }

                if (!tournamentLobby) {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'You are not the host of this lobby or lobby not found'
                    }));
                    return;
                }

                // Check if lobby has enough players and valid tournament size
                const playerCount = tournamentLobby.currentPlayerCount;
                const tournamentFormat = tournamentLobby.settings.tournamentFormat;
                
                if (playerCount < 4) {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Not enough players to start tournament (minimum 4 required)'
                    }));
                    return;
                }
                
                // Only Single Elimination is supported in this version
                if (tournamentFormat !== 'single_elimination') {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Only Single Elimination format is supported in this version. Double Elimination and Round Robin coming soon!'
                    }));
                    return;
                }
                
                // Elimination formatları için sadece 4, 8, 16 oyuncu
                if (tournamentFormat === 'single_elimination' || tournamentFormat === 'double_elimination') {
                    const validEliminationSizes = [4, 8, 16];
                    if (!validEliminationSizes.includes(playerCount)) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: `Invalid tournament size for elimination format. Must be 4, 8, or 16 players. Current: ${playerCount}`
                        }));
                        return;
                    }
                }
                
                // Round Robin için minimum 4, maksimum 16 oyuncu
                if (tournamentFormat === 'round_robin') {
                    if (playerCount < 4 || playerCount > 16) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: `Invalid tournament size for round robin. Must be between 4-16 players. Current: ${playerCount}`
                        }));
                        return;
                    }
                }

                // Check if lobby is ready to start
                if (tournamentLobby.status !== 'ready_to_start') {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Lobby is not ready to start tournament'
                    }));
                    return;
                }

                // Create tournament data (matching Tournament type)
                const tournament = {
                    id: `tournament_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    lobbyId: tournamentLobbyCode,
                    format: tournamentLobby.settings.tournamentFormat,
                    totalRounds: tournamentLobby.settings.roundCount, // Use totalRounds to match type
                    players: tournamentLobby.participants.map(p => ({ // Use players to match type
                        ...p,
                        status: 'ready',
                        isEliminated: false,
                        wins: 0,
                        losses: 0,
                        score: 0
                    })),
                    bracket: [],
                    currentRound: 0,
                    status: 'starting',
                    createdAt: new Date(),
                    settings: tournamentLobby.settings
                };

                // Update lobby status
                tournamentLobby.status = 'tournament_in_progress';
                tournamentLobby.tournament = tournament;

                console.log(`[WS INFO] Tournament started`, {
                    tournamentId: tournament.id,
                    lobbyCode: tournamentLobbyCode,
                    participantCount: tournament.players.length,
                    format: tournament.format
                });

                // Generate bracket based on tournament format
                const bracketRounds = this.generateTournamentBracket(tournament);
                tournament.bracket = {
                    rounds: bracketRounds,
                    eliminatedPlayers: [],
                    activeMatches: new Map(),
                    nextMatchPairings: []
                };

                // Start first round matches
                const firstRoundMatches = this.startTournamentRound(tournament, 0);

                // Broadcast tournament start to all participants
                this.broadcastToLobby(tournamentLobbyCode, {
                    type: 'TOURNAMENT_STARTED',
                    tournament: tournament,
                    matches: firstRoundMatches,
                    message: 'Turnuva başladı! İlk maçlar başlıyor!'
                });

                // Confirm to host
                ws.send(JSON.stringify({
                    type: 'TOURNAMENT_STARTED',
                    tournament: tournament,
                    matches: firstRoundMatches,
                    message: 'Tournament started successfully'
                }));
                break;

            default:
                if (this.logger) {
                    this.logger.warn('Unknown message type', { type: data.type });
                }
        }
    }

    createServerSession(userId, clientId) {
        return {
            userId: userId,
            clientId: clientId,
            connectionStatus: 'connected',
            lastSeen: new Date(),
            gameState: null,
            currentMatch: null,
            preferences: {
                gameMode: 'multi',
                maxWaitTime: 300000,
                trustScoreTolerance: 15,
                skillLevelTolerance: 200
            }
        };
    }

    updateSessionActivity(clientId) {
        const session = this.serverSessions.get(clientId);
        if (session) {
            session.lastSeen = new Date();
        }
    }

    removeFromQueue(playerId) {
        const index = this.matchmakingQueue.findIndex(entry => entry.playerId === playerId);
        if (index !== -1) {
            this.matchmakingQueue.splice(index, 1);
            if (this.logger) {
                this.logger.debug('Player removed from queue', { playerId });
            }
        }
    }

    createGuestSession(sessionToken, displayName) {
        const session = {
            sessionToken: sessionToken,
            displayName: displayName || `Misafir ${Date.now().toString().slice(-4)}`,
            createdAt: new Date(),
            lastActivity: new Date(),
            connectionCount: 0,
            maxConnections: 5, // Limit guest connections
            rateLimitTokens: 10, // Rate limiting
            lastRateLimitReset: new Date(),
            isGuest: true
        };

        this.guestSessions.set(sessionToken, session);

        if (this.logger) {
            this.logger.debug('Created guest session', {
                sessionToken: sessionToken,
                displayName: session.displayName
            });
        }

        return session;
    }

    validateGuestSession(sessionToken) {
        const session = this.guestSessions.get(sessionToken);
        if (!session) return null;

        // Check session age (max 24 hours)
        const maxAge = 24 * 60 * 60 * 1000;
        if (Date.now() - session.createdAt.getTime() > maxAge) {
            this.guestSessions.delete(sessionToken);
            return null;
        }

        // Check connection limit
        if (session.connectionCount >= session.maxConnections) {
            if (this.logger) {
                this.logger.warn('Guest session connection limit exceeded', { sessionToken });
            }
            return null;
        }

        // Rate limiting check
        const now = new Date();
        if (now.getTime() - session.lastRateLimitReset.getTime() > 60000) { // Reset every minute
            session.rateLimitTokens = 10;
            session.lastRateLimitReset = now;
        }

        if (session.rateLimitTokens <= 0) {
            if (this.logger) {
                this.logger.warn('Guest session rate limit exceeded', { sessionToken });
            }
            return null;
        }

        // Update activity
        session.lastActivity = now;
        session.connectionCount++;
        session.rateLimitTokens--;

        return session;
    }

    cleanupGuestSessions() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const inactiveThreshold = 2 * 60 * 60 * 1000; // 2 hours

        let cleanedCount = 0;
        for (const [sessionToken, session] of this.guestSessions.entries()) {
            const age = now - session.createdAt.getTime();
            const inactiveTime = now - session.lastActivity.getTime();

            if (age > maxAge || inactiveTime > inactiveThreshold) {
                this.guestSessions.delete(sessionToken);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0 && this.logger) {
            this.logger.info('Cleaned up guest sessions', {
                cleanedCount: cleanedCount,
                remainingCount: this.guestSessions.size
            });
        }
    }

    broadcastToClient(clientId, message) {
        console.log(`📤 Broadcasting to client: ${clientId} message type: ${message.type}`);
        
        // First try direct client ID lookup
        let client = this.connectedClients.get(clientId);
        
        // If not found, try to find by user ID in serverSessions
        if (!client || client.readyState !== WebSocket.OPEN) {
            // Search through serverSessions to find active client for this user
            for (const [sessionClientId, session] of this.serverSessions.entries()) {
                if (session.userId && session.userId.toString() === clientId.toString()) {
                    const sessionClient = this.connectedClients.get(sessionClientId);
                    if (sessionClient && sessionClient.readyState === WebSocket.OPEN) {
                        console.log(`🔄 Found active client via user ID mapping: ${clientId} → ${sessionClientId}`);
                        client = sessionClient;
                        break;
                    }
                }
            }
        }
        
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
            console.log(`✅ Message sent to client: ${clientId}`);
        } else {
            console.log(`❌ Cannot broadcast to client: ${clientId} client not found or not connected`);
        }
    }

    broadcastToLobby(lobbyCode, message) {
        console.log(`📤 Broadcasting to lobby: ${lobbyCode} message type: ${message.type}`);
        const lobby = this.partyLobbies?.get(lobbyCode);
        if (!lobby) {
            console.log(`❌ Lobby not found: ${lobbyCode}`);
            return;
        }

        console.log(`👥 Lobby participants: ${lobby.participants.length}`);
        lobby.participants.forEach((player, index) => {
            console.log(`📤 Sending to participant: ${player.id} ${player.name}`);
            this.broadcastToClient(player.id, message);
        });
    }

    async startTournament(lobbyId, hostId) {
        console.log('🏆 Starting tournament for lobby:', lobbyId, 'by host:', hostId);

        // Find lobby by ID (lobbyId is actually the lobby code)
        const lobby = this.partyLobbies?.get(lobbyId);
        if (!lobby) {
            throw new Error('Lobby not found');
        }

        // Verify host permissions
        if (lobby.hostPlayerId !== hostId) {
            throw new Error('Only host can start tournament');
        }

        // Check minimum players
        if (lobby.participants.length < 2) {
            throw new Error('At least 2 players required');
        }

        // Debug participants before creating tournament
        console.log('🏆 Lobby participants:', lobby.participants.map(p => ({ id: p.id, name: p.name, hasId: !!p.id })));

        // Create tournament
        const tournament = {
            id: `tournament_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            lobbyId: lobbyId,
            format: lobby.settings.tournamentFormat || 'single_elimination',
            players: lobby.participants.map(p => {
                if (!p.id) {
                    console.error('🏆 ❌ Participant missing ID:', p);
                    throw new Error(`Participant ${p.name} is missing ID`);
                }
                return {
                    id: p.id,
                    name: p.name,
                    isHost: p.id === lobby.hostPlayerId,
                    isEliminated: false,
                    currentRank: 0,
                    statistics: {
                        matchesPlayed: 0,
                        matchesWon: 0,
                        matchesLost: 0,
                        totalPoints: 0,
                        cooperationRate: 0,
                        betrayalRate: 0,
                        averageMatchScore: 0,
                        tournamentPoints: 0
                    },
                    status: 'waiting',
                    joinedAt: new Date()
                };
            }),
            currentRound: 1,
            totalRounds: this.calculateTotalRounds(lobby.participants.length, lobby.settings.tournamentFormat),
            status: 'in_progress',
            startTime: new Date(),
            settings: lobby.settings // Add lobby settings to tournament
        };

        // Generate bracket
        tournament.bracket = this.generateTournamentBracket(tournament);

        // Clean up old tournament matches for these players before starting new tournament
        const playerIds = tournament.players.map(p => p.id);
        const matchesToRemove = [];
        
        for (const [matchId, match] of this.activeMatches.entries()) {
            if (match.isTournamentMatch && 
                (playerIds.includes(match.player1.playerId) || playerIds.includes(match.player2.playerId))) {
                matchesToRemove.push(matchId);
            }
        }
        
        matchesToRemove.forEach(matchId => {
            console.log('🧹 Cleaning up old tournament match:', matchId);
            this.activeMatches.delete(matchId);
        });

        // Store tournament
        if (!this.activeTournaments) {
            this.activeTournaments = new Map();
        }
        this.activeTournaments.set(tournament.id, tournament);

        // Update lobby status
        lobby.status = 'tournament_in_progress';
        lobby.tournamentId = tournament.id;

        console.log('🏆 Tournament created:', {
            id: tournament.id,
            players: tournament.players.length,
            format: tournament.format,
            rounds: tournament.bracket.rounds?.length || 0
        });

        // IMPORTANT: Broadcast TOURNAMENT_STARTED BEFORE starting matches
        // This ensures clients transition to tournament phase before receiving TOURNAMENT_MATCH_READY
        console.log('📤 Broadcasting TOURNAMENT_STARTED to lobby:', lobbyId);
        this.broadcastToLobby(lobbyId, {
            type: 'TOURNAMENT_STARTED',
            tournament: tournament,
            matches: tournament.bracket?.rounds?.[0]?.matches || [],
            message: 'Tournament started successfully'
        });

        // Small delay to ensure TOURNAMENT_STARTED is processed first
        await new Promise(resolve => setTimeout(resolve, 100));

        // Start first round
        if (tournament.bracket.rounds.length > 0) {
            console.log('🏆 Starting first round of tournament');
            this.startTournamentRound(tournament, 0);
        }

        return tournament;
    }

    generateLobbyCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Ensure uniqueness
        if (this.partyLobbies?.has(result)) {
            return this.generateLobbyCode();
        }

        return result;
    }

    createPartyLobby(hostPlayerId, hostPlayerName, settings) {
        const lobbyCode = this.generateLobbyCode();
        const lobby = {
            id: lobbyCode,
            code: lobbyCode,
            hostPlayerId: hostPlayerId,
            participants: [{
                id: hostPlayerId,
                name: hostPlayerName,
                isHost: true,
                joinedAt: new Date()
            }],
            settings: {
                maxPlayers: settings.maxPlayers || 8,
                roundCount: settings.roundCount || 10,
                tournamentFormat: settings.tournamentFormat || 'single_elimination',
                allowSpectators: settings.allowSpectators !== false,
                chatEnabled: settings.chatEnabled !== false,
                autoStartWhenFull: settings.autoStartWhenFull || false
            },
            status: 'waiting_for_players',
            createdAt: new Date(),
            maxPlayers: settings.maxPlayers || 8,
            currentPlayerCount: 1
        };

        this.partyLobbies.set(lobbyCode, lobby);
        console.log('🎮 Party lobby created:', lobbyCode);
        return lobby;
    }

    joinPartyLobby(playerId, playerName, lobbyCode) {
        const lobby = this.partyLobbies.get(lobbyCode);
        if (!lobby) {
            throw new Error('Lobby not found');
        }

        if (lobby.participants.length >= lobby.maxPlayers) {
            throw new Error('Lobby is full');
        }

        // Check if player is already in this lobby
        if (lobby.participants.find(p => p.id === playerId)) {
            throw new Error('Already in lobby');
        }

        // Auto-leave from any other lobby before joining new one
        for (const [otherLobbyCode, otherLobby] of this.partyLobbies.entries()) {
            if (otherLobbyCode !== lobbyCode) {
                const playerIndex = otherLobby.participants.findIndex(p => p.id === playerId);
                if (playerIndex !== -1) {
                    console.log('🎮 Auto-leaving player from previous lobby:', playerName, 'from', otherLobbyCode);
                    otherLobby.participants.splice(playerIndex, 1);
                    otherLobby.currentPlayerCount = otherLobby.participants.length;
                    
                    // Broadcast update to old lobby
                    this.broadcastToLobby(otherLobbyCode, {
                        type: 'LOBBY_UPDATED',
                        lobby: otherLobby
                    });
                    
                    // If old lobby is empty, delete it
                    if (otherLobby.participants.length === 0) {
                        console.log('🎮 Deleting empty lobby:', otherLobbyCode);
                        this.partyLobbies.delete(otherLobbyCode);
                    }
                }
            }
        }

        lobby.participants.push({
            id: playerId,
            name: playerName,
            isHost: false,
            joinedAt: new Date()
        });

        lobby.currentPlayerCount = lobby.participants.length;
        
        // Update lobby status based on player count
        console.log('🎮 Updating lobby status - Player count:', lobby.currentPlayerCount);
        if (lobby.currentPlayerCount >= 4) {
            lobby.status = 'ready_to_start';
            console.log('🎮 ✅ Lobby status set to READY_TO_START');
        } else {
            lobby.status = 'waiting_for_players';
            console.log('🎮 ⏳ Lobby status set to WAITING_FOR_PLAYERS');
        }
        
        console.log('🎮 Player joined lobby:', playerName, 'to', lobbyCode, 'Status:', lobby.status, 'Players:', lobby.currentPlayerCount);
        return lobby;
    }

    leavePartyLobby(playerId, lobbyCode) {
        const lobby = this.partyLobbies.get(lobbyCode);
        if (!lobby) {
            return null;
        }

        const playerIndex = lobby.participants.findIndex(p => p.id === playerId);
        if (playerIndex === -1) {
            return lobby;
        }

        const leavingPlayer = lobby.participants[playerIndex];
        lobby.participants.splice(playerIndex, 1);
        lobby.currentPlayerCount = lobby.participants.length;
        
        // Update lobby status based on player count
        if (lobby.currentPlayerCount >= 4) {
            lobby.status = 'ready_to_start';
        } else {
            lobby.status = 'waiting_for_players';
        }

        // If host left, transfer to next player or close lobby
        if (leavingPlayer.isHost && lobby.participants.length > 0) {
            lobby.participants[0].isHost = true;
            lobby.hostPlayerId = lobby.participants[0].id;
        } else if (lobby.participants.length === 0) {
            this.partyLobbies.delete(lobbyCode);
            return null;
        }

        console.log('🎮 Player left lobby:', leavingPlayer.name, 'from', lobbyCode);
        return lobby;
    }

    calculateTotalRounds(playerCount, format) {
        if (format === 'single_elimination') {
            return Math.ceil(Math.log2(playerCount));
        } else if (format === 'double_elimination') {
            // Winners bracket rounds + losers bracket rounds
            const winnerRounds = Math.ceil(Math.log2(playerCount));
            return winnerRounds + (winnerRounds - 1) + 1; // +1 for grand finals
        } else if (format === 'round_robin') {
            // Each player plays every other player once
            return playerCount - 1;
        }
        return Math.ceil(Math.log2(playerCount));
    }

    generateTournamentBracket(tournament) {
        const players = [...tournament.players];
        const bracket = {
            rounds: [],
            eliminatedPlayers: [],
            activeMatches: new Map(),
            nextMatchPairings: []
        };

        console.log('🏆 Generating tournament bracket:', {
            format: tournament.format,
            playerCount: players.length
        });

        switch (tournament.format) {
            case 'single_elimination':
                this.generateSingleEliminationBracket(tournament, players, bracket);
                break;

            case 'double_elimination':
                this.generateDoubleEliminationBracket(tournament, players, bracket);
                break;

            case 'round_robin':
                this.generateRoundRobinBracket(tournament, players, bracket);
                break;

            default:
                console.error('❌ Unknown tournament format:', tournament.format);
                this.generateSingleEliminationBracket(tournament, players, bracket);
        }

        return bracket;
    }

    generateSingleEliminationBracket(tournament, players, bracket) {
        let currentRound = 0;
        let currentPlayers = [...players];

        // Shuffle players randomly for fair matchmaking
        for (let i = currentPlayers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [currentPlayers[i], currentPlayers[j]] = [currentPlayers[j], currentPlayers[i]];
        }

        // Handle bye if odd number of players
        let byePlayer = null;
        if (currentPlayers.length % 2 !== 0) {
            byePlayer = currentPlayers.pop();
            console.log('🏆 Bye assigned to:', byePlayer.name);
        }

        // Generate first round matches
        const roundMatches = [];
        console.log('🏆 Creating matches for shuffled players:', currentPlayers.map(p => ({ id: p?.id, name: p?.name })));
        
        for (let i = 0; i < currentPlayers.length; i += 2) {
            if (i + 1 < currentPlayers.length && currentPlayers[i] && currentPlayers[i + 1]) {
                const match = {
                    id: `match_${tournament.id}_${currentRound}_${i / 2}`,
                    tournamentId: tournament.id,
                    roundNumber: currentRound,
                    player1Id: currentPlayers[i].id,
                    player2Id: currentPlayers[i + 1].id,
                    status: 'scheduled',
                    result: null,
                    startTime: null,
                    endTime: null
                };
                roundMatches.push(match);
                console.log('🏆 Created match:', match.id, currentPlayers[i].name, 'vs', currentPlayers[i + 1].name);
            }
        }

        bracket.rounds.push({
            roundNumber: currentRound,
            matches: roundMatches,
            status: 'not_started',
            startTime: new Date()
        });

        // Store bye player for next round if exists
        if (byePlayer) {
            bracket.byePlayer = byePlayer;
        }
    }

    generateDoubleEliminationBracket(tournament, players, bracket) {
        // For double elimination, we need both winners and losers brackets
        // Start with winners bracket (same as single elimination)
        this.generateSingleEliminationBracket(tournament, players, bracket);
        
        // Initialize losers bracket tracking
        bracket.losersBracket = {
            rounds: [],
            currentRound: 0
        };
        
        console.log('🏆 Double elimination bracket initialized with winners bracket');
    }

    generateRoundRobinBracket(tournament, players, bracket) {
        // In round robin, every player plays every other player
        // Using the Circle Method algorithm for optimal scheduling
        
        const totalPlayers = players.length;
        const isOdd = totalPlayers % 2 !== 0;
        
        // If odd number of players, add a dummy "bye" player
        let playerList = [...players];
        if (isOdd) {
            playerList.push({ id: 'BYE', name: 'BYE', isBye: true });
        }
        
        const n = playerList.length;
        const totalRounds = n - 1;
        const matchesPerRound = n / 2;
        
        console.log('🏆 Round robin setup:', {
            totalPlayers: totalPlayers,
            totalRounds: totalRounds,
            matchesPerRound: matchesPerRound,
            isOdd: isOdd
        });
        
        // Generate rounds using circle method
        for (let round = 0; round < totalRounds; round++) {
            const roundMatches = [];
            
            for (let match = 0; match < matchesPerRound; match++) {
                let home, away;
                
                if (match === 0) {
                    // First player stays fixed
                    home = 0;
                    away = round + 1;
                } else {
                    // Calculate positions using circle method
                    home = (round + match) % (n - 1) + 1;
                    away = (round + n - match) % (n - 1) + 1;
                }
                
                const player1 = playerList[home];
                const player2 = playerList[away];
                
                // Skip matches with BYE player
                if (player1.isBye || player2.isBye) {
                    continue;
                }
                
                const matchObj = {
                    id: `match_${tournament.id}_${round}_${roundMatches.length}`,
                    tournamentId: tournament.id,
                    roundNumber: round,
                    player1Id: player1.id,
                    player2Id: player2.id,
                    status: 'scheduled',
                    result: null,
                    startTime: null,
                    endTime: null
                };
                
                roundMatches.push(matchObj);
            }
            
            if (roundMatches.length > 0) {
                bracket.rounds.push({
                    roundNumber: round,
                    matches: roundMatches,
                    status: 'not_started',
                    startTime: new Date()
                });
                
                console.log(`🏆 Round robin round ${round + 1}: ${roundMatches.length} matches`);
            }
        }
        
        console.log('🏆 Round robin bracket generated:', bracket.rounds.length, 'rounds');
    }

    startTournamentRound(tournament, roundNumber) {
        const roundMatches = tournament.bracket.rounds[roundNumber]?.matches || [];
        const activeMatches = [];

        for (const match of roundMatches) {
            if (match.status === 'scheduled' || match.status === 'pending') {
                // Create active match similar to regular multiplayer
                const matchId = `tournament_${tournament.id}_${match.id}`;
                const activeMatch = {
                    id: matchId,
                    tournamentId: tournament.id,
                    tournamentMatch: match,
                    isTournamentMatch: true, // Mark as tournament match
                    player1: {
                        playerId: match.player1Id,
                        player: tournament.players.find(p => p.id === match.player1Id),
                        ready: false
                    },
                    player2: {
                        playerId: match.player2Id,
                        player: tournament.players.find(p => p.id === match.player2Id),
                        ready: false
                    },
                    timestamp: Date.now(),
                    currentRound: 0,
                    maxRounds: tournament.settings?.roundCount || 10, // Match rounds from lobby settings
                    decisions: new Map(),
                    scores: { player1: 0, player2: 0 },
                    gameState: 'WAITING_FOR_PLAYERS',
                    rematchRequests: new Set(),
                    roundTimeout: null
                };

                this.activeMatches.set(matchId, activeMatch);
                activeMatches.push(activeMatch);

                // Find players directly from tournament players array
                const player1 = tournament.players.find(p => p.id === match.player1Id);
                const player2 = tournament.players.find(p => p.id === match.player2Id);
                
                // Debug opponent assignment
                console.log('🔍 Opponent Debug:', {
                    matchId: matchId,
                    player1Id: match.player1Id,
                    player2Id: match.player2Id,
                    player1Found: player1,
                    player2Found: player2,
                    player1Name: player1?.name,
                    player2Name: player2?.name,
                    tournamentPlayers: tournament.players.map(p => ({ id: p.id, name: p.name }))
                });
                
                // Send opponent info to each player
                // Find current client IDs for these players (they may have reconnected with new session tokens)
                let player1ClientId = match.player1Id;
                let player2ClientId = match.player2Id;
                
                // Check if we need to find updated client IDs from active connections
                if (!this.connectedClients.has(player1ClientId)) {
                    // Player1 might have reconnected, find their current client ID
                    for (const [clientId, session] of this.serverSessions.entries()) {
                        if (session.userId && this.connectedClients.has(clientId)) {
                            // Check if this user matches player1 by checking tournament players
                            const player1Data = tournament.players.find(p => p.id === match.player1Id);
                            if (player1Data && player1Data.id === match.player1Id) {
                                // This is a workaround - we'll use the lobby to broadcast
                                break;
                            }
                        }
                    }
                }
                
                // Send match ready message only to the two players in this match
                const matchReadyMessage = {
                    type: 'TOURNAMENT_MATCH_READY',
                    matchId: matchId,
                    player1Id: match.player1Id,
                    player2Id: match.player2Id,
                    player1: player1,
                    player2: player2,
                    round: roundNumber + 1,
                    maxRounds: activeMatch.maxRounds,
                    message: 'Turnuva maçınız başlıyor!'
                };
                
                // Send to player1
                this.broadcastToClient(match.player1Id, matchReadyMessage);
                // Send to player2
                this.broadcastToClient(match.player2Id, matchReadyMessage);

                // Update match status
                match.status = 'in_progress';
                                
                // Start the match immediately for tournament matches
                activeMatch.gameState = 'WAITING_FOR_DECISIONS';
                
                // Initialize first round decisions
                const initialRoundDecisions = {};
                activeMatch.decisions.set(0, initialRoundDecisions);
                
                // Set round timeout for tournament matches
                activeMatch.roundTimeout = setTimeout(() => {
                    const timeoutMatch = this.activeMatches.get(matchId);
                    if (!timeoutMatch || timeoutMatch.roundTimeout === null) return;

                    const timeoutRoundDecisions = timeoutMatch.decisions.get(0) || {};

                    if (!timeoutRoundDecisions.player1Decision) {
                        timeoutRoundDecisions.player1Decision = 'COOPERATE';
                    }
                    if (!timeoutRoundDecisions.player2Decision) {
                        timeoutRoundDecisions.player2Decision = 'COOPERATE';
                    }

                    timeoutMatch.decisions.set(0, timeoutRoundDecisions);
                    timeoutMatch.roundTimeout = null;

                    this.processRoundResult(timeoutMatch, matchId);
                }, 30000);

                console.log('🏆 Tournament match started:', {
                    matchId: matchId,
                    gameState: activeMatch.gameState,
                    player1: player1?.name,
                    player2: player2?.name
                });
            }
        }

        return activeMatches;
    }

    processTournamentMatchResultWithMatch(match, matchId, winnerId) {
        if (!match || !match.tournamentId) {
            console.log('⚠️ Tournament match not found or not tournament match:', matchId);
            return;
        }

        console.log('🏆 Processing tournament match result (with match object):', {
            matchId,
            winnerId,
            scores: match.scores,
            tournamentId: match.tournamentId,
            player1Id: match.player1.playerId,
            player2Id: match.player2.playerId
        });

        // Find tournament
        const tournament = this.activeTournaments.get(match.tournamentId);
        if (!tournament) {
            console.error('❌ Tournament not found:', match.tournamentId);
            return;
        }

        // Check for tie - only start tiebreaker for single elimination tournaments
        if (winnerId === 'tie' && tournament.format === 'single_elimination') {
            console.log('🤝 Single elimination tournament match tied, determining winner randomly');
            // For ties after reversal, determine winner randomly (no more tiebreaker rounds)
            winnerId = Math.random() < 0.5 ? match.player1.playerId : match.player2.playerId;
            console.log('🎲 Random winner selected:', winnerId);
        }

        // Update tournament match result
        const tournamentMatch = match.tournamentMatch;
        if (tournamentMatch) {
            tournamentMatch.status = 'completed';
            tournamentMatch.winner = winnerId;
            tournamentMatch.result = {
                winnerId: winnerId,
                scores: match.scores,
                completedAt: new Date()
            };

            // Update the match in the tournament bracket
            const currentRoundIndex = tournament.currentRound - 1;
            const bracketRoundData = tournament.bracket.rounds[currentRoundIndex];
            if (bracketRoundData) {
                const bracketMatch = bracketRoundData.matches.find(m => m.id === tournamentMatch.id);
                if (bracketMatch) {
                    bracketMatch.status = 'completed';
                    bracketMatch.winner = winnerId;
                    bracketMatch.result = tournamentMatch.result;
                    console.log('🏆 Updated bracket match status:', bracketMatch.id, 'to completed');
                }
            }
        }

        // Calculate cooperation/betrayal rates from match decisions
        let player1Cooperations = 0;
        let player1Betrayals = 0;
        let player2Cooperations = 0;
        let player2Betrayals = 0;
        
        for (const [roundNum, decisions] of match.decisions) {
            if (decisions.player1Decision) {
                if (decisions.player1Decision.toLowerCase() === 'cooperate') {
                    player1Cooperations++;
                } else {
                    player1Betrayals++;
                }
            }
            if (decisions.player2Decision) {
                if (decisions.player2Decision.toLowerCase() === 'cooperate') {
                    player2Cooperations++;
                } else {
                    player2Betrayals++;
                }
            }
        }
        
        // Update player stats in tournament
        const winner = tournament.players.find(p => p.id === winnerId);
        const loser = tournament.players.find(p => p.id !== winnerId &&
            (p.id === match.player1.playerId || p.id === match.player2.playerId));

        if (winner && winnerId !== 'tie') {
            winner.wins = (winner.wins || 0) + 1;
            winner.score = (winner.score || 0) + match.scores[winnerId === match.player1.playerId ? 'player1' : 'player2'];
            
            // Update statistics
            if (!winner.statistics) {
                winner.statistics = {
                    matchesPlayed: 0,
                    matchesWon: 0,
                    matchesLost: 0,
                    totalPoints: 0,
                    cooperationRate: 0,
                    betrayalRate: 0,
                    averageMatchScore: 0,
                    tournamentPoints: 0
                };
            }
            winner.statistics.matchesPlayed++;
            winner.statistics.matchesWon++;
            winner.statistics.totalPoints += match.scores[winnerId === match.player1.playerId ? 'player1' : 'player2'];
            
            // Update cooperation/betrayal rates
            const isPlayer1 = winnerId === match.player1.playerId;
            const cooperations = isPlayer1 ? player1Cooperations : player2Cooperations;
            const betrayals = isPlayer1 ? player1Betrayals : player2Betrayals;
            const totalDecisions = cooperations + betrayals;
            
            if (totalDecisions > 0) {
                const prevCoopRate = winner.statistics.cooperationRate || 0;
                const prevBetrayRate = winner.statistics.betrayalRate || 0;
                const prevMatches = winner.statistics.matchesPlayed - 1;
                
                // Weighted average
                winner.statistics.cooperationRate = (prevCoopRate * prevMatches + (cooperations / totalDecisions)) / winner.statistics.matchesPlayed;
                winner.statistics.betrayalRate = (prevBetrayRate * prevMatches + (betrayals / totalDecisions)) / winner.statistics.matchesPlayed;
            }
            
            console.log('🏆 Winner stats updated:', {
                name: winner.name,
                matchesWon: winner.statistics.matchesWon,
                totalPoints: winner.statistics.totalPoints,
                cooperationRate: Math.round(winner.statistics.cooperationRate * 100) + '%'
            });
        }
        
        if (loser && winnerId !== 'tie') {
            loser.losses = (loser.losses || 0) + 1;
            loser.score = (loser.score || 0) + match.scores[winnerId === match.player1.playerId ? 'player2' : 'player1'];
            
            // Update statistics
            if (!loser.statistics) {
                loser.statistics = {
                    matchesPlayed: 0,
                    matchesWon: 0,
                    matchesLost: 0,
                    totalPoints: 0,
                    cooperationRate: 0,
                    betrayalRate: 0,
                    averageMatchScore: 0,
                    tournamentPoints: 0
                };
            }
            loser.statistics.matchesPlayed++;
            loser.statistics.matchesLost++;
            loser.statistics.totalPoints += match.scores[winnerId === match.player1.playerId ? 'player2' : 'player1'];
            
            // Update cooperation/betrayal rates
            const isPlayer1 = loser.id === match.player1.playerId;
            const cooperations = isPlayer1 ? player1Cooperations : player2Cooperations;
            const betrayals = isPlayer1 ? player1Betrayals : player2Betrayals;
            const totalDecisions = cooperations + betrayals;
            
            if (totalDecisions > 0) {
                const prevCoopRate = loser.statistics.cooperationRate || 0;
                const prevBetrayRate = loser.statistics.betrayalRate || 0;
                const prevMatches = loser.statistics.matchesPlayed - 1;
                
                // Weighted average
                loser.statistics.cooperationRate = (prevCoopRate * prevMatches + (cooperations / totalDecisions)) / loser.statistics.matchesPlayed;
                loser.statistics.betrayalRate = (prevBetrayRate * prevMatches + (betrayals / totalDecisions)) / loser.statistics.matchesPlayed;
            }
            
            console.log('🏆 Loser stats updated:', {
                name: loser.name,
                matchesLost: loser.statistics.matchesLost,
                totalPoints: loser.statistics.totalPoints,
                cooperationRate: Math.round(loser.statistics.cooperationRate * 100) + '%'
            });
        }

        // Remove from active matches
        this.activeMatches.delete(matchId);

        // Check if round is complete and advance tournament
        this.checkTournamentRoundCompletion(tournament);
    }

    processTournamentMatchResult(matchId, winnerId, scores) {
        const match = this.activeMatches.get(matchId);
        if (!match || !match.tournamentId) {
            console.log('⚠️ Tournament match not found or not tournament match:', matchId);
            return;
        }

        console.log('🏆 Processing tournament match result:', {
            matchId,
            winnerId,
            scores,
            player1Id: match.player1.playerId,
            player2Id: match.player2.playerId
        });

        // Convert winner string to actual player ID
        let actualWinnerId = null;
        if (winnerId === 'player1') {
            actualWinnerId = match.player1.playerId;
        } else if (winnerId === 'player2') {
            actualWinnerId = match.player2.playerId;
        } else if (winnerId === 'tie') {
            actualWinnerId = 'tie';
        } else {
            // winnerId might already be the actual player ID
            actualWinnerId = winnerId;
        }

        console.log('🏆 Actual winner ID:', actualWinnerId);

        // Find tournament
        const tournament = this.activeTournaments.get(match.tournamentId);
        if (!tournament) {
            console.error('❌ Tournament not found:', match.tournamentId);
            return;
        }
        
        const lobbyCode = tournament.lobbyId;

        // Check for tie - only start tiebreaker for single elimination tournaments
        if (scores.player1 === scores.player2 && tournament.format === 'single_elimination') {
            console.log('🤝 Single elimination tournament match tied, starting tiebreaker:', matchId);
            
            // Check if this is already a tiebreaker
            if (match.isTiebreaker) {
                console.log('⚠️ Tiebreaker also tied, determining winner by random');
                // If tiebreaker is also tied, determine winner randomly
                actualWinnerId = Math.random() < 0.5 ? match.player1.playerId : match.player2.playerId;
            } else {
                // Start tiebreaker match
                match.isTiebreaker = true;
                match.tiebreakerRounds = 3;
                match.currentRound = 0;
                match.scores = { player1: 0, player2: 0 };
                match.decisions = new Map();
                
                // Notify players about tiebreaker
                this.broadcastToClient(match.player1.playerId, {
                    type: 'TOURNAMENT_TIEBREAKER_START',
                    message: 'Berabere! 3 turlu rövanş başlıyor!',
                    rounds: 3
                });
                
                this.broadcastToClient(match.player2.playerId, {
                    type: 'TOURNAMENT_TIEBREAKER_START',
                    message: 'Berabere! 3 turlu rövanş başlıyor!',
                    rounds: 3
                });
                
                // Don't complete the match yet, continue with tiebreaker
                return;
            }
        } else if (scores.player1 === scores.player2) {
            // For other tournament formats (double elimination, round robin), ties are allowed
            console.log('🤝 Tournament match tied (no tiebreaker for this format):', tournament.format);
            actualWinnerId = 'tie'; // Keep as tie
        }

        // Update tournament match result
        const tournamentMatch = match.tournamentMatch;
        tournamentMatch.status = 'completed';
        tournamentMatch.winner = actualWinnerId;
        tournamentMatch.result = {
            winnerId: actualWinnerId,
            scores: scores,
            completedAt: new Date()
        };

        // CRITICAL: Also update the match in the tournament bracket
        const currentRoundIndex = tournament.currentRound - 1;
        console.log('🏆 Looking for bracket round:', { currentRound: tournament.currentRound, currentRoundIndex, totalRounds: tournament.bracket.rounds.length });
        
        const bracketRoundData = tournament.bracket.rounds[currentRoundIndex];
        if (bracketRoundData) {
            console.log('🏆 Found bracket round data:', { roundNumber: bracketRoundData.roundNumber, matchCount: bracketRoundData.matches.length });
            const bracketMatch = bracketRoundData.matches.find(m => m.id === tournamentMatch.id);
            if (bracketMatch) {
                bracketMatch.status = 'completed';
                bracketMatch.winner = actualWinnerId;
                bracketMatch.result = tournamentMatch.result;
                console.log('🏆 Updated bracket match status:', bracketMatch.id, 'to completed');
            } else {
                console.error('❌ Bracket match not found:', tournamentMatch.id);
                console.log('Available matches:', bracketRoundData.matches.map(m => m.id));
            }
        } else {
            console.error('❌ Bracket round data not found for index:', currentRoundIndex);
            console.log('Available rounds:', tournament.bracket.rounds.map((r, i) => ({ index: i, roundNumber: r.roundNumber })));
        }

        // Update player stats in tournament
        const winner = tournament.players.find(p => p.id === actualWinnerId);
        const loser = tournament.players.find(p => p.id !== actualWinnerId &&
            (p.id === match.player1.playerId || p.id === match.player2.playerId));

        if (winner && actualWinnerId !== 'tie') {
            winner.wins = (winner.wins || 0) + 1;
            winner.score = (winner.score || 0) + scores[actualWinnerId === match.player1.playerId ? 'player1' : 'player2'];
            
            // Update statistics
            if (!winner.statistics) {
                winner.statistics = {
                    matchesPlayed: 0,
                    matchesWon: 0,
                    matchesLost: 0,
                    totalPoints: 0,
                    cooperationRate: 0,
                    betrayalRate: 0,
                    averageMatchScore: 0,
                    tournamentPoints: 0
                };
            }
            winner.statistics.matchesPlayed++;
            winner.statistics.matchesWon++;
            winner.statistics.totalPoints += scores[actualWinnerId === match.player1.playerId ? 'player1' : 'player2'];
        }
        
        if (loser && actualWinnerId !== 'tie') {
            loser.losses = (loser.losses || 0) + 1;
            loser.score = (loser.score || 0) + scores[actualWinnerId === match.player1.playerId ? 'player2' : 'player1'];
            
            // Update statistics
            if (!loser.statistics) {
                loser.statistics = {
                    matchesPlayed: 0,
                    matchesWon: 0,
                    matchesLost: 0,
                    totalPoints: 0,
                    cooperationRate: 0,
                    betrayalRate: 0,
                    averageMatchScore: 0,
                    tournamentPoints: 0
                };
            }
            loser.statistics.matchesPlayed++;
            loser.statistics.matchesLost++;
            loser.statistics.totalPoints += scores[actualWinnerId === match.player1.playerId ? 'player2' : 'player1'];
            
            // Handle elimination based on tournament format
            if (tournament.format === 'single_elimination') {
                // In single elimination, loser is immediately eliminated
                loser.isEliminated = true;
                loser.status = 'eliminated';
                
                // Add to eliminated players list if not already there
                if (!tournament.bracket.eliminatedPlayers.find(p => p.id === loser.id)) {
                    tournament.bracket.eliminatedPlayers.push(loser);
                }
                
                console.log('🏆 Player eliminated:', loser.name);
            } else if (tournament.format === 'double_elimination') {
                // In double elimination, check if player has already lost once
                const previousLosses = loser.losses || 0;
                if (previousLosses >= 2) {
                    loser.isEliminated = true;
                    loser.status = 'eliminated';
                    
                    if (!tournament.bracket.eliminatedPlayers.find(p => p.id === loser.id)) {
                        tournament.bracket.eliminatedPlayers.push(loser);
                    }
                    
                    console.log('🏆 Player eliminated (2nd loss):', loser.name);
                } else {
                    // Move to losers bracket
                    console.log('🏆 Player moved to losers bracket:', loser.name);
                }
            }
            // Round robin has no elimination
        }

        console.log('🏆 Tournament state before round check:', {
            currentRound: tournament.currentRound,
            totalRounds: tournament.bracket.rounds.length,
            bracketRounds: tournament.bracket.rounds.map(r => ({
                roundNumber: r.roundNumber,
                matchCount: r.matches.length,
                matchStatuses: r.matches.map(m => ({ id: m.id, status: m.status }))
            }))
        });
        
        console.log('🏆 About to check round completion...');

        // Check if round is complete (reuse the same round data)
        if (!bracketRoundData) {
            console.error('❌ Current round data not found:', tournament.currentRound);
            console.log('Available rounds:', tournament.bracket.rounds.map(r => r.roundNumber));
            return;
        }
        
        const allMatchesComplete = bracketRoundData.matches.every(m => m.status === 'completed');
        console.log('🏆 Round completion check:', {
            roundNumber: tournament.currentRound,
            totalMatches: bracketRoundData.matches.length,
            completedMatches: bracketRoundData.matches.filter(m => m.status === 'completed').length,
            allComplete: allMatchesComplete,
            matchDetails: bracketRoundData.matches.map(m => ({ id: m.id, status: m.status, winner: m.winner }))
        });

        if (allMatchesComplete) {
            console.log('🏆 Round completed, processing winners...');
            
            // Check if this is Round Robin format
            if (tournament.format === 'round_robin') {
                // Check if all rounds are complete
                const allRoundsComplete = tournament.bracket.rounds.every(r => 
                    r.matches.every(m => m.status === 'completed')
                );
                
                console.log('🏆 Round Robin completion check:', {
                    format: tournament.format,
                    currentRound: tournament.currentRound,
                    totalRounds: tournament.bracket.rounds.length,
                    allRoundsComplete: allRoundsComplete,
                    roundsStatus: tournament.bracket.rounds.map(r => ({
                        roundNumber: r.roundNumber,
                        matches: r.matches.map(m => ({ id: m.id, status: m.status }))
                    }))
                });
                
                if (allRoundsComplete) {
                    // Determine winner by highest score
                    const sortedPlayers = [...tournament.players].sort((a, b) => {
                        const scoreA = a.score || 0;
                        const scoreB = b.score || 0;
                        return scoreB - scoreA;
                    });
                    
                    const winner = sortedPlayers[0];
                    tournament.status = 'completed';
                    tournament.winner = winner;
                    
                    console.log('🏆 Round Robin completed! Winner:', winner.name);
                    console.log('🏆 Final standings:', sortedPlayers.map(p => ({ name: p.name, score: p.score || 0 })));
                    
                    this.broadcastToLobby(lobbyCode, {
                        type: 'TOURNAMENT_COMPLETED',
                        tournament: tournament,
                        winner: winner,
                        standings: sortedPlayers.map(p => ({
                            player: p,
                            score: p.score || 0,
                            wins: p.wins || 0,
                            losses: p.losses || 0
                        })),
                        message: `🏆 Turnuva tamamlandı! Kazanan: ${winner.name}`
                    });
                    return;
                } else {
                    // Start next round
                    tournament.currentRound++;
                    
                    if (tournament.currentRound < tournament.bracket.rounds.length) {
                        console.log('🏆 Starting Round Robin round', tournament.currentRound + 1);
                        
                        const activeMatches = this.startTournamentRound(tournament, tournament.currentRound);
                        
                        this.broadcastToLobby(lobbyCode, {
                            type: 'TOURNAMENT_ROUND_STARTED',
                            tournament: tournament,
                            round: tournament.currentRound + 1,
                            matches: activeMatches,
                            message: `🎯 ${tournament.currentRound + 1}. tur başlıyor!`
                        });
                    }
                    return;
                }
            }
            
            // Advance winners to next round (for elimination formats)
            const winners = bracketRoundData.matches.map(m => {
                const winnerId = m.winner;
                const winner = tournament.players.find(p => p.id === winnerId);
                console.log('🏆 Match winner lookup:', { matchId: m.id, winnerId, foundPlayer: winner?.name });
                return winner;
            }).filter(Boolean);

            console.log('🏆 Round winners:', winners.map(w => w.name));
            console.log('🏆 Winners count:', winners.length);

            if (winners.length === 1) {
                // Tournament complete!
                tournament.status = 'completed';
                tournament.winner = winners[0];
                console.log('🏆 Tournament completed! Winner:', winners[0].name);

                this.broadcastToLobby(lobbyCode, {
                    type: 'TOURNAMENT_COMPLETED',
                    tournament: tournament,
                    winner: winners[0],
                    message: `🏆 Turnuva tamamlandı! Kazanan: ${winners[0].name}`
                });
            } else if (winners.length > 1) {
                // Start next round
                console.log('🏆 Starting next round with', winners.length, 'players');
                
                // Increment current round
                tournament.currentRound++;
                
                // Add bye player from previous round if exists
                let playersForNextRound = [...winners];
                if (tournament.bracket.byePlayer) {
                    playersForNextRound.push(tournament.bracket.byePlayer);
                    console.log('🏆 Adding bye player to next round:', tournament.bracket.byePlayer.name);
                    tournament.bracket.byePlayer = null; // Clear bye player
                }
                
                // Handle bye for odd number of players
                let newByePlayer = null;
                if (playersForNextRound.length % 2 !== 0) {
                    newByePlayer = playersForNextRound.pop();
                    tournament.bracket.byePlayer = newByePlayer;
                    console.log('🏆 New bye player for next round:', newByePlayer.name);
                }
                
                // Create next round matches
                const nextRoundMatches = [];
                for (let i = 0; i < playersForNextRound.length; i += 2) {
                    if (i + 1 < playersForNextRound.length) {
                        const matchId = `match_${tournament.id}_${tournament.currentRound}_${Math.floor(i / 2)}`;
                        const match = {
                            id: matchId,
                            tournamentId: tournament.id,
                            roundNumber: tournament.currentRound - 1, // 0-based for bracket
                            player1Id: playersForNextRound[i].id,
                            player2Id: playersForNextRound[i + 1].id,
                            status: 'scheduled',
                            result: null,
                            startTime: null,
                            endTime: null
                        };
                        nextRoundMatches.push(match);
                        console.log('🏆 Next round match:', playersForNextRound[i].name, 'vs', playersForNextRound[i + 1].name);
                    }
                }
                
                // Add next round to bracket
                tournament.bracket.rounds.push({
                    roundNumber: tournament.currentRound - 1,
                    matches: nextRoundMatches,
                    status: 'not_started',
                    startTime: new Date()
                });
                
                console.log('🏆 Starting next round matches...');
                
                // Start the matches
                const activeMatches = this.startTournamentRound(tournament, tournament.currentRound - 1);
                
                console.log('🏆 Next round active matches created:', activeMatches.length);

                this.broadcastToLobby(lobbyCode, {
                    type: 'TOURNAMENT_ROUND_STARTED',
                    tournament: tournament,
                    round: tournament.currentRound,
                    matches: activeMatches,
                    message: `🎯 ${tournament.currentRound}. tur başlıyor!`
                });
            }
        }

        // Broadcast match result BEFORE cleanup
        this.broadcastToLobby(lobbyCode, {
            type: 'TOURNAMENT_MATCH_COMPLETED',
            matchId: matchId,
            winner: winner,
            loser: loser,
            scores: scores,
            tournament: tournament
        });

        // Clean up completed match AFTER broadcasting
        this.activeMatches.delete(matchId);
        console.log('🏆 Cleaned up active match:', matchId);
    }

    handleDisconnection(clientId) {
        if (this.logger) {
            this.logger.debug('WebSocket client disconnected', { clientId });
        }

        this.connectedClients.delete(clientId);
        this.removeFromQueue(clientId);

        const session = this.serverSessions.get(clientId);
        if (session) {
            session.connectionStatus = 'disconnected';
            session.lastSeen = new Date();
        }

        // Handle active matches
        for (const [matchId, match] of this.activeMatches.entries()) {
            if (match.player1.playerId === clientId || match.player2.playerId === clientId) {
                const opponentId = match.player1.playerId === clientId ?
                    match.player2.playerId : match.player1.playerId;

                // For tournament matches, don't delete immediately - allow reconnection
                if (match.isTournamentMatch) {
                    console.log(`[WS INFO] Tournament match player disconnected, allowing reconnection`, {
                        matchId: matchId,
                        disconnectedPlayer: clientId,
                        tournamentId: match.tournamentId
                    });

                    // Mark player as disconnected but keep match active
                    if (match.player1.playerId === clientId) {
                        match.player1.disconnected = true;
                    } else {
                        match.player2.disconnected = true;
                    }

                    // Notify opponent about disconnection
                    this.broadcastToClient(opponentId, {
                        type: 'TOURNAMENT_OPPONENT_DISCONNECTED',
                        matchId: matchId,
                        message: 'Rakibiniz bağlantısı kesildi. Yeniden bağlanması bekleniyor...'
                    });

                    // Set timeout for reconnection (5 minutes)
                    setTimeout(() => {
                        const currentMatch = this.activeMatches.get(matchId);
                        if (currentMatch &&
                            ((currentMatch.player1.playerId === clientId && currentMatch.player1.disconnected) ||
                                (currentMatch.player2.playerId === clientId && currentMatch.player2.disconnected))) {

                            // Player didn't reconnect, end match
                            console.log(`[WS INFO] Tournament match ended due to prolonged disconnection`, {
                                matchId: matchId,
                                disconnectedPlayer: clientId
                            });

                            // Declare opponent as winner
                            this.processTournamentMatchResult(matchId, opponentId, {
                                [match.player1.playerId === opponentId ? 'player1' : 'player2']: match.maxRounds,
                                [match.player1.playerId === clientId ? 'player1' : 'player2']: 0
                            });
                        }
                    }, 5 * 60 * 1000); // 5 minutes

                } else {
                    // Regular match - mark as disconnected and wait briefly for reconnection
                    console.log(`[WS INFO] Regular match player disconnected, waiting for reconnection`, {
                        matchId: matchId,
                        disconnectedPlayer: clientId
                    });

                    // Mark player as disconnected
                    if (match.player1.playerId === clientId) {
                        match.player1.disconnected = true;
                    } else {
                        match.player2.disconnected = true;
                    }

                    // Notify opponent about disconnection
                    this.broadcastToClient(opponentId, {
                        type: 'OPPONENT_DISCONNECTED',
                        matchId: matchId,
                        message: 'Rakibiniz bağlantısı kesildi. Yeniden bağlanması bekleniyor...'
                    });

                    // Set timeout for reconnection (30 seconds for regular matches)
                    setTimeout(() => {
                        const currentMatch = this.activeMatches.get(matchId);
                        if (currentMatch &&
                            ((currentMatch.player1.playerId === clientId && currentMatch.player1.disconnected) ||
                                (currentMatch.player2.playerId === clientId && currentMatch.player2.disconnected))) {

                            // Player didn't reconnect, calculate forfeit
                            console.log(`[WS INFO] Regular match ended due to disconnection`, {
                                matchId: matchId,
                                disconnectedPlayer: clientId
                            });

                            // Calculate forfeit scores (similar to tournament)
                            const currentRound = currentMatch.currentRound || 0;
                            const maxRounds = currentMatch.maxRounds || 10;
                            const remainingRounds = Math.max(0, maxRounds - currentRound);
                            
                            // Give winner 3 points for each remaining round
                            const forfeitBonus = remainingRounds * 3;
                            const currentScores = currentMatch.scores || { player1: 0, player2: 0 };
                            
                            // Determine winner (opponent of disconnected player)
                            const winnerId = opponentId;
                            const isPlayer1Winner = currentMatch.player1.playerId === winnerId;
                            
                            const finalScores = {
                                player1: isPlayer1Winner ? currentScores.player1 + forfeitBonus : currentScores.player1,
                                player2: isPlayer1Winner ? currentScores.player2 : currentScores.player2 + forfeitBonus
                            };

                            console.log(`[WS INFO] Forfeit scoring:`, {
                                currentRound,
                                maxRounds,
                                remainingRounds,
                                forfeitBonus,
                                currentScores,
                                finalScores
                            });

                            // Send statistics to winner
                            this.broadcastToClient(winnerId, {
                                type: 'SHOW_STATISTICS',
                                scores: finalScores,
                                forfeit: true,
                                forfeitedBy: clientId,
                                isWinner: true,
                                message: 'Rakibiniz oyunu terk etti. Kazandınız!'
                            });

                            // Clean up match
                            if (currentMatch.roundTimeout) {
                                clearTimeout(currentMatch.roundTimeout);
                            }
                            this.activeMatches.delete(matchId);

                            if (this.logger) {
                                this.logger.info('Match ended due to disconnection with forfeit', { 
                                    matchId, 
                                    disconnectedPlayer: clientId,
                                    winner: winnerId,
                                    finalScores
                                });
                            }
                        }
                    }, 30 * 1000); // 30 seconds for regular matches
                }
            }
        }

        // Handle party lobbies
        for (const [lobbyCode, lobby] of this.partyLobbies.entries()) {
            const playerIndex = lobby.participants.findIndex(p => p.id === clientId);
            if (playerIndex !== -1) {
                const disconnectedPlayer = lobby.participants[playerIndex];

                if (lobby.hostPlayerId === clientId) {
                    // Host disconnected - transfer host or close lobby
                    if (lobby.participants.length > 1) {
                        // Transfer host to next player
                        const newHost = lobby.participants.find(p => p.id !== clientId);
                        if (newHost) {
                            lobby.hostPlayerId = newHost.id;
                            newHost.isHost = true;
                            disconnectedPlayer.isHost = false;

                            console.log(`[WS INFO] Host transferred due to disconnection`, {
                                lobbyCode: lobbyCode,
                                oldHostId: clientId,
                                newHostId: newHost.id,
                                newHostName: newHost.name
                            });

                            // Remove disconnected player
                            lobby.participants.splice(playerIndex, 1);
                            lobby.currentPlayerCount = lobby.participants.length;

                            // Update lobby status based on player count
                            if (lobby.currentPlayerCount >= 4) {
                                lobby.status = 'ready_to_start';
                            } else {
                                lobby.status = 'waiting_for_players';
                            }

                            // Notify remaining players about host transfer
                            this.broadcastToLobby(lobbyCode, {
                                type: 'HOST_TRANSFERRED',
                                newHostId: newHost.id,
                                newHostName: newHost.name,
                                message: `${disconnectedPlayer.name} bağlantısı kesildi. ${newHost.name} yeni host oldu.`
                            });

                            // Send updated lobby
                            this.broadcastToLobby(lobbyCode, {
                                type: 'PARTY_LOBBY_UPDATED',
                                lobby: lobby
                            });
                        }
                    } else {
                        // Only host left - close lobby
                        console.log(`[WS INFO] Lobby closed due to host disconnection`, {
                            lobbyCode: lobbyCode,
                            hostId: clientId
                        });

                        this.partyLobbies.delete(lobbyCode);
                    }
                } else {
                    // Regular player disconnected
                    lobby.participants.splice(playerIndex, 1);
                    lobby.currentPlayerCount = lobby.participants.length;

                    // Update lobby status based on player count
                    if (lobby.currentPlayerCount >= 4) {
                        lobby.status = 'ready_to_start';
                    } else {
                        lobby.status = 'waiting_for_players';
                    }

                    console.log(`[WS INFO] Player left party lobby due to disconnection`, {
                        lobbyCode: lobbyCode,
                        playerId: clientId,
                        playerName: disconnectedPlayer.name,
                        remainingPlayers: lobby.currentPlayerCount
                    });

                    // Notify remaining players
                    this.broadcastToLobby(lobbyCode, {
                        type: 'PLAYER_LEFT',
                        playerId: clientId,
                        playerName: disconnectedPlayer.name,
                        message: `${disconnectedPlayer.name} bağlantısı kesildi ve lobiden ayrıldı.`
                    });

                    // Send updated lobby
                    this.broadcastToLobby(lobbyCode, {
                        type: 'PARTY_LOBBY_UPDATED',
                        lobby: lobby
                    });

                    // If lobby becomes empty, remove it
                    if (lobby.participants.length === 0) {
                        this.partyLobbies.delete(lobbyCode);
                        console.log(`[WS INFO] Empty lobby removed`, { lobbyCode });
                    }
                }
                break; // Player can only be in one lobby
            }
        }
    }

    findMatch() {
        // Enhanced matchmaking logic would go here
        // For now, use basic matching
        return this.findBasicMatch();
    }

    createPrivateMatch(matchId, player1, player2) {
        const match = {
            id: matchId,
            player1: { playerId: player1.id, player: player1 },
            player2: { playerId: player2.id, player: player2 },
            timestamp: Date.now(),
            currentRound: 0,
            maxRounds: 10,
            decisions: new Map(),
            scores: { player1: 0, player2: 0 },
            gameState: 'WAITING_FOR_DECISIONS',
            rematchRequests: new Set(),
            roundTimeout: null,
            isPrivateGame: true
        };

        const initialRoundDecisions = {};
        match.decisions.set(0, initialRoundDecisions);

        match.roundTimeout = setTimeout(() => {
            const timeoutMatch = this.activeMatches.get(matchId);
            if (!timeoutMatch || timeoutMatch.roundTimeout === null) return;

            const timeoutRoundDecisions = timeoutMatch.decisions.get(0) || {};

            if (!timeoutRoundDecisions.player1Decision) {
                timeoutRoundDecisions.player1Decision = 'COOPERATE';
            }
            if (!timeoutRoundDecisions.player2Decision) {
                timeoutRoundDecisions.player2Decision = 'COOPERATE';
            }

            timeoutMatch.decisions.set(0, timeoutRoundDecisions);
            timeoutMatch.roundTimeout = null;

            this.processRoundResult(timeoutMatch, matchId);
        }, 30000);

        this.activeMatches.set(matchId, match);

        console.log(`🎮 Private match created: ${matchId}`);

        // Start first round
        setTimeout(() => {
            this.broadcastToClient(player1.id, {
                type: 'NEW_ROUND',
                round: 0,
                maxRounds: 10
            });

            this.broadcastToClient(player2.id, {
                type: 'NEW_ROUND',
                round: 0,
                maxRounds: 10
            });
        }, 1000);
    }

    findBasicMatch() {
        if (this.matchmakingQueue.length >= 2) {
            this.matchmakingQueue.sort((a, b) => a.timestamp - b.timestamp);

            const player1 = this.matchmakingQueue[0];
            const player2 = this.matchmakingQueue[1];

            const matchId = generateId();
            const match = {
                id: matchId,
                player1: player1,
                player2: player2,
                timestamp: Date.now(),
                currentRound: 0,
                maxRounds: 10,
                decisions: new Map(),
                scores: { player1: 0, player2: 0 },
                gameState: 'WAITING_FOR_DECISIONS',
                rematchRequests: new Set(),
                roundTimeout: null
            };

            const initialRoundDecisions = {};
            match.decisions.set(0, initialRoundDecisions);

            match.roundTimeout = setTimeout(() => {
                const timeoutMatch = this.activeMatches.get(matchId);
                if (!timeoutMatch || timeoutMatch.roundTimeout === null) return;

                const timeoutRoundDecisions = timeoutMatch.decisions.get(0) || {};

                if (!timeoutRoundDecisions.player1Decision) {
                    timeoutRoundDecisions.player1Decision = 'COOPERATE';
                }
                if (!timeoutRoundDecisions.player2Decision) {
                    timeoutRoundDecisions.player2Decision = 'COOPERATE';
                }

                timeoutMatch.decisions.set(0, timeoutRoundDecisions);
                timeoutMatch.roundTimeout = null;

                this.processRoundResult(timeoutMatch, matchId);
            }, 30000);

            this.activeMatches.set(matchId, match);

            this.removeFromQueue(player1.playerId);
            this.removeFromQueue(player2.playerId);

            this.broadcastToClient(player1.playerId, {
                type: 'MATCH_FOUND',
                matchId: matchId,
                opponent: player2.player,
                isPlayer1: true
            });

            this.broadcastToClient(player2.playerId, {
                type: 'MATCH_FOUND',
                matchId: matchId,
                opponent: player1.player,
                isPlayer1: false
            });

            setTimeout(() => {
                this.broadcastToClient(player1.playerId, {
                    type: 'NEW_ROUND',
                    round: 0,
                    timerDuration: 30
                });

                this.broadcastToClient(player2.playerId, {
                    type: 'NEW_ROUND',
                    round: 0,
                    timerDuration: 30
                });
            }, 100);

            if (this.logger) {
                this.logger.info('Basic match created', {
                    matchId,
                    player1: player1.player.name,
                    player2: player2.player.name
                });
            }
            return true;
        }
        return false;
    }

    processRoundResult(match, matchId) {
        const roundDecisions = match.decisions.get(match.currentRound);
        const p1Decision = roundDecisions.player1Decision;
        const p2Decision = roundDecisions.player2Decision;

        let p1Points = 0, p2Points = 0;
        if (p1Decision === 'COOPERATE' && p2Decision === 'COOPERATE') {
            p1Points = 3; p2Points = 3;
        } else if (p1Decision === 'COOPERATE' && p2Decision === 'BETRAY') {
            p1Points = 0; p2Points = 5;
        } else if (p1Decision === 'BETRAY' && p2Decision === 'COOPERATE') {
            p1Points = 5; p2Points = 0;
        } else if (p1Decision === 'BETRAY' && p2Decision === 'BETRAY') {
            p1Points = 1; p2Points = 1;
        }

        // Store round scores in decisions map for decision reversal
        roundDecisions.player1Score = p1Points;
        roundDecisions.player2Score = p2Points;
        match.decisions.set(match.currentRound, roundDecisions);
        
        match.scores.player1 += p1Points;
        match.scores.player2 += p2Points;
        match.gameState = 'SHOWING_RESULTS';

        if (this.logger) {
            this.logger.debug('Round results', {
                round: match.currentRound,
                p1Decision,
                p2Decision,
                p1Points,
                p2Points,
                totalScores: match.scores
            });
        }

        const roundResult = {
            type: 'ROUND_RESULT',
            round: match.currentRound,
            matchId: matchId,
            isGameOver: match.currentRound >= match.maxRounds - 1
        };

        this.broadcastToClient(match.player1.playerId, {
            ...roundResult,
            yourDecision: p1Decision,
            opponentDecision: p2Decision,
            yourPoints: p1Points,
            opponentPoints: p2Points,
            totalYourScore: match.scores.player1,
            totalOpponentScore: match.scores.player2
        });

        this.broadcastToClient(match.player2.playerId, {
            ...roundResult,
            yourDecision: p2Decision,
            opponentDecision: p1Decision,
            yourPoints: p2Points,
            opponentPoints: p1Points,
            totalYourScore: match.scores.player2,
            totalOpponentScore: match.scores.player1
        });

        // Continue to next round or end game
        if (match.currentRound >= match.maxRounds - 1) {
            this.endGame(match, matchId);
        } else {
            setTimeout(() => {
                this.startNextRound(match, matchId);
            }, 3000);
        }
    }

    startNextRound(match, matchId) {
        match.currentRound++;
        match.gameState = 'WAITING_FOR_DECISIONS';

        const roundDecisions = {};
        match.decisions.set(match.currentRound, roundDecisions);

        match.roundTimeout = setTimeout(() => {
            const timeoutMatch = this.activeMatches.get(matchId);
            if (!timeoutMatch || timeoutMatch.roundTimeout === null) return;

            const timeoutRoundDecisions = timeoutMatch.decisions.get(match.currentRound) || {};

            if (!timeoutRoundDecisions.player1Decision) {
                timeoutRoundDecisions.player1Decision = 'COOPERATE';
            }
            if (!timeoutRoundDecisions.player2Decision) {
                timeoutRoundDecisions.player2Decision = 'COOPERATE';
            }

            timeoutMatch.decisions.set(match.currentRound, timeoutRoundDecisions);
            timeoutMatch.roundTimeout = null;

            this.processRoundResult(timeoutMatch, matchId);
        }, 30000);

        this.broadcastToClient(match.player1.playerId, {
            type: 'NEW_ROUND',
            round: match.currentRound,
            matchId: matchId,
            timerDuration: 30
        });

        this.broadcastToClient(match.player2.playerId, {
            type: 'NEW_ROUND',
            round: match.currentRound,
            matchId: matchId,
            timerDuration: 30
        });
    }

    async endGame(match, matchId) {
        match.gameState = 'AWAITING_REVERSAL_RESPONSES';

        const winner = match.scores.player1 > match.scores.player2 ? 'player1' :
            match.scores.player2 > match.scores.player1 ? 'player2' : 'tie';

        const gameResult = {
            type: 'GAME_OVER',
            matchId: matchId,
            winner: winner,
            finalScores: match.scores,
            totalRounds: match.maxRounds
        };

        this.broadcastToClient(match.player1.playerId, gameResult);
        this.broadcastToClient(match.player2.playerId, gameResult);

        // Don't save game results immediately - wait for decision reversal process
        // Results will be saved after decision reversal is complete or declined
        console.log('🔄 Game ended, waiting for decision reversal process before saving results');

        // Clean up round timeout
        if (match.roundTimeout) {
            clearTimeout(match.roundTimeout);
            match.roundTimeout = null;
        }

        // Set up reversal timeout - shorter for tournament matches
        const timeoutDuration = match.tournamentId ? 30000 : 60000; // 30s for tournament, 60s for regular
        match.reversalTimeout = setTimeout(() => {
            console.log('🔄 Reversal timeout triggered for match:', matchId);
            console.log('🔄 Reversal timeout reached, auto-rejecting for both players:', matchId);

            const timeoutMatch = this.activeMatches.get(matchId);
            if (!timeoutMatch) return;

            // Auto-reject for both players and go to statistics
            const winner = timeoutMatch.scores.player1 > timeoutMatch.scores.player2 ? 'player1' :
                timeoutMatch.scores.player2 > timeoutMatch.scores.player1 ? 'player2' : 'tie';

            // Player 1 perspective
            this.broadcastToClient(timeoutMatch.player1.playerId, {
                type: 'SHOW_STATISTICS',
                yourScore: timeoutMatch.scores.player1,
                opponentScore: timeoutMatch.scores.player2,
                finalScores: timeoutMatch.scores,
                totalRounds: timeoutMatch.maxRounds,
                winner: winner,
                message: 'Zaman aşımı nedeniyle değişiklik reddedildi.',
                session: timeoutMatch.session
            });

            // Player 2 perspective
            this.broadcastToClient(timeoutMatch.player2.playerId, {
                type: 'SHOW_STATISTICS',
                yourScore: timeoutMatch.scores.player2,
                opponentScore: timeoutMatch.scores.player1,
                finalScores: timeoutMatch.scores,
                totalRounds: timeoutMatch.maxRounds,
                winner: winner,
                message: 'Zaman aşımı nedeniyle değişiklik reddedildi.',
                session: timeoutMatch.session
            });

            // Process tournament match result if this is a tournament match
            if (timeoutMatch.tournamentId) {
                console.log('🏆 Processing tournament match result (timeout):', matchId);
                
                // Convert winner string to actual player ID
                let actualWinnerId = null;
                if (winner === 'player1') {
                    actualWinnerId = timeoutMatch.player1.playerId;
                } else if (winner === 'player2') {
                    actualWinnerId = timeoutMatch.player2.playerId;
                } else {
                    actualWinnerId = 'tie';
                }
                
                console.log('🏆 Timeout winner conversion:', {
                    winnerString: winner,
                    actualWinnerId: actualWinnerId,
                    player1Id: timeoutMatch.player1.playerId,
                    player2Id: timeoutMatch.player2.playerId,
                    tournamentId: timeoutMatch.tournamentId
                });
                
                // Call with match object, matchId, and winnerId
                this.processTournamentMatchResultWithMatch(timeoutMatch, matchId, actualWinnerId);
            }
            // Save game results to database (if not already saved)
            if (!timeoutMatch.resultsSaved) {
                this.saveGameResults(timeoutMatch, matchId, winner).catch(error => {
                    console.error('❌ Error saving game results in timeout:', error);
                });
                timeoutMatch.resultsSaved = true;
            }

            // Clean up match
            console.log('🔄 Cleaning up timeout match:', matchId);
            this.activeMatches.delete(matchId);
        }, timeoutDuration); // Use the calculated timeout duration

        // Don't delete match immediately - keep it for reversal responses
        // this.activeMatches.delete(matchId); // Commented out

        if (this.logger) {
            this.logger.info('Game ended', {
                matchId,
                winner,
                finalScores: match.scores,
                awaitingReversalResponses: true
            });
        }
    }

    recalculateRoundScore(match, roundNumber) {
        const roundDecisions = match.decisions.get(roundNumber);
        if (!roundDecisions) return;

        const p1Decision = roundDecisions.player1Decision;
        const p2Decision = roundDecisions.player2Decision;

        // Calculate original points for this round
        let oldP1Points = 0, oldP2Points = 0;
        if (p1Decision === 'COOPERATE' && p2Decision === 'COOPERATE') {
            oldP1Points = 3; oldP2Points = 3;
        } else if (p1Decision === 'COOPERATE' && p2Decision === 'BETRAY') {
            oldP1Points = 0; oldP2Points = 5;
        } else if (p1Decision === 'BETRAY' && p2Decision === 'COOPERATE') {
            oldP1Points = 5; oldP2Points = 0;
        } else if (p1Decision === 'BETRAY' && p2Decision === 'BETRAY') {
            oldP1Points = 1; oldP2Points = 1;
        }

        // Store old points to subtract later
        if (!roundDecisions.originalP1Points) {
            roundDecisions.originalP1Points = oldP1Points;
            roundDecisions.originalP2Points = oldP2Points;
        }

        // Subtract original points
        match.scores.player1 -= roundDecisions.originalP1Points;
        match.scores.player2 -= roundDecisions.originalP2Points;

        // Calculate new points
        let newP1Points = 0, newP2Points = 0;
        if (p1Decision === 'COOPERATE' && p2Decision === 'COOPERATE') {
            newP1Points = 3; newP2Points = 3;
        } else if (p1Decision === 'COOPERATE' && p2Decision === 'BETRAY') {
            newP1Points = 0; newP2Points = 5;
        } else if (p1Decision === 'BETRAY' && p2Decision === 'COOPERATE') {
            newP1Points = 5; newP2Points = 0;
        } else if (p1Decision === 'BETRAY' && p2Decision === 'BETRAY') {
            newP1Points = 1; newP2Points = 1;
        }

        // Add new points
        match.scores.player1 += newP1Points;
        match.scores.player2 += newP2Points;

        console.log('🔄 Recalculated round score:', {
            round: roundNumber,
            oldPoints: { p1: roundDecisions.originalP1Points, p2: roundDecisions.originalP2Points },
            newPoints: { p1: newP1Points, p2: newP2Points },
            totalScores: match.scores
        });
    }

    async saveGameResults(match, matchId, winner) {
        if (!this.dbManager) {
            console.log('⚠️ No database manager available, skipping game result save');
            return;
        }

        // Check if results already saved
        if (match.resultsSaved) {
            console.log('⚠️ Game results already saved for match:', matchId);
            return;
        }

        // Mark as being saved to prevent duplicate saves
        match.resultsSaved = true;

        try {
            console.log('💾 Saving game results to database:', {
                matchId: matchId,
                player1: match.player1.playerId,
                player2: match.player2.playerId,
                winner: winner,
                scores: match.scores
            });

            console.log('💾 Database manager exists:', !!this.dbManager);
            console.log('💾 Getting repositories...');

            // Get player user IDs from session tokens
            const sessionRepo = this.dbManager.getSessionRepository();
            const userStatsRepo = this.dbManager.getUserStatsRepository();
            const gameHistoryRepo = this.dbManager.getGameHistoryRepository();

            console.log('💾 Repositories obtained:', {
                sessionRepo: !!sessionRepo,
                userStatsRepo: !!userStatsRepo,
                gameHistoryRepo: !!gameHistoryRepo
            });

            // Get user IDs from session tokens
            let player1UserId = null;
            let player2UserId = null;

            console.log('💾 Looking up user IDs from session tokens...');

            try {
                const player1Session = await sessionRepo.findByToken(match.player1.playerId);
                if (player1Session) {
                    player1UserId = player1Session.userId;
                    console.log('💾 Found player 1 user ID:', player1UserId);
                } else {
                    console.log('⚠️ No session found for player 1 token:', match.player1.playerId);
                }
            } catch (error) {
                console.log('⚠️ Error finding user ID for player 1:', error.message);
            }

            try {
                const player2Session = await sessionRepo.findByToken(match.player2.playerId);
                if (player2Session) {
                    player2UserId = player2Session.userId;
                    console.log('💾 Found player 2 user ID:', player2UserId);
                } else {
                    console.log('⚠️ No session found for player 2 token:', match.player2.playerId);
                }
            } catch (error) {
                console.log('⚠️ Error finding user ID for player 2:', error.message);
            }

            // Determine winner_id correctly
            let winnerId = null;
            if (winner === 'player1' && player1UserId) {
                winnerId = player1UserId;
            } else if (winner === 'player2' && player2UserId) {
                winnerId = player2UserId;
            }
            // If winner is 'tie' or null, winnerId remains null

            // Only save to database if both players have user IDs (not guests)
            if (player1UserId && player2UserId) {
                // Save game history
                const gameHistoryData = {
                    player1_id: player1UserId,
                    player2_id: player2UserId,
                    player1_score: match.scores.player1,
                    player2_score: match.scores.player2,
                    winner_id: winnerId,
                    game_mode: 'multiplayer',
                    rounds_played: match.maxRounds,
                    game_duration: Date.now() - match.timestamp, // milliseconds
                    created_at: new Date().toISOString()
                };

                console.log('💾 Creating game history record:', gameHistoryData);

                    const gameHistoryResult = await gameHistoryRepo.create(gameHistoryData);
                console.log('✅ Game history saved successfully:', gameHistoryResult);

                // Update user statistics
                if (player1UserId) {
                    await this.updateUserStats(userStatsRepo, player1UserId, {
                        score: match.scores.player1,
                        opponentScore: match.scores.player2,
                        isWinner: winner === 'player1',
                        roundsPlayed: match.maxRounds
                    });
                }

                if (player2UserId) {
                    await this.updateUserStats(userStatsRepo, player2UserId, {
                        score: match.scores.player2,
                        opponentScore: match.scores.player1,
                        isWinner: winner === 'player2',
                        roundsPlayed: match.maxRounds
                    });
                }

                console.log('✅ User statistics updated successfully');
            } else {
                console.log('⚠️ Skipping database save - one or both players are guests');
                console.log('💾 Game completed:', {
                    player1: match.player1.playerId,
                    player2: match.player2.playerId,
                    scores: match.scores,
                    winner: winner
                });
            }

        } catch (error) {
            console.error('❌ Error saving game results:', error);
        }
    }

    async updateUserStats(userStatsRepo, userId, gameData) {
        try {
            // Get current stats
            let stats = await userStatsRepo.findByUserId(userId);

            if (!stats) {
                // Create new stats record with correct field names
                stats = {
                    userId: userId,
                    totalGames: 0,
                    wins: 0,
                    losses: 0,
                    cooperations: 0,
                    betrayals: 0,
                    totalScore: 0,
                    winRate: 0,
                    trustScore: 50,
                    betrayalRate: 0,
                    averageScore: 0,
                    longestWinStreak: 0,
                    currentWinStreak: 0,
                    gamesThisWeek: 0,
                    gamesThisMonth: 0
                };
            }

            // Update stats
            const newTotalGames = stats.totalGames + 1;
            const newWins = stats.wins + (gameData.isWinner ? 1 : 0);
            const newLosses = stats.losses + (gameData.isWinner ? 0 : 1);
            const newTotalScore = stats.totalScore + gameData.score;
            const newWinRate = Math.round((newWins / newTotalGames) * 100) / 100;
            const newAverageScore = Math.round(newTotalScore / newTotalGames);

            // Update win streak
            let newCurrentWinStreak = stats.currentWinStreak;
            let newLongestWinStreak = stats.longestWinStreak;

            if (gameData.isWinner) {
                newCurrentWinStreak += 1;
                newLongestWinStreak = Math.max(newLongestWinStreak, newCurrentWinStreak);
            } else {
                newCurrentWinStreak = 0;
            }

            const updatedStats = {
                userId: userId,
                totalGames: newTotalGames,
                wins: newWins,
                losses: newLosses,
                cooperations: stats.cooperations,
                betrayals: stats.betrayals,
                totalScore: newTotalScore,
                winRate: newWinRate,
                trustScore: stats.trustScore,
                betrayalRate: stats.betrayalRate,
                averageScore: newAverageScore,
                longestWinStreak: newLongestWinStreak,
                currentWinStreak: newCurrentWinStreak,
                gamesThisWeek: stats.gamesThisWeek + 1,
                gamesThisMonth: stats.gamesThisMonth + 1
            };

            // Use updateUserStats method which handles INSERT OR REPLACE
            await userStatsRepo.updateStats(userId, updatedStats);

            console.log(`✅ Updated stats for user ${userId}:`, {
                totalGames: newTotalGames,
                wins: newWins,
                winRate: newWinRate,
                averageScore: newAverageScore,
                currentWinStreak: newCurrentWinStreak
            });

        } catch (error) {
            console.error(`❌ Error updating stats for user ${userId}:`, error);
        }
    }

    recalculateRoundScore(match, roundNumber) {
        console.log('🔄 Recalculating score for round:', roundNumber);

        const roundDecisions = match.decisions.get(roundNumber);
        if (!roundDecisions) {
            console.error('❌ Round decisions not found for round:', roundNumber);
            return;
        }

        const player1Decision = roundDecisions.player1Decision;
        const player2Decision = roundDecisions.player2Decision;

        console.log('🔄 Round decisions:', {
            round: roundNumber,
            player1: player1Decision,
            player2: player2Decision
        });

        // Normalize decisions to lowercase for comparison
        const p1Decision = player1Decision.toLowerCase();
        const p2Decision = player2Decision.toLowerCase();

        // Calculate new scores based on prisoner's dilemma logic
        let player1RoundScore = 0;
        let player2RoundScore = 0;

        if (p1Decision === 'cooperate' && p2Decision === 'cooperate') {
            // Both cooperate - both get 3 points
            player1RoundScore = 3;
            player2RoundScore = 3;
        } else if (p1Decision === 'betray' && p2Decision === 'betray') {
            // Both betray - both get 1 point
            player1RoundScore = 1;
            player2RoundScore = 1;
        } else if (p1Decision === 'cooperate' && p2Decision === 'betray') {
            // Player 1 cooperates, Player 2 betrays - Player 2 gets 5, Player 1 gets 0
            player1RoundScore = 0;
            player2RoundScore = 5;
        } else if (p1Decision === 'betray' && p2Decision === 'cooperate') {
            // Player 1 betrays, Player 2 cooperates - Player 1 gets 5, Player 2 gets 0
            player1RoundScore = 5;
            player2RoundScore = 0;
        }

        console.log('🔄 New round scores:', {
            round: roundNumber,
            player1Score: player1RoundScore,
            player2Score: player2RoundScore
        });

        // Update the round score in match data
        roundDecisions.player1Score = player1RoundScore;
        roundDecisions.player2Score = player2RoundScore;

        // Recalculate total scores
        let newPlayer1Total = 0;
        let newPlayer2Total = 0;

        console.log('🔄 Recalculating total from all rounds:', {
            totalRoundsInMap: match.decisions.size,
            rounds: Array.from(match.decisions.keys())
        });

        for (let [round, decisions] of match.decisions) {
            const p1Score = decisions.player1Score || 0;
            const p2Score = decisions.player2Score || 0;
            newPlayer1Total += p1Score;
            newPlayer2Total += p2Score;
            
            console.log(`  Round ${round}: P1=${p1Score}, P2=${p2Score}, Running Total: P1=${newPlayer1Total}, P2=${newPlayer2Total}`);
        }

        // Update match scores
        match.scores.player1 = newPlayer1Total;
        match.scores.player2 = newPlayer2Total;

        console.log('🔄 Updated total scores:', {
            player1Total: newPlayer1Total,
            player2Total: newPlayer2Total,
            totalRoundsCounted: match.decisions.size
        });

        // Note: Scores are calculated but not broadcast immediately
        // They will be broadcast when both players complete their changes
    }

    async finalizeDecisionReversal(match, matchId) {
        console.log('🔄 Finalizing decision reversal for match:', matchId);

        // Recalculate ALL rounds to ensure correct scores
        console.log('🔄 Recalculating all rounds...');
        let totalPlayer1Score = 0;
        let totalPlayer2Score = 0;

        for (let [roundNum, decisions] of match.decisions) {
            const p1Decision = decisions.player1Decision.toLowerCase();
            const p2Decision = decisions.player2Decision.toLowerCase();

            let player1RoundScore = 0;
            let player2RoundScore = 0;

            if (p1Decision === 'cooperate' && p2Decision === 'cooperate') {
                player1RoundScore = 3;
                player2RoundScore = 3;
            } else if (p1Decision === 'betray' && p2Decision === 'betray') {
                player1RoundScore = 1;
                player2RoundScore = 1;
            } else if (p1Decision === 'cooperate' && p2Decision === 'betray') {
                player1RoundScore = 0;
                player2RoundScore = 5;
            } else if (p1Decision === 'betray' && p2Decision === 'cooperate') {
                player1RoundScore = 5;
                player2RoundScore = 0;
            }

            // Update round scores
            decisions.player1Score = player1RoundScore;
            decisions.player2Score = player2RoundScore;

            totalPlayer1Score += player1RoundScore;
            totalPlayer2Score += player2RoundScore;

            console.log(`🔄 Round ${roundNum}: ${p1Decision} vs ${p2Decision} = ${player1RoundScore}-${player2RoundScore}`);
        }

        // Update match total scores
        match.scores.player1 = totalPlayer1Score;
        match.scores.player2 = totalPlayer2Score;

        console.log('🔄 Final recalculated scores:', {
            player1: totalPlayer1Score,
            player2: totalPlayer2Score
        });

        // Calculate final winner
        let finalWinner = match.scores.player1 > match.scores.player2 ? 'player1' :
            match.scores.player2 > match.scores.player1 ? 'player2' : 'tie';
        
        // For single elimination tournaments, ties are not allowed - determine winner randomly
        if (finalWinner === 'tie' && match.tournamentId) {
            const tournament = this.activeTournaments.get(match.tournamentId);
            if (tournament && tournament.format === 'single_elimination') {
                finalWinner = Math.random() < 0.5 ? 'player1' : 'player2';
                console.log('🎲 Single elimination tie resolved randomly:', finalWinner);
            }
        }

        // Prepare updated session data with player IDs
        const updatedDecisions = {};
        for (let [roundNum, decisions] of match.decisions) {
            updatedDecisions[roundNum] = {
                [match.player1.playerId]: {
                    decision: decisions.player1Decision,
                    score: decisions.player1Score
                },
                [match.player2.playerId]: {
                    decision: decisions.player2Decision,
                    score: decisions.player2Score
                }
            };
        }

        console.log('📊 Sending updated decisions to clients:', updatedDecisions);

        // Player 1 perspective
        this.broadcastToClient(match.player1.playerId, {
            type: 'SHOW_STATISTICS',
            yourScore: match.scores.player1,
            opponentScore: match.scores.player2,
            finalScores: match.scores,
            totalRounds: match.maxRounds,
            winner: finalWinner,
            updatedDecisions: updatedDecisions
        });

        // Player 2 perspective
        this.broadcastToClient(match.player2.playerId, {
            type: 'SHOW_STATISTICS',
            yourScore: match.scores.player2,
            opponentScore: match.scores.player1,
            finalScores: match.scores,
            totalRounds: match.maxRounds,
            winner: finalWinner,
            updatedDecisions: updatedDecisions
        });

        // Save updated game results
        if (!match.resultsSaved) {
            try {
                console.log('💾 About to save game results with scores:', {
                    player1: match.scores.player1,
                    player2: match.scores.player2,
                    winner: finalWinner
                });
                await this.saveGameResults(match, matchId, finalWinner);
                match.resultsSaved = true;
                console.log('✅ Final game results saved successfully');
            } catch (error) {
                console.error('❌ Error saving final game results:', error);
            }
        }

        // Process tournament match result if this is a tournament match
        console.log('🔍 Checking if tournament match:', {
            hasTournamentId: !!match.tournamentId,
            tournamentId: match.tournamentId,
            isTournamentMatch: match.isTournamentMatch,
            matchId: matchId
        });
        
        if (match.tournamentId) {
            console.log('🏆 Processing tournament match result after reversal completed');
            
            let actualWinnerId = null;
            if (finalWinner === 'player1') {
                actualWinnerId = match.player1.playerId;
            } else if (finalWinner === 'player2') {
                actualWinnerId = match.player2.playerId;
            } else {
                actualWinnerId = 'tie';
            }
            
            this.processTournamentMatchResultWithMatch(match, matchId, actualWinnerId);
        } else {
            console.log('⚠️ Not a tournament match, skipping tournament result processing');
        }

        // Clean up
        if (match.reversalTimeout) {
            clearTimeout(match.reversalTimeout);
        }
        if (match.completionTimeout) {
            clearTimeout(match.completionTimeout);
        }
        
        // Don't delete match here if it's a tournament match - processTournamentMatchResultWithMatch will handle it
        if (!match.tournamentId) {
            this.activeMatches.delete(matchId);
        }
    }

    broadcastToClient(clientId, message) {
        // Try to find client directly first
        let client = this.connectedClients.get(clientId);
        
        // If not found, check if this is a tournament player ID and convert to client ID
        if (!client) {
            const actualClientId = this.tournamentPlayerIdToClientId.get(String(clientId));
            if (actualClientId) {
                console.log('🔄 Converting tournament player ID to client ID:', {
                    tournamentPlayerId: clientId,
                    clientId: actualClientId.substring(0, 20) + '...'
                });
                client = this.connectedClients.get(actualClientId);
                clientId = actualClientId; // Update for logging
            }
        }
        
        if (client && client.readyState === WebSocket.OPEN) {
            console.log('📤 Broadcasting to client:', clientId.substring(0, 20) + '...', 'message type:', message.type);
            client.send(JSON.stringify(message));
        } else {
            console.log('❌ Cannot broadcast to client:', clientId, 'client not found or not connected');
        }
    }

    broadcastToLobby(lobbyCode, message) {
        console.log('📤 Broadcasting to lobby:', lobbyCode, 'message type:', message.type);
        const lobby = this.partyLobbies?.get(lobbyCode);
        if (!lobby) {
            console.log('❌ Lobby not found:', lobbyCode);
            return;
        }

        console.log('👥 Lobby participants:', lobby.participants.length);
        lobby.participants.forEach(player => {
            console.log('📤 Sending to participant:', player.id, player.name);
            this.broadcastToClient(player.id, message);
        });
    }

    processTournamentMatchResult(match, matchId, winnerId) {
        console.log('🏆 Processing tournament match result:', {
            matchId: matchId,
            winnerId: winnerId,
            tournamentId: match.tournamentId
        });

        try {
            const tournament = this.activeTournaments.get(match.tournamentId);
            if (!tournament) {
                console.error('Tournament not found:', match.tournamentId);
                return;
            }

            // Find the match in tournament bracket by player IDs (more reliable)
            let tournamentMatch = null;
            let roundIndex = -1;
            let matchIndex = -1;
            
            console.log('🏆 Looking for match with players:', match.player1.playerId, 'vs', match.player2.playerId);
            
            for (let i = 0; i < tournament.bracket.rounds.length; i++) {
                const round = tournament.bracket.rounds[i];
                for (let j = 0; j < round.matches.length; j++) {
                    const bracketMatch = round.matches[j];
                    
                    // Check by player IDs (more reliable than match ID)
                    if ((bracketMatch.player1Id === match.player1.playerId && bracketMatch.player2Id === match.player2.playerId) ||
                        (bracketMatch.player1Id === match.player2.playerId && bracketMatch.player2Id === match.player1.playerId)) {
                        console.log('🏆 Found match by player IDs:', bracketMatch.id);
                        tournamentMatch = bracketMatch;
                        roundIndex = i;
                        matchIndex = j;
                        break;
                    }
                }
                if (tournamentMatch) break;
            }
            
            if (!tournamentMatch) {
                console.error('🏆 Tournament match not found by player IDs');
                console.log('🏆 Available matches in bracket:');
                tournament.bracket.rounds.forEach((round, rIndex) => {
                    console.log(`Round ${rIndex}:`, round.matches.map(m => ({ 
                        id: m.id, 
                        p1: m.player1Id, 
                        p2: m.player2Id 
                    })));
                });
                return;
            }

            // Update match result
            tournamentMatch.status = 'completed';
            tournamentMatch.result = {
                winnerId: winnerId,
                scores: match.scores,
                completedAt: new Date()
            };

            console.log('🏆 Tournament match completed:', {
                matchId: matchId,
                winnerId: winnerId,
                scores: match.scores
            });

            // Remove from active matches
            this.activeMatches.delete(matchId);

            // Check if round is complete and advance tournament
            this.checkTournamentRoundCompletion(tournament);

        } catch (error) {
            console.error('Error processing tournament match result:', error);
        }
    }

    generateNextRoundMatches(tournament, completedRoundIndex) {
        console.log('🏆 Generating next round matches for tournament:', tournament.id);
        
        const completedRound = tournament.bracket.rounds[completedRoundIndex];
        const winners = [];
        
        // Collect winners from completed round
        for (const match of completedRound.matches) {
            if (match.status === 'completed' && match.result?.winnerId) {
                const winner = tournament.players.find(p => p.id === match.result.winnerId);
                if (winner) {
                    winners.push(winner);
                    console.log('🏆 Winner advancing:', winner.name);
                }
            }
        }
        
        console.log('🏆 Total winners advancing:', winners.length);
        
        if (winners.length < 2) {
            console.log('🏆 Not enough winners for next round');
            return;
        }
        
        // Create next round matches
        const nextRoundMatches = [];
        const nextRoundNumber = completedRoundIndex + 1;
        
        for (let i = 0; i < winners.length; i += 2) {
            if (i + 1 < winners.length) {
                const match = {
                    id: `match_${tournament.id}_${nextRoundNumber}_${i / 2}`,
                    tournamentId: tournament.id,
                    roundNumber: nextRoundNumber,
                    player1Id: winners[i].id,
                    player2Id: winners[i + 1].id,
                    status: 'scheduled',
                    result: null,
                    startTime: null,
                    endTime: null
                };
                nextRoundMatches.push(match);
                console.log('🏆 Created next round match:', match.id, winners[i].name, 'vs', winners[i + 1].name);
            }
        }
        
        // Add next round to bracket
        tournament.bracket.rounds.push({
            roundNumber: nextRoundNumber,
            matches: nextRoundMatches,
            status: 'scheduled'
        });
        
        console.log('🏆 Next round created with', nextRoundMatches.length, 'matches');
    }

    checkTournamentRoundCompletion(tournament) {
        console.log('🏆 Checking tournament round completion for:', tournament.id);

        const currentRoundIndex = tournament.currentRound - 1;
        if (currentRoundIndex < 0 || currentRoundIndex >= tournament.bracket.rounds.length) {
            console.log('🏆 Invalid round index:', currentRoundIndex);
            return;
        }

        const currentRound = tournament.bracket.rounds[currentRoundIndex];
        const allMatchesCompleted = currentRound.matches.every(match => match.status === 'completed');

        console.log('🏆 Round completion check:', {
            roundIndex: currentRoundIndex,
            totalMatches: currentRound.matches.length,
            completedMatches: currentRound.matches.filter(m => m.status === 'completed').length,
            allCompleted: allMatchesCompleted
        });

        if (allMatchesCompleted) {
            // Collect winners from current round
            const winners = [];
            for (const match of currentRound.matches) {
                if (match.status === 'completed' && match.result?.winnerId) {
                    const winner = tournament.players.find(p => p.id === match.result.winnerId);
                    if (winner) {
                        winners.push(winner);
                    }
                }
            }
            
            console.log('🏆 Round winners:', {
                winnersCount: winners.length,
                winners: winners.map(w => w.name)
            });
            
            // Check if tournament is complete (only 1 winner left)
            if (winners.length === 1) {
                // Tournament is complete
                tournament.status = 'completed';
                tournament.endTime = new Date();
                const winner = winners[0];

                console.log('🏆 Tournament completed! Winner:', winner.name);

                // Set final rankings
                winner.currentRank = 1;
                winner.status = 'winner';
                
                // Set ranks for other players based on when they were eliminated
                const eliminatedPlayers = tournament.players.filter(p => p.id !== winner.id);
                eliminatedPlayers.sort((a, b) => {
                    // Players eliminated later get better ranks
                    const aWins = a.statistics?.matchesWon || 0;
                    const bWins = b.statistics?.matchesWon || 0;
                    return bWins - aWins; // More wins = better rank
                });
                
                eliminatedPlayers.forEach((player, index) => {
                    player.currentRank = index + 2; // Start from rank 2
                    player.status = 'eliminated';
                });

                console.log('🏆 Final rankings:', tournament.players.map(p => ({ name: p.name, rank: p.currentRank })));

                // Broadcast tournament completion
                this.broadcastToLobby(tournament.lobbyId, {
                    type: 'TOURNAMENT_COMPLETED',
                    tournament: tournament,
                    winner: winner,
                    winnerId: winner.id,
                    winnerName: winner.name,
                    message: `🏆 Turnuva tamamlandı! Kazanan: ${winner.name}`
                });

            } else if (winners.length > 1) {
                // Advance to next round
                tournament.currentRound++;
                console.log('🏆 Advancing to round:', tournament.currentRound);

                // Generate next round matches for single elimination
                if (tournament.format === 'single_elimination') {
                    this.generateNextRoundMatches(tournament, currentRoundIndex);
                }

                // Wait 10 seconds before starting next round to allow players to view statistics
                console.log('⏳ Waiting 10 seconds before starting next round...');
                setTimeout(() => {
                    // Start next round
                    console.log('🏆 Starting next round matches...');
                    const activeMatches = this.startTournamentRound(tournament, tournament.currentRound - 1);
                    console.log('🏆 Next round active matches created:', activeMatches ? activeMatches.length : 0);
                    
                    // Get bracket matches (without circular references)
                    const nextRoundIndex = tournament.currentRound - 1;
                    const bracketMatches = tournament.bracket.rounds[nextRoundIndex]?.matches || [];
                    
                    // Broadcast round started
                    this.broadcastToLobby(tournament.lobbyId, {
                        type: 'TOURNAMENT_ROUND_STARTED',
                        tournament: tournament,
                        round: tournament.currentRound,
                        matches: bracketMatches, // Use bracket matches instead of active matches
                        message: `🎯 ${tournament.currentRound}. tur başladı!`
                    });
                }, 10000); // 10 second delay
            }
        }
    }
}

// Initialize game server function
function initializeGameServer(server, dbManager) {
    const logger = {
        debug: (...args) => console.log('[WS DEBUG]', ...args),
        info: (...args) => console.log('[WS INFO]', ...args),
        warn: (...args) => console.warn('[WS WARN]', ...args),
        error: (...args) => console.error('[WS ERROR]', ...args)
    };

    const gameServer = new GameServer(server, dbManager, logger);

    logger.info('WebSocket Game Server initialized');
    logger.info(`WebSocket connections will be handled on the same port`);

    return gameServer;
}

module.exports = { GameServer, initializeGameServer };