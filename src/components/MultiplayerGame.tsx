import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Player,
  GameSession,
  Decision,
  GamePhase,
  GameMode,
  PlayerDecision,
} from '../types';
import { User } from '../services/UserService';
import { useViewportSize } from '../hooks';
import { MultiplayerGameBoard } from './MultiplayerGameBoard';
import AtmosphericEffects from './AtmosphericEffects';
import StatisticsPanel from './StatisticsPanel';
import MultiplayerModeSelector, { MultiplayerMode } from './MultiplayerModeSelector';

import { useTranslation } from '../hooks/useTranslation';
import {
  WebSocketGameClient,
  MatchFoundData,
  QueueStatusData,
} from '../services/WebSocketGameClient';
import { getServerUserService } from '../services/ServerUserService';
import './MultiplayerGame.css';

interface MultiplayerGameProps {
  humanPlayer: User;
  onGameEnd: (gameEndType?: string) => void;
  tournamentContext?: {
    tournamentId: string;
    matchId: string;
    roundNumber: number;
    isEliminationMatch: boolean;
    opponent?: Player;
    onMatchComplete?: (result: any) => void;
  };
}

enum MultiplayerState {
  MODE_SELECTION = 'mode_selection',
  CONNECTING = 'connecting',
  LOBBY = 'lobby',
  MATCHMAKING = 'matchmaking',
  WAITING_FOR_OPPONENT = 'waiting_for_opponent',
  IN_GAME = 'in_game',
  DECISION_REVERSAL = 'decision_reversal',
  ROUND_SELECTION = 'round_selection',
  DECISION_SELECTION = 'decision_selection',
  STATISTICS = 'statistics',
}

export const MultiplayerGame: React.FC<MultiplayerGameProps> = ({
  humanPlayer,
  onGameEnd,
  tournamentContext,
}) => {
  const { t } = useTranslation();

  // Convert User to Player for game session
  const userToPlayer = (user: User): Player => ({
    id: user.id,
    name: user.displayName || user.username,
    isAI: false,
    trustScore: user.stats?.trustScore || 50,
    totalGamesPlayed: user.stats?.totalGames || 0,
    createdAt: user.createdAt,
  });

  const [multiplayerState, setMultiplayerState] = useState<MultiplayerState>(
    tournamentContext ? MultiplayerState.IN_GAME : MultiplayerState.MODE_SELECTION
  );
  
  const [selectedMode, setSelectedMode] = useState<MultiplayerMode | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);

  const [currentSession, setCurrentSession] = useState<GameSession | null>(
    null
  );
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [communicationMessages, setCommunicationMessages] = useState<
    Array<{ playerId: string; message: string; timestamp: Date }>
  >([]);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [queueSize, setQueueSize] = useState<number>(0);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [gameStatistics, setGameStatistics] = useState<any>(null);

  const [selectedRoundForReversal, setSelectedRoundForReversal] = useState<
    number | null
  >(null);
  const [timerSync, setTimerSync] = useState<{
    round: number;
    duration: number;
  } | null>(null);
  const [reversalResponseStatus, setReversalResponseStatus] = useState<{
    playerResponded: boolean;
    opponentResponded: boolean;
    waitingForOpponent: boolean;
  }>({
    playerResponded: false,
    opponentResponded: false,
    waitingForOpponent: false,
  });
  const [reversalRejectionMessage, setReversalRejectionMessage] = useState<string | null>(null);
  const [reversalSelectionMessage, setReversalSelectionMessage] = useState<string | null>(null);
  const [reversalTimeLeft, setReversalTimeLeft] = useState<number>(60);

  const wsClient = useRef<WebSocketGameClient | null>(null);
  const currentStateRef = useRef<MultiplayerState>(multiplayerState);
  const currentMatchIdRef = useRef<string | null>(currentMatchId);

  // Update refs whenever state changes
  useEffect(() => {
    currentStateRef.current = multiplayerState;
  }, [multiplayerState]);

  useEffect(() => {
    currentMatchIdRef.current = currentMatchId;
  }, [currentMatchId]);

  // Initialize WebSocket connection
  useEffect(() => {
    // DON'T create WebSocket client on mount for normal multiplayer
    // It will be created when mode is selected
    if (!tournamentContext) {
      console.log('🎮 Multiplayer mode: WebSocket will be created when mode is selected');
      return;
    }

    // Only for tournament matches: create and connect immediately
    console.log('🏆 Tournament mode: Creating WebSocket client');
    const serverUserService = getServerUserService();
    const sessionToken = serverUserService.getSessionToken();
    
    wsClient.current = new WebSocketGameClient();
    
    if (tournamentContext) {
      console.log('🏆 Tournament match detected:', tournamentContext);
      setCurrentMatchId(tournamentContext.matchId);
      setMultiplayerState(MultiplayerState.IN_GAME);
      
      // Set opponent if provided
      if (tournamentContext.opponent) {
        setOpponent(tournamentContext.opponent);
        console.log('🏆 Tournament opponent set:', tournamentContext.opponent.name);
        
        // Create game session immediately for tournament match
        const player = userToPlayer(humanPlayer);
        const sessionConfig = {
          gameMode: GameMode.PARTY,
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 30,
          allowDecisionReversal: true,
          aiStrategy: undefined,
        };

        const newSession: GameSession = {
          id: tournamentContext.matchId,
          players: [player, tournamentContext.opponent],
          rounds: [],
          currentPhase: GamePhase.TRUST_PHASE,
          startTime: new Date(),
          sessionConfig,
          tournamentContext: {
            tournamentId: tournamentContext.tournamentId,
            matchId: tournamentContext.matchId,
            roundNumber: tournamentContext.roundNumber,
            isEliminationMatch: tournamentContext.isEliminationMatch,
          },
        };

        setCurrentSession(newSession);
        console.log('🏆 Tournament session created:', newSession.id);
      }
    }

    // Set player ID FIRST for tournament matches (before connecting)
    if (tournamentContext) {
      const playerIdForServer = String(humanPlayer.id);
      wsClient.current.setPlayerId(playerIdForServer);
      console.log('🏆 Player ID set for tournament match:', playerIdForServer);
    }
    
    // DON'T set session token here - it will be set when connect() is called
    // Session token is stored and will be retrieved by BaseWebSocketClient.connect()
    console.log('🔍 Session token available:', sessionToken ? 'YES' : 'NO');

    // Set up event handlers
    wsClient.current.onConnected(() => {
      console.log('🎮 Connected to game server');
      console.log('Current state when connected:', currentStateRef.current);

      // Clear connection error
      setConnectionError(null);

      // If we were in a game and got disconnected, try to rejoin
      if (currentMatchIdRef.current && currentStateRef.current === MultiplayerState.IN_GAME) {
        console.log('🔄 Reconnected during game, staying in game state');
        // Stay in current state, connection is restored
      } else if (tournamentContext) {
        setMultiplayerState(MultiplayerState.LOBBY);
      } else if (currentStateRef.current === MultiplayerState.CONNECTING) {
        console.log('🔄 Connected while in CONNECTING state, transitioning to LOBBY');
        setMultiplayerState(MultiplayerState.LOBBY);
      } else {
        // No mode selected yet - go to mode selection
        console.log('📋 No mode selected - showing mode selection');
        setMultiplayerState(MultiplayerState.MODE_SELECTION);
      }
    });

    wsClient.current.onDisconnected(() => {
      console.log('🔌 Disconnected from game server');
      console.log('Current state when disconnected:', currentStateRef.current);

      // If we're in a game, show connection error instead of going to connecting
      if (currentStateRef.current === MultiplayerState.IN_GAME) {
        setConnectionError('Bağlantı kesildi. Yeniden bağlanmaya çalışılıyor...');
      } else {
        setMultiplayerState(MultiplayerState.CONNECTING);
      }
    });

    wsClient.current.onMatchFound((data: MatchFoundData) => {
      console.log('🎯 Match found!', data);
      setCurrentMatchId(data.matchId);
      setOpponent(data.opponent);
      createMatch(data.opponent);
    });

    // Tournament match events are handled by PartyGame/TournamentMatchGame components
    // MultiplayerGame only handles standard multiplayer matches

    wsClient.current.onQueueStatus((data: QueueStatusData) => {
      setQueuePosition(data.position);
      setQueueSize(data.queueSize);
    });

    wsClient.current.onOpponentDecision((decision: string, round: number) => {
      // Handle opponent decision in game (no console log for security)
    });

    wsClient.current.onOpponentMessage((message: string, timestamp: number) => {
      setCommunicationMessages((prev) => [
        ...prev,
        {
          playerId: 'opponent',
          message: message,
          timestamp: new Date(timestamp),
        },
      ]);
    });

    wsClient.current.onOpponentDisconnected(() => {
      console.log('❌ Opponent disconnected');
      
      // Tournament match'lerde opponent disconnect'i farklı işle
      if (tournamentContext) {
        console.log('🏳️ Opponent disconnected in tournament match - waiting for server decision');
        setConnectionError('Rakibiniz bağlantısı kesildi. Sunucu kararını bekliyor...');
        // Server will send TOURNAMENT_OPPONENT_FORFEITED or reconnection message
        // Don't automatically return to lobby
        return;
      }
      
      // Normal multiplayer match - wait for server to send SHOW_STATISTICS with forfeit
      console.log('❌ Opponent disconnected in normal match - waiting for server statistics');
      setConnectionError('Rakibiniz bağlantısı kesildi. Yeniden bağlanması bekleniyor...');
      // Don't return to lobby immediately - server will send SHOW_STATISTICS after timeout
    });

    // Handle SHOW_STATISTICS from server (includes forfeit)
    wsClient.current.onShowStatistics((data: any) => {
      console.log('📊 *** SHOW_STATISTICS RECEIVED ***:', data);
      
      // Check if this is an immediate forfeit (player quit voluntarily)
      if (data.immediate && data.forfeit) {
        console.log('🏳️ *** IMMEDIATE FORFEIT - OPPONENT QUIT ***');
        
        // Clear connection error message
        setConnectionError(null);
        
        // Show statistics immediately without waiting message
        const forfeitStats = {
          finalScores: data.scores || { player1: 0, player2: 0 },
          updatedDecisions: data.updatedDecisions || {},
          gameEndReason: 'opponent_forfeit',
          isWinner: true
        };
        
        setGameStatistics(forfeitStats);
        setMultiplayerState(MultiplayerState.STATISTICS);
        return;
      }
      
      if (data.forfeit && tournamentContext) {
        console.log('🏳️ *** FORFEIT STATISTICS FROM SERVER ***');
        
        // Use server-provided statistics
        const forfeitStats = {
          finalScores: data.scores || { player1: 30, player2: 0 },
          updatedDecisions: data.updatedDecisions || {},
          gameEndReason: 'opponent_forfeit',
          isWinner: true
        };
        
        console.log('🏳️ Forfeit stats from server:', forfeitStats);
        setGameStatistics(forfeitStats);
        setMultiplayerState(MultiplayerState.STATISTICS);
      } else {
        // Normal statistics
        console.log('📊 Normal statistics from server');
        const stats = {
          finalScores: data.scores || { player1: 0, player2: 0 },
          updatedDecisions: data.updatedDecisions,
          gameEndReason: data.forfeit ? 'opponent_forfeit' : 'normal'
        };
        setGameStatistics(stats);
        setMultiplayerState(MultiplayerState.STATISTICS);
      }
    });

    // Tournament opponent forfeit is handled by TournamentMatchGame component
    // MultiplayerGame only handles standard multiplayer forfeits
    
    // Note: Tournament-specific events should not be handled here
    // They are managed by PartyGame/TournamentMatchGame components

    wsClient.current.onRoundResult((result: any) => {
      console.log('📊 MultiplayerGame: Round Result Received:', result);

      // Update session with round result FIRST
      setCurrentSession((prev) => {
        if (!prev) {
          console.log('⚠️ MultiplayerGame: No current session to update');
          return null;
        }

        console.log('🎮 MultiplayerGame: Updating session with result');

        // Create round data
        const roundData = {
          roundNumber: result.round,
          decisions: prev.players.map(
            (player) =>
              ({
                playerId: player.id,
                decision:
                  player.id === humanPlayer.id
                    ? result.yourDecision === 'COOPERATE'
                      ? Decision.STAY_SILENT
                      : Decision.CONFESS
                    : result.opponentDecision === 'COOPERATE'
                      ? Decision.STAY_SILENT
                      : Decision.CONFESS,
                timestamp: new Date(),
                canReverse: false,
              }) as PlayerDecision
          ),
          results: {
            playerA:
              humanPlayer.id === prev.players[0].id
                ? result.yourPoints
                : result.opponentPoints,
            playerB:
              humanPlayer.id === prev.players[0].id
                ? result.opponentPoints
                : result.yourPoints,
          },
          timestamp: new Date(),
          phaseType: GamePhase.TRUST_PHASE,
        };

        // Add round to session - only add if not already exists
        const updatedRounds = [...prev.rounds];

        // Check if this round already exists
        const existingRoundIndex = updatedRounds.findIndex(
          (r) => r.roundNumber === result.round
        );

        if (existingRoundIndex >= 0) {
          // Update existing round
          updatedRounds[existingRoundIndex] = roundData;
        } else {
          // Add new round
          updatedRounds.push(roundData);
          // Sort by round number to ensure correct order
          updatedRounds.sort((a, b) => a.roundNumber - b.roundNumber);
        }

        console.log(
          `🎮 MultiplayerGame: Updated session with ${updatedRounds.length} rounds`
        );
        console.log('📊 MultiplayerGame: Round data added:', roundData);

        const updatedSession = {
          ...prev,
          rounds: updatedRounds,
        };

        console.log(
          '🎮 MultiplayerGame: Final updated session:',
          updatedSession
        );
        return updatedSession;
      });

      // Check if game is over
      if (result.isGameOver) {
        console.log(
          '🏁 MultiplayerGame: Game is over, showing decision reversal'
        );
        console.log('🏁 Current multiplayer state:', multiplayerState);

        // Only transition to DECISION_REVERSAL if not already there
        if (multiplayerState !== MultiplayerState.DECISION_REVERSAL) {
          console.log('🏁 Transitioning to DECISION_REVERSAL state');
          // Show decision reversal option
          setTimeout(() => {
            setMultiplayerState(MultiplayerState.DECISION_REVERSAL);
            // Reset timer when entering decision reversal
            setReversalTimeLeft(60);
            // Reset reversal response status
            setReversalResponseStatus({
              playerResponded: false,
              opponentResponded: false,
              waitingForOpponent: false,
            });
            // Clear any previous rejection messages
            setReversalRejectionMessage(null);
          }, 3000);
        } else {
          console.log('🏁 Already in DECISION_REVERSAL state, not resetting');
        }
      }
    });

    wsClient.current.onNewRound((round: number, timerDuration?: number) => {
      console.log(`🔄 New round started: ${round}, timer: ${timerDuration}s`);
      if (timerDuration) {
        setTimerSync({ round, duration: timerDuration });
      }
    });

    wsClient.current.onGameOver((data: any) => {
      console.log('🏁 Game over received:', data);
      console.log('🏁 Tournament context:', !!tournamentContext);
      
      // Fix score assignment based on player ID
      const actualPlayerId = wsClient.current?.getPlayerId() || humanPlayer.id;
      const isPlayer1 = currentSession?.players[0]?.id === actualPlayerId;
      
      console.log('📊 Game over score assignment debug:', {
        actualPlayerId,
        isPlayer1,
        originalScores: data.finalScores,
        player1Id: currentSession?.players[0]?.id,
        player2Id: currentSession?.players[1]?.id
      });
      
      // Correct the final scores based on player position
      const correctedData = {
        ...data,
        finalScores: {
          player1: isPlayer1 ? data.finalScores.player1 : data.finalScores.player2,
          player2: isPlayer1 ? data.finalScores.player2 : data.finalScores.player1
        }
      };
      
      console.log('📊 Game over corrected scores:', correctedData.finalScores);
      setGameStatistics(correctedData);

      // In tournament context, skip decision reversal and go directly to statistics
      if (tournamentContext) {
        console.log('🏆 Tournament context - skipping decision reversal, going to statistics');
        setMultiplayerState(MultiplayerState.STATISTICS);
      } else {
        console.log('🔄 Non-tournament - allowing decision reversal process');
        // Don't go to statistics immediately - let decision reversal happen first
      }
    });

    wsClient.current.onShowStatistics((data: any) => {
      console.log('📊 Statistics received:', data);
      console.log('📊 Setting game statistics and switching to STATISTICS state');
      
      // Server sends correct scores, use them directly
      console.log('📊 Using server scores directly:', data.finalScores);
      setGameStatistics(data);

      // Update session with changed decisions if provided
      if (data.updatedDecisions) {
        console.log('🔄 Updating session with changed decisions:', data.updatedDecisions);

        setCurrentSession(prev => {
          if (!prev) return prev;

          const updatedRounds = [...prev.rounds];

          // Update each round with new decisions and scores using player IDs
          Object.keys(data.updatedDecisions).forEach(roundNumStr => {
            const roundNum = parseInt(roundNumStr);
            const roundData = data.updatedDecisions[roundNumStr];

            const roundIndex = updatedRounds.findIndex(r => r.roundNumber === roundNum);
            if (roundIndex >= 0) {
              const round = updatedRounds[roundIndex];

              // Update decisions using player IDs
              round.decisions.forEach(decision => {
                const playerData = roundData[decision.playerId];
                if (playerData) {
                  decision.decision = playerData.decision === 'COOPERATE' ? Decision.STAY_SILENT : Decision.CONFESS;
                }
              });

              // Update round results - find human player's score
              const humanPlayerData = roundData[humanPlayer.id];
              const opponentPlayerData = roundData[opponent?.id];

              if (humanPlayerData && opponentPlayerData) {
                round.results = {
                  playerA: humanPlayerData.score,
                  playerB: opponentPlayerData.score
                };
              }
            }
          });

          console.log('🔄 Session updated with correct decisions and scores');
          return { ...prev, rounds: updatedRounds };
        });
      }

      // Handle tournament match completion
      if (tournamentContext && tournamentContext.onMatchComplete) {
        const matchResult = {
          matchId: tournamentContext.matchId,
          player1Score: data.finalScores.player1,
          player2Score: data.finalScores.player2,
          winnerId: data.finalScores.player1 > data.finalScores.player2 ? humanPlayer.id : opponent?.id,
          statistics: data
        };
        tournamentContext.onMatchComplete(matchResult);
      }

      setMultiplayerState(MultiplayerState.STATISTICS);
      // Reset reversal response status when showing statistics
      setReversalResponseStatus({
        playerResponded: false,
        opponentResponded: false,
        waitingForOpponent: false,
      });
    });

    wsClient.current.onRematchAccepted(() => {
      console.log('✅ Rematch accepted, starting new game');
      // Reset game state
      setCurrentSession((prev) =>
        prev
          ? {
            ...prev,
            rounds: [],
          }
          : null
      );
      setMultiplayerState(MultiplayerState.IN_GAME);
    });

    wsClient.current.onRematchDeclined(() => {
      console.log('❌ Rematch declined');
    });

    wsClient.current.onError((error: string) => {
      console.error('❌ WebSocket error:', error);
      setConnectionError(error);
    });



    // Add handler for tracking reversal responses
    wsClient.current.onReversalResponseReceived(() => {
      console.log('📝 My reversal response received by server');
      // Don't change state here - it's already handled in handleReversalResponse
    });

    // Add handler for reversal rejection
    wsClient.current.onReversalRejected((message: string) => {
      console.log('❌ Reversal rejected:', message);
      setReversalRejectionMessage(message);
      // Stay in DECISION_REVERSAL state to show the message
      setMultiplayerState(MultiplayerState.DECISION_REVERSAL);
      // Clear message after 3 seconds
      setTimeout(() => {
        setReversalRejectionMessage(null);
      }, 3000);
    });

    // Add handler for reversal selection phase
    wsClient.current.onReversalSelectionPhase((message: string) => {
      console.log('🔄 Reversal selection phase:', message);
      setReversalSelectionMessage(message);
      setMultiplayerState(MultiplayerState.ROUND_SELECTION);
    });

    // Add handler for decision changed
    wsClient.current.onDecisionChanged((data: any) => {
      console.log('✅ Decision changed successfully:', data);

      // Update local session data with new decision
      setCurrentSession(prev => {
        if (!prev) return prev;

        const updatedRounds = [...prev.rounds];
        const roundIndex = updatedRounds.findIndex(r => r.roundNumber === data.roundNumber);

        if (roundIndex >= 0) {
          const round = updatedRounds[roundIndex];
          const playerDecisionIndex = round.decisions.findIndex(d => d.playerId === humanPlayer.id);

          if (playerDecisionIndex >= 0) {
            // Update the decision
            round.decisions[playerDecisionIndex].decision =
              data.newDecision === 'COOPERATE' ? Decision.STAY_SILENT : Decision.CONFESS;

            console.log('🔄 Updated local session with new decision');
          }
        }

        return { ...prev, rounds: updatedRounds };
      });

      // Automatically complete changes after decision is made
      if (wsClient.current && currentMatchIdRef.current) {
        console.log('📤 Auto-completing decision changes for match:', currentMatchIdRef.current);
        wsClient.current.sendDecisionChangesComplete(currentMatchIdRef.current);

        // Show waiting message
        setMultiplayerState(MultiplayerState.DECISION_REVERSAL);
        setReversalRejectionMessage('Kararınız değiştirildi. Diğer oyuncunun tamamlamasını bekliyoruz...');
      } else {
        console.error('❌ Cannot auto-complete: wsClient or matchId missing', {
          wsClient: !!wsClient.current,
          matchId: currentMatchIdRef.current
        });
      }
    });

    // Add handler for final scores update
    wsClient.current.onFinalScoresUpdate((data: any) => {
      console.log('🎯 Final scores update received:', data);

      // Update game statistics with final scores
      setGameStatistics(prev => ({
        ...prev,
        finalScores: data.finalScores,
        winner: data.winner
      }));

      // Show dramatic score reveal
      // This will be handled by the UI to show the final scores before statistics
    });

    // Add handler for waiting for other player
    wsClient.current.onWaitingForOtherPlayer((data: any) => {
      console.log('⏳ Waiting for other player:', data.message);

      // Show waiting message in UI
      // This can be handled by showing a loading state or message
    });

    // Start connection only for tournament matches
    // For normal multiplayer, connection will be started when mode is selected
    if (tournamentContext) {
      wsClient.current.connect();
    }

    // Cleanup on unmount
    return () => {
      if (wsClient.current) {
        wsClient.current.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle mode selection after connection
  useEffect(() => {
    if (!wsClient.current?.isConnected() || !selectedMode || multiplayerState !== MultiplayerState.CONNECTING) {
      return;
    }

    console.log('🎯 Processing mode selection:', selectedMode, 'with code:', gameCode);

    if (selectedMode === MultiplayerMode.CREATE_GAME && gameCode) {
      console.log('🎮 Creating private game:', gameCode);
      wsClient.current.send({
        type: 'CREATE_PRIVATE_GAME',
        gameCode: gameCode,
        player: userToPlayer(humanPlayer)
      });
      setMultiplayerState(MultiplayerState.WAITING_FOR_OPPONENT);
    } else if (selectedMode === MultiplayerMode.JOIN_GAME && gameCode) {
      console.log('🔍 Joining private game:', gameCode);
      wsClient.current.send({
        type: 'JOIN_PRIVATE_GAME',
        gameCode: gameCode,
        player: userToPlayer(humanPlayer)
      });
      setMultiplayerState(MultiplayerState.MATCHMAKING);
    } else if (selectedMode === MultiplayerMode.RANDOM_MATCH) {
      console.log('🎲 Random match mode - going to lobby');
      setMultiplayerState(MultiplayerState.LOBBY);
    }
  }, [selectedMode, gameCode, multiplayerState]);

  // Reversal countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (multiplayerState === MultiplayerState.DECISION_REVERSAL && !reversalResponseStatus.playerResponded) {
      console.log('⏰ Starting reversal countdown timer');
      interval = setInterval(() => {
        setReversalTimeLeft(prev => {
          if (prev <= 1) {
            // Time's up - auto reject
            console.log('⏰ Reversal timeout - auto rejecting');
            if (wsClient.current && currentMatchId) {
              wsClient.current.sendDecisionReversalResponse(currentMatchId, false);
              setReversalResponseStatus(prev => ({
                ...prev,
                playerResponded: true,
                waitingForOpponent: true
              }));
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (reversalResponseStatus.playerResponded) {
      console.log('⏰ Player already responded, stopping timer');
      // Player already responded, stop the timer
      if (interval) {
        clearInterval(interval);
      }
    }

    return () => {
      if (interval) {
        console.log('⏰ Cleaning up reversal timer');
        clearInterval(interval);
      }
    };
  }, [multiplayerState, reversalResponseStatus.playerResponded, currentMatchId]);

  const createMatch = useCallback(
    (matchedOpponent: Player) => {
      const sessionConfig = {
        gameMode: tournamentContext ? GameMode.PARTY : GameMode.MULTIPLAYER,
        maxRounds: 10,
        trustPhaseRounds: 5,
        communicationTimeLimit: tournamentContext ? 30 : 60, // Shorter time in tournaments
        allowDecisionReversal: !tournamentContext, // No reversal in tournaments
      };

      const mockSession: GameSession = {
        id: `multiplayer-session-${Date.now()}`,
        players: [userToPlayer(humanPlayer), matchedOpponent],
        rounds: [],
        currentPhase: GamePhase.TRUST_PHASE,
        startTime: new Date(),
        sessionConfig,
        tournamentContext: tournamentContext ? {
          tournamentId: tournamentContext.tournamentId,
          matchId: tournamentContext.matchId,
          roundNumber: tournamentContext.roundNumber,
          isEliminationMatch: tournamentContext.isEliminationMatch
        } : undefined,
      };

      setOpponent(matchedOpponent);
      setCurrentSession(mockSession);
      setMultiplayerState(MultiplayerState.IN_GAME);
      setCommunicationMessages([]); // Clear messages when starting new match
    },
    [humanPlayer, tournamentContext]
  );

  const handleJoinQueue = () => {
    // Don't allow matchmaking in tournament context
    if (tournamentContext) {
      console.log('🏆 Tournament context detected, skipping matchmaking');
      return;
    }
    
    if (wsClient.current && wsClient.current.isConnected()) {
      setMultiplayerState(MultiplayerState.MATCHMAKING);
      wsClient.current.joinQueue(userToPlayer(humanPlayer));
      console.log(`🎯 ${humanPlayer.displayName || humanPlayer.username} joined matchmaking queue`);
    } else {
      setConnectionError('Not connected to server');
    }
  };

  const handleLeaveQueue = () => {
    if (wsClient.current && wsClient.current.isConnected()) {
      wsClient.current.leaveQueue();
      setMultiplayerState(MultiplayerState.LOBBY);
      console.log(`❌ ${humanPlayer.displayName || humanPlayer.username} left matchmaking queue`);
    }
  };

  const handlePlayerDecision = (decision: Decision) => {
    console.log(`🎮 Player decision: ${decision}`);

    if (wsClient.current && currentMatchId && currentSession) {
      // Map Decision enum to server format
      const serverDecision =
        decision === Decision.STAY_SILENT ? 'COOPERATE' : 'BETRAY';
      console.log(`📤 Sending to server: ${serverDecision}`);

      wsClient.current.sendGameDecision(
        currentMatchId,
        serverDecision,
        currentSession.rounds.length
      );
    }
  };

  const handleCommunicationSend = (message: string) => {
    console.log('💬 Sending message:', message);

    // Add message to local state for display
    const newMessage = {
      playerId: humanPlayer.id,
      message: message,
      timestamp: new Date(),
    };

    setCommunicationMessages((prev) => [...prev, newMessage]);

    // Send message to server
    if (wsClient.current && currentMatchId) {
      wsClient.current.sendGameMessage(currentMatchId, message);
    }
  };

  const handleForfeit = () => {
    console.log('🏳️ Player forfeiting match');
    
    if (wsClient.current && currentMatchId) {
      // Send forfeit message to server
      wsClient.current.send({
        type: 'FORFEIT_MATCH',
        matchId: currentMatchId
      });
      
      // Wait a bit for message to be sent before returning to menu
      setTimeout(() => {
        onGameEnd('forfeit');
      }, 100);
    } else {
      // No active match, just return to menu
      onGameEnd('forfeit');
    }
  };

  const handleDecisionReversal = (accept: boolean) => {
    console.log(`🔄 Decision reversal: ${accept ? 'ACCEPT' : 'DECLINE'}`);
    console.log('Current reversal status:', reversalResponseStatus);

    // Always send response to server first
    if (wsClient.current && currentMatchId) {
      console.log('📤 Sending reversal response to server');
      wsClient.current.sendDecisionReversalResponse(currentMatchId, accept);
    }

    // Mark that this player has responded and set waiting state
    setReversalResponseStatus((prev) => ({
      ...prev,
      playerResponded: true,
      waitingForOpponent: !prev.opponentResponded,
    }));

    // Don't change state here - wait for server response
    // Server will send appropriate message based on both players' responses
    console.log('📝 Player response sent, waiting for server to handle both responses');
  };

  const handleRoundSelection = (roundNumber: number) => {
    setSelectedRoundForReversal(roundNumber);
    setMultiplayerState(MultiplayerState.DECISION_SELECTION);
  };

  const handleReversalResponse = (accept: boolean) => {
    console.log('🔄 Reversal response clicked:', {
      accept: accept,
      type: typeof accept,
      currentMatchId: currentMatchId,
      wsClientExists: !!wsClient.current
    });

    if (wsClient.current && currentMatchId) {
      console.log('📤 About to send reversal response to server:', accept);
      wsClient.current.sendDecisionReversalResponse(currentMatchId, accept);

      // Update local state
      setReversalResponseStatus(prev => {
        console.log('🔄 Previous reversal response status:', prev);
        const newState = {
          ...prev,
          playerResponded: true,
          waitingForOpponent: true
        };
        console.log('🔄 New reversal response status:', newState);
        return newState;
      });

      console.log('📝 Reversal response sent, waiting for opponent');
    } else {
      console.error('❌ Cannot send reversal response - missing client or match ID');
    }
  };

  const handleReversalDecisionSubmit = (newDecision: Decision) => {
    console.log('🔄 Decision reversal submitted:', {
      selectedRound: selectedRoundForReversal,
      newDecision: newDecision,
      currentMatchId: currentMatchId
    });

    if (wsClient.current && currentMatchId && selectedRoundForReversal !== null) {
      // Convert Decision enum to server format
      const serverDecision = newDecision === Decision.STAY_SILENT ? 'COOPERATE' : 'BETRAY';

      console.log('📤 Sending decision change request to server:', {
        round: selectedRoundForReversal,
        newDecision: serverDecision
      });

      wsClient.current.sendDecisionChangeRequest(currentMatchId, selectedRoundForReversal, serverDecision);

      // Wait for server response before going to statistics
      // The onDecisionChanged handler will handle the transition
    } else {
      console.error('❌ Cannot send decision change - missing data');
      setMultiplayerState(MultiplayerState.STATISTICS);
    }
  };

  // Helper functions for statistics calculation
  const calculateCooperationPercentage = (session: GameSession): number => {
    let humanDecisions: any[] = [];

    // Get the correct player ID - use WebSocket player ID if available, fallback to humanPlayer.id
    const actualPlayerId = wsClient.current?.getPlayerId() || humanPlayer.id;

    console.log('📊 Debug cooperation calculation:', {
      hasGameStatistics: !!gameStatistics,
      hasUpdatedDecisions: !!gameStatistics?.updatedDecisions,
      humanPlayerId: humanPlayer.id,
      actualPlayerId: actualPlayerId,
      sessionRoundsCount: session.rounds.length
    });

    // Use updated decisions if available (after decision reversal)
    if (gameStatistics?.updatedDecisions) {
      console.log('🔄 Using updated decisions for statistics:', gameStatistics.updatedDecisions);
      console.log('🔍 Looking for player ID:', actualPlayerId);
      console.log('🔍 Available player IDs in updated decisions:',
        Object.keys(gameStatistics.updatedDecisions).map(roundNum =>
          Object.keys(gameStatistics.updatedDecisions[roundNum])
        )
      );

      humanDecisions = Object.keys(gameStatistics.updatedDecisions).map(roundNum => {
        const roundDecisions = gameStatistics.updatedDecisions[roundNum];
        const playerDecision = roundDecisions[actualPlayerId];
        console.log(`🔍 Round ${roundNum} decision for ${actualPlayerId}:`, playerDecision);
        console.log(`🔍 Round ${roundNum} all decisions:`, roundDecisions);
        console.log(`🔍 Round ${roundNum} available player IDs:`, Object.keys(roundDecisions));
        return playerDecision;
      }).filter(Boolean);
    } else {
      console.log('📊 Using original session rounds');
      // Use original session rounds - try both actualPlayerId and humanPlayer.id
      humanDecisions = session.rounds
        .map((round) =>
          round.decisions.find((d) => d.playerId === actualPlayerId || d.playerId === humanPlayer.id)
        )
        .filter(Boolean);
    }

    if (humanDecisions.length === 0) {
      console.log('❌ No human decisions found!');
      return 0;
    }

    const cooperationCount = humanDecisions.filter(
      (d) => d.decision === Decision.STAY_SILENT || d.decision === 'COOPERATE'
    ).length;

    console.log('📊 Cooperation calculation:', {
      totalDecisions: humanDecisions.length,
      cooperationCount,
      percentage: Math.round((cooperationCount / humanDecisions.length) * 100),
      decisions: humanDecisions.map(d => d.decision)
    });

    return Math.round((cooperationCount / humanDecisions.length) * 100);
  };

  const calculateBetrayalPercentage = (session: GameSession): number => {
    return 100 - calculateCooperationPercentage(session);
  };

  const calculateTrustScore = (session: GameSession): number => {
    // Simple trust score based on cooperation percentage
    return calculateCooperationPercentage(session);
  };

  const handleModeSelect = useCallback((mode: MultiplayerMode, code?: string) => {
    console.log('🎯 Mode selected:', mode, code ? `with code: ${code}` : '');
    console.log('🎯 wsClient.current:', wsClient.current ? 'EXISTS' : 'NULL');
    console.log('🎯 isConnected:', wsClient.current?.isConnected());
    
    setSelectedMode(mode);
    
    // Create WebSocket client if it doesn't exist (for normal multiplayer)
    if (!wsClient.current) {
      console.log('🔌 Creating WebSocket client for multiplayer mode');
      const serverUserService = getServerUserService();
      const sessionToken = serverUserService.getSessionToken();
      
      wsClient.current = new WebSocketGameClient();
      
      // Set up event handlers (same as in useEffect for tournament)
      wsClient.current.onConnected(() => {
        console.log('🎮 Connected to game server');
        console.log('Current state when connected:', currentStateRef.current);
        console.log('Selected mode:', selectedMode);
        console.log('Game code:', gameCode);

        setConnectionError(null);

        if (currentMatchIdRef.current && currentStateRef.current === MultiplayerState.IN_GAME) {
          console.log('🔄 Reconnected during game, staying in game state');
        } else if (currentStateRef.current === MultiplayerState.CONNECTING) {
          console.log('🔄 Connected while in CONNECTING state');
          
          // Handle private game modes
          if (selectedMode === MultiplayerMode.CREATE_GAME) {
            console.log('🎮 Creating private game');
            const player = userToPlayer(humanPlayer);
            wsClient.current?.createPrivateGame(player);
            setMultiplayerState(MultiplayerState.WAITING_FOR_OPPONENT);
          } else if (selectedMode === MultiplayerMode.JOIN_GAME && gameCode) {
            console.log('🔍 Joining private game with code:', gameCode);
            const player = userToPlayer(humanPlayer);
            wsClient.current?.joinPrivateGame(player, gameCode);
            setMultiplayerState(MultiplayerState.MATCHMAKING);
          } else {
            // Random match mode
            console.log('🔄 Transitioning to LOBBY for random match');
            setMultiplayerState(MultiplayerState.LOBBY);
          }
        } else {
          console.log('📋 No mode selected - showing mode selection');
          setMultiplayerState(MultiplayerState.MODE_SELECTION);
        }
      });

      wsClient.current.onDisconnected(() => {
        console.log('🔌 Disconnected from game server');
        if (currentStateRef.current === MultiplayerState.IN_GAME) {
          setConnectionError('Bağlantı kesildi. Yeniden bağlanmaya çalışılıyor...');
        } else {
          setMultiplayerState(MultiplayerState.CONNECTING);
        }
      });

      wsClient.current.onMatchFound((data: MatchFoundData) => {
        console.log('🎯 Match found!', data);
        setCurrentMatchId(data.matchId);
        setOpponent(data.opponent);
        createMatch(data.opponent);
      });

      wsClient.current.onPrivateGameCreated((code: string) => {
        console.log('🎮 Private game created with code:', code);
        setGameCode(code);
        setMultiplayerState(MultiplayerState.WAITING_FOR_OPPONENT);
      });

      wsClient.current.onPrivateGameCancelled(() => {
        console.log('🎮 Private game cancelled');
        setGameCode(null);
        setMultiplayerState(MultiplayerState.MODE_SELECTION);
      });

      wsClient.current.onOpponentDisconnected(() => {
        console.log('⚠️ Opponent disconnected');
        setConnectionError('Opponent disconnected');
      });

      wsClient.current.onQueueStatus((data: QueueStatusData) => {
        setQueuePosition(data.position);
        setQueueSize(data.queueSize);
      });

      wsClient.current.onOpponentDecision((decision: string, round: number) => {
        // Handle opponent decision in game (no console log for security)
      });

      wsClient.current.onOpponentMessage((message: string, timestamp: number) => {
        setCommunicationMessages((prev) => [
          ...prev,
          {
            playerId: 'opponent',
            message: message,
            timestamp: new Date(timestamp),
          },
        ]);
      });

      wsClient.current.onOpponentDisconnected(() => {
        console.log('❌ Opponent disconnected in normal match - waiting for server statistics');
        setConnectionError('Rakibiniz bağlantısı kesildi. Yeniden bağlanması bekleniyor...');
        // Don't return to lobby immediately - server will send SHOW_STATISTICS after timeout
      });

      wsClient.current.onShowStatistics((data: any) => {
        console.log('📊 *** SHOW_STATISTICS RECEIVED ***:', data);
        
        // Check if this is an immediate forfeit (player quit voluntarily)
        if (data.immediate && data.forfeit) {
          console.log('🏳️ *** IMMEDIATE FORFEIT - OPPONENT QUIT ***');
          
          // Clear connection error message
          setConnectionError(null);
          
          // Show statistics immediately without waiting message
          const forfeitStats = {
            finalScores: data.scores || { player1: 0, player2: 0 },
            updatedDecisions: data.updatedDecisions || {},
            gameEndReason: 'opponent_forfeit',
            isWinner: true
          };
          
          setGameStatistics(forfeitStats);
          setMultiplayerState(MultiplayerState.STATISTICS);
          return;
        }
        
        const stats = {
          finalScores: data.scores || { player1: 0, player2: 0 },
          updatedDecisions: data.updatedDecisions,
          gameEndReason: data.forfeit ? 'opponent_forfeit' : 'normal'
        };
        setGameStatistics(stats);
        setMultiplayerState(MultiplayerState.STATISTICS);
      });

      wsClient.current.onRoundResult((result: any) => {
        console.log('📊 MultiplayerGame: Round Result Received:', result);

        setCurrentSession((prev) => {
          if (!prev) {
            console.log('⚠️ MultiplayerGame: No current session to update');
            return null;
          }

          console.log('🎮 MultiplayerGame: Updating session with result');

          const roundData = {
            roundNumber: result.round,
            decisions: prev.players.map(
              (player) =>
                ({
                  playerId: player.id,
                  decision:
                    player.id === humanPlayer.id
                      ? result.yourDecision === 'COOPERATE'
                        ? Decision.STAY_SILENT
                        : Decision.CONFESS
                      : result.opponentDecision === 'COOPERATE'
                        ? Decision.STAY_SILENT
                        : Decision.CONFESS,
                  timestamp: new Date(),
                  canReverse: false,
                }) as PlayerDecision
            ),
            results: {
              playerA:
                humanPlayer.id === prev.players[0].id
                  ? result.yourPoints
                  : result.opponentPoints,
              playerB:
                humanPlayer.id === prev.players[0].id
                  ? result.opponentPoints
                  : result.yourPoints,
            },
            timestamp: new Date(),
            phaseType: GamePhase.TRUST_PHASE,
          };

          const updatedRounds = [...prev.rounds];
          const existingRoundIndex = updatedRounds.findIndex(
            (r) => r.roundNumber === result.round
          );

          if (existingRoundIndex >= 0) {
            updatedRounds[existingRoundIndex] = roundData;
          } else {
            updatedRounds.push(roundData);
            updatedRounds.sort((a, b) => a.roundNumber - b.roundNumber);
          }

          console.log(
            `🎮 MultiplayerGame: Updated session with ${updatedRounds.length} rounds`
          );

          const updatedSession = {
            ...prev,
            rounds: updatedRounds,
          };

          return updatedSession;
        });

        if (result.isGameOver) {
          console.log('🏁 MultiplayerGame: Game is over, showing decision reversal');

          if (multiplayerState !== MultiplayerState.DECISION_REVERSAL) {
            console.log('🏁 Transitioning to DECISION_REVERSAL state');
            setTimeout(() => {
              setMultiplayerState(MultiplayerState.DECISION_REVERSAL);
              setReversalTimeLeft(60);
              setReversalResponseStatus({
                playerResponded: false,
                opponentResponded: false,
                waitingForOpponent: false,
              });
              setReversalRejectionMessage(null);
            }, 3000);
          }
        }
      });

      wsClient.current.onNewRound((round: number, timerDuration?: number) => {
        console.log(`🔄 New round started: ${round}, timer: ${timerDuration}s`);
        if (timerDuration) {
          setTimerSync({ round, duration: timerDuration });
        }
      });

      wsClient.current.onGameOver((data: any) => {
        console.log('🏁 Game over received:', data);
        const actualPlayerId = wsClient.current?.getPlayerId() || humanPlayer.id;
        const isPlayer1 = currentSession?.players[0]?.id === actualPlayerId;
        
        const correctedData = {
          ...data,
          finalScores: {
            player1: isPlayer1 ? data.finalScores.player1 : data.finalScores.player2,
            player2: isPlayer1 ? data.finalScores.player2 : data.finalScores.player1
          }
        };
        
        setGameStatistics(correctedData);
      });

      wsClient.current.onRematchAccepted(() => {
        console.log('✅ Rematch accepted, starting new game');
        setCurrentSession((prev) =>
          prev
            ? {
              ...prev,
              rounds: [],
            }
            : null
        );
        setMultiplayerState(MultiplayerState.IN_GAME);
      });

      wsClient.current.onRematchDeclined(() => {
        console.log('❌ Rematch declined');
      });

      wsClient.current.onError((error: string) => {
        console.error('❌ WebSocket error:', error);
        setConnectionError(error);
      });

      wsClient.current.onReversalResponseReceived(() => {
        console.log('📝 My reversal response received by server');
      });

      wsClient.current.onReversalRejected((message: string) => {
        console.log('❌ Reversal rejected:', message);
        setReversalRejectionMessage(message);
        setMultiplayerState(MultiplayerState.DECISION_REVERSAL);
        setTimeout(() => {
          setReversalRejectionMessage(null);
        }, 3000);
      });

      wsClient.current.onReversalSelectionPhase((message: string) => {
        console.log('🔄 Reversal selection phase:', message);
        setReversalSelectionMessage(message);
        setMultiplayerState(MultiplayerState.ROUND_SELECTION);
      });

      wsClient.current.onDecisionChanged((data: any) => {
        console.log('✅ Decision changed successfully:', data);

        setCurrentSession(prev => {
          if (!prev) return prev;

          const updatedRounds = [...prev.rounds];
          const roundIndex = updatedRounds.findIndex(r => r.roundNumber === data.roundNumber);

          if (roundIndex >= 0) {
            const round = updatedRounds[roundIndex];
            const playerDecisionIndex = round.decisions.findIndex(d => d.playerId === humanPlayer.id);

            if (playerDecisionIndex >= 0) {
              round.decisions[playerDecisionIndex].decision =
                data.newDecision === 'COOPERATE' ? Decision.STAY_SILENT : Decision.CONFESS;

              console.log('🔄 Updated local session with new decision');
            }
          }

          return { ...prev, rounds: updatedRounds };
        });

        if (wsClient.current && currentMatchIdRef.current) {
          console.log('📤 Auto-completing decision changes for match:', currentMatchIdRef.current);
          wsClient.current.sendDecisionChangesComplete(currentMatchIdRef.current);

          setMultiplayerState(MultiplayerState.DECISION_REVERSAL);
          setReversalRejectionMessage('Kararınız değiştirildi. Diğer oyuncunun tamamlamasını bekliyoruz...');
        }
      });

      wsClient.current.onFinalScoresUpdate((data: any) => {
        console.log('🎯 Final scores update received:', data);
        setGameStatistics(prev => ({
          ...prev,
          finalScores: data.finalScores,
          winner: data.winner
        }));
      });

      wsClient.current.onWaitingForOtherPlayer((data: any) => {
        console.log('⏳ Waiting for other player:', data.message);
      });

      console.log('✅ WebSocket client created and handlers set up');
    }
    
    if (mode === MultiplayerMode.RANDOM_MATCH) {
      console.log('🎲 RANDOM_MATCH: Setting state to CONNECTING');
      setMultiplayerState(MultiplayerState.CONNECTING);
      if (wsClient.current && !wsClient.current.isConnected()) {
        console.log('🔌 Starting WebSocket connection...');
        wsClient.current.connect();
      } else {
        console.log('⚠️ WebSocket already connected or client is null');
      }
    } else if (mode === MultiplayerMode.CREATE_GAME) {
      const newCode = generateGameCode();
      console.log('🎮 CREATE_GAME: Generated code:', newCode);
      setGameCode(newCode);
      setMultiplayerState(MultiplayerState.CONNECTING);
      if (wsClient.current && !wsClient.current.isConnected()) {
        console.log('🔌 Starting WebSocket connection...');
        wsClient.current.connect();
      } else {
        console.log('⚠️ WebSocket already connected or client is null');
      }
    } else if (mode === MultiplayerMode.JOIN_GAME && code) {
      console.log('🔍 JOIN_GAME: Code:', code);
      setGameCode(code);
      setMultiplayerState(MultiplayerState.CONNECTING);
      if (wsClient.current && !wsClient.current.isConnected()) {
        console.log('🔌 Starting WebSocket connection...');
        wsClient.current.connect();
      } else {
        console.log('⚠️ WebSocket already connected or client is null');
      }
    }
  }, [humanPlayer, multiplayerState, currentSession, createMatch]);

  const generateGameCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const renderCurrentState = () => {
    switch (multiplayerState) {
      case MultiplayerState.MODE_SELECTION:
        return (
          <MultiplayerModeSelector
            onModeSelect={handleModeSelect}
            onBack={() => onGameEnd()}
          />
        );

      case MultiplayerState.WAITING_FOR_OPPONENT:
        return (
          <div className="multiplayer-status">
            <h2>🎮 Oyun Oluşturuldu</h2>
            <div className="game-code-display">
              <p>Oyun Kodunuz:</p>
              <div className="code-box">{gameCode}</div>
              <p className="code-hint">Bu kodu arkadaşınla paylaş</p>
            </div>
            <div className="loading-spinner"></div>
            <p>Rakip bekleniyor...</p>
            <button onClick={() => {
              setMultiplayerState(MultiplayerState.MODE_SELECTION);
              setGameCode(null);
            }} className="back-btn">
              İptal
            </button>
          </div>
        );

      case MultiplayerState.CONNECTING:
        return (
          <div className="multiplayer-status">
            <h2>🔌 Sunucuya Bağlanıyor...</h2>
            <div className="loading-spinner"></div>
            <p>Oyun sunucusuna bağlantı kuruluyor...</p>
            {connectionError && (
              <div className="error-message">
                <p>❌ Bağlantı Hatası: {connectionError}</p>
              </div>
            )}
            {!tournamentContext && (
              <button onClick={() => {
                console.log('🏳️ Back button clicked in CONNECTING state');
                onGameEnd();
              }} className="back-btn">
                {t('common.back')}
              </button>
            )}
          </div>
        );

      case MultiplayerState.LOBBY:
        return (
          <div className="multiplayer-status">
            <h2>{tournamentContext ? '🏆 Tournament Match' : t('menu.multiplayer')}</h2>
            <p>✅ Sunucuya bağlandı!</p>
            <p>
              Player ID:{' '}
              {wsClient.current?.getPlayerId()?.slice(-8) || 'Unknown'}
            </p>
            {tournamentContext ? (
              <div className="tournament-info">
                <p>🏆 Tournament: {tournamentContext.tournamentId}</p>
                <p>⚔️ Match: {tournamentContext.matchId}</p>
                {tournamentContext.opponent && (
                  <p>👤 Opponent: {tournamentContext.opponent.name}</p>
                )}
                <p>Waiting for match to start...</p>
              </div>
            ) : (
              <div className="lobby-actions">
                <button onClick={handleJoinQueue} className="join-queue-btn">
                  {t('multiplayer.findOpponent')}
                </button>
                {!tournamentContext && (
                  <button onClick={() => {
                    console.log('🏳️ Back button clicked in LOBBY state');
                    onGameEnd();
                  }} className="back-btn">
                    {t('common.back')}
                  </button>
                )}
              </div>
            )}
          </div>
        );

      case MultiplayerState.MATCHMAKING:
        return (
          <div className="multiplayer-status">
            <h2>{t('multiplayer.findingOpponent')}</h2>
            <div className="loading-spinner"></div>
            <p>{t('multiplayer.waitingForPlayers')}</p>
            <p>🎯 Sırada {queuePosition}. sıradasınız</p>
            <p>👥 Toplam oyuncu sayısı: {queueSize}</p>
            <p>
              🆔 Player ID:{' '}
              {wsClient.current?.getPlayerId()?.slice(-8) || 'Unknown'}
            </p>
            <button onClick={handleLeaveQueue} className="cancel-btn">
              {t('common.cancel')}
            </button>
          </div>
        );

      case MultiplayerState.WAITING_FOR_OPPONENT:
        return (
          <div className="multiplayer-status">
            <h2>🎮 Oyun Oluşturuldu!</h2>
            <div className="game-code-display">
              <h3>Oyun Kodu:</h3>
              <div className="code-box">{gameCode}</div>
              <p>Bu kodu arkadaşınla paylaş</p>
            </div>
            <div className="loading-spinner"></div>
            <p>Rakip bekleniyor...</p>
            <button 
              onClick={() => {
                wsClient.current?.cancelPrivateGame();
                setMultiplayerState(MultiplayerState.MODE_SELECTION);
              }} 
              className="cancel-btn"
            >
              İptal
            </button>
          </div>
        );

      case MultiplayerState.IN_GAME:
        return currentSession && opponent ? (
          <div className="tournament-game-container">
            {/* Tournament Context Header */}
            {tournamentContext && (
              <div className="tournament-match-header">
                <div className="tournament-info">
                  <h3>🏆 Tournament Match - Round {tournamentContext.roundNumber}</h3>
                  {tournamentContext.isEliminationMatch && (
                    <span className="elimination-badge">⚡ Elimination Match</span>
                  )}
                </div>
                <div className="match-players">
                  <span className="player-name">{humanPlayer.displayName || humanPlayer.username}</span>
                  <span className="vs-text">VS</span>
                  <span className="player-name">{opponent.name}</span>
                </div>
              </div>
            )}

            <MultiplayerGameBoard
              session={currentSession}
              humanPlayer={userToPlayer(humanPlayer)}
              opponent={opponent}
              onPlayerDecision={handlePlayerDecision}
              onCommunicationMessage={handleCommunicationSend}
              onGameEnd={onGameEnd}
              onForfeit={handleForfeit}
              messages={communicationMessages}
              timerSync={timerSync}
              connectionError={connectionError}
            />
          </div>
        ) : (
          <div className="multiplayer-status">
            <h2>🎮 Oyun Başlatılıyor...</h2>
            <div className="loading-spinner"></div>
          </div>
        );

      case MultiplayerState.DECISION_REVERSAL:
        // Skip decision reversal in tournament mode
        if (tournamentContext) {
          setMultiplayerState(MultiplayerState.STATISTICS);
          return null;
        }

        return (
          <div className="decision-reversal-screen">
            <div className="reversal-card">
              <h2>{t('decisionReversal.title')}</h2>

              {/* Show rejection message if exists */}
              {reversalRejectionMessage && (
                <div className="reversal-rejection-message">
                  <div className="rejection-alert">
                    <span className="rejection-icon">⚠️</span>
                    <p>{reversalRejectionMessage}</p>
                  </div>
                </div>
              )}

              {reversalResponseStatus.waitingForOpponent ? (
                <div className="waiting-for-opponent">
                  <p>Yanıtınız alındı. Diğer oyuncunun yanıtı bekleniyor...</p>
                  <div className="loading-spinner"></div>
                  <div className="response-status">
                    <p>✅ Sizin yanıtınız: Alındı</p>
                    <p>⏳ Rakip yanıtı: Bekleniyor</p>
                  </div>
                </div>
              ) : !reversalRejectionMessage ? (
                <>
                  <div className="reversal-timer">
                    <p>⏰ Kalan süre: {reversalTimeLeft} saniye</p>
                  </div>
                  <p>{t('decisionReversal.question')}</p>
                  <div className="reversal-buttons">
                    <button
                      className="reversal-btn decline-btn"
                      onClick={() => handleReversalResponse(false)}
                      disabled={reversalResponseStatus.playerResponded}
                    >
                      {t('decisionReversal.decline')}
                    </button>
                    <button
                      className="reversal-btn accept-btn"
                      onClick={() => handleReversalResponse(true)}
                      disabled={reversalResponseStatus.playerResponded}
                    >
                      {t('decisionReversal.accept')}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        );

      case MultiplayerState.ROUND_SELECTION:
        return (
          <div className="decision-reversal-screen">
            <div className="reversal-card">
              <h2>{t('decisionReversal.selectRound')}</h2>

              {/* Show selection message if exists */}
              {reversalSelectionMessage && (
                <div className="reversal-selection-message">
                  <p>{reversalSelectionMessage}</p>
                </div>
              )}

              <p>Hangi turu değiştirmek istiyorsunuz?</p>
              <div className="rounds-grid">
                {currentSession?.rounds.map((round, index) => (
                  <button
                    key={index}
                    className="round-btn"
                    onClick={() => handleRoundSelection(round.roundNumber)}
                  >
                    {t('decisionReversal.round')} {round.roundNumber + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case MultiplayerState.DECISION_SELECTION:
        return (
          <div className="decision-reversal-screen">
            <div className="reversal-card">
              <h2>
                {selectedRoundForReversal !== null ?
                  `${selectedRoundForReversal + 1}. Tur için kararınızı değiştirin` :
                  'Kararınızı değiştirin'
                }
              </h2>
              <p>Neyle değiştirmek istiyorsunuz?</p>
              <div className="decision-buttons">
                <button
                  className="decision-btn stay-silent-btn"
                  onClick={() => {
                    if (wsClient.current && currentMatchId && selectedRoundForReversal !== null) {
                      wsClient.current.sendDecisionChangeRequest(currentMatchId, selectedRoundForReversal, 'COOPERATE');
                      setSelectedRoundForReversal(null);
                    }
                  }}
                >
                  Sessiz Kal
                </button>
                <button
                  className="decision-btn confess-btn"
                  onClick={() => {
                    if (wsClient.current && currentMatchId && selectedRoundForReversal !== null) {
                      wsClient.current.sendDecisionChangeRequest(currentMatchId, selectedRoundForReversal, 'BETRAY');
                      setSelectedRoundForReversal(null);
                    }
                  }}
                >
                  İtiraf Et
                </button>
              </div>
            </div>
          </div>
        );

      case MultiplayerState.STATISTICS:
        return (
          <div className="game-ended">
            {tournamentContext ? (
              <div className="tournament-match-complete">
                <h2>🏆 Tournament Match Complete</h2>
                {tournamentContext.isEliminationMatch && (
                  <div className="elimination-result">
                    <h3>⚡ Elimination Match Result</h3>
                  </div>
                )}
              </div>
            ) : (
              <h2>{t('game.interrogationComplete')}</h2>
            )}

            {currentSession && gameStatistics && gameStatistics.finalScores && (
              <StatisticsPanel
                statistics={{
                  cooperationPercentage:
                    calculateCooperationPercentage(currentSession),
                  betrayalPercentage:
                    calculateBetrayalPercentage(currentSession),
                  totalPoints: gameStatistics.yourScore || gameStatistics.finalScores?.player1 || 0,
                  opponentTotalPoints: gameStatistics.opponentScore || gameStatistics.finalScores?.player2 || 0,
                  gameEndReason: gameStatistics.gameEndReason,
                  gamesWon: (() => {
                    const isForfeitWin = gameStatistics.gameEndReason === 'opponent_forfeit';
                    const isWinner = gameStatistics.isWinner;
                    const myScore = gameStatistics.yourScore || gameStatistics.finalScores?.player1 || 0;
                    const oppScore = gameStatistics.opponentScore || gameStatistics.finalScores?.player2 || 0;
                    const scoreWin = myScore > oppScore;
                    
                    console.log('🏆 Games won calculation:', {
                      gameEndReason: gameStatistics.gameEndReason,
                      isWinner: gameStatistics.isWinner,
                      isForfeitWin,
                      scoreWin,
                      myScore,
                      oppScore,
                      finalResult: (isForfeitWin || isWinner || scoreWin) ? 'WON' : 'LOST'
                    });
                    
                    return (isForfeitWin || isWinner || scoreWin) ? 1 : 0;
                  })(),
                  gamesLost: (() => {
                    const isForfeitWin = gameStatistics.gameEndReason === 'opponent_forfeit';
                    const isWinner = gameStatistics.isWinner;
                    const myScore = gameStatistics.yourScore || gameStatistics.finalScores?.player1 || 0;
                    const oppScore = gameStatistics.opponentScore || gameStatistics.finalScores?.player2 || 0;
                    const scoreLoss = myScore < oppScore;
                    
                    return (isForfeitWin || isWinner) ? 0 : (scoreLoss ? 1 : 0);
                  })(),
                  averageTrustScore: calculateTrustScore(currentSession),
                }}
                session={currentSession}
                updatedDecisions={gameStatistics.updatedDecisions}
                actualPlayerId={wsClient.current?.getPlayerId() || humanPlayer.id}
                isMultiplayer={true}
                onClose={() => {
                  console.log('🏆 Statistics panel closed');
                  if (tournamentContext) {
                    console.log('🏆 Returning to tournament view from statistics');
                    onGameEnd('normal');
                  } else {
                    console.log('🏳️ Returning to main menu from statistics');
                    onGameEnd('normal');
                  }
                }}
              />
            )}

            {/* Tournament context: Return to tournament button */}
            {tournamentContext && (
              <div className="tournament-continue">
                <button 
                  className="continue-tournament-btn"
                  onClick={() => {
                    console.log('🏆 Returning to tournament view from statistics');
                    // Call onGameEnd to return to tournament view with 'normal' type
                    onGameEnd('normal');
                  }}
                >
                  🏆 Turnuvaya Dön
                </button>
              </div>
            )}

            {/* Non-tournament context: Return to main menu */}
            {!tournamentContext && (
              <div className="game-actions">
                <button 
                  className="back-to-menu-btn"
                  onClick={() => {
                    console.log('🏳️ Returning to main menu from statistics');
                    onGameEnd('normal');
                  }}
                >
                  Ana Menüye Dön
                </button>
              </div>
            )}

          </div>
        );

      default:
        return (
          <div className="multiplayer-status">
            <h2>❓ Bilinmeyen Durum</h2>
            {!tournamentContext && (
              <button onClick={() => {
                console.log('🏳️ Ana Menüye Dön button clicked');
                onGameEnd('normal');
              }}>Ana Menüye Dön</button>
            )}
          </div>
        );
    }
  };

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className={`multiplayer-game ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      <AtmosphericEffects currentPhase={GamePhase.TRUST_PHASE} />
      {renderCurrentState()}
    </div>
  );
};
