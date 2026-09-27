import { describe, expect, it } from 'vitest';
import { messages } from './messages';

function flatten(value: Record<string, unknown>, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  Object.entries(value).forEach(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === 'string') result.set(path, entry);
    if (entry && typeof entry === 'object') {
      flatten(entry as Record<string, unknown>, path).forEach((text, nestedPath) =>
        result.set(nestedPath, text),
      );
    }
  });
  return result;
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)]
    .map((match) => match[1] ?? '')
    .sort();
}

describe('interface translations', () => {
  const english = flatten(messages.en);
  const arabic = flatten(messages.ar);

  it('keeps complete key parity between English and Arabic', () => {
    expect([...arabic.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('provides non-empty translations with matching ICU placeholders', () => {
    english.forEach((englishText, key) => {
      const arabicText = arabic.get(key);
      expect(englishText.trim(), key).not.toBe('');
      expect(arabicText?.trim(), key).not.toBe('');
      expect(placeholders(arabicText ?? ''), key).toEqual(placeholders(englishText));
    });
  });
});
