import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { KeyRotationAuditService } from './key-rotation-audit.service';

@Global()
@Module({
  providers: [AuditService, KeyRotationAuditService],
  exports: [AuditService],
})
export class AuditModule {}
