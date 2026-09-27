import { Module } from '@nestjs/common';
import { AnalysesController } from './analyses.controller';
import { AnalysesRepository } from './analyses.repository';
import { AnalysesService } from './analyses.service';

@Module({
  controllers: [AnalysesController],
  providers: [AnalysesRepository, AnalysesService],
})
export class AnalysesModule {}
