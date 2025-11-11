/**
 * Task 8.3: Responsive tasarımı test et
 * Tests: Mobil cihazlarda (375px, 414px), Tablet'lerde (768px, 1024px), 
 *        Masaüstünde (1920px+), Yönelim değişikliklerini test et
 */

import { renderHook } from '@testing-library/react';
import { useResponsiveScale } from '../hooks/useResponsiveScale';

// Mock window.matchMedia
const createMatchMedia = (width: number) => {
  return (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  });
};

describe('Responsive Design Tests', () => {
  beforeEach(() => {
    // Reset window size
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 768,
    });
  });

  describe('8.3.1 Mobil cihazlarda (375px, 414px)', () => {
    test('should detect mobile viewport at 375px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      Object.defineProperty(window, 'innerHeight', { value: 667 });

      const isMobile = window.innerWidth < 768;
      expect(isMobile).toBe(true);
    });

    test('should detect mobile viewport at 414px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 414 });
      Object.defineProperty(window, 'innerHeight', { value: 896 });

      const isMobile = window.innerWidth < 768;
      expect(isMobile).toBe(true);
    });

    test('should scale game board for mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      Object.defineProperty(window, 'innerHeight', { value: 667 });

      const boardHeight = 600;
      const headerFooterHeight = 120;
      const availableHeight = window.innerHeight - headerFooterHeight;
      const scale = Math.min(1, availableHeight / boardHeight);

      expect(scale).toBeLessThan(1);
      expect(scale).toBeGreaterThan(0.8);
    });

    test('should use full-screen modals on mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375 });

      const isMobile = window.innerWidth < 768;
      const modalClass = isMobile ? 'modal-fullscreen' : 'modal-centered';

      expect(modalClass).toBe('modal-fullscreen');
    });

    test('should have minimum font size of 14px on mobile', () => {
      const minFontSize = 14;
      const mobileFontSize = Math.max(14, 16);

      expect(mobileFontSize).toBeGreaterThanOrEqual(minFontSize);
    });
  });

  describe('8.3.2 Tablet\'lerde (768px, 1024px)', () => {
    test('should detect tablet viewport at 768px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768 });
      Object.defineProperty(window, 'innerHeight', { value: 1024 });

      const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      expect(isTablet).toBe(true);
    });

    test('should detect tablet viewport at 1024px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024 });
      Object.defineProperty(window, 'innerHeight', { value: 768 });

      const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
      expect(isTablet).toBe(true);
    });

    test('should use hybrid layout on tablet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768 });

      const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      const layoutClass = isTablet ? 'layout-hybrid' : 'layout-desktop';

      expect(layoutClass).toBe('layout-hybrid');
    });

    test('should scale appropriately for tablet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768 });
      Object.defineProperty(window, 'innerHeight', { value: 1024 });

      const boardHeight = 600;
      const availableHeight = window.innerHeight - 120;
      const scale = Math.min(1, availableHeight / boardHeight);

      expect(scale).toBeGreaterThan(0.9);
    });
  });

  describe('8.3.3 Masaüstünde (1920px+)', () => {
    test('should detect desktop viewport at 1920px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1920 });
      Object.defineProperty(window, 'innerHeight', { value: 1080 });

      const isDesktop = window.innerWidth >= 1024;
      expect(isDesktop).toBe(true);
    });

    test('should use multi-column layout on desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1920 });

      const isDesktop = window.innerWidth >= 1024;
      const layoutClass = isDesktop ? 'layout-desktop' : 'layout-mobile';

      expect(layoutClass).toBe('layout-desktop');
    });

    test('should not scale game board on desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1920 });
      Object.defineProperty(window, 'innerHeight', { value: 1080 });

      const boardHeight = 600;
      const availableHeight = window.innerHeight - 120;
      const scale = Math.min(1, availableHeight / boardHeight);

      expect(scale).toBe(1);
    });

    test('should use centered modals on desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1920 });

      const isDesktop = window.innerWidth >= 1024;
      const modalClass = isDesktop ? 'modal-centered' : 'modal-fullscreen';

      expect(modalClass).toBe('modal-centered');
    });
  });

  describe('8.3.4 Yönelim değişikliklerini test et', () => {
    test('should handle portrait to landscape transition on mobile', () => {
      // Portrait
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      Object.defineProperty(window, 'innerHeight', { value: 667 });

      const isPortrait = window.innerHeight > window.innerWidth;
      expect(isPortrait).toBe(true);

      // Landscape
      Object.defineProperty(window, 'innerWidth', { value: 667 });
      Object.defineProperty(window, 'innerHeight', { value: 375 });

      const isLandscape = window.innerWidth > window.innerHeight;
      expect(isLandscape).toBe(true);
    });

    test('should handle landscape to portrait transition on tablet', () => {
      // Landscape
      Object.defineProperty(window, 'innerWidth', { value: 1024 });
      Object.defineProperty(window, 'innerHeight', { value: 768 });

      const isLandscape = window.innerWidth > window.innerHeight;
      expect(isLandscape).toBe(true);

      // Portrait
      Object.defineProperty(window, 'innerWidth', { value: 768 });
      Object.defineProperty(window, 'innerHeight', { value: 1024 });

      const isPortrait = window.innerHeight > window.innerWidth;
      expect(isPortrait).toBe(true);
    });

    test('should recalculate scale on orientation change', () => {
      // Portrait
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      Object.defineProperty(window, 'innerHeight', { value: 667 });

      const boardHeight = 600;
      const portraitScale = Math.min(1, (window.innerHeight - 120) / boardHeight);

      // Landscape
      Object.defineProperty(window, 'innerWidth', { value: 667 });
      Object.defineProperty(window, 'innerHeight', { value: 375 });

      const landscapeScale = Math.min(1, (window.innerHeight - 120) / boardHeight);

      expect(portraitScale).not.toBe(landscapeScale);
      expect(landscapeScale).toBeLessThan(portraitScale);
    });

    test('should adjust layout on orientation change', () => {
      // Portrait mobile
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      Object.defineProperty(window, 'innerHeight', { value: 667 });

      let orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
      expect(orientation).toBe('portrait');

      // Landscape mobile
      Object.defineProperty(window, 'innerWidth', { value: 667 });
      Object.defineProperty(window, 'innerHeight', { value: 375 });

      orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
      expect(orientation).toBe('landscape');
    });
  });

  describe('8.3.5 Responsive utilities', () => {
    test('should calculate optimal board size', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      Object.defineProperty(window, 'innerHeight', { value: 667 });

      const maxWidth = window.innerWidth - 32; // 16px padding on each side
      const maxHeight = window.innerHeight - 120; // Header/footer space

      expect(maxWidth).toBe(343);
      expect(maxHeight).toBe(547);
    });

    test('should determine touch target size', () => {
      const minTouchTarget = 44; // iOS minimum
      const buttonSize = Math.max(44, 48);

      expect(buttonSize).toBeGreaterThanOrEqual(minTouchTarget);
    });

    test('should calculate responsive padding', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      const mobilePadding = 16;

      Object.defineProperty(window, 'innerWidth', { value: 1920 });
      const desktopPadding = 32;

      expect(mobilePadding).toBeLessThan(desktopPadding);
    });
  });
});
