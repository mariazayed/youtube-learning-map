import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@nestjs/config';
import { validateWorkerEnvironment } from '@learnmap/config';
import { AnalysisProcessor } from './analysis.processor';
import { AnalysisJobHandler } from './analysis-job.handler';
import { AnalysisRepository } from './analysis.repository';
import { GeminiVideoAnalysisProvider } from './gemini-video-analysis.provider';
import { VideoAnalysisProvider } from './video-analysis-provider';
import { YoutubeMetadataService } from './youtube-metadata.service';
import { WorkerObservabilityServer } from './worker-observability.server';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateWorkerEnvironment,
    }),
  ],
  providers: [
    AnalysisRepository,
    YoutubeMetadataService,
    GeminiVideoAnalysisProvider,
    {
      provide: VideoAnalysisProvider,
      useExisting: GeminiVideoAnalysisProvider,
    },
    AnalysisJobHandler,
    AnalysisProcessor,
    WorkerObservabilityServer,
  ],
})
export class AppModule {}
