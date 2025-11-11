import { PayoffMatrix, Decision } from '../types';

// Payoff matrix for Prisoner's Dilemma
// Format: 'playerA_decision,playerB_decision': { playerA: points, playerB: points }
export const PAYOFF_MATRIX: PayoffMatrix = {
  [`${Decision.STAY_SILENT},${Decision.STAY_SILENT}`]: {
    playerA: 3,
    playerB: 3,
  },
  [`${Decision.STAY_SILENT},${Decision.CONFESS}`]: { playerA: 0, playerB: 5 },
  [`${Decision.CONFESS},${Decision.STAY_SILENT}`]: { playerA: 5, playerB: 0 },
  [`${Decision.CONFESS},${Decision.CONFESS}`]: { playerA: 1, playerB: 1 },
};

// Game configuration constants
export const GAME_CONSTANTS = {
  TRUST_PHASE_ROUNDS: 5,
  COMMUNICATION_TIME_LIMIT: 60, // seconds
  TRUST_SCORE_COOPERATION_THRESHOLD: 0.6, // 60% cooperation
  MOST_TRUSTWORTHY_CONFESS_LIMIT: 3, // fewer than 3 confessions
  PREDEFINED_MESSAGES: ['Trust', 'Fear', 'Risk'],
} as const;

// UI constants
export const UI_CONSTANTS = {
  DECISION_TIMEOUT: 30000, // 30 seconds
  HEARTBEAT_DURATION: 2000, // 2 seconds
  PHASE_TRANSITION_DELAY: 1000, // 1 second
} as const;

// Audio file paths (to be implemented later)
export const AUDIO_PATHS = {
  CLOCK_TICKING: '/audio/clock-ticking.mp3',
  FLUORESCENT_BUZZING: '/audio/fluorescent-buzzing.mp3',
  HEARTBEAT: '/audio/heartbeat.mp3',
  AMBIENT: '/audio/ambient.mp3',
} as const;
