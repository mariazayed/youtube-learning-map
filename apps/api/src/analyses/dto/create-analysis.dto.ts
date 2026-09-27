import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUrl, MaxLength } from 'class-validator';

export class CreateAnalysisDto {
  @ApiProperty({ example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  youtubeUrl!: string;

  @ApiProperty({ enum: ['ar', 'en'] })
  @IsIn(['ar', 'en'])
  outputLanguage!: 'ar' | 'en';
}
