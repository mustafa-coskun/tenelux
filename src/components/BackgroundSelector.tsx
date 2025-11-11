import React from 'react';
import teneluxLongBg from '../assets/tenelux_long.png';
import teneluxLogo from '../assets/tenelux.png';
import './BackgroundSelector.css';

export interface BackgroundOption {
  id: string;
  name: string;
  image: string;
  preview: string;
  category: 'auth' | 'menu' | 'game';
}

interface BackgroundSelectorProps {
  currentBackground: string;
  onBackgroundChange: (backgroundId: string) => void;
  category: 'auth' | 'menu' | 'game';
}

export const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  currentBackground,
  onBackgroundChange,
  category
}) => {
  const backgrounds: BackgroundOption[] = [
    {
      id: 'tenelux_long',
      name: 'Tenelux Ana',
      image: teneluxLongBg,
      preview: teneluxLongBg,
      category: 'auth'
    },
    {
      id: 'gradient_dark',
      name: 'Koyu Gradient',
      image: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      preview: teneluxLogo,
      category: 'auth'
    },
    {
      id: 'abstract_blue',
      name: 'Soyut Mavi',
      image: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      preview: teneluxLogo,
      category: 'menu'
    },
    {
      id: 'dark_concrete',
      name: 'Koyu Beton',
      image: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0d0d0d 100%)',
      preview: teneluxLogo,
      category: 'game'
    }
  ];

  const filteredBackgrounds = backgrounds.filter(bg => bg.category === category);

  return (
    <div className="background-selector">
      <h3>Arkaplan Seç</h3>
      <div className="background-grid">
        {filteredBackgrounds.map((background) => (
          <button
            key={background.id}
            className={`background-option ${currentBackground === background.id ? 'selected' : ''}`}
            onClick={() => onBackgroundChange(background.id)}
            title={background.name}
          >
            <div 
              className="background-preview"
              style={{
                backgroundImage: background.image.startsWith('linear-gradient') 
                  ? background.image 
                  : `url(${background.image})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            />
            <span className="background-name">{background.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};