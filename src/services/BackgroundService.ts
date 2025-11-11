import { BackgroundOption } from '../components/BackgroundSelector';
import teneluxLongBg from '../assets/tenelux_long.png';
import teneluxWideBg from '../assets/tenelux_wide.png';
import teneluxLogo from '../assets/tenelux.png';

class BackgroundService {
  private static instance: BackgroundService | null = null;
  private readonly STORAGE_KEY = 'tenebris_backgrounds';

  private backgrounds: BackgroundOption[] = [
    {
      id: 'tenelux_long',
      name: 'Tenelux Mobil',
      image: teneluxLongBg,
      preview: teneluxLongBg,
      category: 'auth'
    },
    {
      id: 'tenelux_wide',
      name: 'Tenelux Masaüstü',
      image: teneluxWideBg,
      preview: teneluxWideBg,
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
      id: 'gradient_blue',
      name: 'Mavi Gradient',
      image: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      preview: teneluxLogo,
      category: 'menu'
    },
    {
      id: 'gradient_red',
      name: 'Kırmızı Gradient',
      image: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
      preview: teneluxLogo,
      category: 'game'
    },
    {
      id: 'dark_concrete',
      name: 'Koyu Beton',
      image: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0d0d0d 100%)',
      preview: teneluxLogo,
      category: 'game'
    }
  ];

  private currentBackgrounds = {
    auth: 'tenelux_long',
    menu: 'gradient_blue',
    game: 'dark_concrete'
  };

  static getInstance(): BackgroundService {
    if (!BackgroundService.instance) {
      BackgroundService.instance = new BackgroundService();
    }
    return BackgroundService.instance;
  }

  constructor() {
    this.loadBackgroundSettings();
  }

  private loadBackgroundSettings(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        this.currentBackgrounds = { ...this.currentBackgrounds, ...settings };
      }
    } catch (error) {
      console.error('Failed to load background settings:', error);
    }
  }

  private saveBackgroundSettings(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentBackgrounds));
    } catch (error) {
      console.error('Failed to save background settings:', error);
    }
  }

  getCurrentBackground(category: 'auth' | 'menu' | 'game'): string {
    return this.currentBackgrounds[category];
  }

  setBackground(category: 'auth' | 'menu' | 'game', backgroundId: string): boolean {
    const background = this.backgrounds.find(bg => bg.id === backgroundId && bg.category === category);
    if (!background) {
      return false;
    }

    this.currentBackgrounds[category] = backgroundId;
    this.saveBackgroundSettings();
    this.applyBackground(category, background);
    return true;
  }

  private applyBackground(category: 'auth' | 'menu' | 'game', background: BackgroundOption): void {
    const root = document.documentElement;
    
    // CSS custom properties for dynamic background
    if (background.image.startsWith('linear-gradient')) {
      root.style.setProperty(`--bg-${category}`, background.image);
      root.style.setProperty(`--bg-${category}-image`, 'none');
    } else {
      root.style.setProperty(`--bg-${category}`, 'transparent');
      root.style.setProperty(`--bg-${category}-image`, `url(${background.image})`);
    }
  }

  getBackgroundsByCategory(category: 'auth' | 'menu' | 'game'): BackgroundOption[] {
    return this.backgrounds.filter(bg => bg.category === category);
  }

  getAllBackgrounds(): BackgroundOption[] {
    return this.backgrounds;
  }

  getBackgroundById(id: string): BackgroundOption | undefined {
    return this.backgrounds.find(bg => bg.id === id);
  }

  // Initialize backgrounds on app start
  initializeBackgrounds(): void {
    Object.entries(this.currentBackgrounds).forEach(([category, backgroundId]) => {
      const background = this.getBackgroundById(backgroundId);
      if (background) {
        this.applyBackground(category as 'auth' | 'menu' | 'game', background);
      }
    });
  }

  // Reset to defaults
  resetToDefaults(): void {
    this.currentBackgrounds = {
      auth: 'tenelux_long',
      menu: 'gradient_blue',
      game: 'dark_concrete'
    };
    this.saveBackgroundSettings();
    this.initializeBackgrounds();
  }
}

export const getBackgroundService = () => BackgroundService.getInstance();
export default BackgroundService;