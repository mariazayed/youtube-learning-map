import { Module } from '@nestjs/common';
import { RetentionRepository } from './retention.repository';
import { RetentionService } from './retention.service';

@Module({ providers: [RetentionRepository, RetentionService] })
export class RetentionModule {}
