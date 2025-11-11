import {
  AIStrategyEngine,
  AIStrategyFactory,
  LoyalStrategy,
  AdaptiveStrategy,
  FearfulStrategy,
} from '../AIStrategyEngine';
import {
  AIStrategy,
  Decision,
  Round,
  GamePhase,
  PlayerDecision,
} from '../../types';

describe('AIStrategyEngine', () => {
  let aiEngine: AIStrategyEngine;

  beforeEach(() => {
    aiEngine = new AIStrategyEngine();
  });

  describe('getAvailableStrategies', () => {
    it('should return all available AI strategies', () => {
      const strategies = aiEngine.getAvailableStrategies();
      expect(strategies).toContain(AIStrategy.LOYAL);
      expect(strategies).toContain(AIStrategy.ADAPTIVE);
      expect(strategies).toContain(AIStrategy.FEARFUL);
      expect(strategies).toHaveLength(3);
    });
  });

  describe('executeStrategy', () => {
    const createMockRound = (
      roundNumber: number,
      humanDecision: Decision,
      aiDecision: Decision
    ): Round => ({
      roundNumber,
      decisions: [
        {
          playerId: 'human-player',
          decision: humanDecision,
          timestamp: new Date(),
          canReverse: false,
        },
        {
          playerId: 'ai-player',
          decision: aiDecision,
          timestamp: new Date(),
          canReverse: false,
        },
      ],
      results: { playerA: 0, playerB: 0 },
      timestamp: new Date(),
      phaseType: GamePhase.TRUST_PHASE,
    });

    it('should execute loyal strategy correctly', () => {
      const history: Round[] = [
        createMockRound(1, Decision.CONFESS, Decision.STAY_SILENT),
        createMockRound(2, Decision.CONFESS, Decision.STAY_SILENT),
      ];

      const decision = aiEngine.executeStrategy(AIStrategy.LOYAL, history);
      expect(decision).toBe(Decision.STAY_SILENT);
    });

    it('should execute fearful strategy correctly', () => {
      const history: Round[] = [
        createMockRound(1, Decision.STAY_SILENT, Decision.CONFESS),
        createMockRound(2, Decision.STAY_SILENT, Decision.CONFESS),
      ];

      const decision = aiEngine.executeStrategy(AIStrategy.FEARFUL, history);
      expect(decision).toBe(Decision.CONFESS);
    });

    it('should execute adaptive strategy correctly with history', () => {
      const history: Round[] = [
        createMockRound(1, Decision.CONFESS, Decision.STAY_SILENT),
      ];

      const decision = aiEngine.executeStrategy(AIStrategy.ADAPTIVE, history);
      expect(decision).toBe(Decision.CONFESS);
    });

    it('should execute adaptive strategy with no history (first round)', () => {
      const decision = aiEngine.executeStrategy(AIStrategy.ADAPTIVE, []);
      expect(decision).toBe(Decision.STAY_SILENT);
    });
  });
});

describe('AIStrategyFactory', () => {
  describe('createStrategy', () => {
    it('should create loyal strategy instance', () => {
      const strategy = AIStrategyFactory.createStrategy(AIStrategy.LOYAL);
      expect(strategy).toBeInstanceOf(LoyalStrategy);
    });

    it('should create adaptive strategy instance', () => {
      const strategy = AIStrategyFactory.createStrategy(AIStrategy.ADAPTIVE);
      expect(strategy).toBeInstanceOf(AdaptiveStrategy);
    });

    it('should create fearful strategy instance', () => {
      const strategy = AIStrategyFactory.createStrategy(AIStrategy.FEARFUL);
      expect(strategy).toBeInstanceOf(FearfulStrategy);
    });

    it('should throw error for unknown strategy', () => {
      expect(() => {
        AIStrategyFactory.createStrategy('unknown' as AIStrategy);
      }).toThrow('Unknown AI strategy: unknown');
    });
  });

  describe('getAvailableStrategies', () => {
    it('should return all available strategies', () => {
      const strategies = AIStrategyFactory.getAvailableStrategies();
      expect(strategies).toEqual([
        AIStrategy.LOYAL,
        AIStrategy.ADAPTIVE,
        AIStrategy.FEARFUL,
      ]);
    });
  });

  describe('getStrategyInfo', () => {
    it('should return strategy info for loyal strategy', () => {
      const info = AIStrategyFactory.getStrategyInfo(AIStrategy.LOYAL);
      expect(info.name).toBe('Loyal');
      expect(info.description).toContain('Always chooses to stay silent');
    });

    it('should return strategy info for adaptive strategy', () => {
      const info = AIStrategyFactory.getStrategyInfo(AIStrategy.ADAPTIVE);
      expect(info.name).toBe('Adaptive');
      expect(info.description).toContain('Mirrors the opponent');
    });

    it('should return strategy info for fearful strategy', () => {
      const info = AIStrategyFactory.getStrategyInfo(AIStrategy.FEARFUL);
      expect(info.name).toBe('Fearful');
      expect(info.description).toContain('Always chooses to confess');
    });
  });
});

describe('Individual AI Strategies', () => {
  const createMockRound = (
    roundNumber: number,
    humanDecision: Decision
  ): Round => ({
    roundNumber,
    decisions: [
      {
        playerId: 'human-player',
        decision: humanDecision,
        timestamp: new Date(),
        canReverse: false,
      },
    ],
    results: { playerA: 0, playerB: 0 },
    timestamp: new Date(),
    phaseType: GamePhase.TRUST_PHASE,
  });

  describe('LoyalStrategy', () => {
    let strategy: LoyalStrategy;

    beforeEach(() => {
      strategy = new LoyalStrategy();
    });

    it('should always return STAY_SILENT regardless of history', () => {
      expect(strategy.execute([])).toBe(Decision.STAY_SILENT);

      const history = [
        createMockRound(1, Decision.CONFESS),
        createMockRound(2, Decision.CONFESS),
        createMockRound(3, Decision.CONFESS),
      ];

      expect(strategy.execute(history)).toBe(Decision.STAY_SILENT);
    });

    it('should have correct name and description', () => {
      expect(strategy.getName()).toBe('Loyal');
      expect(strategy.getDescription()).toContain(
        'Always chooses to stay silent'
      );
    });
  });

  describe('AdaptiveStrategy', () => {
    let strategy: AdaptiveStrategy;

    beforeEach(() => {
      strategy = new AdaptiveStrategy();
    });

    it('should return STAY_SILENT on first round (no history)', () => {
      expect(strategy.execute([])).toBe(Decision.STAY_SILENT);
    });

    it("should mirror human player's previous decision", () => {
      const historyWithConfess = [createMockRound(1, Decision.CONFESS)];
      expect(strategy.execute(historyWithConfess)).toBe(Decision.CONFESS);

      const historyWithSilent = [createMockRound(1, Decision.STAY_SILENT)];
      expect(strategy.execute(historyWithSilent)).toBe(Decision.STAY_SILENT);
    });

    it('should use most recent human decision when multiple rounds exist', () => {
      const history = [
        createMockRound(1, Decision.STAY_SILENT),
        createMockRound(2, Decision.CONFESS),
      ];

      expect(strategy.execute(history)).toBe(Decision.CONFESS);
    });

    it('should have correct name and description', () => {
      expect(strategy.getName()).toBe('Adaptive');
      expect(strategy.getDescription()).toContain('Mirrors the opponent');
    });
  });

  describe('FearfulStrategy', () => {
    let strategy: FearfulStrategy;

    beforeEach(() => {
      strategy = new FearfulStrategy();
    });

    it('should always return CONFESS regardless of history', () => {
      expect(strategy.execute([])).toBe(Decision.CONFESS);

      const history = [
        createMockRound(1, Decision.STAY_SILENT),
        createMockRound(2, Decision.STAY_SILENT),
        createMockRound(3, Decision.STAY_SILENT),
      ];

      expect(strategy.execute(history)).toBe(Decision.CONFESS);
    });

    it('should have correct name and description', () => {
      expect(strategy.getName()).toBe('Fearful');
      expect(strategy.getDescription()).toContain('Always chooses to confess');
    });
  });
});
