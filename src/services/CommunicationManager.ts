import { CommunicationMessage, PredefinedMessage } from '../types';
import { GAME_CONSTANTS } from '../utils/constants';

export class CommunicationManager {
  private messages: CommunicationMessage[] = [];
  private timer: NodeJS.Timeout | null = null;
  private timeRemaining: number = GAME_CONSTANTS.COMMUNICATION_TIME_LIMIT;
  private isActive: boolean = false;
  private onTimeExpired?: () => void;
  private onMessageReceived?: (message: CommunicationMessage) => void;

  constructor() {
    this.reset();
  }

  // Start the 60-second communication phase
  startCommunicationPhase(
    onTimeExpired?: () => void,
    onMessageReceived?: (message: CommunicationMessage) => void
  ): void {
    if (this.isActive) {
      throw new Error('Communication phase is already active');
    }

    this.isActive = true;
    this.timeRemaining = GAME_CONSTANTS.COMMUNICATION_TIME_LIMIT;
    this.onTimeExpired = onTimeExpired;
    this.onMessageReceived = onMessageReceived;
    this.messages = [];

    this.startTimer();
  }

  // Stop the communication phase
  stopCommunicationPhase(): void {
    this.isActive = false;
    this.clearTimer();
    this.timeRemaining = 0;
  }

  // Send a predefined message
  sendMessage(
    playerId: string,
    message: PredefinedMessage
  ): CommunicationMessage {
    const communicationMessage: CommunicationMessage = {
      id: this.generateMessageId(),
      playerId,
      message,
      timestamp: new Date(),
    };

    this.messages.push(communicationMessage);

    // Notify listeners of new message
    if (this.onMessageReceived) {
      this.onMessageReceived(communicationMessage);
    }

    return communicationMessage;
  }

  // Get all messages in the current communication phase
  getMessages(): CommunicationMessage[] {
    return [...this.messages];
  }

  // Get messages from a specific player
  getMessagesFromPlayer(playerId: string): CommunicationMessage[] {
    return this.messages.filter((msg) => msg.playerId === playerId);
  }

  // Get the remaining time in seconds
  getTimeRemaining(): number {
    return this.timeRemaining;
  }

  // Check if communication phase is active
  isPhaseActive(): boolean {
    return this.isActive;
  }

  // Get available predefined messages
  getPredefinedMessages(): PredefinedMessage[] {
    return Object.values(PredefinedMessage);
  }

  // Reset the communication manager
  reset(): void {
    this.clearTimer();
    this.messages = [];
    this.timeRemaining = GAME_CONSTANTS.COMMUNICATION_TIME_LIMIT;
    this.isActive = false;
    this.onTimeExpired = undefined;
    this.onMessageReceived = undefined;
  }

  // Private methods

  private startTimer(): void {
    this.clearTimer();

    this.timer = setInterval(() => {
      this.timeRemaining--;

      if (this.timeRemaining <= 0) {
        this.handleTimeExpired();
      }
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private handleTimeExpired(): void {
    this.stopCommunicationPhase();

    if (this.onTimeExpired) {
      this.onTimeExpired();
    }
  }

  private isValidPredefinedMessage(
    message: string
  ): message is PredefinedMessage {
    return Object.values(PredefinedMessage).includes(
      message as PredefinedMessage
    );
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
