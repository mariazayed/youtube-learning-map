import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateApiEnvironment } from '@learnmap/config';
import { AnalysesModule } from './analyses/analyses.module';
import { AccountsModule } from './accounts/accounts.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthenticationGuard } from './auth/authentication.guard';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { RateLimitStorageModule } from './common/rate-limit/rate-limit-storage.module';
import { RedisThrottlerStorage } from './common/rate-limit/redis-throttler.storage';
import { HealthController } from './health/health.controller';
import { QueueModule } from './queue/queue.module';
import { RetentionModule } from './retention/retention.module';
import { YoutubeModule } from './youtube/youtube.module';
import { MetricsController } from './observability/metrics.controller';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateApiEnvironment,
    }),
    RateLimitStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [RateLimitStorageModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (config: ConfigService, storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('RATE_LIMIT_TTL_MS') ?? 60_000,
            limit: config.get<number>('RATE_LIMIT_MAX') ?? 60,
          },
          {
            name: 'strict',
            ttl: config.get<number>('RATE_LIMIT_CREATE_TTL_MS') ?? 60_000,
            limit: config.get<number>('RATE_LIMIT_CREATE_MAX') ?? 5,
          },
          {
            name: 'moderate',
            ttl: config.get<number>('RATE_LIMIT_STATUS_TTL_MS') ?? 60_000,
            limit: config.get<number>('RATE_LIMIT_STATUS_MAX') ?? 30,
          },
        ],
      }),
    }),
    AuthModule,
    AuditModule,
    AccountsModule,
    QueueModule,
    YoutubeModule,
    AnalysesModule,
    RetentionModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
