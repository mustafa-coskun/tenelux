import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './HowToPlayVideo.css';

interface HowToPlayVideoProps {
  className?: string;
}

export const HowToPlayVideo: React.FC<HowToPlayVideoProps> = ({ className = '' }) => {
  const { t, currentLanguage } = useTranslation();
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState(currentLanguage);
  const [showControls, setShowControls] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' }
  ];

  const getSubtitleFile = (langCode: string) => {
    const timestamp = Date.now();
    switch (langCode) {
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

  const updateSubtitles = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      
      // Mevcut track'leri temizle
      const existingTracks = video.querySelectorAll('track');
      existingTracks.forEach(track => track.remove());
      
      // Yeni track ekle
      if (subtitlesEnabled) {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.src = getSubtitleFile(selectedLanguage);
        track.srclang = selectedLanguage;
        track.label = languages.find(l => l.code === selectedLanguage)?.name || selectedLanguage.toUpperCase();
        track.default = true;
        
        video.appendChild(track);
        
        // Track yüklendikten sonra aktif et
        setTimeout(() => {
          const tracks = video.textTracks;
          if (tracks.length > 0) {
            tracks[0].mode = 'showing';
          }
        }, 100);
      }
    }
  };

  const handleSubtitleToggle = () => {
    setSubtitlesEnabled(!subtitlesEnabled);
  };

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode as typeof currentLanguage);
    setShowControls(false);
  };

  // Altyazı durumu veya dil değiştiğinde güncelle
  useEffect(() => {
    updateSubtitles();
  }, [subtitlesEnabled, selectedLanguage]);

  // Ana dil değiştiğinde seçili dili güncelle
  useEffect(() => {
    setSelectedLanguage(currentLanguage);
  }, [currentLanguage]);

  const handleVideoLoad = () => {
    updateSubtitles();
  };

  const selectedLang = languages.find(l => l.code === selectedLanguage);

  return (
    <div className={`iframe-video-player ${className}`}>
      <div className="video-header">
        <h4>{t('video.howToPlay')}</h4>
        <div className="video-controls">
          <button 
            className={`subtitle-toggle ${subtitlesEnabled ? 'active' : ''}`}
            onClick={handleSubtitleToggle}
            title={subtitlesEnabled ? t('video.hideSubtitles') : t('video.showSubtitles')}
          >
            📝 {subtitlesEnabled ? 'ON' : 'OFF'}
          </button>
          
          <div className="language-selector">
            <button 
              className="language-btn"
              onClick={() => setShowControls(!showControls)}
              title={t('video.selectLanguage')}
            >
              {selectedLang?.flag} {selectedLang?.name}
            </button>
            
            {showControls && (
              <div className="language-dropdown">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    className={`language-option ${selectedLanguage === lang.code ? 'selected' : ''}`}
                    onClick={() => handleLanguageChange(lang.code)}
                  >
                    {lang.flag} {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="video-frame">
        <video
          key={`iframe-video-${selectedLanguage}-${subtitlesEnabled}`}
          ref={videoRef}
          controls
          onLoadedData={handleVideoLoad}
          className="iframe-video"
          preload="metadata"
          width="100%"
          height="auto"
        >
          <source src={`/prisoners_dilemma_how_to.mp4?v=${Date.now()}`} type="video/mp4" />
          {t('video.browserNotSupported')}
        </video>
      </div>
      
      <div className="video-footer">
        <small>🎬 {t('video.gameExplanation')}</small>
      </div>
    </div>
  );
};

export default HowToPlayVideo;