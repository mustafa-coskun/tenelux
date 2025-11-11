import React, { useState, useEffect } from 'react';
import {
  TournamentHistoryService,
  TournamentAnalytics,
  PlayerTournamentHistory,
  TournamentHistoryEntry
} from '../services/tournament/TournamentHistoryService';
import { TournamentFormat } from '../types/party';
import './TournamentAnalyticsDashboard.css';

interface TournamentAnalyticsDashboardProps {
  onClose?: () => void;
}

export const TournamentAnalyticsDashboard: React.FC<TournamentAnalyticsDashboardProps> = ({
  onClose
}) => {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'history' | 'players' | 'trends'>('overview');
  const [analytics, setAnalytics] = useState<TournamentAnalytics | null>(null);
  const [recentHistory, setRecentHistory] = useState<TournamentHistoryEntry[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [playerHistory, setPlayerHistory] = useState<PlayerTournamentHistory | null>(null);

  useEffect(() => {
    const loadAnalytics = () => {
      const analyticsData = TournamentHistoryService.generateTournamentAnalytics();
      const historyData = TournamentHistoryService.getRecentTournamentHistory(20);
      
      setAnalytics(analyticsData);
      setRecentHistory(historyData);
    };

    loadAnalytics();
  }, []);

  const handlePlayerSelect = (playerId: string) => {
    setSelectedPlayer(playerId);
    const history = TournamentHistoryService.getPlayerHistory(playerId);
    setPlayerHistory(history);
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getFormatIcon = (format: TournamentFormat) => {
    switch (format) {
      case TournamentFormat.SINGLE_ELIMINATION:
        return '🏆';
      case TournamentFormat.DOUBLE_ELIMINATION:
        return '⚔️';
      case TournamentFormat.ROUND_ROBIN:
        return '🔄';
      default:
        return '🎮';
    }
  };

  const exportAnalytics = () => {
    const exportData = TournamentHistoryService.exportHistory();
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tournament-analytics-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!analytics) {
    return <div className="analytics-loading">Loading analytics...</div>;
  }

  return (
    <div className="tournament-analytics-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h2>📊 Tournament Analytics</h2>
          <p>Comprehensive tournament statistics and insights</p>
        </div>
        <div className="header-actions">
          <button className="export-btn" onClick={exportAnalytics}>
            📥 Export Data
          </button>
          {onClose && (
            <button className="close-btn" onClick={onClose}>✕</button>
          )}
        </div>
      </div>

      <div className="dashboard-tabs">
        <button
          className={selectedTab === 'overview' ? 'active' : ''}
          onClick={() => setSelectedTab('overview')}
        >
          📈 Overview
        </button>
        <button
          className={selectedTab === 'history' ? 'active' : ''}
          onClick={() => setSelectedTab('history')}
        >
          📚 History
        </button>
        <button
          className={selectedTab === 'players' ? 'active' : ''}
          onClick={() => setSelectedTab('players')}
        >
          👥 Players
        </button>
        <button
          className={selectedTab === 'trends' ? 'active' : ''}
          onClick={() => setSelectedTab('trends')}
        >
          📊 Trends
        </button>
      </div>

      <div className="dashboard-content">
        {selectedTab === 'overview' && (
          <div className="overview-tab">
            <div className="stats-grid">
              <div className="stat-card primary">
                <div className="stat-icon">🏆</div>
                <div className="stat-content">
                  <h3>{analytics.totalTournaments}</h3>
                  <p>Total Tournaments</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-content">
                  <h3>{analytics.totalPlayers}</h3>
                  <p>Unique Players</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">⏱️</div>
                <div className="stat-content">
                  <h3>{formatDuration(analytics.averageTournamentDuration)}</h3>
                  <p>Avg Duration</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🔄</div>
                <div className="stat-content">
                  <h3>{analytics.playerRetentionRate}%</h3>
                  <p>Player Retention</p>
                </div>
              </div>
            </div>

            <div className="overview-sections">
              <div className="section format-distribution">
                <h4>Tournament Format Distribution</h4>
                <div className="format-chart">
                  {analytics.formatDistribution.map((format) => (
                    <div key={format.format} className="format-bar">
                      <div className="format-info">
                        <span className="format-icon">{getFormatIcon(format.format)}</span>
                        <span className="format-name">
                          {format.format.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div className="format-stats">
                        <div 
                          className="format-progress"
                          style={{ width: `${format.percentage}%` }}
                        />
                        <span className="format-percentage">{format.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section behavior-analysis">
                <h4>Player Behavior Analysis</h4>
                <div className="behavior-stats">
                  <div className="behavior-item">
                    <div className="behavior-label">
                      <span className="behavior-icon">🤝</span>
                      <span>Average Cooperation Rate</span>
                    </div>
                    <div className="behavior-value cooperation">
                      {analytics.averageCooperationRate}%
                    </div>
                  </div>
                  <div className="behavior-item">
                    <div className="behavior-label">
                      <span className="behavior-icon">⚔️</span>
                      <span>Competitiveness Index</span>
                    </div>
                    <div className="behavior-value competitiveness">
                      {analytics.competitivenessIndex}%
                    </div>
                  </div>
                </div>
              </div>

              <div className="section top-performers">
                <h4>🏆 Top Performers</h4>
                <div className="performers-list">
                  {analytics.topPerformers.slice(0, 5).map((performer, index) => (
                    <div key={performer.playerId} className="performer-item">
                      <div className="performer-rank">#{index + 1}</div>
                      <div className="performer-info">
                        <span className="performer-name">{performer.playerName}</span>
                        <span className="performer-stats">
                          {performer.tournamentsWon} wins • {performer.winRate}% win rate
                        </span>
                      </div>
                      <div className="performer-avg-rank">
                        Avg Rank: {performer.averageRank}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'history' && (
          <div className="history-tab">
            <div className="history-header">
              <h4>Recent Tournament History</h4>
              <span className="history-count">{recentHistory.length} tournaments</span>
            </div>
            
            <div className="history-list">
              {recentHistory.map((entry) => (
                <div key={entry.tournament.id} className="history-item">
                  <div className="tournament-info">
                    <div className="tournament-header">
                      <span className="tournament-format">
                        {getFormatIcon(entry.format)} {entry.format.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="tournament-date">{formatDate(entry.completedAt)}</span>
                    </div>
                    <div className="tournament-details">
                      <span className="tournament-winner">🏆 {entry.winner}</span>
                      <span className="tournament-participants">{entry.participants.length} players</span>
                      <span className="tournament-duration">{formatDuration(entry.duration / 1000)}</span>
                    </div>
                  </div>
                  
                  <div className="tournament-stats">
                    <div className="stat-item">
                      <span className="stat-label">Matches</span>
                      <span className="stat-value">{entry.totalMatches}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Cooperation</span>
                      <span className="stat-value cooperation">
                        {Math.round(entry.statistics.cooperationRate * 100)}%
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Competition</span>
                      <span className="stat-value competition">
                        {Math.round(entry.statistics.betrayalRate * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTab === 'players' && (
          <div className="players-tab">
            <div className="players-header">
              <h4>Player Performance Analysis</h4>
              <select 
                value={selectedPlayer} 
                onChange={(e) => handlePlayerSelect(e.target.value)}
                className="player-select"
              >
                <option value="">Select a player...</option>
                {analytics.topPerformers.map((performer) => (
                  <option key={performer.playerId} value={performer.playerId}>
                    {performer.playerName}
                  </option>
                ))}
              </select>
            </div>

            {playerHistory ? (
              <div className="player-analysis">
                <div className="player-overview">
                  <h5>{playerHistory.playerName}'s Tournament History</h5>
                  <div className="player-stats-grid">
                    <div className="player-stat">
                      <span className="stat-label">Tournaments Played</span>
                      <span className="stat-value">{playerHistory.overallStats.tournamentsPlayed}</span>
                    </div>
                    <div className="player-stat">
                      <span className="stat-label">Tournaments Won</span>
                      <span className="stat-value">{playerHistory.overallStats.tournamentsWon}</span>
                    </div>
                    <div className="player-stat">
                      <span className="stat-label">Win Rate</span>
                      <span className="stat-value">{Math.round(playerHistory.overallStats.winRate * 100)}%</span>
                    </div>
                    <div className="player-stat">
                      <span className="stat-label">Average Rank</span>
                      <span className="stat-value">{playerHistory.overallStats.averageRank.toFixed(1)}</span>
                    </div>
                    <div className="player-stat">
                      <span className="stat-label">Best Rank</span>
                      <span className="stat-value">#{playerHistory.overallStats.bestRank}</span>
                    </div>
                    <div className="player-stat">
                      <span className="stat-label">Favorite Format</span>
                      <span className="stat-value">
                        {getFormatIcon(playerHistory.overallStats.favoriteFormat)} 
                        {playerHistory.overallStats.favoriteFormat.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="player-tournament-history">
                  <h6>Tournament History</h6>
                  <div className="tournament-history-list">
                    {playerHistory.tournaments.slice(0, 10).map((tournament, index) => (
                      <div key={tournament.tournamentId} className="tournament-history-item">
                        <div className="tournament-rank">
                          <span className="rank-number">#{tournament.finalRank}</span>
                          <span className="rank-total">/{tournament.totalPlayers}</span>
                        </div>
                        <div className="tournament-info">
                          <span className="tournament-format">
                            {getFormatIcon(tournament.format)} {tournament.format.replace('_', ' ')}
                          </span>
                          <span className="tournament-date">{formatDate(tournament.completedAt)}</span>
                        </div>
                        <div className="tournament-performance">
                          <span className="tournament-points">{tournament.tournamentPoints} pts</span>
                          <span className="tournament-record">{tournament.matchRecord}</span>
                          <span className="tournament-cooperation">
                            {Math.round(tournament.cooperationRate * 100)}% coop
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-player-selected">
                <p>Select a player to view their detailed performance analysis</p>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'trends' && (
          <div className="trends-tab">
            <div className="trends-sections">
              <div className="section recent-trends">
                <h4>📈 Recent Activity Trends</h4>
                <div className="trends-grid">
                  {analytics.recentTrends.map((trend, index) => (
                    <div key={index} className="trend-card">
                      <h5>{trend.period}</h5>
                      <div className="trend-stats">
                        <div className="trend-stat">
                          <span className="trend-label">Tournaments</span>
                          <span className="trend-value">{trend.tournamentsCount}</span>
                        </div>
                        <div className="trend-stat">
                          <span className="trend-label">Avg Players</span>
                          <span className="trend-value">{trend.averageParticipants}</span>
                        </div>
                        <div className="trend-stat">
                          <span className="trend-label">Cooperation</span>
                          <span className={`trend-value ${trend.cooperationTrend}`}>
                            {trend.cooperationTrend === 'increasing' ? '📈' : 
                             trend.cooperationTrend === 'decreasing' ? '📉' : '➡️'}
                            {trend.cooperationTrend}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section summary-insights">
                <h4>💡 Key Insights</h4>
                <div className="insights-list">
                  <div className="insight-item">
                    <span className="insight-icon">🎯</span>
                    <span className="insight-text">
                      Most popular format: {getFormatIcon(analytics.mostPopularFormat)} 
                      {analytics.mostPopularFormat.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="insight-item">
                    <span className="insight-icon">🤝</span>
                    <span className="insight-text">
                      {analytics.averageCooperationRate > 60 
                        ? 'Players tend to be cooperative in tournaments'
                        : analytics.averageCooperationRate > 40
                        ? 'Balanced mix of cooperation and competition'
                        : 'Highly competitive tournament environment'
                      }
                    </span>
                  </div>
                  
                  <div className="insight-item">
                    <span className="insight-icon">🔄</span>
                    <span className="insight-text">
                      {analytics.playerRetentionRate > 70
                        ? 'Excellent player retention - players love coming back!'
                        : analytics.playerRetentionRate > 50
                        ? 'Good player retention rate'
                        : 'Opportunity to improve player retention'
                      }
                    </span>
                  </div>

                  {analytics.topPerformers.length > 0 && (
                    <div className="insight-item">
                      <span className="insight-icon">👑</span>
                      <span className="insight-text">
                        {analytics.topPerformers[0].playerName} leads with {analytics.topPerformers[0].winRate}% win rate
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TournamentAnalyticsDashboard;