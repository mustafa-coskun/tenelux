import React, { useState } from 'react';
import { GameSession, Player, Decision } from '../types';
import GameBoard from './GameBoard';
import StatisticsPanel from './StatisticsPanel';
import { useTranslation } from '../hooks/useTranslation';
import './MultiplayerGameBoard.css';

interface MultiplayerGameBoardProps {
  session: GameSession;
  humanPlayer: Player;
  opponent: Player;
  onPlayerDecision: (decision: Decision) => void;
  onCommunicationMessage: (message: string) => void;
  onGameEnd: (gameEndType?: string) => void;
  messages?: Array<{ playerId: string; message: string; timestamp: Date }>;
  timerSync?: { round: number; duration: number } | null;
  connectionError?: string | null;
}

export const MultiplayerGameBoard: React.FC<MultiplayerGameBoardProps> = ({
  session,
  humanPlayer,
  opponent,
  onPlayerDecision,
  onCommunicationMessage,
  onGameEnd,
  messages = [],
  timerSync,
  connectionError,
}) => {
  const { t } = useTranslation();
  const [showStatistics, setShowStatistics] = useState(false);

  // Check if game is over (10 rounds completed)
  const isGameOver =
    session.rounds.length >= 10 &&
    session.rounds.every((r) => r.decisions.length === 2);

  const handleShowStatistics = () => {
    setShowStatistics(true);
  };

  // Calculate statistics for the human player
  const calculateStatistics = () => {
    const humanDecisions = session.rounds
      .map((round) =>
        round.decisions.find((d) => d.playerId === humanPlayer.id)
      )
      .filter(Boolean);

    if (humanDecisions.length === 0) {
      return {
        cooperationPercentage: 0,
        betrayalPercentage: 0,
        totalPoints: 0,
        gamesWon: 0,
        gamesLost: 0,
        averageTrustScore: 50,
      };
    }

    const cooperationCount = humanDecisions.filter(
      (d) => d!.decision === Decision.STAY_SILENT
    ).length;

    const cooperationPercentage = Math.round(
      (cooperationCount / humanDecisions.length) * 100
    );
    const betrayalPercentage = 100 - cooperationPercentage;

    // Calculate total points
    let humanTotalPoints = 0;
    let opponentTotalPoints = 0;

    session.rounds.forEach((round) => {
      if (round.results) {
        const isHumanPlayerA = session.players[0].id === humanPlayer.id;
        humanTotalPoints += isHumanPlayerA
          ? round.results.playerA
          : round.results.playerB;
        opponentTotalPoints += isHumanPlayerA
          ? round.results.playerB
          : round.results.playerA;
      }
    });

    return {
      cooperationPercentage,
      betrayalPercentage,
      totalPoints: humanTotalPoints,
      gamesWon: humanTotalPoints > opponentTotalPoints ? 1 : 0,
      gamesLost: humanTotalPoints < opponentTotalPoints ? 1 : 0,
      averageTrustScore: cooperationPercentage,
    };
  };

  if (showStatistics && isGameOver) {
    return (
      <div className="multiplayer-game-board">
        <StatisticsPanel session={session} statistics={calculateStatistics()} />
        <div className="statistics-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowStatistics(false)}
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="multiplayer-game-board">
      {connectionError && (
        <div className="connection-error-banner">
          <div className="error-content">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{connectionError}</span>
          </div>
        </div>
      )}
      
      <GameBoard
        session={session}
        currentPlayer={humanPlayer}
        onDecision={onPlayerDecision}
        onCommunication={onCommunicationMessage}
        messages={messages}
        timerSync={timerSync}
      />

      <div className="multiplayer-game-actions">
        {isGameOver && (
          <button
            className="btn btn-primary show-stats-btn"
            onClick={handleShowStatistics}
          >
            {t('statistics.title')}
          </button>
        )}
        <button
          className="btn btn-secondary leave-game-btn"
          onClick={() => onGameEnd('forfeit')}
        >
          {t('game.endGame')}
        </button>
      </div>
    </div>
  );
};
