import React, { useState, useEffect } from 'react';
import {
  AIStrategy,
  Player,
  GameSession,
  Decision,
  PlayerDecision,
} from '../types';
import { SinglePlayerManager } from '../services/SinglePlayerManager';
import { GameEngine } from '../services/GameEngine';
// import { AIStrategySelection } from './AIStrategySelection'; // Artık kullanılmıyor
import { SinglePlayerGameBoard } from './SinglePlayerGameBoard';
import StatisticsPanel from './StatisticsPanel';
import { StatisticsEngine } from '../services/StatisticsEngine';
import {
  AIPersonalityService,
  AIPersonality,
} from '../services/AIPersonalityService';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import './SinglePlayerGame.css';

interface SinglePlayerGameProps {
  humanPlayer: Player;
  onGameEnd: () => void;
}

enum GameState {
  CHARACTER_REVEAL = 'character_reveal',
  PLAYING = 'playing',
  GAME_ENDED = 'game_ended',
}

export const SinglePlayerGame: React.FC<SinglePlayerGameProps> = ({
  humanPlayer,
  onGameEnd,
}) => {
  const { t } = useTranslation();
  
  // Safety check: Ensure humanPlayer has valid ID
  if (!humanPlayer || !humanPlayer.id) {
    console.error('🎮 SinglePlayerGame - Invalid humanPlayer:', humanPlayer);
    return (
      <div className="error-screen">
        <h2>Error: Invalid Player Data</h2>
        <p>Please return to the main menu and try again.</p>
        <button onClick={onGameEnd}>Back to Menu</button>
      </div>
    );
  }
  
  const [gameState, setGameState] = useState<GameState>(
    GameState.CHARACTER_REVEAL
  );
  const [selectedStrategy, setSelectedStrategy] = useState<
    AIStrategy | undefined
  >();
  const [aiPersonality, setAiPersonality] = useState<AIPersonality | null>(
    null
  );
  const [aiPersonalityService, setAiPersonalityService] =
    useState<AIPersonalityService | null>(null);
  const [singlePlayerManager] = useState(() => new SinglePlayerManager());
  const [gameEngine] = useState(() => new GameEngine());
  const [statisticsEngine] = useState(() => new StatisticsEngine());
  const [currentSession, setCurrentSession] = useState<GameSession | null>(
    null
  );
  const [waitingForAI, setWaitingForAI] = useState(false);
  const [showDecisionReversal, setShowDecisionReversal] = useState(false);
  const [selectedRoundForReversal, setSelectedRoundForReversal] = useState<
    number | null
  >(null);
  const [reversalDecision, setReversalDecision] = useState<Decision | null>(
    null
  );
  const [gameStatistics, setGameStatistics] = useState<any>(null);
  const [communicationMessages, setCommunicationMessages] = useState<
    Array<{ playerId: string; message: string; timestamp: Date }>
  >([]);

  // Initialize AI personality service with translation function
  useEffect(() => {
    // Always recreate the service when translation function changes
    setAiPersonalityService(new AIPersonalityService(t));
  }, [t]);

  useEffect(() => {
    if (!aiPersonalityService) return;

    // Rastgele AI karakteri seç ve oyunu başlat
    const personality = aiPersonalityService.getRandomPersonality();
    setAiPersonality(personality);
    setSelectedStrategy(personality.strategy);

    // 3 saniye sonra oyunu başlat
    const timer = setTimeout(() => {
      startGame();
    }, 3000);

    return () => {
      clearTimeout(timer);
      // Cleanup when component unmounts
      singlePlayerManager.cleanup();
    };
  }, [singlePlayerManager, aiPersonalityService]);

  // handleStrategySelect kaldırıldı - artık rastgele seçim yapılıyor

  const startGame = () => {
    if (!selectedStrategy) {
      return;
    }

    try {
      // Create single-player session
      const session = singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        selectedStrategy
      );

      // Set the session in the game engine
      gameEngine.setCurrentSession(session);

      setCurrentSession(session);
      setGameState(GameState.PLAYING);
    } catch (error) {
      console.error('Failed to start single-player game:', error);
    }
  };

  const handlePlayerDecision = async (decision: Decision) => {
    if (!currentSession || waitingForAI) {
      return;
    }

    setWaitingForAI(true);

    try {
      // Create human player decision
      const humanDecision: PlayerDecision = {
        playerId: String(humanPlayer.id), // Ensure playerId is always a string
        decision,
        timestamp: new Date(),
        canReverse: true,
      };

      // Get AI decision through SinglePlayerManager
      const allDecisions =
        singlePlayerManager.processRoundWithAI(humanDecision);

      // Process the round through GameEngine
      const roundResult = gameEngine.processRound(allDecisions);

      // Update session state
      const updatedSession = gameEngine.getCurrentSession();
      if (updatedSession) {
        // Force re-render by creating a completely new object
        setCurrentSession({
          ...updatedSession,
          rounds: [...updatedSession.rounds],
          players: [...updatedSession.players],
        });

        // Trigger round result animation
        const lastRound =
          updatedSession.rounds[updatedSession.rounds.length - 1];
        if (lastRound) {
          const playerDecision = lastRound.decisions.find(
            (d) => d.playerId === humanPlayer.id
          );
          const aiDecision = lastRound.decisions.find(
            (d) => d.playerId !== humanPlayer.id
          );

          // Show round result animation
          // This will be handled by GameBoard component
        }
      }

      // Check if game ended
      if (roundResult.gameEnded) {
        // Show decision reversal option first
        setShowDecisionReversal(true);
      }
    } catch (error) {
      console.error('Error processing round:', error);
    } finally {
      setWaitingForAI(false);
    }
  };

  const handleCommunication = (message: string) => {
    if (!currentSession) {
      return;
    }

    try {
      console.log('Sending message:', message);
      // Send communication message
      const sentMessage = singlePlayerManager.sendCommunicationMessage(
        humanPlayer.id,
        message as any
      );

      // Add message to local state for display
      const newMessage = {
        playerId: humanPlayer.id,
        message: message,
        timestamp: new Date(),
      };

      setCommunicationMessages((prev) => [...prev, newMessage]);
      console.log('Message sent successfully:', sentMessage);
    } catch (error) {
      console.error('Error sending communication:', error);
    }
  };

  const handleNewGame = () => {
    singlePlayerManager.cleanup();
    setCurrentSession(null);
    setSelectedStrategy(undefined);
    setGameStatistics(null);
    setAiPersonality(null);

    // Yeni rastgele karakter seç
    if (aiPersonalityService) {
      const personality = aiPersonalityService.getRandomPersonality();
      setAiPersonality(personality);
      setSelectedStrategy(personality.strategy);
      setGameState(GameState.CHARACTER_REVEAL);
    }

    // 3 saniye sonra oyunu başlat
    setTimeout(() => {
      startGame();
    }, 3000);
  };

  const handleBackToMenu = () => {
    singlePlayerManager.cleanup();
    onGameEnd();
  };

  // renderStrategySelection kaldırıldı - artık rastgele seçim yapılıyor

  const handleDecisionReversal = (accept: boolean) => {
    if (!accept) {
      // User declined reversal, end game normally
      finishGame();
      return;
    }

    // User wants to reverse a decision
    // Show round selection
  };

  const handleRoundSelection = (roundNumber: number) => {
    setSelectedRoundForReversal(roundNumber);
  };

  const handleReversalDecisionSubmit = (newDecision: Decision) => {
    if (!currentSession || selectedRoundForReversal === null) return;

    // Apply the reversal (in single player, AI always accepts)
    const updatedSession = { ...currentSession };
    const roundIndex = selectedRoundForReversal - 1;

    if (updatedSession.rounds[roundIndex]) {
      const round = updatedSession.rounds[roundIndex];
      const humanDecisionIndex = round.decisions.findIndex(
        (d) => d.playerId === humanPlayer.id
      );

      if (humanDecisionIndex !== -1) {
        // Update the decision
        round.decisions[humanDecisionIndex].decision = newDecision;

        // Recalculate payoffs
        const [decisionA, decisionB] = round.decisions;
        const newPayoffs = gameEngine.calculatePayoffs(
          decisionA.decision,
          decisionB.decision
        );
        round.results = newPayoffs;
      }
    }

    setCurrentSession(updatedSession);
    finishGame();
  };

  const finishGame = () => {
    if (!currentSession) return;

    const finalStats = statisticsEngine.calculateSessionStats(currentSession);
    setGameStatistics(finalStats);
    setGameState(GameState.GAME_ENDED);
    setShowDecisionReversal(false);
    singlePlayerManager.endSession();
  };

  const renderDecisionReversal = () => {
    if (!currentSession) return null;

    if (selectedRoundForReversal === null) {
      // Show initial question and round selection
      return (
        <div className="decision-reversal-screen">
          <div className="reversal-card">
            <h2>{t('decisionReversal.title')}</h2>
            <p>{t('decisionReversal.question')}</p>

            <div className="reversal-buttons">
              <button
                className="reversal-btn decline-btn"
                onClick={() => handleDecisionReversal(false)}
              >
                {t('decisionReversal.decline')}
              </button>
              <button
                className="reversal-btn accept-btn"
                onClick={() => handleDecisionReversal(true)}
              >
                {t('decisionReversal.accept')}
              </button>
            </div>

            {selectedRoundForReversal === null && showDecisionReversal && (
              <div className="round-selection">
                <h3>{t('decisionReversal.selectRound')}</h3>
                <div className="rounds-grid">
                  {currentSession.rounds.map((round, index) => (
                    <button
                      key={index}
                      className="round-btn"
                      onClick={() => handleRoundSelection(round.roundNumber)}
                    >
                      {t('decisionReversal.round')} {round.roundNumber}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Show decision selection for the chosen round
    return (
      <div className="decision-reversal-screen">
        <div className="reversal-card">
          <h2>
            {t('decisionReversal.changeDecision', {
              round: selectedRoundForReversal,
            })}
          </h2>
          <p>{t('decisionReversal.selectNewDecision')}</p>

          <div className="decision-buttons">
            <button
              className="decision-btn stay-silent-btn"
              onClick={() => handleReversalDecisionSubmit(Decision.STAY_SILENT)}
            >
              {t('game.staySilent')}
            </button>
            <button
              className="decision-btn confess-btn"
              onClick={() => handleReversalDecisionSubmit(Decision.CONFESS)}
            >
              {t('game.confess')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGameBoard = () => {
    if (!currentSession) {
      return <div>Loading game...</div>;
    }

    return (
      <div className="single-player-board">
        <div className="game-header">
          <h2>{t('game.singlePlayerMode')}</h2>
          <div className="opponent-info">
            <span>{t('game.opponent')}: </span>
            <span className="ai-strategy">{aiPersonality?.name || 'AI'}</span>
          </div>
        </div>

        <SinglePlayerGameBoard
          session={currentSession}
          humanPlayer={humanPlayer}
          aiPlayer={singlePlayerManager.getAIPlayer()!}
          aiStrategy={singlePlayerManager.getCurrentAIStrategy()!}
          onDecision={handlePlayerDecision}
          onCommunication={handleCommunication}
          waitingForAI={waitingForAI}
          messages={communicationMessages}
        />

        <div className="game-actions">
          <button className="btn btn-secondary" onClick={handleBackToMenu}>
            {t('game.endGame')}
          </button>
        </div>
      </div>
    );
  };

  const renderGameEnded = () => (
    <div className="game-ended">
      <h2>{t('game.interrogationComplete')}</h2>

      {gameStatistics && currentSession && (
        <StatisticsPanel statistics={gameStatistics} session={currentSession} />
      )}

      <div className="end-game-actions">
        <button className="btn btn-primary" onClick={handleNewGame}>
          {t('game.newInterrogation')}
        </button>
        <button className="btn btn-secondary" onClick={handleBackToMenu}>
          {t('game.backToMenu')}
        </button>
      </div>
    </div>
  );

  const renderCharacterReveal = () => (
    <div className="character-reveal">
      <div className="character-card">
        <div className="character-avatar">{aiPersonality?.avatar}</div>
        <h2 className="character-name">{aiPersonality?.name}</h2>
        <p className="character-description">{aiPersonality?.description}</p>
        <div className="character-personality">
          <strong>{t('game.personality')}:</strong> {aiPersonality?.personality}
        </div>
        <div className="character-dialogue">
          <p>"{t('aiPersonalities.loadingDialogue')}"</p>
        </div>
        <div className="loading-indicator">
          <p>{t('game.preparingGame')}</p>
        </div>
      </div>
    </div>
  );

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className={`single-player-game ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      {gameState === GameState.CHARACTER_REVEAL && renderCharacterReveal()}
      {gameState === GameState.PLAYING && renderGameBoard()}
      {showDecisionReversal && renderDecisionReversal()}
      {gameState === GameState.GAME_ENDED && renderGameEnded()}
    </div>
  );
};
