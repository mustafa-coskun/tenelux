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
  const [videoKey, setVideoKey] = useState(0); // Video'yu force re-render için
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

  // Dil değiştiğinde video'yu yeniden render et
  useEffect(() => {
    setVideoKey(prev => prev + 1);
    console.log('Language changed to:', currentLanguage);
  }, [currentLanguage]);

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
    }, 200);
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

  const handleVideoLoad = () => {
    if (videoRef.current) {
      // Altyazıyı otomatik aktif et
      const tracks = videoRef.current.textTracks;
      if (tracks.length > 0) {
        tracks[0].mode = 'showing';
      }
    }
  };

  return (
    <div className={`how-to-play-video ${className}`} key={`video-component-${currentLanguage}`}>
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
              key={`video-${videoKey}`} // Video'yu force re-render
              ref={videoRef}
              controls
              onEnded={handleVideoEnd}
              onLoadedData={handleVideoLoad}
              className="game-video"
              crossOrigin="anonymous"
              preload="metadata"
            >
              <source src="/prisoners_dilemma_how_to.mp4" type="video/mp4" />
              <track
                kind="subtitles"
                src={getSubtitleFile()}
                srcLang={currentLanguage}
                label={`${currentLanguage.toUpperCase()} Subtitles`}
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