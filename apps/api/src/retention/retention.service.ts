import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RetentionRepository } from './retention.repository';

export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
}

@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly repository: RetentionRepository,
  ) {}

  onApplicationBootstrap(): void {
    void this.runSweep();
    const interval = this.config.get<number>('RETENTION_SWEEP_INTERVAL_MS') ?? 86_400_000;
    this.timer = setInterval(() => void this.runSweep(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runSweep(now = new Date()): Promise<void> {
    const analysisDays = this.config.get<number>('ANALYSIS_RETENTION_DAYS') ?? 90;
    const auditDays = this.config.get<number>('AUDIT_RETENTION_DAYS') ?? 365;
    try {
      const result = await this.repository.purge(
        retentionCutoff(now, analysisDays),
        retentionCutoff(now, auditDays),
      );
      if (result.acquired) {
        this.logger.log({ event: 'retention_sweep_completed', ...result });
      }
    } catch {
      this.logger.error({ event: 'retention_sweep_failed' });
    }
  }
}
