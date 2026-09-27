export type LogLevel = 'debug' | 'error' | 'info' | 'warn';

export type StructuredLogFields = {
  requestId?: string | undefined;
  analysisId?: string | undefined;
  userId?: string | undefined;
  videoId?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  status?: string | undefined;
  durationMs?: number | undefined;
  attemptNumber?: number | undefined;
  errorCode?: string | undefined;
  method?: string | undefined;
  path?: string | undefined;
  statusCode?: number | undefined;
  queue?: string | undefined;
  concurrency?: number | undefined;
  jobId?: string | undefined;
  terminal?: boolean | undefined;
  authenticated?: boolean | undefined;
  authMode?: string | undefined;
};

export type StructuredLogEvent = StructuredLogFields & {
  event: string;
  level?: LogLevel;
};

const STRING_LIMIT = 160;
const SAFE_FIELDS = new Set<keyof StructuredLogFields>([
  'requestId',
  'analysisId',
  'userId',
  'videoId',
  'provider',
  'model',
  'status',
  'durationMs',
  'attemptNumber',
  'errorCode',
  'method',
  'path',
  'statusCode',
  'queue',
  'concurrency',
  'jobId',
  'terminal',
  'authenticated',
  'authMode',
]);

function safeValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string') {
    return value
      .replace(/[\u0000-\u001f\u007f]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, STRING_LIMIT);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  return undefined;
}

/**
 * Builds an allowlisted flat log object. Unknown/nested fields are discarded so headers,
 * credentials, provider bodies, prompts, and connection URLs cannot enter structured logs.
 */
export function createLogEvent(
  event: string,
  input: StructuredLogFields & Record<string, unknown> = {},
  level?: LogLevel,
): StructuredLogEvent {
  const output: StructuredLogEvent = {
    event: String(safeValue(event) ?? 'unknown_event'),
  };
  if (level) output.level = level;
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_FIELDS.has(key as keyof StructuredLogFields)) continue;
    const sanitized = safeValue(value);
    if (sanitized !== undefined && sanitized !== '') {
      Object.assign(output, { [key]: sanitized });
    }
  }
  return output;
}

export function timingSafeTokenMatches(expected: string, supplied: string): boolean {
  if (expected.length === 0 || expected.length !== supplied.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0;
}

const CONNECTION_URL_PATTERN = /\b(?:postgres(?:ql)?|redis(?:s)?):\/\/[^\s"']+/giu;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const NAMED_SECRET_PATTERN =
  /\b(api[_-]?key|authorization|password|token)\s*[:=]\s*[^\s,;]+/giu;

/** Redacts common credential shapes before an error or breadcrumb leaves the process. */
export function redactSensitiveText(value: string): string {
  return value
    .replace(CONNECTION_URL_PATTERN, '[REDACTED_CONNECTION_URL]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(NAMED_SECRET_PATTERN, '$1=[REDACTED]');
}

type ScrubbableTelemetryEvent = {
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: unknown }>;
  request?: {
    cookies?: unknown;
    data?: unknown;
    headers?: unknown;
    query_string?: unknown;
    url?: string;
  };
};

/** Removes request payloads and redacts exception text without depending on a vendor SDK. */
export function scrubTelemetryEvent<T extends ScrubbableTelemetryEvent>(event: T): T {
  if (event.message) event.message = redactSensitiveText(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = redactSensitiveText(value.value);
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) {
      breadcrumb.message = redactSensitiveText(breadcrumb.message);
    }
    delete breadcrumb.data;
  }
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.replace(/\?.*$/u, '');
  }
  return event;
}

export const WORKER_HEARTBEAT_KEY = 'learnmap:observability:worker-heartbeat';
