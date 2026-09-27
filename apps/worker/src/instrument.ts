import * as Sentry from '@sentry/nestjs';
import { scrubTelemetryEvent } from '@learnmap/observability';

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubTelemetryEvent(event);
    },
  });
}
