import React, { useState } from 'react';
import { adService, AdPlacement } from '../services/AdService';
import './RewardedAdButton.css';

interface RewardedAdButtonProps {
  placement: AdPlacement;
  onReward: (reward: any) => void;
  buttonText?: string;
  rewardText?: string;
  className?: string;
}

/**
 * Ödüllü reklam butonu
 * Kullanım: 
 * <RewardedAdButton 
 *   placement={AdPlacement.GAME_END}
 *   onReward={(reward) => console.log('Reward:', reward)}
 *   buttonText="Watch Ad for Bonus"
 *   rewardText="+10 Points"
 * />
 */
export const RewardedAdButton: React.FC<RewardedAdButtonProps> = ({
  placement,
  onReward,
  buttonText = 'Watch Ad',
  rewardText = 'Get Reward',
  className = ''
}) => {
  const [loading, setLoading] = useState(false);
  const [watched, setWatched] = useState(false);

  const handleClick = async () => {
    if (loading || watched) return;

    setLoading(true);

    try {
      const result = await adService.showRewardedAd(placement);
      
      if (result.watched) {
        setWatched(true);
        onReward(result.reward);
        
        // 5 saniye sonra butonu tekrar aktif et
        setTimeout(() => {
          setWatched(false);
        }, 5000);
      }
    } catch (error) {
      console.error('Rewarded ad error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Reklam gösterilmeyecekse butonu gösterme
  if (!adService.shouldShowAd(placement)) {
    return null;
  }

  return (
    <button
      className={`rewarded-ad-button ${className} ${loading ? 'loading' : ''} ${watched ? 'watched' : ''}`}
      onClick={handleClick}
      disabled={loading || watched}
    >
      <span className="button-icon">🎬</span>
      <span className="button-text">
        {loading ? 'Loading...' : watched ? 'Claimed!' : buttonText}
      </span>
      {!loading && !watched && (
        <span className="button-reward">{rewardText}</span>
      )}
    </button>
  );
};

export default RewardedAdButton;
