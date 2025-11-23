import React, { useState, useEffect } from 'react';
import { Player, GameSession, Decision, GamePhase, GameMode } from '../types';
import { User } from '../services/UserService';
import { TournamentMatchBoard } from './TournamentMatchBoard';
import AtmosphericEffects from './AtmosphericEffects';
import StatisticsPanel from './StatisticsPanel';
import { PartyWebSocketClient } from '../services/PartyWebSocketClient';
import { MatchResult } from '../types/party';
import { getMatchRecordingService } from '../services/MatchRecordingService';
import './TournamentMatchGame.css';

interface TournamentMatchGameProps {
  humanPlayer: User;
  opponent: Player;
  matchId: string;
  tournamentId: string;
  tournamentRoundNumber: number; // Which round of the tournament (e.g., semifinals, finals)
  maxRounds?: number; // Number of rounds in this match
  partyWsClient: PartyWebSocketClient;
  onMatchEnd: (result?: 'normal' | 'forfeit') => void;
}

enum MatchState {
  WAITING = 'waiting',
  IN_GAME = 'in_game',
  DECISION_REVERSAL = 'decision_reversal',
  ROUND_SELECTION = 'round_selection',
  DECISION_CHANGE = 'decision_change',
  STATISTICS = 'statistics',
}

export const TournamentMatchGame: React.FC<TournamentMatchGameProps> = ({
  humanPlayer,
  opponent,
  matchId,
  tournamentId,
  tournamentRoundNumber,
  maxRounds = 10,
  partyWsClient,
  onMatchEnd,
}) => {

  const userToPlayer = (user: User): Player => ({
    id: user.id,
    name: user.displayName || user.username,
    isAI: false,
    trustScore: user.stats?.trustScore || 50,
    totalGamesPlayed: user.stats?.totalGames || 0,
    createdAt: user.createdAt,
  });

  const [matchState, setMatchState] = useState<MatchState>(MatchState.IN_GAME);
  const [currentSession, setCurrentSession] = useState<GameSession | null>(null);
  const [gameStatistics, setGameStatistics] = useState<any>(null);
  const [cooperationCount, setCooperationCount] = useState({ player1: 0, player2: 0 });
  const [messages, setMessages] = useState<Array<{ playerId: string; message: string; timestamp: Date }>>([]);
  const [betrayalCount, setBetrayalCount] = useState({ player1: 0, player2: 0 });
  const [timerSync, setTimerSync] = useState<{ round: number; duration: number } | null>(null);
  const [reversalTimeLeft, setReversalTimeLeft] = useState<number>(60);
  const [reversalResponseStatus, setReversalResponseStatus] = useState<{
    playerResponded: boolean;
    opponentResponded: boolean;
    waitingForOpponent: boolean;
  }>({
    playerResponded: false,
    opponentResponded: false,
    waitingForOpponent: false,
  });
  const [selectedRoundForChange, setSelectedRoundForChange] = useState<number | null>(null);
  const [reversalRejectionMessage, setReversalRejectionMessage] = useState<string | null>(null);
  const [reversalSelectionMessage, setReversalSelectionMessage] = useState<string | null>(null);
  const [statisticsTimeout, setStatisticsTimeout] = useState<number>(30); // 30 seconds timeout

  // Statistics timeout - auto close after 30 seconds
  useEffect(() => {
    if (matchState === MatchState.STATISTICS && statisticsTimeout > 0) {
      const timer = setInterval(() => {
        setStatisticsTimeout(prev => {
          if (prev <= 1) {
            console.log('⏰ Statistics timeout reached, returning to tournament');
            onMatchEnd('normal');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [matchState, statisticsTimeout, onMatchEnd]);

  // Statistics timeout will auto-close, no need to listen for new match here
  // PartyGame handles TOURNAMENT_MATCH_READY

  useEffect(() => {
    console.log('🏆 TournamentMatchGame mounted:', {
      matchId,
      tournamentId,
      opponent: opponent.name,
      humanPlayer: humanPlayer.displayName || humanPlayer.username,
      tournamentRoundNumber
    });

    // Create initial session
    const initialSession: GameSession = {
      id: matchId,
      players: [userToPlayer(humanPlayer), opponent],
      rounds: [],
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      sessionConfig: {
        maxRounds: maxRounds,
        trustPhaseRounds: 0,
        communicationTimeLimit: 30,
        allowDecisionReversal: true,
        gameMode: GameMode.MULTIPLAYER,
      },
    };

    setCurrentSession(initialSession);
    
    // Reset counts for new match
    setCooperationCount({ player1: 0, player2: 0 });
    setBetrayalCount({ player1: 0, player2: 0 });
    setGameStatistics(null);
    setMatchState(MatchState.IN_GAME);

    // Handle match round results - track cooperation/betrayal for each round within the match
    const handleMatchRoundResult = (result: any) => {
      console.log('🏆 Tournament match round result:', result);
      
      // Ignore messages from other matches
      if (result.matchId && result.matchId !== matchId) {
        console.log('⚠️ Ignoring round result from different match:', result.matchId);
        return;
      }
      
      // Server sends results from player's perspective (yourDecision, opponentDecision)
      const myDecision = result.yourDecision;
      const opponentDecision = result.opponentDecision;
      
      // Determine player position based on humanPlayer and opponent IDs
      const isPlayer1 = true; // We're always tracking from our perspective
      
      // Track cooperation and betrayal counts based on player position
      if (isPlayer1) {
        setCooperationCount(prev => ({
          player1: prev.player1 + (myDecision === 'COOPERATE' ? 1 : 0),
          player2: prev.player2 + (opponentDecision === 'COOPERATE' ? 1 : 0)
        }));
        
        setBetrayalCount(prev => ({
          player1: prev.player1 + (myDecision === 'BETRAY' ? 1 : 0),
          player2: prev.player2 + (opponentDecision === 'BETRAY' ? 1 : 0)
        }));
      } else {
        setCooperationCount(prev => ({
          player1: prev.player1 + (opponentDecision === 'COOPERATE' ? 1 : 0),
          player2: prev.player2 + (myDecision === 'COOPERATE' ? 1 : 0)
        }));
        
        setBetrayalCount(prev => ({
          player1: prev.player1 + (opponentDecision === 'BETRAY' ? 1 : 0),
          player2: prev.player2 + (myDecision === 'BETRAY' ? 1 : 0)
        }));
      }
      
      setCurrentSession((prev) => {
        if (!prev) return null;

        // Use total scores from server (already cumulative)
        const cumulativeYourScore = result.totalYourScore || result.yourPoints;
        const cumulativeOpponentScore = result.totalOpponentScore || result.opponentPoints;

        // Determine if we are playerA or playerB in the session
        const isPlayerA = prev.players[0].id === humanPlayer.id;
        
        const roundData: any = {
          roundNumber: result.round,
          decisions: [
            {
              playerId: humanPlayer.id,
              decision: myDecision === 'COOPERATE' ? Decision.STAY_SILENT : Decision.CONFESS,
              timestamp: new Date(),
            },
            {
              playerId: opponent.id,
              decision: opponentDecision === 'COOPERATE' ? Decision.STAY_SILENT : Decision.CONFESS,
              timestamp: new Date(),
            },
          ],
          results: {
            playerA: isPlayerA ? result.yourPoints : result.opponentPoints,
            playerB: isPlayerA ? result.opponentPoints : result.yourPoints,
          },
        };

        return {
          ...prev,
          rounds: [...prev.rounds, roundData],
        };
      });
    };

    // Handle new match round - update session phase to allow new decisions
    const handleNewMatchRound = (round: number, timerDuration?: number, messageMatchId?: string) => {
      console.log('🏆 Tournament match - new round:', round, 'Timer:', timerDuration, 'MatchId:', messageMatchId);
      
      // Ignore messages from other matches
      if (messageMatchId && messageMatchId !== matchId) {
        console.log('⚠️ Ignoring new round from different match:', messageMatchId);
        return;
      }
      
      const matchRound = round;
      
      // Update timer sync to trigger new round in GameBoard
      // Add timestamp to ensure React detects the change
      setTimerSync({
        round: matchRound,
        duration: timerDuration || 30,
        timestamp: Date.now()
      } as any);
      
      setCurrentSession((prev) => {
        if (!prev) return null;
        
        return {
          ...prev,
          currentPhase: GamePhase.TRUST_PHASE, // Reset to trust phase for new round (decision making)
        };
      });
    };

    // Handle match completion - report result to tournament
    const handleMatchCompleted = async (data: any) => {
      console.log('🏆 Tournament match completed:', data);
      
      // Calculate actual scores from session rounds
      let actualMyScore = 0;
      let actualOpponentScore = 0;
      
      if (currentSession) {
        // Determine if we are playerA or playerB in the session
        const isPlayerA = currentSession.players[0].id === humanPlayer.id;
        
        console.log('📊 Score calculation:', {
          humanPlayerId: humanPlayer.id,
          opponentId: opponent.id,
          sessionPlayers: currentSession.players.map((p: any) => ({ id: p.id, name: p.name })),
          isPlayerA: isPlayerA,
          roundsCount: currentSession.rounds.length
        });
        
        currentSession.rounds.forEach((round: any, index: number) => {
          if (round.results) {
            const myRoundScore = isPlayerA ? round.results.playerA : round.results.playerB;
            const opponentRoundScore = isPlayerA ? round.results.playerB : round.results.playerA;
            
            actualMyScore += myRoundScore;
            actualOpponentScore += opponentRoundScore;
            
            console.log(`📊 Round ${index}: My score: ${myRoundScore}, Opponent score: ${opponentRoundScore}, Total: ${actualMyScore}-${actualOpponentScore}`);
          }
        });
      }
      
      console.log('📊 Final scores calculated:', { 
        actualMyScore, 
        actualOpponentScore, 
        isWinner: actualMyScore > actualOpponentScore,
        humanPlayerId: humanPlayer.id,
        opponentId: opponent.id,
        sessionPlayers: currentSession?.players
      });
      
      // Determine winner based on actual scores
      const winnerId = actualMyScore > actualOpponentScore ? humanPlayer.id : 
                      actualMyScore < actualOpponentScore ? opponent.id : null;
      const loserId = winnerId === humanPlayer.id ? opponent.id : 
                     winnerId === opponent.id ? humanPlayer.id : null;
      
      // Determine which player is player1 and player2 based on session
      const sessionPlayer1 = currentSession?.players[0];
      const sessionPlayer2 = currentSession?.players[1];
      const isHumanPlayer1 = sessionPlayer1?.id === humanPlayer.id;
      
      // Map scores correctly to player1 and player2
      const player1Score = isHumanPlayer1 ? actualMyScore : actualOpponentScore;
      const player2Score = isHumanPlayer1 ? actualOpponentScore : actualMyScore;
      
      console.log('🏆 Match result mapping:', {
        humanPlayerId: humanPlayer.id,
        opponentId: opponent.id,
        sessionPlayer1Id: sessionPlayer1?.id,
        sessionPlayer2Id: sessionPlayer2?.id,
        isHumanPlayer1,
        actualMyScore,
        actualOpponentScore,
        player1Score,
        player2Score,
        winnerId
      });
      
      // Create match result with statistics
      const matchResult: MatchResult = {
        matchId,
        player1Id: sessionPlayer1?.id || humanPlayer.id,
        player2Id: sessionPlayer2?.id || opponent.id,
        player1Score,
        player2Score,
        winnerId: winnerId || humanPlayer.id, // Default to humanPlayer if tie
        loserId: loserId || opponent.id,
        gameSessionId: matchId,
        statistics: {
          totalRounds: currentSession?.rounds.length || 0,
          player1Cooperations: cooperationCount.player1,
          player1Betrayals: betrayalCount.player1,
          player2Cooperations: cooperationCount.player2,
          player2Betrayals: betrayalCount.player2,
          matchDuration: Math.floor((Date.now() - (currentSession?.startTime.getTime() || Date.now())) / 1000)
        },
        completedAt: new Date()
      };
      
      console.log('🏆 Reporting match result to tournament:', matchResult);
      
      // Send match result to server
      partyWsClient.send({
        type: 'TOURNAMENT_MATCH_RESULT',
        tournamentId,
        matchResult
      });
      
      // Save match to database
      if (currentSession && winnerId) {
        try {
          const matchRecordingService = getMatchRecordingService();
          const tournamentMatchData = matchRecordingService.createTournamentMatchDataFromSession(
            currentSession,
            matchId,
            tournamentId,
            tournamentRoundNumber,
            winnerId,
            true // isEliminationMatch
          );
          
          await matchRecordingService.saveTournamentMatch(tournamentMatchData);
          console.log('✅ Tournament match saved to database');
        } catch (error) {
          console.error('❌ Failed to save tournament match to database:', error);
          // Don't block UI - error is already queued for retry
        }
      }
      
      // Use server scores if available, otherwise use calculated scores
      let finalPlayer1Score, finalPlayer2Score;
      
      if (data.finalScores) {
        console.log('📊 Using server scores from data:', data.finalScores);
        finalPlayer1Score = data.finalScores.player1;
        finalPlayer2Score = data.finalScores.player2;
      } else {
        console.log('📊 Using calculated scores');
        // Determine if we are playerA or playerB in the session
        const isPlayerA = currentSession?.players[0].id === humanPlayer.id;
        finalPlayer1Score = isPlayerA ? actualMyScore : actualOpponentScore;
        finalPlayer2Score = isPlayerA ? actualOpponentScore : actualMyScore;
      }
      
      const stats = {
        finalScores: { 
          player1: finalPlayer1Score,
          player2: finalPlayer2Score
        },
        yourScore: actualMyScore,
        opponentScore: actualOpponentScore,
        gameEndReason: 'normal',
        matchResult,
        isWinner: actualMyScore > actualOpponentScore
      };
      
      console.log('📊 Setting game statistics:', stats);
      
      setGameStatistics(stats);
      
      // Show decision reversal option after 3 seconds
      setTimeout(() => {
        setMatchState(MatchState.DECISION_REVERSAL);
        setReversalTimeLeft(60);
        setReversalResponseStatus({
          playerResponded: false,
          opponentResponded: false,
          waitingForOpponent: false,
        });
      }, 3000);
    };

    // Handle opponent forfeit
    const handleOpponentForfeited = async (data: any) => {
      console.log('🏳️ Tournament opponent forfeited:', data);
      
      // Create forfeit match result
      const matchResult: MatchResult = {
        matchId,
        player1Id: humanPlayer.id,
        player2Id: opponent.id,
        player1Score: 30, // Winner gets default score
        player2Score: 0,
        winnerId: humanPlayer.id,
        loserId: opponent.id,
        gameSessionId: matchId,
        statistics: {
          totalRounds: currentSession?.rounds.length || 0,
          player1Cooperations: cooperationCount.player1,
          player1Betrayals: betrayalCount.player1,
          player2Cooperations: cooperationCount.player2,
          player2Betrayals: betrayalCount.player2,
          matchDuration: Math.floor((Date.now() - (currentSession?.startTime.getTime() || Date.now())) / 1000)
        },
        completedAt: new Date()
      };
      
      console.log('🏆 Reporting forfeit result to tournament:', matchResult);
      
      // Send forfeit result to server
      partyWsClient.send({
        type: 'TOURNAMENT_MATCH_RESULT',
        tournamentId,
        matchResult
      });
      
      // Save forfeit match to database
      if (currentSession) {
        try {
          const matchRecordingService = getMatchRecordingService();
          const tournamentMatchData = matchRecordingService.createTournamentMatchDataFromSession(
            currentSession,
            matchId,
            tournamentId,
            tournamentRoundNumber,
            humanPlayer.id, // Winner by forfeit
            true // isEliminationMatch
          );
          
          await matchRecordingService.saveTournamentMatch(tournamentMatchData);
          console.log('✅ Forfeit match saved to database');
        } catch (error) {
          console.error('❌ Failed to save forfeit match to database:', error);
          // Don't block UI - error is already queued for retry
        }
      }
      
      const forfeitStats = {
        finalScores: { player1: 30, player2: 0 },
        gameEndReason: 'opponent_forfeit',
        isWinner: true,
        matchResult
      };
      
      setGameStatistics(forfeitStats);
      setMatchState(MatchState.STATISTICS);
    };

    // Handle opponent messages
    const handleOpponentMessage = (message: string, timestamp: number) => {
      console.log('💬 Tournament match - opponent message:', message, 'opponent:', opponent.id, 'me:', humanPlayer.id);
      
      // Check if this message is already in our messages array (duplicate prevention)
      setMessages(prev => {
        const isDuplicate = prev.some(m => 
          m.message === message && 
          Math.abs(m.timestamp.getTime() - timestamp) < 1000
        );
        
        if (isDuplicate) {
          console.log('💬 Duplicate message detected, skipping');
          return prev;
        }
        
        return [...prev, {
          playerId: opponent.id,
          message: message,
          timestamp: new Date(timestamp)
        }];
      });
    };

    // Handle game over (when all rounds complete)
    const handleGameOver = (data: any) => {
      console.log('🏁 Tournament match game over:', data);
      
      // Ignore messages from other matches
      if (data.matchId && data.matchId !== matchId) {
        console.log('⚠️ Ignoring game over from different match:', data.matchId);
        return;
      }
      
      // Update session with actual maxRounds from server
      if (data.totalRounds && currentSession) {
        setCurrentSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            sessionConfig: {
              ...prev.sessionConfig,
              maxRounds: data.totalRounds
            }
          };
        });
      }
      
      // Pass server scores to handleMatchCompleted
      handleMatchCompleted(data);
    };

    // Handle SHOW_STATISTICS from server (after decision reversal)
    const handleShowStatistics = (data: any) => {
      console.log('📊 SHOW_STATISTICS received from server:', data);
      
      // Use server scores directly
      setGameStatistics(prev => ({
        ...prev,
        yourScore: data.yourScore,
        opponentScore: data.opponentScore,
        finalScores: data.finalScores || data.scores || prev?.finalScores,
        updatedDecisions: data.updatedDecisions || prev?.updatedDecisions,
      }));
      
      // Go to statistics screen
      setMatchState(MatchState.STATISTICS);
    };

    // Handle reversal approved - both players accepted
    const handleReversalApproved = (data: any) => {
      console.log('🔁 Reversal approved, showing round selection');
      setMatchState(MatchState.ROUND_SELECTION);
    };

    // Set up event handlers using available methods
    partyWsClient.setOnTournamentMatchCompleted(handleMatchCompleted);
    partyWsClient.setOnTournamentOpponentForfeited(handleOpponentForfeited);
    partyWsClient.onRoundResult(handleMatchRoundResult);
    partyWsClient.onNewRound(handleNewMatchRound);
    partyWsClient.onOpponentMessage(handleOpponentMessage);
    partyWsClient.onGameOver(handleGameOver);
    partyWsClient.onShowStatistics(handleShowStatistics);
    partyWsClient.onReversalApproved(handleReversalApproved);
    
    // Decision reversal handlers
    partyWsClient.onReversalResponseReceived(() => {
      console.log('✅ Reversal response received from opponent');
      setReversalResponseStatus(prev => ({
        ...prev,
        opponentResponded: true,
        waitingForOpponent: false
      }));
    });

    partyWsClient.onReversalRejected((message: string) => {
      console.log('❌ Reversal rejected:', message);
      setReversalRejectionMessage(message);
      setMatchState(MatchState.STATISTICS);
    });

    partyWsClient.onReversalSelectionPhase((message: string) => {
      console.log('🔄 Reversal selection phase:', message);
      setReversalSelectionMessage(message);
      setMatchState(MatchState.ROUND_SELECTION);
    });

    partyWsClient.onDecisionChanged((data: any) => {
      console.log('✅ Decision changed successfully:', data);

      // Update local session data with new decision
      setCurrentSession(prev => {
        if (!prev) return prev;

        const updatedRounds = [...prev.rounds];
        const roundIndex = updatedRounds.findIndex((r: any) => r.roundNumber === data.roundNumber);

        if (roundIndex >= 0) {
          const round = updatedRounds[roundIndex];
          const playerDecisionIndex = round.decisions.findIndex((d: any) => d.playerId === humanPlayer.id);

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
      if (partyWsClient && matchId) {
        console.log('📤 Auto-completing decision changes for match:', matchId);
        partyWsClient.sendDecisionChangesComplete(matchId);

        // Show waiting message
        setMatchState(MatchState.DECISION_REVERSAL);
        setReversalRejectionMessage('Kararınız değiştirildi. Diğer oyuncunun tamamlamasını bekliyoruz...');
      } else {
        console.error('❌ Cannot auto-complete: partyWsClient or matchId missing');
      }
    });

    partyWsClient.onFinalScoresUpdate((data: any) => {
      console.log('🎯 Final scores update received:', data);
      
      // Server already sends yourScore and opponentScore correctly
      const yourScore = data.yourScore;
      const opponentScore = data.opponentScore;
      
      console.log('🏆 Final scores from server:', {
        yourScore,
        opponentScore,
        finalScores: data.finalScores,
        winner: data.winner,
        isWinner: yourScore > opponentScore
      });
      
      // Update game statistics with final scores
      setGameStatistics((prev: any) => ({
        ...prev,
        finalScores: data.finalScores,
        yourScore: yourScore,
        opponentScore: opponentScore,
        isWinner: yourScore > opponentScore,
        winner: data.winner,
        updatedDecisions: data.updatedDecisions
      }));
      
      // Go to statistics screen
      setMatchState(MatchState.STATISTICS);
    });

    return () => {
      console.log('🏆 TournamentMatchGame unmounted');
      // Clean up handlers
      partyWsClient.setOnTournamentMatchCompleted(() => {});
      partyWsClient.setOnTournamentOpponentForfeited(() => {});
      partyWsClient.onRoundResult(() => {});
      partyWsClient.onNewRound(() => {});
      partyWsClient.onOpponentMessage(() => {});
      partyWsClient.onGameOver(() => {});
      partyWsClient.onShowStatistics(() => {});
      partyWsClient.onReversalApproved(() => {});
      partyWsClient.onReversalResponseReceived(() => {});
      partyWsClient.onReversalRejected(() => {});
      partyWsClient.onReversalSelectionPhase(() => {});
      partyWsClient.onDecisionChanged(() => {});
      partyWsClient.onFinalScoresUpdate(() => {});
    };
  }, [matchId, tournamentId, humanPlayer.id, opponent.id]);

  // Reversal countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (matchState === MatchState.DECISION_REVERSAL && !reversalResponseStatus.playerResponded) {
      console.log('⏰ Starting reversal countdown timer');
      interval = setInterval(() => {
        setReversalTimeLeft(prev => {
          if (prev <= 1) {
            // Time's up - auto reject
            console.log('⏰ Reversal timeout - auto rejecting');
            if (partyWsClient && matchId) {
              partyWsClient.send({
                type: 'DECISION_REVERSAL_RESPONSE',
                matchId: matchId,
                tournamentId: tournamentId,
                accept: false,
              });
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
  }, [matchState, reversalResponseStatus.playerResponded]);

  const handleForfeit = () => {
    console.log('🏳️ Player forfeiting tournament match');
    
    // Create forfeit match result
    const matchResult: MatchResult = {
      matchId,
      player1Id: humanPlayer.id,
      player2Id: opponent.id,
      player1Score: 0,
      player2Score: 30, // Opponent wins by forfeit
      winnerId: opponent.id,
      loserId: humanPlayer.id,
      gameSessionId: matchId,
      statistics: {
        totalRounds: currentSession?.rounds.length || 0,
        player1Cooperations: cooperationCount.player1,
        player1Betrayals: betrayalCount.player1,
        player2Cooperations: cooperationCount.player2,
        player2Betrayals: betrayalCount.player2,
        matchDuration: Math.floor((Date.now() - (currentSession?.startTime.getTime() || Date.now())) / 1000)
      },
      completedAt: new Date()
    };
    
    console.log('🏆 Reporting forfeit to tournament:', matchResult);
    
    // Send forfeit with match result
    partyWsClient.send({
      type: 'TOURNAMENT_FORFEIT',
      matchId,
      tournamentId,
      matchResult
    });

    // Mark player as eliminated
    partyWsClient.send({
      type: 'TOURNAMENT_PLAYER_ELIMINATED',
      tournamentId,
      playerId: humanPlayer.id,
      reason: 'forfeit'
    });

    onMatchEnd('forfeit');
  };

  const calculateCooperationPercentage = (session: GameSession): number => {
    if (!session.rounds || session.rounds.length === 0) return 0;

    const humanDecisions = session.rounds
      .map((round) => round.decisions.find((d) => d.playerId === humanPlayer.id))
      .filter((d) => d !== undefined);

    const cooperations = humanDecisions.filter(
      (d) => d!.decision === Decision.STAY_SILENT
    ).length;

    return (cooperations / humanDecisions.length) * 100;
  };

  const calculateBetrayalPercentage = (session: GameSession): number => {
    return 100 - calculateCooperationPercentage(session);
  };

  const calculateTrustScore = (session: GameSession): number => {
    const cooperationRate = calculateCooperationPercentage(session) / 100;
    return Math.round(50 + cooperationRate * 50);
  };

  const handleDecision = (decision: Decision) => {
    console.log('🏆 Tournament match - player decision:', decision);
    
    partyWsClient.send({
      type: 'GAME_DECISION',
      matchId: matchId,
      decision: decision === Decision.STAY_SILENT ? 'COOPERATE' : 'BETRAY',
      round: currentSession?.rounds.length || 0, // Current match round (0-9)
    });
  };

  const handleCommunication = (message: string) => {
    console.log('💬 Tournament match communication:', message, 'from:', humanPlayer.id);
    
    // Add message locally for sender
    const newMessage = {
      playerId: humanPlayer.id,
      message: message,
      timestamp: new Date()
    };
    console.log('💬 Adding message locally:', newMessage);
    setMessages(prev => [...prev, newMessage]);
    
    // Send to server
    partyWsClient.send({
      type: 'GAME_MESSAGE',
      matchId: matchId,
      message: message,
      timestamp: Date.now(),
    });
  };

  const handleMatchEnd = (matchEndType?: string) => {
    console.log('🏁 Tournament match end:', matchEndType);
    // Match end is handled by the statistics panel
    // This is just a placeholder for the TournamentMatchBoard component
  };

  const handleDecisionReversal = (accept: boolean) => {
    console.log(`🔄 Decision reversal: ${accept ? 'ACCEPT' : 'DECLINE'}`);
    console.log('Current reversal status:', reversalResponseStatus);
    
    // Always send response to server first
    if (partyWsClient && matchId) {
      console.log('📤 Sending reversal response to server');
      partyWsClient.send({
        type: 'DECISION_REVERSAL_RESPONSE',
        matchId: matchId,
        tournamentId: tournamentId,
        accept: accept,
      });
    }

    // Mark that this player has responded and set waiting state
    setReversalResponseStatus((prev) => ({
      ...prev,
      playerResponded: true,
      waitingForOpponent: true, // Always wait for opponent's response
    }));

    console.log('📝 Player response sent, waiting for server to handle both responses');
    
    // Don't change state here - wait for server response
    // Server will send appropriate message based on both players' responses
  };

  // Decision Reversal Screen
  if (matchState === MatchState.DECISION_REVERSAL) {
    return (
      <div className="decision-reversal-screen">
        <div className="reversal-card">
          <h2>🔄 Karar Değiştirme Fırsatı</h2>
          
          {reversalResponseStatus.waitingForOpponent ? (
            <div className="waiting-for-opponent">
              <div className="waiting-icon">⏳</div>
              <h3>Yanıtınız Alındı</h3>
              <p>Diğer oyuncunun yanıtı bekleniyor...</p>
              <div className="loading-spinner"></div>
              <p className="waiting-note">Her iki oyuncu kabul ederse kararlarınızı değiştirebileceksiniz.</p>
            </div>
          ) : (
            <>
              <div className="reversal-timer-banner">
                <span className="timer-icon">⏰</span>
                <span className="timer-text">Kalan Süre: <strong>{reversalTimeLeft}</strong> saniye</span>
              </div>
              
              <div className="reversal-content">
                <div className="reversal-icon">🎯</div>
                <h3>Maç Tamamlandı!</h3>
                <p className="reversal-question">Kararlarınızı gözden geçirmek ister misiniz?</p>
                <p className="reversal-note">
                  <span className="note-icon">ℹ️</span>
                  Her iki oyuncu kabul ederse, istediğiniz bir turu seçip kararınızı değiştirebilirsiniz.
                </p>
              </div>

              <div className="reversal-buttons">
                <button
                  className="reversal-btn decline-btn"
                  onClick={() => handleDecisionReversal(false)}
                  disabled={reversalResponseStatus.playerResponded}
                >
                  <span className="btn-icon">❌</span>
                  <span className="btn-text">Hayır, Sonuçları Gör</span>
                </button>
                <button
                  className="reversal-btn accept-btn"
                  onClick={() => handleDecisionReversal(true)}
                  disabled={reversalResponseStatus.playerResponded}
                >
                  <span className="btn-icon">✅</span>
                  <span className="btn-text">Evet, Değiştirmek İstiyorum</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Round Selection Screen
  if (matchState === MatchState.ROUND_SELECTION && currentSession) {
    return (
      <div className="decision-reversal-screen">
        <div className="reversal-card">
          <h2>🔄 Hangi Turu Değiştirmek İstiyorsunuz?</h2>
          <p>Değiştirmek istediğiniz turu seçin:</p>
          
          <div className="round-selection">
            <div className="rounds-grid">
              {currentSession.rounds.map((round: any, index: number) => (
                <button
                  key={index}
                  className="round-btn"
                  onClick={() => {
                    setSelectedRoundForChange(round.roundNumber);
                    setMatchState(MatchState.DECISION_CHANGE);
                  }}
                >
                  Tur {round.roundNumber + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="selection-actions">
            <button 
              className="cancel-selection-btn"
              onClick={() => {
                setMatchState(MatchState.STATISTICS);
              }}
            >
              ❌ İptal Et ve Sonuçları Gör
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Decision Change Screen
  if (matchState === MatchState.DECISION_CHANGE && selectedRoundForChange !== null && currentSession) {
    const selectedRound = currentSession.rounds.find((r: any) => r.roundNumber === selectedRoundForChange);
    const myDecision = selectedRound?.decisions.find((d: any) => d.playerId === humanPlayer.id);
    const opponentDecision = selectedRound?.decisions.find((d: any) => d.playerId === opponent.id);
    
    const handleDecisionChange = (newDecision: Decision) => {
      console.log('🔄 Decision change submitted:', {
        selectedRound: selectedRoundForChange,
        newDecision: newDecision,
        currentMatchId: matchId,
        totalRounds: currentSession?.rounds.length
      });

      if (partyWsClient && matchId && selectedRoundForChange !== null) {
        // Convert Decision enum to server format
        const serverDecision = newDecision === Decision.STAY_SILENT ? 'COOPERATE' : 'BETRAY';

        console.log('📤 Sending decision change request to server:', {
          round: selectedRoundForChange,
          newDecision: serverDecision,
          matchId: matchId
        });

        partyWsClient.sendDecisionChangeRequest(matchId, selectedRoundForChange, serverDecision);
        
        // Wait for server response (onDecisionChanged will handle the transition)
        // Don't change state here
      } else {
        console.error('❌ Cannot send decision change - missing data');
        setMatchState(MatchState.STATISTICS);
      }
    };
    
    return (
      <div className="decision-reversal-screen">
        <div className="reversal-card">
          <h2>🔄 Tur {selectedRoundForChange + 1} - Kararınızı Değiştirin</h2>
          <p>Yeni kararınızı seçin:</p>

          <div className="decision-buttons">
            <button
              className="decision-btn stay-silent-btn"
              onClick={() => handleDecisionChange(Decision.STAY_SILENT)}
            >
              🤝 İşbirliği Yap
            </button>
            <button
              className="decision-btn confess-btn"
              onClick={() => handleDecisionChange(Decision.CONFESS)}
            >
              ⚡ İhanet Et
            </button>
          </div>

          <div className="change-actions">
            <button
              className="back-btn"
              onClick={() => setMatchState(MatchState.ROUND_SELECTION)}
            >
              ← Farklı Bir Tur Seç
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (matchState === MatchState.STATISTICS && currentSession && gameStatistics) {
    return (
      <div className="tournament-match-statistics">
        <AtmosphericEffects
          currentPhase={GamePhase.TRUST_PHASE}
        />

        {statisticsTimeout > 0 && (
          <div className="statistics-timeout-banner">
            <p>⏰ Otomatik olarak turnuvaya dönülecek: {statisticsTimeout} saniye</p>
          </div>
        )}

        <StatisticsPanel
          statistics={{
            cooperationPercentage: calculateCooperationPercentage(currentSession),
            betrayalPercentage: calculateBetrayalPercentage(currentSession),
            totalPoints: gameStatistics.yourScore || gameStatistics.finalScores?.player1 || 0,
            opponentTotalPoints: gameStatistics.opponentScore || gameStatistics.finalScores?.player2 || 0,
            gameEndReason: gameStatistics.gameEndReason,
            gamesWon: gameStatistics.isWinner ? 1 : 0,
            gamesLost: gameStatistics.isWinner ? 0 : 1,
            averageTrustScore: calculateTrustScore(currentSession),
          }}
          session={currentSession}
          isMultiplayer={true}
          onClose={() => onMatchEnd('normal')}
        />

        <div className="tournament-continue">
          <button 
            className="continue-tournament-btn"
            onClick={() => onMatchEnd('normal')}
          >
            🏆 Şimdi Turnuvaya Dön
          </button>
        </div>
      </div>
    );
  }

  if (!currentSession) {
    return (
      <div className="tournament-match-loading">
        <h2>🏆 Turnuva Maçı Yükleniyor...</h2>
        <p>Rakip: {opponent.name}</p>
      </div>
    );
  }

  return (
    <div className="tournament-match-game">
      <AtmosphericEffects
        currentPhase={currentSession.currentPhase}
      />

      <div className="tournament-match-header">
        <h2>🏆 Turnuva Maçı - Tur {tournamentRoundNumber}</h2>
        <div className="match-info">
          <span className="player-name">{humanPlayer.displayName || humanPlayer.username}</span>
          <span className="vs">VS</span>
          <span className="opponent-name">{opponent.name}</span>
        </div>
      </div>

      <TournamentMatchBoard
        session={currentSession}
        humanPlayer={userToPlayer(humanPlayer)}
        opponent={opponent}
        onPlayerDecision={handleDecision}
        onCommunicationMessage={handleCommunication}
        onMatchEnd={handleMatchEnd}
        messages={messages}
        timerSync={timerSync}
      />

      <div className="tournament-match-actions">
        <button 
          className="forfeit-btn"
          onClick={handleForfeit}
        >
          🏳️ Pes Et
        </button>
      </div>
    </div>
  );
};
