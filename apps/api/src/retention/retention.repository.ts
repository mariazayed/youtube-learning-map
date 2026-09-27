import { Injectable } from '@nestjs/common';
import { prisma } from '@learnmap/database';
import { AuditService } from '../audit/audit.service';

type AdvisoryLock = { acquired: boolean };

export type RetentionResult = {
  acquired: boolean;
  analysesDeleted: number;
  auditEventsDeleted: number;
};

@Injectable()
export class RetentionRepository {
  constructor(private readonly audit: AuditService) {}

  purge(analysisCutoff: Date, auditCutoff: Date): Promise<RetentionResult> {
    return prisma.$transaction(async (transaction) => {
      const [lock] = await transaction.$queryRaw<AdvisoryLock[]>`
        SELECT pg_try_advisory_xact_lock(7314001401::bigint) AS "acquired"
      `;
      if (!lock?.acquired) {
        return { acquired: false, analysesDeleted: 0, auditEventsDeleted: 0 };
      }

      const analyses = await transaction.videoAnalysis.deleteMany({
        where: {
          status: { in: ['COMPLETED', 'FAILED'] },
          updatedAt: { lt: analysisCutoff },
        },
      });
      const events = await transaction.auditEvent.deleteMany({
        where: { createdAt: { lt: auditCutoff } },
      });
      await this.audit.recordWithClient(transaction, {
        action: 'RETENTION_PURGE',
        targetType: 'retention_policy',
        metadata: {
          analysesDeleted: analyses.count,
          auditEventsDeleted: events.count,
        },
      });
      return {
        acquired: true,
        analysesDeleted: analyses.count,
        auditEventsDeleted: events.count,
      };
    });
  }
}
