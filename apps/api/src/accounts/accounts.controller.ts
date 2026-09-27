import { Body, Controller, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccountsService } from './accounts.service';
import { DeleteAccountDto } from './dto/delete-account.dto';

@ApiTags('account')
@ApiBearerAuth('bearer')
@Controller('account')
@SkipThrottle({ strict: true, moderate: true })
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipThrottle({ strict: false })
  @ApiNoContentResponse({ description: 'All LearnMap account data deleted.' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    void dto.confirmation;
    await this.accounts.delete(user);
  }
}
