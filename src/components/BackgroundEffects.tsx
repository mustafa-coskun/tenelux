import React from 'react';
import './BackgroundEffects.css';

interface BackgroundEffectsProps {
  variant?: 'default' | 'auth' | 'game' | 'menu';
}

export const BackgroundEffects: React.FC<BackgroundEffectsProps> = ({ 
  variant = 'default' 
}) => {
  return (
    <div className={`background-effects ${variant}`}>
      {/* Animated particles */}
      <div className="particles">
        {Array.from({ length: 20 }, (_, i) => (
          <div 
            key={i} 
            className="particle" 
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 10}s`,
              animationDuration: `${15 + Math.random() * 10}s`
            }}
          />
        ))}
      </div>

      {/* Floating geometric shapes */}
      <div className="geometric-shapes">
        <div className="shape triangle" />
        <div className="shape circle" />
        <div className="shape square" />
        <div className="shape diamond" />
      </div>

      {/* Gradient overlays */}
      <div className="gradient-overlay overlay-1" />
      <div className="gradient-overlay overlay-2" />
      
      {/* Subtle grid pattern */}
      <div className="grid-pattern" />
    </div>
  );
};