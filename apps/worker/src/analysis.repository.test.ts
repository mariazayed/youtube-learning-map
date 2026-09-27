import { describe, expect, it } from 'vitest';
import { toDatabaseDetectedLanguage } from './analysis.repository';

describe('detected video language persistence', () => {
  it.each([
    ['ar', 'AR'],
    ['en', 'EN'],
    ['other', 'OTHER'],
  ] as const)('maps %s without confusing it with output language', (input, expected) => {
    expect(toDatabaseDetectedLanguage(input)).toBe(expected);
  });
});
