import { useRef, useCallback, useEffect } from 'react';

interface AudioOptions {
  loop?: boolean;
  volume?: number;
}

const useAudio = () => {
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const currentlyPlaying = useRef<Set<string>>(new Set());

  // Create audio element for a sound if it doesn't exist
  const createAudioElement = useCallback(
    (soundPath: string, options: AudioOptions = {}) => {
      if (!audioRefs.current.has(soundPath)) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.volume = options.volume ?? 0.5;
        audio.loop = options.loop ?? false;

        // Handle audio loading errors gracefully
        audio.onerror = () => {
          console.warn(`Failed to load audio: ${soundPath}`);
        };

        // For development, create placeholder audio using Web Audio API
        if (soundPath.includes('clock-ticking')) {
          // Create clock ticking sound programmatically
          createTickingSound(audio);
        } else if (soundPath.includes('fluorescent-buzzing')) {
          // Create buzzing sound programmatically
          createBuzzingSound(audio);
        } else if (soundPath.includes('heartbeat')) {
          // Create heartbeat sound programmatically
          createHeartbeatSound(audio);
        } else {
          // For other sounds, set a placeholder src that won't cause errors
          audio.src =
            'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
        }

        audioRefs.current.set(soundPath, audio);
      }
      return audioRefs.current.get(soundPath)!;
    },
    []
  );

  // Create ticking sound using Web Audio API
  const createTickingSound = useCallback((audio: HTMLAudioElement) => {
    try {
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.type = 'square';

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        0.1,
        audioContext.currentTime + 0.01
      );
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.warn('Web Audio API not supported, using silent audio');
    }
  }, []);

  // Create buzzing sound using Web Audio API
  const createBuzzingSound = useCallback((audio: HTMLAudioElement) => {
    try {
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(60, audioContext.currentTime);
      oscillator.type = 'sawtooth';

      gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 1);
    } catch (error) {
      console.warn('Web Audio API not supported, using silent audio');
    }
  }, []);

  // Create heartbeat sound using Web Audio API
  const createHeartbeatSound = useCallback((audio: HTMLAudioElement) => {
    try {
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(80, audioContext.currentTime);
      oscillator.type = 'sine';

      // Create heartbeat pattern
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        0.3,
        audioContext.currentTime + 0.1
      );
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);
      gainNode.gain.linearRampToValueAtTime(
        0.3,
        audioContext.currentTime + 0.3
      );
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn('Web Audio API not supported, using silent audio');
    }
  }, []);

  const playSound = useCallback(
    (soundPath: string, options: AudioOptions = {}) => {
      try {
        const audio = createAudioElement(soundPath, options);

        // Reset audio to beginning
        audio.currentTime = 0;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              currentlyPlaying.current.add(soundPath);
            })
            .catch((error) => {
              console.warn(`Failed to play audio: ${soundPath}`, error);
            });
        }

        // Remove from currently playing when ended (if not looping)
        if (!options.loop) {
          audio.onended = () => {
            currentlyPlaying.current.delete(soundPath);
          };
        }
      } catch (error) {
        console.warn(`Error playing sound: ${soundPath}`, error);
      }
    },
    [createAudioElement]
  );

  const stopSound = useCallback((soundPath?: string) => {
    try {
      if (soundPath) {
        const audio = audioRefs.current.get(soundPath);
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
          currentlyPlaying.current.delete(soundPath);
        }
      } else {
        // Stop all sounds
        audioRefs.current.forEach((audio, path) => {
          audio.pause();
          audio.currentTime = 0;
          currentlyPlaying.current.delete(path);
        });
      }
    } catch (error) {
      console.warn('Error stopping sound', error);
    }
  }, []);

  const isPlaying = useCallback((soundPath: string) => {
    return currentlyPlaying.current.has(soundPath);
  }, []);

  const setVolume = useCallback((soundPath: string, volume: number) => {
    const audio = audioRefs.current.get(soundPath);
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRefs.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      audioRefs.current.clear();
      currentlyPlaying.current.clear();
    };
  }, []);

  return {
    playSound,
    stopSound,
    isPlaying,
    setVolume,
  };
};

export default useAudio;
