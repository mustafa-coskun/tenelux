import React, { useState } from 'react';
import {
  Tournament,
  TournamentStatistics,
  TournamentRanking
} from '../types/party';
import { TournamentStatisticsEngine } from '../services/tournament/TournamentStatisticsEngine';
import { TournamentLeaderboardService } from '../services/tournament/TournamentLeaderboardService';
import './TournamentResults.css';

interface TournamentResultsProps {
  tournament: Tournament;
  onClose?: () => void;
  onExportResults?: () => void;
}

export const TournamentResults: React.FC<TournamentResultsProps> = ({
  tournament,
  onClose,
  onExportResults
}) => {
  const [selectedTab, setSelectedTab] = useState<'podium' | 'full-results' | 'statistics' | 'insights'>('podium');
  
  const statistics = TournamentStatisticsEngine.calculateTournamentStatistics(tournament);
  const finalRankings = TournamentLeaderboardService.getCurrentLeaderboard(tournament);
  const insights = TournamentStatisticsEngine.generateTournamentInsights(tournament);
  const trends = TournamentStatisticsEngine.analyzeTournamentTrends(tournament);

  const getPodiumPlayers = () => {
    return finalRankings.slice(0, 3);
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getMedalIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const handleExport = () => {
    const exportData = TournamentStatisticsEngine.exportTournamentData(tournament);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tournament-${tournament.id}-results.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    onExportResults?.();
  };

  return (
    <div className="tournament-results-overlay">
      <div className="tournament-results-modal">
        <div className="results-header">
          <div className="header-content">
            <h2>🏆 Tournament Complete!</h2>
            <p className="tournament-info">
              {tournament.format.replace('_', ' ').toUpperCase()} • {finalRankings.length} Players • {formatDuration(statistics.duration / 1000)}
            </p>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="results-tabs">
          <button
            className={selectedTab === 'podium' ? 'active' : ''}
            onClick={() => setSelectedTab('podium')}
          >
            🏆 Podium
          </button>
          <button
            className={selectedTab === 'full-results' ? 'active' : ''}
            onClick={() => setSelectedTab('full-results')}
          >
            📊 Full Results
          </button>
          <button
            className={selectedTab === 'statistics' ? 'active' : ''}
            onClick={() => setSelectedTab('statistics')}
          >
            📈 Statistics
          </button>
          <button
            className={selectedTab === 'insights' ? 'active' : ''}
            onClick={() => setSelectedTab('insights')}
          >
            💡 Insights
          </button>
        </div>

        <div className="results-content">
          {selectedTab === 'podium' && (
            <div className="podium-view">
              <div className="podium-container">
                {getPodiumPlayers().map((ranking, index) => (
                  <div key={ranking.player.id} className={`podium-position position-${index + 1}`}>
                    <div className="podium-player">
                      <div className="medal">{getMedalIcon(ranking.rank)}</div>
                      <div className="player-info">
                        <h3>{ranking.player.name}</h3>
                        {ranking.player.isHost && <span className="host-crown">👑</span>}
                      </div>
                      <div className="player-stats">
                        <div className="stat">
                          <span className="label">Points</span>
                          <span className="value">{ranking.tournamentPoints}</span>
                        </div>
                        <div className="stat">
                          <span className="label">Record</span>
                          <span className="value">{ranking.matchRecord}</span>
                        </div>
                        <div className="stat">
                          <span className="label">Cooperation</span>
                          <span className="value">{ranking.cooperationPercentage}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {statistics.tournamentMVP && (
                <div className="mvp-section">
                  <h4>🌟 Tournament MVP</h4>
                  <div className="mvp-card">
                    <span className="mvp-name">{statistics.tournamentMVP.name}</span>
                    <span className="mvp-reason">Outstanding overall performance</span>
                  </div>
                </div>
              )}

              <div className="tournament-highlights">
                <h4>🎯 Tournament Highlights</h4>
                <div className="highlights-grid">
                  {insights.highlights.map((highlight, index) => (
                    <div key={index} className="highlight-item">
                      {highlight}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedTab === 'full-results' && (
            <div className="full-results-view">
              <div className="results-table">
                <div className="table-header">
                  <div>Rank</div>
                  <div>Player</div>
                  <div>Points</div>
                  <div>Record</div>
                  <div>Avg Score</div>
                  <div>Cooperation</div>
                </div>
                
                {finalRankings.map((ranking) => (
                  <div key={ranking.player.id} className="result-row">
                    <div className="rank-cell">
                      <span className="rank-medal">{getMedalIcon(ranking.rank)}</span>
                    </div>
                    <div className="player-cell">
                      <span className="player-name">{ranking.player.name}</span>
                      {ranking.player.isHost && <span className="host-badge">👑</span>}
                    </div>
                    <div className="points-cell">{ranking.tournamentPoints}</div>
                    <div className="record-cell">{ranking.matchRecord}</div>
                    <div className="avg-cell">{ranking.averagePointsPerMatch}</div>
                    <div className="coop-cell">{ranking.cooperationPercentage}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedTab === 'statistics' && (
            <div className="statistics-view">
              <div className="stats-grid">
                <div className="stat-card">
                  <h5>Tournament Overview</h5>
                  <div className="stat-list">
                    <div className="stat-item">
                      <span>Total Matches:</span>
                      <span>{statistics.totalMatches}</span>
                    </div>
                    <div className="stat-item">
                      <span>Total Rounds:</span>
                      <span>{statistics.totalRounds}</span>
                    </div>
                    <div className="stat-item">
                      <span>Duration:</span>
                      <span>{formatDuration(statistics.duration / 1000)}</span>
                    </div>
                    <div className="stat-item">
                      <span>Avg Match Duration:</span>
                      <span>{Math.round(statistics.averageMatchDuration / 60)}m</span>
                    </div>
                  </div>
                </div>

                <div className="stat-card">
                  <h5>Player Behavior</h5>
                  <div className="stat-list">
                    <div className="stat-item">
                      <span>Overall Cooperation:</span>
                      <span>{Math.round(statistics.cooperationRate * 100)}%</span>
                    </div>
                    <div className="stat-item">
                      <span>Overall Competition:</span>
                      <span>{Math.round(statistics.betrayalRate * 100)}%</span>
                    </div>
                    <div className="stat-item">
                      <span>Most Cooperative:</span>
                      <span>{statistics.mostCooperativePlayer?.name || 'N/A'}</span>
                    </div>
                    <div className="stat-item">
                      <span>Most Competitive:</span>
                      <span>{statistics.mostCompetitivePlayer?.name || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="stat-card">
                  <h5>Match Records</h5>
                  <div className="stat-list">
                    <div className="stat-item">
                      <span>Highest Scoring Match:</span>
                      <span>
                        {statistics.highestScoringMatch 
                          ? `${statistics.highestScoringMatch.player1Score + statistics.highestScoringMatch.player2Score} pts`
                          : 'N/A'
                        }
                      </span>
                    </div>
                    <div className="stat-item">
                      <span>Tournament MVP:</span>
                      <span>{statistics.tournamentMVP?.name || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="stat-card">
                  <h5>Tournament Trends</h5>
                  <div className="stat-list">
                    <div className="stat-item">
                      <span>Competitiveness Level:</span>
                      <span className={`competitiveness ${trends.competitivenessLevel}`}>
                        {trends.competitivenessLevel.toUpperCase()}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span>Comeback Stories:</span>
                      <span>{trends.comebackStories.length}</span>
                    </div>
                    <div className="stat-item">
                      <span>Dominant Players:</span>
                      <span>{trends.dominantPlayers.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedTab === 'insights' && (
            <div className="insights-view">
              <div className="insights-sections">
                <div className="insight-section">
                  <h4>🎯 Tournament Insights</h4>
                  <div className="insight-list">
                    {insights.insights.map((insight, index) => (
                      <div key={index} className="insight-item">
                        {insight}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="insight-section">
                  <h4>🏆 Tournament Records</h4>
                  <div className="insight-list">
                    {insights.records.map((record, index) => (
                      <div key={index} className="insight-item">
                        {record}
                      </div>
                    ))}
                  </div>
                </div>

                {trends.comebackStories.length > 0 && (
                  <div className="insight-section">
                    <h4>📈 Comeback Stories</h4>
                    <div className="comeback-list">
                      {trends.comebackStories.map((story, index) => (
                        <div key={index} className="comeback-item">
                          <strong>{story.playerName}</strong> climbed {story.improvement} positions 
                          to finish #{story.finalRank}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {trends.dominantPlayers.length > 0 && (
                  <div className="insight-section">
                    <h4>👑 Dominant Performances</h4>
                    <div className="dominant-list">
                      {trends.dominantPlayers.map((player, index) => (
                        <div key={index} className="dominant-item">
                          <strong>{player.playerName}</strong> - Dominance Score: {player.dominanceScore}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="results-actions">
          <button className="export-btn" onClick={handleExport}>
            📥 Export Results
          </button>
          <button className="close-results-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TournamentResults;