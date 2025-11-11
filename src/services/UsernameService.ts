// Simulated username database - gerçek uygulamada server'da olacak
class UsernameService {
  private static instance: UsernameService | null = null;
  private usedUsernames: Set<string> = new Set();

  constructor() {
    this.loadUsedUsernames();
    // Bazı yasaklı kullanıcı adları ekle
    this.addReservedUsernames();
  }

  static getInstance(): UsernameService {
    if (!UsernameService.instance) {
      UsernameService.instance = new UsernameService();
    }
    return UsernameService.instance;
  }

  private loadUsedUsernames(): void {
    try {
      const stored = localStorage.getItem('tenebris_used_usernames');
      if (stored) {
        const usernames = JSON.parse(stored);
        this.usedUsernames = new Set(usernames);
      }
    } catch (error) {
      console.error('Failed to load used usernames:', error);
    }
  }

  private saveUsedUsernames(): void {
    try {
      const usernames = Array.from(this.usedUsernames);
      localStorage.setItem('tenebris_used_usernames', JSON.stringify(usernames));
    } catch (error) {
      console.error('Failed to save used usernames:', error);
    }
  }

  private addReservedUsernames(): void {
    const reserved = [
      'admin', 'administrator', 'mod', 'moderator', 'system', 'bot', 'ai',
      'tenebris', 'tenelux', 'guest', 'misafir', 'null', 'undefined',
      'test', 'demo', 'example', 'sample', 'user', 'player'
    ];
    reserved.forEach(username => this.usedUsernames.add(username.toLowerCase()));
  }

  isUsernameAvailable(username: string): boolean {
    const normalizedUsername = this.normalizeUsername(username);
    
    // Boş veya çok kısa kontrol
    if (!normalizedUsername || normalizedUsername.length < 3) {
      return false;
    }

    // Çok uzun kontrol
    if (normalizedUsername.length > 20) {
      return false;
    }

    // Geçersiz karakterler kontrol
    if (!/^[a-zA-Z0-9_-]+$/.test(normalizedUsername)) {
      return false;
    }

    // Sayı ile başlama kontrol
    if (/^\d/.test(normalizedUsername)) {
      return false;
    }

    // Kullanılmış mı kontrol
    return !this.usedUsernames.has(normalizedUsername.toLowerCase());
  }

  reserveUsername(username: string): boolean {
    const normalizedUsername = this.normalizeUsername(username);
    
    if (!this.isUsernameAvailable(username)) {
      return false;
    }

    this.usedUsernames.add(normalizedUsername.toLowerCase());
    this.saveUsedUsernames();
    return true;
  }

  releaseUsername(username: string): void {
    const normalizedUsername = this.normalizeUsername(username);
    this.usedUsernames.delete(normalizedUsername.toLowerCase());
    this.saveUsedUsernames();
  }

  private normalizeUsername(username: string): string {
    return username.trim().replace(/\s+/g, '_');
  }

  generateSuggestions(baseUsername: string): string[] {
    const suggestions: string[] = [];
    const normalized = this.normalizeUsername(baseUsername);
    
    // Sayı ekleme
    for (let i = 1; i <= 99; i++) {
      const suggestion = `${normalized}${i}`;
      if (this.isUsernameAvailable(suggestion)) {
        suggestions.push(suggestion);
        if (suggestions.length >= 5) break;
      }
    }

    // Alt çizgi ekleme
    for (let i = 1; i <= 3; i++) {
      const suggestion = `${normalized}${'_'.repeat(i)}`;
      if (this.isUsernameAvailable(suggestion)) {
        suggestions.push(suggestion);
        if (suggestions.length >= 5) break;
      }
    }

    // Rastgele kelimeler ekleme
    const suffixes = ['pro', 'master', 'king', 'ace', 'star', 'hero', 'legend'];
    for (const suffix of suffixes) {
      const suggestion = `${normalized}_${suffix}`;
      if (this.isUsernameAvailable(suggestion)) {
        suggestions.push(suggestion);
        if (suggestions.length >= 5) break;
      }
    }

    return suggestions.slice(0, 5);
  }

  validateUsername(username: string): { valid: boolean; error?: string } {
    const normalizedUsername = this.normalizeUsername(username);

    if (!normalizedUsername) {
      return { valid: false, error: 'Kullanıcı adı boş olamaz' };
    }

    if (normalizedUsername.length < 3) {
      return { valid: false, error: 'Kullanıcı adı en az 3 karakter olmalı' };
    }

    if (normalizedUsername.length > 20) {
      return { valid: false, error: 'Kullanıcı adı en fazla 20 karakter olabilir' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(normalizedUsername)) {
      return { valid: false, error: 'Sadece harf, rakam, _ ve - karakterleri kullanılabilir' };
    }

    if (/^\d/.test(normalizedUsername)) {
      return { valid: false, error: 'Kullanıcı adı sayı ile başlayamaz' };
    }

    if (!this.isUsernameAvailable(username)) {
      return { valid: false, error: 'Bu kullanıcı adı zaten alınmış' };
    }

    return { valid: true };
  }
}

export const getUsernameService = () => UsernameService.getInstance();
export default UsernameService;