import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

describe('RTL-safe styling', () => {
  it('uses logical inline properties for directional component spacing', () => {
    expect(css).toContain('padding-inline:');
    expect(css).toContain('margin-inline:');
    expect(css).toContain('inset-inline-end:');
  });

  it('keeps progress, timestamps, code, and media left-to-right', () => {
    expect(css).toMatch(/\.progressTrack\s*\{[^}]*direction: ltr;/su);
    expect(css).toMatch(/\.timestampText\s*\{[^}]*direction: ltr;/su);
    expect(css).toMatch(/code,[\s\S]*?direction: ltr;/u);
    expect(css).toMatch(/\.playerMount,[\s\S]*?direction: ltr;/u);
  });

  it('does not apply a blanket RTL transform to button icons', () => {
    expect(css).not.toMatch(/\[dir=['"]rtl['"]\][^{]*\.primaryButton svg/u);
    expect(css).toContain("--font-arabic: 'Noto Sans Arabic'");
  });
});
