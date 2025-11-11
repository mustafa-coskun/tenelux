import { renderHook, act } from '@testing-library/react';
import useTimer from '../useTimer';

// Mock timers for testing
jest.useFakeTimers();

describe('useTimer', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should initialize with correct initial time', () => {
    const { result } = renderHook(() => useTimer(60));

    expect(result.current.timeRemaining).toBe(60);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.formatTime).toBe('01:00');
  });

  it('should start timer correctly', () => {
    const { result } = renderHook(() => useTimer(60));

    act(() => {
      result.current.startTimer();
    });

    expect(result.current.isRunning).toBe(true);
  });

  it('should countdown correctly', () => {
    const { result } = renderHook(() => useTimer(60));

    act(() => {
      result.current.startTimer();
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.timeRemaining).toBe(55);
    expect(result.current.formatTime).toBe('00:55');
  });

  it('should stop timer correctly', () => {
    const { result } = renderHook(() => useTimer(60));

    act(() => {
      result.current.startTimer();
    });

    act(() => {
      result.current.stopTimer();
    });

    expect(result.current.isRunning).toBe(false);
  });

  it('should reset timer correctly', () => {
    const { result } = renderHook(() => useTimer(60));

    act(() => {
      result.current.startTimer();
    });

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    act(() => {
      result.current.resetTimer();
    });

    expect(result.current.timeRemaining).toBe(60);
    expect(result.current.isRunning).toBe(false);
  });

  it('should call onComplete when timer reaches zero', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useTimer(3, { onComplete }));

    act(() => {
      result.current.startTimer();
    });

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(onComplete).toHaveBeenCalled();
    expect(result.current.timeRemaining).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });
});
