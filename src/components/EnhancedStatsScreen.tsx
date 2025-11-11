import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameModeStatsService } from '../services/GameModeStatsService';
import { getEnhancedTrustScoreService } from '../services/EnhancedTrustScoreService';
import { 
  SeparateStats, 
  BehaviorStats, 
  GameMode, 
  SinglePlayerStats, 
  MultiPlayerStats, 
  PartyStats 
} from '../database/core/types';
import './EnhancedStatsScreen.css';

interface PlayerStats {
  totalGames: number;
  wins: number;
  losses: number;
  cooperations: number;
  betrayals: number;
  totalScore: number;
  winRate: number;
  cooperationRate: number;
  betrayalRate: number;
  averageScore: number;
  trustScore: number;
  multiplayerStats?: PlayerStats;
  partyStats?: PlayerStats;
}

interface EnhancedStatsScreenProps {
  player: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    stats: PlayerStats;
  };
  onClose: () => void;
}

const EnhancedStatsScreen: React.FC<EnhancedStatsScreenProps> = ({ player, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'single' | 'multiplayer' | 'party'>('single');
  const [separateStats, setSeparateStats] = useState<SeparateStats | null>(null);
  const [behaviorStats, setBehaviorStats] = useState<BehaviorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEnhancedStats();
  }, [player.id]);

  const loadEnhancedStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const gameModeStatsService = getGameModeStatsService();
      const trustScoreService = getEnhancedTrustScoreService();

      const [stats, behavior] = await Promise.all([
        gameModeStatsService.getSeparateStatistics(player.id),
        trustScoreService.getPlayerBehaviorStats(player.id)
      ]);

      setSeparateStats(stats);
      setBehaviorStats(behavior);
    } catch (err) {
      console.error('Failed to load enhanced stats:', err);
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentStats = (): SinglePlayerStats | MultiPlayerStats | PartyStats | null => {
    if (!separateStats) return null;
    
    switch (activeTab) {
      case 'single':
        return separateStats.singlePlayer;
      case 'multiplayer':
        return separateStats.multiplayer;
      case 'party':
        return separateStats.party;
      default:
        return separateStats.singlePlayer;
    }
  };

  const currentStats = getCurrentStats();

  const getTrustScoreColor = (score: number): string => {
    if (score >= 80) return '#4CAF50'; // Green
    if (score >= 60) return '#8BC34A'; // Light Green
    if (score >= 40) return '#FFC107'; // Yellow
    if (score >= 20) return '#FF9800'; // Orange
    return '#F44336'; // Red
  };

  const getTrustScoreLabel = (score: number): string => {
    if (score >= 80) return t('stats.trustLevel.veryHigh');
    if (score >= 60) return t('stats.trustLevel.high');
    if (score >= 40) return t('stats.trustLevel.medium');
    if (score >= 20) return t('stats.trustLevel.low');
    return t('stats.trustLevel.veryLow');
  };

  const getBehaviorTrendColor = (trend: string): string => {
    switch (trend) {
      case 'improving': return '#4CAF50';
      case 'declining': return '#F44336';
      default: return '#FFC107';
    }
  };

  const getBehaviorTrendLabel = (trend: string): string => {
    switch (trend) {
      case 'improving': return t('stats.behavior.improving');
      case 'declining': return t('stats.behavior.declining');
      default: return t('stats.behavior.stable');
    }
  };

  const getCooperationRate = (stats: MultiPlayerStats | PartyStats): number => {
    const total = stats.cooperations + stats.betrayals;
    return total > 0 ? (stats.cooperations / total) * 100 : 0;
  };

  const StatCard: React.FC<{ 
    title: string; 
    value: string | number; 
    subtitle?: string;
    color?: string;
  }> = ({ title, value, subtitle, color }) => (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {subtitle && <div className="stat-subtitle">{subtitle}</div>}
    </div>
  );

  const ProgressBar: React.FC<{ 
    value: number; 
    max: number; 
    color: string; 
    label: string;
  }> = ({ value, max, color, label }) => (
    <div className="progress-container">
      <div className="progress-label">
        <span>{label}</span>
        <span>{Math.round((value / max) * 100)}%</span>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ 
            width: `${Math.min((value / max) * 100, 100)}%`,
            backgroundColor: color 
          }}
        />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="enhanced-stats-overlay">
        <div className="enhanced-stats-container">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>{t('stats.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="enhanced-stats-overlay">
        <div className="enhanced-stats-container">
          <div className="error-message">
            <p>{error}</p>
            <button onClick={onClose} className="close-button">
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="enhanced-stats-overlay">
      <div className="enhanced-stats-container">
        <div className="stats-header">
          <div className="player-info">
            <div className="player-avatar">{player.avatar}</div>
            <div className="player-details">
              <h2>{player.displayName}</h2>
              <p>@{player.username}</p>
              {behaviorStats && (
                <div className="trust-score-badge">
                  <span className="trust-score-value" style={{ color: getTrustScoreColor(behaviorStats.trustScore) }}>
                    {Math.round(behaviorStats.trustScore)}
                  </span>
                  <span className="trust-score-text">{t('stats.trustScore')}</span>
                </div>
              )}
            </div>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="stats-tabs">
          <button 
            className={`tab-button ${activeTab === 'single' ? 'active' : ''}`}
            onClick={() => setActiveTab('single')}
          >
            {t('stats.tabs.singlePlayer')}
          </button>
          <button 
            className={`tab-button ${activeTab === 'multiplayer' ? 'active' : ''}`}
            onClick={() => setActiveTab('multiplayer')}
          >
            {t('stats.tabs.multiplayer')}
          </button>
          <button 
            className={`tab-button ${activeTab === 'party' ? 'active' : ''}`}
            onClick={() => setActiveTab('party')}
          >
            {t('stats.tabs.party')}
          </button>
        </div>

        <div className="stats-content">
          {/* Trust Score Section - Only show for multiplayer and party modes */}
          {(activeTab === 'multiplayer' || activeTab === 'party') && behaviorStats && (
            <div className="trust-score-section">
              <div className="trust-score-main">
                <div className="trust-score-circle">
                  <svg viewBox="0 0 100 100" className="trust-score-svg">
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#e0e0e0"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke={getTrustScoreColor(behaviorStats.trustScore)}
                      strokeWidth="8"
                      strokeDasharray={`${(behaviorStats.trustScore / 100) * 283} 283`}
                      strokeDashoffset="0"
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="trust-score-text">
                    <div className="trust-score-number">{Math.round(behaviorStats.trustScore)}</div>
                    <div className="trust-score-label">{t('stats.trustScore')}</div>
                  </div>
                </div>
                <div className="trust-score-info">
                  <h3>{getTrustScoreLabel(behaviorStats.trustScore)}</h3>
                  <p>{t('stats.trustScore.description')}</p>
                  <div className="behavior-trend">
                    <span className="trend-label">{t('stats.behavior.trend')}: </span>
                    <span 
                      className="trend-value" 
                      style={{ color: getBehaviorTrendColor(behaviorStats.behaviorTrend) }}
                    >
                      {getBehaviorTrendLabel(behaviorStats.behaviorTrend)}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Behavior Statistics */}
              <div className="behavior-details">
                <div className="behavior-stat">
                  <span className="behavior-label">{t('stats.behavior.silenceRatio')}</span>
                  <span className="behavior-value">{Math.round(behaviorStats.silenceRatio * 100)}%</span>
                </div>
                <div className="behavior-stat">
                  <span className="behavior-label">{t('stats.behavior.totalGames')}</span>
                  <span className="behavior-value">{behaviorStats.totalGames}</span>
                </div>
                <div className="behavior-stat">
                  <span className="behavior-label">{t('stats.behavior.silentGames')}</span>
                  <span className="behavior-value">{behaviorStats.silentGames}</span>
                </div>
              </div>
            </div>
          )}

          {/* Game Statistics */}
          {currentStats && (
            <div className="stats-grid">
              <StatCard
                title={t('stats.totalGames')}
                value={currentStats.totalGames}
              />
              <StatCard
                title={t('stats.wins')}
                value={currentStats.wins}
                subtitle={`${t('stats.losses')}: ${currentStats.losses}`}
                color="#4CAF50"
              />
              {currentStats.draws !== undefined && (
                <StatCard
                  title={t('stats.draws')}
                  value={currentStats.draws}
                  color="#FFC107"
                />
              )}
              <StatCard
                title={t('stats.averageScore')}
                value={Math.round(currentStats.averageScore)}
                subtitle={`${t('stats.highestScore')}: ${currentStats.highestScore}`}
              />
              <StatCard
                title={t('stats.totalScore')}
                value={currentStats.totalScore.toLocaleString()}
              />
              
              {/* Multiplayer/Party specific stats */}
              {(activeTab === 'multiplayer' || activeTab === 'party') && 'cooperations' in currentStats && (
                <>
                  <StatCard
                    title={t('stats.cooperationRate')}
                    value={`${Math.round(getCooperationRate(currentStats))}%`}
                    subtitle={`${currentStats.cooperations} ${t('stats.cooperations')}`}
                    color={getTrustScoreColor(getCooperationRate(currentStats))}
                  />
                  <StatCard
                    title={t('stats.betrayals')}
                    value={currentStats.betrayals}
                    color="#F44336"
                  />
                  <StatCard
                    title={t('stats.winRate')}
                    value={`${Math.round(currentStats.winRate)}%`}
                    color={currentStats.winRate >= 50 ? '#4CAF50' : '#FF9800'}
                  />
                </>
              )}

              {/* Multiplayer specific stats */}
              {activeTab === 'multiplayer' && 'rankPoints' in currentStats && (
                <>
                  <StatCard
                    title={t('stats.rankPoints')}
                    value={currentStats.rankPoints}
                    color="#9C27B0"
                  />
                  <StatCard
                    title={t('stats.longestWinStreak')}
                    value={currentStats.longestWinStreak}
                    subtitle={`${t('stats.currentStreak')}: ${currentStats.currentWinStreak}`}
                    color="#FF9800"
                  />
                </>
              )}

              {/* Party specific stats */}
              {activeTab === 'party' && 'partiesHosted' in currentStats && (
                <>
                  <StatCard
                    title={t('stats.partiesHosted')}
                    value={currentStats.partiesHosted}
                    color="#2196F3"
                  />
                  <StatCard
                    title={t('stats.partiesJoined')}
                    value={currentStats.partiesJoined}
                    color="#03DAC6"
                  />
                </>
              )}

              <StatCard
                title={t('stats.totalPlaytime')}
                value={`${Math.floor(currentStats.totalPlaytime / 60)}m`}
                subtitle={`${currentStats.totalPlaytime % 60}s`}
              />
            </div>
          )}

          {/* Behavior Analysis - Only for multiplayer and party modes */}
          {(activeTab === 'multiplayer' || activeTab === 'party') && currentStats && 'cooperations' in currentStats && (
            <div className="behavior-section">
              <h3>{t('stats.behaviorAnalysis')}</h3>
              <div className="behavior-bars">
                <ProgressBar
                  value={currentStats.cooperations}
                  max={currentStats.cooperations + currentStats.betrayals}
                  color="#4CAF50"
                  label={t('stats.cooperation')}
                />
                <ProgressBar
                  value={currentStats.betrayals}
                  max={currentStats.cooperations + currentStats.betrayals}
                  color="#F44336"
                  label={t('stats.betrayal')}
                />
              </div>
            </div>
          )}

          {/* Matchmaking Info - Only for multiplayer mode */}
          {activeTab === 'multiplayer' && behaviorStats && (
            <div className="matchmaking-section">
              <h3>{t('stats.matchmaking')}</h3>
              <div className="matchmaking-info">
                <p>{t('stats.matchmaking.description')}</p>
                <div className="trust-range">
                  <span>{t('stats.matchmaking.range')}: </span>
                  <span className="range-values">
                    {Math.max(0, Math.round(behaviorStats.trustScore - 15))} - {Math.min(100, Math.round(behaviorStats.trustScore + 15))}
                  </span>
                </div>
                <div className="matchmaking-quality">
                  <span>{t('stats.matchmaking.quality')}: </span>
                  <span className="quality-indicator" style={{ color: getTrustScoreColor(behaviorStats.trustScore) }}>
                    {getTrustScoreLabel(behaviorStats.trustScore)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Game Mode Information */}
          <div className="mode-info-section">
            <h3>{t(`stats.modes.${activeTab}.title`)}</h3>
            <p>{t(`stats.modes.${activeTab}.description`)}</p>
            {activeTab === 'single' && (
              <div className="mode-note">
                <p>{t('stats.modes.single.note')}</p>
              </div>
            )}
          </div>

          {/* No Data Message */}
          {currentStats && currentStats.totalGames === 0 && (
            <div className="no-data-message">
              <p>{t('stats.noData', { mode: t(`stats.tabs.${activeTab}`) })}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnhancedStatsScreen;