import { describe, expect, it } from 'vitest';
import { directionForLanguage, mapDirectionForOutput } from './text-direction';

describe('language direction', () => {
  it('uses RTL text and a left-oriented map for Arabic output', () => {
    expect(directionForLanguage('ar')).toBe('rtl');
    expect(mapDirectionForOutput('ar')).toBe('LEFT');
  });

  it('uses LTR text and a right-oriented map for English output', () => {
    expect(directionForLanguage('en')).toBe('ltr');
    expect(mapDirectionForOutput('en')).toBe('RIGHT');
  });

  it('does not guess the direction of another detected video language', () => {
    expect(directionForLanguage('other')).toBe('auto');
  });
});
