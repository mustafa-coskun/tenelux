import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './CommunicationPanel.css';

interface CommunicationPanelProps {
  onSendMessage?: (message: string) => void;
  messages?: Array<{ playerId: string; message: string; timestamp: Date }>;
  isActive?: boolean;
  currentPlayerId?: string;
}

const CommunicationPanel: React.FC<CommunicationPanelProps> = ({
  onSendMessage,
  messages = [],
  isActive = false,
  currentPlayerId,
}) => {
  const { t } = useTranslation();

  // Always show the panel, but disable when not active

  const predefinedMessages = [
    { key: 'trust', text: t('communication.messages.trust') },
    { key: 'betray', text: t('communication.messages.betray') },
    { key: 'uncertain', text: t('communication.messages.uncertain') },
    { key: 'threat', text: t('communication.messages.threat') },
    { key: 'promise', text: t('communication.messages.promise') },
  ];

  const getPlayerDisplayName = (playerId: string) => {
    if (playerId === currentPlayerId) {
      return t('gameBoard.you');
    }
    return t('gameBoard.opponent');
  };

  return (
    <div className="communication-panel">
      <h3>{t('communication.sendMessage')}</h3>
      <div className="messages">
        {messages.length === 0 ? (
          <p className="no-messages">{t('communication.noMessages')}</p>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className="message">
              <span className="player">
                {getPlayerDisplayName(msg.playerId)}:
              </span>
              <span className="text">{msg.message}</span>
            </div>
          ))
        )}
      </div>
      <div className="message-input">
        <div className="message-buttons">
          {predefinedMessages.map((msg) => (
            <button
              key={msg.key}
              className="message-btn"
              onClick={() => onSendMessage?.(msg.text)}
            >
              {msg.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommunicationPanel;
