import React, { useMemo, useState, useEffect } from 'react';
import { GameBoardProps, Decision, GamePhase } from '../types';
import AtmosphericEffects from './AtmosphericEffects';
import TenseDialogue from './TenseDialogue';
import CommunicationPanel from './CommunicationPanel';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import './GameBoard.css';

const GameBoard: React.FC<GameBoardProps> = ({
  session,
  currentPlayer,
  onDecision,
  onCommunication,
  messages = [],
  timerSync,
}) => {
  const { t } = useTranslation();
  const { isMobile, isTablet } = useViewportSize();
  const [isDecisionMoment, setIsDecisionMoment] = useState(false);
  const [decisionTimer, setDecisionTimer] = useState<number | null>(null);
  const [showRoundResult, setShowRoundResult] = useState(false);
  const [lastRoundResult, setLastRoundResult] = useState<any>(null);
  const [hasPlayerDecided, setHasPlayerDecided] = useState(false);
  const [currentDecision, setCurrentDecision] = useState<Decision | null>(null);
  const [reversalTimer, setReversalTimer] = useState<number | null>(null);

  // Calculate current scores for both players
  const playerScores = useMemo(() => {
    const scores: { [playerId: string]: number } = {};

    session.players.forEach((player) => {
      scores[player.id] = 0;
    });

    session.rounds.forEach((round, index) => {
      if (round.decisions.length === 2 && round.results) {
        const playerAId = session.players[0].id;
        const playerBId = session.players[1].id;

        scores[playerAId] += round.results.playerA;
        scores[playerBId] += round.results.playerB;

        console.log(`🎮 Round ${index} Score Calculation:`, {
          playerAId,
          playerBId,
          playerAPoints: round.results.playerA,
          playerBPoints: round.results.playerB,
          currentScores: { ...scores },
        });
      }
    });

    console.log('📊 Final Player Scores:', scores);
    return scores;
  }, [session.rounds, session.players]);

  // Calculate current round based on completed rounds
  // If we have completed rounds, next round is length + 1
  // But we need to check if current round is already in progress
  const completedRounds = session.rounds.filter(
    (r) => r.decisions.length === 2
  );
  const currentRound = completedRounds.length + 1;
  const isDecisionPhase = session.currentPhase === GamePhase.TRUST_PHASE;

  console.log('🎮 GameBoard Round Calculation:', {
    totalRounds: session.rounds.length,
    completedRounds: completedRounds.length,
    currentRound,
  });

  // Get opponent player
  const opponent = session.players.find((p) => p.id !== currentPlayer.id);

  // Start timer based on server sync (for multiplayer) or local logic (for single player)
  useEffect(() => {
    if (timerSync) {
      // Multiplayer: Use server-synchronized timer
      console.log(
        `🎮 Starting synchronized timer for round ${timerSync.round}: ${timerSync.duration}s`
      );

      // Reset states for new round - always reset when timerSync changes
      setHasPlayerDecided(false);
      setIsDecisionMoment(false);
      setCurrentDecision(null);
      setReversalTimer(null);
      // Don't hide round result immediately - let the timeout handle it
      // setShowRoundResult(false); 
      
      // Start the decision timer for the new round
      setDecisionTimer(timerSync.duration);
    } else {
      // Single player: Use original logic
      // Don't start timer if showing round result or if timer already running
      if (showRoundResult || decisionTimer !== null) return;

      // Check if this round is already completed
      const currentRoundData = session.rounds.find(
        (r) => r.roundNumber === currentRound - 1
      );
      const isRoundCompleted =
        currentRoundData && currentRoundData.decisions.length === 2;

      if (isDecisionPhase && !isRoundCompleted) {
        // Reset states and directly start timer for all rounds
        setIsDecisionMoment(false);
        setDecisionTimer(30);
      }
    }
  }, [
    isDecisionPhase,
    currentRound,
    showRoundResult,
    session.rounds.length,
    timerSync, // Watch the entire timerSync object
  ]);

  // Decision timer countdown
  useEffect(() => {
    // Pause timer if showing round result
    if (showRoundResult || decisionTimer === null) return;

    if (decisionTimer > 0) {
      const timer = setTimeout(() => {
        setDecisionTimer(prev => prev !== null ? prev - 1 : null);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (decisionTimer === 0 && !hasPlayerDecided) {
      // Auto-select "Stay Silent" when timer reaches 0
      handleDecision(Decision.STAY_SILENT);
    }
  }, [decisionTimer, hasPlayerDecided, showRoundResult]);

  // Reversal timer countdown
  useEffect(() => {
    if (reversalTimer === null || reversalTimer <= 0) return;

    const timer = setTimeout(() => {
      setReversalTimer(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          // Time's up - decision is final
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [reversalTimer]);

  // Check if player has already made decision for current round
  useEffect(() => {
    // Check if current round already has player's decision
    const currentRoundData = session.rounds.find(
      (r) => r.roundNumber === currentRound - 1
    );

    if (currentRoundData && currentRoundData.decisions.length > 0) {
      const playerDecision = currentRoundData.decisions.find(
        (d) => d.playerId === currentPlayer.id
      );

      if (playerDecision) {
        setHasPlayerDecided(true);
      } else {
        setHasPlayerDecided(false);
      }
    } else {
      setHasPlayerDecided(false);
    }
  }, [currentRound, session.rounds, currentPlayer.id]);

  // Show round result animation when a new round is completed
  useEffect(() => {
    console.log('🎮 GameBoard: Checking for round results', {
      roundsLength: session.rounds.length,
      rounds: session.rounds,
    });

    if (session.rounds.length > 0) {
      const lastRound = session.rounds[session.rounds.length - 1];
      console.log('🎮 GameBoard: Last round data', lastRound);

      if (lastRound && lastRound.decisions.length === 2 && lastRound.results) {
        console.log('🎮 GameBoard: Round has complete data, showing result');

        const playerDecision = lastRound.decisions.find(
          (d) => d.playerId === currentPlayer.id
        );
        const opponentDecision = lastRound.decisions.find(
          (d) => d.playerId === opponent?.id
        );

        if (playerDecision && opponentDecision) {
          // Determine which player is A and which is B
          const isPlayerA = session.players[0].id === currentPlayer.id;
          const playerPoints = isPlayerA
            ? lastRound.results.playerA
            : lastRound.results.playerB;
          const opponentPoints = isPlayerA
            ? lastRound.results.playerB
            : lastRound.results.playerA;

          const resultData = {
            playerDecision: playerDecision.decision,
            opponentDecision: opponentDecision.decision,
            playerPoints,
            opponentPoints,
            roundNumber: lastRound.roundNumber,
          };

          console.log('🎮 GameBoard: Setting round result', resultData);
          setLastRoundResult(resultData);
          setShowRoundResult(true);

          // Stop timer when showing result
          setDecisionTimer(null);

          // Hide after 3 seconds and reset for next round
          setTimeout(() => {
            console.log('🎮 GameBoard: Hiding round result');
            setShowRoundResult(false);
            setHasPlayerDecided(false);
            setCurrentDecision(null);
            setReversalTimer(null);
            setDecisionTimer(null); // Clear timer to allow new round to start
            // Timer will be restarted by the main useEffect when new round begins
          }, 3000);
        }
      }
    }
  }, [session.rounds.length, session.rounds, currentPlayer.id, opponent?.id, session.players]);

  const handleDecision = (decision: Decision) => {
    if (isDecisionPhase && !hasPlayerDecided) {
      setHasPlayerDecided(true);
      setCurrentDecision(decision);
      setReversalTimer(5); // 5 seconds to reverse decision
      // Keep timer running until round result comes

      // Trigger decision moment effect
      setIsDecisionMoment(true);
      setTimeout(() => {
        setIsDecisionMoment(false);
      }, 2000);

      onDecision(decision);
    }
  };

  const handleReverseDecision = () => {
    if (reversalTimer !== null && reversalTimer > 0) {
      setHasPlayerDecided(false);
      setCurrentDecision(null);
      setReversalTimer(null);
      // Note: Server should handle decision reversal
    }
  };

  const getPhaseDisplay = () => {
    const maxRounds = session.sessionConfig.maxRounds;
    return `${t('gameBoard.round')} ${currentRound}/${maxRounds}`;
  };

  const getDecisionDisplay = (decision: Decision): string => {
    switch (decision) {
      case Decision.CONFESS:
        return t('gameBoard.confess');
      case Decision.STAY_SILENT:
        return t('gameBoard.staySilent');
      default:
        return t('gameBoard.noDecision');
    }
  };

  return (
    <div className={`game-board ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      <div className="game-header">
        <h1 className="game-title">TENELUX</h1>
        <div className="phase-indicator">
          <span className="phase-text">{getPhaseDisplay()}</span>
        </div>
      </div>

      <div className="game-content">
        {/* Tense Dialogue */}
        <TenseDialogue
          phase={session.currentPhase}
          roundNumber={currentRound}
          playerName={currentPlayer.name}
          isWaiting={false}
        />

        {/* Score Display */}
        <div className="score-section">
          <div className="player-score">
            <h3>{t('gameBoard.you')}</h3>
            <div className="score">{playerScores[currentPlayer.id] || 0}</div>
          </div>
          <div className="vs-divider">{t('gameBoard.vs')}</div>
          <div className="player-score">
            <h3>{t('gameBoard.opponent')}</h3>
            <div className="score">{playerScores[opponent?.id || ''] || 0}</div>
          </div>
        </div>

        {/* Decision Buttons */}
        {isDecisionPhase && !hasPlayerDecided && (
          <div className="decision-section">
            <div className="decision-prompt">
              <h2 className="decision-title">
                {t('gameBoard.makeYourChoice')}
              </h2>
              <p className="decision-subtitle">
                {t('gameBoard.chooseCarefully')}
              </p>
              {decisionTimer !== null && (
                <div className="decision-timer">
                  <p className="timer-text">
                    {t('gameBoard.timeLeft', { seconds: decisionTimer })}
                  </p>
                  <p className="auto-decision-warning">
                    {t('gameBoard.autoDecisionWarning')}
                  </p>
                </div>
              )}
            </div>
            <div className="decision-buttons">
              <button
                className="decision-btn stay-silent-btn"
                onClick={() => handleDecision(Decision.STAY_SILENT)}
              >
                {t('gameBoard.staySilent')}
                <span className="btn-subtitle">{t('gameBoard.cooperate')}</span>
              </button>
              <button
                className="decision-btn confess-btn"
                onClick={() => handleDecision(Decision.CONFESS)}
              >
                {t('gameBoard.confess')}
                <span className="btn-subtitle">{t('gameBoard.betray')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Waiting for Opponent with Decision Reversal */}
        {isDecisionPhase && hasPlayerDecided && (
          <div className="waiting-section">
            <div className="waiting-prompt">
              <h2 className="waiting-title">
                {t('gameBoard.waitingForOpponent')}
              </h2>
              <p className="waiting-subtitle">
                {t('gameBoard.opponentDeciding')}
              </p>
              {currentDecision && (
                <div className="current-decision-display">
                  <p className="decision-label">Seçiminiz:</p>
                  <p className="decision-value">{getDecisionDisplay(currentDecision)}</p>
                </div>
              )}
              {reversalTimer !== null && reversalTimer > 0 && (
                <div className="reversal-section">
                  <p className="reversal-timer">
                    Kararınızı değiştirebilirsiniz: {reversalTimer}s
                  </p>
                  <button
                    className="btn btn-warning reverse-decision-btn"
                    onClick={handleReverseDecision}
                  >
                    🔄 Kararımı Değiştir
                  </button>
                </div>
              )}
              {reversalTimer === null && (
                <p className="decision-final">✓ Kararınız kesinleşti</p>
              )}
              {decisionTimer !== null && (
                <div className="decision-timer">
                  <p className="timer-text">
                    {t('gameBoard.timeLeft', { seconds: decisionTimer })}
                  </p>
                </div>
              )}
            </div>
            <div className="waiting-animation">
              <div className="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        {/* Communication Panel - Always active */}
        <div className="communication-section">
          <CommunicationPanel
            isActive={true}
            onSendMessage={onCommunication}
            messages={messages}
            currentPlayerId={currentPlayer.id}
          />
        </div>

        {/* Round Result Animation */}
        {showRoundResult && lastRoundResult && (
          <div className="round-result-overlay">
            <div className="round-result-card">
              <h3>{t('gameBoard.roundComplete')}</h3>
              <div className="result-content">
                <div className="player-result-anim">
                  <span className="player-label">{t('gameBoard.you')}</span>
                  <span
                    className={`decision ${lastRoundResult.playerDecision}`}
                  >
                    {getDecisionDisplay(lastRoundResult.playerDecision)}
                  </span>
                  <span className="points">
                    +{lastRoundResult.playerPoints}
                  </span>
                </div>

                <div className="vs-separator">VS</div>

                <div className="opponent-result-anim">
                  <span className="player-label">
                    {opponent?.isAI ? t('gameBoard.opponent') : opponent?.name}
                  </span>
                  <span
                    className={`decision ${lastRoundResult.opponentDecision}`}
                  >
                    {getDecisionDisplay(lastRoundResult.opponentDecision)}
                  </span>
                  <span className="points">
                    +{lastRoundResult.opponentPoints}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Atmospheric Effects */}
      <AtmosphericEffects
        currentPhase={session.currentPhase}
        isDecisionMoment={isDecisionMoment}
      />
    </div>
  );
};

export default GameBoard;
