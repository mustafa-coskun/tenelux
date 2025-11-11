export interface AvatarOption {
  id: string;
  emoji: string;
  name: string;
  category: string;
}

class AvatarService {
  private static instance: AvatarService | null = null;
  
  private avatars: AvatarOption[] = [
    // Yüzler
    { id: 'smile', emoji: '😊', name: 'Gülümseyen', category: 'faces' },
    { id: 'cool', emoji: '😎', name: 'Havalı', category: 'faces' },
    { id: 'wink', emoji: '😉', name: 'Göz Kırpan', category: 'faces' },
    { id: 'thinking', emoji: '🤔', name: 'Düşünen', category: 'faces' },
    { id: 'star_eyes', emoji: '🤩', name: 'Yıldız Gözlü', category: 'faces' },
    { id: 'robot', emoji: '🤖', name: 'Robot', category: 'faces' },
    { id: 'alien', emoji: '👽', name: 'Uzaylı', category: 'faces' },
    { id: 'ghost', emoji: '👻', name: 'Hayalet', category: 'faces' },

    // Hayvanlar
    { id: 'cat', emoji: '🐱', name: 'Kedi', category: 'animals' },
    { id: 'dog', emoji: '🐶', name: 'Köpek', category: 'animals' },
    { id: 'fox', emoji: '🦊', name: 'Tilki', category: 'animals' },
    { id: 'wolf', emoji: '🐺', name: 'Kurt', category: 'animals' },
    { id: 'lion', emoji: '🦁', name: 'Aslan', category: 'animals' },
    { id: 'tiger', emoji: '🐯', name: 'Kaplan', category: 'animals' },
    { id: 'panda', emoji: '🐼', name: 'Panda', category: 'animals' },
    { id: 'koala', emoji: '🐨', name: 'Koala', category: 'animals' },

    // Objeler
    { id: 'crown', emoji: '👑', name: 'Taç', category: 'objects' },
    { id: 'gem', emoji: '💎', name: 'Elmas', category: 'objects' },
    { id: 'fire', emoji: '🔥', name: 'Ateş', category: 'objects' },
    { id: 'lightning', emoji: '⚡', name: 'Şimşek', category: 'objects' },
    { id: 'star', emoji: '⭐', name: 'Yıldız', category: 'objects' },
    { id: 'rocket', emoji: '🚀', name: 'Roket', category: 'objects' },
    { id: 'sword', emoji: '⚔️', name: 'Kılıç', category: 'objects' },
    { id: 'shield', emoji: '🛡️', name: 'Kalkan', category: 'objects' },

    // Semboller
    { id: 'yin_yang', emoji: '☯️', name: 'Yin Yang', category: 'symbols' },
    { id: 'infinity', emoji: '♾️', name: 'Sonsuzluk', category: 'symbols' },
    { id: 'peace', emoji: '☮️', name: 'Barış', category: 'symbols' },
    { id: 'heart', emoji: '❤️', name: 'Kalp', category: 'symbols' },
    { id: 'spade', emoji: '♠️', name: 'Maça', category: 'symbols' },
    { id: 'diamond', emoji: '♦️', name: 'Karo', category: 'symbols' },
    { id: 'club', emoji: '♣️', name: 'Sinek', category: 'symbols' },
    { id: 'heart_suit', emoji: '♥️', name: 'Kupa', category: 'symbols' }
  ];

  static getInstance(): AvatarService {
    if (!AvatarService.instance) {
      AvatarService.instance = new AvatarService();
    }
    return AvatarService.instance;
  }

  getAllAvatars(): AvatarOption[] {
    return this.avatars;
  }

  getAvatarsByCategory(category: string): AvatarOption[] {
    return this.avatars.filter(avatar => avatar.category === category);
  }

  getCategories(): { id: string; name: string }[] {
    return [
      { id: 'faces', name: 'Yüzler' },
      { id: 'animals', name: 'Hayvanlar' },
      { id: 'objects', name: 'Objeler' },
      { id: 'symbols', name: 'Semboller' }
    ];
  }

  getAvatarById(id: string): AvatarOption | undefined {
    return this.avatars.find(avatar => avatar.id === id);
  }

  getRandomAvatar(): AvatarOption {
    const randomIndex = Math.floor(Math.random() * this.avatars.length);
    return this.avatars[randomIndex];
  }

  getDefaultAvatar(): AvatarOption {
    return this.avatars.find(avatar => avatar.id === 'smile') || this.avatars[0];
  }
}

export const getAvatarService = () => AvatarService.getInstance();
export default AvatarService;