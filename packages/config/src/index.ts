import { z } from 'zod';

const nodeEnvironmentSchema = z.enum(['development', 'test', 'production']);
const httpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'Must be an HTTP or HTTPS URL.',
  );
const postgresUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'Must be a PostgreSQL URL.',
  );
const redisUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
    'Must be a Redis or Valkey URL.',
  );
const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const nonnegativeNumber = (fallback: number) =>
  z.coerce.number().finite().nonnegative().default(fallback);
const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalHttpUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  httpUrlSchema.optional(),
);
const optionalHttpsUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), 'Must be an HTTPS URL.')
    .optional(),
);
const optionalAuditPepper = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(32, 'Must contain at least 32 characters.').optional(),
);
const optionalSecret = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(32, 'Must contain at least 32 characters.').optional(),
);
const optionalSentryDsn = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().startsWith('https://').optional(),
);
const optionalVersionLabel = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,80}$/u)
    .optional(),
);
const booleanFlag = (fallback: boolean) =>
  z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    return value;
  }, z.boolean().default(fallback));

const commonServerSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema.default('development'),
  DATABASE_URL: postgresUrlSchema,
  REDIS_URL: redisUrlSchema,
  SENTRY_DSN: optionalSentryDsn,
  SENTRY_ENVIRONMENT: optionalString,
  SENTRY_RELEASE: optionalVersionLabel,
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  METRICS_TOKEN: optionalSecret,
});

export const apiEnvironmentSchema = commonServerSchema
  .extend({
    PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
    API_URL: httpUrlSchema,
    WEB_URL: z
      .string()
      .min(1)
      .transform((value, context) => {
        const origins = value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);
        if (
          origins.length === 0 ||
          origins.some((origin) => !httpUrlSchema.safeParse(origin).success)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'WEB_URL must contain valid HTTP origins.',
          });
          return z.NEVER;
        }
        return origins.join(',');
      }),
    YOUTUBE_API_KEY: z.string().min(10, 'YOUTUBE_API_KEY is required.'),
    ALLOW_ANONYMOUS_AUTH: booleanFlag(true),
    JWT_ISSUER: optionalHttpUrl,
    JWT_AUDIENCE: optionalString,
    JWT_JWKS_URL: optionalHttpsUrl,
    RATE_LIMIT_TTL_MS: positiveInteger(60_000),
    RATE_LIMIT_MAX: positiveInteger(60),
    RATE_LIMIT_CREATE_TTL_MS: positiveInteger(60_000),
    RATE_LIMIT_CREATE_MAX: positiveInteger(5),
    RATE_LIMIT_STATUS_TTL_MS: positiveInteger(60_000),
    RATE_LIMIT_STATUS_MAX: positiveInteger(30),
    REQUEST_BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(1_048_576)
      .default(16_384),
    MAX_VIDEO_DURATION_SECONDS: positiveInteger(5_400),
    DAILY_ANALYSIS_LIMIT: positiveInteger(5),
    ANALYSIS_RETENTION_DAYS: positiveInteger(90),
    AUDIT_RETENTION_DAYS: positiveInteger(365),
    RETENTION_SWEEP_INTERVAL_MS: positiveInteger(86_400_000),
    AUDIT_HASH_PEPPER: optionalAuditPepper,
    GEMINI_KEY_VERSION: optionalVersionLabel,
    YOUTUBE_KEY_VERSION: optionalVersionLabel,
    ANALYSIS_PROMPT_VERSION: positiveInteger(3),
    ANALYSIS_SCHEMA_VERSION: positiveInteger(3),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.ALLOW_ANONYMOUS_AUTH) {
      context.addIssue({
        code: 'custom',
        path: ['ALLOW_ANONYMOUS_AUTH'],
        message: 'Anonymous authentication cannot be enabled in production.',
      });
    }
    if (!environment.ALLOW_ANONYMOUS_AUTH) {
      for (const key of ['JWT_ISSUER', 'JWT_AUDIENCE', 'JWT_JWKS_URL'] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when anonymous authentication is disabled.`,
          });
        }
      }
    }
    if (environment.NODE_ENV === 'production') {
      for (const key of [
        'AUDIT_HASH_PEPPER',
        'GEMINI_KEY_VERSION',
        'YOUTUBE_KEY_VERSION',
        'METRICS_TOKEN',
      ] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required in production.`,
          });
        }
      }
    }
  });

export const workerEnvironmentSchema = commonServerSchema
  .extend({
    GEMINI_API_KEY: z.string().min(10, 'GEMINI_API_KEY is required.'),
    GEMINI_VIDEO_MODEL: z.string().min(1).default('gemini-3.8-flash'),
    YOUTUBE_API_KEY: z.string().min(10, 'YOUTUBE_API_KEY is required.'),
    MAX_VIDEO_DURATION_SECONDS: positiveInteger(5_400),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
    GEMINI_AGENTIC_MIN_DURATION_SECONDS: positiveInteger(300),
    GEMINI_REQUEST_TIMEOUT_MS: positiveInteger(720_000),
    WORKER_METRICS_PORT: z.coerce.number().int().min(1).max(65_535).default(9_464),
    WORKER_HEARTBEAT_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(60_000)
      .default(15_000),
    WORKER_HEARTBEAT_TTL_SECONDS: z.coerce.number().int().min(15).max(300).default(45),
    AI_ESTIMATED_COST_PER_VIDEO_MINUTE_USD: nonnegativeNumber(0),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.METRICS_TOKEN) {
      context.addIssue({
        code: 'custom',
        path: ['METRICS_TOKEN'],
        message: 'METRICS_TOKEN is required in production.',
      });
    }
  });

export const webEnvironmentSchema = z
  .object({
    NODE_ENV: nodeEnvironmentSchema.default('development'),
    NEXT_PUBLIC_API_URL: httpUrlSchema,
    NEXT_PUBLIC_OIDC_ISSUER: optionalHttpUrl,
    NEXT_PUBLIC_OIDC_CLIENT_ID: optionalString,
    NEXT_PUBLIC_OIDC_AUDIENCE: optionalString,
    NEXT_PUBLIC_OIDC_REDIRECT_URI: optionalHttpUrl,
    NEXT_PUBLIC_SENTRY_DSN: optionalSentryDsn,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: optionalString,
    NEXT_PUBLIC_SENTRY_RELEASE: optionalVersionLabel,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  })
  .superRefine((environment, context) => {
    const keys = [
      'NEXT_PUBLIC_OIDC_ISSUER',
      'NEXT_PUBLIC_OIDC_CLIENT_ID',
      'NEXT_PUBLIC_OIDC_AUDIENCE',
      'NEXT_PUBLIC_OIDC_REDIRECT_URI',
    ] as const;
    const configured = keys.filter((key) => environment[key] !== undefined);
    if (configured.length !== 0 && configured.length !== keys.length) {
      context.addIssue({
        code: 'custom',
        message: 'All NEXT_PUBLIC_OIDC_* values must be configured together.',
      });
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;

function formatEnvironmentError(scope: string, error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('\n');
  return new Error(`Invalid ${scope} environment:\n${details}`);
}

export function validateApiEnvironment(input: Record<string, unknown>): ApiEnvironment {
  const result = apiEnvironmentSchema.safeParse(input);
  if (!result.success) throw formatEnvironmentError('API', result.error);
  return result.data;
}

export function validateWorkerEnvironment(
  input: Record<string, unknown>,
): WorkerEnvironment {
  const result = workerEnvironmentSchema.safeParse(input);
  if (!result.success) throw formatEnvironmentError('worker', result.error);
  return result.data;
}

export function validateWebEnvironment(input: Record<string, unknown>): WebEnvironment {
  const result = webEnvironmentSchema.safeParse(input);
  if (!result.success) throw formatEnvironmentError('web', result.error);
  return result.data;
}
