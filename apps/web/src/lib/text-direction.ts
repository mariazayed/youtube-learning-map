import type { DetectedLanguage, OutputLanguage } from '@learnmap/contracts';

export type ContentLanguage = OutputLanguage | DetectedLanguage;
export type TextDirection = 'ltr' | 'rtl' | 'auto';

export function directionForLanguage(language: ContentLanguage): TextDirection {
  if (language === 'ar') return 'rtl';
  if (language === 'en') return 'ltr';
  return 'auto';
}

export function mapDirectionForOutput(language: OutputLanguage): 'LEFT' | 'RIGHT' {
  return language === 'ar' ? 'LEFT' : 'RIGHT';
}
