import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const main = readFileSync(resolve(__dirname, '../../main.ts'), 'utf8');

describe('API security bootstrap', () => {
  it('enforces bounded JSON parsing, secure headers, a CORS allowlist, and no-store', () => {
    expect(main).toContain('bodyParser: false');
    expect(main).toContain("config.get<number>('REQUEST_BODY_LIMIT_BYTES')");
    expect(main).toContain('helmet({');
    expect(main).toContain("config.getOrThrow<string>('WEB_URL').split(',')");
    expect(main).not.toMatch(/origin:\s*['"]\*['"]/u);
    expect(main).toContain("response.setHeader('Cache-Control', 'no-store')");
  });
});
