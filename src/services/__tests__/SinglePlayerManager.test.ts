import { SinglePlayerManager } from '../SinglePlayerManager';
import { PlayerManager } from '../PlayerManager';
import { AIStrategy, Decision } from '../../types';

describe('SinglePlayerManager', () => {
  let singlePlayerManager: SinglePlayerManager;
  let playerManager: PlayerManager;
  let humanPlayer: any;

  beforeEach(() => {
    singlePlayerManager = new SinglePlayerManager();
    playerManager = new PlayerManager();
    humanPlayer = playerManager.createPlayer('TestPlayer', false);
  });

  afterEach(() => {
    singlePlayerManager.cleanup();
  });

  describe('createSinglePlayerSession', () => {
    it('should create a session with human and AI players', () => {
      const session = singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.LOYAL
      );

      expect(session).toBeDefined();
      expect(session.players).toHaveLength(2);
      expect(session.sessionConfig.gameMode).toBe('single_player');
      expect(session.sessionConfig.aiStrategy).toBe(AIStrategy.LOYAL);
    });

    it('should create AI player with correct naming', () => {
      singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.ADAPTIVE
      );

      const aiPlayer = singlePlayerManager.getAIPlayer();
      expect(aiPlayer).toBeDefined();
      expect(aiPlayer!.name).toBe('AI-adaptive');
      expect(aiPlayer!.isAI).toBe(true);
    });
  });

  describe('getAvailableAIStrategies', () => {
    it('should return all available AI strategies', () => {
      const strategies = singlePlayerManager.getAvailableAIStrategies();

      expect(strategies).toContain(AIStrategy.LOYAL);
      expect(strategies).toContain(AIStrategy.ADAPTIVE);
      expect(strategies).toContain(AIStrategy.FEARFUL);
      expect(strategies).toHaveLength(3);
    });
  });

  describe('processRoundWithAI', () => {
    beforeEach(() => {
      singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.LOYAL
      );
    });

    it('should process round with human and AI decisions', () => {
      const humanDecision = {
        playerId: humanPlayer.id,
        decision: Decision.STAY_SILENT,
        timestamp: new Date(),
        canReverse: true,
      };

      const decisions = singlePlayerManager.processRoundWithAI(humanDecision);

      expect(decisions).toHaveLength(2);
      expect(decisions[0]).toBe(humanDecision);
      expect(decisions[1].playerId).toBe(singlePlayerManager.getAIPlayer()!.id);
      expect(decisions[1].decision).toBe(Decision.STAY_SILENT); // Loyal AI always stays silent
    });

    it('should throw error if no AI strategy configured', () => {
      const newManager = new SinglePlayerManager();
      const humanDecision = {
        playerId: humanPlayer.id,
        decision: Decision.CONFESS,
        timestamp: new Date(),
        canReverse: true,
      };

      expect(() => {
        newManager.processRoundWithAI(humanDecision);
      }).toThrow('No AI strategy or AI player configured');
    });
  });

  describe('getCurrentAIStrategy', () => {
    it('should return current AI strategy', () => {
      singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.FEARFUL
      );

      expect(singlePlayerManager.getCurrentAIStrategy()).toBe(
        AIStrategy.FEARFUL
      );
    });

    it('should return null when no session created', () => {
      expect(singlePlayerManager.getCurrentAIStrategy()).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should reset all state', () => {
      singlePlayerManager.createSinglePlayerSession(
        humanPlayer,
        AIStrategy.ADAPTIVE
      );

      expect(singlePlayerManager.getCurrentAIStrategy()).toBe(
        AIStrategy.ADAPTIVE
      );
      expect(singlePlayerManager.getAIPlayer()).toBeDefined();

      singlePlayerManager.cleanup();

      expect(singlePlayerManager.getCurrentAIStrategy()).toBeNull();
      expect(singlePlayerManager.getAIPlayer()).toBeNull();
    });
  });
});
