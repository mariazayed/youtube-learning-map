import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { BidiText, TimestampText } from './bidi-text';

describe('bidirectional generated content', () => {
  it('preserves mixed Arabic and technical English terms in an RTL isolate', () => {
    const content = 'التعلّم الآلي (Machine Learning) — NestJS API PostgreSQL';
    const html = renderToStaticMarkup(<BidiText language="ar">{content}</BidiText>);

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('التعلّم الآلي (Machine Learning)');
    expect(html).toContain('NestJS API PostgreSQL');
  });

  it('uses an automatic isolate when the detected video language is unknown', () => {
    expect(
      renderToStaticMarkup(<BidiText language="other">未知 content</BidiText>),
    ).toContain('dir="auto"');
  });

  it('keeps timestamp numbers left-to-right in every interface', () => {
    const html = renderToStaticMarkup(<TimestampText>1:02:03</TimestampText>);
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('1:02:03');
  });
});
