import React from 'react';
import { AIStrategy } from '../types';
import { AIStrategyFactory } from '../services/AIStrategyEngine';
import './AIStrategySelection.css';

interface AIStrategySelectionProps {
  onStrategySelect: (strategy: AIStrategy) => void;
  selectedStrategy?: AIStrategy;
}

export const AIStrategySelection: React.FC<AIStrategySelectionProps> = ({
  onStrategySelect,
  selectedStrategy,
}) => {
  const availableStrategies = AIStrategyFactory.getAvailableStrategies();

  const handleStrategyClick = (strategy: AIStrategy) => {
    onStrategySelect(strategy);
  };

  return (
    <div className="ai-strategy-selection">
      <h2 className="strategy-title">Choose Your Opponent</h2>
      <p className="strategy-subtitle">
        Select an AI strategy to face in the interrogation room
      </p>

      <div className="strategy-grid">
        {availableStrategies.map((strategy) => {
          const strategyInfo = AIStrategyFactory.getStrategyInfo(strategy);
          const isSelected = selectedStrategy === strategy;

          return (
            <div
              key={strategy}
              className={`strategy-card ${isSelected ? 'selected' : ''}`}
              onClick={() => handleStrategyClick(strategy)}
            >
              <div className="strategy-header">
                <h3 className="strategy-name">{strategyInfo.name}</h3>
                <div className="strategy-type">{strategy.toUpperCase()}</div>
              </div>

              <p className="strategy-description">{strategyInfo.description}</p>

              <div className="strategy-behavior">
                <strong>Behavior:</strong>
                <span className="behavior-text">
                  {strategy === AIStrategy.LOYAL && 'Always stays silent'}
                  {strategy === AIStrategy.ADAPTIVE &&
                    'Mirrors your previous choice'}
                  {strategy === AIStrategy.FEARFUL && 'Always confesses'}
                </span>
              </div>

              {isSelected && (
                <div className="selected-indicator">
                  <span>✓ Selected</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="strategy-warning">
        <p>
          ⚠️ Choose wisely. Your opponent's strategy will determine their
          behavior throughout the interrogation.
        </p>
      </div>
    </div>
  );
};
