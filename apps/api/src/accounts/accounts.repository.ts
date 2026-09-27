import { Injectable } from '@nestjs/common';
import { prisma } from '@learnmap/database';
import { AuditService } from '../audit/audit.service';

export class AccountDeletionBlockedError extends Error {
  constructor() {
    super('Account deletion is unavailable while an analysis is processing.');
    this.name = 'AccountDeletionBlockedError';
  }
}

type LockedUser = { id: string };

@Injectable()
export class AccountsRepository {
  constructor(private readonly audit: AuditService) {}

  deleteAccount(userId: string): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<LockedUser[]>`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;
      if (locked.length !== 1) return false;

      const processing = await transaction.videoAnalysis.count({
        where: { userId, status: 'PROCESSING' },
      });
      if (processing > 0) throw new AccountDeletionBlockedError();

      await this.audit.recordWithClient(transaction, {
        actorId: userId,
        action: 'ACCOUNT_DELETED',
        targetType: 'learnmap_account',
        targetId: userId,
      });
      await transaction.user.delete({ where: { id: userId } });
      return true;
    });
  }
}
