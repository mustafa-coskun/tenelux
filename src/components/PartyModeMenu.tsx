import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import {
  PartySettings,
  TournamentFormat,
  LobbyCreationRequest,
  LobbyJoinRequest
} from '../types/party';
import PartyModeTutorial from './PartyModeTutorial';
import './PartyModeMenu.css';

interface PartyModeMenuProps {
  onCreateLobby: (request: LobbyCreationRequest) => void;
  onJoinLobby: (request: LobbyJoinRequest) => void;
  onBack: () => void;
  playerName: string;
  playerId: string;
}

const PartyModeMenu: React.FC<PartyModeMenuProps> = ({
  onCreateLobby,
  onJoinLobby,
  onBack,
  playerName,
  playerId
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'select' | 'create' | 'join' | 'tutorial'>('select');
  const [lobbyCode, setLobbyCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [settings, setSettings] = useState<PartySettings>({
    maxPlayers: 8,
    roundCount: 10,
    tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
    allowSpectators: true,
    chatEnabled: true,
    autoStartWhenFull: false
  });

  // Turnuva formatı değiştiğinde maxPlayers'ı uygun değere ayarla
  useEffect(() => {
    if (settings.tournamentFormat === TournamentFormat.SINGLE_ELIMINATION || 
        settings.tournamentFormat === TournamentFormat.DOUBLE_ELIMINATION) {
      // Elimination formatları için geçerli değerler: 4, 8, 16
      const validSizes = [4, 8, 16];
      if (!validSizes.includes(settings.maxPlayers)) {
        setSettings(prev => ({ ...prev, maxPlayers: 8 })); // Default olarak 8
      }
    } else if (settings.tournamentFormat === TournamentFormat.ROUND_ROBIN) {
      // Round Robin için 4-16 arası
      if (settings.maxPlayers < 4) {
        setSettings(prev => ({ ...prev, maxPlayers: 4 }));
      } else if (settings.maxPlayers > 16) {
        setSettings(prev => ({ ...prev, maxPlayers: 16 }));
      }
    }
  }, [settings.tournamentFormat]);

  const handleCreateLobby = () => {
    const request: LobbyCreationRequest = {
      hostPlayerId: playerId,
      hostPlayerName: playerName,
      settings
    };
    onCreateLobby(request);
  };

  const handleJoinLobby = async () => {
    if (lobbyCode.trim().length !== 6) {
      setJoinError(t('party.errors.invalidCodeLength'));
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      const request: LobbyJoinRequest = {
        playerId,
        playerName,
        lobbyCode: lobbyCode.trim().toUpperCase()
      };
      await onJoinLobby(request);
    } catch (error: any) {
      // Handle specific error cases
      const errorMessage = error.message || error;
      switch (errorMessage) {
        case 'lobby_not_found':
        case 'invalid_lobby_code':
          setJoinError(t('party.errors.lobbyNotFound'));
          break;
        case 'lobby_full':
          setJoinError(t('party.errors.lobbyFull'));
          break;
        case 'tournament_already_started':
          setJoinError(t('party.errors.tournamentStarted'));
          break;
        case 'player_already_in_lobby':
          setJoinError(t('party.errors.alreadyInLobby'));
          break;
        default:
          setJoinError(t('party.errors.joinFailed'));
      }
    } finally {
      setIsJoining(false);
    }
  };

  const formatTournamentFormat = (format: TournamentFormat): string => {
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

  if (mode === 'select') {
    return (
      <>
        <div className={`party-mode-menu ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
          <div className="party-header">
            <h1>{t('party.partyMode')}</h1>
            <p>{t('partyModeInfo.welcome')}</p>
            <div className="header-actions">
              <button
                className="tutorial-button"
                onClick={() => setShowTutorial(true)}
                title={t('partyModeInfo.tutorialButtonTitle')}
              >
                📚 {t('menu.tutorial')}
              </button>
            </div>
          </div>

          <div className="party-options">
            <div className="party-option-card">
              <div className="option-icon">🏆</div>
              <h3>{t('party.createParty')}</h3>
              <p>{t('partyModeInfo.createDescription')}</p>
              <button
                className="option-button create-button"
                onClick={() => setMode('create')}
              >
                {t('party.create')}
              </button>
            </div>

            <div className="party-option-card">
              <div className="option-icon">🎮</div>
              <h3>{t('party.joinParty')}</h3>
              <p>{t('partyModeInfo.joinDescription')}</p>
              <button
                className="option-button join-button"
                onClick={() => setMode('join')}
              >
                {t('party.join')}
              </button>
            </div>

            <div className="party-option-card help-card">
              <div className="option-icon">❓</div>
              <h3>{t('partyModeInfo.needHelp')}</h3>
              <p>{t('partyModeInfo.helpDescription')}</p>
              <button
                className="option-button help-button"
                onClick={() => setShowTutorial(true)}
              >
                📚 {t('partyModeInfo.viewTutorial')}
              </button>
            </div>
          </div>

          <div className="party-info">
            <h3>{t('partyModeInfo.featuresTitle')}</h3>
            <ul>
              <li>🏆 {t('partyModeInfo.features.tournaments')}</li>
              <li>👥 {t('partyModeInfo.features.players')}</li>
              <li>⚙️ {t('partyModeInfo.features.customizable')}</li>
              <li>💬 {t('partyModeInfo.features.chat')}</li>
              <li>📊 {t('partyModeInfo.features.statistics')}</li>
              <li>👑 {t('partyModeInfo.features.championship')}</li>
            </ul>
          </div>

          <div className="menu-actions">
            <button className="back-button" onClick={onBack}>
              {t('common.back')}
            </button>
          </div>
        </div>

        {showTutorial && (
          <PartyModeTutorial
            onClose={() => setShowTutorial(false)}
            onStartCreate={() => setMode('create')}
            onStartJoin={() => setMode('join')}
          />
        )}
      </>
    );
  }

  if (mode === 'create') {
    return (
      <div className={`party-mode-menu ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
        <div className="party-header">
          <h1>{t('party.createParty')}</h1>
          <p>Turnuva ayarlarınızı yapılandırın</p>
        </div>

        <div className="create-lobby-form">
          <div className="settings-grid">
            <div className="setting-group">
              <label>{t('party.maxPlayers')}: {settings.maxPlayers}</label>
              
              {/* Round Robin için slider */}
              {settings.tournamentFormat === TournamentFormat.ROUND_ROBIN && (
                <>
                  <input
                    type="range"
                    min="4"
                    max="16"
                    value={settings.maxPlayers}
                    className="range-slider"
                    onChange={(e) => setSettings({
                      ...settings,
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
              {(settings.tournamentFormat === TournamentFormat.SINGLE_ELIMINATION || 
                settings.tournamentFormat === TournamentFormat.DOUBLE_ELIMINATION) && (
                <select
                  value={settings.maxPlayers}
                  onChange={(e) => setSettings({
                    ...settings,
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
              <label>{t('party.roundCount')}: {settings.roundCount}</label>
              <input
                type="range"
                min="5"
                max="20"
                value={settings.roundCount}
                onChange={(e) => setSettings({
                  ...settings,
                  roundCount: parseInt(e.target.value)
                })}
              />
              <div className="range-labels">
                <span>5</span>
                <span>20</span>
              </div>
            </div>

            <div className="setting-group">
              <label>{t('party.tournamentFormat')}</label>
              <select
                value={settings.tournamentFormat}
                onChange={(e) => setSettings({
                  ...settings,
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

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.allowSpectators}
                  onChange={(e) => setSettings({
                    ...settings,
                    allowSpectators: e.target.checked
                  })}
                />
                <span className="checkmark"></span>
                {t('party.allowSpectators')}
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.chatEnabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    chatEnabled: e.target.checked
                  })}
                />
                <span className="checkmark"></span>
                {t('party.enableChat')}
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.autoStartWhenFull}
                  onChange={(e) => setSettings({
                    ...settings,
                    autoStartWhenFull: e.target.checked
                  })}
                />
                <span className="checkmark"></span>
                {t('party.autoStartWhenFull')}
              </label>
            </div>
          </div>

          <div className="tournament-preview">
            <h3>Turnuva Önizlemesi</h3>
            <div className="preview-info">
              <div className="preview-item">
                <span className="preview-label">Format:</span>
                <span className="preview-value">{formatTournamentFormat(settings.tournamentFormat)}</span>
              </div>
              <div className="preview-item">
                <span className="preview-label">Oyuncular:</span>
                <span className="preview-value">{settings.maxPlayers} maksimum</span>
              </div>
              <div className="preview-item">
                <span className="preview-label">Turlar:</span>
                <span className="preview-value">{settings.roundCount} tur</span>
              </div>
              <div className="preview-item">
                <span className="preview-label">Tahmini Süre:</span>
                <span className="preview-value">
                  {Math.round((settings.roundCount * settings.maxPlayers * 2) / 60)} dakika
                </span>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button className="create-lobby-button" onClick={handleCreateLobby}>
              🏆 Turnuva Oluştur
            </button>
            <button className="back-button" onClick={() => setMode('select')}>
              {t('common.back')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div className={`party-mode-menu ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
        <div className="party-header">
          <h1>{t('party.joinParty')}</h1>
          <p>{t('party.joinDescription')}</p>
        </div>

        <div className="join-lobby-form">
          <div className="code-input-section">
            <label htmlFor="lobbyCode">{t('party.lobbyCode')}</label>
            <div className="code-input-wrapper">
              <input
                id="lobbyCode"
                type="text"
                value={lobbyCode}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  setLobbyCode(value);
                  if (joinError) setJoinError(null);
                }}
                placeholder="ABC123"
                maxLength={6}
                className={`lobby-code-input ${joinError ? 'error' : ''}`}
                disabled={isJoining}
                autoComplete="off"
              />
              {isJoining && <div className="loading-spinner">⏳</div>}
            </div>

            {joinError && (
              <div className="error-message">
                ❌ {joinError}
              </div>
            )}

            <div className="code-hint">
              {t('party.codeHint')}
            </div>

            <div className="code-validation">
              <div className={`validation-item ${lobbyCode.length >= 6 ? 'valid' : 'invalid'}`}>
                {lobbyCode.length >= 6 ? '✅' : '⭕'} {t('party.validation.codeLength')}
              </div>
              <div className={`validation-item ${/^[A-Z0-9]*$/.test(lobbyCode) ? 'valid' : 'invalid'}`}>
                {/^[A-Z0-9]*$/.test(lobbyCode) ? '✅' : '⭕'} {t('party.validation.codeFormat')}
              </div>
            </div>
          </div>

          <div className="lobby-discovery">
            <h3>{t('party.lobbyDiscovery')}</h3>
            <div className="discovery-info">
              <div className="info-item">
                <span className="info-icon">🔍</span>
                <span>{t('party.discoveryTip1')}</span>
              </div>
              <div className="info-item">
                <span className="info-icon">👥</span>
                <span>{t('party.discoveryTip2')}</span>
              </div>
              <div className="info-item">
                <span className="info-icon">⚡</span>
                <span>{t('party.discoveryTip3')}</span>
              </div>
            </div>
          </div>

          <div className="player-info">
            <h3>{t('party.playerInfo')}</h3>
            <div className="player-card">
              <div className="player-avatar">👤</div>
              <div className="player-details">
                <div className="player-name">{playerName}</div>
                <div className="player-id">ID: {playerId ? String(playerId).slice(0, 8) : 'N/A'}...</div>
                <div className="player-status">
                  <span className="status-indicator ready">●</span>
                  {t('party.playerReady')}
                </div>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button
              className="join-lobby-button"
              onClick={handleJoinLobby}
              disabled={lobbyCode.trim().length !== 6 || isJoining || !/^[A-Z0-9]{6}$/.test(lobbyCode)}
            >
              {isJoining ? (
                <>⏳ {t('party.joining')}</>
              ) : (
                <>🎮 {t('party.joinTournament')}</>
              )}
            </button>
            <button
              className="back-button"
              onClick={() => {
                setMode('select');
                setLobbyCode('');
                setJoinError(null);
              }}
              disabled={isJoining}
            >
              {t('common.back')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default PartyModeMenu;