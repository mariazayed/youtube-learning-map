import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_JOB_OPTIONS,
  analysisJobDataSchema,
  analysisJobId,
} from './analysis-job';

describe('analysis job contract', () => {
  it('validates the minimal job payload', () => {
    expect(
      analysisJobDataSchema.parse({ analysisId: 'cm12345678901234567890123' }),
    ).toEqual({ analysisId: 'cm12345678901234567890123' });
    expect(() =>
      analysisJobDataSchema.parse({
        analysisId: 'cm12345678901234567890123',
        apiKey: 'must-not-enter-the-queue',
      }),
    ).toThrow();
  });

  it('propagates only a bounded safe request ID', () => {
    expect(
      analysisJobDataSchema.parse({
        analysisId: 'cm12345678901234567890123',
        requestId: 'request-12345678',
      }),
    ).toMatchObject({ requestId: 'request-12345678' });
    expect(() =>
      analysisJobDataSchema.parse({
        analysisId: 'cm12345678901234567890123',
        requestId: 'Bearer secret token',
      }),
    ).toThrow();
  });

  it('creates a BullMQ-safe stable job ID', () => {
    expect(analysisJobId('cm12345678901234567890123')).toBe(
      'analysis-cm12345678901234567890123',
    );
    expect(analysisJobId('cm12345678901234567890123')).not.toContain(':');
  });

  it('uses bounded retries, exponential backoff, and finite retention', () => {
    expect(ANALYSIS_JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800 },
    });
  });
});
