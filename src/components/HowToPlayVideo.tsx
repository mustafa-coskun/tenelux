import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './HowToPlayVideo.css';

interface HowToPlayVideoProps {
  className?: string;
}

export const HowToPlayVideo: React.FC<HowToPlayVideoProps> = ({ className = '' }) => {
  const { t, currentLanguage } = useTranslation();
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getSubtitleFile = () => {
    const timestamp = Date.now();
    switch (currentLanguage) {
      case 'tr':
        return `/prisoners_dilemma_how_to_tr.srt?v=${timestamp}`;
      case 'de':
        return `/prisoners_dilemma_how_to_de.srt?v=${timestamp}`;
      case 'fr':
        return `/prisoners_dilemma_how_to_fr.srt?v=${timestamp}`;
      case 'es':
        return `/prisoners_dilemma_how_to_es.srt?v=${timestamp}`;
      default:
        return `/prisoners_dilemma_how_to.srt?v=${timestamp}`;
    }
  };

  const handleToggleVideo = () => {
    setShowVideo(!showVideo);
  };

  const handleVideoLoad = () => {
    if (videoRef.current) {
      // Altyazıyı otomatik aktif et
      const tracks = videoRef.current.textTracks;
      if (tracks.length > 0) {
        tracks[0].mode = 'showing';
        console.log('Subtitle enabled for language:', currentLanguage);
      }
    }
  };

  return (
    <div className={`how-to-play-video ${className}`}>
      <button className="toggle-video-btn" onClick={handleToggleVideo}>
        <div className="play-icon">{showVideo ? '📹' : '▶️'}</div>
        <span>{t('video.howToPlay')}</span>
        <small>{showVideo ? t('video.hideVideo') : t('video.watchVideo')}</small>
      </button>

      {showVideo && (
        <div className="embedded-video-container">
          <video
            key={`embedded-video-${currentLanguage}`}
            ref={videoRef}
            controls
            onLoadedData={handleVideoLoad}
            className="embedded-video"
            preload="metadata"
            width="100%"
            height="auto"
          >
            <source src={`/prisoners_dilemma_how_to.mp4?v=${Date.now()}`} type="video/mp4" />
            <track
              kind="subtitles"
              src={getSubtitleFile()}
              srcLang={currentLanguage}
              label={currentLanguage.toUpperCase()}
              default
            />
            {t('video.browserNotSupported')}
          </video>
          <div className="video-info">
            <small>🎬 {t('video.gameExplanation')}</small>
          </div>
        </div>
      )}
    </div>
  );
};

export default HowToPlayVideo;