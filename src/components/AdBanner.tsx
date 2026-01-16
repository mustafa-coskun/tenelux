import React, { useEffect } from 'react';
import { adService, AdPlacement } from '../services/AdService';
import './AdBanner.css';

interface AdBannerProps {
  placement: AdPlacement;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Banner reklam component'i
 * Ana menü, oyun sonu, turnuva sonu gibi yerlerde gösterilir
 */
export const AdBanner: React.FC<AdBannerProps> = ({ placement, className = '', style = {} }) => {
  useEffect(() => {
    adService.showBanner(placement, `ad-container-${placement}`);
  }, [placement]);

  if (!adService.isEnabled()) {
    return null;
  }

  return (
    <div 
      id={`ad-container-${placement}`}
      className={`ad-banner ${className}`}
      style={style}
    >
      {/* Banner reklamı buraya yüklenecek */}
      <div id="container-9196e6763947fb8d0642f00e554da8ff"></div>
    </div>
  );
};

export default AdBanner;
