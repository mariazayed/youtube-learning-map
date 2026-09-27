import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { createLogEvent } from '@learnmap/observability';
import { catchError, finalize, Observable, throwError } from 'rxjs';
import type { RequestWithContext } from '../http-request';
import { httpRequestDuration } from '../../observability/api-metrics';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpRequest');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();
    let errorStatus: number | undefined;

    return next.handle().pipe(
      catchError((error: unknown) => {
        errorStatus = error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const statusCode = errorStatus ?? response.statusCode;
        const durationSeconds = (performance.now() - startedAt) / 1_000;
        const routePath = (request.route as { path?: unknown } | undefined)?.path;
        const route =
          typeof routePath === 'string' ? `${request.baseUrl}${routePath}` : 'unmatched';
        httpRequestDuration.observe(
          { method: request.method, route, status_code: String(statusCode) },
          durationSeconds,
        );
        this.logger.log(
          createLogEvent('http_request_completed', {
            requestId: request.requestId,
            analysisId:
              typeof request.params.id === 'string' ? request.params.id : undefined,
            userId: request.user?.id,
            method: request.method,
            path: route,
            statusCode,
            status: statusCode < 400 ? 'SUCCEEDED' : 'FAILED',
            durationMs: Math.round(durationSeconds * 100_000) / 100,
            authenticated: request.user !== undefined,
            authMode: request.user?.mode,
          }),
        );
      }),
    );
  }
}
