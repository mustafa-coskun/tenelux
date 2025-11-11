import React, { useState, useEffect } from 'react';
import { 
  Tournament, 
  ActiveMatch, 
  TournamentPlayer, 
  PlayerStatus,
  ChatMessage,
  ChatMessageType 
} from '../types/party';
import { GameSession } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import './SpectatorMode.css';

interface SpectatorModeProps {
  tournament: Tournament;
  spectatorPlayer: TournamentPlayer;
  activeMatches: ActiveMatch[];
  onSelectMatch: (matchId: string) => void;
  onSendSpectatorMessage: (message: string) => void;
  spectatorMessages: ChatMessage[];
  onLeaveSpectator: () => void;
}

interface MatchViewState {
  selectedMatchId: string | null;
  gameSession: GameSession | null;
  isLiveViewing: boolean;
}

export const SpectatorMode: React.FC<SpectatorModeProps> = ({
  tournament,
  spectatorPlayer,
  activeMatches,
  onSelectMatch,
  onSendSpectatorMessage,
  spectatorMessages,
  onLeaveSpectator
}) => {
  const { t } = useTranslation();
  const [matchViewState, setMatchViewState] = useState<MatchViewState>({
    selectedMatchId: null,
    gameSession: null,
    isLiveViewing: false
  });
  const [chatMessage, setChatMessage] = useState('');
  const [showChat, setShowChat] = useState(true);

  // Auto-select first available match if none selected
  useEffect(() => {
    if (!matchViewState.selectedMatchId && activeMatches.length > 0) {
      const firstMatch = activeMatches[0];
      setMatchViewState(prev => ({
        ...prev,
        selectedMatchId: firstMatch.id
      }));
      onSelectMatch(firstMatch.id);
    }
  }, [activeMatches, matchViewState.selectedMatchId, onSelectMatch]);

  const handleMatchSelection = (matchId: string) => {
    setMatchViewState(prev => ({
      ...prev,
      selectedMatchId: matchId,
      isLiveViewing: true
    }));
    onSelectMatch(matchId);
  };

  const handleSendMessage = () => {
    if (chatMessage.trim()) {
      onSendSpectatorMessage(chatMessage.trim());
      setChatMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedMatch = activeMatches.find(m => m.id === matchViewState.selectedMatchId);

  const renderMatchList = () => (
    <div className="spectator-match-list">
      <h3>🎮 Active Matches</h3>
      {activeMatches.length === 0 ? (
        <div className="no-matches">
          <p>No active matches to spectate</p>
          <p>Waiting for next round to begin...</p>
        </div>
      ) : (
        <div className="matches-grid">
          {activeMatches.map(match => (
            <div
              key={match.id}
              className={`match-card ${matchViewState.selectedMatchId === match.id ? 'selected' : ''}`}
              onClick={() => handleMatchSelection(match.id)}
            >
              <div className="match-players">
                <span className="player-name">{match.player1.name}</span>
                <span className="vs-divider">VS</span>
                <span className="player-name">{match.player2.name}</span>
              </div>
              <div className="match-info">
                <span className="round-info">Round {match.roundNumber}</span>
                <span className={`match-status ${match.status}`}>
                  {match.status === 'in_progress' ? '🔴 Live' : '⏸️ Waiting'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderMatchViewer = () => {
    if (!selectedMatch) {
      return (
        <div className="no-match-selected">
          <h3>Select a match to spectate</h3>
          <p>Choose from the active matches on the left</p>
        </div>
      );
    }

    return (
      <div className="match-viewer">
        <div className="match-header">
          <h3>🎮 Spectating Match</h3>
          <div className="match-details">
            <div className="players-display">
              <div className="player-info">
                <span className="player-name">{selectedMatch.player1.name}</span>
                <span className="player-score">Score: {selectedMatch.result?.player1Score || 0}</span>
              </div>
              <div className="vs-display">VS</div>
              <div className="player-info">
                <span className="player-name">{selectedMatch.player2.name}</span>
                <span className="player-score">Score: {selectedMatch.result?.player2Score || 0}</span>
              </div>
            </div>
            <div className="match-status-display">
              <span className={`status-badge ${selectedMatch.status}`}>
                {selectedMatch.status === 'in_progress' ? '🔴 Live Match' : '⏸️ Match Paused'}
              </span>
            </div>
          </div>
        </div>

        <div className="game-view-area">
          {selectedMatch.status === 'in_progress' ? (
            <div className="live-game-view">
              <div className="game-info">
                <h4>🔴 Live Game in Progress</h4>
                <p>Players are making their decisions...</p>
                <div className="spectator-notice">
                  <span className="notice-icon">👁️</span>
                  <span>You are spectating this match</span>
                </div>
              </div>
              
              {/* Simplified game state display for spectators */}
              <div className="spectator-game-board">
                <div className="round-counter">
                  <span>Round: {matchViewState.gameSession?.rounds.length || 0} / 10</span>
                </div>
                
                <div className="players-status">
                  <div className="player-status">
                    <span className="player-name">{selectedMatch.player1.name}</span>
                    <div className="status-indicator thinking">🤔 Thinking...</div>
                  </div>
                  <div className="player-status">
                    <span className="player-name">{selectedMatch.player2.name}</span>
                    <div className="status-indicator thinking">🤔 Thinking...</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="waiting-game-view">
              <div className="waiting-info">
                <h4>⏸️ Match Waiting to Start</h4>
                <p>This match will begin shortly...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSpectatorChat = () => (
    <div className={`spectator-chat ${showChat ? 'expanded' : 'collapsed'}`}>
      <div className="chat-header" onClick={() => setShowChat(!showChat)}>
        <h4>💬 Spectator Chat</h4>
        <button className="chat-toggle">
          {showChat ? '▼' : '▲'}
        </button>
      </div>
      
      {showChat && (
        <>
          <div className="chat-messages">
            {spectatorMessages.length === 0 ? (
              <div className="no-messages">
                <p>No spectator messages yet</p>
                <p>Start a conversation with other spectators!</p>
              </div>
            ) : (
              spectatorMessages.map(message => (
                <div
                  key={message.id}
                  className={`chat-message ${message.type === ChatMessageType.SYSTEM_MESSAGE ? 'system' : 'player'}`}
                >
                  <div className="message-header">
                    <span className="sender-name">
                      {message.type === ChatMessageType.SYSTEM_MESSAGE ? '🤖 System' : `👁️ ${message.senderName}`}
                    </span>
                    <span className="message-time">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-content">{message.message}</div>
                </div>
              ))
            )}
          </div>
          
          <div className="chat-input-area">
            <div className="spectator-notice">
              <span className="notice-text">👁️ Spectator Mode - Chat with other eliminated players</span>
            </div>
            <div className="chat-input-group">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Send a message to other spectators..."
                className="chat-input"
                maxLength={200}
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatMessage.trim()}
                className="send-button"
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderTournamentStatus = () => (
    <div className="tournament-status">
      <div className="status-header">
        <h3>🏆 Tournament Status</h3>
        <div className="player-status-badge eliminated">
          👁️ Spectating (Eliminated)
        </div>
      </div>
      
      <div className="tournament-info">
        <div className="info-item">
          <span className="label">Current Round:</span>
          <span className="value">{tournament.currentRound} / {tournament.totalRounds}</span>
        </div>
        <div className="info-item">
          <span className="label">Active Matches:</span>
          <span className="value">{activeMatches.length}</span>
        </div>
        <div className="info-item">
          <span className="label">Remaining Players:</span>
          <span className="value">
            {tournament.players.filter(p => !p.isEliminated).length}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="spectator-mode">
      <div className="spectator-header">
        <div className="header-content">
          <h2>👁️ Spectator Mode</h2>
          <p>You have been eliminated from the tournament. Watch the remaining matches!</p>
        </div>
        <button onClick={onLeaveSpectator} className="leave-spectator-btn">
          Leave Tournament
        </button>
      </div>

      <div className="spectator-content">
        <div className="left-panel">
          {renderTournamentStatus()}
          {renderMatchList()}
        </div>

        <div className="center-panel">
          {renderMatchViewer()}
        </div>

        <div className="right-panel">
          {renderSpectatorChat()}
        </div>
      </div>
    </div>
  );
};

export default SpectatorMode;