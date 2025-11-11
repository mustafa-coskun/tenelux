export class TournamentSoundService {
  private static instance: TournamentSoundService;
  private audioContext: AudioContext | null = null;
  private soundBuffers: Map<string, AudioBuffer> = new Map();
  private isEnabled: boolean = true;
  private volume: number = 0.7;

  private constructor() {
    this.initializeAudioContext();
    this.preloadSounds();
  }

  public static getInstance(): TournamentSoundService {
    if (!TournamentSoundService.instance) {
      TournamentSoundService.instance = new TournamentSoundService();
    }
    return TournamentSoundService.instance;
  }

  private initializeAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  private async preloadSounds(): Promise<void> {
    const sounds = [
      { name: 'match-ready', url: '/sounds/tournament/match-ready.mp3' },
      { name: 'victory', url: '/sounds/tournament/victory.mp3' },
      { name: 'elimination', url: '/sounds/tournament/elimination.mp3' },
      { name: 'advancement', url: '/sounds/tournament/advancement.mp3' },
      { name: 'tournament-complete', url: '/sounds/tournament/tournament-complete.mp3' },
      { name: 'bracket-update', url: '/sounds/tournament/bracket-update.mp3' },
      { name: 'player-joined', url: '/sounds/tournament/player-joined.mp3' },
      { name: 'countdown', url: '/sounds/tournament/countdown.mp3' },
      { name: 'notification', url: '/sounds/tournament/notification.mp3' },
      { name: 'button-click', url: '/sounds/tournament/button-click.mp3' }
    ];

    if (!this.audioContext) return;

    for (const sound of sounds) {
      try {
        const response = await fetch(sound.url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
          this.soundBuffers.set(sound.name, audioBuffer);
        }
      } catch (error) {
        console.warn(`Failed to load sound: ${sound.name}`, error);
        // Create fallback synthetic sounds
        this.createSyntheticSound(sound.name);
      }
    }
  }

  private createSyntheticSound(soundName: string): void {
    if (!this.audioContext) return;

    const sampleRate = this.audioContext.sampleRate;
    let duration: number;
    let frequencies: number[];

    switch (soundName) {
      case 'match-ready':
        duration = 0.5;
        frequencies = [440, 554, 659]; // A, C#, E chord
        break;
      case 'victory':
        duration = 1.0;
        frequencies = [523, 659, 784, 1047]; // C major chord progression
        break;
      case 'elimination':
        duration = 0.8;
        frequencies = [220, 185, 165]; // Descending minor
        break;
      case 'advancement':
        duration = 0.6;
        frequencies = [330, 415, 523]; // Ascending major
        break;
      case 'tournament-complete':
        duration = 2.0;
        frequencies = [523, 659, 784, 1047, 1319]; // Victory fanfare
        break;
      case 'notification':
        duration = 0.3;
        frequencies = [800, 1000];
        break;
      default:
        duration = 0.2;
        frequencies = [440];
    }

    const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < channelData.length; i++) {
      let sample = 0;
      const time = i / sampleRate;
      
      frequencies.forEach((freq, index) => {
        const envelope = Math.exp(-time * 3); // Exponential decay
        const wave = Math.sin(2 * Math.PI * freq * time) * envelope;
        sample += wave / frequencies.length;
      });

      channelData[i] = sample * 0.3; // Reduce volume
    }

    this.soundBuffers.set(soundName, buffer);
  }

  public playSound(soundName: string, options: { volume?: number; pitch?: number; delay?: number } = {}): void {
    if (!this.isEnabled || !this.audioContext) return;

    const buffer = this.soundBuffers.get(soundName);
    if (!buffer) {
      console.warn(`Sound not found: ${soundName}`);
      return;
    }

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();

    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    // Apply options
    const volume = (options.volume ?? 1) * this.volume;
    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);

    if (options.pitch) {
      source.playbackRate.setValueAtTime(options.pitch, this.audioContext.currentTime);
    }

    const startTime = this.audioContext.currentTime + (options.delay ?? 0);
    source.start(startTime);
  }

  public playSequence(sounds: Array<{ name: string; delay: number; options?: any }>): void {
    sounds.forEach(({ name, delay, options }) => {
      this.playSound(name, { ...options, delay });
    });
  }

  public playMatchReadySequence(): void {
    this.playSequence([
      { name: 'countdown', delay: 0 },
      { name: 'countdown', delay: 0.5, options: { pitch: 1.2 } },
      { name: 'countdown', delay: 1.0, options: { pitch: 1.4 } },
      { name: 'match-ready', delay: 1.5 }
    ]);
  }

  public playVictoryFanfare(): void {
    this.playSequence([
      { name: 'victory', delay: 0 },
      { name: 'victory', delay: 0.3, options: { pitch: 1.2, volume: 0.8 } },
      { name: 'victory', delay: 0.6, options: { pitch: 1.5, volume: 0.6 } }
    ]);
  }

  public playTournamentCompleteSequence(): void {
    this.playSequence([
      { name: 'tournament-complete', delay: 0 },
      { name: 'victory', delay: 1.0, options: { pitch: 1.3 } },
      { name: 'victory', delay: 1.5, options: { pitch: 1.6 } },
      { name: 'victory', delay: 2.0, options: { pitch: 2.0 } }
    ]);
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  public getVolume(): number {
    return this.volume;
  }

  public isAudioEnabled(): boolean {
    return this.isEnabled && !!this.audioContext;
  }

  // Tournament-specific sound effects
  public playBracketUpdate(): void {
    this.playSound('bracket-update', { volume: 0.5 });
  }

  public playPlayerJoined(): void {
    this.playSound('player-joined', { volume: 0.6 });
  }

  public playPlayerEliminated(): void {
    this.playSound('elimination', { pitch: 0.8 });
  }

  public playPlayerAdvanced(): void {
    this.playSound('advancement', { pitch: 1.2 });
  }

  public playMatchStart(): void {
    this.playMatchReadySequence();
  }

  public playMatchEnd(isVictory: boolean): void {
    if (isVictory) {
      this.playVictoryFanfare();
    } else {
      this.playSound('elimination');
    }
  }

  public playTournamentStart(): void {
    this.playSequence([
      { name: 'tournament-complete', delay: 0, options: { pitch: 0.8 } },
      { name: 'match-ready', delay: 0.5 }
    ]);
  }

  public playTournamentEnd(): void {
    this.playTournamentCompleteSequence();
  }

  // UI Sound Effects
  public playButtonClick(): void {
    this.playSound('button-click', { volume: 0.3 });
  }

  public playNotification(): void {
    this.playSound('notification', { volume: 0.4 });
  }

  // Ambient tournament sounds
  public playAmbientTournamentMusic(): void {
    // This would play background music during tournaments
    // Implementation would depend on having longer audio files
  }

  public stopAllSounds(): void {
    // Note: Web Audio API doesn't provide a direct way to stop all sources
    // This would require tracking active sources, which is beyond this basic implementation
    console.log('Stopping all tournament sounds');
  }
}

// Export singleton instance
export const tournamentSoundService = TournamentSoundService.getInstance();

// Global sound effect functions for easy access
export const playTournamentSound = (soundName: string, options?: any) => {
  tournamentSoundService.playSound(soundName, options);
};

export const playMatchReady = () => tournamentSoundService.playMatchStart();
export const playVictory = () => tournamentSoundService.playVictoryFanfare();
export const playElimination = () => tournamentSoundService.playPlayerEliminated();
export const playAdvancement = () => tournamentSoundService.playPlayerAdvanced();
export const playTournamentComplete = () => tournamentSoundService.playTournamentEnd();