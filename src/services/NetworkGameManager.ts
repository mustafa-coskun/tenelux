import { v4 as uuidv4 } from 'uuid';
import {
  NetworkGameManager as INetworkGameManager,
  GameMatch,
  NetworkGameState,
  NetworkMessage,
  NetworkMessageType,
} from '../types/network';
import {
  GameSession,
  Player,
  Decision,
  PlayerDecision,
  GamePhase,
  SessionConfig,
  GameMode,
  Round,
} from '../types';
import { ConnectionManager } from './ConnectionManager';
import { GameEngine } from './GameEngine';
import { SessionManager } from './SessionManager';

export interface NetworkGameSession {
  session: GameSession;
  connectedPlayers: Set<string>;
  disconnectedPlayers: Set<string>;
  pendingDecisions: Map<string, PlayerDecision>;
  lastSyncTime: Date;
  phaseStartTime: Date;
  phaseTimeoutId?: NodeJS.Timeout;
}

export class NetworkGameManager implements INetworkGameManager {
  private activeSessions: Map<string, NetworkGameSession> = new Map();
  private connectionManager: ConnectionManager;
  private gameEngine: GameEngine;
  private sessionManagers: Map<string, SessionManager> = new Map();
  private readonly DECISION_TIMEOUT = 30000; // 30 seconds
  private readonly COMMUNICATION_TIMEOUT = 60000; // 60 seconds
  private readonly RECONNECTION_TIMEOUT = 120000; // 2 minutes

  constructor(connectionManager: ConnectionManager, gameEngine: GameEngine) {
    this.connectionManager = connectionManager;
    this.gameEngine = gameEngine;
  }

  createNetworkSession(match: GameMatch): GameSession {
    const sessionConfig: SessionConfig = {
      maxRounds: 10,
      trustPhaseRounds: 5,
      communicationTimeLimit: 60,
      allowDecisionReversal: true,
      gameMode: GameMode.MULTIPLAYER,
    };

    // Create game session
    const session = this.gameEngine.startSession(
      match.players,
      GameMode.MULTIPLAYER
    );

    // Create session manager
    const sessionManager = new SessionManager();
    sessionManager.createSession(sessionConfig);
    this.sessionManagers.set(session.id, sessionManager);

    // Create network session
    const networkSession: NetworkGameSession = {
      session,
      connectedPlayers: new Set(match.players.map((p) => p.id)),
      disconnectedPlayers: new Set(),
      pendingDecisions: new Map(),
      lastSyncTime: new Date(),
      phaseStartTime: new Date(),
    };

    this.activeSessions.set(session.id, networkSession);

    // Notify players about session start
    this.broadcastToSession(session.id, {
      type: NetworkMessageType.SESSION_START,
      payload: {
        sessionId: session.id,
        gameState: this.createGameState(networkSession),
      },
      timestamp: new Date(),
    });

    // Start phase timer
    this.startPhaseTimer(session.id);

    console.log(`Network game session created: ${session.id}`);
    return session;
  }

  handlePlayerDecision(
    sessionId: string,
    playerId: string,
    decision: Decision
  ): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      console.error(`Session not found: ${sessionId}`);
      return;
    }

    const sessionManager = this.sessionManagers.get(sessionId);
    if (!sessionManager) {
      console.error(`Session manager not found: ${sessionId}`);
      return;
    }

    // Check if player is connected
    if (!networkSession.connectedPlayers.has(playerId)) {
      console.error(`Player ${playerId} not connected to session ${sessionId}`);
      return;
    }

    // Create player decision
    const playerDecision: PlayerDecision = {
      playerId,
      decision,
      timestamp: new Date(),
      canReverse:
        sessionManager.getCurrentPhase() !== GamePhase.DECISION_REVERSAL_PHASE,
    };

    // Store pending decision
    networkSession.pendingDecisions.set(playerId, playerDecision);

    // Notify other players about decision received (without revealing the decision)
    this.broadcastToSession(
      sessionId,
      {
        type: NetworkMessageType.WAITING_FOR_OPPONENT,
        payload: {
          playerId,
          hasDecided: true,
          waitingFor: this.getWaitingPlayers(networkSession),
        },
        timestamp: new Date(),
      },
      playerId
    );

    // Confirm decision to the player
    this.connectionManager.sendToPlayer(playerId, {
      type: NetworkMessageType.PLAYER_DECISION,
      payload: {
        status: 'received',
        decision,
        canReverse: playerDecision.canReverse,
      },
      timestamp: new Date(),
    });

    // Check if all players have decided
    if (this.allPlayersDecided(networkSession)) {
      this.processRoundDecisions(sessionId);
    }
  }

  handleCommunicationMessage(
    sessionId: string,
    playerId: string,
    message: string
  ): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    const sessionManager = this.sessionManagers.get(sessionId);
    if (!sessionManager || !sessionManager.isCommunicationPhaseActive()) {
      this.connectionManager.sendToPlayer(playerId, {
        type: NetworkMessageType.ERROR,
        payload: {
          code: 'INVALID_PHASE',
          message: 'Communication not allowed in current phase',
        },
        timestamp: new Date(),
      });
      return;
    }

    // Send communication message
    const communicationMessage = sessionManager.sendCommunicationMessage(
      playerId,
      message as any
    );

    // Broadcast to all players in session
    this.broadcastToSession(sessionId, {
      type: NetworkMessageType.COMMUNICATION_MESSAGE,
      payload: {
        message: communicationMessage,
        timeRemaining: sessionManager.getCommunicationTimeRemaining(),
      },
      timestamp: new Date(),
    });
  }

  handlePlayerDisconnection(sessionId: string, playerId: string): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    // Move player to disconnected set
    networkSession.connectedPlayers.delete(playerId);
    networkSession.disconnectedPlayers.add(playerId);

    console.log(`Player ${playerId} disconnected from session ${sessionId}`);

    // Notify remaining players
    this.broadcastToSession(sessionId, {
      type: NetworkMessageType.DISCONNECT,
      payload: {
        playerId,
        status: 'disconnected',
        reconnectionTimeLimit: this.RECONNECTION_TIMEOUT,
      },
      timestamp: new Date(),
    });

    // Start reconnection timeout
    setTimeout(() => {
      this.handleReconnectionTimeout(sessionId, playerId);
    }, this.RECONNECTION_TIMEOUT);

    // Pause game if needed
    this.pauseGameIfNeeded(sessionId);
  }

  handlePlayerReconnection(sessionId: string, playerId: string): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    // Move player back to connected set
    networkSession.disconnectedPlayers.delete(playerId);
    networkSession.connectedPlayers.add(playerId);

    console.log(`Player ${playerId} reconnected to session ${sessionId}`);

    // Send current game state to reconnected player
    this.connectionManager.sendToPlayer(playerId, {
      type: NetworkMessageType.RECONNECT,
      payload: {
        status: 'reconnected',
        gameState: this.createGameState(networkSession),
      },
      timestamp: new Date(),
    });

    // Notify other players
    this.broadcastToSession(
      sessionId,
      {
        type: NetworkMessageType.RECONNECT,
        payload: {
          playerId,
          status: 'reconnected',
        },
        timestamp: new Date(),
      },
      playerId
    );

    // Resume game if it was paused
    this.resumeGameIfNeeded(sessionId);
  }

  synchronizeGameState(sessionId: string): NetworkGameState {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const gameState = this.createGameState(networkSession);
    networkSession.lastSyncTime = new Date();

    // Broadcast updated state to all connected players
    this.broadcastToSession(sessionId, {
      type: NetworkMessageType.GAME_STATE_UPDATE,
      payload: { gameState },
      timestamp: new Date(),
    });

    return gameState;
  }

  private createGameState(
    networkSession: NetworkGameSession
  ): NetworkGameState {
    const sessionManager = this.sessionManagers.get(networkSession.session.id);

    return {
      session: networkSession.session,
      waitingForDecisions: Array.from(networkSession.connectedPlayers).filter(
        (playerId) => !networkSession.pendingDecisions.has(playerId)
      ),
      communicationMessages: sessionManager?.getCommunicationMessages() || [],
      phaseTimeRemaining: this.getPhaseTimeRemaining(networkSession),
    };
  }

  private processRoundDecisions(sessionId: string): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    const decisions = Array.from(networkSession.pendingDecisions.values());

    // Process round through game engine
    const roundResult = this.gameEngine.processRound(decisions);

    // Update session
    networkSession.session.rounds.push(roundResult.round);
    networkSession.pendingDecisions.clear();

    // Broadcast round result
    this.broadcastToSession(sessionId, {
      type: NetworkMessageType.ROUND_RESULT,
      payload: {
        round: roundResult.round,
        gameEnded: roundResult.gameEnded,
        winner: roundResult.winner,
      },
      timestamp: new Date(),
    });

    // Check if game ended
    if (roundResult.gameEnded) {
      this.endSession(sessionId, roundResult.winner);
    } else {
      // Advance to next phase/round
      this.advancePhase(sessionId);
    }
  }

  private allPlayersDecided(networkSession: NetworkGameSession): boolean {
    return (
      networkSession.connectedPlayers.size ===
      networkSession.pendingDecisions.size
    );
  }

  private getWaitingPlayers(networkSession: NetworkGameSession): string[] {
    return Array.from(networkSession.connectedPlayers).filter(
      (playerId) => !networkSession.pendingDecisions.has(playerId)
    );
  }

  private startPhaseTimer(sessionId: string): void {
    const networkSession = this.activeSessions.get(sessionId);
    const sessionManager = this.sessionManagers.get(sessionId);

    if (!networkSession || !sessionManager) {
      return;
    }

    // Clear existing timeout
    if (networkSession.phaseTimeoutId) {
      clearTimeout(networkSession.phaseTimeoutId);
    }

    const currentPhase = sessionManager.getCurrentPhase();
    let timeout: number;

    switch (currentPhase) {
      case GamePhase.TRUST_PHASE:
        timeout = this.DECISION_TIMEOUT;
        break;
      case GamePhase.COMMUNICATION_PHASE:
        timeout = this.COMMUNICATION_TIMEOUT;
        break;
      case GamePhase.DECISION_REVERSAL_PHASE:
        timeout = this.DECISION_TIMEOUT;
        break;
      default:
        timeout = this.DECISION_TIMEOUT;
    }

    networkSession.phaseTimeoutId = setTimeout(() => {
      this.handlePhaseTimeout(sessionId);
    }, timeout);

    networkSession.phaseStartTime = new Date();
  }

  private handlePhaseTimeout(sessionId: string): void {
    const networkSession = this.activeSessions.get(sessionId);
    const sessionManager = this.sessionManagers.get(sessionId);

    if (!networkSession || !sessionManager) {
      return;
    }

    console.log(`Phase timeout for session ${sessionId}`);

    // Handle timeout based on current phase
    const currentPhase = sessionManager.getCurrentPhase();

    if (
      currentPhase === GamePhase.TRUST_PHASE ||
      currentPhase === GamePhase.DECISION_REVERSAL_PHASE
    ) {
      // Auto-decide for players who haven't decided
      this.autoDecideForMissingPlayers(sessionId);
    } else {
      // Advance phase
      this.advancePhase(sessionId);
    }
  }

  private autoDecideForMissingPlayers(sessionId: string): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    // Auto-decide "STAY_SILENT" for players who haven't decided
    networkSession.connectedPlayers.forEach((playerId) => {
      if (!networkSession.pendingDecisions.has(playerId)) {
        const autoDecision: PlayerDecision = {
          playerId,
          decision: Decision.STAY_SILENT,
          timestamp: new Date(),
          canReverse: false,
        };

        networkSession.pendingDecisions.set(playerId, autoDecision);

        // Notify player about auto-decision
        this.connectionManager.sendToPlayer(playerId, {
          type: NetworkMessageType.PLAYER_DECISION,
          payload: {
            status: 'auto_decided',
            decision: Decision.STAY_SILENT,
            reason: 'timeout',
          },
          timestamp: new Date(),
        });
      }
    });

    // Process round
    this.processRoundDecisions(sessionId);
  }

  private advancePhase(sessionId: string): void {
    const sessionManager = this.sessionManagers.get(sessionId);
    if (!sessionManager) {
      return;
    }

    sessionManager.advancePhase();
    const newPhase = sessionManager.getCurrentPhase();

    // Broadcast phase change
    this.broadcastToSession(sessionId, {
      type: NetworkMessageType.PHASE_CHANGE,
      payload: {
        newPhase,
        timeLimit: this.getPhaseTimeLimit(newPhase),
      },
      timestamp: new Date(),
    });

    // Start new phase timer
    this.startPhaseTimer(sessionId);
  }

  private getPhaseTimeLimit(phase: GamePhase): number {
    switch (phase) {
      case GamePhase.TRUST_PHASE:
        return this.DECISION_TIMEOUT;
      case GamePhase.COMMUNICATION_PHASE:
        return this.COMMUNICATION_TIMEOUT;
      case GamePhase.DECISION_REVERSAL_PHASE:
        return this.DECISION_TIMEOUT;
      default:
        return this.DECISION_TIMEOUT;
    }
  }

  private getPhaseTimeRemaining(networkSession: NetworkGameSession): number {
    const sessionManager = this.sessionManagers.get(networkSession.session.id);
    if (!sessionManager) {
      return 0;
    }

    const currentPhase = sessionManager.getCurrentPhase();
    const phaseLimit = this.getPhaseTimeLimit(currentPhase);
    const elapsed =
      new Date().getTime() - networkSession.phaseStartTime.getTime();

    return Math.max(0, phaseLimit - elapsed);
  }

  private pauseGameIfNeeded(sessionId: string): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    // Pause if no players are connected
    if (networkSession.connectedPlayers.size === 0) {
      if (networkSession.phaseTimeoutId) {
        clearTimeout(networkSession.phaseTimeoutId);
        networkSession.phaseTimeoutId = undefined;
      }
      console.log(
        `Game paused for session ${sessionId} - no connected players`
      );
    }
  }

  private resumeGameIfNeeded(sessionId: string): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    // Resume if players are connected and game was paused
    if (
      networkSession.connectedPlayers.size > 0 &&
      !networkSession.phaseTimeoutId
    ) {
      this.startPhaseTimer(sessionId);
      console.log(`Game resumed for session ${sessionId}`);
    }
  }

  private handleReconnectionTimeout(sessionId: string, playerId: string): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    // Check if player is still disconnected
    if (networkSession.disconnectedPlayers.has(playerId)) {
      console.log(
        `Player ${playerId} failed to reconnect to session ${sessionId} - ending game`
      );

      // End session due to abandonment
      this.endSession(sessionId, undefined, 'player_abandoned');
    }
  }

  private endSession(
    sessionId: string,
    winner?: Player,
    reason?: string
  ): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    // Clear phase timeout
    if (networkSession.phaseTimeoutId) {
      clearTimeout(networkSession.phaseTimeoutId);
    }

    // End session through game engine
    const sessionResult = this.gameEngine.endSession(networkSession.session);

    // Broadcast session end
    this.broadcastToSession(sessionId, {
      type: NetworkMessageType.SESSION_END,
      payload: {
        sessionResult,
        winner: winner || sessionResult.winner,
        reason: reason || 'completed',
      },
      timestamp: new Date(),
    });

    // Cleanup
    this.activeSessions.delete(sessionId);
    this.sessionManagers.delete(sessionId);

    console.log(
      `Network game session ended: ${sessionId}, Winner: ${winner?.name || 'None'}`
    );
  }

  private broadcastToSession(
    sessionId: string,
    message: NetworkMessage,
    excludePlayerId?: string
  ): void {
    const networkSession = this.activeSessions.get(sessionId);
    if (!networkSession) {
      return;
    }

    const playerIds = Array.from(networkSession.connectedPlayers).filter(
      (playerId) => playerId !== excludePlayerId
    );

    this.connectionManager.broadcastToPlayers(playerIds, message);
  }

  // Public methods for external management
  getActiveSession(sessionId: string): NetworkGameSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getAllActiveSessions(): NetworkGameSession[] {
    return Array.from(this.activeSessions.values());
  }

  getSessionStats(): {
    activeSessions: number;
    totalPlayers: number;
    connectedPlayers: number;
  } {
    const sessions = Array.from(this.activeSessions.values());
    const totalPlayers = sessions.reduce(
      (sum, session) => sum + session.session.players.length,
      0
    );
    const connectedPlayers = sessions.reduce(
      (sum, session) => sum + session.connectedPlayers.size,
      0
    );

    return {
      activeSessions: sessions.length,
      totalPlayers,
      connectedPlayers,
    };
  }
}
