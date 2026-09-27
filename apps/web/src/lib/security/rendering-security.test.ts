import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('generated-content rendering boundary', () => {
  it('renders analysis text through React without raw HTML sinks', () => {
    const components = ['analysis-view.tsx', 'mind-map.tsx', 'summary-panel.tsx'];
    const source = components
      .map((file) => readFileSync(resolve(__dirname, '../../components', file), 'utf8'))
      .join('\n');
    expect(source).not.toContain('dangerouslySetInnerHTML');
    expect(source).not.toMatch(/\.innerHTML\s*=/u);
  });
});
