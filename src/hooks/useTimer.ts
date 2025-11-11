import { useState, useEffect, useCallback, useRef } from 'react';

interface UseTimerOptions {
  onComplete?: () => void;
  autoStart?: boolean;
}

const useTimer = (initialTime: number, options: UseTimerOptions = {}) => {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(options.autoStart || false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { onComplete, autoStart } = options;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (isRunning || timeRemaining <= 0) {
      return;
    }

    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          if (onComplete) {
            onComplete();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [isRunning, timeRemaining, onComplete]);

  const stopTimer = useCallback(() => {
    setIsRunning(false);
    clearTimer();
  }, [clearTimer]);

  const resetTimer = useCallback(
    (newTime?: number) => {
      stopTimer();
      setTimeRemaining(newTime ?? initialTime);
    },
    [initialTime, stopTimer]
  );

  // Auto-start if specified
  useEffect(() => {
    if (autoStart && !isRunning && timeRemaining > 0) {
      startTimer();
    }
  }, [autoStart, isRunning, timeRemaining, startTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  return {
    timeRemaining,
    isRunning,
    startTimer,
    stopTimer,
    resetTimer,
    formatTime: formatTime(timeRemaining),
  };
};

export default useTimer;
