import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisQueueService } from '../queue/analysis-queue.service';
import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  const queue = {
    telemetry: vi.fn().mockResolvedValue({
      jobs: { waiting: 2, active: 1, delayed: 0, failed: 0 },
      workerAvailable: true,
    }),
  } as unknown as AnalysisQueueService;

  function controller(values: Record<string, unknown>) {
    const config = {
      get: (key: string) => values[key],
    } as unknown as ConfigService;
    return new MetricsController(config, queue);
  }

  it('allows an unconfigured token only outside production', () => {
    const candidate = controller({ NODE_ENV: 'test' }) as unknown as {
      authorized: (value?: string) => boolean;
    };
    expect(candidate.authorized()).toBe(true);
  });

  it('uses an exact bearer token and hides the endpoint otherwise', () => {
    const token = 'a'.repeat(32);
    const candidate = controller({
      NODE_ENV: 'production',
      METRICS_TOKEN: token,
    }) as unknown as { authorized: (value?: string) => boolean };
    expect(candidate.authorized(`Bearer ${token}`)).toBe(true);
    expect(candidate.authorized(`Bearer ${token}x`)).toBe(false);
    expect(candidate.authorized()).toBe(false);
  });
});
