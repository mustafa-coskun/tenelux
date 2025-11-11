import React from 'react';
import teneluxLogo from '../assets/tenelux.png';
import { useViewportSize } from '../hooks';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
  variant?: 'default' | 'auth' | 'game';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  message = 'Yükleniyor...',
  variant = 'default'
}) => {
  const { isMobile, isTablet } = useViewportSize();

  return (
    <div className={`loading-spinners ${size} ${variant} ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
      <div className="spinner-container">
        <div className="spinner">
          <div className="spinner-ring ring-1"></div>
          <div className="spinner-ring ring-2"></div>
          <div className="spinner-ring ring-3"></div>
          <div className="spinner-center">
            <div className="spinner-dot"></div>
          </div>
        </div>
        {message && <p className="loading-message">{message}</p>}
      </div>
    </div>
  );
};