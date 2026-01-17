import React, { useState, useEffect } from 'react';
import { GameMode } from '../types';
import { useTranslation, SupportedLanguage } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import { User } from '../services/UserService';
import { Leaderboard } from './Leaderboard';
import { BackgroundEffects } from './BackgroundEffects';
import { ProfileScreen } from './ProfileScreen';
import { ConnectionDebug } from './ConnectionDebug';
import { getEnvironmentService } from '../config/environment';
import { AdBanner } from './AdBanner';
import { AdPlacement } from '../services/AdService';
import { HowToPlayVideo } from './HowToPlayVideo';
import teneluxLongBg from '../assets/tenelux_long.png';
import teneluxWideBg from '../assets/tenelux_wide.png';
// import { MultiplayerTestPanel } from './MultiplayerTestPanel';
import './MainMenu.css';

interface MainMenuProps {
  onModeSelect: (mode: GameMode) => void;
  onLogout?: () => void;
  currentUser?: User | null;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onModeSelect,
  onLogout,
  currentUser
}) => {
  const { t, currentLanguage, changeLanguage, supportedLanguages } =
    useTranslation();
  const { isMobile, isTablet, isDesktop, width } = useViewportSize();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const envService = getEnvironmentService();

  // Choose background based on screen size
  const getBackgroundImage = () => {
    const isWideScreen = width >= 1200;
    const isMobileView = width <= 768;

    if (isWideScreen) {
      return teneluxWideBg;
    } else if (isMobileView) {
      return teneluxLongBg;
    } else {
      return teneluxWideBg;
    }
  };

  return (
    <div
      className={`main-menu with-background ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''} ${isDesktop ? 'desktop' : ''}`}
      style={{
        backgroundImage: `
          linear-gradient(
            135deg, 
            rgba(10, 10, 10, 0.6) 0%, 
            rgba(26, 26, 26, 0.7) 50%, 
            rgba(13, 13, 13, 0.6) 100%
          ),
          url(${getBackgroundImage()})
        `
      }}
    >
      <BackgroundEffects variant="menu" />
      
      {/* Top Navigation Bar */}
      <div className="menu-navigation">
        {/* User Info and Logout */}
        {currentUser && (
          <div className="user-info">
          <button
            className="user-button"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            {currentUser.avatar} {currentUser.displayName}
            {currentUser.isGuest && <span className="guest-badge">{t('userMenu.guest')}</span>}
          </button>
          {showUserMenu && (
            <div className="user-dropdown">
              <div className="user-details">
                <p><strong>{t('userMenu.displayName')}</strong> {currentUser.displayName}</p>
                {!currentUser.isGuest && (
                  <p><small>{t('userMenu.username')} @{currentUser.username}</small></p>
                )}
                {currentUser.isGuest ? (
                  <p><small className="guest-warning">⚠️ {t('userMenu.guestWarning')}</small></p>
                ) : (
                  <>
                    <p><small>{t('userMenu.lastLogin')} {new Date(currentUser.lastActive).toLocaleString('tr-TR')}</small></p>
                    <p><small>{t('userMenu.trustScore')} {currentUser.stats.trustScore}/100</small></p>
                    <p><small>{t('userMenu.totalGames')} {currentUser.stats.totalGames}</small></p>
                  </>
                )}
              </div>

              {!currentUser.isGuest && (
                <button
                  className="profile-button"
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowProfile(true);
                  }}
                >
                  ⚙️ {t('userMenu.editProfile')}
                </button>
              )}

              {currentUser.isGuest && (
                <button
                  className="login-prompt-button"
                  onClick={() => {
                    setShowUserMenu(false);
                    if (onLogout) onLogout(); // Logout to show auth screen
                  }}
                >
                  🔐 {t('userMenu.createAccount')}
                </button>
              )}

              {onLogout && (
                <button
                  className="logout-button"
                  onClick={() => {
                    setShowUserMenu(false);
                    onLogout();
                  }}
                >
                  🚪 {t('userMenu.logout')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Language Selector */}
      <div className="language-selector">
        <button
          className="language-button"
          onClick={() => setShowLanguageMenu(!showLanguageMenu)}
        >
          🌐 {supportedLanguages[currentLanguage]}
        </button>
        {showLanguageMenu && (
          <div className="language-dropdown">
            {Object.entries(supportedLanguages).map(([code, name]) => (
              <button
                key={code}
                className={`language-option ${code === currentLanguage ? 'active' : ''}`}
                onClick={() => {
                  changeLanguage(code as SupportedLanguage);
                  setShowLanguageMenu(false);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Debug Toggle (Development) */}
      {envService.isDev() && (
        <div className="debug-toggle">
          <button
            className="debug-button"
            onClick={() => setShowDebug(!showDebug)}
          >
            🔧 Debug
          </button>
        </div>
      )}
      </div>

      <header className="menu-header">
        <h1 className="tenelux-title size-large">TENELUX</h1>
        <p className="tenelux-subtitle size-large">SHADOWS OF PACTA</p>
        <p className="game-tagline">{t('mainMenu.tagline')}</p>
      </header>

      <main className="menu-content">
        <div className="game-description">
          <p>{t('mainMenu.description')}</p>
        </div>

        <div className="mode-selection">
          <h2>{t('mainMenu.chooseYourPath')}</h2>

          <div className="mode-buttons">
            <button
              className="mode-btn single-player-btn"
              onClick={() => onModeSelect(GameMode.SINGLE_PLAYER)}
            >
              <div className="mode-icon">🤖</div>
              <div className="mode-info">
                <h3>{t('menu.singlePlayer')}</h3>
                <p>{t('mainMenu.faceAIOpponents')}</p>
                <span className="mode-status">{t('mainMenu.available')}</span>
              </div>
            </button>

            <button
              className="mode-btn multiplayer-btn"
              onClick={() => onModeSelect(GameMode.MULTIPLAYER)}
            >
              <div className="mode-icon">👥</div>
              <div className="mode-info">
                <h3>{t('menu.multiplayer')}</h3>
                <p>{t('mainMenu.challengeRealPlayers')}</p>
                <span className="mode-status">{t('mainMenu.available')}</span>
              </div>
            </button>

            <button
              className="mode-btn party-btn"
              onClick={() => onModeSelect('party' as GameMode)}
            >
              <div className="mode-icon">🏆</div>
              <div className="mode-info">
                <h3>{t('party.partyMode')}</h3>
                <p>{t('partyModeInfo.description')}</p>
                <span className="mode-status">{t('mainMenu.available')}</span>
              </div>
            </button>

            {/* <button
              className="mode-btn test-btn"
              onClick={() => setShowTestPanel(true)}
            >
              <div className="mode-icon">🧪</div>
              <div className="mode-info">
                <h3>Multiplayer Test</h3>
                <p>Test with multiple devices</p>
                <span className="mode-status">Local Network</span>
              </div>
            </button> */}
          </div>

          <div className="leaderboard-section">
            <button
              className="leaderboard-main-btn"
              onClick={() => setShowLeaderboard(true)}
            >
              🏆 {t('userMenu.leaderboardButton')}
            </button>
          </div>
        </div>

        <div className="game-rules">
          <h3>{t('mainMenu.theRules')}</h3>
          
          {/* How to Play Video */}
          <HowToPlayVideo key={`video-${currentLanguage}`} />
          
          <ul>
            <li>{t('mainMenu.rule1')}</li>
            <li>
              {t('mainMenu.rule2', {
                confess: t('game.confess'),
                staySilent: t('game.staySilent'),
              })}
            </li>
            <li>{t('mainMenu.rule3')}</li>
            <li>{t('mainMenu.rule4')}</li>
            <li>{t('mainMenu.rule5')}</li>
          </ul>
        </div>

        {/* Advertisement */}
        <div className="main-menu-ad">
          <AdBanner placement={AdPlacement.MAIN_MENU} />
        </div>
      </main>

      {/* Leaderboard */}
      {showLeaderboard && (
        <Leaderboard
          onClose={() => setShowLeaderboard(false)}
          currentUser={currentUser || null}
        />
      )}

      {/* Profile Screen */}
      {showProfile && currentUser && !currentUser.isGuest && (
        <ProfileScreen
          onClose={() => setShowProfile(false)}
          currentUser={currentUser}
        />
      )}

      {/* Connection Debug */}
      <ConnectionDebug isVisible={showDebug} />

      {/* Multiplayer Test Panel */}
      {/* {showTestPanel && (
        <MultiplayerTestPanel onClose={() => setShowTestPanel(false)} />
      )} */}
    </div>
  );
};