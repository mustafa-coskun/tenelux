import { AIStrategy } from '../types';

export interface AIPersonality {
  strategy: AIStrategy;
  name: string;
  description: string;
  personality: string;
  avatar: string;
  dialogues: {
    intro: string[];
    cooperation: string[];
    betrayal: string[];
    victory: string[];
    defeat: string[];
  };
}

export class AIPersonalityService {
  private t: ((key: string) => string) | null = null;

  constructor(translateFunction?: (key: string) => string) {
    this.t = translateFunction || null;
  }

  /**
   * Update the translation function
   */
  updateTranslationFunction(translateFunction: (key: string) => string): void {
    this.t = translateFunction;
  }

  /**
   * Generate a random anonymous name for AI
   */
  private generateAnonymousName(): string {
    const prefixes = ['Agent', 'Player', 'Subject', 'Entity', 'Unit'];
    const numbers = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    return `${prefix}-${numbers}`;
  }

  private getPersonalityData(): Record<AIStrategy, AIPersonality> {
    const t = this.t || ((key: string) => key); // Fallback to key if no translation function

    return {
      [AIStrategy.LOYAL]: {
        strategy: AIStrategy.LOYAL,
        name: this.generateAnonymousName(),
        description: t('aiPanel.opponentDescription'),
        personality: t('aiPanel.opponentDescription'),
        avatar: '🛡️',
        dialogues: {
          intro: [
            'I believe we can work together on this.',
            'Trust is the foundation of any partnership.',
            "Let's find a solution that benefits us both.",
          ],
          cooperation: [
            'I knew we could trust each other.',
            'This is how partnerships should work.',
            "Together we're stronger.",
          ],
          betrayal: [
            "I'm disappointed, but I still believe in cooperation.",
            "Perhaps you'll reconsider next time.",
            "I won't let this change my principles.",
          ],
          victory: [
            'We both won through cooperation.',
            'This proves that trust pays off.',
            "I'm glad we worked together.",
          ],
          defeat: [
            'I may have lost, but I kept my honor.',
            'Sometimes doing the right thing has a cost.',
            "I don't regret staying true to my values.",
          ],
        },
      },
      [AIStrategy.ADAPTIVE]: {
        strategy: AIStrategy.ADAPTIVE,
        name: this.generateAnonymousName(),
        description: t('aiPanel.opponentDescription'),
        personality: t('aiPanel.opponentDescription'),
        avatar: '🪞',
        dialogues: {
          intro: [
            "I'm watching and learning from you.",
            'Your moves will determine mine.',
            "Let's see what kind of player you are.",
          ],
          cooperation: [
            'You cooperate, so I cooperate.',
            "I'm following your lead.",
            'This seems to be working for both of us.',
          ],
          betrayal: [
            'You betrayed, so I must adapt.',
            'I see how you want to play this game.',
            'Two can play at this game.',
          ],
          victory: [
            'I learned your patterns well.',
            'Adaptation is the key to survival.',
            'Your strategy became my strategy.',
          ],
          defeat: [
            'I need to study your moves more carefully.',
            "You're more unpredictable than I thought.",
            "I'll adapt better next time.",
          ],
        },
      },
      [AIStrategy.FEARFUL]: {
        strategy: AIStrategy.FEARFUL,
        name: this.generateAnonymousName(),
        description: t('aiPanel.opponentDescription'),
        personality: t('aiPanel.opponentDescription'),
        avatar: '😰',
        dialogues: {
          intro: [
            "I don't trust anyone in this situation.",
            "Everyone's out for themselves here.",
            'I have to protect myself first.',
          ],
          cooperation: [
            'Wait, you actually cooperated?',
            'This must be some kind of trick.',
            "I can't believe you didn't betray me.",
          ],
          betrayal: [
            "I knew it! I knew you'd betray me!",
            'This is exactly what I expected.',
            "You can't trust anyone!",
          ],
          victory: [
            'At least my paranoia paid off.',
            'I was right to be suspicious.',
            'Self-preservation is everything.',
          ],
          defeat: [
            'I should have been even more careful.',
            "Everyone's against me.",
            'I can never let my guard down.',
          ],
        },
      },
      [AIStrategy.MANIPULATIVE]: {
        strategy: AIStrategy.MANIPULATIVE,
        name: this.generateAnonymousName(),
        description: t('aiPanel.opponentDescription'),
        personality: t('aiPanel.opponentDescription'),
        avatar: '🎭',
        dialogues: {
          intro: [
            'We should definitely work together on this.',
            'I have a good feeling about our partnership.',
            'Trust me, I know how to handle these situations.',
          ],
          cooperation: [
            'See? I told you we make a great team.',
            'This is just the beginning of our success.',
            'I always keep my word... when it suits me.',
          ],
          betrayal: [
            'Sorry, but business is business.',
            'You should have seen this coming.',
            'Nothing personal, just strategy.',
          ],
          victory: [
            'I played you perfectly.',
            'Trust is such a useful tool.',
            'You made this too easy.',
          ],
          defeat: [
            "You're smarter than I gave you credit for.",
            'I underestimated you.',
            'Well played, I respect that.',
          ],
        },
      },
      [AIStrategy.RANDOM]: {
        strategy: AIStrategy.RANDOM,
        name: this.generateAnonymousName(),
        description: t('aiPanel.opponentDescription'),
        personality: t('aiPanel.opponentDescription'),
        avatar: '🎲',
        dialogues: {
          intro: [
            "Who knows what I'll do? I certainly don't!",
            "Let's flip a coin and see what happens!",
            "Predictability is boring, don't you think?",
          ],
          cooperation: [
            'Oops, did I just cooperate? How random!',
            'The dice said cooperate today!',
            'Even chaos can be kind sometimes!',
          ],
          betrayal: [
            'The universe told me to betray you!',
            'Random number generator says... betrayal!',
            'Nothing personal, just pure chaos!',
          ],
          victory: [
            'Chaos wins again!',
            'Random luck is the best luck!',
            'Who needs strategy when you have chaos?',
          ],
          defeat: [
            "The randomness didn't favor me today!",
            'Even chaos has bad days!',
            'The dice will roll better next time!',
          ],
        },
      },
      [AIStrategy.GRUDGE]: {
        strategy: AIStrategy.GRUDGE,
        name: this.generateAnonymousName(),
        description: t('aiPanel.opponentDescription'),
        personality: t('aiPanel.opponentDescription'),
        avatar: '⚔️',
        dialogues: {
          intro: [
            'I start with trust, but I never forget betrayal.',
            "Cross me once, and you'll regret it forever.",
            'I believe in honor, but I also believe in justice.',
          ],
          cooperation: [
            "Good, you've earned my continued trust.",
            'This is how honorable people behave.',
            'I respect those who keep their word.',
          ],
          betrayal: [
            "You've made a grave mistake.",
            'I will never trust you again.',
            'This betrayal will not be forgotten.',
          ],
          victory: [
            'Justice has been served.',
            'This is what betrayers deserve.',
            'My memory is long and my justice is swift.',
          ],
          defeat: [
            "You may have won, but I'll never forgive.",
            "This isn't over between us.",
            "I'll remember this defeat forever.",
          ],
        },
      },
    };
  }

  /**
   * Get a random AI personality (hidden from player)
   */
  getRandomPersonality(): AIPersonality {
    const personalities = this.getPersonalityData();
    const strategies = Object.values(AIStrategy);
    const randomStrategy =
      strategies[Math.floor(Math.random() * strategies.length)];
    return personalities[randomStrategy];
  }

  /**
   * Get a specific AI personality
   */
  getPersonality(strategy: AIStrategy): AIPersonality {
    const personalities = this.getPersonalityData();
    return personalities[strategy];
  }

  /**
   * Get all available personalities
   */
  getAllPersonalities(): AIPersonality[] {
    const personalities = this.getPersonalityData();
    return Object.values(personalities);
  }

  /**
   * Get a random dialogue for a specific situation
   */
  getRandomDialogue(
    personality: AIPersonality,
    situation: keyof AIPersonality['dialogues']
  ): string {
    const dialogues = personality.dialogues[situation];
    return dialogues[Math.floor(Math.random() * dialogues.length)];
  }

  /**
   * Get personality info without revealing the strategy
   */
  getAnonymousPersonalityInfo(personality: AIPersonality): {
    name: string;
    description: string;
    personality: string;
    avatar: string;
  } {
    return {
      name: personality.name,
      description: personality.description,
      personality: personality.personality,
      avatar: personality.avatar,
    };
  }
}
