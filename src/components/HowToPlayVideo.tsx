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
  const [videoKey, setVideoKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getSubtitleFile = () => {
    const timestamp = Date.now(); // Cache busting
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
        return `/prisoners_dilemma_how_to.srt?v=${timestamp}`; // English
    }
  };

  // Dil değiştiğinde video'yu tamamen yeniden oluştur
  useEffect(() => {
    console.log('Language changed to:', currentLanguage);
    setVideoKey(prev => prev + 1);
    
    // Eğer video açıksa, kapat ve yeniden aç
    if (showVideo) {
      setShowVideo(false);
      setTimeout(() => {
        setShowVideo(true);
      }, 100);
    }
  }, [currentLanguage]);

  const handlePlayClick = () => {
    setShowVideo(true);
    setTimeout(() => {
      if (videoRef.current) {
        // Video yüklendikten sonra play et
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            setIsPlaying(true);
            enableSubtitles();
          }).catch(error => {
            console.log('Video play failed:', error);
          });
        }
      }
    }, 300);
  };

  const enableSubtitles = () => {
    if (videoRef.current) {
      const tracks = videoRef.current.textTracks;
      console.log('Available tracks:', tracks.length);
      
      // Tüm track'leri disable et
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'disabled';
      }
      
      // İlk track'i enable et
      if (tracks.length > 0) {
        tracks[0].mode = 'showing';
        console.log('Enabled track:', tracks[0].label, tracks[0].language);
      }
    }
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
    console.log('Video loaded, enabling subtitles');
    enableSubtitles();
  };

  const handleVideoCanPlay = () => {
    console.log('Video can play, tracks available');
    setTimeout(enableSubtitles, 100);
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
              key={`video-${videoKey}-${currentLanguage}`}
              ref={videoRef}
              controls
              onEnded={handleVideoEnd}
              onLoadedData={handleVideoLoad}
              onCanPlay={handleVideoCanPlay}
              className="game-video"
              crossOrigin="anonymous"
              preload="metadata"
            >
              <source src={`/prisoners_dilemma_how_to.mp4?v=${Date.now()}`} type="video/mp4" />
              <track
                kind="subtitles"
                src={getSubtitleFile()}
                srcLang={currentLanguage}
                label={`${currentLanguage.toUpperCase()}`}
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