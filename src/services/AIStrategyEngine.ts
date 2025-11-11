import {
  AIStrategyEngine as IAIStrategyEngine,
  AIStrategy,
  Round,
  Decision,
} from '../types';

// Base interface for AI strategy implementations
export interface BaseAIStrategy {
  execute(history: Round[]): Decision;
  getName(): string;
  getDescription(): string;
}

// Loyal AI Strategy - always stays silent
export class LoyalStrategy implements BaseAIStrategy {
  execute(history: Round[]): Decision {
    return Decision.STAY_SILENT;
  }

  getName(): string {
    return 'Loyal';
  }

  getDescription(): string {
    return 'Always chooses to stay silent, demonstrating unwavering loyalty';
  }
}

// Adaptive AI Strategy - mirrors the player's previous choice
export class AdaptiveStrategy implements BaseAIStrategy {
  execute(history: Round[]): Decision {
    if (history.length === 0) {
      // First round - default to staying silent
      return Decision.STAY_SILENT;
    }

    // Get the last round and find the human player's decision
    const lastRound = history[history.length - 1];
    const humanDecision = lastRound.decisions.find(
      (d) => !d.playerId.includes('ai')
    );

    if (humanDecision) {
      return humanDecision.decision;
    }

    // Fallback to staying silent if no human decision found
    return Decision.STAY_SILENT;
  }

  getName(): string {
    return 'Adaptive';
  }

  getDescription(): string {
    return "Mirrors the opponent's previous decision, adapting to their behavior";
  }
}

// Fearful AI Strategy - always confesses
export class FearfulStrategy implements BaseAIStrategy {
  execute(history: Round[]): Decision {
    return Decision.CONFESS;
  }

  getName(): string {
    return 'Fearful';
  }

  getDescription(): string {
    return 'Always chooses to confess, driven by fear and self-preservation';
  }
}

// Manipulative AI Strategy - pretends to cooperate but often betrays
export class ManipulativeStrategy implements BaseAIStrategy {
  private betrayalProbability = 0.7; // 70% chance to betray
  private cooperationStreak = 0;

  execute(history: Round[]): Decision {
    // Start with cooperation to build false trust
    if (history.length === 0) {
      this.cooperationStreak = 1;
      return Decision.STAY_SILENT;
    }

    // If we've been cooperating for 2+ rounds, high chance to betray
    if (
      this.cooperationStreak >= 2 &&
      Math.random() < this.betrayalProbability
    ) {
      this.cooperationStreak = 0;
      return Decision.CONFESS;
    }

    // Otherwise, continue building trust
    this.cooperationStreak++;
    return Decision.STAY_SILENT;
  }

  getName(): string {
    return 'Manipulative';
  }

  getDescription(): string {
    return 'Builds trust through cooperation, then betrays at strategic moments';
  }
}

// Random AI Strategy - completely unpredictable
export class RandomStrategy implements BaseAIStrategy {
  execute(history: Round[]): Decision {
    return Math.random() < 0.5 ? Decision.STAY_SILENT : Decision.CONFESS;
  }

  getName(): string {
    return 'Random';
  }

  getDescription(): string {
    return 'Makes completely random decisions, impossible to predict';
  }
}

// Grudge AI Strategy - never forgives betrayal
export class GrudgeStrategy implements BaseAIStrategy {
  private hasBeenBetrayed = false;

  execute(history: Round[]): Decision {
    // Check if we've ever been betrayed
    if (!this.hasBeenBetrayed) {
      for (const round of history) {
        const humanDecision = round.decisions.find(
          (d) => !d.playerId.includes('AI')
        );
        if (humanDecision && humanDecision.decision === Decision.CONFESS) {
          this.hasBeenBetrayed = true;
          break;
        }
      }
    }

    // If betrayed, always confess from now on
    if (this.hasBeenBetrayed) {
      return Decision.CONFESS;
    }

    // Otherwise, cooperate
    return Decision.STAY_SILENT;
  }

  getName(): string {
    return 'Grudge';
  }

  getDescription(): string {
    return 'Cooperates until betrayed, then never forgives';
  }
}

// Strategy Factory for creating AI opponents
export class AIStrategyFactory {
  private static strategies: Map<AIStrategy, BaseAIStrategy> = new Map([
    [AIStrategy.LOYAL, new LoyalStrategy()],
    [AIStrategy.ADAPTIVE, new AdaptiveStrategy()],
    [AIStrategy.FEARFUL, new FearfulStrategy()],
    [AIStrategy.MANIPULATIVE, new ManipulativeStrategy()],
    [AIStrategy.RANDOM, new RandomStrategy()],
    [AIStrategy.GRUDGE, new GrudgeStrategy()],
  ]);

  static createStrategy(strategyType: AIStrategy): BaseAIStrategy {
    const strategy = this.strategies.get(strategyType);
    if (!strategy) {
      throw new Error(`Unknown AI strategy: ${strategyType}`);
    }
    return strategy;
  }

  static getAvailableStrategies(): AIStrategy[] {
    return Array.from(this.strategies.keys());
  }

  static getStrategyInfo(strategyType: AIStrategy): {
    name: string;
    description: string;
  } {
    const strategy = this.createStrategy(strategyType);
    return {
      name: strategy.getName(),
      description: strategy.getDescription(),
    };
  }
}

// AIStrategyEngine implementation
export class AIStrategyEngine implements IAIStrategyEngine {
  executeStrategy(strategy: AIStrategy, history: Round[]): Decision {
    const strategyInstance = AIStrategyFactory.createStrategy(strategy);
    return strategyInstance.execute(history);
  }

  getAvailableStrategies(): AIStrategy[] {
    return AIStrategyFactory.getAvailableStrategies();
  }
}
