import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { WorkerObservabilityServer } from './worker-observability.server';

function server(values: Record<string, unknown>) {
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new WorkerObservabilityServer(config) as unknown as {
    authorized: (header?: string) => boolean;
  };
}

describe('worker observability endpoint authorization', () => {
  it('fails closed in production and compares the full token', () => {
    const token = 'm'.repeat(32);
    const candidate = server({ NODE_ENV: 'production', METRICS_TOKEN: token });
    expect(candidate.authorized()).toBe(false);
    expect(candidate.authorized(`Bearer ${token}`)).toBe(true);
    expect(candidate.authorized(`Bearer ${token}x`)).toBe(false);
  });

  it('allows local metrics without a token', () => {
    expect(server({ NODE_ENV: 'test' }).authorized()).toBe(true);
  });
});
