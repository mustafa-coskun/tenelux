import { describe, it, expect } from '@jest/globals';

// Import all translation files
import enTranslations from '../locales/en.json';
import trTranslations from '../locales/tr.json';
import deTranslations from '../locales/de.json';
import frTranslations from '../locales/fr.json';
import esTranslations from '../locales/es.json';

describe('Character Dialogue Translation Tests', () => {
  const languages = {
    en: enTranslations,
    tr: trTranslations,
    de: deTranslations,
    fr: frTranslations,
    es: esTranslations,
  };

  // Test that all languages have the loadingDialogue key
  it('should have loadingDialogue key in all languages', () => {
    Object.entries(languages).forEach(([lang, translations]) => {
      expect(translations.aiPersonalities).toHaveProperty('loadingDialogue');
      expect(typeof translations.aiPersonalities.loadingDialogue).toBe(
        'string'
      );
      expect(
        translations.aiPersonalities.loadingDialogue.length
      ).toBeGreaterThan(0);
    });
  });

  // Test specific Turkish translation
  it('should have proper Turkish loading dialogue', () => {
    const turkishDialogue = trTranslations.aiPersonalities.loadingDialogue;

    expect(turkishDialogue).toContain('Sorgu için hazırlanıyor');
    expect(turkishDialogue).toContain('Her seçim önemli');
  });

  // Test that all dialogues mention preparation/interrogation
  it('should mention preparation or interrogation in all languages', () => {
    const keywords = {
      en: ['Preparing', 'interrogation', 'choice'],
      tr: ['hazırlanıyor', 'Sorgu', 'seçim'],
      de: ['Bereite', 'Verhör', 'Wahl'],
      fr: ['Préparation', 'interrogatoire', 'choix'],
      es: ['Preparando', 'interrogatorio', 'elección'],
    };

    Object.entries(languages).forEach(([lang, translations]) => {
      const dialogue =
        translations.aiPersonalities.loadingDialogue.toLowerCase();
      const langKeywords = keywords[lang as keyof typeof keywords];

      // At least one keyword should be present
      const hasKeyword = langKeywords.some((keyword) =>
        dialogue.includes(keyword.toLowerCase())
      );

      expect(hasKeyword).toBe(true);
    });
  });

  // Test that dialogues end with proper punctuation
  it('should have proper punctuation in all languages', () => {
    Object.entries(languages).forEach(([lang, translations]) => {
      const dialogue = translations.aiPersonalities.loadingDialogue;

      // Should end with period or ellipsis
      expect(dialogue).toMatch(/[.…]$/);
    });
  });
});
