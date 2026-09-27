import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { RetentionRepository } from './retention.repository';
import { retentionCutoff, RetentionService } from './retention.service';

describe('retention policy', () => {
  it('calculates cutoffs in UTC milliseconds', () => {
    expect(retentionCutoff(new Date('2026-09-05T12:00:00.000Z'), 90).toISOString()).toBe(
      '2026-06-07T12:00:00.000Z',
    );
  });

  it('passes the configured analysis and audit cutoffs to the repository', async () => {
    const purge = vi.fn().mockResolvedValue({
      acquired: true,
      analysesDeleted: 2,
      auditEventsDeleted: 3,
    });
    const values: Record<string, number> = {
      ANALYSIS_RETENTION_DAYS: 30,
      AUDIT_RETENTION_DAYS: 180,
    };
    const config = {
      get: vi.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    const service = new RetentionService(config, {
      purge,
    } as unknown as RetentionRepository);
    await service.runSweep(new Date('2026-09-05T00:00:00.000Z'));
    expect(purge).toHaveBeenCalledWith(
      new Date('2026-08-06T00:00:00.000Z'),
      new Date('2026-03-09T00:00:00.000Z'),
    );
  });
});
