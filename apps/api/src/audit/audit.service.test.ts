import type { ConfigService } from '@nestjs/config';
import type { Prisma } from '@learnmap/database';
import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('stores deterministic pseudonyms instead of raw subject identifiers', async () => {
    const create = vi
      .fn<(input: { data: Record<string, unknown> }) => Promise<{ id: string }>>()
      .mockResolvedValue({ id: 'event' });
    const database = { auditEvent: { create } } as unknown as Pick<
      Prisma.TransactionClient,
      'auditEvent'
    >;
    const config = {
      get: vi.fn().mockReturnValue('a-secure-test-pepper-that-is-long-enough'),
    } as unknown as ConfigService;
    const service = new AuditService(config);

    await service.recordWithClient(database, {
      actorId: 'oidc-user-123',
      action: 'ANALYSIS_DELETED',
      targetType: 'video_analysis',
      targetId: 'analysis-456',
      metadata: { source: 'api' },
    });

    const data = create.mock.calls[0]?.[0].data ?? {};
    expect(data.actorHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(data.targetHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(data)).not.toContain('oidc-user-123');
    expect(JSON.stringify(data)).not.toContain('analysis-456');
  });
});
