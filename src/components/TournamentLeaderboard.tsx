import React, { useState, useEffect } from 'react';
import {
  Tournament,
  TournamentRanking,
  TournamentPlayer,
  PlayerStatus
} from '../types/party';
import { TournamentLeaderboardService } from '../services/tournament/TournamentLeaderboardService';
import { TournamentStatisticsEngine } from '../services/tournament/TournamentStatisticsEngine';
import './TournamentLeaderboard.css';

interface TournamentLeaderboardProps {
  tournament: Tournament;
  currentPlayerId?: string;
  showDetailedStats?: boolean;
  onPlayerSelect?: (playerId: string) => void;
}

export const TournamentLeaderboard: React.FC<TournamentLeaderboardProps> = ({
  tournament,
  currentPlayerId,
  showDetailedStats = false,
  onPlayerSelect
}) => {
  const [leaderboardData, setLeaderboardData] = useState<{
    rankings: TournamentRanking[];
    insights: any;
    projections: any[];
  } | null>(null);
  const [selectedView, setSelectedView] = useState<'rankings' | 'insights' | 'projections'>('rankings');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const updateLeaderboard = () => {
      const data = TournamentLeaderboardService.getEnhancedLeaderboard(tournament);
      setLeaderboardData(data);
    };

    updateLeaderboard();
    
    // Auto-refresh every 10 seconds during active tournament
    const interval = setInterval(updateLeaderboard, 10000);
    
    return () => clearInterval(interval);
  }, [tournament, refreshKey]);

  const handleRefresh = () => {
    TournamentLeaderboardService.clearCache(tournament.id);
    setRefreshKey(prev => prev + 1);
  };

  const getRankChangeIcon = (rank: number, previousRank?: number) => {
    if (!previousRank || rank === previousRank) return null;
    
    if (rank < previousRank) {
      return <span className="rank-change up">↗</span>;
    } else {
      return <span className="rank-change down">↘</span>;
    }
  };

  const getPlayerStatusIcon = (player: TournamentPlayer) => {
    switch (player.status) {
      case PlayerStatus.IN_MATCH:
        return <span className="status-icon playing">🎮</span>;
      case PlayerStatus.ELIMINATED:
        return <span className="status-icon eliminated">❌</span>;
      case PlayerStatus.SPECTATING:
        return <span className="status-icon spectating">👁</span>;
      case PlayerStatus.DISCONNECTED:
        return <span className="status-icon disconnected">⚠️</span>;
      default:
        return <span className="status-icon waiting">⏳</span>;
    }
  };

  if (!leaderboardData) {
    return <div className="leaderboard-loading">Loading leaderboard...</div>;
  }

  const { rankings, insights, projections } = leaderboardData;

  return (
    <div className="tournament-leaderboard">
      <div className="leaderboard-header">
        <h3>Tournament Leaderboard</h3>
        <div className="leaderboard-controls">
          <div className="view-selector">
            <button
              className={selectedView === 'rankings' ? 'active' : ''}
              onClick={() => setSelectedView('rankings')}
            >
              Rankings
            </button>
            <button
              className={selectedView === 'insights' ? 'active' : ''}
              onClick={() => setSelectedView('insights')}
            >
              Insights
            </button>
            <button
              className={selectedView === 'projections' ? 'active' : ''}
              onClick={() => setSelectedView('projections')}
            >
              Projections
            </button>
          </div>
          <button className="refresh-btn" onClick={handleRefresh}>
            🔄
          </button>
        </div>
      </div>

      {selectedView === 'rankings' && (
        <div className="rankings-view">
          <div className="rankings-table">
            <div className="table-header">
              <div className="rank-col">Rank</div>
              <div className="player-col">Player</div>
              <div className="record-col">Record</div>
              <div className="points-col">Points</div>
              <div className="avg-col">Avg</div>
              <div className="coop-col">Coop%</div>
              {showDetailedStats && <div className="status-col">Status</div>}
            </div>
            
            {rankings.map((ranking, index) => (
              <div
                key={ranking.player.id}
                className={`ranking-row ${ranking.player.id === currentPlayerId ? 'current-player' : ''} ${ranking.player.isEliminated ? 'eliminated' : ''}`}
                onClick={() => onPlayerSelect?.(ranking.player.id)}
              >
                <div className="rank-col">
                  <span className="rank-number">#{ranking.rank}</span>
                  {getRankChangeIcon(ranking.rank)}
                </div>
                
                <div className="player-col">
                  <div className="player-info">
                    <span className="player-name">{ranking.player.name}</span>
                    {ranking.player.isHost && <span className="host-badge">👑</span>}
                  </div>
                </div>
                
                <div className="record-col">
                  <span className="match-record">{ranking.matchRecord}</span>
                </div>
                
                <div className="points-col">
                  <span className="tournament-points">{ranking.tournamentPoints}</span>
                </div>
                
                <div className="avg-col">
                  <span className="average-score">{ranking.averagePointsPerMatch}</span>
                </div>
                
                <div className="coop-col">
                  <span className="cooperation-rate">{ranking.cooperationPercentage}%</span>
                </div>
                
                {showDetailedStats && (
                  <div className="status-col">
                    {getPlayerStatusIcon(ranking.player)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedView === 'insights' && (
        <div className="insights-view">
          <div className="insights-section">
            <h4>Tournament Insights</h4>
            
            {insights.breakawayLeaders.length > 0 && (
              <div className="insight-card">
                <h5>🏆 Breakaway Leaders</h5>
                {insights.breakawayLeaders.map((leader: any) => (
                  <div key={leader.playerId} className="insight-item">
                    <strong>{leader.playerName}</strong> has a commanding {leader.leadMargin} point lead
                  </div>
                ))}
              </div>
            )}

            {insights.tightRaces.length > 0 && (
              <div className="insight-card">
                <h5>🔥 Tight Races</h5>
                {insights.tightRaces.map((race: any, index: number) => (
                  <div key={index} className="insight-item">
                    Positions {race.rank}-{race.rank + race.players.length - 1}: {race.players.join(', ')} 
                    <span className="point-diff"> ({race.pointDifference} pts apart)</span>
                  </div>
                ))}
              </div>
            )}

            {insights.risingStars.length > 0 && (
              <div className="insight-card">
                <h5>⭐ Rising Stars</h5>
                {insights.risingStars.map((star: any) => (
                  <div key={star.playerId} className="insight-item">
                    <strong>{star.playerName}</strong> showing strong momentum 
                    <span className="momentum-score"> (Score: {star.momentum})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedView === 'projections' && (
        <div className="projections-view">
          <div className="projections-section">
            <h4>Final Ranking Projections</h4>
            <p className="projections-disclaimer">
              Based on current performance trends and remaining matches
            </p>
            
            <div className="projections-table">
              <div className="table-header">
                <div className="player-col">Player</div>
                <div className="current-col">Current</div>
                <div className="projected-col">Projected</div>
                <div className="confidence-col">Confidence</div>
              </div>
              
              {projections
                .sort((a, b) => a.projectedFinalRank - b.projectedFinalRank)
                .map((projection: any) => {
                  const currentRanking = rankings.find(r => r.player.id === projection.playerId);
                  const currentRank = currentRanking?.rank || 0;
                  const change = currentRank - projection.projectedFinalRank;
                  
                  return (
                    <div key={projection.playerId} className="projection-row">
                      <div className="player-col">
                        <span className="player-name">{projection.playerName}</span>
                      </div>
                      
                      <div className="current-col">
                        <span className="current-rank">#{currentRank}</span>
                      </div>
                      
                      <div className="projected-col">
                        <span className="projected-rank">#{projection.projectedFinalRank}</span>
                        {change !== 0 && (
                          <span className={`rank-change ${change > 0 ? 'up' : 'down'}`}>
                            {change > 0 ? `+${change}` : change}
                          </span>
                        )}
                      </div>
                      
                      <div className="confidence-col">
                        <div className="confidence-bar">
                          <div 
                            className="confidence-fill"
                            style={{ width: `${projection.confidence}%` }}
                          />
                        </div>
                        <span className="confidence-text">{projection.confidence}%</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <div className="leaderboard-summary">
        {(() => {
          const summary = TournamentLeaderboardService.generateLeaderboardSummary(tournament);
          return (
            <div className="summary-stats">
              <div className="stat-item">
                <span className="stat-label">Players:</span>
                <span className="stat-value">{summary.totalPlayers}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Matches:</span>
                <span className="stat-value">{summary.matchesCompleted}</span>
              </div>
              {summary.currentLeader && (
                <div className="stat-item">
                  <span className="stat-label">Leader:</span>
                  <span className="stat-value">{summary.currentLeader.name} ({summary.currentLeader.points} pts)</span>
                </div>
              )}
              <div className="stat-item">
                <span className="stat-label">Avg Score:</span>
                <span className="stat-value">{summary.averageScore}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default TournamentLeaderboard;