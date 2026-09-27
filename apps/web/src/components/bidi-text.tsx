import type { ContentLanguage } from '../lib/text-direction';
import { directionForLanguage } from '../lib/text-direction';
import React from 'react';

export function BidiText({
  children,
  language,
  className,
}: {
  children: string;
  language: ContentLanguage;
  className?: string;
}) {
  return (
    <bdi
      className={className ? `generatedText ${className}` : 'generatedText'}
      dir={directionForLanguage(language)}
      lang={language === 'other' ? undefined : language}
    >
      {children}
    </bdi>
  );
}

export function TimestampText({ children }: { children: React.ReactNode }) {
  return (
    <bdi className="timestampText" dir="ltr">
      {children}
    </bdi>
  );
}
