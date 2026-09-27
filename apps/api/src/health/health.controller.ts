import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { prisma } from '@learnmap/database';
import { Public } from '../auth/public.decorator';
import { AnalysisQueueService } from '../queue/analysis-queue.service';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly queue: AnalysisQueueService) {}

  @Get()
  async health(): Promise<{
    status: 'ok';
    database: 'up';
    queue: 'up';
    worker: 'up';
  }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await this.queue.ping();
      const telemetry = await this.queue.telemetry();
      if (!telemetry.workerAvailable) throw new Error('Worker heartbeat is stale.');
      return { status: 'ok', database: 'up', queue: 'up', worker: 'up' };
    } catch {
      throw new ServiceUnavailableException('A required service is unavailable.');
    }
  }
}
