import { useState, useEffect, useCallback } from 'react';

// Supported languages
export const SUPPORTED_LANGUAGES = {
  en: 'English',
  tr: 'Türkçe',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

// Translation cache
const translationCache: Record<string, any> = {};

// Get browser language
const getBrowserLanguage = (): SupportedLanguage => {
  const browserLang = navigator.language.split('-')[0] as SupportedLanguage;
  return Object.keys(SUPPORTED_LANGUAGES).includes(browserLang)
    ? browserLang
    : 'en';
};

// Load translation file
const loadTranslation = async (language: SupportedLanguage): Promise<any> => {
  if (translationCache[language]) {
    return translationCache[language];
  }

  try {
    const translation = await import(`../locales/${language}.json`);
    translationCache[language] = translation.default;
    return translation.default;
  } catch (error) {
    console.warn(
      `Failed to load translation for ${language}, falling back to English`
    );
    if (language !== 'en') {
      return loadTranslation('en');
    }
    return {};
  }
};

// Translation hook
export const useTranslation = () => {
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(
    () => {
      const saved = localStorage.getItem(
        'tenelux-language'
      ) as SupportedLanguage;
      return saved && Object.keys(SUPPORTED_LANGUAGES).includes(saved)
        ? saved
        : getBrowserLanguage();
    }
  );

  const [translations, setTranslations] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load translations
  useEffect(() => {
    const loadCurrentTranslation = async () => {
      setIsLoading(true);
      try {
        const translation = await loadTranslation(currentLanguage);
        setTranslations(translation);
      } catch (error) {
        console.error('Failed to load translations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCurrentTranslation();
  }, [currentLanguage]);

  // Change language
  const changeLanguage = useCallback(
    async (language: SupportedLanguage) => {
      if (language === currentLanguage) return;

      setIsLoading(true);
      try {
        const translation = await loadTranslation(language);
        setTranslations(translation);
        setCurrentLanguage(language);
        localStorage.setItem('tenelux-language', language);
      } catch (error) {
        console.error('Failed to change language:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [currentLanguage]
  );

  // Translation function with interpolation
  const t = useCallback(
    (key: string, params?: Record<string, any>): string => {
      const keys = key.split('.');
      let value = translations;

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          // console.warn(`Translation key not found: ${key}`);
          return key;
        }
      }

      if (typeof value !== 'string') {
        console.warn(`Translation value is not a string: ${key}`);
        return key;
      }

      // Simple interpolation
      if (params) {
        return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
          return params[paramKey]?.toString() || match;
        });
      }

      return value;
    },
    [translations]
  );

  return {
    t,
    currentLanguage,
    changeLanguage,
    isLoading,
    supportedLanguages: SUPPORTED_LANGUAGES,
  };
};
