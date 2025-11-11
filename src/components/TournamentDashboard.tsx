import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { getSyncService } from '../services/SyncService';
import {
  Tournament,
  TournamentPlayer,
  ActiveMatch,
  TournamentMatch,
  PlayerStatus,
  MatchStatus,
  TournamentFormat,
  ChatMessage
} from '../types/party';
import TournamentBracket from './TournamentBracket';
import './TournamentDashboard.css';

interface TournamentDashboardProps {
  tournament: Tournament;
  currentPlayer: TournamentPlayer;
  activeMatches: ActiveMatch[];
  upcomingMatches: TournamentMatch[];
  recentMatches: TournamentMatch[];
  notifications: TournamentNotification[];
  onMatchSelect?: (match: TournamentMatch | ActiveMatch) => void;
  onPlayerSelect?: (player: TournamentPlayer) => void;
  onSendMessage?: (message: string) => void;
  messages?: ChatMessage[];
  isSpectating?: boolean;
  isConnected?: boolean;
  isReconnecting?: boolean;
  lastSyncTime?: Date;
}

interface TournamentNotification {
  id: string;
  type: 'match_ready' | 'match_completed' | 'round_completed' | 'tournament_update' | 'player_eliminated';
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
}

interface MatchScheduleItem {
  match: TournamentMatch | ActiveMatch;
  estimatedStartTime?: Date;
  isNext: boolean;
}

export const TournamentDashboard: React.FC<TournamentDashboardProps> = ({
  tournament,
  currentPlayer,
  activeMatches,
  upcomingMatches,
  recentMatches,
  notifications,
  onMatchSelect,
  onPlayerSelect,
  onSendMessage,
  messages = [],
  isSpectating = false,
  isConnected = true,
  isReconnecting = false,
  lastSyncTime
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'overview' | 'bracket' | 'schedule' | 'chat'>('overview');
  const [showNotifications, setShowNotifications] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<TournamentMatch | ActiveMatch | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  // Calculate tournament progress
  const totalRounds = tournament.totalRounds;
  const currentRound = tournament.currentRound;
  const progressPercentage = (currentRound / totalRounds) * 100;

  // Get current player's next match
  const nextMatch = upcomingMatches.find(match => 
    match.player1Id === currentPlayer.id || match.player2Id === currentPlayer.id
  );

  // Get current player's active match
  const currentMatch = activeMatches.find(match => 
    match.player1.id === currentPlayer.id || match.player2.id === currentPlayer.id
  );

  // Calculate estimated wait time
  const getEstimatedWaitTime = (): string => {
    if (currentMatch) return 'In Match';
    if (nextMatch) return 'Up Next';
    
    const activeMatchCount = activeMatches.length;
    const averageMatchDuration = 10; // minutes
    const estimatedMinutes = activeMatchCount * averageMatchDuration;
    
    if (estimatedMinutes < 60) {
      return `~${estimatedMinutes} min`;
    } else {
      const hours = Math.floor(estimatedMinutes / 60);
      const minutes = estimatedMinutes % 60;
      return `~${hours}h ${minutes}m`;
    }
  };

  // Set up tournament state synchronization
  useEffect(() => {
    const syncService = getSyncService();
    
    // Subscribe to tournament updates
    const subscriptionId1 = syncService.subscribeToUpdates(
      (update) => {
        if (update.type === 'tournament_update' && update.data?.id === tournament.id) {
          console.log('🏆 Received tournament sync update:', update);
          setSyncStatus('synced');
          setLastUpdateTime(update.timestamp);
        }
      },
      (update) => update.type === 'tournament_update' && update.data?.id === tournament.id
    );

    // Subscribe to connection state changes
    const subscriptionId2 = syncService.subscribeToUpdates(
      (update) => {
        if (update.type === 'session_update') {
          if (update.data.connected === false) {
            setSyncStatus('error');
          } else if (update.data.connected === true) {
            setSyncStatus('synced');
          }
        }
      },
      (update) => update.type === 'session_update'
    );

    return () => {
      syncService.unsubscribe(subscriptionId1);
      syncService.unsubscribe(subscriptionId2);
    };
  }, [tournament.id]);

  // Update sync status based on connection state
  useEffect(() => {
    if (isReconnecting) {
      setSyncStatus('syncing');
    } else if (isConnected) {
      setSyncStatus('synced');
    } else {
      setSyncStatus('error');
    }
  }, [isConnected, isReconnecting]);

  // Get player status color
  const getPlayerStatusColor = (status: PlayerStatus): string => {
    switch (status) {
      case PlayerStatus.READY: return '#4CAF50';
      case PlayerStatus.IN_MATCH: return '#2196F3';
      case PlayerStatus.WAITING: return '#FF9800';
      case PlayerStatus.ELIMINATED: return '#F44336';
      case PlayerStatus.SPECTATING: return '#9C27B0';
      case PlayerStatus.DISCONNECTED: return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  // Get notification icon
  const getNotificationIcon = (type: TournamentNotification['type']): string => {
    switch (type) {
      case 'match_ready': return '🎮';
      case 'match_completed': return '✅';
      case 'round_completed': return '🏁';
      case 'tournament_update': return '📢';
      case 'player_eliminated': return '❌';
      default: return '📋';
    }
  };

  // Handle chat message send
  const handleSendMessage = () => {
    if (chatMessage.trim() && onSendMessage) {
      onSendMessage(chatMessage.trim());
      setChatMessage('');
    }
  };

  // Handle match selection
  const handleMatchSelect = (match: TournamentMatch | ActiveMatch) => {
    setSelectedMatch(match);
    onMatchSelect?.(match);
  };

  // Render overview tab
  const renderOverview = () => (
    <div className="dashboard-overview">
      <div className="overview-grid">
        {/* Tournament Progress */}
        <div className="overview-card tournament-progress">
          <div className="card-header">
            <h3>🏆 Tournament Progress</h3>
            <span className="progress-text">Round {currentRound} of {totalRounds}</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="progress-details">
            <span>Format: {tournament.format}</span>
            <span>Players: {tournament.players.length}</span>
          </div>
        </div>

        {/* Player Status */}
        <div className="overview-card player-status">
          <div className="card-header">
            <h3>👤 Your Status</h3>
            <span 
              className="status-indicator"
              style={{ color: getPlayerStatusColor(currentPlayer.status) }}
            >
              {currentPlayer.status}
            </span>
          </div>
          <div className="status-details">
            <div className="status-item">
              <label>Rank:</label>
              <span>#{currentPlayer.currentRank}</span>
            </div>
            <div className="status-item">
              <label>Record:</label>
              <span>{currentPlayer.statistics.matchesWon}-{currentPlayer.statistics.matchesLost}</span>
            </div>
            <div className="status-item">
              <label>Points:</label>
              <span>{currentPlayer.statistics.totalPoints}</span>
            </div>
            <div className="status-item">
              <label>Next Match:</label>
              <span>{getEstimatedWaitTime()}</span>
            </div>
          </div>
        </div>

        {/* Active Matches */}
        <div className="overview-card active-matches">
          <div className="card-header">
            <h3>🎮 Active Matches</h3>
            <span className="match-count">{activeMatches.length} ongoing</span>
          </div>
          <div className="matches-list">
            {activeMatches.length === 0 ? (
              <div className="no-matches">No matches in progress</div>
            ) : (
              activeMatches.slice(0, 3).map(match => (
                <div 
                  key={match.id}
                  className={`match-item ${match.player1.id === currentPlayer.id || match.player2.id === currentPlayer.id ? 'current-player' : ''}`}
                  onClick={() => handleMatchSelect(match)}
                >
                  <div className="match-players">
                    <span>{match.player1.name}</span>
                    <span className="vs">vs</span>
                    <span>{match.player2.name}</span>
                  </div>
                  <div className="match-info">
                    <span className="match-round">R{match.roundNumber}</span>
                    <span className="match-status">{match.status}</span>
                  </div>
                </div>
              ))
            )}
            {activeMatches.length > 3 && (
              <div className="more-matches">
                +{activeMatches.length - 3} more matches
              </div>
            )}
          </div>
        </div>

        {/* Recent Results */}
        <div className="overview-card recent-results">
          <div className="card-header">
            <h3>📊 Recent Results</h3>
          </div>
          <div className="results-list">
            {recentMatches.length === 0 ? (
              <div className="no-results">No completed matches yet</div>
            ) : (
              recentMatches.slice(0, 3).map(match => {
                const player1 = tournament.players.find(p => p.id === match.player1Id);
                const player2 = tournament.players.find(p => p.id === match.player2Id);
                
                return (
                  <div 
                    key={match.id}
                    className="result-item"
                    onClick={() => handleMatchSelect(match)}
                  >
                    <div className="result-players">
                      <span className={match.result?.winnerId === match.player1Id ? 'winner' : 'loser'}>
                        {player1?.name || 'TBD'}
                      </span>
                      <span className="result-score">
                        {match.result?.player1Score}-{match.result?.player2Score}
                      </span>
                      <span className={match.result?.winnerId === match.player2Id ? 'winner' : 'loser'}>
                        {player2?.name || 'TBD'}
                      </span>
                    </div>
                    <div className="result-time">
                      {match.endTime && new Date(match.endTime).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tournament Leaderboard */}
        <div className="overview-card leaderboard">
          <div className="card-header">
            <h3>🏅 Top Players</h3>
          </div>
          <div className="leaderboard-list">
            {tournament.players
              .filter(p => !p.isEliminated)
              .sort((a, b) => b.statistics.totalPoints - a.statistics.totalPoints)
              .slice(0, 5)
              .map((player, index) => (
                <div 
                  key={player.id}
                  className={`leaderboard-item ${player.id === currentPlayer.id ? 'current-player' : ''}`}
                  onClick={() => onPlayerSelect?.(player)}
                >
                  <span className="rank">#{index + 1}</span>
                  <span className="player-name">
                    {player.name}
                    {player.isHost && <span className="host-badge">👑</span>}
                  </span>
                  <span className="player-points">{player.statistics.totalPoints}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="overview-card quick-actions">
          <div className="card-header">
            <h3>⚡ Quick Actions</h3>
          </div>
          <div className="actions-grid">
            <button 
              className="action-btn"
              onClick={() => setActiveTab('bracket')}
            >
              🏆 View Bracket
            </button>
            <button 
              className="action-btn"
              onClick={() => setActiveTab('schedule')}
            >
              📅 Match Schedule
            </button>
            <button 
              className="action-btn"
              onClick={() => setActiveTab('chat')}
            >
              💬 Tournament Chat
            </button>
            <button 
              className="action-btn"
              onClick={() => setShowNotifications(true)}
            >
              🔔 Notifications ({notifications.filter(n => !n.isRead).length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Render schedule tab
  const renderSchedule = () => {
    const allMatches: MatchScheduleItem[] = [
      ...activeMatches.map(match => ({ match, isNext: false })),
      ...upcomingMatches.map((match, index) => ({ 
        match, 
        isNext: index === 0 && !currentMatch,
        estimatedStartTime: new Date(Date.now() + (index + 1) * 10 * 60 * 1000) // Estimate 10 min per match
      }))
    ];

    return (
      <div className="dashboard-schedule">
        <div className="schedule-header">
          <h3>📅 Match Schedule</h3>
          <div className="schedule-filters">
            <button className="filter-btn active">All</button>
            <button className="filter-btn">Your Matches</button>
            <button className="filter-btn">Active</button>
          </div>
        </div>
        
        <div className="schedule-list">
          {allMatches.map((item, index) => {
            const match = item.match;
            const isCurrentPlayer = 'player1' in match ? 
              (match.player1.id === currentPlayer.id || match.player2.id === currentPlayer.id) :
              (match.player1Id === currentPlayer.id || match.player2Id === currentPlayer.id);
            
            return (
              <div 
                key={match.id}
                className={`schedule-item ${isCurrentPlayer ? 'current-player' : ''} ${item.isNext ? 'next-match' : ''}`}
                onClick={() => handleMatchSelect(match)}
              >
                <div className="schedule-time">
                  {'startTime' in match && match.startTime ? (
                    <div className="actual-time">
                      <span className="time">{new Date(match.startTime).toLocaleTimeString()}</span>
                      <span className="status">Started</span>
                    </div>
                  ) : item.estimatedStartTime ? (
                    <div className="estimated-time">
                      <span className="time">{item.estimatedStartTime.toLocaleTimeString()}</span>
                      <span className="status">Estimated</span>
                    </div>
                  ) : (
                    <div className="pending-time">
                      <span className="time">TBD</span>
                      <span className="status">Pending</span>
                    </div>
                  )}
                </div>
                
                <div className="schedule-match">
                  <div className="match-round">Round {match.roundNumber}</div>
                  <div className="match-players">
                    <span className="player">
                      {'player1' in match ? match.player1.name : 
                        tournament.players.find(p => p.id === match.player1Id)?.name || 'TBD'}
                    </span>
                    <span className="vs">vs</span>
                    <span className="player">
                      {'player2' in match ? match.player2.name : 
                        tournament.players.find(p => p.id === match.player2Id)?.name || 'TBD'}
                    </span>
                  </div>
                  <div className="match-status-badge" style={{ 
                    backgroundColor: match.status === 'in_progress' ? '#2196F3' : 
                                   match.status === 'completed' ? '#4CAF50' : '#FF9800' 
                  }}>
                    {match.status}
                  </div>
                </div>
                
                {item.isNext && (
                  <div className="next-indicator">
                    <span>🔥 Your Next Match</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render chat tab
  const renderChat = () => (
    <div className="dashboard-chat">
      <div className="chat-header">
        <h3>💬 Tournament Chat</h3>
        <span className="online-count">{tournament.players.filter(p => !p.isEliminated).length} online</span>
      </div>
      
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="no-messages">
            <span>No messages yet. Start the conversation!</span>
          </div>
        ) : (
          messages.map(message => (
            <div 
              key={message.id}
              className={`chat-message ${message.senderId === currentPlayer.id ? 'own-message' : ''}`}
            >
              <div className="message-header">
                <span className="sender-name">{message.senderName}</span>
                <span className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">{message.message}</div>
            </div>
          ))
        )}
      </div>
      
      {!isSpectating && (
        <div className="chat-input">
          <input
            type="text"
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..."
            maxLength={200}
          />
          <button 
            onClick={handleSendMessage}
            disabled={!chatMessage.trim()}
            className="send-btn"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="tournament-dashboard">
      <div className="dashboard-header">
        <div className="tournament-info">
          <h1>{tournament.format} Tournament</h1>
          <div className="tournament-meta">
            <span className="tournament-status">{tournament.status}</span>
            <span className="tournament-players">{tournament.players.length} players</span>
            <span className="tournament-round">Round {currentRound}/{totalRounds}</span>
          </div>
        </div>
        
        <div className="dashboard-actions">
          <button 
            className="notification-btn"
            onClick={() => setShowNotifications(true)}
          >
            🔔
            {notifications.filter(n => !n.isRead).length > 0 && (
              <span className="notification-badge">
                {notifications.filter(n => !n.isRead).length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="dashboard-tabs">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button 
          className={`tab-btn ${activeTab === 'bracket' ? 'active' : ''}`}
          onClick={() => setActiveTab('bracket')}
        >
          🏆 Bracket
        </button>
        <button 
          className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          📅 Schedule
        </button>
        <button 
          className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 Chat
          {messages.length > 0 && (
            <span className="chat-badge">{messages.length}</span>
          )}
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'bracket' && (
          <TournamentBracket
            tournament={tournament}
            currentPlayerId={currentPlayer.id}
            onMatchSelect={onMatchSelect}
            onPlayerSelect={onPlayerSelect}
            showMatchDetails={true}
            interactive={true}
          />
        )}
        {activeTab === 'schedule' && renderSchedule()}
        {activeTab === 'chat' && renderChat()}
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className="notifications-overlay">
          <div className="notifications-panel">
            <div className="notifications-header">
              <h3>🔔 Notifications</h3>
              <button 
                className="close-notifications"
                onClick={() => setShowNotifications(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="notifications-list">
              {notifications.length === 0 ? (
                <div className="no-notifications">No notifications yet</div>
              ) : (
                notifications.map(notification => (
                  <div 
                    key={notification.id}
                    className={`notification-item ${notification.isRead ? 'read' : 'unread'} priority-${notification.priority}`}
                  >
                    <div className="notification-icon">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="notification-content">
                      <div className="notification-title">{notification.title}</div>
                      <div className="notification-message">{notification.message}</div>
                      <div className="notification-time">
                        {new Date(notification.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentDashboard;