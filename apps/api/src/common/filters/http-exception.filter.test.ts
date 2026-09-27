import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter, sanitizePublicMessage } from './http-exception.filter';

function host() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    host: {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'request-123', path: '/v1/analyses' }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost,
    json,
    status,
  };
}

describe('HttpExceptionFilter', () => {
  it('removes control characters and caps client-visible text', () => {
    expect(sanitizePublicMessage(`bad\n\tmessage ${'x'.repeat(400)}`)).toHaveLength(300);
    expect(sanitizePublicMessage('bad\n\tmessage')).toBe('bad message');
  });

  it('never exposes raw parser or server failure details', () => {
    const parserResult = host();
    new HttpExceptionFilter().catch(
      { status: 413, message: 'secret parser internals' },
      parserResult.host,
    );
    expect(parserResult.status).toHaveBeenCalledWith(413);
    expect(parserResult.json.mock.calls[0]?.[0]).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The request body is too large.',
    });

    const serverResult = host();
    new HttpExceptionFilter().catch(
      new Error('GEMINI_API_KEY=secret'),
      serverResult.host,
    );
    expect(JSON.stringify(serverResult.json.mock.calls[0]?.[0])).not.toContain('secret');
  });

  it('sanitizes expected validation errors', () => {
    const result = host();
    new HttpExceptionFilter().catch(
      new BadRequestException('invalid\nfield'),
      result.host,
    );
    expect(result.json.mock.calls[0]?.[0]).toMatchObject({ message: 'invalid field' });
  });
});
