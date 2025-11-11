import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import './FriendsManager.css';

interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  isOnline: boolean;
  lastActive: string;
  stats: {
    trustScore: number;
    totalGames: number;
    winRate: number;
  };
}

interface FriendRequest {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
}

interface FriendsManagerProps {
  currentUserId: string;
  onClose: () => void;
}

const FriendsManager: React.FC<FriendsManagerProps> = ({ currentUserId, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<{
    sent: FriendRequest[];
    received: FriendRequest[];
  }>({ sent: [], received: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Get session token once
  const getSessionToken = () => {
    try {
      const sessionData = localStorage.getItem('tenebris_server_session');
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        return parsed.sessionToken;
      }
      return null;
    } catch (error) {
      console.error('Error parsing session data:', error);
      return null;
    }
  };
  
  const sessionToken = getSessionToken();

  useEffect(() => {
    loadFriends();
    loadPendingRequests();
  }, []);

  const loadFriends = async () => {
    try {
      if (!sessionToken) {
        console.warn('No session token available');
        return;
      }

      const response = await fetch('/api/friends', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setFriends(data.friends || []);
      }
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const loadPendingRequests = async () => {
    try {
      if (!sessionToken) {
        console.warn('No session token available');
        return;
      }

      const response = await fetch('/api/friends/requests', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPendingRequests(data.requests || { sent: [], received: [] });
      }
    } catch (error) {
      console.error('Error loading friend requests:', error);
    }
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users || []);
      }
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (userId: string) => {
    try {
      const response = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        await loadPendingRequests();
        // Update search results to reflect sent request
        setSearchResults(prev => prev.map(user =>
          user.id === userId ? { ...user, requestSent: true } : user
        ));
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
    }
  };

  const acceptFriendRequest = async (userId: string) => {
    try {
      const response = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        await loadFriends();
        await loadPendingRequests();
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
    }
  };

  const declineFriendRequest = async (userId: string) => {
    try {
      const response = await fetch('/api/friends/decline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        await loadPendingRequests();
      }
    } catch (error) {
      console.error('Error declining friend request:', error);
    }
  };

  const removeFriend = async (userId: string) => {
    if (!confirm(t('friends.confirmRemove'))) return;

    try {
      const response = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        await loadFriends();
      }
    } catch (error) {
      console.error('Error removing friend:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchUsers(searchQuery);
  };

  const getTrustScoreColor = (score: number): string => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#8BC34A';
    if (score >= 40) return '#FFC107';
    if (score >= 20) return '#FF9800';
    return '#F44336';
  };

  const UserCard: React.FC<{
    user: any;
    actions: React.ReactNode;
  }> = ({ user, actions }) => (
    <div className="user-card">
      <div className="user-info">
        <div className={`user-avatar ${user.isOnline ? 'online' : ''}`}>
          {user.avatar}
        </div>
        <div className="user-details">
          <h4>{user.displayName}</h4>
          <p>@{user.username}</p>
          {user.stats && (
            <div className="user-stats">
              <span
                className="trust-score"
                style={{ color: getTrustScoreColor(user.stats.trustScore || user.trustScore) }}
              >
                {t('friends.trustScore')}: {user.stats.trustScore || user.trustScore || 50}
              </span>
              <span className="games-count">
                {user.stats.totalGames || user.totalGames || 0} {t('friends.games')}
              </span>
            </div>
          )}
          {user.isOnline !== undefined && (
            <div className="activity-indicator">
              <div className={`activity-dot ${user.isOnline ? '' : 'offline'}`}></div>
              <span>{user.isOnline ? t('friends.online') : t('friends.offline')}</span>
              {!user.isOnline && user.lastSeen && (
                <span>• {t('friends.lastSeen')} {formatLastSeen(user.lastSeen)}</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="user-actions">
        {actions}
      </div>
    </div>
  );

  const formatLastSeen = (lastSeen: string | Date): string => {
    const date = typeof lastSeen === 'string' ? new Date(lastSeen) : lastSeen;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className="friends-overlay">
      <div className={`friends-container ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
        <div className="friends-header">
          <h2>{t('friends.title')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="friends-tabs">
          <button
            className={`tab-button ${activeTab === 'friends' ? 'active' : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            {t('friends.tabs.friends')} ({friends.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            {t('friends.tabs.requests')} ({pendingRequests.received.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            {t('friends.tabs.search')}
          </button>
        </div>

        <div className="friends-content">
          {activeTab === 'friends' && (
            <div className="friends-list">
              {friends.length === 0 ? (
                <div className="empty-state">
                  <p>{t('friends.noFriends')}</p>
                  <button
                    className="primary-button"
                    onClick={() => setActiveTab('search')}
                  >
                    {t('friends.findFriends')}
                  </button>
                </div>
              ) : (
                friends.map(friend => (
                  <UserCard
                    key={friend.id}
                    user={friend}
                    actions={
                      <>
                        <button
                          className="secondary-button"
                          onClick={() => {/* TODO: Invite to game */ }}
                        >
                          {t('friends.invite')}
                        </button>
                        <button
                          className="danger-button"
                          onClick={() => removeFriend(friend.id)}
                        >
                          {t('friends.remove')}
                        </button>
                      </>
                    }
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="requests-section">
              {pendingRequests.received.length > 0 && (
                <div className="requests-group">
                  <h3>{t('friends.receivedRequests')}</h3>
                  {pendingRequests.received.map(request => (
                    <UserCard
                      key={request.id}
                      user={request}
                      actions={
                        <>
                          <button
                            className="primary-button"
                            onClick={() => acceptFriendRequest(request.id)}
                          >
                            {t('friends.accept')}
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() => declineFriendRequest(request.id)}
                          >
                            {t('friends.decline')}
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
              )}

              {pendingRequests.sent.length > 0 && (
                <div className="requests-group">
                  <h3>{t('friends.sentRequests')}</h3>
                  {pendingRequests.sent.map(request => (
                    <UserCard
                      key={request.id}
                      user={request}
                      actions={
                        <span className="pending-label">{t('friends.pending')}</span>
                      }
                    />
                  ))}
                </div>
              )}

              {pendingRequests.received.length === 0 && pendingRequests.sent.length === 0 && (
                <div className="empty-state">
                  <p>{t('friends.noRequests')}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'search' && (
            <div className="search-section">
              <form onSubmit={handleSearch} className="search-form">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('friends.searchPlaceholder')}
                  className="search-input"
                />
                <button type="submit" className="search-button" disabled={loading}>
                  {loading ? '...' : t('friends.search')}
                </button>
              </form>

              <div className="search-results">
                {searchResults.map(user => (
                  <UserCard
                    key={user.id}
                    user={user}
                    actions={
                      <>
                        {user.isFriend ? (
                          <span className="friend-label">{t('friends.alreadyFriend')}</span>
                        ) : user.requestSent ? (
                          <span className="pending-label">{t('friends.requestSent')}</span>
                        ) : user.requestReceived ? (
                          <>
                            <button
                              className="primary-button"
                              onClick={() => acceptFriendRequest(user.id)}
                            >
                              {t('friends.accept')}
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() => declineFriendRequest(user.id)}
                            >
                              {t('friends.decline')}
                            </button>
                          </>
                        ) : (
                          <button
                            className="primary-button"
                            onClick={() => sendFriendRequest(user.id)}
                          >
                            {t('friends.addFriend')}
                          </button>
                        )}
                      </>
                    }
                  />
                ))}
              </div>

              {searchQuery && searchResults.length === 0 && !loading && (
                <div className="empty-state">
                  <p>{t('friends.noResults')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendsManager;