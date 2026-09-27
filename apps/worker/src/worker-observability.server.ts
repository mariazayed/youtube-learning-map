import { createServer, type Server } from 'node:http';
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogEvent, timingSafeTokenMatches } from '@learnmap/observability';
import { workerMetricsRegistry, workerUp } from './worker-metrics';

@Injectable()
export class WorkerObservabilityServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerObservabilityServer.name);
  private readonly port: number;
  private readonly token: string;
  private readonly production: boolean;
  private server: Server | undefined;

  constructor(config: ConfigService) {
    this.port = config.get<number>('WORKER_METRICS_PORT') ?? 9_464;
    this.token = config.get<string>('METRICS_TOKEN') ?? '';
    this.production = config.get<string>('NODE_ENV') === 'production';
  }

  onModuleInit(): void {
    workerUp.set(1);
    this.server = createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok', worker: 'up' }));
        return;
      }
      if (request.url !== '/metrics' || !this.authorized(request.headers.authorization)) {
        response.writeHead(404).end();
        return;
      }
      void workerMetricsRegistry
        .metrics()
        .then((body) => {
          response.writeHead(200, {
            'Content-Type': workerMetricsRegistry.contentType,
          });
          response.end(body);
        })
        .catch(() => {
          if (!response.headersSent) response.writeHead(500);
          response.end();
        });
    });
    this.server.listen(this.port, '0.0.0.0');
    this.logger.log(createLogEvent('worker_observability_started', { status: 'READY' }));
  }

  async onModuleDestroy(): Promise<void> {
    workerUp.set(0);
    await new Promise<void>((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private authorized(header: string | undefined): boolean {
    if (!this.token) return !this.production;
    const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
    return timingSafeTokenMatches(this.token, supplied);
  }
}
