import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';

const CUID_PATTERN = /^[a-z0-9]{20,40}$/i;

@Injectable()
export class AnalysisIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!CUID_PATTERN.test(value)) {
      throw new BadRequestException('Invalid analysis ID.');
    }
    return value;
  }
}
