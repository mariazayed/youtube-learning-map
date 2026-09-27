import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import {
  AccountDeletionBlockedError,
  type AccountsRepository,
} from './accounts.repository';
import { AccountsService } from './accounts.service';

const user: AuthenticatedUser = { id: 'oidc-user-123', mode: 'oidc' };

describe('AccountsService', () => {
  it('deletes only the authenticated application account', async () => {
    const deleteAccount = vi.fn().mockResolvedValue(true);
    const service = new AccountsService({
      deleteAccount,
    } as unknown as AccountsRepository);
    await expect(service.delete(user)).resolves.toBeUndefined();
    expect(deleteAccount).toHaveBeenCalledWith(user.id);
  });

  it('uses safe errors for missing and currently-processing accounts', async () => {
    const missing = new AccountsService({
      deleteAccount: vi.fn().mockResolvedValue(false),
    } as unknown as AccountsRepository);
    await expect(missing.delete(user)).rejects.toBeInstanceOf(NotFoundException);

    const busy = new AccountsService({
      deleteAccount: vi.fn().mockRejectedValue(new AccountDeletionBlockedError()),
    } as unknown as AccountsRepository);
    await expect(busy.delete(user)).rejects.toBeInstanceOf(ConflictException);
  });
});
