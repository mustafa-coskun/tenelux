import React, { useEffect, useCallback } from 'react';
import { GamePhase } from '../types';
import useAudio from '../hooks/useAudio';
import { AUDIO_PATHS } from '../utils/constants';
import './AtmosphericEffects.css';

interface AtmosphericEffectsProps {
  currentPhase: GamePhase;
  isDecisionMoment?: boolean;
  onHeartbeatComplete?: () => void;
}

const AtmosphericEffects: React.FC<AtmosphericEffectsProps> = ({
  currentPhase,
  isDecisionMoment = false,
  onHeartbeatComplete,
}) => {
  const { playSound, stopSound, isPlaying } = useAudio();

  // Start ambient sounds based on game phase
  const startAmbientSounds = useCallback(() => {
    // Always play clock ticking
    if (!isPlaying(AUDIO_PATHS.CLOCK_TICKING)) {
      playSound(AUDIO_PATHS.CLOCK_TICKING, { loop: true, volume: 0.3 });
    }

    // Add fluorescent buzzing for atmosphere
    if (!isPlaying(AUDIO_PATHS.FLUORESCENT_BUZZING)) {
      playSound(AUDIO_PATHS.FLUORESCENT_BUZZING, { loop: true, volume: 0.2 });
    }
  }, [playSound, isPlaying]);

  // Play heartbeat during decision moments
  const playHeartbeat = useCallback(() => {
    if (isDecisionMoment && !isPlaying(AUDIO_PATHS.HEARTBEAT)) {
      playSound(AUDIO_PATHS.HEARTBEAT, { volume: 0.4 });

      // Call completion callback after heartbeat duration
      if (onHeartbeatComplete) {
        setTimeout(onHeartbeatComplete, 2000);
      }
    }
  }, [isDecisionMoment, playSound, isPlaying, onHeartbeatComplete]);

  // Start ambient sounds when component mounts or phase changes
  useEffect(() => {
    startAmbientSounds();
  }, [startAmbientSounds, currentPhase]);

  // Play heartbeat when decision moment occurs
  useEffect(() => {
    if (isDecisionMoment) {
      playHeartbeat();
    }
  }, [isDecisionMoment, playHeartbeat]);

  // Cleanup sounds on unmount
  useEffect(() => {
    return () => {
      stopSound();
    };
  }, [stopSound]);

  return (
    <div className="atmospheric-effects">
      {/* Flickering fluorescent light effect */}
      <div className="fluorescent-flicker" />

      {/* Ambient particles for atmosphere */}
      <div className="ambient-particles">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 10}s`,
              animationDuration: `${5 + Math.random() * 10}s`,
            }}
          />
        ))}
      </div>

      {/* Heartbeat visual effect during decision moments */}
      {isDecisionMoment && (
        <div className="heartbeat-overlay">
          <div className="heartbeat-pulse" />
        </div>
      )}

      {/* Phase-specific visual effects */}
      {currentPhase === GamePhase.COMMUNICATION_PHASE && (
        <div className="communication-glow" />
      )}

      {currentPhase === GamePhase.DECISION_REVERSAL_PHASE && (
        <div className="reversal-warning" />
      )}
    </div>
  );
};

export default AtmosphericEffects;
