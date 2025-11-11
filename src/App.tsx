import React, { useState, useEffect } from 'react';
import './styles/globals.css';
import { GameMode, Player } from './types';
import { User } from './services/UserService';
import { MainMenu } from './components/MainMenu';
import { SinglePlayerGame } from './components/SinglePlayerGame';
import { MultiplayerGame } from './components/MultiplayerGame';
import PartyGame from './components/PartyGame';
import { ServerAuthScreen } from './components/ServerAuthScreen';

import { getServerUserService } from './services/ServerUserService';
import { getBackgroundService } from './services/BackgroundService';

enum AppState {
  AUTH = 'auth',
  MAIN_MENU = 'main_menu',
  SINGLE_PLAYER = 'single_player',
  MULTIPLAYER = 'multiplayer',
  PARTY = 'party',
}

function App() {
  const [appState, setAppState] = useState<AppState>(AppState.AUTH);
  const [currentPlayer, setCurrentPlayer] = useState<User | null>(null);
  const serverUserService = getServerUserService();
  const backgroundService = getBackgroundService();

  // Convert User to Player for components that still use Player type
  const userToPlayer = (user: User): Player => ({
    id: String(user.id), // Convert to string to match Player interface
    name: user.displayName || user.username,
    isAI: false,
    trustScore: user.stats?.trustScore || 50,
    totalGamesPlayed: user.stats?.totalGames || 0,
    createdAt: user.createdAt,
  });

  useEffect(() => {
    // Initialize backgrounds
    backgroundService.initializeBackgrounds();
  }, [backgroundService]);

  useEffect(() => {
    // Sayfa yüklendiğinde kullanıcı durumunu kontrol et
    const checkAuthStatus = () => {
      console.log('🎮 Checking authentication status...');

      const user = serverUserService.getCurrentUser();
      const isLoggedIn = serverUserService.isLoggedIn();

      console.log('🎮 Current user:', user);
      console.log('🎮 Is logged in:', isLoggedIn);

      // Daha sıkı authentication kontrolü
      if (user && isLoggedIn && user.displayName && user.id) {
        // Kullanıcı zaten giriş yapmış, ana menüye git
        setCurrentPlayer(user);
        setAppState(AppState.MAIN_MENU);
        console.log('🎮 User already authenticated:', user);
      } else {
        // Kullanıcı giriş yapmamış veya eksik veri var, auth ekranına yönlendir
        console.log('🎮 No valid authentication found, showing auth screen');
        serverUserService.explicitLogout(); // Eksik verileri temizle
        setAppState(AppState.AUTH);
      }
    };

    checkAuthStatus();
  }, [serverUserService]);

  const handleModeSelect = (mode: GameMode) => {
    console.log('🎮 Mode selected:', mode, 'Type:', typeof mode);
    console.log('🎮 GameMode.PARTY:', GameMode.PARTY, 'Type:', typeof GameMode.PARTY);
    console.log('🎮 Comparison:', mode === GameMode.PARTY);

    // String comparison ile kontrol et
    const modeStr = mode.toString();

    if (modeStr === 'single_player') {
      console.log('🎮 Switching to SINGLE_PLAYER');
      setAppState(AppState.SINGLE_PLAYER);
    } else if (modeStr === 'multiplayer') {
      console.log('🎮 Switching to MULTIPLAYER');
      setAppState(AppState.MULTIPLAYER);
    } else if (modeStr === 'party') {
      console.log('🎮 Switching to PARTY');
      setAppState(AppState.PARTY);
    } else {
      console.warn('Unknown game mode:', mode, 'Available modes:', Object.values(GameMode));
    }
  };

  const handleAuthSuccess = () => {
    const user = serverUserService.getCurrentUser();
    if (user) {
      setCurrentPlayer(user);
      setAppState(AppState.MAIN_MENU);
      console.log('🎮 Authentication successful, user:', user);
    }
  };

  const handleBackToMenu = () => {
    setAppState(AppState.MAIN_MENU);
  };

  const handleLogout = async () => {
    try {
      await serverUserService.logout();
      setCurrentPlayer(null);
      setAppState(AppState.AUTH);
      console.log('🎮 User logged out');
    } catch (error) {
      console.error('Logout failed:', error);
      // Force logout even on error
      setCurrentPlayer(null);
      setAppState(AppState.AUTH);
    }
  };

  const renderCurrentView = () => {
    switch (appState) {
      case AppState.AUTH:
        return <ServerAuthScreen onAuthSuccess={handleAuthSuccess} />;

      case AppState.MAIN_MENU:
        return (
          <MainMenu
            onModeSelect={handleModeSelect}
            onLogout={handleLogout}
            currentUser={serverUserService.getCurrentUser()}
          />
        );

      case AppState.SINGLE_PLAYER:
        if (!currentPlayer) return <ServerAuthScreen onAuthSuccess={handleAuthSuccess} />;
        return (
          <SinglePlayerGame
            humanPlayer={userToPlayer(currentPlayer)}
            onGameEnd={handleBackToMenu}
          />
        );

      case AppState.MULTIPLAYER:
        if (!currentPlayer) return <ServerAuthScreen onAuthSuccess={handleAuthSuccess} />;
        return (
          <MultiplayerGame
            humanPlayer={currentPlayer}
            onGameEnd={handleBackToMenu}
          />
        );

      case AppState.PARTY:
        if (!currentPlayer) return <ServerAuthScreen onAuthSuccess={handleAuthSuccess} />;
        return (
          <PartyGame
            humanPlayer={currentPlayer}
            onGameEnd={handleBackToMenu}
          />
        );

      default:
        return <ServerAuthScreen onAuthSuccess={handleAuthSuccess} />;
    }
  };

  return <div className="App">{renderCurrentView()}</div>;
}

export default App;
