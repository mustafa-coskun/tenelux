import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './MultiplayerModeSelector.css';

export enum MultiplayerMode {
  RANDOM_MATCH = 'random',
  CREATE_GAME = 'create',
  JOIN_GAME = 'join'
}

interface MultiplayerModeSelectorProps {
  onModeSelect: (mode: MultiplayerMode, gameCode?: string) => void;
  onBack: () => void;
}

export const MultiplayerModeSelector: React.FC<MultiplayerModeSelectorProps> = ({
  onModeSelect,
  onBack
}) => {
  const { t } = useTranslation();
  const [selectedMode, setSelectedMode] = useState<MultiplayerMode | null>(null);
  const [gameCode, setGameCode] = useState('');
  const [error, setError] = useState('');

  const handleModeClick = (mode: MultiplayerMode) => {
    setSelectedMode(mode);
    setError('');
    
    if (mode === MultiplayerMode.RANDOM_MATCH || mode === MultiplayerMode.CREATE_GAME) {
      onModeSelect(mode);
    }
  };

  const handleJoinGame = () => {
    const code = gameCode.trim().toUpperCase();
    
    if (code.length !== 8) {
      setError('Oyun kodu 8 karakter olmalıdır');
      return;
    }
    
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      setError('Geçersiz oyun kodu formatı');
      return;
    }
    
    onModeSelect(MultiplayerMode.JOIN_GAME, code);
  };

  return (
    <div className="multiplayer-mode-selector">
      <div className="mode-selector-header">
        <button className="back-button" onClick={onBack}>
          ← Geri
        </button>
        <h2>Çok Oyunculu Mod Seç</h2>
      </div>

      <div className="mode-options">
        {/* Rastgele Eşleşme */}
        <div 
          className={`mode-card ${selectedMode === MultiplayerMode.RANDOM_MATCH ? 'selected' : ''}`}
          onClick={() => handleModeClick(MultiplayerMode.RANDOM_MATCH)}
        >
          <div className="mode-icon">🎲</div>
          <h3>Rastgele Eşleşme</h3>
          <p>Güven puanına göre otomatik eşleşme</p>
        </div>

        {/* Oyun Oluştur */}
        <div 
          className={`mode-card ${selectedMode === MultiplayerMode.CREATE_GAME ? 'selected' : ''}`}
          onClick={() => handleModeClick(MultiplayerMode.CREATE_GAME)}
        >
          <div className="mode-icon">🎮</div>
          <h3>Oyun Oluştur</h3>
          <p>Arkadaşlarınla oynamak için kod oluştur</p>
        </div>

        {/* Oyun Ara */}
        <div 
          className={`mode-card ${selectedMode === MultiplayerMode.JOIN_GAME ? 'selected' : ''}`}
          onClick={() => setSelectedMode(MultiplayerMode.JOIN_GAME)}
        >
          <div className="mode-icon">🔍</div>
          <h3>Oyun Ara</h3>
          <p>Oyun kodunu girerek katıl</p>
        </div>
      </div>

      {/* Oyun Kodu Girişi */}
      {selectedMode === MultiplayerMode.JOIN_GAME && (
        <div className="join-game-panel">
          <h3>Oyun Kodunu Gir</h3>
          <div className="code-input-group">
            <input
              type="text"
              className="game-code-input"
              placeholder="XXXXXXXX"
              value={gameCode}
              onChange={(e) => {
                setGameCode(e.target.value.toUpperCase());
                setError('');
              }}
              maxLength={8}
              autoFocus
            />
            <button 
              className="join-button"
              onClick={handleJoinGame}
              disabled={gameCode.length !== 8}
            >
              Katıl
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
          <div className="code-hint">
            Oyun kodu 8 karakter olmalıdır (örn: A1B2C3D4)
          </div>
        </div>
      )}

      <div className="mode-info">
        <h4>💡 İpucu</h4>
        <p>
          <strong>Rastgele Eşleşme:</strong> Güven puanına göre dengeli rakip bulur.<br/>
          <strong>Oyun Oluştur:</strong> Arkadaşlarınla oynamak için kod paylaş.<br/>
          <strong>Oyun Ara:</strong> Arkadaşının paylaştığı kodu gir.
        </p>
      </div>
    </div>
  );
};

export default MultiplayerModeSelector;
