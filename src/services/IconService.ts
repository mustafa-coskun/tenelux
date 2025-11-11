export interface GameIcon {
  id: string;
  emoji: string;
  name: string;
  category: 'actions' | 'status' | 'ui' | 'game';
}

class IconService {
  private static instance: IconService | null = null;
  
  private icons: GameIcon[] = [
    // Actions
    { id: 'cooperate', emoji: '🤝', name: 'İşbirliği', category: 'actions' },
    { id: 'betray', emoji: '🗡️', name: 'İhanet', category: 'actions' },
    { id: 'attack', emoji: '⚔️', name: 'Saldırı', category: 'actions' },
    { id: 'defend', emoji: '🛡️', name: 'Savunma', category: 'actions' },
    { id: 'negotiate', emoji: '💬', name: 'Müzakere', category: 'actions' },
    
    // Status
    { id: 'winner', emoji: '🏆', name: 'Kazanan', category: 'status' },
    { id: 'loser', emoji: '💀', name: 'Kaybeden', category: 'status' },
    { id: 'thinking', emoji: '🤔', name: 'Düşünüyor', category: 'status' },
    { id: 'ready', emoji: '✅', name: 'Hazır', category: 'status' },
    { id: 'waiting', emoji: '⏳', name: 'Bekliyor', category: 'status' },
    { id: 'disconnected', emoji: '🔌', name: 'Bağlantı Kesildi', category: 'status' },
    
    // UI
    { id: 'settings', emoji: '⚙️', name: 'Ayarlar', category: 'ui' },
    { id: 'info', emoji: 'ℹ️', name: 'Bilgi', category: 'ui' },
    { id: 'warning', emoji: '⚠️', name: 'Uyarı', category: 'ui' },
    { id: 'error', emoji: '❌', name: 'Hata', category: 'ui' },
    { id: 'success', emoji: '✅', name: 'Başarılı', category: 'ui' },
    { id: 'close', emoji: '✕', name: 'Kapat', category: 'ui' },
    { id: 'menu', emoji: '☰', name: 'Menü', category: 'ui' },
    { id: 'back', emoji: '◀️', name: 'Geri', category: 'ui' },
    
    // Game
    { id: 'dice', emoji: '🎲', name: 'Zar', category: 'game' },
    { id: 'cards', emoji: '🃏', name: 'Kartlar', category: 'game' },
    { id: 'timer', emoji: '⏰', name: 'Zamanlayıcı', category: 'game' },
    { id: 'score', emoji: '📊', name: 'Skor', category: 'game' },
    { id: 'round', emoji: '🔄', name: 'Tur', category: 'game' },
    { id: 'match', emoji: '🎯', name: 'Maç', category: 'game' },
    { id: 'tournament', emoji: '🏟️', name: 'Turnuva', category: 'game' },
    { id: 'spectator', emoji: '👁️', name: 'İzleyici', category: 'game' }
  ];

  static getInstance(): IconService {
    if (!IconService.instance) {
      IconService.instance = new IconService();
    }
    return IconService.instance;
  }

  getIcon(id: string): GameIcon | undefined {
    return this.icons.find(icon => icon.id === id);
  }

  getIconsByCategory(category: GameIcon['category']): GameIcon[] {
    return this.icons.filter(icon => icon.category === category);
  }

  getAllIcons(): GameIcon[] {
    return this.icons;
  }

  // Convenience methods for common icons
  getCooperateIcon(): string {
    return this.getIcon('cooperate')?.emoji || '🤝';
  }

  getBetrayIcon(): string {
    return this.getIcon('betray')?.emoji || '🗡️';
  }

  getWinnerIcon(): string {
    return this.getIcon('winner')?.emoji || '🏆';
  }

  getLoserIcon(): string {
    return this.getIcon('loser')?.emoji || '💀';
  }

  getTimerIcon(): string {
    return this.getIcon('timer')?.emoji || '⏰';
  }

  getScoreIcon(): string {
    return this.getIcon('score')?.emoji || '📊';
  }
}

export const getIconService = () => IconService.getInstance();
export default IconService;