'use client';

import type { VideoAnalysisResult } from '@learnmap/contracts';
import { BookOpen, Clock3, KeyRound, ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { directionForLanguage } from '@/lib/text-direction';
import { formatTimestamp } from '../lib/mind-map-model';
import { BidiText, TimestampText } from './bidi-text';

export function SummaryPanel({
  summary,
  contentLanguage,
  onTimestamp,
}: {
  summary: VideoAnalysisResult['summary'];
  contentLanguage: 'ar' | 'en';
  onTimestamp: (seconds: number) => void;
}) {
  const t = useTranslations('Summary');
  const contentDirection = directionForLanguage(contentLanguage);
  return (
    <article className="summaryPanel">
      <div className="summaryBlock overviewBlock">
        <span className="blockIcon">
          <BookOpen size={18} />
        </span>
        <div>
          <h2>{t('overview')}</h2>
          <p className="generatedBlock" dir={contentDirection}>
            <BidiText language={contentLanguage}>{summary.overview}</BidiText>
          </p>
        </div>
      </div>
      {summary.learningObjectives.length > 0 && (
        <div className="summaryBlock">
          <span className="blockIcon">
            <ListChecks size={18} />
          </span>
          <div>
            <h2>{t('learningObjectives')}</h2>
            <ul className="generatedBlock" dir={contentDirection}>
              {summary.learningObjectives.map((item) => (
                <li key={item}>
                  <BidiText language={contentLanguage}>{item}</BidiText>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="summaryBlock">
        <span className="blockIcon">
          <KeyRound size={18} />
        </span>
        <div>
          <h2>{t('mainIdeas')}</h2>
          <div className="ideaList generatedBlock" dir={contentDirection}>
            {summary.mainIdeas.map((idea) => (
              <section className="idea" key={idea.title}>
                <div className="ideaTitle">
                  <h3>
                    <BidiText language={contentLanguage}>{idea.title}</BidiText>
                  </h3>
                  {idea.timestampSeconds !== null && (
                    <button
                      type="button"
                      onClick={() => onTimestamp(idea.timestampSeconds!)}
                      title={t('approximateTimestamp')}
                    >
                      <Clock3 size={14} aria-hidden="true" />
                      <TimestampText>
                        ≈ {formatTimestamp(idea.timestampSeconds)}
                      </TimestampText>
                    </button>
                  )}
                </div>
                <p>
                  <BidiText language={contentLanguage}>{idea.explanation}</BidiText>
                </p>
              </section>
            ))}
          </div>
        </div>
      </div>
      {summary.keyTakeaways.length > 0 && (
        <div className="summaryBlock">
          <div>
            <h2>{t('keyTakeaways')}</h2>
            <ol className="generatedBlock" dir={contentDirection}>
              {summary.keyTakeaways.map((item) => (
                <li key={item}>
                  <BidiText language={contentLanguage}>{item}</BidiText>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {summary.glossary.length > 0 && (
        <div className="summaryBlock">
          <div>
            <h2>{t('importantTerms')}</h2>
            <dl className="glossary generatedBlock" dir={contentDirection}>
              {summary.glossary.map((item) => (
                <div key={item.term}>
                  <dt>
                    <BidiText language={contentLanguage}>{item.term}</BidiText>
                  </dt>
                  <dd>
                    <BidiText language={contentLanguage}>{item.definition}</BidiText>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </article>
  );
}
