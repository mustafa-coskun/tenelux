import { describe, it, expect } from '@jest/globals';

describe('Translation Fixes', () => {
  it('should have Turkish translation file', async () => {
    const trTranslation = await import('../locales/tr.json');
    expect(trTranslation.default).toBeDefined();
    expect(trTranslation.default.menu.title).toBe('TENELUX');
    expect(trTranslation.default.menu.subtitle).toBe('Mahkum İkilemi');
  });

  it('should have all required keys in all languages', async () => {
    const languages = ['en', 'de', 'fr', 'es', 'tr'];
    const requiredKeys = [
      'menu.title',
      'menu.subtitle',
      'game.confess',
      'game.staySilent',
      'multiplayer.findingOpponent',
      'multiplayer.opponentFound',
      'multiplayer.startingGame',
      'mainMenu.tagline',
      'mainMenu.description',
      'mainMenu.chooseYourPath',
      'aiPersonalities.chaos.name',
      'aiPersonalities.chaos.description',
      'aiPersonalities.chaos.personality',
      'gameBoard.vs',
      'gameBoard.makeYourChoice',
      'gameBoard.trustOrFear',
      'gameBoard.roundHistory',
      'gameBoard.noRoundsCompleted',
      'aiPanel.yourOpponent',
      'aiPanel.mysteriousOpponent',
      'aiPanel.thinking',
      'aiPanel.aiDecisionHistory',
      'aiPanel.noDecisionsYet',
    ];

    for (const lang of languages) {
      const translation = await import(`../locales/${lang}.json`);

      for (const key of requiredKeys) {
        const keys = key.split('.');
        let value = translation.default;

        for (const k of keys) {
          value = value[k];
        }

        expect(value).toBeDefined();
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have consistent AI character names across languages', async () => {
    const languages = ['en', 'de', 'fr', 'es', 'tr'];
    const aiCharacters = [
      'loyal',
      'adaptive',
      'fearful',
      'manipulative',
      'random',
      'grudge',
    ];

    for (const lang of languages) {
      const translation = await import(`../locales/${lang}.json`);

      for (const character of aiCharacters) {
        expect(translation.default.ai.characters[character]).toBeDefined();
        expect(translation.default.ai.characters[character].name).toBeDefined();
        expect(
          translation.default.ai.characters[character].description
        ).toBeDefined();
        expect(
          translation.default.ai.characters[character].personality
        ).toBeDefined();
      }
    }
  });
});
