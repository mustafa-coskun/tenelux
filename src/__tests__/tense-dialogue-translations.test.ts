import { describe, it, expect } from '@jest/globals';

// Import all translation files
import enTranslations from '../locales/en.json';
import trTranslations from '../locales/tr.json';
import deTranslations from '../locales/de.json';
import frTranslations from '../locales/fr.json';
import esTranslations from '../locales/es.json';

describe('Tense Dialogue Translation Tests', () => {
  const languages = {
    en: enTranslations,
    tr: trTranslations,
    de: deTranslations,
    fr: frTranslations,
    es: esTranslations,
  };

  // Test that all languages have the tenseDialogue section
  it('should have tenseDialogue section in all languages', () => {
    Object.entries(languages).forEach(([lang, translations]) => {
      expect(translations).toHaveProperty('tenseDialogue');
      expect(typeof translations.tenseDialogue).toBe('object');
    });
  });

  // Test that all required tenseDialogue keys exist in all languages
  it('should have all required tenseDialogue keys in all languages', () => {
    const requiredKeys = [
      'interrogationRoom',
      'authoritiesEvidence',
      'cooperationWarning',
      'partnerDecision',
      'trustLuxury',
      'clockTicking',
      'silenceGolden',
      'waitingMessage',
      'communicationTime',
      'lastChance',
      'interrogationContinues',
    ];

    Object.entries(languages).forEach(([lang, translations]) => {
      requiredKeys.forEach((key) => {
        expect(translations.tenseDialogue).toHaveProperty(key);
        expect(typeof translations.tenseDialogue[key]).toBe('string');
        expect(translations.tenseDialogue[key].length).toBeGreaterThan(0);
      });
    });
  });

  // Test that all atmospheric keys exist
  it('should have all atmospheric dialogue keys in all languages', () => {
    const atmosphericKeys = [
      'flickeringLight',
      'footsteps',
      'chairCreaks',
      'clockTicks',
      'heavyAir',
      'heartPounds',
      'wallsClosing',
      'timeMoves',
    ];

    Object.entries(languages).forEach(([lang, translations]) => {
      expect(translations.tenseDialogue).toHaveProperty('atmospheric');
      expect(typeof translations.tenseDialogue.atmospheric).toBe('object');

      atmosphericKeys.forEach((key) => {
        expect(translations.tenseDialogue.atmospheric).toHaveProperty(key);
        expect(typeof translations.tenseDialogue.atmospheric[key]).toBe(
          'string'
        );
        expect(
          translations.tenseDialogue.atmospheric[key].length
        ).toBeGreaterThan(0);
      });
    });
  });

  // Test specific Turkish translations
  it('should have proper Turkish translations for tense dialogue', () => {
    const turkishDialogue = trTranslations.tenseDialogue;

    expect(turkishDialogue.interrogationRoom).toContain('sorgu odasındasın');
    expect(turkishDialogue.authoritiesEvidence).toContain('delillere sahip');
    expect(turkishDialogue.cooperationWarning).toContain('işbirliği');
    expect(turkishDialogue.partnerDecision).toContain('kaderini belirleyecek');
    expect(turkishDialogue.trustLuxury).toContain('lüks');
    expect(turkishDialogue.clockTicking).toContain('Saat işliyor');
    expect(turkishDialogue.interrogationContinues).toContain('devam ediyor');
  });

  // Test that interpolation placeholders are preserved
  it('should preserve interpolation placeholders in all languages', () => {
    Object.entries(languages).forEach(([lang, translations]) => {
      expect(translations.tenseDialogue.interrogationRoom).toContain(
        '{{playerName}}'
      );
    });
  });

  // Test that atmospheric texts have proper ellipsis
  it('should have proper atmospheric text formatting', () => {
    Object.entries(languages).forEach(([lang, translations]) => {
      const atmospheric = translations.tenseDialogue.atmospheric;

      // Most atmospheric texts should end with ellipsis
      expect(atmospheric.flickeringLight).toMatch(/\.\.\.$/);
      expect(atmospheric.footsteps).toMatch(/\.$/);
      expect(atmospheric.chairCreaks).toMatch(/\.$/);
      expect(atmospheric.clockTicks).toMatch(/\.$/);
      expect(atmospheric.heavyAir).toMatch(/\.$/);
      expect(atmospheric.heartPounds).toMatch(/\.$/);
      expect(atmospheric.wallsClosing).toMatch(/\.$/);
      expect(atmospheric.timeMoves).toMatch(/\.$/);
    });
  });
});
