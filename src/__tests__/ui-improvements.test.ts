import { describe, it, expect } from '@jest/globals';
import { SinglePlayerManager } from '../services/SinglePlayerManager';
import { PlayerManager } from '../services/PlayerManager';
import { AIStrategy } from '../types';

describe('UI Improvements Tests', () => {
  let singlePlayerManager: SinglePlayerManager;
  let playerManager: PlayerManager;

  beforeEach(() => {
    singlePlayerManager = new SinglePlayerManager();
    playerManager = new PlayerManager();
  });

  describe('AI Player Naming', () => {
    it('should create AI players with anonymous names instead of strategy names', () => {
      const humanPlayer = playerManager.createPlayer('TestPlayer', false);

      // Test different AI strategies
      const strategies = [
        AIStrategy.LOYAL,
        AIStrategy.ADAPTIVE,
        AIStrategy.FEARFUL,
        AIStrategy.MANIPULATIVE,
        AIStrategy.RANDOM,
        AIStrategy.GRUDGE,
      ];

      strategies.forEach((strategy) => {
        const session = singlePlayerManager.createSinglePlayerSession(
          humanPlayer,
          strategy
        );

        const aiPlayer = session.players.find((p) => p.isAI);
        expect(aiPlayer).toBeDefined();

        if (aiPlayer) {
          // AI player name should NOT contain strategy name
          expect(aiPlayer.name).not.toContain('manipulative');
          expect(aiPlayer.name).not.toContain('loyal');
          expect(aiPlayer.name).not.toContain('adaptive');
          expect(aiPlayer.name).not.toContain('fearful');
          expect(aiPlayer.name).not.toContain('random');
          expect(aiPlayer.name).not.toContain('grudge');

          // AI player name should be anonymous format (e.g., "Agent-1234")
          expect(aiPlayer.name).toMatch(
            /^(Agent|Subject|Entity|Unit|Player)-\d{4}$/
          );
        }

        // Clean up for next test
        singlePlayerManager.endSession();
      });
    });

    it('should generate different anonymous names for different AI players', () => {
      const humanPlayer = playerManager.createPlayer('TestPlayer', false);

      const session1 = singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.LOYAL
      );
      const aiPlayer1 = session1.players.find((p) => p.isAI);
      singlePlayerManager.endSession();

      const session2 = singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.ADAPTIVE
      );
      const aiPlayer2 = session2.players.find((p) => p.isAI);
      singlePlayerManager.endSession();

      expect(aiPlayer1).toBeDefined();
      expect(aiPlayer2).toBeDefined();

      if (aiPlayer1 && aiPlayer2) {
        // Names should be different (very high probability with random generation)
        expect(aiPlayer1.name).not.toBe(aiPlayer2.name);
      }
    });
  });

  describe('Phase Display Simplification', () => {
    it('should create sessions with proper configuration for round display', () => {
      const humanPlayer = playerManager.createPlayer('TestPlayer', false);
      const session = singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.LOYAL
      );

      // Session should have maxRounds configuration
      expect(session.sessionConfig.maxRounds).toBeDefined();
      expect(typeof session.sessionConfig.maxRounds).toBe('number');
      expect(session.sessionConfig.maxRounds).toBeGreaterThan(0);

      // Default should be 10 rounds
      expect(session.sessionConfig.maxRounds).toBe(10);

      singlePlayerManager.endSession();
    });

    it('should allow custom round configuration', () => {
      const humanPlayer = playerManager.createPlayer('TestPlayer', false);
      const customConfig = { maxRounds: 15 };

      const session = singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.LOYAL,
        customConfig
      );

      expect(session.sessionConfig.maxRounds).toBe(15);

      singlePlayerManager.endSession();
    });
  });
});
