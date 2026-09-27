import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import IORedis from 'ioredis';

const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local remaining = redis.call('PTTL', KEYS[1])
return { hits, remaining }
`;

type StorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly redis: IORedis;
  private connection: Promise<void> | undefined;

  constructor(config: ConfigService) {
    this.redis = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<StorageRecord> {
    if (this.redis.status === 'wait') {
      this.connection ??= this.redis.connect().finally(() => {
        this.connection = undefined;
      });
    }
    if (this.connection) await this.connection;
    const namespacedKey = `learnmap:throttle:${throttlerName}:${key}`;
    const result = (await this.redis.eval(INCREMENT_SCRIPT, 1, namespacedKey, ttl)) as [
      number,
      number,
    ];
    const [totalHits, remainingMilliseconds] = result;
    const isBlocked = totalHits > limit;
    return {
      totalHits,
      timeToExpire: Math.max(1, Math.ceil(remainingMilliseconds / 1_000)),
      isBlocked,
      timeToBlockExpire: isBlocked
        ? Math.max(1, Math.ceil((blockDuration || remainingMilliseconds) / 1_000))
        : 0,
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit().catch(() => undefined);
  }
}
