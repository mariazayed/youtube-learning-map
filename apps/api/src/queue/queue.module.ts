import { Global, Module } from '@nestjs/common';
import { AnalysisQueueService } from './analysis-queue.service';

@Global()
@Module({ providers: [AnalysisQueueService], exports: [AnalysisQueueService] })
export class QueueModule {}
