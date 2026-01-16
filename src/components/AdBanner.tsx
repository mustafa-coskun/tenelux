import React, { useEffect } from 'react';
import { adService, AdPlacement } from '../services/AdService';
import './AdBanner.css';

interface AdBannerProps {
  placement: AdPlacement;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Banner reklam component'i - Crazy Games SDK
 * Note: Crazy Games automatically shows banners, this is just a placeholder
 */
export const AdBanner: React.FC<AdBannerProps> = ({ placement, className = '', style = {} }) => {
  useEffect(() => {
    // Crazy Games SDK handles banners automatically
    adService.showBanner(placement);
  }, [placement]);

  // Crazy Games SDK otomatik banner gösterir
  // Bu component sadece uyumluluk için
  if (!adService.isEnabled()) {
    return null;
  }

  return (
    <div 
      className={`ad-banner ${className}`}
      style={style}
    >
      {/* Crazy Games SDK otomatik banner gösterir */}
      <div className="ad-placeholder">
        <span>Advertisement</span>
      </div>
    </div>
  );
};

export default AdBanner;
