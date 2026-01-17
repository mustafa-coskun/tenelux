import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './HowToPlayVideo.css';

interface HowToPlayVideoProps {
  className?: string;
}

export const HowToPlayVideo: React.FC<HowToPlayVideoProps> = ({ className = '' }) => {
  const { t, currentLanguage } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getSubtitleFile = () => {
    switch (currentLanguage) {
      case 'tr':
        return '/prisoners_dilemma_how_to_tr.srt';
      case 'de':
        return '/prisoners_dilemma_how_to_de.srt';
      case 'fr':
        return '/prisoners_dilemma_how_to_fr.srt';
      case 'es':
        return '/prisoners_dilemma_how_to_es.srt';
      default:
        return '/prisoners_dilemma_how_to.srt'; // English
    }
  };

  // Dil değiştiğinde altyazıları güncelle
  useEffect(() => {
    if (videoRef.current && showVideo) {
      const tracks = videoRef.current.textTracks;
      // Mevcut track'leri temizle
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'disabled';
      }
      
      // Video'yu yeniden yükle (altyazı değişikliği için)
      const currentTime = videoRef.current.currentTime;
      const wasPlaying = !videoRef.current.paused;
      
      videoRef.current.load();
      
      videoRef.current.addEventListener('loadeddata', () => {
        if (videoRef.current) {
          videoRef.current.currentTime = currentTime;
          if (wasPlaying) {
            videoRef.current.play();
          }
          // Yeni altyazıyı aktif et
          const newTracks = videoRef.current.textTracks;
          if (newTracks.length > 0) {
            newTracks[0].mode = 'showing';
          }
        }
      }, { once: true });
    }
  }, [currentLanguage, showVideo]);

  const handlePlayClick = () => {
    setShowVideo(true);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.play();
        setIsPlaying(true);
        // Altyazıyı aktif et
        const tracks = videoRef.current.textTracks;
        if (tracks.length > 0) {
          tracks[0].mode = 'showing';
        }
      }
    }, 100);
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  const handleCloseVideo = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setShowVideo(false);
  };

  return (
    <div className={`how-to-play-video ${className}`}>
      {!showVideo ? (
        <button className="play-video-btn" onClick={handlePlayClick}>
          <div className="play-icon">▶️</div>
          <span>{t('video.howToPlay')}</span>
          <small>{t('video.watchVideo')}</small>
        </button>
      ) : (
        <div className="video-overlay">
          <div className="video-container">
            <button className="close-video-btn" onClick={handleCloseVideo}>
              ✕
            </button>
            <video
              ref={videoRef}
              controls
              onEnded={handleVideoEnd}
              className="game-video"
              crossOrigin="anonymous"
            >
              <source src="/prisoners_dilemma_how_to.mp4" type="video/mp4" />
              <track
                key={currentLanguage} // Key ekleyerek React'in track'i yeniden render etmesini sağla
                kind="subtitles"
                src={getSubtitleFile()}
                srcLang={currentLanguage}
                label={currentLanguage.toUpperCase()}
                default
              />
              {t('video.browserNotSupported')}
            </video>
          </div>
        </div>
      )}
    </div>
  );
};

export default HowToPlayVideo;