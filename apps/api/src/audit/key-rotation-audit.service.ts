import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from './audit.service';

@Injectable()
export class KeyRotationAuditService implements OnApplicationBootstrap {
  private readonly logger = new Logger(KeyRotationAuditService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const versions = [
      ['gemini_api_key', this.config.get<string>('GEMINI_KEY_VERSION')],
      ['youtube_api_key', this.config.get<string>('YOUTUBE_KEY_VERSION')],
    ] as const;

    try {
      for (const [targetType, version] of versions) {
        if (!version) continue;
        await this.audit.recordOnce({
          action: 'SECRET_ROTATION_DEPLOYED',
          targetType,
          targetId: version,
          deduplicationValue: `${targetType}:${version}`,
        });
      }
    } catch {
      this.logger.error({ event: 'secret_rotation_audit_failed' });
    }
  }
}
