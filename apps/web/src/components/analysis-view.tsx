'use client';

import type { Analysis } from '@learnmap/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { BidiText } from './bidi-text';
import { AuthButton } from './auth-button';
import { useAuth } from './auth-provider';
import { LanguageToggle } from './language-toggle';
import { MindMap } from './mind-map';
import { ProcessingStatus } from './processing-status';
import { SummaryPanel } from './summary-panel';
import { type SeekRequest, YoutubePlayer } from './youtube-player';

function LanguageContext({ analysis }: { analysis: Analysis }) {
  const locale = useLocale();
  const t = useTranslations('AnalysisView');
  const common = useTranslations('Common');
  const name = (language: 'ar' | 'en' | 'other' | null) => {
    if (language === 'ar') return common('arabic');
    if (language === 'en') return common('english');
    if (language === 'other') return common('otherLanguage');
    return common('unknownLanguage');
  };
  return (
    <dl className="languageContext" aria-label={t('languageContextLabel')}>
      <div>
        <dt>{t('interfaceLanguage')}</dt>
        <dd>{name(locale)}</dd>
      </div>
      <div>
        <dt>{t('videoLanguage')}</dt>
        <dd>{name(analysis.detectedLanguage)}</dd>
      </div>
      <div>
        <dt>{t('outputLanguage')}</dt>
        <dd>{name(analysis.outputLanguage)}</dd>
      </div>
    </dl>
  );
}

export function AnalysisView({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('AnalysisView');
  const common = useTranslations('Common');
  const auth = useAuth();
  const mayRequest = !auth.configured || auth.authenticated;
  const queryClient = useQueryClient();
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const seekTo = (seconds: number) =>
    setSeekRequest((previous) => ({ seconds, token: (previous?.token ?? 0) + 1 }));
  const query = useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: () => api.getAnalysis(analysisId),
    enabled: mayRequest,
    refetchInterval: (current) => {
      const status = current.state.data?.status;
      return status === 'COMPLETED' || status === 'FAILED' ? false : 2_000;
    },
  });
  const retry = useMutation({
    mutationFn: () => api.retryAnalysis(analysisId),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] }),
  });
  const deletion = useMutation({
    mutationFn: () => api.deleteAnalysis(analysisId),
    onSuccess: () => router.replace('/analyses'),
  });

  const confirmDeletion = () => {
    if (window.confirm(t('deleteConfirmation'))) deletion.mutate();
  };

  const analysis = query.data;
  return (
    <main className="analysisShell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brandMark">
            <BrainCircuit size={22} />
          </span>
          <span>{common('appName')}</span>
        </Link>
        <div className="headerActions">
          <Link className="ghostButton" href="/">
            {locale === 'ar' ? <ArrowRight size={17} /> : <ArrowLeft size={17} />}
            {t('library')}
          </Link>
          <AuthButton />
          <LanguageToggle />
        </div>
      </header>

      {!mayRequest && (
        <div className="stateCard">
          <CircleAlert size={32} />
          <h1>{t('signInRequired')}</h1>
        </div>
      )}
      {mayRequest && query.isLoading && (
        <div className="stateCard">
          <LoaderCircle className="spin" size={32} />
          <h1>{t('loading')}</h1>
        </div>
      )}
      {query.isError && (
        <div className="stateCard errorState">
          <CircleAlert size={32} />
          <h1>{t('loadError')}</h1>
        </div>
      )}
      {analysis && (analysis.status === 'QUEUED' || analysis.status === 'PROCESSING') && (
        <div className="stateCard processingState">
          <div className="processingOrb">
            <BrainCircuit size={34} />
          </div>
          <span className="eyebrow">{t('learningAnalysis')}</span>
          <h1>
            <BidiText language={analysis.detectedLanguage ?? 'other'}>
              {analysis.videoTitle ?? ''}
            </BidiText>
          </h1>
          <LanguageContext analysis={analysis} />
          <ProcessingStatus progress={analysis.progress} />
          <div
            className="progressTrack"
            role="progressbar"
            aria-valuenow={analysis.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.max(analysis.progress, 8)}%` }} />
          </div>
          <small>{analysis.progress}%</small>
          {analysis.status === 'QUEUED' && (
            <button
              className="dangerButton secondaryDangerButton"
              type="button"
              onClick={confirmDeletion}
              disabled={deletion.isPending}
            >
              <Trash2 size={17} aria-hidden="true" /> {t('deleteAnalysis')}
            </button>
          )}
        </div>
      )}
      {analysis?.status === 'FAILED' && (
        <div className="stateCard errorState">
          <CircleAlert size={34} />
          <span className="eyebrow">{analysis.errorCode}</span>
          <h1>{t('failedTitle')}</h1>
          <p>{t('failedMessage')}</p>
          <div className="resultActions">
            <button
              className="primaryButton"
              type="button"
              onClick={() => retry.mutate()}
              disabled={retry.isPending}
            >
              <RefreshCw className={retry.isPending ? 'spin' : ''} size={18} />
              {t('retry')}
            </button>
            <button
              className="dangerButton"
              type="button"
              onClick={confirmDeletion}
              disabled={deletion.isPending}
            >
              <Trash2 size={17} aria-hidden="true" /> {t('deleteAnalysis')}
            </button>
          </div>
          {retry.error && <p className="errorMessage">{t('retryError')}</p>}
          {deletion.error && <p className="errorMessage">{t('deleteError')}</p>}
        </div>
      )}
      {analysis?.status === 'COMPLETED' && analysis.summary && analysis.mindMap && (
        <>
          <section className="resultHeader">
            <div>
              {analysis.channelTitle && (
                <span className="eyebrow">
                  <BidiText language={analysis.detectedLanguage ?? 'other'}>
                    {analysis.channelTitle}
                  </BidiText>
                </span>
              )}
              <h1>
                <BidiText language={analysis.detectedLanguage ?? 'other'}>
                  {analysis.videoTitle ?? ''}
                </BidiText>
              </h1>
              <LanguageContext analysis={analysis} />
            </div>
            <div className="resultActions">
              <span className="readyBadge">{t('ready')}</span>
              <button
                className="dangerButton secondaryDangerButton"
                type="button"
                onClick={confirmDeletion}
                disabled={deletion.isPending}
              >
                <Trash2 size={17} aria-hidden="true" /> {t('deleteAnalysis')}
              </button>
            </div>
          </section>
          <aside className="studentNotice" role="note">
            <CircleAlert size={20} aria-hidden="true" />
            <p>{t('studentNotice')}</p>
          </aside>
          {deletion.error && <p className="errorMessage">{t('deleteError')}</p>}
          <section className="videoAndSummary">
            <div className="videoPanel">
              <YoutubePlayer
                videoId={analysis.youtubeVideoId}
                title={analysis.videoTitle ?? common('appName')}
                seekRequest={seekRequest}
              />
              <p>{t('timestampsNotice')}</p>
            </div>
            <SummaryPanel
              summary={analysis.summary}
              contentLanguage={analysis.outputLanguage}
              onTimestamp={seekTo}
            />
          </section>
          <section className="mapSection">
            <div className="sectionHeading">
              <div>
                <span className="eyebrow">{t('bigPicture')}</span>
                <h2>{t('mindMap')}</h2>
              </div>
            </div>
            <MindMap
              nodes={analysis.mindMap.nodes}
              contentLanguage={analysis.outputLanguage}
              onTimestamp={seekTo}
            />
          </section>
        </>
      )}
    </main>
  );
}
