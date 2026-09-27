import { Module } from '@nestjs/common';
import { YoutubeModule } from '../youtube/youtube.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesRepository } from './analyses.repository';
import { AnalysesService } from './analyses.service';

@Module({
  imports: [YoutubeModule],
  controllers: [AnalysesController],
  providers: [AnalysesRepository, AnalysesService],
})
export class AnalysesModule {}
