import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { AnalysisIdPipe } from '../common/validation/analysis-id.pipe';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import type { RequestWithContext } from '../common/http-request';

@ApiTags('analyses')
@ApiBearerAuth('bearer')
@ApiHeader({
  name: 'X-Client-Id',
  required: false,
  description: 'Development-only identity when ALLOW_ANONYMOUS_AUTH=true.',
})
@Controller('analyses')
@SkipThrottle({ strict: true, moderate: true })
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @SkipThrottle({ strict: false })
  @ApiAcceptedResponse({ description: 'Analysis queued or an existing result reused.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAnalysisDto,
    @Req() request: RequestWithContext,
  ) {
    return this.analyses.create(user, dto, request.requestId);
  }

  @Get()
  @ApiOkResponse({ description: 'The authenticated user’s latest analyses.' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.analyses.list(user);
  }

  @Get(':id/status')
  @SkipThrottle({ moderate: false })
  @ApiOkResponse({ description: 'Compact processing status.' })
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', AnalysisIdPipe) id: string,
  ) {
    return this.analyses.status(user, id);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Full analysis record.' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', AnalysisIdPipe) id: string) {
    return this.analyses.get(user, id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @SkipThrottle({ strict: false })
  @ApiAcceptedResponse({ description: 'Failed analysis queued again.' })
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', AnalysisIdPipe) id: string,
    @Req() request: RequestWithContext,
  ) {
    return this.analyses.retry(user, id, request.requestId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Analysis deleted.' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', AnalysisIdPipe) id: string,
  ): Promise<void> {
    await this.analyses.delete(user, id);
  }
}
