'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Clock3, History, LoaderCircle } from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { BidiText } from './bidi-text';
import { useAuth } from './auth-provider';

export function HistoryList({
  limit,
  showViewAll = false,
}: {
  limit?: number;
  showViewAll?: boolean;
}) {
  const t = useTranslations('History');
  const common = useTranslations('Common');
  const format = useFormatter();
  const auth = useAuth();
  const mayRequest = !auth.configured || auth.authenticated;
  const query = useQuery({
    queryKey: ['analyses'],
    queryFn: api.listAnalyses,
    enabled: mayRequest,
  });
  return (
    <section className="historySection" aria-labelledby="history-title">
      <div className="sectionHeading">
        <div>
          <span className="eyebrow">
            <History size={15} /> {t('eyebrow')}
          </span>
          <h2 id="history-title">{t('title')}</h2>
        </div>
        <div className="sectionActions">
          {showViewAll && query.data && query.data.length > 0 && (
            <Link className="textLink" href="/analyses">
              {t('viewAll')}
              <ArrowUpRight size={16} />
            </Link>
          )}
          {query.isFetching && <LoaderCircle className="spin muted" size={20} />}
        </div>
      </div>

      {!mayRequest && <div className="emptyState">{t('signInRequired')}</div>}
      {mayRequest && query.isLoading && <div className="emptyState">{t('loading')}</div>}
      {query.isError && <div className="emptyState errorMessage">{t('loadError')}</div>}
      {query.data?.length === 0 && (
        <div className="emptyState">
          <History size={25} />
          <strong>{t('emptyTitle')}</strong>
          <span>{t('emptyDescription')}</span>
        </div>
      )}
      <div className="historyGrid">
        {query.data?.slice(0, limit).map((analysis) => (
          <Link
            href={`/analyses/${analysis.id}`}
            className="historyCard"
            key={analysis.id}
          >
            <div className="thumbnailWrap">
              {analysis.thumbnailUrl ? (
                <Image
                  src={analysis.thumbnailUrl}
                  alt=""
                  fill
                  sizes="(max-width: 650px) 100vw, (max-width: 900px) 50vw, 33vw"
                />
              ) : (
                <div className="thumbnailFallback" />
              )}
              <span className={`statusBadge status-${analysis.status.toLowerCase()}`}>
                {t(`status.${analysis.status}`)}
              </span>
            </div>
            <div className="historyContent">
              <h3>
                <BidiText language={analysis.detectedLanguage ?? 'other'}>
                  {analysis.videoTitle ?? t('untitled')}
                </BidiText>
              </h3>
              {analysis.channelTitle && (
                <p>
                  <BidiText language={analysis.detectedLanguage ?? 'other'}>
                    {analysis.channelTitle}
                  </BidiText>
                </p>
              )}
              <small className="historyLanguage">
                {t('outputLanguage', {
                  language:
                    analysis.outputLanguage === 'ar'
                      ? common('arabic')
                      : common('english'),
                })}
              </small>
              <div className="historyMeta">
                <span>
                  <Clock3 size={14} />{' '}
                  {format.dateTime(new Date(analysis.createdAt), { dateStyle: 'medium' })}
                </span>
                <ArrowUpRight size={17} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
