import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeTokenMatches } from '@learnmap/observability';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { AnalysisQueueService } from '../queue/analysis-queue.service';
import { apiMetricsRegistry, queueDepth, workerAvailable } from './api-metrics';

@ApiTags('observability')
@Public()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly config: ConfigService,
    private readonly queue: AnalysisQueueService,
  ) {}

  @Get()
  @ApiExcludeEndpoint()
  async metrics(@Req() request: Request, @Res() response: Response): Promise<void> {
    if (!this.authorized(request.header('authorization'))) {
      response.status(HttpStatus.NOT_FOUND).end();
      return;
    }
    const telemetry = await this.queue.telemetry();
    for (const [state, count] of Object.entries(telemetry.jobs)) {
      queueDepth.set({ state }, count);
    }
    workerAvailable.set(telemetry.workerAvailable ? 1 : 0);
    response.setHeader('Content-Type', apiMetricsRegistry.contentType);
    response.end(await apiMetricsRegistry.metrics());
  }

  private authorized(header: string | undefined): boolean {
    const expected = this.config.get<string>('METRICS_TOKEN') ?? '';
    if (!expected) return this.config.get<string>('NODE_ENV') !== 'production';
    const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
    return timingSafeTokenMatches(expected, supplied);
  }
}
