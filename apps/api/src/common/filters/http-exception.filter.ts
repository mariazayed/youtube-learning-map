import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Response } from 'express';
import type { RequestWithContext } from '../http-request';

type ErrorBody = {
  statusCode: number;
  code: string;
  message: string | string[];
  requestId: string;
  timestamp: string;
  path: string;
};

const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

const MAX_PUBLIC_MESSAGE_LENGTH = 300;
const BAD_REQUEST_STATUS: number = HttpStatus.BAD_REQUEST;
const PAYLOAD_TOO_LARGE_STATUS: number = HttpStatus.PAYLOAD_TOO_LARGE;
const SERVICE_UNAVAILABLE_STATUS: number = HttpStatus.SERVICE_UNAVAILABLE;

export function sanitizePublicMessage(value: string): string {
  return Array.from(value)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_PUBLIC_MESSAGE_LENGTH);
}

function statusFromUnknown(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  if (typeof exception !== 'object' || exception === null) {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
  const status = (exception as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status <= 599
    ? status
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<Response>();
    const statusCode = statusFromUnknown(exception);
    if (statusCode >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag('request_id', request.requestId);
        scope.setTag(
          'analysis_id',
          typeof request.params?.id === 'string' ? request.params.id : 'none',
        );
        if (request.user?.id) scope.setUser({ id: request.user.id });
        Sentry.captureException(exception);
      });
    }
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const details =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as { code?: unknown; message?: unknown })
        : undefined;

    let message: string | string[] = 'An unexpected error occurred.';
    if (exception instanceof HttpException) {
      if (typeof exceptionResponse === 'string') {
        message = sanitizePublicMessage(exceptionResponse);
      } else if (
        typeof details?.message === 'string' ||
        (Array.isArray(details?.message) &&
          details.message.every((item) => typeof item === 'string'))
      ) {
        message = Array.isArray(details.message)
          ? details.message.slice(0, 20).map(sanitizePublicMessage)
          : sanitizePublicMessage(details.message);
      } else {
        message = sanitizePublicMessage(exception.message);
      }
    }

    if (statusCode === PAYLOAD_TOO_LARGE_STATUS) {
      message = 'The request body is too large.';
    } else if (
      statusCode === BAD_REQUEST_STATUS &&
      !(exception instanceof HttpException)
    ) {
      message = 'The request body is invalid.';
    } else if (statusCode >= 500) {
      message =
        statusCode === SERVICE_UNAVAILABLE_STATUS
          ? 'A required service is temporarily unavailable.'
          : 'An unexpected error occurred.';
    }

    const code =
      typeof details?.code === 'string' && /^[A-Z][A-Z0-9_]{0,49}$/u.test(details.code)
        ? details.code
        : (STATUS_CODES[statusCode] ?? `HTTP_${statusCode}`);
    const body: ErrorBody = {
      statusCode,
      code,
      message,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      path: request.path,
    };
    response.status(statusCode).json(body);
  }
}
