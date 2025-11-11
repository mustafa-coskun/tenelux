// Post-Game Statistics Screen - Mandatory display regardless of modification status

import React, { useState, useEffect } from 'react';
import { PostGameStats, ModificationRequest, BehaviorStats } from '../database/core/types';
import { getPostGameModificationService } from '../services/PostGameModificationService';
import { getEnhancedTrustScoreService } from '../services/EnhancedTrustScoreService';
import { getGameModeStatsService } from '../services/GameModeStatsService';
import './PostGameStatsScreen.css';

interface PostGameStatsScreenProps {
  gameId: string;
  currentPlayerId: string;
  onClose: () => void;
  onModificationSubmitted?: () => void;
  gameMode?: 'single' | 'multi' | 'party';
}

export const PostGameStatsScreen: React.FC<PostGameStatsScreenProps> = ({
  gameId,
  currentPlayerId,
  onClose,
  onModificationSubmitted,
  gameMode = 'multi'
}) => {
  const [postGameStats, setPostGameStats] = useState<PostGameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModificationForm, setShowModificationForm] = useState(false);
  const [modificationRequest, setModificationRequest] = useState<ModificationRequest>({
    type: 'no_change',
    details: ''
  });
  const [hasSubmittedRequest, setHasSubmittedRequest] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [behaviorStats, setBehaviorStats] = useState<BehaviorStats | null>(null);
  const [trustScoreChange, setTrustScoreChange] = useState<number | null>(null);
  const [showDetailedStats, setShowDetailedStats] = useState(false);

  useEffect(() => {
    loadPostGameStats();
    checkExistingRequest();
    loadEnhancedStats();
  }, [gameId, currentPlayerId]);

  const loadPostGameStats = async () => {
    try {
      setLoading(true);
      const modificationService = getPostGameModificationService();
      const stats = await modificationService.showPostGameStats(gameId);
      setPostGameStats(stats);
    } catch (err) {
      console.error('Failed to load post-game statistics:', err);
      setError('Failed to load game statistics');
    } finally {
      setLoading(false);
    }
  };

  const checkExistingRequest = async () => {
    try {
      const modificationService = getPostGameModificationService();
      const hasRequest = await modificationService.hasModificationRequest(gameId, currentPlayerId);
      setHasSubmittedRequest(hasRequest);
    } catch (err) {
      console.error('Failed to check existing request:', err);
    }
  };

  const loadEnhancedStats = async () => {
    try {
      // Only load trust score data for multiplayer and party games
      if (gameMode === 'single') return;

      const trustScoreService = getEnhancedTrustScoreService();
      const [behaviorData] = await Promise.all([
        trustScoreService.getPlayerBehaviorStats(currentPlayerId)
      ]);

      setBehaviorStats(behaviorData);

      // Calculate trust score change (this would typically come from the game result)
      // For now, we'll simulate a small change based on game outcome
      const currentPlayerStats = getCurrentPlayerStats();
      if (currentPlayerStats) {
        const change = currentPlayerStats.isWinner ? 2 : -1;
        setTrustScoreChange(change);
      }
    } catch (err) {
      console.error('Failed to load enhanced stats:', err);
    }
  };

  const handleSubmitModification = async () => {
    if (!modificationRequest.details.trim()) {
      setError('Please provide details for your modification request');
      return;
    }

    try {
      setSubmittingRequest(true);
      setError(null);
      
      const modificationService = getPostGameModificationService();
      await modificationService.submitModificationRequest(gameId, currentPlayerId, modificationRequest);
      
      setHasSubmittedRequest(true);
      setShowModificationForm(false);
      
      // Reload stats to show updated modification status
      await loadPostGameStats();
      
      if (onModificationSubmitted) {
        onModificationSubmitted();
      }
    } catch (err) {
      console.error('Failed to submit modification request:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit modification request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const getModificationStatusText = (status: string) => {
    switch (status) {
      case 'none':
        return 'No modifications requested';
      case 'pending':
        return 'Modification request pending';
      case 'applied':
        return 'Modification applied';
      case 'rejected':
        return 'Modification requests did not match';
      default:
        return 'Unknown status';
    }
  };

  const getModificationStatusClass = (status: string) => {
    switch (status) {
      case 'applied':
        return 'modification-status applied';
      case 'rejected':
        return 'modification-status rejected';
      case 'pending':
        return 'modification-status pending';
      default:
        return 'modification-status none';
    }
  };

  const getCurrentPlayerStats = () => {
    if (!postGameStats) return null;
    
    return postGameStats.player1Stats.playerId === currentPlayerId 
      ? postGameStats.player1Stats 
      : postGameStats.player2Stats;
  };

  const getOpponentStats = () => {
    if (!postGameStats) return null;
    
    return postGameStats.player1Stats.playerId === currentPlayerId 
      ? postGameStats.player2Stats 
      : postGameStats.player1Stats;
  };

  const getTrustScoreColor = (score: number): string => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#8BC34A';
    if (score >= 40) return '#FFC107';
    if (score >= 20) return '#FF9800';
    return '#F44336';
  };

  const getTrustScoreChangeColor = (change: number): string => {
    if (change > 0) return '#4CAF50';
    if (change < 0) return '#F44336';
    return '#FFC107';
  };

  const getGameModeLabel = (mode: string): string => {
    switch (mode) {
      case 'single': return 'Single Player';
      case 'multi': return 'Multiplayer';
      case 'party': return 'Party Mode';
      default: return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="post-game-stats-screen">
        <div className="stats-container">
          <div className="loading-spinner">Loading game statistics...</div>
        </div>
      </div>
    );
  }

  if (error && !postGameStats) {
    return (
      <div className="post-game-stats-screen">
        <div className="stats-container">
          <div className="error-message">{error}</div>
          <button onClick={onClose} className="close-button">Close</button>
        </div>
      </div>
    );
  }

  const currentPlayerStats = getCurrentPlayerStats();
  const opponentStats = getOpponentStats();
  const gameResults = postGameStats?.gameResults;

  return (
    <div className="post-game-stats-screen">
      <div className="stats-container">
        <div className="stats-header">
          <div className="header-main">
            <h2>Game Statistics</h2>
            <div className="game-mode-badge">
              {getGameModeLabel(gameMode)}
            </div>
          </div>
          
          {postGameStats?.modificationStatus && (
            <div className={getModificationStatusClass(postGameStats.modificationStatus)}>
              {getModificationStatusText(postGameStats.modificationStatus)}
            </div>
          )}

          {/* Trust Score Impact - Only for multiplayer/party games */}
          {gameMode !== 'single' && behaviorStats && (
            <div className="trust-score-impact">
              <div className="trust-score-current">
                <span className="trust-label">Current Trust Score:</span>
                <span 
                  className="trust-value" 
                  style={{ color: getTrustScoreColor(behaviorStats.trustScore) }}
                >
                  {Math.round(behaviorStats.trustScore)}
                </span>
              </div>
              
              {trustScoreChange !== null && (
                <div className="trust-score-change">
                  <span className="change-label">Change:</span>
                  <span 
                    className="change-value" 
                    style={{ color: getTrustScoreChangeColor(trustScoreChange) }}
                  >
                    {trustScoreChange > 0 ? '+' : ''}{trustScoreChange}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {gameResults && (
          <div className="game-results">
            <div className="result-summary">
              <h3>Game Result</h3>
              <div className="result-info">
                <div className="duration">
                  Duration: {Math.floor(gameResults.duration / 60)}:{(gameResults.duration % 60).toString().padStart(2, '0')}
                </div>
                <div className="rounds">
                  Rounds: {gameResults.totalRounds}
                </div>
              </div>
            </div>

            <div className="players-stats">
              <div className="player-stats-section">
                <h4>Your Performance</h4>
                {currentPlayerStats && (
                  <div className="player-stats">
                    <div className="stat-item">
                      <span className="stat-label">Score:</span>
                      <span className="stat-value">{currentPlayerStats.score}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Result:</span>
                      <span className={`stat-value ${currentPlayerStats.isWinner ? 'winner' : 'loser'}`}>
                        {currentPlayerStats.isWinner ? 'Victory' : 'Defeat'}
                      </span>
                    </div>
                    {currentPlayerStats.stats.cooperations !== undefined && (
                      <div className="stat-item">
                        <span className="stat-label">Cooperations:</span>
                        <span className="stat-value">{currentPlayerStats.stats.cooperations}</span>
                      </div>
                    )}
                    {currentPlayerStats.stats.betrayals !== undefined && (
                      <div className="stat-item">
                        <span className="stat-label">Betrayals:</span>
                        <span className="stat-value">{currentPlayerStats.stats.betrayals}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="player-stats-section">
                <h4>Opponent Performance</h4>
                {opponentStats && (
                  <div className="player-stats">
                    <div className="stat-item">
                      <span className="stat-label">Score:</span>
                      <span className="stat-value">{opponentStats.score}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Result:</span>
                      <span className={`stat-value ${opponentStats.isWinner ? 'winner' : 'loser'}`}>
                        {opponentStats.isWinner ? 'Victory' : 'Defeat'}
                      </span>
                    </div>
                    {opponentStats.stats.cooperations !== undefined && (
                      <div className="stat-item">
                        <span className="stat-label">Cooperations:</span>
                        <span className="stat-value">{opponentStats.stats.cooperations}</span>
                      </div>
                    )}
                    {opponentStats.stats.betrayals !== undefined && (
                      <div className="stat-item">
                        <span className="stat-label">Betrayals:</span>
                        <span className="stat-value">{opponentStats.stats.betrayals}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="game-statistics">
              <div className="stats-header-section">
                <h4>Game Statistics</h4>
                <button 
                  className="toggle-details-button"
                  onClick={() => setShowDetailedStats(!showDetailedStats)}
                >
                  {showDetailedStats ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
              
              <div className="game-stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Game Mode:</span>
                  <span className="stat-value">{getGameModeLabel(gameMode)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Cooperations:</span>
                  <span className="stat-value">{gameResults.statistics.totalCooperations}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Betrayals:</span>
                  <span className="stat-value">{gameResults.statistics.totalBetrayals}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Average Score:</span>
                  <span className="stat-value">{gameResults.statistics.averageScore.toFixed(1)}</span>
                </div>
                
                {showDetailedStats && (
                  <>
                    <div className="stat-item">
                      <span className="stat-label">Cooperation Rate:</span>
                      <span className="stat-value">
                        {gameResults.statistics.totalCooperations + gameResults.statistics.totalBetrayals > 0 
                          ? Math.round((gameResults.statistics.totalCooperations / (gameResults.statistics.totalCooperations + gameResults.statistics.totalBetrayals)) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Affects Statistics:</span>
                      <span className="stat-value">{gameMode !== 'single' ? 'Yes' : 'No'}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Behavior Impact - Only for multiplayer/party games */}
              {gameMode !== 'single' && showDetailedStats && behaviorStats && (
                <div className="behavior-impact">
                  <h5>Behavior Impact</h5>
                  <div className="behavior-stats">
                    <div className="behavior-item">
                      <span className="behavior-label">Silence Ratio:</span>
                      <span className="behavior-value">
                        {Math.round(behaviorStats.silenceRatio * 100)}%
                      </span>
                    </div>
                    <div className="behavior-item">
                      <span className="behavior-label">Behavior Trend:</span>
                      <span className="behavior-value trend-value">
                        {behaviorStats.behaviorTrend}
                      </span>
                    </div>
                    <div className="behavior-item">
                      <span className="behavior-label">Total Tracked Games:</span>
                      <span className="behavior-value">
                        {behaviorStats.totalGames}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modification-section">
          {/* Only show modification options for multiplayer and party games */}
          {gameMode !== 'single' && !hasSubmittedRequest && postGameStats?.modificationStatus !== 'applied' && (
            <div className="modification-actions">
              <h4>Request Game Modification</h4>
              <div className="modification-info">
                <p>If you believe there was an error in the game result, you can request a modification. Both players must submit matching requests for any changes to be applied.</p>
                <div className="modification-warning">
                  <span className="warning-icon">⚠️</span>
                  <span>Modifications affect your statistics and trust score. Use this feature responsibly.</span>
                </div>
              </div>
              
              {!showModificationForm ? (
                <button 
                  onClick={() => setShowModificationForm(true)}
                  className="request-modification-button"
                >
                  📝 Request Modification
                </button>
              ) : (
                <div className="modification-form">
                  <div className="form-group">
                    <label>Modification Type:</label>
                    <select 
                      value={modificationRequest.type}
                      onChange={(e) => setModificationRequest({
                        ...modificationRequest,
                        type: e.target.value as ModificationRequest['type']
                      })}
                    >
                      <option value="no_change">No Changes</option>
                      <option value="score_change">Score Change</option>
                      <option value="result_change">Result Change</option>
                    </select>
                  </div>

                  {modificationRequest.type === 'score_change' && (
                    <div className="form-group">
                      <label>New Score:</label>
                      <input
                        type="number"
                        value={modificationRequest.newScore || ''}
                        onChange={(e) => setModificationRequest({
                          ...modificationRequest,
                          newScore: parseInt(e.target.value) || 0
                        })}
                        placeholder="Enter new score"
                      />
                    </div>
                  )}

                  {modificationRequest.type === 'result_change' && (
                    <div className="form-group">
                      <label>New Result:</label>
                      <select 
                        value={modificationRequest.newResult || ''}
                        onChange={(e) => setModificationRequest({
                          ...modificationRequest,
                          newResult: e.target.value as 'win' | 'loss' | 'draw'
                        })}
                      >
                        <option value="">Select result</option>
                        <option value="win">Win</option>
                        <option value="loss">Loss</option>
                        <option value="draw">Draw</option>
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Details (Required):</label>
                    <textarea
                      value={modificationRequest.details}
                      onChange={(e) => setModificationRequest({
                        ...modificationRequest,
                        details: e.target.value
                      })}
                      placeholder="Explain why you are requesting this modification..."
                      rows={3}
                    />
                  </div>

                  <div className="form-actions">
                    <button 
                      onClick={handleSubmitModification}
                      disabled={submittingRequest || !modificationRequest.details.trim()}
                      className="submit-button"
                    >
                      {submittingRequest ? 'Submitting...' : 'Submit Request'}
                    </button>
                    <button 
                      onClick={() => setShowModificationForm(false)}
                      className="cancel-button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasSubmittedRequest && gameMode !== 'single' && (
            <div className="modification-submitted">
              <h4>✅ Modification Request Submitted</h4>
              <p>Your modification request has been submitted. The modification will only be applied if both players submit matching requests.</p>
              <div className="submission-status">
                <div className="status-item">
                  <span className="status-label">Your Request:</span>
                  <span className="status-value">Submitted</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Opponent Request:</span>
                  <span className="status-value">
                    {postGameStats?.modificationStatus === 'applied' ? 'Matched' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Single Player Game Note */}
          {gameMode === 'single' && (
            <div className="single-player-note">
              <h4>Single Player Game</h4>
              <p>This was a single player game. Results cannot be modified and do not affect your multiplayer statistics or trust score.</p>
            </div>
          )}
        </div>

        <div className="stats-actions">
          <button onClick={onClose} className="close-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostGameStatsScreen;