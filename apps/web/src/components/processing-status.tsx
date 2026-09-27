'use client';

import { Check, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { activeProcessingStage, PROCESSING_STAGES } from '@/lib/processing-progress';

export function ProcessingStatus({ progress }: { progress: number }) {
  const t = useTranslations('Processing');
  const active = activeProcessingStage(progress);
  return (
    <div className="processingDetails">
      <p className="activePhase">{t(PROCESSING_STAGES[active]?.key ?? 'validating')}…</p>
      <ol className="processingSteps">
        {PROCESSING_STAGES.map((stage, index) => (
          <li
            className={index < active ? 'complete' : index === active ? 'active' : ''}
            key={stage.key}
            aria-current={index === active ? 'step' : undefined}
          >
            <span>
              {index < active ? (
                <Check size={14} />
              ) : index === active ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                index + 1
              )}
            </span>
            {t(stage.key)}
          </li>
        ))}
      </ol>
    </div>
  );
}
