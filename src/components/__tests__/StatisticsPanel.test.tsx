import React from 'react';
import { render, screen } from '@testing-library/react';
import StatisticsPanel from '../StatisticsPanel';
import {
  GameSession,
  Player,
  PlayerStatistics,
  Round,
  Decision,
  GamePhase,
  PayoffResult,
  PlayerDecision,
  GameMode,
} from '../../types';

describe('StatisticsPanel', () => {
  let mockPlayer1: Player;
  let mockPlayer2: Player;
  let mockSession: GameSession;
  let mockStatistics: PlayerStatistics;

  beforeEach(() => {
    mockPlayer1 = {
      id: 'player1',
      name: 'Alice',
      isAI: false,
      trustScore: 75,
      totalGamesPlayed: 5,
      createdAt: new Date(),
    };

    mockPlayer2 = {
      id: 'player2',
      name: 'Bob AI',
      isAI: true,
      trustScore: 60,
      totalGamesPlayed: 3,
      createdAt: new Date(),
    };

    const rounds: Round[] = [
      createMockRound(1, Decision.STAY_SILENT, Decision.CONFESS, {
        playerA: 0,
        playerB: 5,
      }),
      createMockRound(2, Decision.STAY_SILENT, Decision.STAY_SILENT, {
        playerA: 3,
        playerB: 3,
      }),
      createMockRound(3, Decision.CONFESS, Decision.STAY_SILENT, {
        playerA: 5,
        playerB: 0,
      }),
      createMockRound(4, Decision.STAY_SILENT, Decision.CONFESS, {
        playerA: 0,
        playerB: 5,
      }),
      createMockRound(5, Decision.STAY_SILENT, Decision.STAY_SILENT, {
        playerA: 3,
        playerB: 3,
      }),
    ];

    mockSession = {
      id: 'session_12345_abcdef',
      players: [mockPlayer1, mockPlayer2],
      rounds,
      currentPhase: GamePhase.TRUST_PHASE,
      startTime: new Date(),
      winner: mockPlayer1,
      sessionConfig: {
        maxRounds: 5,
        trustPhaseRounds: 5,
        communicationTimeLimit: 60,
        allowDecisionReversal: true,
        gameMode: GameMode.SINGLE_PLAYER,
      },
    };

    mockStatistics = {
      cooperationPercentage: 80,
      betrayalPercentage: 20,
      mostFearfulRound: 3,
      totalPoints: 11,
      gamesWon: 1,
      gamesLost: 0,
      averageTrustScore: 75,
    };
  });

  it('should render the statistics panel with correct title', () => {
    render(
      <StatisticsPanel statistics={mockStatistics} session={mockSession} />
    );

    expect(screen.getByText('Game Analysis')).toBeInTheDocument();
  });

  it('should display session information', () => {
    render(
      <StatisticsPanel statistics={mockStatistics} session={mockSession} />
    );

    expect(screen.getByText(/Session:/)).toBeInTheDocument();
    expect(screen.getByText('5 Rounds')).toBeInTheDocument();
  });

  it('should display statistics cards with correct values', () => {
    render(
      <StatisticsPanel statistics={mockStatistics} session={mockSession} />
    );

    // Check for labels to ensure we're looking at the right sections
    expect(screen.getByText('Cooperation')).toBeInTheDocument();
    expect(screen.getByText('Betrayal')).toBeInTheDocument();
    expect(screen.getByText('Total Points')).toBeInTheDocument();
    expect(screen.getByText('Trust Score')).toBeInTheDocument();

    // Check for values using more specific queries
    const cooperationCard = screen
      .getByText('Cooperation')
      .closest('.stat-card');
    expect(cooperationCard).toHaveTextContent('80%');

    const betrayalCard = screen.getByText('Betrayal').closest('.stat-card');
    expect(betrayalCard).toHaveTextContent('20%');

    const pointsCard = screen.getByText('Total Points').closest('.stat-card');
    expect(pointsCard).toHaveTextContent('11');

    const trustCard = screen.getByText('Trust Score').closest('.stat-card');
    expect(trustCard).toHaveTextContent('75');
  });

  it('should display comparative analysis', () => {
    render(
      <StatisticsPanel statistics={mockStatistics} session={mockSession} />
    );

    expect(screen.getByText('Performance Summary')).toBeInTheDocument();
    expect(
      screen.getByText('80% trustworthy, 20% betrayal rate')
    ).toBeInTheDocument();
  });

  it('should display most fearful round when available', () => {
    render(
      <StatisticsPanel statistics={mockStatistics} session={mockSession} />
    );

    expect(screen.getByText('Most fearful moment:')).toBeInTheDocument();
    expect(screen.getByText('Round 3')).toBeInTheDocument();
  });

  it('should not display fearful round when not available', () => {
    const statsWithoutFearfulRound = {
      ...mockStatistics,
      mostFearfulRound: undefined,
    };
    render(
      <StatisticsPanel
        statistics={statsWithoutFearfulRound}
        session={mockSession}
      />
    );

    expect(screen.queryByText('Most fearful moment:')).not.toBeInTheDocument();
  });

  it('should display decision pattern analysis', () => {
    render(
      <StatisticsPanel statistics={mockStatistics} session={mockSession} />
    );

    expect(screen.getByText('Decision Pattern')).toBeInTheDocument();
    expect(screen.getByText('Most common choice:')).toBeInTheDocument();
    expect(screen.getByText('Consistency:')).toBeInTheDocument();
    expect(screen.getByText('Cooperated')).toBeInTheDocument(); // Most common decision
  });

  it('should display round history visualization', () => {
    render(
      <StatisticsPanel statistics={mockStatistics} session={mockSession} />
    );

    expect(screen.getByText('Round History')).toBeInTheDocument();

    // Check for round numbers
    expect(screen.getByText('R1')).toBeInTheDocument();
    expect(screen.getByText('R2')).toBeInTheDocument();
    expect(screen.getByText('R3')).toBeInTheDocument();
    expect(screen.getByText('R4')).toBeInTheDocument();
    expect(screen.getByText('R5')).toBeInTheDocument();

    // Check for points using getAllByText since there are multiple instances
    const zeroPoints = screen.getAllByText('+0');
    expect(zeroPoints).toHaveLength(2); // Round 1 and 4

    const threePoints = screen.getAllByText('+3');
    expect(threePoints).toHaveLength(2); // Round 2 and 5

    expect(screen.getByText('+5')).toBeInTheDocument(); // Round 3
  });

  it('should display game outcome for victory', () => {
    render(
      <StatisticsPanel statistics={mockStatistics} session={mockSession} />
    );

    expect(screen.getByText('Game Result')).toBeInTheDocument();
    expect(screen.getByText('Victory!')).toBeInTheDocument();
    expect(screen.getByText('Alice wins')).toBeInTheDocument();
  });

  it('should display game outcome for defeat', () => {
    const sessionWithAIWinner = { ...mockSession, winner: mockPlayer2 };
    render(
      <StatisticsPanel
        statistics={mockStatistics}
        session={sessionWithAIWinner}
      />
    );

    expect(screen.getByText('Defeat')).toBeInTheDocument();
    expect(screen.getByText('Bob AI wins')).toBeInTheDocument();
  });

  it('should display psychological insights for trustworthy player', () => {
    render(
      <StatisticsPanel statistics={mockStatistics} session={mockSession} />
    );

    expect(screen.getByText('Psychological Profile')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You demonstrate high trustworthiness and cooperative behavior.'
      )
    ).toBeInTheDocument();
  });

  it('should display psychological insights for ruthless player', () => {
    const ruthlessStats = {
      ...mockStatistics,
      cooperationPercentage: 20,
      betrayalPercentage: 80,
    };
    render(
      <StatisticsPanel statistics={ruthlessStats} session={mockSession} />
    );

    expect(
      screen.getByText('You favor aggressive, self-interested strategies.')
    ).toBeInTheDocument();
  });

  it('should display psychological insights for balanced player', () => {
    const balancedStats = {
      ...mockStatistics,
      cooperationPercentage: 50,
      betrayalPercentage: 50,
    };
    render(
      <StatisticsPanel statistics={balancedStats} session={mockSession} />
    );

    expect(
      screen.getByText(
        'You show a balanced approach between trust and caution.'
      )
    ).toBeInTheDocument();
  });

  it('should handle session without human player', () => {
    const aiOnlySession = {
      ...mockSession,
      players: [
        { ...mockPlayer1, isAI: true },
        { ...mockPlayer2, isAI: true },
      ],
    };

    render(
      <StatisticsPanel statistics={mockStatistics} session={aiOnlySession} />
    );

    // Should still render without crashing
    expect(screen.getByText('Game Analysis')).toBeInTheDocument();
  });

  it('should handle empty session rounds', () => {
    const emptySession = { ...mockSession, rounds: [] };
    const emptyStats = {
      cooperationPercentage: 0,
      betrayalPercentage: 0,
      totalPoints: 0,
      gamesWon: 0,
      gamesLost: 0,
      averageTrustScore: 0,
    };

    render(<StatisticsPanel statistics={emptyStats} session={emptySession} />);

    expect(screen.getByText('0 Rounds')).toBeInTheDocument();

    // Check for 0% values using getAllByText since there are multiple instances
    const zeroPercents = screen.getAllByText('0%');
    expect(zeroPercents.length).toBeGreaterThanOrEqual(2); // Should appear for cooperation, betrayal, and consistency
  });

  // Helper function to create mock rounds
  function createMockRound(
    roundNumber: number,
    player1Decision: Decision,
    player2Decision: Decision,
    results: PayoffResult
  ): Round {
    const decisions: PlayerDecision[] = [
      {
        playerId: 'player1',
        decision: player1Decision,
        timestamp: new Date(),
        canReverse: false,
      },
      {
        playerId: 'player2',
        decision: player2Decision,
        timestamp: new Date(),
        canReverse: false,
      },
    ];

    return {
      roundNumber,
      decisions,
      results,
      timestamp: new Date(),
      phaseType: GamePhase.TRUST_PHASE,
    };
  }
});
