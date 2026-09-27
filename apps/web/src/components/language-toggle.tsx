'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LanguageToggle() {
  const language = useLocale();
  const t = useTranslations('Common');
  const router = useRouter();
  const pathname = usePathname();
  const nextLocale = language === 'en' ? 'ar' : 'en';
  return (
    <button
      className="ghostButton"
      type="button"
      onClick={() => router.replace(pathname, { locale: nextLocale })}
      aria-label={language === 'en' ? t('switchToArabic') : t('switchToEnglish')}
    >
      <Languages size={17} aria-hidden="true" />
      <span>{language === 'en' ? t('arabic') : t('english')}</span>
    </button>
  );
}
