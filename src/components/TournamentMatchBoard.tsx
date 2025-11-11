import React, { useState } from 'react';
import { GameSession, Player, Decision } from '../types';
import GameBoard from './GameBoard';
import StatisticsPanel from './StatisticsPanel';
import { useTranslation } from '../hooks/useTranslation';
import './TournamentMatchBoard.css';

interface TournamentMatchBoardProps {
  session: GameSession;
  humanPlayer: Player;
  opponent: Player;
  onPlayerDecision: (decision: Decision) => void;
  onCommunicationMessage: (message: string) => void;
  onMatchEnd: (matchEndType?: string) => void;
  messages?: Array<{ playerId: string; message: string; timestamp: Date }>;
  timerSync?: { round: number; duration: number } | null;
  connectionError?: string | null;
}

export const TournamentMatchBoard: React.FC<TournamentMatchBoardProps> = ({
  session,
  humanPlayer,
  opponent,
  onPlayerDecision,
  onCommunicationMessage,
  onMatchEnd,
  messages = [],
  timerSync,
  connectionError,
}) => {
  const { t } = useTranslation();
  const [showStatistics, setShowStatistics] = useState(false);

  // Check if match is over (10 rounds completed)
  const isMatchOver =
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
        opponentTotalPoints: 0,
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

    const isHumanPlayerA = session.players[0].id === humanPlayer.id;
    
    console.log('📊 TournamentMatchBoard - Calculating scores:', {
      humanPlayerId: humanPlayer.id,
      opponentId: opponent.id,
      isHumanPlayerA,
      sessionPlayers: session.players.map(p => ({ id: p.id, name: p.name })),
      roundsCount: session.rounds.length
    });

    session.rounds.forEach((round, index) => {
      if (round.results) {
        const humanRoundScore = isHumanPlayerA
          ? round.results.playerA
          : round.results.playerB;
        const opponentRoundScore = isHumanPlayerA
          ? round.results.playerB
          : round.results.playerA;
          
        humanTotalPoints += humanRoundScore;
        opponentTotalPoints += opponentRoundScore;
        
        console.log(`📊 Round ${index + 1}: Human: ${humanRoundScore}, Opponent: ${opponentRoundScore}, Totals: ${humanTotalPoints}-${opponentTotalPoints}`);
      }
    });

    console.log('📊 Final calculated scores:', {
      humanTotalPoints,
      opponentTotalPoints,
      humanWins: humanTotalPoints > opponentTotalPoints,
      opponentWins: opponentTotalPoints > humanTotalPoints,
      tie: humanTotalPoints === opponentTotalPoints
    });

    return {
      cooperationPercentage,
      betrayalPercentage,
      totalPoints: humanTotalPoints,
      opponentTotalPoints: opponentTotalPoints, // ✅ CRITICAL: Add opponent points
      gamesWon: humanTotalPoints > opponentTotalPoints ? 1 : 0,
      gamesLost: humanTotalPoints < opponentTotalPoints ? 1 : 0,
      averageTrustScore: cooperationPercentage,
    };
  };

  if (showStatistics && isMatchOver) {
    const stats = calculateStatistics();
    
    console.log('📊 TournamentMatchBoard - Showing statistics:', {
      humanPlayerId: humanPlayer.id,
      opponentId: opponent.id,
      humanTotalPoints: stats.totalPoints,
      sessionPlayers: session.players.map(p => ({ id: p.id, name: p.name })),
      isMatchOver,
      roundsCount: session.rounds.length
    });
    
    return (
      <div className="tournament-match-board">
        <StatisticsPanel 
          session={session} 
          statistics={stats}
          isMultiplayer={true}
          actualPlayerId={humanPlayer.id}
        />
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
    <div className="tournament-match-board">
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

      <div className="tournament-match-actions">
        {isMatchOver && (
          <button
            className="btn btn-primary show-stats-btn"
            onClick={handleShowStatistics}
          >
            {t('statistics.title')}
          </button>
        )}
        <button
          className="btn btn-secondary end-match-btn"
          onClick={() => onMatchEnd('forfeit')}
        >
          🏳️ Pes Et
        </button>
      </div>
    </div>
  );
};
