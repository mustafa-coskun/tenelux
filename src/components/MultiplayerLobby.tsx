import React, { useState, useEffect } from 'react';
import { Player } from '../types';
import { WebSocketClient } from '../services/WebSocketClient';
import { NetworkMessage, NetworkMessageType } from '../types/network';
import { getEnhancedMatchmakingService } from '../services/EnhancedMatchmakingService';
import { getEnhancedTrustScoreService } from '../services/EnhancedTrustScoreService';
import { MatchPreferences, MatchResult, BehaviorStats } from '../database/core/types';
import { useViewportSize } from '../hooks';
import './MultiplayerLobby.css';

interface MultiplayerLobbyProps {
  player: Player;
  onJoinQueue: () => void;
  onBackToMenu: () => void;
  webSocketClient: WebSocketClient | null;
}

interface LobbyStats {
  totalPlayers: number;
  playersInQueue: number;
  playersInGame: number;
  activeMatches: number;
}

interface MatchmakingState {
  isSearching: boolean;
  searchStartTime?: Date;
  estimatedWaitTime?: number;
  matchQuality?: number;
  currentOpponent?: Player;
  searchPreferences: MatchPreferences;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  player,
  onJoinQueue,
  onBackToMenu,
  webSocketClient,
}) => {
  const [lobbyStats, setLobbyStats] = useState<LobbyStats>({
    totalPlayers: 0,
    playersInQueue: 0,
    playersInGame: 0,
    activeMatches: 0,
  });
  const [playerStatus, setPlayerStatus] = useState<string>('idle');
  const [serverMessage, setServerMessage] = useState<string>('');
  const [behaviorStats, setBehaviorStats] = useState<BehaviorStats | null>(null);
  const [matchmakingState, setMatchmakingState] = useState<MatchmakingState>({
    isSearching: false,
    searchPreferences: {
      gameMode: 'multi',
      maxWaitTime: 120, // 2 minutes
      trustScoreTolerance: 15,
      skillLevelTolerance: 200
    }
  });
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    loadPlayerBehaviorStats();
  }, [player.id]);

  useEffect(() => {
    if (!webSocketClient) return;

    const handleMessage = (message: NetworkMessage) => {
      if (message.type === NetworkMessageType.GAME_STATE_UPDATE) {
        const {
          lobbyStats: stats,
          playerStatus: status,
          serverMessage: msg,
          matchResult,
          estimatedWaitTime
        } = message.payload;

        if (stats) {
          setLobbyStats(stats);
        }

        if (status) {
          setPlayerStatus(status);
          
          // Update matchmaking state based on status
          if (status === 'searching') {
            setMatchmakingState(prev => ({
              ...prev,
              isSearching: true,
              searchStartTime: new Date()
            }));
          } else if (status === 'idle') {
            setMatchmakingState(prev => ({
              ...prev,
              isSearching: false,
              searchStartTime: undefined,
              currentOpponent: undefined
            }));
          }
        }

        if (msg) {
          setServerMessage(msg);
        }

        if (matchResult) {
          setMatchmakingState(prev => ({
            ...prev,
            currentOpponent: matchResult.opponent,
            matchQuality: matchResult.matchScore
          }));
        }

        if (estimatedWaitTime) {
          setMatchmakingState(prev => ({
            ...prev,
            estimatedWaitTime
          }));
        }
      }
    };

    // Add message listener
    const originalOnMessage = webSocketClient.onMessage;
    webSocketClient.onMessage = (message: NetworkMessage) => {
      handleMessage(message);
      if (originalOnMessage) {
        originalOnMessage(message);
      }
    };

    // Request initial lobby state
    webSocketClient.send({
      type: NetworkMessageType.GAME_STATE_UPDATE,
      payload: { requestLobbyStats: true },
      timestamp: new Date(),
    });

    return () => {
      // Restore original handler
      webSocketClient.onMessage = originalOnMessage;
    };
  }, [webSocketClient]);

  const loadPlayerBehaviorStats = async () => {
    try {
      const trustScoreService = getEnhancedTrustScoreService();
      const stats = await trustScoreService.getPlayerBehaviorStats(player.id);
      setBehaviorStats(stats);
    } catch (error) {
      console.error('Failed to load behavior stats:', error);
    }
  };

  const handleViewProfile = () => {
    // TODO: Implement profile viewing
    console.log('View profile clicked');
  };

  const handleViewStats = () => {
    // TODO: Implement stats viewing
    console.log('View stats clicked');
  };

  const handleJoinQueue = () => {
    if (webSocketClient) {
      // Send enhanced matchmaking request with preferences
      webSocketClient.send({
        type: NetworkMessageType.MATCHMAKING_REQUEST,
        payload: {
          preferences: matchmakingState.searchPreferences,
          playerTrustScore: behaviorStats?.trustScore || 50
        },
        timestamp: new Date(),
      });
    }
    onJoinQueue();
  };

  const handleCancelSearch = () => {
    if (webSocketClient) {
      webSocketClient.send({
        type: NetworkMessageType.MATCHMAKING_CANCEL,
        payload: {},
        timestamp: new Date(),
      });
    }
    
    setMatchmakingState(prev => ({
      ...prev,
      isSearching: false,
      searchStartTime: undefined,
      currentOpponent: undefined
    }));
  };

  const updatePreferences = (newPreferences: Partial<MatchPreferences>) => {
    setMatchmakingState(prev => ({
      ...prev,
      searchPreferences: {
        ...prev.searchPreferences,
        ...newPreferences
      }
    }));
  };

  const getTrustScoreColor = (score: number): string => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#8BC34A';
    if (score >= 40) return '#FFC107';
    if (score >= 20) return '#FF9800';
    return '#F44336';
  };

  const getMatchQualityLabel = (quality?: number): string => {
    if (!quality) return 'Unknown';
    if (quality >= 90) return 'Excellent';
    if (quality >= 75) return 'Good';
    if (quality >= 60) return 'Fair';
    return 'Poor';
  };

  const getSearchDuration = (): string => {
    if (!matchmakingState.searchStartTime) return '0s';
    
    const now = new Date();
    const duration = Math.floor((now.getTime() - matchmakingState.searchStartTime.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  };

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className={`multiplayer-lobby ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      <div className="lobby-header">
        <h1>Tenebris Multiplayer Lobby</h1>
        <div className="player-info">
          <span className="player-name">{player.name}</span>
          <span className="player-status">{playerStatus}</span>
          {behaviorStats && (
            <div className="trust-score-display">
              <span className="trust-score-label">Trust Score:</span>
              <span 
                className="trust-score-value" 
                style={{ color: getTrustScoreColor(behaviorStats.trustScore) }}
              >
                {Math.round(behaviorStats.trustScore)}
              </span>
              <span className="behavior-trend">
                ({behaviorStats.behaviorTrend})
              </span>
            </div>
          )}
        </div>
      </div>

      {serverMessage && (
        <div className="server-message">
          <p>{serverMessage}</p>
        </div>
      )}

      <div className="lobby-content">
        <div className="lobby-stats">
          <h2>Server Statistics</h2>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-value">{lobbyStats.totalPlayers}</span>
              <span className="stat-label">Players Online</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{lobbyStats.playersInQueue}</span>
              <span className="stat-label">In Queue</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{lobbyStats.playersInGame}</span>
              <span className="stat-label">In Game</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{lobbyStats.activeMatches}</span>
              <span className="stat-label">Active Matches</span>
            </div>
          </div>
        </div>

        {/* Matchmaking Section */}
        <div className="matchmaking-section">
          <h2>Matchmaking</h2>
          
          {!matchmakingState.isSearching ? (
            <div className="matchmaking-setup">
              <div className="matchmaking-preferences">
                <button 
                  className="preferences-toggle"
                  onClick={() => setShowPreferences(!showPreferences)}
                >
                  ⚙️ Preferences {showPreferences ? '▼' : '▶'}
                </button>
                
                {showPreferences && (
                  <div className="preferences-panel">
                    <div className="preference-item">
                      <label>Trust Score Tolerance:</label>
                      <input
                        type="range"
                        min="5"
                        max="30"
                        value={matchmakingState.searchPreferences.trustScoreTolerance}
                        onChange={(e) => updatePreferences({ trustScoreTolerance: parseInt(e.target.value) })}
                      />
                      <span>±{matchmakingState.searchPreferences.trustScoreTolerance}</span>
                    </div>
                    
                    <div className="preference-item">
                      <label>Max Wait Time:</label>
                      <select
                        value={matchmakingState.searchPreferences.maxWaitTime}
                        onChange={(e) => updatePreferences({ maxWaitTime: parseInt(e.target.value) })}
                      >
                        <option value={60}>1 minute</option>
                        <option value={120}>2 minutes</option>
                        <option value={300}>5 minutes</option>
                        <option value={600}>10 minutes</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="matchmaking-info">
                {behaviorStats && (
                  <div className="match-prediction">
                    <h4>Expected Match Quality</h4>
                    <div className="prediction-details">
                      <div className="prediction-item">
                        <span>Your Trust Score:</span>
                        <span style={{ color: getTrustScoreColor(behaviorStats.trustScore) }}>
                          {Math.round(behaviorStats.trustScore)}
                        </span>
                      </div>
                      <div className="prediction-item">
                        <span>Search Range:</span>
                        <span>
                          {Math.max(0, Math.round(behaviorStats.trustScore - matchmakingState.searchPreferences.trustScoreTolerance))} - {Math.min(100, Math.round(behaviorStats.trustScore + matchmakingState.searchPreferences.trustScoreTolerance))}
                        </span>
                      </div>
                      <div className="prediction-item">
                        <span>Estimated Wait:</span>
                        <span>{matchmakingState.estimatedWaitTime || 30}s</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                className="primary-button find-match-button"
                onClick={handleJoinQueue}
                disabled={playerStatus !== 'idle'}
              >
                🎯 Find Match
              </button>
            </div>
          ) : (
            <div className="matchmaking-active">
              <div className="search-status">
                <div className="search-spinner"></div>
                <h3>Searching for Match...</h3>
                <p>Duration: {getSearchDuration()}</p>
                {matchmakingState.estimatedWaitTime && (
                  <p>Estimated: {matchmakingState.estimatedWaitTime}s remaining</p>
                )}
              </div>

              {matchmakingState.currentOpponent && (
                <div className="match-found">
                  <h4>Match Found!</h4>
                  <div className="opponent-info">
                    <span className="opponent-name">{matchmakingState.currentOpponent.name}</span>
                    <span className="opponent-trust">
                      Trust: {Math.round(matchmakingState.currentOpponent.trustScore)}
                    </span>
                    <span className="match-quality">
                      Quality: {getMatchQualityLabel(matchmakingState.matchQuality)}
                    </span>
                  </div>
                </div>
              )}

              <button
                className="cancel-button"
                onClick={handleCancelSearch}
              >
                Cancel Search
              </button>
            </div>
          )}
        </div>

        <div className="lobby-actions">
          <h2>Actions</h2>
          <div className="action-buttons">
            <button className="secondary-button" onClick={handleViewProfile}>
              View Profile
            </button>

            <button className="secondary-button" onClick={handleViewStats}>
              View Statistics
            </button>

            <button className="back-button" onClick={onBackToMenu}>
              Back to Menu
            </button>
          </div>
        </div>

        <div className="lobby-info">
          <h2>How to Play</h2>
          <div className="info-content">
            <p>
              Welcome to Tenebris multiplayer! You'll be matched with another
              player for a psychological battle of trust and betrayal.
            </p>
            <ul>
              <li>Each game consists of multiple rounds</li>
              <li>Choose to "Confess" or "Stay Silent" each round</li>
              <li>Your decisions affect both your score and trust rating</li>
              <li>Communication phases allow limited messaging</li>
              <li>Build your reputation as a trustworthy player</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="lobby-footer">
        <p>Connected to Tenebris Server</p>
        <div className="connection-indicator active"></div>
      </div>
    </div>
  );
};
