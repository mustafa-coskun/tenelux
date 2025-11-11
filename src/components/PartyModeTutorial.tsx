import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './PartyModeTutorial.css';

interface PartyModeTutorialProps {
  onClose: () => void;
  onStartCreate?: () => void;
  onStartJoin?: () => void;
}

interface TutorialStep {
  id: string;
  title: string;
  content: string;
  image?: string;
  tips?: string[];
}

export const PartyModeTutorial: React.FC<PartyModeTutorialProps> = ({
  onClose,
  onStartCreate,
  onStartJoin
}) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);

  const tutorialSteps: TutorialStep[] = [
    {
      id: 'welcome',
      title: t('tutorial.welcome.title'),
      content: t('tutorial.welcome.content'),
      tips: [
        t('tutorial.welcome.tips.0'),
        t('tutorial.welcome.tips.1'),
        t('tutorial.welcome.tips.2'),
        t('tutorial.welcome.tips.3')
      ]
    },
    {
      id: 'creating',
      title: t('tutorial.creating.title'),
      content: t('tutorial.creating.content'),
      tips: [
        t('tutorial.creating.tips.0'),
        t('tutorial.creating.tips.1'),
        t('tutorial.creating.tips.2'),
        t('tutorial.creating.tips.3')
      ]
    },
    {
      id: 'joining',
      title: t('tutorial.joining.title'),
      content: t('tutorial.joining.content'),
      tips: [
        t('tutorial.joining.tips.0'),
        t('tutorial.joining.tips.1'),
        t('tutorial.joining.tips.2'),
        t('tutorial.joining.tips.3')
      ]
    },
    {
      id: 'formats',
      title: t('tutorial.formats.title'),
      content: t('tutorial.formats.content'),
      tips: [
        t('tutorial.formats.tips.0'),
        t('tutorial.formats.tips.1'),
        t('tutorial.formats.tips.2'),
        t('tutorial.formats.tips.3')
      ]
    },
    {
      id: 'gameplay',
      title: t('tutorial.gameplay.title'),
      content: t('tutorial.gameplay.content'),
      tips: [
        t('tutorial.gameplay.tips.0'),
        t('tutorial.gameplay.tips.1'),
        t('tutorial.gameplay.tips.2'),
        t('tutorial.gameplay.tips.3')
      ]
    },
    {
      id: 'statistics',
      title: t('tutorial.statistics.title'),
      content: t('tutorial.statistics.content'),
      tips: [
        t('tutorial.statistics.tips.0'),
        t('tutorial.statistics.tips.1'),
        t('tutorial.statistics.tips.2'),
        t('tutorial.statistics.tips.3')
      ]
    }
  ];

  const currentTutorialStep = tutorialSteps[currentStep];

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    setCurrentStep(stepIndex);
  };

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-modal">
        <div className="tutorial-header">
          <h2>🏆 {t('partyModeInfo.tutorialTitle')}</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="tutorial-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${((currentStep + 1) / tutorialSteps.length) * 100}%` }}
            />
          </div>
          <div className="step-indicators">
            {tutorialSteps.map((step, index) => (
              <button
                key={step.id}
                className={`step-indicator ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
                onClick={() => handleStepClick(index)}
                title={step.title}
              >
                {index < currentStep ? '✓' : index + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="tutorial-content">
          <div className="step-header">
            <h3>{currentTutorialStep.title}</h3>
            <span className="step-counter">
              {t('tutorial.navigation.stepOf', { current: currentStep + 1, total: tutorialSteps.length })}
            </span>
          </div>

          <div className="step-body">
            <p className="step-description">{currentTutorialStep.content}</p>

            {currentTutorialStep.tips && (
              <div className="step-tips">
                <h4>💡 Key Points:</h4>
                <ul>
                  {currentTutorialStep.tips.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="tutorial-navigation">
          <div className="nav-left">
            <button
              className="nav-button secondary"
              onClick={handlePrevious}
              disabled={currentStep === 0}
            >
              ← {t('tutorial.navigation.previous')}
            </button>
          </div>

          <div className="nav-center">
            {currentStep === tutorialSteps.length - 1 && (
              <div className="quick-actions">
                <button
                  className="quick-action-button create"
                  onClick={() => {
                    onClose();
                    onStartCreate?.();
                  }}
                >
                  🏆 {t('tutorial.navigation.createTournament')}
                </button>
                <button
                  className="quick-action-button join"
                  onClick={() => {
                    onClose();
                    onStartJoin?.();
                  }}
                >
                  🎮 {t('tutorial.navigation.joinTournament')}
                </button>
              </div>
            )}
          </div>

          <div className="nav-right">
            {currentStep < tutorialSteps.length - 1 ? (
              <button
                className="nav-button primary"
                onClick={handleNext}
              >
                {t('tutorial.navigation.next')} →
              </button>
            ) : (
              <button
                className="nav-button primary"
                onClick={onClose}
              >
                {t('tutorial.navigation.getStarted')}
              </button>
            )}
          </div>
        </div>

        <div className="tutorial-footer">
          <div className="help-links">
            <button className="help-link" onClick={onClose}>
              {t('tutorial.navigation.skip')}
            </button>
            <span className="separator">•</span>
            <button className="help-link" onClick={() => setCurrentStep(0)}>
              {t('tutorial.navigation.restart')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartyModeTutorial;