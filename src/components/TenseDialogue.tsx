import React from 'react';
import { GamePhase } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import './TenseDialogue.css';

interface TenseDialogueProps {
  phase: GamePhase;
  roundNumber?: number;
  playerName?: string;
  isWaiting?: boolean;
}

const TenseDialogue: React.FC<TenseDialogueProps> = ({
  phase,
  roundNumber = 1,
  playerName = 'Subject',
  isWaiting = false,
}) => {
  const { t } = useTranslation();
  const getDialogueForPhase = () => {
    switch (phase) {
      case GamePhase.TRUST_PHASE:
        const trustDialogues = [
          t('tenseDialogue.interrogationRoom', { playerName }),
          t('tenseDialogue.authoritiesEvidence'),
          t('tenseDialogue.cooperationWarning'),
          t('tenseDialogue.partnerDecision'),
          t('tenseDialogue.trustLuxury'),
          t('tenseDialogue.clockTicking'),
          t('tenseDialogue.silenceGolden'),
        ];
        return trustDialogues[
          Math.min(roundNumber - 1, trustDialogues.length - 1)
        ];

      case GamePhase.COMMUNICATION_PHASE:
        return isWaiting
          ? t('tenseDialogue.waitingMessage')
          : t('tenseDialogue.communicationTime');

      case GamePhase.DECISION_REVERSAL_PHASE:
        return t('tenseDialogue.lastChance');

      default:
        return t('tenseDialogue.interrogationContinues');
    }
  };

  const getAtmosphericText = () => {
    const atmosphericTexts = [
      t('tenseDialogue.atmospheric.flickeringLight'),
      t('tenseDialogue.atmospheric.footsteps'),
      t('tenseDialogue.atmospheric.chairCreaks'),
      t('tenseDialogue.atmospheric.clockTicks'),
      t('tenseDialogue.atmospheric.heavyAir'),
      t('tenseDialogue.atmospheric.heartPounds'),
      t('tenseDialogue.atmospheric.wallsClosing'),
      t('tenseDialogue.atmospheric.timeMoves'),
    ];

    return atmosphericTexts[
      Math.floor(Math.random() * atmosphericTexts.length)
    ];
  };

  return (
    <div className="tense-dialogue">
      <div className="dialogue-main">
        <span className="dialogue-quote">"</span>
        {getDialogueForPhase()}
        <span className="dialogue-quote">"</span>
      </div>
      <div className="dialogue-atmospheric">
        <em>{getAtmosphericText()}</em>
      </div>
    </div>
  );
};

export default TenseDialogue;
