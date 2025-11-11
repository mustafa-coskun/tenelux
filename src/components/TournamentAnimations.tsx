import React, { useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import useAudio from '../hooks/useAudio';
import './TournamentAnimations.css';

interface TournamentAnimationsProps {
  children: React.ReactNode;
}

interface NotificationProps {
  id: string;
  type: 'match-ready' | 'victory' | 'elimination' | 'advancement' | 'tournament-complete';
  title: string;
  message: string;
  duration?: number;
  sound?: string;
}

interface EffectProps {
  type: 'confetti' | 'fireworks' | 'victory-celebration' | 'elimination-fade';
  duration?: number;
  intensity?: 'low' | 'medium' | 'high';
}

export const TournamentAnimations: React.FC<TournamentAnimationsProps> = ({ children }) => {
  const { t } = useTranslation();
  const { playSound } = useAudio();
  const [notifications, setNotifications] = useState<NotificationProps[]>([]);
  const [activeEffects, setActiveEffects] = useState<EffectProps[]>([]);

  // Notification management
  const showNotification = (notification: Omit<NotificationProps, 'id'>) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    const newNotification: NotificationProps = {
      ...notification,
      id,
      duration: notification.duration || 4000
    };

    setNotifications(prev => [...prev, newNotification]);

    // Play sound if specified
    if (notification.sound) {
      playSound(notification.sound);
    }

    // Auto-remove notification
    setTimeout(() => {
      removeNotification(id);
    }, newNotification.duration);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Effect management
  const triggerEffect = (effect: EffectProps) => {
    setActiveEffects(prev => [...prev, effect]);

    // Auto-remove effect
    setTimeout(() => {
      setActiveEffects(prev => prev.filter(e => e !== effect));
    }, effect.duration || 3000);
  };

  // Expose functions globally for tournament components
  useEffect(() => {
    (window as any).tournamentAnimations = {
      showNotification,
      triggerEffect,
      
      // Convenience methods
      showMatchReady: (playerName: string) => {
        showNotification({
          type: 'match-ready',
          title: t('tournament.matchReady'),
          message: t('tournament.yourMatchIsReady', { player: playerName }),
          sound: 'match-ready'
        });
      },

      showVictory: (playerName: string, opponentName: string) => {
        showNotification({
          type: 'victory',
          title: t('tournament.victory'),
          message: t('tournament.youDefeated', { opponent: opponentName }),
          sound: 'victory'
        });
        triggerEffect({ type: 'confetti', intensity: 'high', duration: 5000 });
      },

      showElimination: () => {
        showNotification({
          type: 'elimination',
          title: t('tournament.eliminated'),
          message: t('tournament.betterLuckNextTime'),
          sound: 'elimination'
        });
        triggerEffect({ type: 'elimination-fade', duration: 2000 });
      },

      showAdvancement: (round: number) => {
        showNotification({
          type: 'advancement',
          title: t('tournament.advancing'),
          message: t('tournament.advancingToRound', { round }),
          sound: 'advancement'
        });
      },

      showTournamentComplete: (winner: string) => {
        showNotification({
          type: 'tournament-complete',
          title: t('tournament.tournamentComplete'),
          message: t('tournament.congratulationsWinner', { winner }),
          duration: 6000,
          sound: 'tournament-complete'
        });
        triggerEffect({ type: 'victory-celebration', intensity: 'high', duration: 8000 });
      }
    };

    return () => {
      delete (window as any).tournamentAnimations;
    };
  }, [t, playSound]);

  const renderNotifications = () => {
    return notifications.map(notification => (
      <div
        key={notification.id}
        className={`tournament-notification ${notification.type}`}
        onClick={() => removeNotification(notification.id)}
      >
        <div className="notification-content">
          <div className="notification-title">{notification.title}</div>
          <div className="notification-message">{notification.message}</div>
        </div>
        <button 
          className="notification-close"
          onClick={(e) => {
            e.stopPropagation();
            removeNotification(notification.id);
          }}
        >
          ✕
        </button>
      </div>
    ));
  };

  const renderEffects = () => {
    return activeEffects.map((effect, index) => {
      switch (effect.type) {
        case 'confetti':
          return <ConfettiEffect key={index} intensity={effect.intensity} />;
        case 'fireworks':
          return <FireworksEffect key={index} intensity={effect.intensity} />;
        case 'victory-celebration':
          return <VictoryCelebrationEffect key={index} intensity={effect.intensity} />;
        case 'elimination-fade':
          return <EliminationFadeEffect key={index} />;
        default:
          return null;
      }
    });
  };

  return (
    <div className="tournament-animations-container">
      {children}
      
      {/* Notifications */}
      <div className="tournament-notifications">
        {renderNotifications()}
      </div>

      {/* Effects */}
      <div className="tournament-effects">
        {renderEffects()}
      </div>
    </div>
  );
};

// Effect Components
const ConfettiEffect: React.FC<{ intensity?: 'low' | 'medium' | 'high' }> = ({ intensity = 'medium' }) => {
  const pieceCount = intensity === 'low' ? 20 : intensity === 'medium' ? 50 : 100;
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];

  return (
    <div className="confetti-effect">
      {Array.from({ length: pieceCount }).map((_, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: `${Math.random() * 100}%`,
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${3 + Math.random() * 2}s`
          }}
        />
      ))}
    </div>
  );
};

const FireworksEffect: React.FC<{ intensity?: 'low' | 'medium' | 'high' }> = ({ intensity = 'medium' }) => {
  const burstCount = intensity === 'low' ? 3 : intensity === 'medium' ? 6 : 12;
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFD700', '#DDA0DD'];

  return (
    <div className="fireworks-effect">
      {Array.from({ length: burstCount }).map((_, i) => (
        <div
          key={i}
          className="firework-burst"
          style={{
            top: `${20 + Math.random() * 60}%`,
            left: `${10 + Math.random() * 80}%`,
            animationDelay: `${Math.random() * 2}s`
          }}
        >
          {Array.from({ length: 8 }).map((_, j) => (
            <div
              key={j}
              className="firework-particle"
              style={{
                backgroundColor: colors[Math.floor(Math.random() * colors.length)],
                transform: `rotate(${j * 45}deg)`
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

const VictoryCelebrationEffect: React.FC<{ intensity?: 'low' | 'medium' | 'high' }> = ({ intensity = 'high' }) => {
  return (
    <div className="victory-celebration-effect">
      <ConfettiEffect intensity={intensity} />
      <FireworksEffect intensity={intensity} />
      <div className="victory-rays">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="victory-ray"
            style={{
              transform: `rotate(${i * 30}deg)`,
              animationDelay: `${i * 0.1}s`
            }}
          />
        ))}
      </div>
    </div>
  );
};

const EliminationFadeEffect: React.FC = () => {
  return (
    <div className="elimination-fade-effect">
      <div className="fade-overlay" />
    </div>
  );
};

// Sound Effect Component
export const TournamentSoundEffects: React.FC = () => {
  const { playSound } = useAudio();

  useEffect(() => {
    // Preload tournament sounds
    const sounds = [
      'match-ready',
      'victory',
      'elimination',
      'advancement',
      'tournament-complete',
      'bracket-update',
      'player-joined',
      'countdown'
    ];

    sounds.forEach(sound => {
      // Preload sound files
      const audio = new Audio(`/sounds/tournament/${sound}.mp3`);
      audio.preload = 'auto';
    });
  }, []);

  return null;
};

export default TournamentAnimations;