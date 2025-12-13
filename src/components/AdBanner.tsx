import React, { useEffect, useRef } from 'react';
import { adService, AdPlacement } from '../services/AdService';
import './AdBanner.css';

interface AdBannerProps {
  placement: AdPlacement;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Banner reklam component'i
 * Kullanım: <AdBanner placement={AdPlacement.SIDEBAR} />
 */
export const AdBanner: React.FC<AdBannerProps> = ({ placement, className = '', style = {} }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerId = `ad-banner-${placement}`;

  useEffect(() => {
    // Component mount olduğunda reklamı yükle - AdSense policy compliance ile
    const timer = setTimeout(() => {
      // Çift kontrol: hem placement hem de sayfa uygunluğu
      if (adService.shouldShowAd(placement) && adService.isPageAdSenseCompliant()) {
        adService.loadBannerAd(placement, containerId);
      } else {
        console.log('Ad blocked for AdSense policy compliance:', placement);
      }
    }, 100);

    // Cleanup
    return () => {
      clearTimeout(timer);
      adService.clearAd(containerId);
    };
  }, [placement, containerId]);

  // Reklam gösterilmeyecekse component'i render etme
  if (!adService.shouldShowAd(placement) || !adService.isPageAdSenseCompliant()) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      id={containerId}
      className={`ad-banner ${className}`}
      style={style}
    >
      {/* Reklam yüklenirken placeholder */}
      <div className="ad-placeholder">
        <span>Advertisement</span>
      </div>
    </div>
  );
};

export default AdBanner;
