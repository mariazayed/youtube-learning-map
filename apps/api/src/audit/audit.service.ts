import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, prisma, type AuditAction, type AuditEvent } from '@learnmap/database';

type AuditDatabase = Pick<Prisma.TransactionClient, 'auditEvent'>;

export type NewAuditEvent = {
  actorId?: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  deduplicationValue?: string;
  metadata?: Prisma.InputJsonObject;
};

@Injectable()
export class AuditService {
  private readonly pepper: string;

  constructor(config: ConfigService) {
    this.pepper =
      config.get<string>('AUDIT_HASH_PEPPER') ??
      'development-only-audit-pepper-change-me';
  }

  record(event: NewAuditEvent): Promise<AuditEvent> {
    return this.recordWithClient(prisma, event);
  }

  async recordOnce(event: NewAuditEvent): Promise<void> {
    try {
      await this.record(event);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  recordWithClient(database: AuditDatabase, event: NewAuditEvent): Promise<AuditEvent> {
    return database.auditEvent.create({
      data: {
        actorHash: event.actorId ? this.hash(`actor:${event.actorId}`) : null,
        action: event.action,
        targetType: event.targetType,
        targetHash: event.targetId ? this.hash(`target:${event.targetId}`) : null,
        deduplicationKey: event.deduplicationValue
          ? this.hash(`dedupe:${event.deduplicationValue}`)
          : null,
        ...(event.metadata ? { metadata: event.metadata } : {}),
      },
    });
  }

  private hash(value: string): string {
    return createHmac('sha256', this.pepper).update(value).digest('hex');
  }
}
