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
  partyWsClient: PartyWebSocketClient;
  onMatchEnd: (result?: 'normal' | 'forfeit') => void;
}

enum MatchState {
  WAITING = 'waiting',
  IN_GAME = 'in_game',
  DECISION_REVERSAL = 'decision_reversal',
  STATISTICS = 'statistics',
}

export const TournamentMatchGame: React.FC<TournamentMatchGameProps> = ({
  humanPlayer,
  opponent,
  matchId,
  tournamentId,
  tournamentRoundNumber,
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
    waitingForOpponent: boolean;
  }>({
    playerResponded: false,
    waitingForOpponent: false,
  });

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
        maxRounds: 10,
        trustPhaseRounds: 0,
        communicationTimeLimit: 30,
        allowDecisionReversal: true,
        gameMode: GameMode.MULTIPLAYER,
      },
    };

    setCurrentSession(initialSession);

    // Handle match round results - track cooperation/betrayal for each round within the match
    const handleMatchRoundResult = (result: any) => {
      console.log('🏆 Tournament match round result:', result);
      
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

        // Calculate cumulative scores up to this round
        const previousRounds = prev.rounds || [];
        let cumulativeYourScore = result.yourPoints;
        let cumulativeOpponentScore = result.opponentPoints;
        
        // Add scores from previous rounds
        previousRounds.forEach((round: any) => {
          if (round.results) {
            cumulativeYourScore += round.results.playerA;
            cumulativeOpponentScore += round.results.playerB;
          }
        });

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
            playerA: result.yourPoints, // Points earned this round only
            playerB: result.opponentPoints, // Points earned this round only
          },
        };

        return {
          ...prev,
          rounds: [...prev.rounds, roundData],
        };
      });
    };

    // Handle new match round - update session phase to allow new decisions
    const handleNewMatchRound = (matchRound: number, timerDuration?: number) => {
      console.log('🏆 Tournament match - new round:', matchRound, 'Timer:', timerDuration);
      
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
      
      // Server sends scores from our perspective (totalYourScore, totalOpponentScore)
      // or as player1/player2 scores
      let myScore = 0;
      let opponentScore = 0;
      
      if (data.finalScores) {
        myScore = data.finalScores.player1 || 0;
        opponentScore = data.finalScores.player2 || 0;
      } else if (data.scores) {
        myScore = data.scores.player1 || 0;
        opponentScore = data.scores.player2 || 0;
      }
      
      // Determine winner based on scores
      const winnerId = myScore > opponentScore ? humanPlayer.id : 
                      myScore < opponentScore ? opponent.id : null;
      const loserId = winnerId === humanPlayer.id ? opponent.id : 
                     winnerId === opponent.id ? humanPlayer.id : null;
      
      // Create match result with statistics
      const matchResult: MatchResult = {
        matchId,
        player1Id: humanPlayer.id,
        player2Id: opponent.id,
        player1Score: myScore,
        player2Score: opponentScore,
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
      
      const stats = {
        finalScores: { player1: actualMyScore, player2: actualOpponentScore },
        gameEndReason: 'normal',
        matchResult,
        isWinner: actualMyScore > actualOpponentScore
      };
      
      setGameStatistics(stats);
      
      // Show decision reversal option after 3 seconds
      setTimeout(() => {
        setMatchState(MatchState.DECISION_REVERSAL);
        setReversalTimeLeft(60);
        setReversalResponseStatus({
          playerResponded: false,
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

    // Handle game over (when all 10 rounds complete)
    const handleGameOver = (data: any) => {
      console.log('🏁 Tournament match game over:', data);
      handleMatchCompleted(data);
    };

    // Handle SHOW_STATISTICS from server (after decision reversal)
    const handleShowStatistics = (data: any) => {
      console.log('📊 SHOW_STATISTICS received from server:', data);
      
      // Update statistics if provided
      if (data.scores || data.finalScores) {
        setGameStatistics(prev => ({
          ...prev,
          finalScores: data.finalScores || data.scores || prev?.finalScores,
        }));
      }
      
      // Go to statistics screen
      setMatchState(MatchState.STATISTICS);
    };

    // Set up event handlers using available methods
    partyWsClient.setOnTournamentMatchCompleted(handleMatchCompleted);
    partyWsClient.setOnTournamentOpponentForfeited(handleOpponentForfeited);
    partyWsClient.onRoundResult(handleMatchRoundResult);
    partyWsClient.onNewRound(handleNewMatchRound);
    partyWsClient.onOpponentMessage(handleOpponentMessage);
    partyWsClient.onGameOver(handleGameOver);
    partyWsClient.onShowStatistics(handleShowStatistics);

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
            setReversalResponseStatus(prev => ({
              ...prev,
              playerResponded: true,
            }));
            // Go directly to statistics
            setMatchState(MatchState.STATISTICS);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (reversalResponseStatus.playerResponded) {
      console.log('⏰ Player already responded, stopping timer');
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
    
    // Mark that player responded
    setReversalResponseStatus({
      playerResponded: true,
      waitingForOpponent: !accept, // Only wait if accepted
    });

    // Send response to server
    partyWsClient.send({
      type: 'DECISION_REVERSAL_RESPONSE',
      matchId: matchId,
      tournamentId: tournamentId,
      accept: accept,
    });

    console.log('📤 Sent decision reversal response to server:', accept);
    
    // If declined, server will send SHOW_STATISTICS immediately
    // If accepted, wait for server to handle both players' responses
  };

  // Decision Reversal Screen
  if (matchState === MatchState.DECISION_REVERSAL) {
    return (
      <div className="decision-reversal-screen">
        <div className="reversal-card">
          <h2>🔄 Karar Değiştirme</h2>
          
          {reversalResponseStatus.waitingForOpponent ? (
            <div className="waiting-for-opponent">
              <p>Yanıtınız alındı. Diğer oyuncunun yanıtı bekleniyor...</p>
              <div className="loading-spinner"></div>
            </div>
          ) : (
            <>
              <div className="reversal-timer">
                <p>⏰ Kalan süre: {reversalTimeLeft} saniye</p>
              </div>
              <p>Maç bitti! Kararlarınızı gözden geçirmek ister misiniz?</p>
              <p className="reversal-note">Her iki oyuncu kabul ederse, kararlar yeniden değerlendirilebilir.</p>
              <div className="reversal-buttons">
                <button
                  className="reversal-btn decline-btn"
                  onClick={() => handleDecisionReversal(false)}
                  disabled={reversalResponseStatus.playerResponded}
                >
                  Hayır, Değiştirmek İstemiyorum
                </button>
                <button
                  className="reversal-btn accept-btn"
                  onClick={() => handleDecisionReversal(true)}
                  disabled={reversalResponseStatus.playerResponded}
                >
                  Evet, Bir Kararımı Değiştirmek İstiyorum
                </button>
              </div>
            </>
          )}
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

        <StatisticsPanel
          statistics={{
            cooperationPercentage: calculateCooperationPercentage(currentSession),
            betrayalPercentage: calculateBetrayalPercentage(currentSession),
            totalPoints: gameStatistics.finalScores.player1 || 0,
            opponentTotalPoints: gameStatistics.finalScores.player2 || 0,
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
            🏆 Turnuvaya Dön
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
