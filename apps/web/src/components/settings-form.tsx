'use client';

import type { OutputLanguage } from '@learnmap/contracts';
import { CheckCircle2, Save } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { readDefaultOutputLanguage, saveDefaultOutputLanguage } from '@/lib/preferences';

export function SettingsForm() {
  const locale = useLocale();
  const t = useTranslations('SettingsForm');
  const common = useTranslations('Common');
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>(locale);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);

  useEffect(() => setOutputLanguage(readDefaultOutputLanguage(locale)), [locale]);
  useEffect(
    () => () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    },
    [],
  );

  function save() {
    saveDefaultOutputLanguage(outputLanguage);
    setSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 2_000);
  }

  return (
    <section className="settingsCard" aria-labelledby="output-language-title">
      <h2 id="output-language-title">{t('title')}</h2>
      <p>{t('description')}</p>
      <fieldset className="languageChoices">
        <legend className="srOnly">{t('legend')}</legend>
        {(['en', 'ar'] as const).map((value) => (
          <label className="languageChoice" key={value}>
            <input
              type="radio"
              name="default-output-language"
              value={value}
              checked={outputLanguage === value}
              onChange={() => {
                setOutputLanguage(value);
                setSaved(false);
              }}
            />
            <span>
              <strong>{value === 'en' ? common('english') : common('arabic')}</strong>
              <small>
                {value === 'en' ? t('englishMaterials') : t('arabicMaterials')}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <button className="primaryButton" type="button" onClick={save}>
        {saved ? <CheckCircle2 size={18} /> : <Save size={18} />}
        {saved ? t('saved') : t('save')}
      </button>
    </section>
  );
}
