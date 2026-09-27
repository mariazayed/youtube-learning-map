import { BadRequestException } from '@nestjs/common';

const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

export function isValidClientId(value: string | undefined): value is string {
  return typeof value === 'string' && CLIENT_ID_PATTERN.test(value);
}

export function requireClientId(value: string | undefined): string {
  if (!isValidClientId(value)) {
    throw new BadRequestException('A valid X-Client-Id header is required.');
  }
  return value;
}
