import { ApiProperty } from '@nestjs/swagger';
import { Equals, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({ example: 'DELETE' })
  @Equals('DELETE')
  @MaxLength(6)
  confirmation!: 'DELETE';
}
