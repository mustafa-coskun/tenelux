import { CommunicationManager } from '../CommunicationManager';
import { PredefinedMessage } from '../../types';
import { GAME_CONSTANTS } from '../../utils/constants';

// Mock timers for testing
jest.useFakeTimers();

describe('CommunicationManager', () => {
  let communicationManager: CommunicationManager;

  beforeEach(() => {
    communicationManager = new CommunicationManager();
    jest.clearAllTimers();
  });

  afterEach(() => {
    communicationManager.reset();
  });

  describe('Communication Phase Lifecycle', () => {
    it('should start communication phase correctly', () => {
      const onTimeExpired = jest.fn();
      const onMessageReceived = jest.fn();

      communicationManager.startCommunicationPhase(
        onTimeExpired,
        onMessageReceived
      );

      expect(communicationManager.isPhaseActive()).toBe(true);
      expect(communicationManager.getTimeRemaining()).toBe(
        GAME_CONSTANTS.COMMUNICATION_TIME_LIMIT
      );
      expect(communicationManager.getMessages()).toHaveLength(0);
    });

    it('should throw error when starting already active phase', () => {
      communicationManager.startCommunicationPhase();

      expect(() => {
        communicationManager.startCommunicationPhase();
      }).toThrow('Communication phase is already active');
    });

    it('should stop communication phase correctly', () => {
      communicationManager.startCommunicationPhase();
      communicationManager.stopCommunicationPhase();

      expect(communicationManager.isPhaseActive()).toBe(false);
      expect(communicationManager.getTimeRemaining()).toBe(0);
    });

    it('should handle timer expiration', () => {
      const onTimeExpired = jest.fn();
      communicationManager.startCommunicationPhase(onTimeExpired);

      // Fast-forward time by 60 seconds
      jest.advanceTimersByTime(60000);

      expect(onTimeExpired).toHaveBeenCalled();
      expect(communicationManager.isPhaseActive()).toBe(false);
    });

    it('should countdown timer correctly', () => {
      communicationManager.startCommunicationPhase();

      expect(communicationManager.getTimeRemaining()).toBe(60);

      jest.advanceTimersByTime(5000);
      expect(communicationManager.getTimeRemaining()).toBe(55);

      jest.advanceTimersByTime(10000);
      expect(communicationManager.getTimeRemaining()).toBe(45);
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      communicationManager.startCommunicationPhase();
    });

    it('should send valid predefined messages', () => {
      const playerId = 'player1';
      const message = communicationManager.sendMessage(
        playerId,
        PredefinedMessage.TRUST
      );

      expect(message.playerId).toBe(playerId);
      expect(message.message).toBe(PredefinedMessage.TRUST);
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeInstanceOf(Date);
    });

    it('should store sent messages', () => {
      const playerId = 'player1';

      communicationManager.sendMessage(playerId, PredefinedMessage.TRUST);
      communicationManager.sendMessage(playerId, PredefinedMessage.FEAR);

      const messages = communicationManager.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].message).toBe(PredefinedMessage.TRUST);
      expect(messages[1].message).toBe(PredefinedMessage.FEAR);
    });

    it('should call onMessageReceived callback', () => {
      const onMessageReceived = jest.fn();
      communicationManager.reset();
      communicationManager.startCommunicationPhase(
        undefined,
        onMessageReceived
      );

      const message = communicationManager.sendMessage(
        'player1',
        PredefinedMessage.RISK
      );

      expect(onMessageReceived).toHaveBeenCalledWith(message);
    });

    it('should throw error when sending message during inactive phase', () => {
      communicationManager.stopCommunicationPhase();

      expect(() => {
        communicationManager.sendMessage('player1', PredefinedMessage.TRUST);
      }).toThrow('Communication phase is not active');
    });

    it('should validate predefined messages', () => {
      expect(() => {
        communicationManager.sendMessage(
          'player1',
          'InvalidMessage' as PredefinedMessage
        );
      }).toThrow('Invalid predefined message: InvalidMessage');
    });

    it('should filter messages by player', () => {
      communicationManager.sendMessage('player1', PredefinedMessage.TRUST);
      communicationManager.sendMessage('player2', PredefinedMessage.FEAR);
      communicationManager.sendMessage('player1', PredefinedMessage.RISK);

      const player1Messages =
        communicationManager.getMessagesFromPlayer('player1');
      const player2Messages =
        communicationManager.getMessagesFromPlayer('player2');

      expect(player1Messages).toHaveLength(2);
      expect(player2Messages).toHaveLength(1);
      expect(player1Messages[0].message).toBe(PredefinedMessage.TRUST);
      expect(player1Messages[1].message).toBe(PredefinedMessage.RISK);
      expect(player2Messages[0].message).toBe(PredefinedMessage.FEAR);
    });
  });

  describe('Predefined Messages', () => {
    it('should return all predefined messages', () => {
      const messages = communicationManager.getPredefinedMessages();

      expect(messages).toContain(PredefinedMessage.TRUST);
      expect(messages).toContain(PredefinedMessage.FEAR);
      expect(messages).toContain(PredefinedMessage.RISK);
      expect(messages).toHaveLength(3);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all state correctly', () => {
      communicationManager.startCommunicationPhase();
      communicationManager.sendMessage('player1', PredefinedMessage.TRUST);

      communicationManager.reset();

      expect(communicationManager.isPhaseActive()).toBe(false);
      expect(communicationManager.getTimeRemaining()).toBe(
        GAME_CONSTANTS.COMMUNICATION_TIME_LIMIT
      );
      expect(communicationManager.getMessages()).toHaveLength(0);
    });
  });
});
