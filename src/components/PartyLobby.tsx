import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import { getSyncService } from '../services/SyncService';
import { AdBanner } from './AdBanner';
import { AdPlacement } from '../services/AdService';
import {
  PartyLobby as IPartyLobby,
  PartySettings,
  TournamentFormat,
  LobbyStatus,
  TournamentPlayer,
  PlayerStatus,
  PartyMessage,
  PartyMessageType,
  ChatMessage,
  ChatMessageType
} from '../types/party';
import './PartyLobby.css';

interface PartyLobbyProps {
  lobby: IPartyLobby;
  currentPlayerId: string;
  wsClient?: any;
  onUpdateSettings: (settings: Partial<PartySettings>) => void;
  onKickPlayer: (playerId: string) => void;
  onTransferHost: (newHostId: string) => void;
  onStartTournament: () => void;
  onLeaveLobby: () => void;
  onCloseLobby: () => void;
  onSendMessage: (message: string) => void;
  messages: ChatMessage[];
  isConnected: boolean;
  isReconnecting?: boolean;
  lastSyncTime?: Date;
}

const PartyLobby: React.FC<PartyLobbyProps> = ({
  lobby,
  currentPlayerId,
  wsClient,
  onUpdateSettings,
  onKickPlayer,
  onTransferHost,
  onStartTournament,
  onLeaveLobby,
  onCloseLobby,
  onSendMessage,
  messages,
  isConnected,
  isReconnecting = false,
  lastSyncTime
}) => {
  const { t } = useTranslation();
  const [chatMessage, setChatMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<PartySettings>(lobby.settings);
  const [showHostMenu, setShowHostMenu] = useState(false);
  const [showKickConfirm, setShowKickConfirm] = useState<string | null>(null);
  const [showTransferConfirm, setShowTransferConfirm] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  // Find current player in participants to check if they are host
  // Use WebSocket client ID for proper identification
  const actualCurrentPlayerId = wsClient?.getPlayerId() || currentPlayerId;
  const currentPlayer = lobby.participants?.find(p => p.id === actualCurrentPlayerId);
  const isHost = currentPlayer?.isHost || lobby.hostPlayerId === actualCurrentPlayerId;
  const canStartTournament = lobby.status === LobbyStatus.READY_TO_START && (lobby.currentPlayerCount || 0) >= 4;

  // Debug host kontrolü
  console.log('🎮 PartyLobby Host Debug:', {
    hostPlayerId: lobby.hostPlayerId,
    currentPlayerId: currentPlayerId,
    wsClientPlayerId: wsClient?.getPlayerId(),
    actualCurrentPlayerId: actualCurrentPlayerId,
    currentPlayer: currentPlayer,
    isHost: isHost,
    lobbyStatus: lobby.status,
    currentPlayerCount: lobby.currentPlayerCount,
    canStartTournament: canStartTournament,
    statusCheck: lobby.status === LobbyStatus.READY_TO_START,
    playerCountCheck: (lobby.currentPlayerCount || 0) >= 4,
    LobbyStatusEnum: LobbyStatus,
    participants: lobby.participants?.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
  });

  useEffect(() => {
    if (lobby.settings) {
      setTempSettings(lobby.settings);
    }
  }, [lobby.settings]);

  // Set up state synchronization
  useEffect(() => {
    const syncService = getSyncService();

    // Subscribe to lobby updates
    const subscriptionId1 = syncService.subscribeToUpdates(
      (update) => {
        if (update.type === 'lobby_update' && update.data?.id === lobby.id) {
          console.log('🔄 Received lobby sync update:', update);
          setSyncStatus('synced');
          setLastUpdateTime(update.timestamp);

          // Validate update data
          if (!update.data.participants || !Array.isArray(update.data.participants)) {
            console.error('❌ Invalid lobby update data:', update.data);
            setSyncStatus('error');
            return;
          }

          // The parent component will handle the actual state update
          // We just update our local sync indicators
        }
      },
      (update) => update.type === 'lobby_update' && update.data?.id === lobby.id
    );

    // Subscribe to connection state changes
    const subscriptionId2 = syncService.subscribeToUpdates(
      (update) => {
        if (update.type === 'session_update') {
          if (update.data.connected === false) {
            console.warn('⚠️ Connection lost, lobby sync may be affected');
            setSyncStatus('error');
          } else if (update.data.connected === true) {
            console.log('✅ Connection restored, lobby sync active');
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
  }, [lobby.id]);

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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatMessage.trim() && isConnected) {
      onSendMessage(chatMessage.trim());
      setChatMessage('');
    }
  };

  const handleUpdateSettings = () => {
    // Validate settings before updating
    if (tempSettings.maxPlayers < 4 || tempSettings.maxPlayers > 16) {
      console.error('❌ Invalid maxPlayers:', tempSettings.maxPlayers);
      return;
    }

    if (tempSettings.roundCount < 5 || tempSettings.roundCount > 20) {
      console.error('❌ Invalid roundCount:', tempSettings.roundCount);
      return;
    }

    if (!tempSettings.tournamentFormat) {
      console.error('❌ Invalid tournamentFormat');
      return;
    }

    console.log('⚙️ Updating settings:', tempSettings);
    onUpdateSettings(tempSettings);
    setShowSettings(false);
  };

  const handleKickPlayer = (playerId: string) => {
    // Validate player exists
    const playerToKick = lobby.participants.find(p => p.id === playerId);
    if (!playerToKick) {
      console.error('❌ Cannot kick player: player not found', playerId);
      setShowKickConfirm(null);
      return;
    }

    // Prevent kicking self
    if (playerId === actualCurrentPlayerId) {
      console.error('❌ Cannot kick self');
      setShowKickConfirm(null);
      return;
    }

    // Prevent kicking host
    if (playerToKick.isHost) {
      console.error('❌ Cannot kick host');
      setShowKickConfirm(null);
      return;
    }

    console.log('👢 Kicking player:', playerToKick.name);
    onKickPlayer(playerId);
    setShowKickConfirm(null);
  };

  const handleTransferHost = (newHostId: string) => {
    // Validate new host exists
    const newHost = lobby.participants.find(p => p.id === newHostId);
    if (!newHost) {
      console.error('❌ Cannot transfer host: player not found', newHostId);
      setShowTransferConfirm(null);
      setShowHostMenu(false);
      return;
    }

    // Prevent transferring to self
    if (newHostId === actualCurrentPlayerId) {
      console.error('❌ Cannot transfer host to self');
      setShowTransferConfirm(null);
      setShowHostMenu(false);
      return;
    }

    console.log('👑 Transferring host to:', newHost.name);
    onTransferHost(newHostId);
    setShowTransferConfirm(null);
    setShowHostMenu(false);
  };

  const handleCloseLobby = () => {
    onCloseLobby();
    setShowCloseConfirm(false);
  };

  const confirmKick = (playerId: string, playerName: string) => {
    setShowKickConfirm(playerId);
  };

  const confirmTransferHost = (playerId: string) => {
    setShowTransferConfirm(playerId);
  };

  const getStatusColor = (status: LobbyStatus): string => {
    switch (status) {
      case LobbyStatus.WAITING_FOR_PLAYERS:
        return 'orange';
      case LobbyStatus.READY_TO_START:
        return 'green';
      case LobbyStatus.TOURNAMENT_IN_PROGRESS:
        return 'blue';
      default:
        return 'gray';
    }
  };

  const getPlayerStatusIcon = (player: TournamentPlayer): string => {
    if (player.isHost) return '👑';
    
    // Check if player is guest
    const isGuest = player.name?.startsWith('Misafir');
    
    switch (player.status) {
      case PlayerStatus.READY:
        return isGuest ? '🎭✅' : '✅';
      case PlayerStatus.WAITING:
        return isGuest ? '🎭⏳' : '⏳';
      case PlayerStatus.IN_MATCH:
        return isGuest ? '🎭🎮' : '🎮';
      case PlayerStatus.DISCONNECTED:
        return isGuest ? '🎭❌' : '❌';
      default:
        return isGuest ? '🎭' : '👤';
    }
  };

  const formatTournamentFormat = (format: TournamentFormat): string => {
    if (!format) return 'Unknown';

    switch (format) {
      case TournamentFormat.SINGLE_ELIMINATION:
        return t('tournament.singleElimination');
      case TournamentFormat.DOUBLE_ELIMINATION:
        return t('tournament.doubleElimination');
      case TournamentFormat.ROUND_ROBIN:
        return t('tournament.roundRobin');
      default:
        return format;
    }
  };

  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className={`party-lobby ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      {/* Header */}
      <div className="lobby-header">
        <div className="lobby-info">
          <h2>{t('party.lobbyTitle')}</h2>
          <div className="lobby-code">
            <span>{t('party.lobbyCode')}: </span>
            <strong>{lobby.code}</strong>
            <button
              className="copy-code-btn"
              onClick={() => navigator.clipboard.writeText(lobby.code)}
              title={t('party.copyCode')}
            >
              📋
            </button>
          </div>
          <div className={`lobby-status status-${getStatusColor(lobby.status)}`}>
            {t(`party.status.${lobby.status}`)}
          </div>

          {/* Sync Status Indicator */}
          <div className={`sync-status sync-${syncStatus}`}>
            {syncStatus === 'synced' && (
              <span title={`Son güncelleme: ${lastUpdateTime.toLocaleTimeString()}`}>
                🟢 Senkronize
              </span>
            )}
            {syncStatus === 'syncing' && (
              <span title="Yeniden bağlanılıyor...">
                🟡 Senkronize ediliyor...
              </span>
            )}
            {syncStatus === 'error' && (
              <span title="Bağlantı sorunu">
                🔴 Bağlantı kesildi
              </span>
            )}
          </div>
        </div>

        <div className="lobby-actions">
          {isHost && (
            <div className="host-controls">
              <div className="host-controls-title">
                👑 {t('party.hostControls')}
              </div>
              <button
                className="settings-btn host-btn"
                onClick={() => setShowSettings(!showSettings)}
                disabled={lobby.status === LobbyStatus.TOURNAMENT_IN_PROGRESS}
                title={t('party.manageSettings')}
              >
                ⚙️ {t('party.settings')}
              </button>
              <button
                className="host-menu-btn host-btn"
                onClick={() => setShowHostMenu(!showHostMenu)}
                disabled={lobby.status === LobbyStatus.TOURNAMENT_IN_PROGRESS}
                title={t('party.hostMenu')}
              >
                👑 {t('party.hostMenu')}
              </button>
              <button
                className="start-tournament-btn host-btn primary"
                onClick={onStartTournament}
                disabled={!canStartTournament}
                title={canStartTournament ? t('party.startTournament') : t('party.needMinPlayers')}
              >
                🚀 {t('party.startTournament')}
              </button>
            </div>
          )}
          <button
            className={`leave-lobby-btn ${isHost ? 'host-leave' : ''}`}
            onClick={onLeaveLobby}
            title={isHost ? t('party.leaveAsHost') : t('party.leaveLobby')}
          >
            🚪 {isHost ? t('party.leaveAsHost') : t('party.leaveLobby')}
          </button>

        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && isHost && (
        <div className="settings-panel">
          <h3>{t('party.tournamentSettings')}</h3>

          <div className="setting-group">
            <label>{t('party.maxPlayers')}: {tempSettings.maxPlayers}</label>
            
            {/* Round Robin için slider */}
            {tempSettings.tournamentFormat === TournamentFormat.ROUND_ROBIN && (
              <>
                <input
                  type="range"
                  min="4"
                  max="16"
                  value={tempSettings.maxPlayers}
                  className="range-slider"
                  onChange={(e) => setTempSettings({
                    ...tempSettings,
                    maxPlayers: parseInt(e.target.value)
                  })}
                />
                <div className="range-labels">
                  <span>4</span>
                  <span>16</span>
                </div>
              </>
            )}
            
            {/* Elimination formatları için dropdown */}
            {(tempSettings.tournamentFormat === TournamentFormat.SINGLE_ELIMINATION || 
              tempSettings.tournamentFormat === TournamentFormat.DOUBLE_ELIMINATION) && (
              <select
                value={tempSettings.maxPlayers}
                onChange={(e) => setTempSettings({
                  ...tempSettings,
                  maxPlayers: parseInt(e.target.value)
                })}
              >
                <option value={4}>4 Oyuncu</option>
                <option value={8}>8 Oyuncu</option>
                <option value={16}>16 Oyuncu</option>
              </select>
            )}
          </div>

          <div className="setting-group">
            <label>{t('party.roundCount')}: {tempSettings.roundCount}</label>
            <input
              type="range"
              min="5"
              max="20"
              value={tempSettings.roundCount}
              onChange={(e) => setTempSettings({
                ...tempSettings,
                roundCount: parseInt(e.target.value)
              })}
            />
          </div>

          <div className="setting-group">
            <label>{t('party.tournamentFormat')}</label>
            <select
              value={tempSettings.tournamentFormat}
              onChange={(e) => setTempSettings({
                ...tempSettings,
                tournamentFormat: e.target.value as TournamentFormat
              })}
            >
              <option value={TournamentFormat.SINGLE_ELIMINATION}>
                {t('tournament.singleElimination')}
              </option>
              <option value={TournamentFormat.DOUBLE_ELIMINATION}>
                {t('tournament.doubleElimination')}
              </option>
              <option value={TournamentFormat.ROUND_ROBIN}>
                {t('tournament.roundRobin')}
              </option>
            </select>
          </div>

          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={tempSettings.allowSpectators}
                onChange={(e) => setTempSettings({
                  ...tempSettings,
                  allowSpectators: e.target.checked
                })}
              />
              {t('party.allowSpectators')}
            </label>
          </div>

          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={tempSettings.chatEnabled}
                onChange={(e) => setTempSettings({
                  ...tempSettings,
                  chatEnabled: e.target.checked
                })}
              />
              {t('party.enableChat')}
            </label>
          </div>

          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={tempSettings.autoStartWhenFull}
                onChange={(e) => setTempSettings({
                  ...tempSettings,
                  autoStartWhenFull: e.target.checked
                })}
              />
              {t('party.autoStartWhenFull')}
            </label>
          </div>

          <div className="settings-actions">
            <button onClick={handleUpdateSettings} className="save-settings-btn">
              {t('common.save')}
            </button>
            <button onClick={() => setShowSettings(false)} className="cancel-settings-btn">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Host Management Menu */}
      {showHostMenu && isHost && (
        <div className="host-menu-panel">
          <h3>{t('party.hostManagement')}</h3>

          <div className="host-menu-section">
            <h4>{t('party.playerManagement')}</h4>
            <div className="host-player-list">
              {lobby.participants
                .filter(player => player.id !== actualCurrentPlayerId)
                .map((player) => (
                  <div key={player.id} className="host-player-item">
                    <div className="player-info">
                      <span className="player-icon">{getPlayerStatusIcon(player)}</span>
                      <span className="player-name">{player.name}</span>
                    </div>
                    <div className="player-actions">
                      <button
                        className="transfer-host-btn"
                        onClick={() => confirmTransferHost(player.id)}
                        title={t('party.transferHost')}
                      >
                        👑
                      </button>
                      <button
                        className="kick-player-btn"
                        onClick={() => confirmKick(player.id, player.name)}
                        title={t('party.kickPlayer')}
                      >
                        ❌
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="host-menu-section">
            <h4>{t('party.lobbyManagement')}</h4>
            <div className="lobby-management-actions">
              <button
                className="close-lobby-btn danger"
                onClick={() => setShowCloseConfirm(true)}
                title={t('party.closeLobby')}
              >
                🗑️ {t('party.closeLobby')}
              </button>
            </div>
          </div>

          <div className="host-menu-actions">
            <button onClick={() => setShowHostMenu(false)} className="close-menu-btn">
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      <div className="lobby-content">
        {/* Tournament Info */}
        <div className="tournament-info">
          <h3>{t('party.tournamentInfo')}</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">{t('party.format')}:</span>
              <span className="info-value">{lobby.settings ? formatTournamentFormat(lobby.settings.tournamentFormat) : 'Loading...'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('party.players')}:</span>
              <span className="info-value">{lobby.currentPlayerCount}/{lobby.maxPlayers}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('party.rounds')}:</span>
              <span className="info-value">{lobby.settings ? lobby.settings.roundCount : 'Loading...'}</span>
            </div>
          </div>
        </div>

        {/* Players List */}
        <div className="players-section">
          <h3>{t('party.participants')}</h3>
          <div className="players-list">
            {(lobby.participants || []).length === 0 ? (
              <div className="no-players-message">
                {t('party.noPlayers') || 'Lobi boş'}
              </div>
            ) : (
              (lobby.participants || []).map((player) => {
                // Validate player data
                if (!player || !player.id) {
                  console.error('❌ Invalid player data:', player);
                  return null;
                }

                return (
                  <div key={player.id} className={`player-card ${player.id === actualCurrentPlayerId ? 'current-player' : ''} ${player.isHost ? 'host-player' : ''}`}>
                    <div className="player-info">
                      <span className="player-icon">{getPlayerStatusIcon(player)}</span>
                      <span className="player-name">{player.name || 'Unknown Player'}</span>
                      {player.isHost && (
                        <div className="host-indicators">
                          <span className="host-badge">{t('party.host')}</span>
                          <span className="host-privileges" title={t('party.hostPrivileges')}>
                            ⚡
                          </span>
                        </div>
                      )}
                    </div>

                    {isHost && player.id !== actualCurrentPlayerId && (
                      <div className="player-actions">
                        <button
                          className="quick-kick-btn"
                          onClick={() => confirmKick(player.id, player.name)}
                          title={t('party.kickPlayer')}
                          disabled={!isConnected}
                        >
                          ❌
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {isHost && (
            <div className="host-info-panel">
              <div className="host-privileges-info">
                <span className="privileges-icon">👑</span>
                <span className="privileges-text">{t('party.youAreHost')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Chat Section */}
        {lobby.settings.chatEnabled && (
          <div className="chat-section">
            <h3>{t('party.chat')}</h3>
            <div className="chat-messages">
              {messages.map((message) => (
                <div key={message.id} className={`chat-message ${message.type}`}>
                  <span className="message-sender">{message.senderName}:</span>
                  <span className="message-content">{message.message}</span>
                  <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder={t('party.typeMessage')}
                maxLength={200}
                disabled={!isConnected}
              />
              <button type="submit" disabled={!chatMessage.trim() || !isConnected}>
                {t('party.send')}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Connection Status */}
      {!isConnected && (
        <div className="connection-status">
          <span className="disconnected-indicator">
            ❌ {t('party.disconnected')}
          </span>
        </div>
      )}

      {/* Tournament Status Messages */}
      {lobby.status === LobbyStatus.WAITING_FOR_PLAYERS && (
        <>
          <div className="status-message waiting">
            {t('party.waitingForPlayers', {
              current: lobby.currentPlayerCount,
              minimum: 4
            })}
          </div>
          {/* Advertisement while waiting */}
          <div className="lobby-ad">
            <AdBanner placement={AdPlacement.ROUND_END} />
          </div>
        </>
      )}

      {lobby.status === LobbyStatus.READY_TO_START && !isHost && (
        <div className="status-message ready">
          {t('party.waitingForHost')}
        </div>
      )}

      {lobby.status === LobbyStatus.TOURNAMENT_IN_PROGRESS && (
        <div className="status-message in-progress">
          {t('party.tournamentInProgress')}
        </div>
      )}

      {/* Confirmation Dialogs */}
      {showKickConfirm && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog">
            <h3>{t('party.confirmKick')}</h3>
            <p>
              {t('party.kickPlayerConfirm', {
                playerName: lobby.participants.find(p => p.id === showKickConfirm)?.name
              })}
            </p>
            <div className="confirmation-actions">
              <button
                className="confirm-btn danger"
                onClick={() => handleKickPlayer(showKickConfirm)}
              >
                {t('party.kickPlayer')}
              </button>
              <button
                className="cancel-btn"
                onClick={() => setShowKickConfirm(null)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransferConfirm && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog">
            <h3>{t('party.confirmTransferHost')}</h3>
            <p>
              {t('party.transferHostConfirm', {
                playerName: lobby.participants.find(p => p.id === showTransferConfirm)?.name
              })}
            </p>
            <div className="confirmation-actions">
              <button
                className="confirm-btn primary"
                onClick={() => handleTransferHost(showTransferConfirm)}
              >
                {t('party.transferHost')}
              </button>
              <button
                className="cancel-btn"
                onClick={() => setShowTransferConfirm(null)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseConfirm && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog">
            <h3>{t('party.confirmCloseLobby')}</h3>
            <p>{t('party.closeLobbyConfirm')}</p>
            <div className="confirmation-actions">
              <button
                className="confirm-btn danger"
                onClick={handleCloseLobby}
              >
                {t('party.closeLobby')}
              </button>
              <button
                className="cancel-btn"
                onClick={() => setShowCloseConfirm(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartyLobby;