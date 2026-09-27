import { BadRequestException } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { RequestWithContext } from '../http-request';
import { AnalysisIdPipe } from './analysis-id.pipe';
import { requestIdMiddleware } from './request-id';

describe('request context validation', () => {
  it('preserves a safe request ID and returns it in the response', () => {
    const request = {
      header: vi.fn().mockReturnValue('request-12345'),
      requestId: '',
    } as unknown as RequestWithContext;
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;
    const next = vi.fn() as NextFunction;
    requestIdMiddleware(request, response, next);
    expect(request.requestId).toBe('request-12345');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'request-12345');
    expect(next).toHaveBeenCalledOnce();
  });

  it('validates CUID-shaped analysis IDs', () => {
    const pipe = new AnalysisIdPipe();
    expect(pipe.transform('cm12345678901234567890123')).toBe('cm12345678901234567890123');
    expect(() => pipe.transform('../another-user')).toThrow(BadRequestException);
  });
});
