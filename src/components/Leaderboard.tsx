import React, { useState, useEffect } from 'react';
import { User, getUserService } from '../services/UserService';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import './Leaderboard.css';

interface LeaderboardProps {
  onClose: () => void;
  currentUser: User | null;
}

type LeaderboardType = 'global' | 'local' | 'friends' | 'weekly' | 'monthly';
type SortType = 'totalScore' | 'trustScore' | 'winRate' | 'totalGames';

interface LeaderboardEntry {
  user: User;
  rank: number;
  isCurrentUser: boolean;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ onClose, currentUser }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<LeaderboardType>('global');
  const [sortBy, setSortBy] = useState<SortType>('totalScore');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const userService = getUserService();

  useEffect(() => {
    loadLeaderboard();
  }, [activeTab, sortBy]);

  const loadLeaderboard = async () => {
    setLoading(true);

    try {
      // API'den leaderboard verilerini çek
      const response = await fetch(`/api/leaderboard?filter=${activeTab}&limit=50&orderBy=${sortBy}`);

      if (!response.ok) {
        throw new Error('Leaderboard yüklenemedi');
      }

      const data = await response.json();
      let users = data.leaderboard || [];

      // Create leaderboard entries from API response
      const entries: LeaderboardEntry[] = users.map((entry: any) => ({
        user: {
          id: entry.id,
          username: entry.username,
          displayName: entry.displayName,
          avatar: entry.avatar,
          isOnline: entry.isOnline,
          stats: entry.stats,
          friends: [],
          friendRequests: { sent: [], received: [] },
          isGuest: false,
          createdAt: new Date(),
          lastActive: new Date(),
          achievements: [],
          preferences: {
            matchmakingRegion: 'global' as const,
            trustScoreMatching: true,
            allowFriendRequests: true
          }
        } as User,
        rank: entry.rank,
        isCurrentUser: currentUser?.id === entry.id
      }));

      setLeaderboardData(entries);

    } catch (error) {
      console.error('Leaderboard yükleme hatası:', error);
      // Hata durumunda boş liste göster
      setLeaderboardData([]);
    } finally {
      setLoading(false);
    }
  };

  const getTrustScoreColor = (trustScore: number): string => {
    if (trustScore >= 80) return '#28a745'; // Green
    if (trustScore >= 60) return '#ffc107'; // Yellow
    if (trustScore >= 40) return '#fd7e14'; // Orange
    return '#dc3545'; // Red
  };

  const sendFriendRequest = (targetUserId: string) => {
    if (userService.sendFriendRequest(targetUserId)) {
      // Show success message or update UI
      console.log('Friend request sent!');
    }
  };

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className="leaderboard-overlay">
      <div className={`leaderboard-container ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
        <div className="leaderboard-header">
          <h2>🏆 {t('leaderboard.title')}</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="leaderboard-tabs">
          <button
            className={`tab ${activeTab === 'global' ? 'active' : ''}`}
            onClick={() => setActiveTab('global')}
          >
            🌍 {t('leaderboard.global')}
          </button>
          <button
            className={`tab ${activeTab === 'local' ? 'active' : ''}`}
            onClick={() => setActiveTab('local')}
          >
            📍 {t('leaderboard.local')}
          </button>
          <button
            className={`tab ${activeTab === 'weekly' ? 'active' : ''}`}
            onClick={() => setActiveTab('weekly')}
          >
            📅 {t('leaderboard.weekly')}
          </button>
          <button
            className={`tab ${activeTab === 'monthly' ? 'active' : ''}`}
            onClick={() => setActiveTab('monthly')}
          >
            📆 {t('leaderboard.monthly')}
          </button>
          <button
            className={`tab ${activeTab === 'friends' ? 'active' : ''}`}
            onClick={() => setActiveTab('friends')}
            disabled={!currentUser || currentUser.isGuest}
          >
            👥 {t('leaderboard.friends')}
          </button>
        </div>

        <div className="leaderboard-sort">
          <label>{t('leaderboard.sortBy')}:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortType)}
            className="sort-select"
          >
            <option value="totalScore">🏆 {t('leaderboard.totalScore')}</option>
            <option value="trustScore">🤝 {t('leaderboard.trustScore')}</option>
            <option value="winRate">📈 {t('leaderboard.winRate')}</option>
            <option value="totalGames">🎮 {t('leaderboard.totalGames')}</option>
          </select>
        </div>

        <div className="leaderboard-content">
          {loading ? (
            <div className="loading">{t('leaderboard.loading')}</div>
          ) : (
            <div className="leaderboard-list">
              {leaderboardData.map((entry) => (
                <div
                  key={entry.user.id}
                  className={`leaderboard-entry ${entry.isCurrentUser ? 'current-user' : ''}`}
                >
                  <div className="rank">#{entry.rank}</div>

                  <div className="list-user-info">
                    <div className="user-name">
                      <span className="user-avatar">{entry.user.avatar}</span>
                      {entry.user.displayName}
                      {entry.isCurrentUser && <span className="you-badge">{t('leaderboard.you')}</span>}
                    </div>
                    <div className="username-small">@{entry.user.username}</div>
                    <div className="user-stats">
                      <span>{entry.user.stats.totalGames} {t('leaderboard.games')}</span>
                      <span>{t('leaderboard.winRate')}: {entry.user.stats.winRate.toFixed(1)}%</span>
                      <span
                        className="trust-score"
                        style={{ color: getTrustScoreColor(entry.user.stats.trustScore) }}
                      >
                        {t('leaderboard.trustScore')}: {entry.user.stats.trustScore}
                      </span>
                    </div>
                  </div>

                  <div className="leaderboard-score">
                    {sortBy === 'totalScore' && (
                      <span className="score-value">
                        🏆 {entry.user.stats.totalScore.toLocaleString()}
                      </span>
                    )}
                    {sortBy === 'trustScore' && (
                      <span
                        className="score-value trust-score"
                        style={{ color: getTrustScoreColor(entry.user.stats.trustScore) }}
                      >
                        🤝 {entry.user.stats.trustScore}%
                      </span>
                    )}
                    {sortBy === 'winRate' && (
                      <span className="score-value">
                        📈 {entry.user.stats.winRate.toFixed(1)}%
                      </span>
                    )}
                    {sortBy === 'totalGames' && (
                      <span className="score-value">
                        🎮 {entry.user.stats.totalGames}
                      </span>
                    )}
                  </div>

                  {!entry.isCurrentUser && currentUser && !currentUser.isGuest && (
                    <div className="actions">
                      {!currentUser.friends.includes(entry.user.id) && (
                        <button
                          className="friend-request-btn"
                          onClick={() => sendFriendRequest(entry.user.id)}
                          disabled={currentUser.friendRequests.sent.includes(entry.user.id)}
                          title={currentUser.friendRequests.sent.includes(entry.user.id) ?
                            t('leaderboard.friendRequestSent') :
                            t('leaderboard.sendFriendRequest')
                          }
                        >
                          {currentUser.friendRequests.sent.includes(entry.user.id) ? '⏳' : '➕'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {currentUser && currentUser.isGuest && (
          <div className="guest-notice">
            <p>📝 {t('leaderboard.guestNotice')}</p>
          </div>
        )}
      </div>
    </div>
  );
};