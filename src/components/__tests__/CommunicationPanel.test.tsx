import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CommunicationPanel from '../CommunicationPanel';
import { CommunicationMessage, PredefinedMessage } from '../../types';

const mockMessages: CommunicationMessage[] = [
  {
    id: '1',
    playerId: 'player1',
    message: PredefinedMessage.TRUST,
    timestamp: new Date('2023-01-01T10:00:00Z'),
  },
  {
    id: '2',
    playerId: 'player2',
    message: PredefinedMessage.FEAR,
    timestamp: new Date('2023-01-01T10:00:30Z'),
  },
];

const defaultProps = {
  messages: mockMessages,
  timeRemaining: 45,
  onSendMessage: jest.fn(),
  predefinedMessages: [
    PredefinedMessage.TRUST,
    PredefinedMessage.FEAR,
    PredefinedMessage.RISK,
  ],
};

describe('CommunicationPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render communication panel with correct title', () => {
    render(<CommunicationPanel {...defaultProps} />);

    expect(screen.getByText('Communication Phase')).toBeInTheDocument();
  });

  it('should display correct time remaining', () => {
    render(<CommunicationPanel {...defaultProps} />);

    expect(screen.getByText('00:45')).toBeInTheDocument();
  });

  it('should display messages correctly', () => {
    render(<CommunicationPanel {...defaultProps} />);

    // Check for messages in the message list specifically
    const messageItems = screen.getAllByText('Trust');
    expect(messageItems.length).toBeGreaterThan(0);

    expect(screen.getByText('Player player1')).toBeInTheDocument();
    expect(screen.getByText('Player player2')).toBeInTheDocument();

    // Check that both message types are displayed
    expect(screen.getAllByText('Trust')).toHaveLength(2); // One in message, one in button
    expect(screen.getAllByText('Fear')).toHaveLength(2); // One in message, one in button
  });

  it('should show message count', () => {
    render(<CommunicationPanel {...defaultProps} />);

    expect(screen.getByText('Messages (2)')).toBeInTheDocument();
  });

  it('should render predefined message buttons', () => {
    render(<CommunicationPanel {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Trust/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fear/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Risk/i })).toBeInTheDocument();
  });

  it('should call onSendMessage when button is clicked', () => {
    const mockOnSendMessage = jest.fn();
    render(
      <CommunicationPanel {...defaultProps} onSendMessage={mockOnSendMessage} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Trust/i }));

    expect(mockOnSendMessage).toHaveBeenCalledWith(PredefinedMessage.TRUST);
  });

  it('should disable buttons when time is up', () => {
    render(<CommunicationPanel {...defaultProps} timeRemaining={0} />);

    const trustButton = screen.getByRole('button', { name: /Trust/i });
    const fearButton = screen.getByRole('button', { name: /Fear/i });
    const riskButton = screen.getByRole('button', { name: /Risk/i });

    expect(trustButton).toBeDisabled();
    expect(fearButton).toBeDisabled();
    expect(riskButton).toBeDisabled();
  });

  it('should show phase ended message when time is up', () => {
    render(<CommunicationPanel {...defaultProps} timeRemaining={0} />);

    expect(screen.getByText('Communication phase ended')).toBeInTheDocument();
  });

  it('should show no messages text when messages array is empty', () => {
    render(<CommunicationPanel {...defaultProps} messages={[]} />);

    expect(
      screen.getByText('No messages yet. Use the buttons below to communicate.')
    ).toBeInTheDocument();
  });

  it('should not call onSendMessage when button is clicked and time is up', () => {
    const mockOnSendMessage = jest.fn();
    render(
      <CommunicationPanel
        {...defaultProps}
        onSendMessage={mockOnSendMessage}
        timeRemaining={0}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Trust/i }));

    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });
});
