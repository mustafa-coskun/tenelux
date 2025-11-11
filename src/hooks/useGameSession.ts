import { useState } from 'react';
import { GameSession } from '../types';

// useGameSession hook - to be implemented in task 4
const useGameSession = () => {
  const [session, setSession] = useState<GameSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Implementation to be completed in task 4
  const startSession = () => {
    throw new Error('Method not implemented - will be completed in task 4');
  };

  const endSession = () => {
    throw new Error('Method not implemented - will be completed in task 4');
  };

  return {
    session,
    loading,
    error,
    startSession,
    endSession,
  };
};

export default useGameSession;
