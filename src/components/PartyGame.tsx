import React, { useState, useEffect } from 'react';
import { Player } from '../types';
import { User } from '../services/UserService';
import { useViewportSize } from '../hooks';
import {
  PartyLobby as IPartyLobby,
  LobbyCreationRequest,
  LobbyJoinRequest,
  ChatMessage,
  PartyMessage,
  PartyMessageType,
  LobbyStatus,
  Tournament,
  TournamentPlayer,
  ActiveMatch,
  PlayerStatus,
  TournamentFormat
} from '../types/party';
import PartyModeMenu from './PartyModeMenu';
import PartyLobby from './PartyLobby';
import SpectatorMode from './SpectatorMode';
import { MultiplayerGame } from './MultiplayerGame';
import { getPartyLobbyService } from '../services/PartyLobbyService';
import SpectatorService from '../services/SpectatorService';
import DebugPanel from './DebugPanel';
import { getAdminAuthService } from '../services/AdminAuthService';
import { WebSocketGameClient } from '../services/WebSocketGameClient';
import { PartyWebSocketClient } from '../services/PartyWebSocketClient';
import { getUserService } from '../services/UserService';
import { getStateManager } from '../services/StateManager';
import { getSyncService } from '../services/SyncService';
import { getReconnectionService } from '../services/ReconnectionService';
import { getTabManager } from '../services/TabManager';
import { getPartyStateManager, PartyGamePhase, SpectatorState as PartySpectatorState } from '../services/PartyStateManager';
import { getPlayerTransformService } from '../services/PlayerTransformService';
import { getMatchRecordingService } from '../services/MatchRecordingService';
import tr from '../locales/tr.json';
import './PartyGame.css';
import { TournamentMatchGame } from './TournamentMatchGame';

interface PartyGameProps {
  humanPlayer: User;
  onGameEnd: () => void;
}

const PartyGame: React.FC<PartyGameProps> = ({ humanPlayer, onGameEnd }) => {
  // Use PartyStateManager for centralized state management
  const partyStateManager = getPartyStateManager();
  
  // Local UI state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectionState, setReconnectionState] = useState<any>(null);
  const [tabConflictMessage, setTabConflictMessage] = useState<string | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // Force re-render when state changes
  const [, forceUpdate] = useState({});

  // Get services
  const playerTransformService = getPlayerTransformService();
  const partyLobbyService = getPartyLobbyService();
  const spectatorService = new SpectatorService();
  const [partyWsClient] = useState(() => new PartyWebSocketClient()); // Party mode için ayrı client
  const [multiplayerWsClient] = useState(() => new WebSocketGameClient()); // Multiplayer için ayrı client
  const userService = getUserService();
  const stateManager = getStateManager();
  const adminAuthService = getAdminAuthService();
  const syncService = getSyncService();
  const reconnectionService = getReconnectionService();
  const tabManager = getTabManager();
  
  // Get current state from PartyStateManager
  const currentPhase = partyStateManager.getCurrentPhase();
  const currentLobby = partyStateManager.getCurrentLobby();
  const currentTournamentData = partyStateManager.getCurrentTournament();
  const currentMatch = partyStateManager.getCurrentMatch();
  const spectatorState = partyStateManager.getSpectatorState();

  // Subscribe to PartyStateManager changes
  useEffect(() => {
    const unsubscribe = partyStateManager.subscribe((state) => {
      console.log('🎮 PartyStateManager state changed:', state.phase);
      forceUpdate({}); // Force re-render when state changes
    });

    return () => {
      unsubscribe();
    };
  }, [partyStateManager]);

  // Tab conflict event handlers
  const handleTabConflictSpectator = (event: CustomEvent) => {
    console.log('🔖 Tab conflict: switching to spectator mode');
    setTabConflictMessage('Başka bir sekmede oturum açıldı. İzleyici moduna geçiliyor...');

    // Switch to spectator mode if in tournament
    if (currentTournamentData) {
      // Create spectator player from current user
      const spectatorPlayer: TournamentPlayer = {
        id: humanPlayer.id,
        name: humanPlayer.displayName || humanPlayer.username,
        isHost: false,
        isEliminated: true,
        status: PlayerStatus.SPECTATING,
        currentRank: 0,
        statistics: {
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          totalPoints: 0,
          cooperationRate: 0,
          betrayalRate: 0,
          averageMatchScore: 0,
          headToHeadRecord: new Map(),
          tournamentPoints: 0
        },
        joinedAt: new Date()
      };
      
      const spectatorState: PartySpectatorState = {
        tournament: currentTournamentData,
        spectatorPlayer: spectatorPlayer,
        watchingMatchId: null,
        activeMatches: [],
        messages: []
      };
      
      partyStateManager.transitionToSpectator(spectatorState, 'system');
    }

    setTimeout(() => setTabConflictMessage(null), 5000);
  };

  const handleTabConflictLogout = (event: CustomEvent) => {
    console.log('🔖 Tab conflict: forcing logout');
    setTabConflictMessage('Başka bir sekmede oturum açıldı. Ana menüye yönlendiriliyorsunuz...');

    // Force return to menu
    partyStateManager.transitionToMenu('system');
    setMessages([]);

    setTimeout(() => setTabConflictMessage(null), 5000);
  };

  useEffect(() => {
    const initializeSession = async () => {
      console.log('🎮 Initializing user session...');

      // Initialize tab management first
      tabManager.initialize();

      // Check if this is a page refresh vs new tab
      const isRefresh = tabManager.isPageRefresh();
      console.log('🔖 Page load type:', isRefresh ? 'refresh' : 'new tab');

      // Migrate old session data if needed
      stateManager.migrateOldSessions();

      // Get or create user identity
      const user = userService.getOrCreateUser(humanPlayer.displayName || humanPlayer.username);
      console.log('🎮 Current user:', user);

      // Try to recover from stored state
      const storedSession = await stateManager.loadState();
      if (storedSession) {
        console.log('🎮 Found stored session:', storedSession);

        const recoveryResult = await stateManager.recoverFromState(storedSession);
        if (recoveryResult.success && recoveryResult.recoveredState) {
          console.log('🎮 Session recovery successful:', recoveryResult.recoveredState);

          // Restore user service state
          userService.updateUser(recoveryResult.recoveredState.user);
          userService.updateSession(recoveryResult.recoveredState.gameSession);

          // Restore UI state based on recovered data using PartyStateManager
          switch (recoveryResult.recoveredState.gameState) {
            case 'lobby':
              if (recoveryResult.recoveredState.lobbyData) {
                partyStateManager.transitionToLobby(recoveryResult.recoveredState.lobbyData, 'system');
                console.log('🎮 Restored to lobby state with', recoveryResult.recoveredState.lobbyData.currentPlayerCount, 'players');

                // Add system message about recovery
                addSystemMessage(`Lobi oturumu geri yüklendi. Hoş geldiniz!`);
              }
              break;

            case 'tournament':
              if (recoveryResult.recoveredState.tournamentData) {
                partyStateManager.transitionToTournament(recoveryResult.recoveredState.tournamentData, 'system');
                console.log('🎮 Restored to tournament state, round:', recoveryResult.recoveredState.tournamentData.currentRound);

                // Add system message about tournament recovery
                const phase = recoveryResult.recoveredState.currentPhase || 'unknown';
                addSystemMessage(`Turnuva oturumu geri yüklendi. Mevcut faz: ${phase}`);
              }
              break;

            case 'spectator':
              // Handle spectator mode recovery with context
              if (recoveryResult.recoveredState.spectatorContext && recoveryResult.recoveredState.spectatorPlayer) {
                const spectatorState: PartySpectatorState = {
                  tournament: recoveryResult.recoveredState.spectatorContext,
                  spectatorPlayer: recoveryResult.recoveredState.spectatorPlayer,
                  watchingMatchId: null,
                  activeMatches: recoveryResult.recoveredState.activeMatches || [],
                  messages: []
                };
                
                partyStateManager.transitionToSpectator(spectatorState, 'system');
                console.log('🎮 Restored to spectator mode');

                // Add system message about spectator recovery
                addSystemMessage(`İzleyici modu geri yüklendi.`);
              } else {
                // Fallback to menu if spectator data is incomplete
                partyStateManager.transitionToMenu('error_recovery');
                console.log('🎮 Spectator recovery incomplete, falling back to menu');
              }
              break;

            default:
              partyStateManager.transitionToMenu('system');
              console.log('🎮 Restored to menu state');
          }
        } else {
          console.log('🎮 Session recovery failed:', recoveryResult.error);

          // Handle recovery failure with appropriate fallback
          const failureInfo = stateManager.handleRecoveryFailure(recoveryResult.error || 'Unknown error', storedSession);

          if (failureInfo.shouldClearSession) {
            stateManager.clearState();
          }

          partyStateManager.transitionToMenu('error_recovery');

          // Show user-friendly error message
          addSystemMessage(failureInfo.userMessage);
        }
      } else {
        console.log('🎮 No stored session found, starting fresh');
        partyStateManager.transitionToMenu('system');
      }
    };

    initializeSession();

    // Initialize services with party client
    // TODO: Update SyncService and ReconnectionService to support PartyWebSocketClient
    // syncService.initialize(partyWsClient);
    // reconnectionService.initialize(partyWsClient);

    // Set up forfeit handlers IMMEDIATELY
    console.log('🏳️ Setting up forfeit handlers...');
    // REMOVED - Let MultiplayerGame handle opponent forfeit to show statistics
    // partyWsClient.setOnTournamentOpponentForfeited will be handled in MultiplayerGame

    partyWsClient.setOnTournamentForfeitConfirmed((data: any) => {
      console.log('🏳️ *** FORFEIT CONFIRMED - FORFEITER HANDLER ***:', data);
      
      // Add appropriate message
      addSystemMessage('ℹ️ ' + (data.message || 'Turnuvadan ayrıldınız.'));
      
      // Update tournament data if provided
      if (data.tournament) {
        console.log('🏳️ *** UPDATING TOURNAMENT DATA FOR FORFEITER ***:', data.tournament);
        partyStateManager.updateTournament(data.tournament);
      }
      
      // Clear match and return to tournament view
      console.log('🏳️ *** FORCING FORFEITER TO UPDATED TOURNAMENT VIEW ***');
      partyStateManager.clearMatch();
      
      console.log('🏳️ Forfeiter forfeit handling completed');
    });

    // Set up tab conflict event listeners
    window.addEventListener('tab-conflict-spectator', handleTabConflictSpectator as EventListener);
    window.addEventListener('tab-conflict-logout', handleTabConflictLogout as EventListener);

    // Set up reconnection and recovery handlers
    const unsubscribeRecovery = reconnectionService.onRecovery((result) => {
      if (result.success && result.recoveredState) {
        console.log('🔄 Session recovered successfully:', result.recoveredState);

        // Apply recovered state to UI using PartyStateManager
        switch (result.recoveredState.gameSession?.currentState) {
          case 'lobby':
            if (result.recoveredState.lobbyState) {
              partyStateManager.transitionToLobby(result.recoveredState.lobbyState, 'system');
              addSystemMessage('Bağlantı geri yüklendi! Lobi oturumunuz devam ediyor.');
            }
            break;

          case 'tournament':
            if (result.recoveredState.tournamentState) {
              partyStateManager.transitionToTournament(result.recoveredState.tournamentState, 'system');
              addSystemMessage('Bağlantı geri yüklendi! Turnuva oturumunuz devam ediyor.');
            }
            break;

          case 'spectator':
            // Handle spectator recovery
            if (result.recoveredState.spectatorPlayer && result.recoveredState.spectatorContext) {
              const spectatorState: PartySpectatorState = {
                tournament: result.recoveredState.spectatorContext,
                spectatorPlayer: result.recoveredState.spectatorPlayer,
                watchingMatchId: null,
                activeMatches: [],
                messages: []
              };
              partyStateManager.transitionToSpectator(spectatorState, 'system');
              addSystemMessage('Bağlantı geri yüklendi! İzleyici modunuz devam ediyor.');
            }
            break;
        }
      } else if (result.fallbackToMenu) {
        console.log('🔄 Recovery failed, falling back to menu');
        partyStateManager.transitionToMenu('error_recovery');
        setError('Oturum geri yüklenemedi. Ana menüye yönlendiriliyorsunuz.');
      }
    });

    const unsubscribeConnectionState = reconnectionService.onConnectionStateChange((state) => {
      setIsReconnecting(state.isReconnecting);
      setReconnectionState(state);

      if (state.isReconnecting) {
        setError(`Bağlantı kesildi. Yeniden bağlanılıyor... (${state.attemptCount}/${10})`);
      } else if (state.connectionLost && !state.isReconnecting) {
        if (state.lastError?.includes('Max reconnection')) {
          setError('Bağlantı kurulamadı. Lütfen sayfayı yenileyin.');
        }
      }
    });

    // WebSocket connection setup (zorunlu)
    console.log('🎮 Connecting to Party WebSocket server...');

    // Set player ID before connecting
    partyWsClient.setPlayerId(humanPlayer.id);

    partyWsClient.connect();

    // WebSocket event handlers
    partyWsClient.onLobbyCreated((lobbyData) => {
      console.log('🎮 Lobby created via WebSocket:', lobbyData);
      
      // Use PartyStateManager for state transition
      const success = partyStateManager.transitionToLobby(lobbyData, 'server_event');
      
      if (success) {
        addSystemMessage(`Lobi oluşturuldu! Kod: ${lobbyData.code}`);

        // Update session with lobby data
        const updatedSession = userService.updateSession({
          currentState: 'lobby',
          lobbyId: lobbyData.id,
          playerData: lobbyData
        });

        // Save complete state
        if (updatedSession) {
          const currentUser = userService.getCurrentUser();
          if (currentUser) {
            stateManager.saveState(currentUser, updatedSession, {
              lobbyData: lobbyData
            });
          }
        }
      } else {
        console.error('❌ Failed to transition to lobby state');
        setError('Lobi durumuna geçiş başarısız oldu');
      }
    });

    partyWsClient.onLobbyJoined((lobbyData) => {
      console.log('🎮 Lobby joined via WebSocket:', lobbyData);
      
      // Use PartyStateManager for state transition
      const success = partyStateManager.transitionToLobby(lobbyData, 'server_event');
      
      if (success) {
        addSystemMessage(`${lobbyData.code} kodlu lobiye katıldınız!`);

        // Update session with lobby data
        const updatedSession = userService.updateSession({
          currentState: 'lobby',
          lobbyId: lobbyData.id,
          playerData: lobbyData
        });

        // Save complete state
        if (updatedSession) {
          const currentUser = userService.getCurrentUser();
          if (currentUser) {
            stateManager.saveState(currentUser, updatedSession, {
              lobbyData: lobbyData
            });
          }
        }
      } else {
        console.error('❌ Failed to transition to lobby state');
        setError('Lobi durumuna geçiş başarısız oldu');
      }
    });

    // Handle lobby closed
    partyWsClient.setOnLobbyClosed((message: string) => {
      console.log('🗑️ Lobby closed:', message);
      addSystemMessage(message);

      // Return to menu using PartyStateManager
      partyStateManager.transitionToMenu('server_event');
      setMessages([]);

      // Clear session state
      stateManager.clearState();
    });

    // Handle host transfer
    partyWsClient.setOnHostTransferred((data: any) => {
      console.log('👑 Host transferred:', data);
      addSystemMessage(data.message);

      // The lobby update will come separately via onLobbyUpdated
    });

    // Handle being kicked
    partyWsClient.setOnKickedFromLobby((message: string) => {
      console.log('👢 Kicked from lobby - Player ID:', partyWsClient.getPlayerId(), 'Message:', message);
      addSystemMessage(`Lobiden atıldınız: ${message}`);

      // Return to menu using PartyStateManager
      partyStateManager.transitionToMenu('server_event');
      setMessages([]);

      // Clear session state
      stateManager.clearState();
    });

    // Handle tournament match ready - TEMPORARILY DISABLED FOR FORFEIT TESTING
    // This handler causes statistics to be overridden by new match
    // wsClient.setOnTournamentMatchReady((data: any) => {
    //   console.log('🎯 Tournament match ready:', data);
    //   console.log('🔍 Opponent Debug Frontend:', {
    //     humanPlayer: humanPlayer.displayName || humanPlayer.username,
    //     opponentFromServer: data.opponent,
    //     opponentName: data.opponent?.name,
    //     matchId: data.matchId
    //   });
    //   addSystemMessage(data.message);

     //   // Start the match - transition to multiplayer game
    //   setCurrentMatch({
    //     id: data.matchId,
    //     opponent: data.opponent,
    //     round: data.round,
    //     isTournament: true
    //   });
    //   setGameState(PartyGameState.TOURNAMENT); // This will show MultiplayerGame component
    // });

    // Handle tournament round started
    partyWsClient.setOnTournamentRoundStarted((data: any) => {
      console.log('🎯 Tournament round started:', data);
      addSystemMessage(data.message);
      partyStateManager.updateTournament(data.tournament);
    });

    // Handle tournament match completed
    // REMOVED - MultiplayerGame handles tournament match completion
    // partyWsClient.setOnTournamentMatchCompleted is now handled in MultiplayerGame only

    // Handle tournament completed
    partyWsClient.setOnTournamentCompleted(async (data: any) => {
      console.log('🏆 Tournament completed:', data);
      addSystemMessage(data.message);
      partyStateManager.updateTournament(data.tournament);

      // Save tournament results to database
      if (data.tournament && data.tournament.status === 'completed') {
        try {
          const matchRecordingService = getMatchRecordingService();
          
          // Prepare final rankings from tournament data
          const finalRankings = data.tournament.players
            .sort((a: TournamentPlayer, b: TournamentPlayer) => a.currentRank - b.currentRank)
            .map((player: TournamentPlayer) => ({
              playerId: player.id,
              rank: player.currentRank,
              finalScore: player.statistics.totalPoints,
              matchesWon: player.statistics.matchesWon,
              matchesLost: player.statistics.matchesLost,
            }));
          
          // Calculate tournament statistics
          const totalMatches = data.tournament.players.reduce(
            (sum: number, p: TournamentPlayer) => sum + p.statistics.matchesPlayed,
            0
          ) / 2; // Divide by 2 since each match involves 2 players
          
          const totalCooperations = data.tournament.players.reduce(
            (sum: number, p: TournamentPlayer) => sum + (p.statistics.cooperationRate * p.statistics.matchesPlayed),
            0
          );
          
          const totalBetrayals = data.tournament.players.reduce(
            (sum: number, p: TournamentPlayer) => sum + (p.statistics.betrayalRate * p.statistics.matchesPlayed),
            0
          );
          
          const totalDecisions = totalCooperations + totalBetrayals;
          const cooperationRate = totalDecisions > 0 ? totalCooperations / totalDecisions : 0;
          const betrayalRate = totalDecisions > 0 ? totalBetrayals / totalDecisions : 0;
          
          const tournamentDuration = data.tournament.endTime
            ? Math.floor((new Date(data.tournament.endTime).getTime() - new Date(data.tournament.startTime).getTime()) / 1000)
            : 0;
          
          // Find winner (rank 1)
          const winner = data.tournament.players.find((p: TournamentPlayer) => p.currentRank === 1);
          
          await matchRecordingService.saveTournamentResult({
            tournamentId: data.tournament.id,
            winnerId: winner?.id || '',
            finalRankings,
            statistics: {
              totalMatches,
              totalRounds: data.tournament.totalRounds || 0,
              duration: tournamentDuration,
              cooperationRate,
              betrayalRate,
            },
            completedAt: data.tournament.endTime ? new Date(data.tournament.endTime) : new Date(),
          });
          
          console.log('✅ Tournament results saved to database');
        } catch (error) {
          console.error('❌ Failed to save tournament results to database:', error);
          // Don't block UI - error is already queued for retry
        }
      }

      // Show tournament results - clear match only if not in an active match
      // If player is currently in a match, don't clear it yet
      const currentMatch = partyStateManager.getCurrentMatch();
      if (!currentMatch) {
        console.log('🏆 Clearing match state - no active match');
        partyStateManager.clearMatch();
      } else {
        console.log('🏆 Keeping match state - player still in active match:', currentMatch.id);
      }
    });

    // Remove the complex handler, we'll use existing ones

    // Handle tournament forfeit notifications
    partyWsClient.setOnTournamentOpponentForfeited((data: any) => {
      console.log('🏳️ Opponent forfeited:', data);
      addSystemMessage('🏆 ' + (data.message || 'Rakibiniz turnuvadan ayrıldı. Kazandınız!'));
      
      // Update tournament data if provided
      if (data.tournament) {
        console.log('🏳️ Updating tournament data:', data.tournament);
        partyStateManager.updateTournament(data.tournament);
      }
      
      // Clear match and return to tournament view
      console.log('🏳️ Clearing current match and returning to tournament view...');
      partyStateManager.clearMatch();
      
      console.log('🏳️ Forfeit handling completed');
    });

    partyWsClient.setOnTournamentForfeitConfirmed((data: any) => {
      console.log('🏳️ Forfeit confirmed:', data);
      addSystemMessage('ℹ️ ' + (data.message || 'Turnuvadan ayrıldınız.'));
      
      // Update tournament data if provided
      if (data.tournament) {
        partyStateManager.updateTournament(data.tournament);
      }
      
      // Return to tournament view
      partyStateManager.clearMatch();
    });

    partyWsClient.onLobbyUpdated((lobbyData) => {
      console.log('🎮 Lobby updated via WebSocket:', lobbyData);
      
      // Get current state directly from state manager (not from closure)
      const latestPhase = partyStateManager.getCurrentPhase();
      const latestTournamentData = partyStateManager.getCurrentTournament();
      
      console.log('🎮 Current phase:', latestPhase);
      console.log('🎮 Current tournament data exists:', !!latestTournamentData);

      // Check if current player is still in the lobby
      // Try both WebSocket player ID and humanPlayer ID (for compatibility)
      const wsPlayerId = partyWsClient.getPlayerId();
      const dbPlayerId = String(humanPlayer.id);
      
      const currentPlayerInLobby = lobbyData.participants.find((p: any) => 
        p.id === wsPlayerId || p.id === dbPlayerId
      );

      console.log('🔍 Player ID check:', {
        humanPlayerId: humanPlayer.id,
        wsPlayerId,
        dbPlayerId,
        participantIds: lobbyData.participants.map((p: any) => p.id),
        foundInLobby: !!currentPlayerInLobby
      });

      if (!currentPlayerInLobby) {
        // Current player was kicked or left - go back to menu
        console.log('🎮 Current player not in lobby anymore - returning to menu');
        partyStateManager.transitionToMenu('server_event');
        setMessages([]);
        // Don't show message here - KICKED_FROM_LOBBY handler will show appropriate message

        // Clear lobby state from localStorage
        localStorage.removeItem('currentLobby');
        return;
      }

      // Update lobby data using PartyStateManager
      partyStateManager.updateLobby(lobbyData);

      // If we're in tournament mode, stay in tournament mode
      if (latestTournamentData && latestPhase === PartyGamePhase.TOURNAMENT) {
        console.log('🎮 Tournament in progress, staying in tournament view');
        // Don't change game state, just update lobby data
        return;
      }

      // If tournament is not active and lobby status is waiting, go to lobby view
      if (lobbyData.status === 'waiting_for_players' || lobbyData.status === 'ready_to_start') {
        console.log('🎮 Tournament not active, switching to lobby view');
        if (latestPhase !== PartyGamePhase.LOBBY) {
          partyStateManager.transitionToLobby(lobbyData, 'server_event');
        }
      }
    });

    partyWsClient.onLobbyError((error) => {
      console.error('🎮 Lobby error via WebSocket:', error);
      setError(error);
    });

    // Tournament started handler
    partyWsClient.onTournamentStarted((tournamentData) => {
      console.log('🏆 Tournament started!', tournamentData);
      
      // Use PartyStateManager for state transition
      const success = partyStateManager.transitionToTournament(tournamentData, 'server_event');
      
      if (success) {
        // Add appropriate message
        if (tournamentData.message && tournamentData.clearMatch) {
          // This is a forced state (forfeit winner)
          addSystemMessage(tournamentData.message);
        } else {
          // Normal tournament start
          addSystemMessage(tr.system.tournamentStarted);
        }

        // Update session with tournament data
        const updatedSession = userService.updateSession({
          currentState: 'tournament',
          tournamentId: tournamentData.id,
          lobbyId: tournamentData.lobbyId,
          playerData: tournamentData
        });

        // Save complete state
        if (updatedSession) {
          const currentUser = userService.getCurrentUser();
          if (currentUser) {
            stateManager.saveState(currentUser, updatedSession, {
              tournamentData: tournamentData
            });
          }
        }
      } else {
        console.error('❌ Failed to transition to tournament state');
        setError('Turnuva durumuna geçiş başarısız oldu');
      }
    });

    // Tournament tiebreaker handler
    partyWsClient.setOnTournamentTiebreakerStart((data) => {
      console.log('🤝 Tournament tiebreaker starting:', data);
      addSystemMessage(data.message);
    });

    // Tournament match ready handler
    console.log('🏆 Setting up TOURNAMENT_MATCH_READY handler');
    partyWsClient.setOnTournamentMatchReady((matchData) => {
      console.log('🏆 HANDLER CALLED - Tournament match ready:', matchData);
      
      // Get current tournament data from PartyStateManager (not from closure)
      const latestTournamentData = partyStateManager.getCurrentTournament();
      console.log('🏆 Latest tournament data:', latestTournamentData);
      
      // Determine opponent based on player IDs
      const wsPlayerId = partyWsClient.getPlayerId();
      const dbPlayerId = String(humanPlayer.id);
      
      let opponent: TournamentPlayer | undefined;
      
      // Check if current player is player1 or player2
      if (matchData.player1Id === wsPlayerId || matchData.player1Id === dbPlayerId) {
        // Current player is player1, opponent is player2
        opponent = matchData.player2;
      } else if (matchData.player2Id === wsPlayerId || matchData.player2Id === dbPlayerId) {
        // Current player is player2, opponent is player1
        opponent = matchData.player1;
      }
      
      console.log('🏆 Match data processed:', {
        matchId: matchData.matchId,
        wsPlayerId,
        dbPlayerId,
        player1Id: matchData.player1Id,
        player2Id: matchData.player2Id,
        player1: matchData.player1,
        player2: matchData.player2,
        opponent: opponent?.name,
        opponentId: opponent?.id,
        round: matchData.round,
        isMyMatch: !!opponent,
        player1Match: matchData.player1Id === wsPlayerId || matchData.player1Id === dbPlayerId,
        player2Match: matchData.player2Id === wsPlayerId || matchData.player2Id === dbPlayerId
      });
      
      // Only process if this is the current player's match (opponent was found)
      if (!opponent) {
        console.error('❌ Opponent not found! This match is not for current player.', {
          wsPlayerId,
          dbPlayerId,
          player1Id: matchData.player1Id,
          player2Id: matchData.player2Id,
          player1: matchData.player1,
          player2: matchData.player2,
          reason: 'Player ID mismatch - neither player1Id nor player2Id matches current player'
        });
        return;
      }
      
      console.log('✅ Opponent found:', opponent.name);
      
      // Store match data for MultiplayerGame component
      if (!latestTournamentData) {
        console.error('❌ Tournament data not found!');
        setError('Turnuva verisi bulunamadı');
        return;
      }
      
      if (matchData.matchId && opponent) {
        console.log('🏆 Creating active match...');
        const activeMatch: ActiveMatch = {
          id: matchData.matchId,
          tournamentId: latestTournamentData.id,
          roundNumber: matchData.round,
          player1: {
            id: humanPlayer.id,
            name: humanPlayer.displayName || humanPlayer.username,
            isHost: false,
            isEliminated: false,
            currentRank: 0,
            status: PlayerStatus.IN_MATCH,
            statistics: {
              matchesPlayed: 0,
              matchesWon: 0,
              matchesLost: 0,
              totalPoints: 0,
              cooperationRate: 0,
              betrayalRate: 0,
              averageMatchScore: 0,
              headToHeadRecord: new Map(),
              tournamentPoints: 0
            },
            joinedAt: new Date()
          },
          player2: opponent,
          status: 'in_progress' as any,
          startTime: new Date()
        };
        
        console.log('🏆 Active match created:', activeMatch);
        
        // If already in match phase, transition back to tournament first
        const currentPhase = partyStateManager.getCurrentPhase();
        if (currentPhase === 'match') {
          console.log('🏆 Already in match phase, transitioning to tournament first');
          partyStateManager.transitionToTournament(latestTournamentData, 'server_event');
        }
        
        // Use PartyStateManager to transition to match
        const success = partyStateManager.transitionToMatch(activeMatch, 'server_event');
        console.log('🏆 Transition to match result:', success);
        
        // Verify state after transition
        const verifyMatch = partyStateManager.getCurrentMatch();
        const verifyPhase = partyStateManager.getCurrentPhase();
        console.log('🏆 State after transition:', {
          success,
          currentPhase: verifyPhase,
          hasMatch: !!verifyMatch,
          matchId: verifyMatch?.id
        });
        
        if (success) {
          console.log('✅ Transition successful!');
          
          // Add system message
          addSystemMessage(`Turnuva maçınız başlıyor! Rakibiniz: ${opponent.name}`);
          
          // Update session with match data
          const currentUser = userService.getCurrentUser();
          if (currentUser) {
            const updatedSession = userService.updateSession({
              currentState: 'in_game',
              matchId: matchData.matchId,
              opponent: opponent,
              tournamentMatch: true
            });
            
            if (updatedSession) {
              stateManager.saveState(currentUser, updatedSession, {
                currentMatch: activeMatch
              });
            }
          }
          
          console.log('🏆 Match started successfully!');
          
          // Force a re-render to ensure UI updates
          setTimeout(() => {
            const finalCheck = partyStateManager.getCurrentMatch();
            console.log('🏆 Final match check after timeout:', {
              hasMatch: !!finalCheck,
              matchId: finalCheck?.id,
              phase: partyStateManager.getCurrentPhase()
            });
          }, 100);
        } else {
          console.error('❌ Failed to transition to match state');
          console.error('❌ Validation failed - check PartyStateManager.validateMatchData');
          setError('Maç durumuna geçiş başarısız oldu');
        }
      } else {
        console.error('❌ Missing required match data:', {
          hasMatchId: !!matchData.matchId,
          hasOpponent: !!opponent,
          hasTournamentData: !!latestTournamentData,
          player1Id: matchData.player1Id,
          player2Id: matchData.player2Id,
          currentPlayerIds: { wsPlayerId, dbPlayerId }
        });
      }
    });

    partyWsClient.onConnected(() => {
      console.log('🎮 Party WebSocket connected');
      setIsConnected(true);
    });

    partyWsClient.onDisconnected(() => {
      console.log('🎮 Party WebSocket disconnected');
      setIsConnected(false);
    });

    partyWsClient.onError((error) => {
      console.error('🎮 Party WebSocket connection error:', error);
      setError('Sunucuya bağlanılamıyor. WebSocket server çalışıyor mu?');
      setIsConnected(false);
    });

    // Cleanup on unmount
    return () => {
      // Check if this is an intentional leave (page refresh vs explicit action)
      const isIntentional = userService.isIntentionalDisconnection();

      if (!isIntentional && (currentLobby || currentTournamentData)) {
        // This is likely a page refresh or accidental close - preserve session
        console.log('🎮 Accidental disconnection detected, preserving session');

        // Update last activity but don't clear session
        const currentUser = userService.getCurrentUser();
        const currentSession = userService.getCurrentSession();

        if (currentUser && currentSession) {
          // Update session with current state for recovery
          const sessionData: any = {};

          if (currentLobby) {
            sessionData.lobbyData = currentLobby;
          }

          if (currentTournamentData) {
            sessionData.tournamentData = currentTournamentData;
          }

          stateManager.saveState(currentUser, currentSession, sessionData);
        }
      } else if (isIntentional) {
        console.log('🎮 Intentional disconnection detected, session already cleared');
        // Clear the intentional flag since we're handling it
        userService.clearIntentionalLeave();
      }

      // Cleanup subscriptions
      unsubscribeRecovery();
      unsubscribeConnectionState();

      // Cleanup tab conflict listeners
      window.removeEventListener('tab-conflict-spectator', handleTabConflictSpectator as EventListener);
      window.removeEventListener('tab-conflict-logout', handleTabConflictLogout as EventListener);

      // Cleanup services
      reconnectionService.destroy();
      syncService.destroy();
      tabManager.destroy();

      // Disconnect Party WebSocket
      partyWsClient.disconnect();
    };
  }, []);

  // Lobi güncellemelerini dinle
  useEffect(() => {
    if (!currentLobby) return;

    const handleLobbyUpdate = (updatedLobby: IPartyLobby) => {
      console.log('🎮 Lobby updated via callback:', updatedLobby.currentPlayerCount, 'players');
      partyStateManager.updateLobby(updatedLobby);
    };

    // Subscribe to lobby updates
    partyLobbyService.subscribeLobbyUpdates(currentLobby.id, handleLobbyUpdate);

    // Cleanup subscription
    return () => {
      partyLobbyService.unsubscribeLobbyUpdates(currentLobby.id, handleLobbyUpdate);
    };
  }, [currentLobby, partyLobbyService, partyStateManager]);

  // Admin debug panel keyboard shortcut (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();

        // Only show debug panel if user is admin
        if (adminAuthService.isAuthenticated() && adminAuthService.hasPermission('view_debug_panel')) {
          setShowDebugPanel(true);
        } else {
          // Show login prompt for non-authenticated users
          setShowDebugPanel(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [adminAuthService]);

  const handleCreateLobby = async (request: LobbyCreationRequest) => {
    try {
      setError(null);

      // Debug WebSocket connection status
      console.log('🎮 Party WebSocket connection check:', {
        isConnected: partyWsClient.isConnected(),
        isConnectedState: isConnected
      });

      // WebSocket üzerinden lobi oluştur (zorunlu) - use state instead of client method
      if (isConnected) {
        console.log('🎮 Creating lobby via Party WebSocket');
        partyWsClient.createLobby(playerTransformService.userToPlayer(humanPlayer), request.settings);
      } else {
        setError('Sunucuya bağlantı yok. Lütfen sayfayı yenileyin.');
        console.error('WebSocket not connected, cannot create lobby');
      }
    } catch (error) {
      console.error('Failed to create lobby:', error);
      setError('Lobi oluşturulamadı. Lütfen tekrar deneyin.');
    }
  };

  const handleJoinLobby = async (request: LobbyJoinRequest) => {
    try {
      setError(null);

      // WebSocket üzerinden lobiye katıl (zorunlu)
      if (isConnected) {
        console.log('🎮 Joining lobby via Party WebSocket');
        partyWsClient.joinLobby(playerTransformService.userToPlayer(humanPlayer), request.lobbyCode);
      } else {
        setError('Sunucuya bağlantı yok. Lütfen sayfayı yenileyin.');
        console.error('WebSocket not connected, cannot join lobby');
        throw new Error('WebSocket not connected');
      }
    } catch (error: any) {
      console.error('Failed to join lobby:', error);
      // Re-throw the error so PartyModeMenu can handle it with specific error messages
      throw error;
    }
  };

  const handleUpdateSettings = async (settings: any) => {
    if (!currentLobby || !partyWsClient) return;

    try {
      // WebSocket üzerinden ayar güncellemesi gönder
      partyWsClient.send({
        type: 'UPDATE_LOBBY_SETTINGS',
        lobbyId: currentLobby.id,
        settings: settings
      });
      
      addSystemMessage('Turnuva ayarları güncellendi.');
    } catch (error) {
      console.error('Failed to update settings:', error);
      setError('Ayarlar güncellenemedi.');
    }
  };

  const handleKickPlayer = async (playerId: string) => {
    if (!currentLobby) return;

    try {
      // Use WebSocket to kick player
      if (isConnected) {
        console.log('🎮 Kicking player via Party WebSocket:', playerId);
        partyWsClient.kickPlayer(playerId);
      } else {
        setError('Sunucuya bağlantı yok. Lütfen sayfayı yenileyin.');
        console.error('WebSocket not connected, cannot kick player');
      }
    } catch (error) {
      console.error('Failed to kick player:', error);
      setError('Oyuncu atılamadı.');
    }
  };

  const handleTransferHost = async (newHostId: string) => {
    if (!currentLobby) return;

    try {
      const updatedLobby = await partyLobbyService.transferHost(
        currentLobby.id,
        humanPlayer.id,
        newHostId
      );
      partyStateManager.updateLobby(updatedLobby);
      const newHost = updatedLobby.participants.find(p => p.id === newHostId);
      addSystemMessage(`Host yetkisi ${newHost?.name || 'oyuncuya'} devredildi.`);
    } catch (error) {
      console.error('Failed to transfer host:', error);
      setError('Host yetkisi devredilemedi.');
    }
  };

  const handleCloseLobby = async () => {
    if (!currentLobby) return;

    try {
      await partyLobbyService.closeLobby(currentLobby.id, humanPlayer.id);
      partyStateManager.transitionToMenu('user_action');
      setMessages([]);
      addSystemMessage('Lobi kapatıldı.');
    } catch (error) {
      console.error('Failed to close lobby:', error);
      setError('Lobi kapatılamadı.');
    }
  };

  const handleStartTournament = async () => {
    if (!currentLobby) return;

    try {
      // Use WebSocket to start tournament
      if (isConnected) {
        console.log('🎮 Starting tournament via Party WebSocket, lobbyId:', currentLobby.id);
        console.log('🎮 Party WebSocket connected:', partyWsClient.isConnected());
        partyWsClient.startTournament(currentLobby.id);
      } else {
        setError('Sunucuya bağlantı yok. Lütfen sayfayı yenileyin.');
        console.error('WebSocket not connected, cannot start tournament');
      }
    } catch (error) {
      console.error('Failed to start tournament:', error);
      setError('Turnuva başlatılamadı.');
    }
  };

  const handleLeaveLobby = async () => {
    if (!currentLobby) return;

    try {
      console.log('🎮 Explicit leave lobby initiated');

      // Mark as intentional leave
      userService.markIntentionalLeave();

      // Use WebSocket to leave lobby explicitly
      if (isConnected) {
        console.log('🎮 Leaving lobby via Party WebSocket (explicit)');
        partyWsClient.leaveLobby(currentLobby.code);
      } else {
        console.log('🎮 WebSocket not connected, leaving lobby locally');
      }

      // Clear lobby session data but preserve user identity
      userService.leaveLobby();
      stateManager.clearLobbyState();

      // Use PartyStateManager to transition to menu
      partyStateManager.transitionToMenu('user_action');
      setMessages([]);

      // Add system message
      addSystemMessage('Lobiden ayrıldınız.');

      console.log('🎮 Explicit leave lobby completed');
    } catch (error) {
      console.error('Failed to leave lobby:', error);
      // Still navigate back even if there's an error
      partyStateManager.transitionToMenu('error_recovery');
      setMessages([]);

      // Clear session even on error
      userService.leaveLobby();
      stateManager.clearLobbyState();
    }
  };

  // New function for explicit logout
  const handleExplicitLogout = async () => {
    try {
      console.log('🎮 Explicit logout initiated');

      // Mark as intentional disconnect
      userService.markIntentionalLeave();

      // Leave current lobby/tournament if in one
      if (currentLobby) {
        if (isConnected) {
          partyWsClient.explicitLeaveLobby(currentLobby.id);
        }
      }

      if (currentTournamentData) {
        if (isConnected) {
          partyWsClient.explicitLeaveTournament(currentTournamentData.id);
        }
      }

      // Disconnect WebSocket intentionally
      partyWsClient.intentionalDisconnect();

      // Clear all session data
      userService.explicitLogout();
      stateManager.clearAllData();

      // Reset UI state using PartyStateManager
      partyStateManager.clearAll();
      setMessages([]);

      // Navigate back to main game
      onGameEnd();

      console.log('🎮 Explicit logout completed');
    } catch (error) {
      console.error('Failed to logout:', error);
      // Force logout even on error
      userService.explicitLogout();
      stateManager.clearAllData();
      partyStateManager.clearAll();
      onGameEnd();
    }
  };

  // New function for leaving tournament
  const handleLeaveTournament = async () => {
    if (!currentTournamentData) return;

    try {
      console.log('🎮 Explicit leave tournament initiated');

      // Mark as intentional leave
      userService.markIntentionalLeave();

      // Use WebSocket to leave tournament explicitly
      if (isConnected) {
        console.log('🎮 Leaving tournament via Party WebSocket (explicit)');
        partyWsClient.explicitLeaveTournament(currentTournamentData.id);
      } else {
        console.log('🎮 WebSocket not connected, leaving tournament locally');
      }

      // Clear tournament session data but preserve user identity
      userService.leaveLobby(); // This sets state to menu
      stateManager.clearTournamentState();

      // Use PartyStateManager to transition to menu
      partyStateManager.transitionToMenu('user_action');
      setMessages([]);

      // Add system message
      addSystemMessage('Turnuvadan ayrıldınız.');

      console.log('🎮 Explicit leave tournament completed');
    } catch (error) {
      console.error('Failed to leave tournament:', error);
      // Still navigate back even if there's an error
      partyStateManager.transitionToMenu('error_recovery');
      setMessages([]);

      // Clear session even on error
      userService.leaveLobby();
      stateManager.clearTournamentState();
    }
  };

  const handleSendMessage = (message: string) => {
    if (!currentLobby) return;

    // Add message to local state (in real implementation, this would go through WebSocket)
    const chatMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      lobbyId: currentLobby.id,
      senderId: humanPlayer.id,
      senderName: humanPlayer.displayName || humanPlayer.username,
      message,
      timestamp: new Date(),
      type: 'player_message' as any
    };

    setMessages(prev => [...prev, chatMessage]);
  };

  const addSystemMessage = (message: string) => {
    const systemMessage: ChatMessage = {
      id: `sys_${Date.now()}`,
      lobbyId: currentLobby?.id || '',
      senderId: 'system',
      senderName: 'Sistem',
      message,
      timestamp: new Date(),
      type: 'system_message' as any
    };

    setMessages(prev => [...prev, systemMessage]);
  };

  // Spectator mode handlers
  const handlePlayerEliminated = (tournament: Tournament, eliminatedPlayer: TournamentPlayer) => {
    // Check if the current player was eliminated
    const actualPlayerId = partyWsClient.getPlayerId() || humanPlayer.id;
    if (eliminatedPlayer.id === actualPlayerId) {
      // Add player as spectator
      spectatorService.addSpectator(tournament.id, eliminatedPlayer);

      // Load spectator messages
      const messages = spectatorService.getSpectatorMessages(tournament.id);

      // Create spectator state
      const spectatorState: PartySpectatorState = {
        tournament: tournament,
        spectatorPlayer: eliminatedPlayer,
        watchingMatchId: null,
        activeMatches: [],
        messages: messages
      };

      // Use PartyStateManager to transition to spectator mode
      partyStateManager.transitionToSpectator(spectatorState, 'server_event');
    }
  };

  const handleSelectMatch = (matchId: string) => {
    const spectatorState = partyStateManager.getSpectatorState();
    
    if (spectatorState) {
      spectatorService.startWatchingMatch(spectatorState.spectatorPlayer.id, matchId);
      
      // Update spectator state with selected match
      const updatedState: PartySpectatorState = {
        ...spectatorState,
        watchingMatchId: matchId
      };
      partyStateManager.transitionToSpectator(updatedState, 'user_action');
    }
  };

  const handleSendSpectatorMessage = (message: string) => {
    const spectatorState = partyStateManager.getSpectatorState();
    
    if (spectatorState) {
      const chatMessage = spectatorService.sendSpectatorMessage(
        spectatorState.tournament.id,
        spectatorState.spectatorPlayer.id,
        message
      );

      if (chatMessage) {
        // Update spectator state with new message
        const updatedState: PartySpectatorState = {
          ...spectatorState,
          messages: [...spectatorState.messages, chatMessage]
        };
        partyStateManager.transitionToSpectator(updatedState, 'user_action');
      }
    }
  };

  const handleLeaveSpectator = () => {
    const spectatorState = partyStateManager.getSpectatorState();
    
    if (spectatorState) {
      spectatorService.removeSpectator(
        spectatorState.tournament.id,
        spectatorState.spectatorPlayer.id
      );
    }

    // Use PartyStateManager to return to menu
    partyStateManager.transitionToMenu('user_action');
  };

  // Mock function to simulate tournament progression and player elimination
  const simulatePlayerElimination = () => {
    if (currentLobby) {
      // Create mock tournament
      const mockTournament: Tournament = {
        id: `tournament_${currentLobby.id}`,
        lobbyId: currentLobby.id,
        format: currentLobby.settings.tournamentFormat,
        players: currentLobby.participants,
        bracket: {
          rounds: [],
          eliminatedPlayers: [],
          activeMatches: new Map(),
          nextMatchPairings: []
        },
        currentRound: 1,
        totalRounds: 3,
        status: 'in_progress' as any,
        startTime: new Date()
      };

      // Create mock eliminated player
      const actualCurrentPlayerId = partyWsClient.getPlayerId() || humanPlayer.id;
      const eliminatedPlayer: TournamentPlayer = {
        ...currentLobby.participants.find(p => p.id === actualCurrentPlayerId)!,
        status: PlayerStatus.ELIMINATED,
        isEliminated: true
      };

      // Create mock active matches
      const mockMatches: ActiveMatch[] = [
        {
          id: 'match_1',
          tournamentId: mockTournament.id,
          roundNumber: 1,
          player1: currentLobby.participants[0],
          player2: currentLobby.participants[1],
          status: 'in_progress' as any,
          startTime: new Date()
        }
      ];

      // Create spectator state and transition
      const spectatorState: PartySpectatorState = {
        tournament: mockTournament,
        spectatorPlayer: eliminatedPlayer,
        watchingMatchId: null,
        activeMatches: mockMatches,
        messages: []
      };
      
      partyStateManager.transitionToSpectator(spectatorState, 'system');
    }
  };

  const handleBackToMenu = () => {
    console.log('🏳️ handleBackToMenu called');
    console.log('🏳️ Current phase:', currentPhase);
    console.log('🏳️ Current state:', { 
      currentLobby: !!currentLobby, 
      currentTournamentData: !!currentTournamentData,
      currentMatch: !!currentMatch 
    });
    
    // If in tournament, DON'T go back to main menu
    if (currentTournamentData || currentPhase === PartyGamePhase.TOURNAMENT) {
      console.log('🏳️ *** TOURNAMENT ACTIVE - NOT GOING TO MAIN MENU ***');
      // Stay in tournament, just clear match if any
      partyStateManager.clearMatch();
      return;
    }
    
    if (currentLobby) {
      handleLeaveLobby();
    } else {
      console.log('🏳️ Going to main menu via onGameEnd');
      onGameEnd();
    }
  };

  const renderCurrentView = () => {
    switch (currentPhase) {
      case PartyGamePhase.MENU:
        return (
          <PartyModeMenu
            onCreateLobby={handleCreateLobby}
            onJoinLobby={handleJoinLobby}
            onBack={onGameEnd}
            playerName={humanPlayer.displayName || humanPlayer.username}
            playerId={humanPlayer.id}
          />
        );

      case PartyGamePhase.LOBBY:
        if (!currentLobby) {
          return <div>Lobi yükleniyor...</div>;
        }

        // Ensure lobby has required properties
        const safeCurrentLobby = {
          ...currentLobby,
          participants: currentLobby.participants || [],
          hostPlayerId: currentLobby.hostPlayerId || humanPlayer.id,
          settings: currentLobby.settings || {
            maxPlayers: 8,
            roundCount: 10,
            tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
            allowSpectators: true,
            chatEnabled: true,
            autoStartWhenFull: false
          }
        };

        // Debug player ID for PartyLobby
        const partyWsPlayerId = partyWsClient?.getPlayerId?.();
        const finalPlayerId = partyWsPlayerId || humanPlayer.id;
        console.log('🔍 PartyGame Player ID Debug:', {
          humanPlayerId: humanPlayer.id,
          partyWsPlayerId: partyWsPlayerId,
          finalPlayerId: finalPlayerId,
          hostPlayerId: safeCurrentLobby.hostPlayerId
        });

        return (
          <PartyLobby
            lobby={safeCurrentLobby}
            currentPlayerId={finalPlayerId}
            wsClient={partyWsClient}
            onUpdateSettings={handleUpdateSettings}
            onKickPlayer={handleKickPlayer}
            onTransferHost={handleTransferHost}
            onStartTournament={handleStartTournament}
            onLeaveLobby={handleLeaveLobby}
            onCloseLobby={handleCloseLobby}
            onSendMessage={handleSendMessage}
            messages={messages}
            isConnected={isConnected}
            isReconnecting={isReconnecting}
            lastSyncTime={new Date()}
          />
        );

      case PartyGamePhase.TOURNAMENT:
      case PartyGamePhase.MATCH:
        if (!currentTournamentData) {
          return <div>{tr.tournament.loading}</div>;
        }

        console.log('🏳️ Tournament render - currentMatch:', currentMatch);
        console.log('🏳️ Tournament render - currentPhase:', currentPhase);
        console.log('🏳️ Tournament status:', currentTournamentData?.status);
        console.log('🏳️ Tournament render - match details:', {
          hasMatch: !!currentMatch,
          matchId: currentMatch?.id,
          phase: currentPhase,
          tournamentStatus: currentTournamentData?.status
        });

        // If tournament is completed, show results
        if (currentTournamentData?.status === 'completed') {
          const winner = currentTournamentData.players.find((p: TournamentPlayer) => p.currentRank === 1);
          // Try to find player by ID first, then by name as fallback
          const myPlayer = currentTournamentData.players.find((p: TournamentPlayer) => 
            p.id === humanPlayer.id || 
            p.id === String(humanPlayer.id) ||
            p.name === humanPlayer.displayName ||
            p.name === humanPlayer.username
          );
          
          return (
            <div className="tournament-results-screen">
              <div className="results-card">
                <h1>🏆 Turnuva Tamamlandı!</h1>
                
                <div className="winner-section">
                  <h2>👑 Kazanan</h2>
                  <div className="winner-card">
                    <div className="winner-name">{winner?.name || 'Unknown'}</div>
                    <div className="winner-stats">
                      <span>🏅 Toplam Puan: {winner?.statistics.totalPoints || 0}</span>
                      <span>✅ Kazanılan Maçlar: {winner?.statistics.matchesWon || 0}</span>
                      <span>🤝 İşbirliği Oranı: {Math.round((winner?.statistics.cooperationRate || 0) * 100)}%</span>
                    </div>
                  </div>
                </div>

                <div className="rankings-section">
                  <h2>📊 Final Sıralaması</h2>
                  <div className="rankings-list">
                    {currentTournamentData.players
                      .sort((a: TournamentPlayer, b: TournamentPlayer) => a.currentRank - b.currentRank)
                      .map((player: TournamentPlayer, index: number) => {
                        const isMyPlayer = player.id === humanPlayer.id || 
                                          player.id === String(humanPlayer.id) ||
                                          player.name === humanPlayer.displayName ||
                                          player.name === humanPlayer.username;
                        return (
                        <div 
                          key={player.id} 
                          className={`ranking-item ${isMyPlayer ? 'my-rank' : ''} ${index === 0 ? 'first-place' : ''}`}
                        >
                          <div className="rank-number">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${player.currentRank}`}
                          </div>
                          <div className="player-info">
                            <div className="player-name">{player.name}</div>
                            <div className="player-stats-row">
                              <span>Puan: {player.statistics.totalPoints}</span>
                              <span>Maçlar: {player.statistics.matchesWon}K-{player.statistics.matchesLost}M</span>
                              <span>İşbirliği: {Math.round((player.statistics.cooperationRate || 0) * 100)}%</span>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                  </div>
                </div>

                {myPlayer && (
                  <div className="my-performance">
                    <h3>📈 Sizin Performansınız</h3>
                    <div className="performance-grid">
                      <div className="stat-box">
                        <div className="stat-label">Sıralama</div>
                        <div className="stat-value">#{myPlayer.currentRank}</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-label">Toplam Puan</div>
                        <div className="stat-value">{myPlayer.statistics.totalPoints}</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-label">Kazanılan Maçlar</div>
                        <div className="stat-value">{myPlayer.statistics.matchesWon}</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-label">İşbirliği Oranı</div>
                        <div className="stat-value">{Math.round((myPlayer.statistics.cooperationRate || 0) * 100)}%</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="results-actions">
                  <button onClick={handleBackToMenu} className="back-to-menu-btn">
                    Ana Menüye Dön
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // If there's an active match, show MultiplayerGame
        if (currentMatch) {
          console.log('🏳️ Showing MultiplayerGame for match:', currentMatch.id);
          return (
            <TournamentMatchGame
              key={currentMatch.id}
              humanPlayer={humanPlayer}
              opponent={{
                id: currentMatch.player2.id,
                name: currentMatch.player2.name,
                isAI: false,
                trustScore: 50,
                totalGamesPlayed: currentMatch.player2.statistics.matchesPlayed,
                createdAt: currentMatch.player2.joinedAt
              }}
              matchId={currentMatch.id}
              tournamentId={currentTournamentData.id}
              tournamentRoundNumber={currentMatch.roundNumber}
              maxRounds={(currentTournamentData as any).settings?.roundCount || (currentMatch as any).maxRounds || 10}
              partyWsClient={partyWsClient}
              onMatchEnd={(result?: 'normal' | 'forfeit') => {
                console.log('🏳️ *** TOURNAMENT GAME END ***', result);
                
                // Check if this is a forfeit (player quit during game)
                if (result === 'forfeit') {
                  console.log('🏳️ *** FORFEIT DETECTED - DIRECT TOURNAMENT VIEW ***');
                  
                  // Clear match and go to tournament view immediately
                  partyStateManager.clearMatch();
                  
                  // Add forfeit message
                  addSystemMessage('ℹ️ Turnuvadan ayrıldınız.');
                  
                  console.log('🏳️ *** FORFEIT COMPLETED - IN TOURNAMENT VIEW ***');
                } else {
                  console.log('🏳️ *** NORMAL GAME END - RETURN TO TOURNAMENT ***');
                  // Normal game end - return to tournament
                  partyStateManager.clearMatch();
                }
              }}
            />
          );
        }

        return (
          <div className="tournament-view">
            <div className="tournament-header">
              <h2>🏆 {tr.tournament.started}</h2>
              <div className="tournament-info">
                <span>{tr.tournament.format}: {tr.tournament.formats[currentTournamentData.format] || currentTournamentData.format}</span>
                <span>{tr.tournament.players}: {currentTournamentData.players?.length || 0}</span>
                <span>{tr.tournament.round}: {currentTournamentData.currentRound + 1}/{currentTournamentData.bracket?.rounds?.length || 1}</span>
              </div>
            </div>

            <div className="tournament-content">
              <div className="players-list">
                <h3>{tr.tournament.participants}</h3>
                <div className="players-grid">
                  {currentTournamentData.players?.map((player, index) => (
                    <div key={player.id} className={`player-card ${player.id === humanPlayer.id ? 'current-player' : ''}`}>
                      <div className="player-name">{player.name}</div>
                      <div className="player-status">{tr.tournament.playerStatus[player.status] || player.status}</div>
                      {player.isHost && <span className="host-badge">{tr.tournament.host}</span>}
                    </div>
                  )) || []}
                </div>
              </div>

              <div className="tournament-bracket">
                <h3>{tr.tournament.bracket}</h3>
                {currentTournamentData.bracket && currentTournamentData.bracket.rounds && currentTournamentData.bracket.rounds.length > 0 ? (
                  <div className="bracket-container">
                    {currentTournamentData.bracket.rounds.map((round, roundIndex) => (
                      <div key={roundIndex} className="bracket-round">
                        <h4>Tur {roundIndex + 1}</h4>
                        <div className="bracket-matches">
                          {round.matches.map((match, matchIndex) => {
                            const player1 = currentTournamentData.players.find(p => p.id === match.player1Id);
                            const player2 = currentTournamentData.players.find(p => p.id === match.player2Id);
                            const winnerId = match.result?.winnerId;

                            return (
                              <div key={matchIndex} className={`bracket-match ${match.status}`}>
                                <div className="match-players">
                                  <div className={`match-player ${winnerId === match.player1Id ? 'winner' : ''}`}>
                                    <span className="player-name">{player1?.name || 'TBD'}</span>
                                    {winnerId === match.player1Id && <span className="winner-icon">👑</span>}
                                  </div>
                                  <div className="match-vs">VS</div>
                                  <div className={`match-player ${winnerId === match.player2Id ? 'winner' : ''}`}>
                                    <span className="player-name">{player2?.name || 'TBD'}</span>
                                    {winnerId === match.player2Id && <span className="winner-icon">👑</span>}
                                  </div>
                                </div>
                                <div className="match-status">
                                  {match.status === 'scheduled' && '⏳ Bekliyor'}
                                  {match.status === 'in_progress' && '🎮 Devam Ediyor'}
                                  {match.status === 'completed' && '✅ Tamamlandı'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>{tr.tournament.messages.systemActive}</p>
                )}</div>
            </div>

            <div className="tournament-actions">
              <button onClick={handleBackToMenu} className="back-btn">
                {tr.tournament.backToMenu}
              </button>
            </div>
          </div>
        );

      case PartyGamePhase.SPECTATOR:
        if (!spectatorState) {
          return <div>Spectator mode loading...</div>;
        }

        return (
          <SpectatorMode
            tournament={spectatorState.tournament}
            spectatorPlayer={spectatorState.spectatorPlayer}
            activeMatches={spectatorState.activeMatches}
            onSelectMatch={handleSelectMatch}
            onSendSpectatorMessage={handleSendSpectatorMessage}
            spectatorMessages={spectatorState.messages}
            onLeaveSpectator={handleLeaveSpectator}
          />
        );

      default:
        return null;
    }
  };

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className={`party-game ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      {/* Admin indicator for authenticated users */}
      {adminAuthService.isAuthenticated() && (
        <div className="admin-indicator">
          🔐 Admin: {adminAuthService.getCurrentUser()?.username} |
          <button
            onClick={() => setShowDebugPanel(true)}
            className="admin-debug-btn"
          >
            Debug Panel
          </button> |
          <span className="admin-shortcut">Ctrl+Shift+D</span>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {tabConflictMessage && (
        <div className="tab-conflict-banner">
          <span>🔖 {tabConflictMessage}</span>
          <button onClick={() => setTabConflictMessage(null)}>✕</button>
        </div>
      )}

      {isReconnecting && (
        <div className="reconnection-banner">
          <div className="reconnection-content">
            <div className="spinner"></div>
            <span>
              Bağlantı yeniden kuruluyor...
              {reconnectionState && (
                <span className="attempt-info">
                  ({reconnectionState.attemptCount}/10)
                </span>
              )}
            </span>
            <button
              onClick={() => reconnectionService.forceReconnect()}
              className="retry-btn"
            >
              Şimdi Dene
            </button>
          </div>
        </div>
      )}

      {/* Recovery Loading Overlay */}
      {isReconnecting && reconnectionState && (
        <div className="recovery-overlay">
          <div className="recovery-content">
            <div className="recovery-spinner"></div>
            <h3>Oturum Geri Yükleniyor</h3>
            <p>
              Bağlantı yeniden kuruluyor ve oyun durumunuz geri yükleniyor...
            </p>
            <div className="recovery-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min((reconnectionState.attemptCount / 10) * 100, 100)}%`
                  }}
                ></div>
              </div>
              <span className="progress-text">
                Deneme {reconnectionState.attemptCount}/10
              </span>
            </div>
          </div>
        </div>
      )}

      {renderCurrentView()}

      {/* Admin Debug Panel - Ctrl+Shift+D to open */}
      <DebugPanel
        isOpen={showDebugPanel}
        onClose={() => setShowDebugPanel(false)}
      />
    </div>
  );
};

export default PartyGame;