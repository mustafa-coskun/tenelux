import React from 'react';
import { StatisticsPanelProps, Decision } from '../types';
import { StatisticsEngine } from '../services/StatisticsEngine';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import './StatisticsPanel.css';

// StatisticsPanel component for displaying post-game statistics
const StatisticsPanel: React.FC<StatisticsPanelProps> = ({
  statistics,
  session,
  onClose,
  isMultiplayer = false,
  updatedDecisions,
  actualPlayerId,
}) => {
  const { t } = useTranslation();
  const statisticsEngine = new StatisticsEngine(t);

  // Generate decision pattern analysis
  const humanPlayer = session.players.find((p) => !p.isAI);
  const decisionAnalysis = humanPlayer
    ? statisticsEngine.analyzeDecisionPatterns(session, humanPlayer.id)
    : null;

  // Generate comparative text
  const comparativeText = statisticsEngine.generateComparativeText(statistics);

  // Calculate round-by-round data for visualization
  const roundData = session.rounds.map((round, index) => {
    let playerDecision = null;
    let points = 0;

    // Use updated decisions if available (after decision reversal)
    if (updatedDecisions && updatedDecisions[index] && humanPlayer) {
      const updatedRoundDecisions = updatedDecisions[index];
      const playerIdToUse = actualPlayerId || humanPlayer.id;
      const updatedPlayerDecision = updatedRoundDecisions[playerIdToUse];

      if (updatedPlayerDecision) {
        // Convert server decision format to client format
        const clientDecision = updatedPlayerDecision.decision === 'COOPERATE'
          ? Decision.STAY_SILENT
          : Decision.CONFESS;

        playerDecision = { decision: clientDecision };
        points = updatedPlayerDecision.score || 0;

        console.log(`🔄 Round ${index + 1} using updated decision:`, {
          serverDecision: updatedPlayerDecision.decision,
          clientDecision,
          points
        });
      }
    }

    // Fallback to original session data if no updated decision
    if (!playerDecision && humanPlayer) {
      playerDecision = round.decisions.find((d) => d.playerId === humanPlayer.id);
      
      // Find the correct score for this player - improved logic
      const playerIndex = round.decisions.findIndex((d) => d.playerId === humanPlayer.id);
      
      if (playerIndex !== -1) {
        // First try to get score from decision object
        const playerDecisionObj = round.decisions[playerIndex];
        if (playerDecisionObj && playerDecisionObj.score !== undefined) {
          points = playerDecisionObj.score;
        } else {
          // Fallback to results array with correct mapping
          points = playerIndex === 0 ? round.results.playerA : round.results.playerB;
        }
      }
    }

    return {
      round: index + 1,
      decision: playerDecision?.decision || Decision.STAY_SILENT,
      points: points,
    };
  });

  const formatPercentage = (value: number): string => {
    return `${Math.round(value)}%`;
  };

  const getDecisionColor = (decision: Decision): string => {
    return decision === Decision.STAY_SILENT ? '#4ecdc4' : '#ff5252';
  };

  const getDecisionLabel = (decision: Decision): string => {
    return decision === Decision.STAY_SILENT
      ? t('statisticsPanel.cooperated')
      : t('statisticsPanel.betrayed');
  };

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className={`statistics-panel ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      <div className="statistics-header">
        <h2 className="panel-title">{t('statisticsPanel.gameAnalysis')}</h2>
        <div className="session-info">
          <span className="session-id">
            {t('statisticsPanel.session')}: {session.id.slice(-8)}
          </span>
          <span className="total-rounds">
            {session.rounds.length} {t('statisticsPanel.rounds')}
          </span>
        </div>
      </div>

      {/* Main Statistics Cards */}
      <div className="stats-cards">
        <div className="stat-card cooperation">
          <div className="stat-icon">🤝</div>
          <div className="stat-content">
            <div className="stat-value">
              {formatPercentage(statistics.cooperationPercentage)}
            </div>
            <div className="stat-label">{t('statisticsPanel.cooperation')}</div>
          </div>
        </div>

        <div className="stat-card betrayal">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <div className="stat-value">
              {formatPercentage(statistics.betrayalPercentage)}
            </div>
            <div className="stat-label">{t('statisticsPanel.betrayal')}</div>
          </div>
        </div>

        <div className="stat-card points">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <div className="stat-value">
              {/* Use calculated total from roundData for accuracy */}
              {roundData.reduce((sum, round) => sum + round.points, 0)}
            </div>
            <div className="stat-label">{t('statisticsPanel.totalPoints')}</div>
          </div>
        </div>

        <div className="stat-card trust">
          <div className="stat-icon">💎</div>
          <div className="stat-content">
            <div className="stat-value">
              {Math.round(statistics.averageTrustScore)}
            </div>
            <div className="stat-label">{t('statisticsPanel.trustScore')}</div>
          </div>
        </div>
      </div>

      {/* Comparative Analysis */}
      <div className="comparative-analysis">
        <h3 className="section-title">
          {t('statisticsPanel.performanceSummary')}
        </h3>
        <div className="comparative-text">
          <span className="analysis-result">{comparativeText}</span>
        </div>
        {statistics.mostFearfulRound && (
          <div className="fearful-round">
            <span className="fearful-label">
              {t('statisticsPanel.mostFearfulMoment')}
            </span>
            <span className="fearful-value">
              Round {statistics.mostFearfulRound}
            </span>
          </div>
        )}
      </div>

      {/* Decision Pattern Visualization */}
      {decisionAnalysis && (
        <div className="decision-patterns">
          <h3 className="section-title">
            {t('statisticsPanel.decisionPattern')}
          </h3>
          <div className="pattern-summary">
            <div className="most-common">
              <span className="pattern-label">
                {t('statisticsPanel.mostCommonChoice')}
              </span>
              <span
                className={`pattern-value ${decisionAnalysis.mostCommonDecision.toLowerCase()}`}
              >
                {getDecisionLabel(decisionAnalysis.mostCommonDecision)}
              </span>
            </div>
            <div className="consistency">
              <span className="pattern-label">
                {t('statisticsPanel.consistency')}:
              </span>
              <span className="pattern-value">
                {formatPercentage(decisionAnalysis.consistencyScore)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Round-by-Round Visualization */}
      <div className="round-visualization">
        <h3 className="section-title">{t('statisticsPanel.roundHistory')}</h3>
        <div className="rounds-chart">
          {roundData.map((round) => (
            <div key={round.round} className="round-item">
              <div className="round-number">R{round.round}</div>
              <div
                className={`decision-indicator ${round.decision.toLowerCase()}`}
                style={{ backgroundColor: getDecisionColor(round.decision) }}
                title={`${getDecisionLabel(round.decision)} - ${round.points} points`}
              >
                {round.decision === Decision.STAY_SILENT ? '🤝' : '⚡'}
              </div>
              <div className="round-points">+{round.points}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Game Outcome */}
      <div className="game-outcome">
        <h3 className="section-title">{t('statisticsPanel.gameResult')}</h3>
        <div className="outcome-content">
          {(() => {
            // Calculate total points for comparison
            const playerTotalPoints = roundData.reduce((sum, round) => sum + round.points, 0);
            
            // For multiplayer games, we need to determine winner based on points
            // since session.winner might not be set correctly
            if (isMultiplayer && session.players.length > 1) {
              // Use provided opponent points if available (for forfeit cases)
              let opponentTotalPoints = (statistics as any).opponentTotalPoints;
              const opponentPlayer = session.players.find(p => p.id !== humanPlayer?.id);
              
              // If not provided or is 0, calculate from session rounds
              if ((opponentTotalPoints === undefined || opponentTotalPoints === 0) && opponentPlayer) {
                opponentTotalPoints = 0;
                
                // Determine if human player is playerA or playerB
                const isHumanPlayerA = session.players[0].id === humanPlayer?.id;
                
                console.log('📊 StatisticsPanel - Calculating opponent score:', {
                  humanPlayerId: humanPlayer?.id,
                  opponentPlayerId: opponentPlayer.id,
                  isHumanPlayerA,
                  sessionPlayers: session.players.map(p => ({ id: p.id, name: p.name })),
                  providedOpponentPoints: (statistics as any).opponentTotalPoints
                });
                
                session.rounds.forEach((round, index) => {
                  if (round.results) {
                    // Opponent gets the opposite score
                    const opponentRoundScore = isHumanPlayerA ? round.results.playerB : round.results.playerA;
                    opponentTotalPoints += opponentRoundScore;
                    
                    console.log(`📊 Round ${index + 1}: Opponent score: ${opponentRoundScore}, Total: ${opponentTotalPoints}`);
                  }
                });
              }
              
              console.log('📊 StatisticsPanel - Final comparison:', {
                playerTotalPoints,
                opponentTotalPoints,
                playerName: humanPlayer?.name,
                opponentName: opponentPlayer?.name,
                isEqual: playerTotalPoints === opponentTotalPoints
              });
              
              // Check for forfeit win
              const isForfeitWin = (statistics as any).gameEndReason === 'opponent_forfeit';
              
              // Determine winner based on points or forfeit
              if (isForfeitWin || playerTotalPoints > opponentTotalPoints) {
                // Player wins
                return (
                  <div className="winner-announcement victory">
                    <div className="outcome-icon">🏆</div>
                    <div className="outcome-text">
                      {isForfeitWin ? '🏳️ Rakip Pes Etti!' : t('statisticsPanel.victory')}
                    </div>
                    <div className="winner-name">
                      {humanPlayer?.name} {t('statisticsPanel.playerWins')}
                    </div>
                    {isForfeitWin && (
                      <div className="forfeit-message">
                        Rakibiniz oyunu terk etti. Kazandınız!
                      </div>
                    )}
                  </div>
                );
              } else if (playerTotalPoints < opponentTotalPoints) {
                // Player loses
                return (
                  <div className="winner-announcement defeat">
                    <div className="outcome-icon">💀</div>
                    <div className="outcome-text">{t('statisticsPanel.defeat')}</div>
                    <div className="winner-name">
                      {opponentPlayer?.name} {t('statisticsPanel.playerWins')}
                    </div>
                  </div>
                );
              } else {
                // Tie
                return (
                  <div className="outcome-draw">
                    <div className="outcome-icon">🤝</div>
                    <div className="outcome-text">{t('statisticsPanel.draw')}</div>
                  </div>
                );
              }
            }
            
            // Fallback to session.winner for single player or when winner is set
            if (session.winner) {
              return (
                <div
                  className={`winner-announcement ${session.winner.id === humanPlayer?.id ? 'victory' : 'defeat'}`}
                >
                  <div className="outcome-icon">
                    {session.winner.id === humanPlayer?.id ? '🏆' : '💀'}
                  </div>
                  <div className="outcome-text">
                    {session.winner.id === humanPlayer?.id
                      ? t('statisticsPanel.victory')
                      : t('statisticsPanel.defeat')}
                  </div>
                  <div className="winner-name">
                    {session.winner.name} {t('statisticsPanel.playerWins')}
                  </div>
                </div>
              );
            } else {
              return (
                <div className="outcome-draw">
                  <div className="outcome-icon">🤝</div>
                  <div className="outcome-text">{t('statisticsPanel.draw')}</div>
                </div>
              );
            }
          })()}
        </div>
      </div>

      {/* Psychological Insights */}
      <div className="psychological-insights">
        <h3 className="section-title">
          {t('statisticsPanel.psychologicalProfile')}
        </h3>
        <div className="insights-content">
          {statistics.cooperationPercentage > 70 ? (
            <div className="insight trustworthy">
              <span className="insight-icon">🛡️</span>
              <span className="insight-text">
                {t('statisticsPanel.cooperativeStrategy')}
              </span>
            </div>
          ) : statistics.betrayalPercentage > 70 ? (
            <div className="insight ruthless">
              <span className="insight-icon">🗡️</span>
              <span className="insight-text">
                {t('statisticsPanel.aggressiveStrategy')}
              </span>
            </div>
          ) : (
            <div className="insight balanced">
              <span className="insight-icon">⚖️</span>
              <span className="insight-text">
                {t('statisticsPanel.adaptiveStrategy')}
              </span>
            </div>
          )}

          {decisionAnalysis && decisionAnalysis.consistencyScore > 80 && (
            <div className="insight consistent">
              <span className="insight-icon">🎯</span>
              <span className="insight-text">
                {t('statisticsPanel.adaptiveStrategy')}
              </span>
            </div>
          )}

          {statistics.mostFearfulRound && statistics.mostFearfulRound <= 2 && (
            <div className="insight impulsive">
              <span className="insight-icon">⚡</span>
              <span className="insight-text">
                {t('statisticsPanel.fearBasedDecisions')}
              </span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default StatisticsPanel;
