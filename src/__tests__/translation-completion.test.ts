import { describe, it, expect } from '@jest/globals';

// Import all translation files
import enTranslations from '../locales/en.json';
import trTranslations from '../locales/tr.json';
import deTranslations from '../locales/de.json';
import frTranslations from '../locales/fr.json';
import esTranslations from '../locales/es.json';

describe('Translation Completion Tests', () => {
  const languages = {
    en: enTranslations,
    tr: trTranslations,
    de: deTranslations,
    fr: frTranslations,
    es: esTranslations,
  };

  // Test that all languages have the statisticsPanel section
  it('should have statisticsPanel section in all languages', () => {
    Object.entries(languages).forEach(([lang, translations]) => {
      expect(translations).toHaveProperty('statisticsPanel');
      expect(typeof translations.statisticsPanel).toBe('object');
    });
  });

  // Test that all required statisticsPanel keys exist in all languages
  it('should have all required statisticsPanel keys in all languages', () => {
    const requiredKeys = [
      'gameAnalysis',
      'session',
      'rounds',
      'cooperation',
      'betrayal',
      'totalPoints',
      'trustScore',
      'performanceSummary',
      'mostFearfulMoment',
      'decisionPattern',
      'mostCommonChoice',
      'cooperated',
      'betrayed',
      'consistency',
      'roundHistory',
      'gameResult',
      'victory',
      'defeat',
      'draw',
      'playerWins',
      'psychologicalProfile',
      'aggressiveStrategy',
      'fearBasedDecisions',
      'cooperativeStrategy',
      'adaptiveStrategy',
    ];

    Object.entries(languages).forEach(([lang, translations]) => {
      requiredKeys.forEach((key) => {
        expect(translations.statisticsPanel).toHaveProperty(key);
        expect(typeof translations.statisticsPanel[key]).toBe('string');
        expect(translations.statisticsPanel[key].length).toBeGreaterThan(0);
      });
    });
  });

  // Test that no translation values are empty or just whitespace
  it('should not have empty translation values', () => {
    Object.entries(languages).forEach(([lang, translations]) => {
      const checkObject = (obj: any, path = '') => {
        Object.entries(obj).forEach(([key, value]) => {
          const currentPath = path ? `${path}.${key}` : key;
          if (typeof value === 'string') {
            expect(value.trim()).not.toBe('');
          } else if (typeof value === 'object' && value !== null) {
            checkObject(value, currentPath);
          }
        });
      };
      checkObject(translations);
    });
  });

  // Test specific translations for consistency
  it('should have consistent translation patterns', () => {
    // Test that victory/defeat translations end with exclamation marks
    Object.entries(languages).forEach(([lang, translations]) => {
      if (translations.statisticsPanel.victory) {
        expect(translations.statisticsPanel.victory).toMatch(/!$/);
      }
      if (translations.statisticsPanel.defeat) {
        expect(translations.statisticsPanel.defeat).toMatch(/!$/);
      }
    });
  });

  // Test that Turkish translations are properly localized
  it('should have proper Turkish translations', () => {
    const turkishStats = trTranslations.statisticsPanel;

    expect(turkishStats.gameAnalysis).toBe('Oyun Analizi');
    expect(turkishStats.session).toBe('Oturum');
    expect(turkishStats.cooperation).toBe('İşbirliği');
    expect(turkishStats.betrayal).toBe('İhanet');
    expect(turkishStats.victory).toBe('Zafer!');
    expect(turkishStats.defeat).toBe('Yenilgi!');
    expect(turkishStats.psychologicalProfile).toBe('Psikolojik Profil');
  });
});
