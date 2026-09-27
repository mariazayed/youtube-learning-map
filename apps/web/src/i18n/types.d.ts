import type { messages } from './messages';
import type { AppLocale } from './routing';

declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: (typeof messages)['en'];
  }
}
