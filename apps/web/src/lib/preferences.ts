import { analysisLanguageSchema, type OutputLanguage } from '@learnmap/contracts';

const OUTPUT_LANGUAGE_KEY = 'learnmap-output-language';

export function readDefaultOutputLanguage(fallback: OutputLanguage): OutputLanguage {
  if (typeof window === 'undefined') return fallback;
  const parsed = analysisLanguageSchema.safeParse(
    window.localStorage.getItem(OUTPUT_LANGUAGE_KEY),
  );
  return parsed.success ? parsed.data : fallback;
}

export function saveDefaultOutputLanguage(language: OutputLanguage): void {
  analysisLanguageSchema.parse(language);
  window.localStorage.setItem(OUTPUT_LANGUAGE_KEY, language);
}
