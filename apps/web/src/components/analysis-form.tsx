'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, LoaderCircle, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { validateAnalysisForm } from '@/lib/analysis-form';
import { readDefaultOutputLanguage } from '@/lib/preferences';
import { useAuth } from './auth-provider';

export function AnalysisForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const t = useTranslations('AnalysisForm');
  const common = useTranslations('Common');
  const auth = useAuth();
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [outputLanguage, setOutputLanguage] = useState<'ar' | 'en'>(locale);
  const [validationError, setValidationError] = useState<string | null>(null);
  useEffect(() => setOutputLanguage(readDefaultOutputLanguage(locale)), [locale]);
  const mutation = useMutation({
    mutationFn: api.createAnalysis,
    onSuccess: async (analysis) => {
      await queryClient.invalidateQueries({ queryKey: ['analyses'] });
      router.push(`/analyses/${analysis.id}`);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (auth.configured && !auth.authenticated) {
      void auth.signIn();
      return;
    }
    setValidationError(null);
    const parsed = validateAnalysisForm({
      youtubeUrl: youtubeUrl.trim(),
      outputLanguage,
    });
    if (!parsed.success) {
      setValidationError(t('invalidUrl'));
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <section className="analysisCard" aria-labelledby="new-analysis-title">
      <div className="sectionHeading compact">
        <span className="iconTile">
          <Sparkles size={19} />
        </span>
        <div>
          <h2 id="new-analysis-title">{t('title')}</h2>
          <p>{t('subtitle')}</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="youtube-url">{t('youtubeLabel')}</label>
        <div className="inputRow">
          <input
            id="youtube-url"
            type="url"
            inputMode="url"
            required
            maxLength={500}
            placeholder="https://www.youtube.com/watch?v=..."
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            aria-invalid={validationError ? true : undefined}
            aria-describedby={
              validationError || mutation.error
                ? 'analysis-error'
                : 'supported-video-notice'
            }
          />
          <select
            aria-label={t('outputLanguageLabel')}
            value={outputLanguage}
            onChange={(event) => setOutputLanguage(event.target.value as 'ar' | 'en')}
          >
            <option value="en">{common('english')}</option>
            <option value="ar">{common('arabic')}</option>
          </select>
          <button className="primaryButton" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ArrowRight size={18} />
            )}
            {auth.configured && !auth.authenticated ? t('signInToAnalyze') : t('analyze')}
          </button>
        </div>
        <p className="supportedNotice" id="supported-video-notice">
          {t('supportedNotice')}
        </p>
        {(validationError || mutation.error) && (
          <p className="errorMessage" id="analysis-error" role="alert">
            {validationError ?? t('submitError')}
          </p>
        )}
      </form>
    </section>
  );
}
