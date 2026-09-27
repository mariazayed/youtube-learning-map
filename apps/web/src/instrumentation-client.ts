import * as Sentry from '@sentry/nextjs';
import { scrubTelemetryEvent } from '@learnmap/observability';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubTelemetryEvent(event);
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
