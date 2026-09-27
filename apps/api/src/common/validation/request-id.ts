import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithContext } from '../http-request';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export function requestIdMiddleware(
  request: RequestWithContext,
  response: Response,
  next: NextFunction,
): void {
  const supplied = request.header('x-request-id');
  request.requestId =
    supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
  response.setHeader('X-Request-Id', request.requestId);
  next();
}
