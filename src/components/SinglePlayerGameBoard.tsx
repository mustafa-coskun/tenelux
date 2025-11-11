import React, { useState, useEffect } from 'react';
import { GameSession, Player, Decision, AIStrategy } from '../types';
import GameBoard from './GameBoard';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import './SinglePlayerGameBoard.css';

interface SinglePlayerGameBoardProps {
  session: GameSession;
  humanPlayer: Player;
  aiPlayer: Player;
  aiStrategy: AIStrategy;
  onDecision: (decision: Decision) => void;
  onCommunication: (message: string) => void;
  waitingForAI?: boolean;
  messages?: Array<{ playerId: string; message: string; timestamp: Date }>;
}

export const SinglePlayerGameBoard: React.FC<SinglePlayerGameBoardProps> = ({
  session,
  humanPlayer,
  aiPlayer,
  aiStrategy,
  onDecision,
  onCommunication,
  waitingForAI = false,
  messages = [],
}) => {
  const { t } = useTranslation();
  const [aiDecisionHistory, setAIDecisionHistory] = useState<Decision[]>([]);
  const [showAIThinking, setShowAIThinking] = useState(false);

  useEffect(() => {
    // Update AI decision history when session rounds change
    const aiDecisions = session.rounds.map((round) => {
      const aiDecision = round.decisions.find(
        (d) => d.playerId === aiPlayer.id
      );
      return aiDecision?.decision || Decision.STAY_SILENT;
    });
    setAIDecisionHistory(aiDecisions);
  }, [session.rounds, aiPlayer.id]);

  useEffect(() => {
    // Show AI thinking indicator when waiting for AI
    if (waitingForAI) {
      setShowAIThinking(true);
      // Simulate AI thinking time (1-3 seconds)
      const thinkingTime = Math.random() * 2000 + 1000;
      const timer = setTimeout(() => {
        setShowAIThinking(false);
      }, thinkingTime);

      return () => clearTimeout(timer);
    } else {
      setShowAIThinking(false);
    }
  }, [waitingForAI]);

  // AI stratejisini gizli tut - oyuncunun tahmin etmesini sağla
  const getAIDescription = () => {
    return t('aiPanel.opponentDescription');
  };

  const renderAIPanel = () => (
    <div className="ai-panel">
      <div className="ai-header">
        <h3>{t('aiPanel.yourOpponent')}</h3>
        <div className="ai-strategy-badge">
          {t('aiPanel.mysteriousOpponent')}
        </div>
      </div>

      <div className="ai-info">
        <p className="ai-description">{getAIDescription()}</p>
      </div>
      {showAIThinking && (
        <div className="ai-thinking-overlay">
          <div className="thinking-animation">
            <div className="thinking-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p>{t('aiPanel.analyzing')}</p>
          </div>
        </div>
      )}
    </div>
  );

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className={`single-player-game-board ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      <div className="game-layout">
        <div className="game-board-section">
          <GameBoard
            session={session}
            currentPlayer={humanPlayer}
            onDecision={onDecision}
            onCommunication={onCommunication}
            messages={messages}
          />
        </div>
      </div>
    </div>
  );
};
