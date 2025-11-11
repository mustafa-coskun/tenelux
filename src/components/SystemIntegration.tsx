import React, { useState, useEffect } from 'react';
import { IntegrationService } from '../services/IntegrationService';
import {
  GameMode,
  AIStrategy,
  GameSession,
  SessionResult,
  GamePhase,
} from '../types';
import { User } from '../services/UserService';
import { MainMenu } from './MainMenu';
import { SinglePlayerGame } from './SinglePlayerGame';
import { MultiplayerGame } from './MultiplayerGame';
import StatisticsPanel from './StatisticsPanel';
import AtmosphericEffects from './AtmosphericEffects';

enum AppState {
  INITIALIZING = 'initializing',
  MAIN_MENU = 'main_menu',
  SINGLE_PLAYER = 'single_player',
  MULTIPLAYER = 'multiplayer',
  STATISTICS = 'statistics',
  ERROR = 'error',
}

interface SystemIntegrationProps {
  playerName?: string;
}

export const SystemIntegration: React.FC<SystemIntegrationProps> = ({
  playerName = 'Player',
}) => {
  const [appState, setAppState] = useState<AppState>(AppState.INITIALIZING);
  const [integrationService, setIntegrationService] =
    useState<IntegrationService | null>(null);
  const [currentSession, setCurrentSession] = useState<GameSession | null>(
    null
  );
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);

  // Initialize integration service
  useEffect(() => {
    const initializeSystem = async () => {
      try {
        const service = new IntegrationService();
        await service.initialize();
        setIntegrationService(service);
        setSystemStatus(service.getSystemStatus());
        setAppState(AppState.MAIN_MENU);
      } catch (err) {
        console.error('Failed to initialize system:', err);
        setError('Failed to initialize game system');
        setAppState(AppState.ERROR);
      }
    };

    initializeSystem();

    // Cleanup on unmount
    return () => {
      if (integrationService) {
        integrationService.cleanup().catch(console.error);
      }
    };
  }, []);

  // Handle mode selection from main menu
  const handleModeSelect = async (mode: GameMode) => {
    if (!integrationService) {
      setError('System not initialized');
      return;
    }

    try {
      setError(null);

      if (mode === GameMode.SINGLE_PLAYER) {
        setAppState(AppState.SINGLE_PLAYER);
      } else if (mode === GameMode.MULTIPLAYER) {
        setAppState(AppState.MULTIPLAYER);
      }
    } catch (err) {
      console.error('Failed to start game mode:', err);
      setError('Failed to start game');
    }
  };

  // Handle single-player game start
  const handleSinglePlayerStart = async (aiStrategy: AIStrategy) => {
    if (!integrationService) {
      setError('System not initialized');
      return;
    }

    try {
      const session = await integrationService.startSinglePlayerGame(
        playerName,
        aiStrategy,
        {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
        }
      );

      setCurrentSession(session);
      setError(null);
    } catch (err) {
      console.error('Failed to start single-player game:', err);
      setError('Failed to start single-player game');
    }
  };

  // Handle multiplayer game start
  const handleMultiplayerStart = async (opponentName: string) => {
    if (!integrationService) {
      setError('System not initialized');
      return;
    }

    try {
      const session = await integrationService.startMultiplayerGame(
        playerName,
        opponentName,
        {
          maxRounds: 10,
          trustPhaseRounds: 5,
          communicationTimeLimit: 60,
          allowDecisionReversal: true,
        }
      );

      setCurrentSession(session);
      setError(null);
    } catch (err) {
      console.error('Failed to start multiplayer game:', err);
      setError('Failed to start multiplayer game');
    }
  };

  // Handle game completion
  const handleGameEnd = async (session: GameSession) => {
    if (!integrationService) {
      setError('System not initialized');
      return;
    }

    try {
      const result = await integrationService.completeGameSession(session);
      setSessionResult(result);
      setCurrentSession(null);
      setAppState(AppState.STATISTICS);

      // Update system status
      setSystemStatus(integrationService.getSystemStatus());
    } catch (err) {
      console.error('Failed to complete game:', err);
      setError('Failed to complete game');
    }
  };

  // Handle back to menu
  const handleBackToMenu = () => {
    setCurrentSession(null);
    setSessionResult(null);
    setError(null);
    setAppState(AppState.MAIN_MENU);
  };

  // Handle statistics close
  const handleStatisticsClose = () => {
    setSessionResult(null);
    setAppState(AppState.MAIN_MENU);
  };

  // Render loading state
  if (appState === AppState.INITIALIZING) {
    return (
      <div className="system-integration initializing">
        <AtmosphericEffects currentPhase={GamePhase.TRUST_PHASE} />
        <div className="loading-container">
          <h2>Initializing Tenebris...</h2>
          <div className="loading-spinner"></div>
          <p>Setting up game systems...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (appState === AppState.ERROR) {
    return (
      <div className="system-integration error">
        <AtmosphericEffects currentPhase={GamePhase.TRUST_PHASE} />
        <div className="error-container">
          <h2>System Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>
            Restart Application
          </button>
        </div>
      </div>
    );
  }

  // Render main application
  return (
    <div className="system-integration">
      <AtmosphericEffects currentPhase={GamePhase.TRUST_PHASE} />

      {/* System Status Indicator (for debugging) */}
      {process.env.NODE_ENV === 'development' && systemStatus && (
        <div className="system-status">
          <div className="status-indicator">
            <span
              className={systemStatus.database ? 'status-ok' : 'status-error'}
            >
              DB: {systemStatus.database ? '✓' : '✗'}
            </span>
            <span
              className={
                systemStatus.multiplayer ? 'status-ok' : 'status-warning'
              }
            >
              MP: {systemStatus.multiplayer ? '✓' : '○'}
            </span>
            <span
              className={
                systemStatus.activeSession ? 'status-ok' : 'status-inactive'
              }
            >
              Session: {systemStatus.activeSession ? '✓' : '○'}
            </span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Main Content */}
      {appState === AppState.MAIN_MENU && (
        <MainMenu onModeSelect={handleModeSelect} />
      )}

      {appState === AppState.SINGLE_PLAYER && (
        <SinglePlayerGame
          humanPlayer={{
            id: 'human',
            name: playerName,
            isAI: false,
            trustScore: 50,
            totalGamesPlayed: 0,
            createdAt: new Date(),
          }}
          onGameEnd={handleBackToMenu}
        />
      )}

      {appState === AppState.MULTIPLAYER && (
        <MultiplayerGame
          humanPlayer={{
            id: 'human',
            username: playerName,
            displayName: playerName,
            avatar: '👤',
            createdAt: new Date(),
            lastActive: new Date(),
            isGuest: true,
            stats: {
              totalGames: 0,
              wins: 0,
              losses: 0,
              cooperations: 0,
              betrayals: 0,
              totalScore: 0,
              winRate: 0,
              trustScore: 50,
              betrayalRate: 0,
              averageScore: 0,
              longestWinStreak: 0,
              currentWinStreak: 0,
              gamesThisWeek: 0,
              gamesThisMonth: 0,
            },
            friends: [],
            friendRequests: {
              sent: [],
              received: []
            },
            achievements: [],
            preferences: {
              matchmakingRegion: 'global' as const,
              trustScoreMatching: true,
              allowFriendRequests: true
            }
          }}
          onGameEnd={handleBackToMenu}
        />
      )}

      {appState === AppState.STATISTICS && sessionResult && (
        <div className="statistics-view">
          <StatisticsPanel
            session={sessionResult.session}
            statistics={sessionResult.statistics}
          />
          <div className="statistics-actions">
            <button onClick={handleStatisticsClose} className="back-button">
              Back to Menu
            </button>
            <button
              onClick={() => {
                setSessionResult(null);
                setAppState(AppState.SINGLE_PLAYER);
              }}
              className="play-again-button"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
