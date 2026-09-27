import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AccountDeletionBlockedError, AccountsRepository } from './accounts.repository';

@Injectable()
export class AccountsService {
  constructor(private readonly repository: AccountsRepository) {}

  async delete(user: AuthenticatedUser): Promise<void> {
    try {
      const deleted = await this.repository.deleteAccount(user.id);
      if (!deleted) throw new NotFoundException('Account not found.');
    } catch (error) {
      if (error instanceof AccountDeletionBlockedError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
